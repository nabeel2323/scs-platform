import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../../common/database/database.service';
import { RedisService } from '../../common/redis/redis.service';
import { users, organizations, organizationMembers, sessions, roles, rolePermissions, permissions } from './identity.schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'node:crypto';

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

    if (attempts && parseInt(attempts, 10) >= 5) {
      throw new Error('Too many OTP attempts. Please try again later.');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.client.set(`otp:${phone}`, otp, 'EX', 90);

    // In production: send via SMS provider. Dev: log the OTP.
    console.log(`[OTP] Code for ${phone}: ${otp}`);

    return { success: true };
  }

  /**
   * Verify OTP and issue JWT pair.
   */
  async verifyOtp(phone: string, otp: string): Promise<{ accessToken: string; refreshToken: string }> {
    const storedOtp = await this.redis.client.get(`otp:${phone}`);

    if (!storedOtp || storedOtp !== otp) {
      await this.redis.client.incr(`otp:att:${phone}`);
      await this.redis.client.expire(`otp:att:${phone}`, 900);
      throw new Error('Invalid OTP');
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

    // Sign JWT access token
    const accessToken = this.jwt.sign({
      sub: userId,
      activeOrg: claims.activeOrgId,
      role: claims.roleKey,
      perms: claims.permissions,
    });

    // Generate opaque refresh token
    const refreshToken = crypto.randomUUID();
    const tokenHash = this.hashToken(refreshToken);

    // Store session
    const sessionId = crypto.randomUUID();
    await this.db.db.insert(sessions).values({
      id: sessionId,
      userId,
      tokenHash,
      device: 'web',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    return { accessToken, refreshToken };
  }

  /**
   * Refresh access token using refresh token.
   * Rotation: issues new refresh token, revokes old one.
   * Reuse detection: if old token already revoked, revoke entire chain.
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string; newRefreshToken: string }> {
    const tokenHash = this.hashToken(refreshToken);

    const session = await this.db.db.query.sessions.findFirst({
      where: eq(sessions.tokenHash, tokenHash),
    });

    if (!session || session.revokedAt) {
      // Reuse detected — revoke entire chain
      if (session?.revokedAt) {
        await this.revokeChain(session.userId);
      }
      throw new Error('Invalid or expired refresh token');
    }

    if (new Date() > session.expiresAt) {
      throw new Error('Refresh token expired');
    }

    // Rotate: revoke old, create new
    await this.db.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, session.id));

    const claims = await this.buildClaims(session.userId);

    const newRefreshToken = crypto.randomUUID();
    const newTokenHash = this.hashToken(newRefreshToken);

    await this.db.db.insert(sessions).values({
      id: crypto.randomUUID(),
      userId: session.userId,
      tokenHash: newTokenHash,
      device: session.device,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const accessToken = this.jwt.sign({
      sub: session.userId,
      activeOrg: claims.activeOrgId,
      role: claims.roleKey,
      perms: claims.permissions,
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
  async switchOrg(userId: string, orgId: string): Promise<{ accessToken: string }> {
    const membership = await this.db.db.query.organizationMembers.findFirst({
      where: and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.orgId, orgId),
      ),
    });

    if (!membership) {
      throw new Error('Not a member of this organization');
    }

    const claims = await this.buildClaims(userId, orgId);

    const accessToken = this.jwt.sign({
      sub: userId,
      activeOrg: orgId,
      role: claims.roleKey,
      perms: claims.permissions,
    });

    return { accessToken };
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

    // Resolve permissions for the role
    const permissionList: string[] = [];
    if (activeMembership?.roleId) {
      const rolePerms = await this.db.db.query.rolePermissions.findMany({
        where: eq(rolePermissions.roleId, activeMembership.roleId),
      });

      for (const rp of rolePerms) {
        const perm = await this.db.db.query.permissions.findFirst({
          where: eq(permissions.id, rp.permissionId),
        });
        if (perm) permissionList.push(perm.key);
      }
    }

    return { activeOrgId, roleKey, permissions: permissionList };
  }
}
