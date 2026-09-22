import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../../common/database/database.service';
import { RedisService } from '../../common/redis/redis.service';
import {
  users,
  organizations,
  organizationMembers,
  organizationUpdateRequests,
  sessions,
  roles,
  rolePermissions,
  permissions,
  credentialAuditLog,
} from './identity.schema';
import { eq, and, desc, inArray } from 'drizzle-orm';
import crypto from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { validatePasswordStrength } from '../../common/utils/password-validation';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { RateLimitException } from '../../common/exceptions/rate-limit.exception';
import { denylistKey, secondsUntilExp } from '../../common/auth/token-denylist';
import { AuditService, AuditRequestContext } from '../audit/index';

/**
 * Roles assignable through the organization-membership endpoint
 * (POST /v1/organizations/:id/members). Platform roles
 * (SUPER_ADMIN/ADMIN/MODERATOR) are deliberately excluded — they are granted
 * ONLY via the guarded admin endpoint POST /v1/admin/users/:id/assign-role.
 * Enforcing this allow-list server-side closes the privilege-escalation vector
 * where a MERCHANT_OWNER assigns a platform role to an arbitrary user.
 */
const MERCHANT_ASSIGNABLE_ROLE_KEYS = ['MERCHANT_OWNER', 'MERCHANT_STAFF'];

/**
 * Identity service — phone-first identity with multi-org support.
 *
 * Handles:
 * - OTP request/verify (Redis-backed with per-phone throttle)
 * - JWT access token issuance (15 min) with sub, activeOrg, role, perms claims
 * - Refresh token rotation (30 d) with reuse detection
 * - Organization switching
 * - Session management (listable, remotely revocable)
 */
@Injectable()
export class IdentityService {
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly rateLimitService: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Request OTP for a phone number.
   * - Generates 6-digit code
   * - Stores in Redis with 90s TTL
   * - Tracks attempts (max 5 per 15 min)
   */
  async requestOtp(phone: string): Promise<{ success: boolean }> {
    const attemptsKey = `otp:att:${phone}`;
    const attempts = await this.redis.client.get(attemptsKey);
    const attemptCount = attempts ? parseInt(attempts, 10) : 0;

    if (attemptCount >= 5) {
      const ttl = await this.redis.client.ttl(attemptsKey);
      throw new RateLimitException('Too many OTP attempts. Please try again later.', {
        limit: 5,
        remaining: 0,
        retryAfterSeconds: ttl > 0 ? ttl : 900,
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.client.set(`otp:${phone}`, otp, 'EX', 90);

    // In production: send via SMS provider. Dev: log the OTP.
    console.log(`[OTP] Code for ${phone}: ${otp}`);

    return { success: true };
  }

  /**
   * Verify OTP and issue JWT pair.
   * Persists deviceId on the session so the device becomes trusted
   * for future email/password logins.
   */
  async verifyOtp(
    phone: string,
    otp: string,
    deviceId?: string,
    deviceInfo?: { platform: string; userAgent: string },
    context?: AuditRequestContext,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const storedOtp = await this.redis.client.get(`otp:${phone}`);

    if (!storedOtp || storedOtp !== otp) {
      await this.redis.client.incr(`otp:att:${phone}`);
      await this.redis.client.expire(`otp:att:${phone}`, 900);
      throw new UnauthorizedException('Invalid OTP');
    }

    await this.redis.client.del(`otp:${phone}`);
    await this.redis.client.del(`otp:att:${phone}`);

    const existing = await this.db.db.query.users.findFirst({
      where: eq(users.phone, phone),
    });

    let userId: string;
    if (existing) {
      userId = existing.id;
    } else {
      userId = crypto.randomUUID();
      await this.db.db.insert(users).values({
        id: userId,
        phone,
        fullName: 'New User',
        locale: 'en',
        status: 'ACTIVE',
      });
    }

    // Resolve user's org membership and permissions for JWT claims
    const claims = await this.buildClaims(userId);

    // Generate opaque refresh token
    const refreshToken = crypto.randomUUID();
    const tokenHash = this.hashToken(refreshToken);

    // Mint the session id first so the access token can carry it as the `sid`
    // claim (WEB-B3): the server can then tell which session a token belongs to.
    const sessionId = crypto.randomUUID();

    // Sign JWT access token
    const accessToken = this.jwt.sign({
      sub: userId,
      activeOrg: claims.activeOrgId,
      role: claims.roleKey,
      perms: claims.permissions,
      sid: sessionId,
      jti: crypto.randomUUID(),
    });

    // Store session (deviceId establishes device trust for password login)
    await this.db.db.insert(sessions).values({
      id: sessionId,
      userId,
      tokenHash,
      device: deviceInfo?.platform || 'web',
      deviceId: deviceId || null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // A login carries no JWT yet, so the HTTP middleware cannot attribute it.
    await this.audit.record({
      actorType: AuditService.actorTypeForRole(claims.roleKey),
      actorId: userId,
      orgId: claims.activeOrgId,
      action: 'auth.login',
      resource: 'auth',
      metadata: { method: 'otp', phone, deviceId: deviceId ?? null, sessionId },
      ip: context?.ip,
      userAgent: context?.userAgent ?? deviceInfo?.userAgent,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Refresh access token using refresh token.
   * Rotation: issues new refresh token, revokes old one.
   * Reuse detection: if old token already revoked, revoke entire chain.
   */
  async refreshToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; newRefreshToken: string }> {
    const tokenHash = this.hashToken(refreshToken);

    const session = await this.db.db.query.sessions.findFirst({
      where: eq(sessions.tokenHash, tokenHash),
    });

    if (!session || session.revokedAt) {
      // Reuse detected — revoke entire chain
      if (session?.revokedAt) {
        await this.revokeChain(session.userId);
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (new Date() > session.expiresAt) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Rotate: revoke old, create new
    await this.db.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, session.id));

    const claims = await this.buildClaims(session.userId);

    const newRefreshToken = crypto.randomUUID();
    const newTokenHash = this.hashToken(newRefreshToken);

    const newSessionId = crypto.randomUUID();
    await this.db.db.insert(sessions).values({
      id: newSessionId,
      userId: session.userId,
      tokenHash: newTokenHash,
      device: session.device,
      deviceId: session.deviceId, // Carry forward device trust (migration 0010)
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const accessToken = this.jwt.sign({
      sub: session.userId,
      activeOrg: claims.activeOrgId,
      role: claims.roleKey,
      perms: claims.permissions,
      sid: newSessionId,
      jti: crypto.randomUUID(),
    });

    return { accessToken, newRefreshToken };
  }

  /**
   * Logout — revoke current session.
   */
  async logout(refreshToken: string): Promise<{ success: boolean }> {
    const tokenHash = this.hashToken(refreshToken);

    await this.db.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, tokenHash));

    return { success: true };
  }

  /**
   * Switch active organization.
   */
  async switchOrg(
    userId: string,
    orgId: string,
    currentSessionId?: string,
    priorToken?: { jti?: string; exp?: number },
  ): Promise<{ accessToken: string }> {
    const membership = await this.db.db.query.organizationMembers.findFirst({
      where: and(eq(organizationMembers.userId, userId), eq(organizationMembers.orgId, orgId)),
    });

    if (!membership) {
      throw new ForbiddenException('Not a member of this organization');
    }

    const claims = await this.buildClaims(userId, orgId);

    // API-B9: revoke the access token used to make this switch so its stale
    // org/permission claims can't be replayed for the remainder of its 15-min
    // life. Denylist its jti for exactly the token's remaining lifetime.
    if (priorToken?.jti) {
      const ttl = secondsUntilExp(priorToken.exp);
      if (ttl > 0) {
        await this.redis.client.set(denylistKey(priorToken.jti), '1', 'EX', ttl);
      }
    }

    // switchOrg re-mints an access token for the SAME session, so carry the
    // existing `sid` claim forward (WEB-B3) to keep isCurrent detection stable.
    // A fresh `jti` (API-B9) makes the new token independently revocable.
    const accessToken = this.jwt.sign({
      sub: userId,
      activeOrg: orgId,
      role: claims.roleKey,
      perms: claims.permissions,
      sid: currentSessionId,
      jti: crypto.randomUUID(),
    });

    return { accessToken };
  }

  // ── Profile ────────────────────────────────────────────────

  /**
   * Get user profile with active org, memberships, and the caller's current role.
   *
   * `activeOrgId` is the caller's verified `activeOrg` claim. It selects which
   * membership's role is projected so GET /v1/me is the server-side source of
   * truth for role — clients hydrate from it instead of decoding the access
   * token JWT. Falls back to the first membership when omitted (e.g. internal
   * callers like updateProfile that have no request context).
   */
  async getProfile(userId: string, activeOrgId?: string | null) {
    const user = await this.db.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new NotFoundException('User not found');

    const memberships = await this.db.db.query.organizationMembers.findMany({
      where: eq(organizationMembers.userId, userId),
    });

    // Batch-fetch orgs in one query (avoids N+1: was 1 query per membership).
    const orgList = [];
    if (memberships.length > 0) {
      const orgs = await this.db.db.query.organizations.findMany({
        where: inArray(
          organizations.id,
          memberships.map((m) => m.orgId),
        ),
      });
      const orgById = new Map(orgs.map((o) => [o.id, o]));
      for (const m of memberships) {
        const org = orgById.get(m.orgId);
        if (org) orgList.push({ ...org, membershipStatus: m.status });
      }
    }

    // Resolve the current role from the active org (single lookup by the active
    // membership's roleId, mirroring buildClaims) so it matches the role the
    // PermissionsGuard enforces for this token, including after switchOrg.
    const resolvedActiveOrgId = activeOrgId ?? memberships[0]?.orgId ?? null;
    const activeMembership = memberships.find((m) => m.orgId === resolvedActiveOrgId);
    let role = 'BUYER';
    if (activeMembership?.roleId) {
      const activeRole = await this.db.db.query.roles.findFirst({
        where: eq(roles.id, activeMembership.roleId),
      });
      if (activeRole) role = activeRole.key;
    }

    // Resolve the user's permission keys for the active role so clients can
    // perform client-side gating without decoding the JWT (RBAC audit GAP-6).
    const perms: string[] = [];
    if (activeMembership?.roleId) {
      const rolePerms = await this.db.db.query.rolePermissions.findMany({
        where: eq(rolePermissions.roleId, activeMembership.roleId),
      });
      const permIds = rolePerms.map((rp) => rp.permissionId);
      if (permIds.length > 0) {
        const permRows = await this.db.db.query.permissions.findMany({
          where: inArray(permissions.id, permIds),
        });
        for (const p of permRows) perms.push(p.key);
      }
    }

    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      fullName: user.fullName,
      locale: user.locale,
      status: user.status,
      role,
      perms,
      activeOrgId: resolvedActiveOrgId,
      organizations: orgList,
      createdAt: user.createdAt,
    };
  }

  /**
   * Update user profile fields.
   */
  async updateProfile(
    userId: string,
    data: { fullName?: string; email?: string; locale?: string },
  ) {
    const updates: Record<string, any> = {};
    if (data['fullName']) updates['fullName'] = data['fullName'];
    if (data['email']) updates['email'] = data['email'] || null;
    if (data['locale']) updates['locale'] = data['locale'];
    updates['updatedAt'] = new Date();

    if (Object.keys(updates).length > 1) {
      await this.db.db.update(users).set(updates).where(eq(users.id, userId));
    }

    return this.getProfile(userId);
  }

  // ── Organizations ──────────────────────────────────────────

  /**
   * Create a new organization and add the creator as owner.
   * Generates a shareable invite code so others can join via joinOrgByInvite().
   */
  async createOrg(
    data: { name: string; type: string; country: string; legalName?: string; taxId?: string },
    creatorId: string,
  ) {
    const orgId = crypto.randomUUID();
    const inviteCode = await this.generateInviteCode();
    await this.db.db.insert(organizations).values({
      id: orgId,
      type: data.type,
      name: data.name,
      legalName: data.legalName ?? null,
      taxId: data.taxId ?? null,
      country: data.country,
      verificationStatus: 'PENDING',
      inviteCode,
    });

    // Add the creator as the organization owner (MERCHANT_OWNER role).
    const ownerRole = await this.db.db.query.roles.findFirst({
      where: eq(roles.key, 'MERCHANT_OWNER'),
    });

    if (ownerRole) {
      await this.db.db.insert(organizationMembers).values({
        id: crypto.randomUUID(),
        orgId,
        userId: creatorId,
        roleId: ownerRole.id,
        status: 'ACTIVE',
      });
    }

    return this.getOrg(orgId);
  }

  /**
   * Generate a unique, shareable invite code (10 uppercase hex chars).
   * Retries on the (rare) unique-collision.
   */
  private async generateInviteCode(): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = crypto.randomBytes(5).toString('hex').toUpperCase();
      const existing = await this.db.db.query.organizations.findFirst({
        where: eq(organizations.inviteCode, code),
        columns: { id: true },
      });
      if (!existing) return code;
    }
    // Extremely unlikely fallback
    return crypto.randomBytes(6).toString('hex').toUpperCase().slice(0, 12);
  }

  /**
   * Join an existing organization via its invite code.
   * Assigns the MERCHANT_STAFF role by default.
   */
  async joinOrgByInvite(userId: string, code: string) {
    const normalized = (code ?? '').trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Invite code is required');

    const org = await this.db.db.query.organizations.findFirst({
      where: eq(organizations.inviteCode, normalized),
    });
    if (!org) throw new BadRequestException('Invalid or expired invite code');

    // Prevent duplicate membership
    const existing = await this.db.db.query.organizationMembers.findFirst({
      where: and(eq(organizationMembers.orgId, org.id), eq(organizationMembers.userId, userId)),
    });
    if (existing) throw new ConflictException('You are already a member of this organization');

    const memberRole = await this.db.db.query.roles.findFirst({
      where: eq(roles.key, 'MERCHANT_STAFF'),
    });
    if (!memberRole) throw new NotFoundException('Default member role not found');

    await this.db.db.insert(organizationMembers).values({
      id: crypto.randomUUID(),
      orgId: org.id,
      userId,
      roleId: memberRole.id,
      status: 'ACTIVE',
    });

    return this.getOrg(org.id);
  }

  /**
   * Get organization by ID.
   */
  async getOrg(orgId: string) {
    const org = await this.db.db.query.organizations.findFirst({
      where: eq(organizations.id, orgId),
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  /**
   * Update organization fields.
   * Deactivated organizations cannot be edited (G7) — reactivate first.
   */
  async updateOrg(orgId: string, data: { name?: string; legalName?: string; taxId?: string }) {
    const org = await this.getOrg(orgId);
    if (org.isActive === false) {
      throw new ForbiddenException('Organization is deactivated and cannot be edited. Contact support for assistance.');
    }
    const updates: Record<string, string | Date> = {};
    if (data['name']) updates['name'] = data['name'];
    if (data['legalName'] !== undefined) updates['legalName'] = data['legalName'] ?? '';
    if (data['taxId'] !== undefined) updates['taxId'] = data['taxId'] ?? '';
    updates['updatedAt'] = new Date();

    await this.db.db.update(organizations).set(updates).where(eq(organizations.id, orgId));

    return this.getOrg(orgId);
  }

  /**
   * Deactivate (soft-delete) or reactivate an organization.
   * Admin-only operation — deactivated orgs lose platform access.
   */
  async deactivateOrg(orgId: string, isActive: boolean) {
    await this.getOrg(orgId); // ensure exists
    await this.db.db.update(organizations)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));
    return this.getOrg(orgId);
  }

  /**
   * Create a pending update request for organization details (G5).
   * Used when changes require admin approval (e.g. VERIFIED organizations).
   * Only one PENDING request per org at a time.
   */
  async requestOrgUpdate(
    orgId: string,
    userId: string,
    data: { name?: string; legalName?: string; taxId?: string },
  ) {
    const org = await this.getOrg(orgId);
    if (org.isActive === false) {
      throw new ForbiddenException('Organization is deactivated and cannot be edited. Contact support for assistance.');
    }
    const membership = await this.db.db.query.organizationMembers.findFirst({
      where: and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.userId, userId)),
    });
    if (!membership) throw new ForbiddenException('Not authorized for this organization');

    const payload: Record<string, string> = {};
    if (data.name !== undefined) payload['name'] = data.name;
    if (data.legalName !== undefined) payload['legalName'] = data.legalName ?? '';
    if (data.taxId !== undefined) payload['taxId'] = data.taxId ?? '';
    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('At least one field (name, legalName, taxId) must be provided');
    }

    const pending = await this.db.db.query.organizationUpdateRequests.findFirst({
      where: and(
        eq(organizationUpdateRequests.orgId, orgId),
        eq(organizationUpdateRequests.status, 'PENDING'),
      ),
    });
    if (pending) {
      throw new ConflictException('An update request is already pending review for this organization');
    }

    const [request] = await this.db.db.insert(organizationUpdateRequests)
      .values({ orgId, requestedBy: userId, payload })
      .returning();
    return request;
  }

  /**
   * List update requests for an organization (merchant-facing, newest first).
   */
  async listOrgUpdateRequests(orgId: string, userId: string) {
    await this.getOrg(orgId);
    const membership = await this.db.db.query.organizationMembers.findFirst({
      where: and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.userId, userId)),
    });
    if (!membership) throw new ForbiddenException('Not authorized for this organization');

    return this.db.db.query.organizationUpdateRequests.findMany({
      where: eq(organizationUpdateRequests.orgId, orgId),
      orderBy: [desc(organizationUpdateRequests.createdAt)],
    });
  }

  /**
   * List user's organizations with membership details.
   */
  async listUserOrgs(userId: string) {
    const memberships = await this.db.db.query.organizationMembers.findMany({
      where: eq(organizationMembers.userId, userId),
    });
    if (memberships.length === 0) return [];

    // Batch-fetch all orgs in one query (avoids N+1: was 1 query per membership).
    const orgs = await this.db.db.query.organizations.findMany({
      where: inArray(
        organizations.id,
        memberships.map((m) => m.orgId),
      ),
    });
    const orgById = new Map(orgs.map((o) => [o.id, o]));

    const result = [];
    for (const m of memberships) {
      const org = orgById.get(m.orgId);
      if (org) {
        result.push({
          ...org,
          membershipStatus: m.status,
          roleId: m.roleId,
          joinedAt: m.createdAt,
        });
      }
    }
    return result;
  }

  /**
   * Add a member to an organization.
   *
   * Security (privilege-escalation fix): the caller-supplied `roleId` is
   * validated against a merchant-scoped allow-list, the actor is required to be
   * an ACTIVE member of the target org (tenant scoping), and both the role and
   * the target user must exist. Platform actors (holding `admin:users:write`)
   * are exempt from the allow-list/tenant checks so platform tooling still works.
   */
  async addOrgMember(
    orgId: string,
    userId: string,
    roleId: string,
    actor?: { sub: string; perms?: string[] },
  ) {
    // 1. Reject unknown/invalid roleId.
    const role = await this.db.db.query.roles.findFirst({ where: eq(roles.id, roleId) });
    if (!role) throw new BadRequestException('Invalid role');

    // 2. Privilege-boundary enforcement — a non-platform actor may only assign
    //    merchant-scoped roles, never SUPER_ADMIN/ADMIN/MODERATOR.
    const isPlatformActor = !!actor?.perms?.includes('admin:users:write');
    if (!isPlatformActor && !MERCHANT_ASSIGNABLE_ROLE_KEYS.includes(role.key)) {
      throw new ForbiddenException('Role cannot be assigned through organization membership');
    }

    // 3. Tenant scoping — non-platform actors must be an ACTIVE member of the org.
    if (actor && !isPlatformActor) {
      const actorMembership = await this.db.db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.orgId, orgId),
          eq(organizationMembers.userId, actor.sub),
          eq(organizationMembers.status, 'ACTIVE'),
        ),
      });
      if (!actorMembership) {
        throw new ForbiddenException('You do not have access to this organization');
      }
    }

    // 4. Target user must exist.
    const target = await this.db.db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    // 5. Prevent duplicate membership.
    const existing = await this.db.db.query.organizationMembers.findFirst({
      where: and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.userId, userId)),
    });
    if (existing) {
      throw new ConflictException('User is already a member of this organization');
    }

    await this.db.db.insert(organizationMembers).values({
      id: crypto.randomUUID(),
      orgId,
      userId,
      roleId,
      status: 'ACTIVE',
    });

    return { orgId, userId, roleId, status: 'ACTIVE' };
  }

  /**
   * List members of an organization.
   */
  async listOrgMembers(orgId: string) {
    const memberships = await this.db.db.query.organizationMembers.findMany({
      where: eq(organizationMembers.orgId, orgId),
    });
    if (memberships.length === 0) return [];

    // Batch-fetch users and roles in parallel (avoids 2N queries → 2 queries).
    const [userRows, roleRows] = await Promise.all([
      this.db.db.query.users.findMany({
        where: inArray(
          users.id,
          memberships.map((m) => m.userId),
        ),
      }),
      this.db.db.query.roles.findMany({
        where: inArray(
          roles.id,
          memberships.map((m) => m.roleId),
        ),
      }),
    ]);
    const userById = new Map(userRows.map((u) => [u.id, u]));
    const roleById = new Map(roleRows.map((r) => [r.id, r]));

    const result = [];
    for (const m of memberships) {
      const user = userById.get(m.userId);
      const role = roleById.get(m.roleId);
      result.push({
        userId: m.userId,
        fullName: user?.fullName ?? 'Unknown',
        phone: user?.phone ?? '',
        roleKey: role?.key ?? 'UNKNOWN',
        status: m.status,
        joinedAt: m.createdAt,
      });
    }
    return result;
  }

  /**
   * Remove a member from an organization.
   */
  async removeOrgMember(orgId: string, userId: string) {
    await this.db.db
      .delete(organizationMembers)
      .where(and(eq(organizationMembers.orgId, orgId), eq(organizationMembers.userId, userId)));

    return { success: true };
  }

  /**
   * Look up a user by phone or email for adding to an organization.
   * Returns user ID, name, and phone for the add-member UI.
   */
  async lookupUser(query: string) {
    if (!query || query.trim().length < 3) {
      return [];
    }
    const q = query.trim();
    // Search by phone or email
    const userRows = await this.db.db.query.users.findMany({
      where: inArray(users.phone, [q]),
    });
    // Also try email if it looks like an email
    if (q.includes('@')) {
      const emailRows = await this.db.db.query.users.findMany({
        where: inArray(users.email, [q]),
      });
      // Combine and dedupe
      const seen = new Set<string>();
      const combined = [...userRows, ...emailRows].filter((u) => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      });
      return combined.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        phone: u.phone,
        email: u.email,
      }));
    }
    return userRows.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      phone: u.phone,
      email: u.email,
    }));
  }

  /**
   * List roles assignable to organization membership (merchant-scoped only).
   *
   * Security: this backs GET /v1/roles, consumed by the merchant web app's
   * add-member dropdown. Platform roles are filtered out so they are never
   * surfaced to merchant clients. The Admin Console lists all roles via the
   * separate GET /v1/admin/roles endpoint (admin.controller.ts).
   */
  async listRoles() {
    const roleRows = await this.db.db.query.roles.findMany({
      where: inArray(roles.key, MERCHANT_ASSIGNABLE_ROLE_KEYS),
    });
    return roleRows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
    }));
  }

  // ── Dual Authentication (Password Login) ──────────────────

  /**
   * Login with email and password.
   * Checks device trust and requires OTP if device changed.
   */
  async loginWithPassword(
    email: string,
    password: string,
    deviceId: string,
    deviceInfo?: { platform: string; userAgent: string },
    context?: AuditRequestContext,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    requiresOtp?: boolean;
    otpPhone?: string;
  }> {
    // Rate limit check
    const rateCheck = await this.rateLimitService.checkAndIncrement(
      'password_login',
      email,
      5,
      900,
    );
    if (!rateCheck.allowed) {
      const retryAfter = await this.rateLimitService.getResetSeconds('password_login', email);
      throw new RateLimitException('Too many login attempts. Please try again later.', {
        limit: 5,
        remaining: rateCheck.remaining,
        retryAfterSeconds: retryAfter || 900,
      });
    }

    // Find user by email
    const user = await this.db.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if password is set
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'Password not set. Please use OTP login or set up credentials.',
      );
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check device trust
    const isTrustedDevice = await this.checkDeviceTrust(user.id, deviceId);

    if (!isTrustedDevice) {
      // Device not trusted - require OTP verification
      // Send OTP to user's phone
      await this.requestOtp(user.phone);

      // Password was correct but the device is unknown — record the challenge.
      await this.audit.record({
        actorType: 'SYSTEM',
        actorId: user.id,
        action: 'auth.otp_challenge',
        resource: 'auth',
        metadata: { method: 'password', email, deviceId, reason: 'untrusted_device' },
        ip: context?.ip,
        userAgent: context?.userAgent ?? deviceInfo?.userAgent,
      });

      return {
        accessToken: '',
        refreshToken: '',
        requiresOtp: true,
        otpPhone: user.phone,
      };
    }

    // Device trusted - issue JWT pair
    const claims = await this.buildClaims(user.id);

    const refreshToken = crypto.randomUUID();
    const tokenHash = this.hashToken(refreshToken);

    // Mint the session id before signing so the access token carries `sid` (WEB-B3).
    const sessionId = crypto.randomUUID();

    const accessToken = this.jwt.sign({
      sub: user.id,
      activeOrg: claims.activeOrgId,
      role: claims.roleKey,
      perms: claims.permissions,
      sid: sessionId,
      jti: crypto.randomUUID(),
    });

    await this.db.db.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      tokenHash,
      device: deviceInfo?.userAgent || 'unknown',
      deviceId,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Reset rate limit on successful login
    await this.rateLimitService.resetAttempts('password_login', email);

    await this.audit.record({
      actorType: AuditService.actorTypeForRole(claims.roleKey),
      actorId: user.id,
      orgId: claims.activeOrgId,
      action: 'auth.login',
      resource: 'auth',
      metadata: { method: 'password', email, deviceId, sessionId, trustedDevice: true },
      ip: context?.ip,
      userAgent: context?.userAgent ?? deviceInfo?.userAgent,
    });

    return { accessToken, refreshToken };
  }

  /**
   * Check if device is trusted for a user.
   * Trusted if device_id has authenticated this user within 30 days.
   * NOTE: We check ALL sessions (including revoked) because logout revokes
   * sessions but shouldn't break device trust. The trust is based on
   * "has this device authenticated this user before", not "is there an active session".
   */
  async checkDeviceTrust(userId: string, deviceId: string): Promise<boolean> {
    const lastSession = await this.db.db.query.sessions.findFirst({
      where: and(eq(sessions.userId, userId), eq(sessions.deviceId, deviceId)),
      orderBy: [desc(sessions.createdAt)],
    });

    if (!lastSession) {
      return false;
    }

    // Check if device authenticated this user within 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return lastSession.createdAt > thirtyDaysAgo;
  }

  /**
   * Set up email and password credentials for a user.
   * User must be authenticated via OTP first.
   */
  async setupCredentials(
    userId: string,
    email: string,
    password: string,
    deviceId?: string,
  ): Promise<{ success: boolean; message: string }> {
    // Get user to check current state
    const user = await this.db.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if email already exists (and belongs to different user)
    const existingEmail = await this.db.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingEmail && existingEmail.id !== userId) {
      throw new ConflictException('Email already in use');
    }

    // Validate password strength
    const passwordCheck = validatePasswordStrength(password, email, user.phone);
    if (!passwordCheck.valid) {
      throw new BadRequestException(passwordCheck.errors.join('; '));
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update user
    await this.db.db
      .update(users)
      .set({
        email,
        passwordHash,
        passwordSetAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Log audit entry
    await this.logCredentialAudit(userId, 'CREDENTIAL_SETUP', deviceId);

    // NOTE: Do NOT revoke existing sessions here. The OTP session that established
    // device trust (with deviceId) must remain valid so password login works.
    // Revoking it would break device trust and force OTP on every login.

    return { success: true, message: 'Credentials set up successfully' };
  }

  /**
   * Change password for an authenticated user.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    deviceId?: string,
  ): Promise<{ success: boolean; message: string }> {
    // Get user
    const user = await this.db.db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.passwordHash) {
      throw new ConflictException('No password set. Please set up credentials first.');
    }

    // Verify current password
    const currentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Get user email for password validation
    const userEmail = user.email || undefined;

    // Validate new password strength
    const passwordCheck = validatePasswordStrength(newPassword, userEmail, user.phone);
    if (!passwordCheck.valid) {
      throw new BadRequestException(passwordCheck.errors.join('; '));
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // Update user
    await this.db.db
      .update(users)
      .set({
        passwordHash: newPasswordHash,
        passwordSetAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Log audit entry
    await this.logCredentialAudit(userId, 'PASSWORD_CHANGE', deviceId);

    // Invalidate all other sessions (keep current device if specified)
    if (deviceId) {
      await this.db.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, userId), eq(sessions.deviceId, deviceId)));
    } else {
      await this.revokeChain(userId);
    }

    return { success: true, message: 'Password changed successfully' };
  }

  /**
   * Log credential change to audit table.
   */
  private async logCredentialAudit(
    userId: string,
    action: string,
    deviceId?: string,
  ): Promise<void> {
    await this.db.db.insert(credentialAuditLog).values({
      userId,
      action,
      deviceId: deviceId || null,
    });
  }

  /**
   * Check if device can auto-login for a given email.
   * Pre-flight check before showing login form.
   */
  async checkDeviceLogin(
    email: string,
    deviceId: string,
  ): Promise<{ canAutoLogin: boolean; requiresOtp: boolean; hasPassword: boolean }> {
    const user = await this.db.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (!user) {
      return { canAutoLogin: false, requiresOtp: true, hasPassword: false };
    }

    const hasPassword = !!user.passwordHash;
    if (!hasPassword) {
      return { canAutoLogin: false, requiresOtp: true, hasPassword: false };
    }

    const isTrustedDevice = await this.checkDeviceTrust(user.id, deviceId);

    return {
      canAutoLogin: isTrustedDevice,
      requiresOtp: !isTrustedDevice,
      hasPassword: true,
    };
  }

  /**
   * Get user sessions with device info.
   */
  async getUserSessions(userId: string, currentSessionId?: string) {
    const userSessions = await this.db.db.query.sessions.findMany({
      where: eq(sessions.userId, userId),
      orderBy: [desc(sessions.createdAt)],
    });

    return userSessions.map((s) => ({
      id: s.id,
      device: s.device,
      deviceId: s.deviceId,
      ip: s.ip,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: s.id === currentSessionId,
      isRevoked: !!s.revokedAt,
    }));
  }

  /**
   * Revoke sessions by device ID.
   */
  async revokeSessionsByDevice(
    userId: string,
    deviceId: string,
  ): Promise<{ success: boolean; revokedCount: number }> {
    const result = await this.db.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), eq(sessions.deviceId, deviceId)));

    return { success: true, revokedCount: result['rowCount'] || 0 };
  }

  // ── Helpers ────────────────────────────────────────────────

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async revokeChain(userId: string): Promise<void> {
    await this.db.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.userId, userId));
  }

  private async buildClaims(userId: string, preferredOrgId?: string) {
    // Get user's org memberships
    const memberships = await this.db.db.query.organizationMembers.findMany({
      where: eq(organizationMembers.userId, userId),
    });

    const activeOrgId = preferredOrgId || memberships[0]?.orgId || null;
    const activeMembership = memberships.find((m) => m.orgId === activeOrgId);

    // Resolve role
    let roleKey = 'BUYER';
    if (activeMembership?.roleId) {
      const role = await this.db.db.query.roles.findFirst({
        where: eq(roles.id, activeMembership.roleId),
      });
      if (role) roleKey = role.key;
    }

    // Resolve permissions in a single batched query (avoids N+1: was 1 query per role_permission).
    const permissionList: string[] = [];
    if (activeMembership?.roleId) {
      const rolePerms = await this.db.db.query.rolePermissions.findMany({
        where: eq(rolePermissions.roleId, activeMembership.roleId),
      });

      const permIds = rolePerms.map((rp) => rp.permissionId);
      if (permIds.length > 0) {
        const perms = await this.db.db.query.permissions.findMany({
          where: inArray(permissions.id, permIds),
        });
        for (const perm of perms) permissionList.push(perm.key);
      }
    }

    return { activeOrgId, roleKey, permissions: permissionList };
  }
}
