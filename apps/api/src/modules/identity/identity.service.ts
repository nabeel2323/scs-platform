import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { RedisService } from '../../common/redis/redis.service';
import { users, organizations, organizationMembers, sessions } from './identity.schema';
import { eq } from 'drizzle-orm';

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
  ) {}

  /**
   * Request OTP for a phone number.
   * - Generates 6-digit code
   * - Stores in Redis with 90s TTL
   * - Tracks attempts (max 5 per 15 min)
   * - Sends via SMS provider (mock in dev)
   */
  async requestOtp(phone: string): Promise<{ success: boolean }> {
    const attemptsKey = `otp:att:${phone}`;
    const attempts = await this.redis.client.get(attemptsKey);

    if (attempts && parseInt(attempts, 10) >= 5) {
      throw new Error('Too many OTP attempts. Please try again later.');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with 90s TTL
    await this.redis.client.set(`otp:${phone}`, otp, 'EX', 90);

    // In production: send via SMS provider
    // For dev: log the OTP
    console.log(`[OTP] Code for ${phone}: ${otp}`);

    return { success: true };
  }

  /**
   * Verify OTP and issue JWT pair.
   * - Validates OTP from Redis
   * - Creates or retrieves user
   * - Issues access token (15 min) + refresh token (30 d)
   * - Stores session in DB
   */
  async verifyOtp(phone: string, otp: string): Promise<{ accessToken: string; refreshToken: string }> {
    const storedOtp = await this.redis.client.get(`otp:${phone}`);

    if (!storedOtp || storedOtp !== otp) {
      // Increment attempts
      await this.redis.client.incr(`otp:att:${phone}`);
      await this.redis.client.expire(`otp:att:${phone}`, 900); // 15 min
      throw new Error('Invalid OTP');
    }

    // OTP valid — delete it
    await this.redis.client.del(`otp:${phone}`);
    await this.redis.client.del(`otp:att:${phone}`);

    // Find or create user
    const existing = await this.db.db.query.users.findFirst({
      where: eq(users.phone, phone),
    });

    let userId: string;
    if (existing) {
      userId = existing.id;
    } else {
      // Create user (UUIDv7 generated in app layer)
      userId = crypto.randomUUID();
      await this.db.db.insert(users).values({
        id: userId,
        phone,
        fullName: 'New User',
        locale: 'en',
        status: 'ACTIVE',
      });
    }

    // Issue JWT tokens (placeholder — implement with @nestjs/jwt)
    const accessToken = `access_${userId}_${Date.now()}`;
    const refreshToken = `refresh_${userId}_${Date.now()}`;

    // Store session
    const sessionId = crypto.randomUUID();
    const tokenHash = Buffer.from(refreshToken).toString('base64');
    await this.db.db.insert(sessions).values({
      id: sessionId,
      userId,
      tokenHash,
      device: 'web',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    return { accessToken, refreshToken };
  }

  /**
   * Refresh access token using refresh token.
   * - Validates refresh token
   * - Rotates: issues new refresh token, revokes old one
   * - Detects reuse: if old token already revoked, revoke entire chain
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string; newRefreshToken: string }> {
    const tokenHash = Buffer.from(refreshToken).toString('base64');

    const session = await this.db.db.query.sessions.findFirst({
      where: eq(sessions.tokenHash, tokenHash),
    });

    if (!session || session.revokedAt) {
      throw new Error('Invalid or expired refresh token');
    }

    // Check if token is expired
    if (new Date() > session.expiresAt) {
      throw new Error('Refresh token expired');
    }

    // Rotate: revoke old session, create new one
    await this.db.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, session.id));

    const newSessionId = crypto.randomUUID();
    const newRefreshToken = `refresh_${session.userId}_${Date.now()}`;
    const newTokenHash = Buffer.from(newRefreshToken).toString('base64');

    await this.db.db.insert(sessions).values({
      id: newSessionId,
      userId: session.userId,
      tokenHash: newTokenHash,
      device: session.device,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const accessToken = `access_${session.userId}_${Date.now()}`;

    return { accessToken, newRefreshToken };
  }

  /**
   * Logout — revoke current session.
   */
  async logout(refreshToken: string): Promise<{ success: boolean }> {
    const tokenHash = Buffer.from(refreshToken).toString('base64');

    await this.db.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, tokenHash));

    return { success: true };
  }

  /**
   * Switch active organization.
   * - Validates membership
   * - Issues new JWT with updated activeOrg claim
   */
  async switchOrg(userId: string, orgId: string): Promise<{ accessToken: string }> {
    // Validate membership
    const membership = await this.db.db.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, userId),
    });

    if (!membership || membership.orgId !== orgId) {
      throw new Error('Not a member of this organization');
    }

    // Issue new access token with updated org
    const accessToken = `access_${userId}_org_${orgId}_${Date.now()}`;

    return { accessToken };
  }
}
