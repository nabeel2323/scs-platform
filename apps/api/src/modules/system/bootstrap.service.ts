/**
 * Bootstrap service — secure initial Super Admin provisioning (ADR-0004).
 *
 * Determines whether a valid Super Admin exists (derived from the real RBAC
 * model, never a cached flag) and provisions the initial Super Admin through a
 * single-use, out-of-band bootstrap authorization. All account creation and
 * role assignment happens inside one transaction guarded by a transaction-scoped
 * advisory lock so concurrent initialization attempts serialize safely.
 */

import { Injectable, ConflictException, ForbiddenException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import * as bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../audit/index';
import {
  users,
  organizations,
  organizationMembers,
  roles,
} from '../identity/identity.schema';
import { bootstrapAuthorizations } from './bootstrap.schema';
import { validatePasswordStrength } from '../../common/utils/password-validation';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { CreateSuperAdminDto } from './dto/bootstrap.dto';

/** Transaction-scoped advisory lock key serializing initialization attempts.
 * Distinct from the CLI issuance lock (0x53435343 = 'SCSC'). */
const BOOTSTRAP_ADVISORY_LOCK_KEY = 0x53435342; // 'SCSB'

/** Maximum bootstrap authorization lifetime (24 hours). */
export const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;

interface StatusResult {
  initialized: boolean;
  bootstrapAvailable: boolean;
  setupRequired: boolean;
}

@Injectable()
export class BootstrapService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /** Authoritative initialization status. No user data is disclosed. */
  async getStatus(): Promise<StatusResult> {
    const initialized = await this.isInitialized();
    const bootstrapAvailable = !initialized && (await this.hasAvailableAuthorization());
    return {
      initialized,
      bootstrapAvailable,
      setupRequired: !initialized,
    };
  }

  /**
   * Atomically provision the initial Super Admin.
   *
   * Serialization:
   *   1. pg_advisory_xact_lock (auto-released on commit/rollback)
   *   2. Fresh initialized check inside the transaction
   *   3. Atomic single-use token consumption
   *   4. User + SUPER_ADMIN membership insert
   *   5. Audit event
   *
   * Any failure rolls back everything (no partial user, no consumed token
   * without provisioning, no initialized state without a valid Super Admin).
   */
  async createSuperAdmin(dto: CreateSuperAdminDto, ip?: string): Promise<{ status: 'initialized'; loginUrl: string }> {
    return await this.db.db.transaction(async (tx) => {
      // 1. Serialize concurrent initializers (transaction-scoped advisory lock).
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_ADVISORY_LOCK_KEY})`);

      // 2. Fresh initialized check inside the protected transaction.
      if (await this.isInitialized(tx)) {
        throw new ConflictException('Platform is already initialized');
      }

      // 3. Atomic single-use token consumption.
      const tokenDigest = crypto.createHash('sha256').update(dto.authorizationToken).digest('hex');
      const consumed = await tx
        .update(bootstrapAuthorizations)
        .set({ consumed: true, consumedAt: new Date() })
        .where(
          and(
            eq(bootstrapAuthorizations.tokenDigest, tokenDigest),
            eq(bootstrapAuthorizations.consumed, false),
            sql`${bootstrapAuthorizations.expiresAt} > now()`,
          ),
        )
        .returning({ id: bootstrapAuthorizations.id });

      if (consumed.length === 0) {
        throw new ForbiddenException('Invalid, expired, or already-used bootstrap authorization');
      }

      // 4. Validate administrator input.
      const email = dto.email.trim().toLowerCase();
      const fullName = dto.fullName.trim();
      if (!fullName) throw new BadRequestException('Full name is required');

      const passwordCheck = validatePasswordStrength(dto.password, email, undefined);
      if (!passwordCheck.valid) {
        throw new BadRequestException(passwordCheck.errors.join('; '));
      }

      // 5. Duplicate-account protection (email unique).
      const existing = await tx.query.users.findFirst({
        where: eq(users.email, email),
        columns: { id: true },
      });
      if (existing) {
        throw new ConflictException('An account with this email already exists');
      }

      // 6. Hash password with the existing secure implementation.
      const passwordHash = await bcrypt.hash(dto.password, 12);

      // 7. Create the user with the correct initial account state.
      //    phone is NULL -- the bootstrap-created administrator has no phone
      //    and authenticates via email + password + email OTP (second factor).
      const userId = crypto.randomUUID();
      await tx.insert(users).values({
        id: userId,
        phone: null,
        email,
        fullName,
        status: 'ACTIVE',
        passwordHash,
        passwordSetAt: new Date(),
        emailVerifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 8. Assign the canonical existing Super Admin role (never client-supplied).
      const superAdminRole = await tx.query.roles.findFirst({
        where: eq(roles.key, 'SUPER_ADMIN'),
        columns: { id: true },
      });
      if (!superAdminRole) {
        throw new InternalServerErrorException('SUPER_ADMIN role not seeded');
      }

      // 9. Ensure the Platform organization exists, then grant membership.
      let org = await tx.query.organizations.findFirst({
        where: and(eq(organizations.type, 'PLATFORM'), eq(organizations.name, 'SCS Platform Ops')),
        columns: { id: true },
      });
      if (!org) {
        const orgId = crypto.randomUUID();
        await tx.insert(organizations).values({
          id: orgId,
          type: 'PLATFORM',
          name: 'SCS Platform Ops',
          legalName: 'SCS Platform Ops',
          country: 'SA',
          verificationStatus: 'VERIFIED',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        org = { id: orgId };
      }

      await tx.insert(organizationMembers).values({
        id: crypto.randomUUID(),
        orgId: org.id,
        userId,
        roleId: superAdminRole.id,
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      // 10. Audit event (non-throwing per AuditService contract).
      await this.audit.record({
        actorType: 'SYSTEM',
        actorId: userId,
        action: 'auth.bootstrap.super_admin',
        resource: 'auth',
        resourceId: userId,
        orgId: org.id,
        ip,
        metadata: { email },
      });

      return { status: 'initialized', loginUrl: '/auth/login' };
    });
  }

  /** Whether an ACTIVE user with an ACTIVE SUPER_ADMIN role membership exists. */
  private async isInitialized(txOrDb: any = this.db.db): Promise<boolean> {
    const result = await txOrDb
      .select({ id: users.id })
      .from(users)
      .innerJoin(organizationMembers, eq(organizationMembers.userId, users.id))
      .innerJoin(roles, eq(roles.id, organizationMembers.roleId))
      .where(
        and(
          eq(users.status, 'ACTIVE'),
          eq(organizationMembers.status, 'ACTIVE'),
          eq(roles.key, 'SUPER_ADMIN'),
        ),
      )
      .limit(1);
    return result.length > 0;
  }

  /** Whether at least one unconsumed, unexpired bootstrap authorization exists. */
  private async hasAvailableAuthorization(txOrDb: any = this.db.db): Promise<boolean> {
    const rows = await txOrDb
      .select({ id: bootstrapAuthorizations.id })
      .from(bootstrapAuthorizations)
      .where(
        and(
          eq(bootstrapAuthorizations.consumed, false),
          sql`${bootstrapAuthorizations.expiresAt} > now()`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
