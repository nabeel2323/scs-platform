/**
 * Bootstrap service — secure initial Super Admin provisioning (ADR-0004).
 *
 * Determines whether a valid Super Admin exists (derived from the real RBAC
 * model, never a cached flag) and provisions the initial Super Admin through a
 * single-use bootstrap authorization. All account creation and role assignment
 * happens inside one transaction guarded by a transaction-scoped advisory lock
 * so concurrent initialization attempts serialize safely.
 *
 * Owner-driven issuance (ADR-0004 / UI-driven bootstrap):
 *   - The platform owner address (SCS_BOOTSTRAP_OWNER_EMAIL) is the root of
 *     trust for initial ownership. A dedicated bootstrap OTP is sent ONLY to
 *     that address.
 *   - Successful owner OTP verification issues a short-lived, single-use
 *     bootstrap authorization (SHA-256 digest stored, plaintext returned to
 *     the caller in memory only).
 *   - Consuming that authorization creates the Super Admin and stamps
 *     emailVerifiedAt from the authorization's owner-verification proof.
 *   - The CLI (bootstrap-issue-token.ts) remains as break-glass/recovery and
 *     issues authorizations with no owner-verification proof
 *     (emailVerifiedAt stays null).
 *
 * Reuses the existing email OTP infrastructure: the same Redis Lua scripts
 * (ACQUIRE_RATE_LIMIT, CREATE_CHALLENGE, VERIFY_AND_CONSUME, CLEANUP_CHALLENGE),
 * HMAC-SHA256 challenge storage with per-challenge salt, OtpDeliveryService,
 * per-email / per-IP rate limits, and challenge TTL. A distinct Redis key
 * namespace (`bootstrap:otp:*`) keeps bootstrap challenges separate from login
 * OTPs, so ordinary login OTPs are never reusable as bootstrap authorizations.
 */

import {
  Injectable,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
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
import { RateLimitException } from '../../common/exceptions/rate-limit.exception';
import { RedisService } from '../../common/redis/redis.service';
import { OtpDeliveryService } from '../notifications/otp-delivery.service';
import { ProviderRegistryService } from '../notifications/provider-registry.service';
import { normalizeEmail, maskEmail } from '../../common/utils/email-normalization';
import { resolveOtpHmacSecret } from '../../config/env-gate';
import {
  ACQUIRE_RATE_LIMIT,
  CREATE_CHALLENGE,
  VERIFY_AND_CONSUME,
  CLEANUP_CHALLENGE,
} from '../../common/redis/otp-lua';
import {
  CreateSuperAdminDto,
} from './dto/bootstrap.dto';

/** Transaction-scoped advisory lock key serializing initialization attempts.
 * Distinct from the CLI issuance lock (0x53435343 = 'SCSC'). */
const BOOTSTRAP_ADVISORY_LOCK_KEY = 0x53435342; // 'SCSB'

/** Maximum bootstrap authorization lifetime (24 hours) — CLI break-glass tokens. */
export const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;

/** Short-lived bootstrap authorization TTL issued after owner verification (15 min). */
export const BOOTSTRAP_AUTHORIZATION_TTL_MS = 15 * 60 * 1000;

/** OTP challenge TTL for email (matches the email login OTP, D-6). */
const BOOTSTRAP_OTP_CHALLENGE_TTL = 300;

/** Max OTP requests per owner email within the rate-limit window. */
const BOOTSTRAP_OTP_REQUEST_LIMIT = 5;

/** Max OTP verification failures per owner email within the window. */
const BOOTSTRAP_OTP_VERIFY_FAIL_LIMIT = 10;

/** Max OTP requests per IP within the per-IP window. */
const BOOTSTRAP_OTP_IP_REQUEST_LIMIT = 20;

/** Per-IP rate-limit window in seconds (1 minute). */
const BOOTSTRAP_OTP_IP_RATE_WINDOW = 60;

/** Rate-limit window in seconds (15 minutes). */
const BOOTSTRAP_OTP_RATE_WINDOW = 900;

/** Redis key namespace for bootstrap OTP challenges (distinct from `otp:*`). */
const BOOTSTRAP_OTP_PREFIX = 'bootstrap:otp';

interface StatusResult {
  initialized: boolean;
  bootstrapAvailable: boolean;
  setupRequired: boolean;
  ownerVerificationRequired: boolean;
  ownerEmailConfigured: boolean;
  ownerEmailHint: string | null;
}

interface OwnerOtpRequestResult {
  success: boolean;
  deliveryStatus: string;
  possiblyDelivered?: boolean | null;
  emailHint: string;
}

@Injectable()
export class BootstrapService {
  private readonly ownerEmail: string | null;
  private readonly hmacSecret: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    private readonly redis: RedisService,
    private readonly delivery: OtpDeliveryService,
    private readonly registry: ProviderRegistryService,
    ownerEmailInput?: string,
  ) {
    // Owner address is normalized once. Invalid format is a config error;
    // absent outside dev/test is fail-closed at boot via assertBootstrapOwnerEmail.
    this.ownerEmail = ownerEmailInput
      ? this.normalizeOwnerEmail(ownerEmailInput)
      : this.ownerEmailFromEnv();

    this.hmacSecret = resolveOtpHmacSecret({
      nodeEnv: process.env['NODE_ENV'],
      secret: process.env['OTP_HMAC_SECRET'],
    });
  }

  private normalizeOwnerEmail(raw: string): string {
    try {
      return normalizeEmail(raw);
    } catch {
      throw new Error(
        'SCS_BOOTSTRAP_OWNER_EMAIL is not a valid email address. Configure a valid address for the platform owner.',
      );
    }
  }

  private ownerEmailFromEnv(): string | null {
    const raw = process.env['SCS_BOOTSTRAP_OWNER_EMAIL'];
    if (!raw || typeof raw !== 'string') return null;
    try {
      return normalizeEmail(raw);
    } catch {
      return null;
    }
  }

  /** Authoritative initialization status. No user data is disclosed. */
  async getStatus(): Promise<StatusResult> {
    const initialized = await this.isInitialized();
    const bootstrapAvailable = !initialized && (await this.hasAvailableAuthorization());
    const ownerEmailConfigured = !!this.ownerEmail;
    const ownerVerificationRequired =
      !initialized && ownerEmailConfigured && !bootstrapAvailable;
    return {
      initialized,
      bootstrapAvailable,
      setupRequired: !initialized,
      ownerVerificationRequired,
      ownerEmailConfigured,
      ownerEmailHint: this.ownerEmail ? maskEmail(this.ownerEmail) : null,
    };
  }

  /**
   * Request a dedicated bootstrap OTP addressed only to the configured owner.
   *
   * Rejects any email that does not exactly match SCS_BOOTSTRAP_OWNER_EMAIL
   * with a generic error (no owner-address enumeration). Rate-limited per
   * owner email and per client IP. Delivery uses the same OtpDeliveryService
   * as the login OTP flow (mock provider in dev/test, SMTP otherwise).
   */
  async requestOwnerOtp(
    rawEmail: string,
    ip?: string,
  ): Promise<OwnerOtpRequestResult> {
    const ownerEmail = this.ownerEmail;
    if (!ownerEmail) {
      throw new BadRequestException('Unable to process request.');
    }

    // The caller's address must match the configured owner exactly. A generic
    // error on mismatch prevents leaking whether an owner is configured or
    // what the owner address is.
    let email: string;
    try {
      email = normalizeEmail(rawEmail);
    } catch {
      throw new BadRequestException('Unable to process request.');
    }
    if (email !== ownerEmail) {
      throw new BadRequestException('Unable to process request.');
    }

    const masked = maskEmail(email);

    // ── Per-owner-email request rate limit (atomic Lua) ────────────────
    let rateResult: number[];
    try {
      rateResult = await this.redis.client.eval(
        ACQUIRE_RATE_LIMIT, 1,
        `${BOOTSTRAP_OTP_PREFIX}:req:email:${email}`,
        BOOTSTRAP_OTP_REQUEST_LIMIT,
        BOOTSTRAP_OTP_RATE_WINDOW,
      ) as number[];
    } catch (_redisError) {
      throw new InternalServerErrorException('Rate limit check failed. Please try again.');
    }

    const allowed: number = (rateResult[0] ?? 0) as number;
    const ttl: number = (rateResult[2] ?? BOOTSTRAP_OTP_RATE_WINDOW) as number;
    if (allowed === 0) {
      throw new RateLimitException('Too many OTP requests. Please try again later.', {
        limit: BOOTSTRAP_OTP_REQUEST_LIMIT,
        remaining: 0,
        retryAfterSeconds: ttl > 0 ? ttl : BOOTSTRAP_OTP_RATE_WINDOW,
      });
    }

    // ── Per-IP request rate limit (atomic Lua, fail-closed) ────────────
    if (ip) {
      try {
        const ipResult = await this.redis.client.eval(
          ACQUIRE_RATE_LIMIT, 1,
          `${BOOTSTRAP_OTP_PREFIX}:ip:${ip}`,
          BOOTSTRAP_OTP_IP_REQUEST_LIMIT,
          BOOTSTRAP_OTP_IP_RATE_WINDOW,
        ) as number[];
        const ipAllowed = (ipResult[0] ?? 0) as number;
        if (ipAllowed === 0) {
          const ipTtl = (ipResult[2] ?? BOOTSTRAP_OTP_IP_RATE_WINDOW) as number;
          throw new RateLimitException('Too many requests from this address.', {
            limit: BOOTSTRAP_OTP_IP_REQUEST_LIMIT,
            remaining: 0,
            retryAfterSeconds: ipTtl > 0 ? ipTtl : BOOTSTRAP_OTP_IP_RATE_WINDOW,
          });
        }
      } catch (e) {
        if (e instanceof RateLimitException) throw e;
        throw new InternalServerErrorException('Rate limit check failed. Please try again.');
      }
    }

    // ── Generate OTP + HMAC-SHA256 with per-challenge salt ─────────────
    const otp = crypto.randomInt(100000, 1000000).toString();
    const challengeId = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString('hex');
    const otpHash = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(otp + salt)
      .digest('hex');

    // ── Atomic challenge creation in the bootstrap namespace ───────────
    const redisKey = `${BOOTSTRAP_OTP_PREFIX}:email:${email}`;
    try {
      await this.redis.client.eval(
        CREATE_CHALLENGE, 1,
        redisKey, challengeId, otpHash, salt,
        BOOTSTRAP_OTP_CHALLENGE_TTL, Date.now().toString(),
      );
    } catch (_redisError) {
      throw new InternalServerErrorException('OTP generation failed. Please try again.');
    }

    // ── Deliver via the shared OtpDeliveryService ──────────────────────
    const mockProvider = this.registry.getMockProvider();
    let deliveryResult: { success: boolean; deliveryOutcome?: string; errorReason?: string };

    if (mockProvider) {
      deliveryResult = await this.delivery.deliverToTestChannel({
        otp,
        channel: 'mock',
        correlationId: challengeId,
        email,
        subject: masked,
        subjectType: 'email',
      });
    } else {
      deliveryResult = await this.delivery.deliverEmailOtp(email, otp, challengeId);
    }

    // ── Handle delivery outcome (never claim delivery unless accepted) ──
    if (!deliveryResult.success) {
      if (deliveryResult.deliveryOutcome === 'unknown') {
        return {
          success: false,
          deliveryStatus: 'DELIVERY_TIMEOUT',
          possiblyDelivered: true,
          emailHint: masked,
        };
      }

      // Definite rejection — clean up the challenge only if we still own it.
      try {
        await this.redis.client.eval(CLEANUP_CHALLENGE, 1, redisKey, challengeId);
      } catch (_redisError) {
        /* best-effort cleanup */
      }

      return {
        success: false,
        deliveryStatus: deliveryResult.errorReason || 'DELIVERY_FAILED',
        emailHint: masked,
      };
    }

    return {
      success: true,
      deliveryStatus: 'delivered',
      emailHint: masked,
    };
  }

  /**
   * Verify a bootstrap OTP and, on success, issue a short-lived single-use
   * bootstrap authorization.
   *
   * The challenge is single-use (VERIFY_AND_CONSUME deletes it), so concurrent
   * verification attempts serialize — at most one can win, preventing replay
   * and double-issuance. Wrong OTPs enforce the verify-failure rate limit.
   * Returns the plaintext authorization (frontend memory only).
   */
  async verifyOwnerOtp(
    rawEmail: string,
    otp: string,
    ip?: string,
  ): Promise<{ authorization: string; expiresInSeconds: number }> {
    const ownerEmail = this.ownerEmail;
    if (!ownerEmail) {
      throw new BadRequestException('Unable to process request.');
    }

    let email: string;
    try {
      email = normalizeEmail(rawEmail);
    } catch {
      throw new BadRequestException('Unable to process request.');
    }
    if (email !== ownerEmail) {
      throw new BadRequestException('Unable to process request.');
    }

    const redisKey = `${BOOTSTRAP_OTP_PREFIX}:email:${email}`;

    // ── Per-IP verify rate limit (fail-closed) ─────────────────────────
    if (ip) {
      try {
        const ipResult = await this.redis.client.eval(
          ACQUIRE_RATE_LIMIT, 1,
          `${BOOTSTRAP_OTP_PREFIX}:ip:${ip}`,
          BOOTSTRAP_OTP_IP_REQUEST_LIMIT,
          BOOTSTRAP_OTP_IP_RATE_WINDOW,
        ) as number[];
        const ipAllowed = (ipResult[0] ?? 0) as number;
        if (ipAllowed === 0) {
          const ipTtl = (ipResult[2] ?? BOOTSTRAP_OTP_IP_RATE_WINDOW) as number;
          throw new RateLimitException('Too many requests from this address.', {
            limit: BOOTSTRAP_OTP_IP_REQUEST_LIMIT,
            remaining: 0,
            retryAfterSeconds: ipTtl > 0 ? ipTtl : BOOTSTRAP_OTP_IP_RATE_WINDOW,
          });
        }
      } catch (e) {
        if (e instanceof RateLimitException) throw e;
        throw new InternalServerErrorException('Rate limit check failed. Please try again.');
      }
    }

    // ── Read challenge to obtain salt ──────────────────────────────────
    let rawChallenge: string | null;
    try {
      rawChallenge = await this.redis.client.get(redisKey);
    } catch (_redisError) {
      throw new InternalServerErrorException('Verification failed. Please try again.');
    }

    if (!rawChallenge) {
      throw new UnauthorizedException('OTP expired or not found');
    }

    let challenge: { ch: string; hs: string; s: string; ca: string; co: boolean };
    try {
      challenge = JSON.parse(rawChallenge);
    } catch {
      await this.redis.client.del(redisKey).catch(() => {});
      throw new UnauthorizedException('OTP verification error');
    }

    // ── Compute HMAC of the supplied OTP with the stored salt ──────────
    const providedHash = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(otp + challenge.s)
      .digest('hex');

    // ── Atomic verify-and-consume ──────────────────────────────────────
    let verifyStatus: number;
    try {
      const result = await this.redis.client.eval(
        VERIFY_AND_CONSUME, 1,
        redisKey, providedHash,
      ) as number[];
      verifyStatus = (result[0] ?? -1) as number;
    } catch (_redisError) {
      throw new InternalServerErrorException('Verification failed. Please try again.');
    }

    if (verifyStatus === -1) {
      throw new UnauthorizedException('OTP expired or not found');
    }
    if (verifyStatus === -2) {
      throw new UnauthorizedException('OTP already used.');
    }
    if (verifyStatus === 0) {
      // Wrong OTP — enforce the verify-failure rate limit, then refuse.
      try {
        await this.redis.client.eval(
          ACQUIRE_RATE_LIMIT, 1,
          `${BOOTSTRAP_OTP_PREFIX}:vatt:email:${email}`,
          BOOTSTRAP_OTP_VERIFY_FAIL_LIMIT,
          BOOTSTRAP_OTP_RATE_WINDOW,
        );
      } catch (_redisError) {
        /* rate-limit bookkeeping failure must not mask the invalid OTP */
      }
      throw new UnauthorizedException('Invalid OTP.');
    }

    // ── Issue a short-lived, single-use bootstrap authorization ────────
    const authorizationToken = crypto.randomBytes(32).toString('hex');
    const tokenDigest = crypto
      .createHash('sha256')
      .update(authorizationToken)
      .digest('hex');
    const expiresAt = new Date(Date.now() + BOOTSTRAP_AUTHORIZATION_TTL_MS);
    const emailVerifiedAt = new Date();

    await this.db.db.insert(bootstrapAuthorizations).values({
      id: crypto.randomUUID(),
      tokenDigest,
      expiresAt,
      consumedAt: null,
      consumed: false,
      purpose: 'super_admin_bootstrap',
      createdBy: 'SYSTEM',
      emailVerifiedAt,
      createdAt: new Date(),
    });

    return {
      authorization: authorizationToken,
      expiresInSeconds: Math.floor(BOOTSTRAP_AUTHORIZATION_TTL_MS / 1000),
    };
  }

  /**
   * Atomically provision the initial Super Admin.
   *
   * Serialization:
   *   1. pg_advisory_xact_lock (auto-released on commit/rollback)
   *   2. Fresh initialized check inside the transaction
   *   3. Atomic single-use token consumption (SHA-256 digest)
   *   4. Read the consumed authorization's owner-verification proof
   *   5. User + SUPER_ADMIN membership insert (emailVerifiedAt from proof)
   *   6. Audit event
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
        .returning({
          id: bootstrapAuthorizations.id,
          emailVerifiedAt: bootstrapAuthorizations.emailVerifiedAt,
        });

      if (consumed.length === 0) {
        throw new ForbiddenException('Invalid, expired, or already-used bootstrap authorization');
      }

      // Owner-verification proof carried by the consumed authorization.
      // CLI break-glass tokens carry no proof (emailVerifiedAt is null).
      const emailVerifiedAt = consumed[0]?.emailVerifiedAt ?? null;

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
      const userId = crypto.randomUUID();
      await tx.insert(users).values({
        id: userId,
        phone: null,
        email,
        fullName,
        status: 'ACTIVE',
        passwordHash,
        passwordSetAt: new Date(),
        emailVerifiedAt,
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
        metadata: { email, emailVerifiedAt: !!emailVerifiedAt },
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
