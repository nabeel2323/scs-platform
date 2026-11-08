import {
  Injectable,
  Logger,
  InternalServerErrorException,
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
  accountLinkLog,
  deviceCredentials,
} from './identity.schema';
import { eq, and, desc, inArray, isNull, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { validatePasswordStrength } from '../../common/utils/password-validation';
import { normalizePhone, maskPhone } from '../../common/utils/phone-validation';
import { normalizeEmail, maskEmail, hashEmail, hashIdentifier } from '../../common/utils/email-normalization';
import { resolveOtpHmacSecret } from '../../config/env-gate';
import { RateLimitService } from '../../common/services/rate-limit.service';
import { RateLimitException } from '../../common/exceptions/rate-limit.exception';
import { denylistKey, secondsUntilExp } from '../../common/auth/token-denylist';
import { AuditService, AuditRequestContext } from '../audit/index';
import { OtpDeliveryService } from '../notifications/otp-delivery.service';
import { OtpDeliveryChannel } from '../notifications/providers/provider.interface';
import { ProviderRegistryService } from '../notifications/provider-registry.service';
import { featureFlags } from '../audit/audit.schema';
import {
  ACQUIRE_RATE_LIMIT,
  CREATE_CHALLENGE,
  CLEANUP_CHALLENGE,
  VERIFY_AND_CONSUME,
} from '../../common/redis/otp-lua';
import type { DeviceTrustTransportInstruction } from '../../common/auth/device-trust-cookie';

/** Feature flag key for email OTP (S1.35 Phase 1). */
const FLAG_AUTH_EMAIL_OTP = 'auth.email_otp.enabled';

/**
 * Device-trust lifetimes (audit finding S-1 remediation; migration 0066).
 *
 * Two independent clocks, because they answer different questions:
 *   - the SLIDING horizon answers "has this device been seen recently?" and is
 *     pushed forward on every validated use, so an actively used browser is not
 *     re-prompted every 30 days;
 *   - the HARD ceiling answers "how long ago did this device prove itself with
 *     a second factor?" and never moves, so continuous use cannot make an
 *     OTP-free state permanent.
 * The database CHECK on device_credentials enforces sliding <= hard, and the
 * slide computation clamps to the ceiling, so neither can outlive the other.
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEVICE_TRUST_SLIDING_DAYS = 30;
const DEVICE_TRUST_HARD_DAYS = 90;
const DEVICE_TRUST_SLIDING_MS = DEVICE_TRUST_SLIDING_DAYS * MS_PER_DAY;
const DEVICE_TRUST_HARD_MS = DEVICE_TRUST_HARD_DAYS * MS_PER_DAY;

/** Entropy of a minted credential: 32 bytes = 256 bits, base64url-encoded. */
const DEVICE_CREDENTIAL_BYTES = 32;

/**
 * Device-check probe ceiling (S-2). The response is constant, so this limit is
 * not an enumeration control any more — it bounds the cost one address can be
 * made to impose (rate-limit round trip + audit write per call) when probes are
 * distributed across source IPs, and it makes sustained probing observable in
 * the logs.
 */
const DEVICE_CHECK_LIMIT = 20;
const DEVICE_CHECK_WINDOW_SECONDS = 900;

/**
 * Outcome of validating a presented credential. Every value is a distinct
 * reason the device is NOT trusted, except 'trusted'; callers only ever branch
 * on `status === 'trusted'`, and the reason is used for logging and for the
 * device list, never returned to an unauthenticated client.
 */
export type DeviceTrustStatus =
  /** Nothing presented (no cookie, or no same-origin proof header). */
  | 'absent'
  /** The digest matches no credential row. */
  | 'unknown'
  /** Live, unexpired and owned by the expected account. */
  | 'trusted'
  /** Explicitly revoked — logout, session revocation, reuse detection, admin. */
  | 'revoked'
  /** Past the sliding horizon or the hard ceiling; recorded as revoked. */
  | 'expired'
  /** Resolves to a DIFFERENT account. Cross-user reuse: never trusted. */
  | 'user_mismatch';

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
/** OTP challenge TTL in seconds (phone channels). */
const OTP_CHALLENGE_TTL = 90;

/** OTP challenge TTL in seconds (email channel — D-6). */
const EMAIL_OTP_CHALLENGE_TTL = 300;

/** Max OTP requests per phone/email within the rate-limit window. */
const OTP_REQUEST_LIMIT = 5;

/** Max OTP verification failures per phone/email within the rate-limit window. */
const OTP_VERIFY_FAIL_LIMIT = 10;

/** Max OTP requests per IP within the per-IP rate-limit window. */
const OTP_IP_REQUEST_LIMIT = 20;

/** Per-IP rate-limit window in seconds (1 minute). */
const OTP_IP_RATE_WINDOW = 60;

/** Rate-limit window in seconds (15 minutes). */
const RATE_LIMIT_WINDOW = 900;

/**
 * Cached bcrypt target used to equalize the password-login response time of an
 * unknown identifier with that of a known one (S1.37 audit). Cost 12 is the
 * cost every real password hash in this service is minted with, so the
 * "no such user" branch spends the same single bcrypt round as the real
 * compare and the difference is not an account-enumeration oracle.
 */
let unknownUserPasswordHash: Promise<string> | null = null;
function getUnknownUserPasswordHash(): Promise<string> {
  if (!unknownUserPasswordHash) {
    unknownUserPasswordHash = bcrypt.hash(crypto.randomUUID(), 12);
  }
  return unknownUserPasswordHash;
}

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);
  private readonly hmacSecret: string;

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly rateLimitService: RateLimitService,
    private readonly audit: AuditService,
    private readonly otpDeliveryService: OtpDeliveryService,
    private readonly providerRegistry: ProviderRegistryService,
  ) {
    // OTP storage secret is resolved through the shared config gate (S1.3 M-02):
    // outside development/test a missing, too-short, or committed-example value
    // fails startup; in development/test it falls back to a documented dev value.
    this.hmacSecret = resolveOtpHmacSecret({
      nodeEnv: process.env['NODE_ENV'],
      secret: process.env['OTP_HMAC_SECRET'],
    });
  }

  /**
   * Request OTP for a phone number.
   *
   * Lifecycle:
   * 1. Normalize phone to E.164.
   * 2. Atomically enforce per-phone request rate limit (Lua script).
   * 3. Generate 6-digit OTP with cryptographic randomness.
   * 4. Compute HMAC-SHA256 of OTP with per-challenge salt.
   * 5. Atomically create challenge in Redis (Lua script — supersedes any existing).
   * 6. Deliver via selected provider (SMS or WhatsApp).
   * 7. On definite delivery failure: atomically clean up challenge (owner-guarded).
   *    On ambiguous timeout: preserve challenge — user may have received the OTP.
   */
  async requestOtp(
    phone: string,
    channel: OtpDeliveryChannel = 'sms',
  ): Promise<{
    success: boolean;
    deliveryStatus: string;
    possiblyDelivered?: boolean;
  }> {
    // 1. Normalize phone to E.164
    const normalizedPhone = normalizePhone(phone);
    const masked = maskPhone(normalizedPhone);

    // 2. Atomic rate-limit check-and-increment
    let rateResult: number[];
    try {
      rateResult = await this.redis.client.eval(
        ACQUIRE_RATE_LIMIT, 1,
        `otp:req:${normalizedPhone}`,
        OTP_REQUEST_LIMIT,
        RATE_LIMIT_WINDOW,
      ) as number[];
    } catch (_redisError) {
      this.logger.error(`Redis error during rate-limit check for ${masked}`);
      throw new InternalServerErrorException('Rate limit check failed. Please try again.');
    }

    const allowed: number = (rateResult[0] ?? 0) as number;
    const ttl: number = (rateResult[2] ?? RATE_LIMIT_WINDOW) as number;
    if (allowed === 0) {
      throw new RateLimitException('Too many OTP requests. Please try again later.', {
        limit: OTP_REQUEST_LIMIT,
        remaining: 0,
        retryAfterSeconds: ttl > 0 ? ttl : RATE_LIMIT_WINDOW,
      });
    }

    // 3. Generate OTP and HMAC
    const otp = crypto.randomInt(100000, 1000000).toString();
    const challengeId = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString('hex');
    const otpHash = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(otp + salt)
      .digest('hex');

    // 4. Atomic challenge creation (supersedes any existing)
    try {
      await this.redis.client.eval(
        CREATE_CHALLENGE, 1,
        `otp:${normalizedPhone}`,
        challengeId,
        otpHash,
        salt,
        OTP_CHALLENGE_TTL,
        Date.now().toString(),
      );
    } catch (_redisError) {
      this.logger.error(`Redis error during challenge creation for ${masked}`);
      throw new InternalServerErrorException('OTP generation failed. Please try again.');
    }

    // 5. Deliver via provider
    const deliveryResult = await this.otpDeliveryService.deliverOtp(
      normalizedPhone, otp, channel, challengeId,
    );

    // 6. Handle delivery outcome
    if (!deliveryResult.success) {
      if (deliveryResult.deliveryOutcome === 'unknown') {
        // Timeout or network error — OTP may have been delivered.
        // Keep the challenge active so the user can verify if they received it.
        this.logger.warn(
          `OTP delivery outcome uncertain via ${channel} for ${masked} — challenge preserved`,
        );
        return {
          success: false,
          deliveryStatus: 'DELIVERY_TIMEOUT',
          possiblyDelivered: true,
        };
      }

      // Definite rejection — clean up challenge only if we still own it
      try {
        await this.redis.client.eval(
          CLEANUP_CHALLENGE, 1,
          `otp:${normalizedPhone}`,
          challengeId,
        );
      } catch (_redisError) {
        this.logger.error(`Redis error during challenge cleanup for ${masked}`);
      }

      return {
        success: false,
        deliveryStatus: deliveryResult.errorReason || 'DELIVERY_FAILED',
      };
    }

    this.logger.log(`OTP delivered via ${channel} to ${masked} (challenge: ${challengeId})`);

    return {
      success: true,
      deliveryStatus: 'delivered',
    };
  }

  /**
   * Verify OTP and issue JWT pair.
   *
   * Lifecycle:
   * 1. Normalize phone to E.164.
   * 2. Read challenge to obtain salt for HMAC computation.
   * 3. Compute HMAC-SHA256 of user-supplied OTP with stored salt.
   * 4. Atomically verify-and-consume via Lua script.
   * 5. On invalid OTP: atomically enforce verify-failure rate limit.
   * 6. On success: clean up all rate-limit keys, issue JWT pair.
   *
   * Steps 1-5 are executed by `consumePhoneChallenge`, the same gate account
   * linking uses, so the verification rules cannot diverge between the two.
   *
   * A verified OTP IS the second factor, so this path enrols the browser: it
   * mints a server-issued device credential (migration 0066) that the
   * controller installs as an HttpOnly cookie. `deviceId` is stored on the
   * session as provenance only — under the S-1 model it establishes no trust by
   * itself.
   */
  async verifyOtp(
    phone: string,
    otp: string,
    deviceId?: string,
    deviceInfo?: { platform: string; userAgent: string },
    context?: AuditRequestContext,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    deviceTrust?: DeviceTrustTransportInstruction;
  }> {
    // Steps 1-5 (challenge read, HMAC compare, atomic consume, failure-limit
    // enforcement, rate-limit key cleanup) are delegated to consumePhoneChallenge
    // so that this login path and the account-linking path can never drift apart
    // (S1.37-F-05).
    const { phone: normalizedPhone } = await this.consumePhoneChallenge(phone, otp);

    const existing = await this.db.db.query.users.findFirst({
      where: eq(users.phone, normalizedPhone),
    });

    let userId: string;
    if (existing) {
      userId = existing.id;
    } else {
      userId = crypto.randomUUID();
      await this.db.db.insert(users).values({
        id: userId,
        phone: normalizedPhone,
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

    // Store session. deviceId is provenance for revoke-by-device; it does not
    // establish trust (S-1) — the credential minted below does.
    await this.db.db.insert(sessions).values({
      id: sessionId,
      userId,
      tokenHash,
      device: deviceInfo?.platform || 'web',
      deviceId: deviceId || null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    await this.audit.record({
      actorType: AuditService.actorTypeForRole(claims.roleKey),
      actorId: userId,
      orgId: claims.activeOrgId,
      action: 'auth.login',
      resource: 'auth',
      metadata: { method: 'otp', phone: normalizedPhone, deviceId: deviceId ?? null, sessionId },
      ip: context?.ip,
      userAgent: context?.userAgent ?? deviceInfo?.userAgent,
    });

    // Second factor satisfied -> enrol this device for future password logins.
    const issued = await this.issueDeviceCredential(userId, {
      sessionId,
      label: deviceInfo?.platform ?? 'web',
    });

    return {
      accessToken,
      refreshToken,
      deviceTrust: { credential: issued.credential, maxAgeSeconds: issued.maxAgeSeconds },
    };
  }

  // ── Email OTP (S1.35 Phase 1) ───────────────────────────────

  /**
   * Request OTP for an email address.
   *
   * Enumeration prevention: returns the same response shape whether the email
   * exists in the database or not. A challenge is always created so that
   * timing differences do not leak account existence.
   *
   * Lifecycle:
   * 1. Normalize email.
   * 2. Enforce per-email rate limit (5 per 15 min).
   * 3. Enforce per-IP rate limit (20 per 1 min).
   * 4. Generate 6-digit OTP with cryptographic randomness.
   * 5. Compute HMAC-SHA256 of OTP with per-challenge salt.
   * 6. Atomically create challenge in Redis (300s TTL — D-6).
   * 7. Deliver via email provider (or store in mock for tests).
   * 8. On definite delivery failure: clean up challenge.
   */
  async requestEmailOtp(
    rawEmail: string,
    ip?: string,
  ): Promise<{
    success: boolean;
    deliveryStatus: string;
    possiblyDelivered?: boolean;
  }> {
    // 1. Normalize email
    const email = normalizeEmail(rawEmail);
    const masked = maskEmail(email);

    // 2. Per-email rate limit (atomic Lua)
    let rateResult: number[];
    try {
      rateResult = await this.redis.client.eval(
        ACQUIRE_RATE_LIMIT, 1,
        `otp:req:email:${email}`,
        OTP_REQUEST_LIMIT,
        RATE_LIMIT_WINDOW,
      ) as number[];
    } catch (_redisError) {
      this.logger.error(`Redis error during email rate-limit check for ${masked}`);
      throw new InternalServerErrorException('Rate limit check failed. Please try again.');
    }

    const allowed: number = (rateResult[0] ?? 0) as number;
    const ttl: number = (rateResult[2] ?? RATE_LIMIT_WINDOW) as number;
    if (allowed === 0) {
      throw new RateLimitException('Too many OTP requests. Please try again later.', {
        limit: OTP_REQUEST_LIMIT,
        remaining: 0,
        retryAfterSeconds: ttl > 0 ? ttl : RATE_LIMIT_WINDOW,
      });
    }

    // 3. Per-IP rate limit (atomic Lua)
    //    Fail-closed, exactly like the per-email limit above: a Redis fault on
    //    this dimension must not silently drop the only cross-account throttle
    //    (S1.37 audit — the previous handler logged and continued).
    if (ip) {
      try {
        const ipResult = await this.redis.client.eval(
          ACQUIRE_RATE_LIMIT, 1,
          `otp:ip:${ip}`,
          OTP_IP_REQUEST_LIMIT,
          OTP_IP_RATE_WINDOW,
        ) as number[];
        const ipAllowed = (ipResult[0] ?? 0) as number;
        if (ipAllowed === 0) {
          const ipTtl = (ipResult[2] ?? OTP_IP_RATE_WINDOW) as number;
          throw new RateLimitException('Too many requests from this address.', {
            limit: OTP_IP_REQUEST_LIMIT,
            remaining: 0,
            retryAfterSeconds: ipTtl > 0 ? ipTtl : OTP_IP_RATE_WINDOW,
          });
        }
      } catch (e) {
        if (e instanceof RateLimitException) throw e;
        this.logger.error(`Redis error during email OTP IP rate-limit check`);
        throw new InternalServerErrorException('Rate limit check failed. Please try again.');
      }
    } else {
      this.logger.warn('Email OTP request arrived without a resolvable client IP; per-IP limit skipped');
    }

    // 4. Generate OTP and HMAC
    const otp = crypto.randomInt(100000, 1000000).toString();
    const challengeId = crypto.randomUUID();
    const salt = crypto.randomBytes(16).toString('hex');
    const otpHash = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(otp + salt)
      .digest('hex');

    // 5. Atomic challenge creation (300s TTL for email — D-6)
    const redisKey = `otp:email:${email}`;
    try {
      await this.redis.client.eval(
        CREATE_CHALLENGE, 1,
        redisKey,
        challengeId,
        otpHash,
        salt,
        EMAIL_OTP_CHALLENGE_TTL,
        Date.now().toString(),
      );
    } catch (_redisError) {
      this.logger.error(`Redis error during email challenge creation for ${masked}`);
      throw new InternalServerErrorException('OTP generation failed. Please try again.');
    }

    // 6. Deliver via email provider (or mock for tests)
    const mockProvider = this.providerRegistry.getMockProvider();
    let deliveryResult;

    if (mockProvider) {
      // Use mock provider in dev/test for deterministic retrieval
      deliveryResult = await this.otpDeliveryService.deliverToTestChannel({
        otp,
        channel: 'mock',
        correlationId: challengeId,
        email,
        subject: masked,
        subjectType: 'email',
      });
    } else {
      deliveryResult = await this.otpDeliveryService.deliverEmailOtp(
        email, otp, challengeId,
      );
    }

    // 7. Handle delivery outcome
    if (!deliveryResult.success) {
      if (deliveryResult.deliveryOutcome === 'unknown') {
        this.logger.warn(
          `Email OTP delivery outcome uncertain for ${masked} — challenge preserved`,
        );
        return {
          success: false,
          deliveryStatus: 'DELIVERY_TIMEOUT',
          possiblyDelivered: true,
        };
      }

      // Definite rejection — clean up challenge
      try {
        await this.redis.client.eval(
          CLEANUP_CHALLENGE, 1,
          redisKey,
          challengeId,
        );
      } catch (_redisError) {
        this.logger.error(`Redis error during email challenge cleanup for ${masked}`);
      }

      return {
        success: false,
        deliveryStatus: deliveryResult.errorReason || 'DELIVERY_FAILED',
      };
    }

    this.logger.log(`Email OTP delivered to ${masked} (challenge: ${challengeId})`);

    return {
      success: true,
      deliveryStatus: 'delivered',
    };
  }

  /**
   * Atomically verify and consume an OTP challenge, whichever identifier channel
   * it was issued for.
   *
   * Extracted (S1.37 audit) so phone login, email login, registration and account
   * linking all run the identical expiry / replay / wrong-code / failure-limit
   * rules. Before this, `POST /auth/account/link-email` attached an address and
   * stamped `emailVerifiedAt` with no proof of mailbox control at all, which let
   * any authenticated user pre-claim someone else's address, and
   * `POST /auth/account/link-phone` attached a number with the same missing gate
   * (S1.37-F-04, S1.37-F-05). Any identity write that claims an identifier was
   * verified must consume a live challenge through this gate.
   *
   * The challenge value itself is never read back into this process for
   * comparison: the stored HMAC is compared inside the Lua script, so exactly one
   * concurrent attempt can win and the challenge cannot be replayed.
   */
  private async consumeOtpChallenge(
    target: {
      /** Challenge JSON key, e.g. `otp:email:<address>` or `otp:<phone>`. */
      challengeKey: string;
      /** Request-budget key, cleared when the challenge is won. */
      requestKey: string;
      /** Wrong-code budget key for this identifier. */
      failureKey: string;
      /** Redacted identifier for log lines; the raw value never reaches a log. */
      masked: string;
      /** Channel label, used only to keep log lines attributable. */
      label: 'email' | 'phone';
    },
    otp: string,
  ): Promise<void> {
    const otpKey = target.challengeKey;
    const masked = target.masked;

    // 1. Read challenge to obtain salt
    let rawChallenge: string | null;
    try {
      rawChallenge = await this.redis.client.get(otpKey);
    } catch (_redisError) {
      this.logger.error(`Redis error reading ${target.label} challenge for ${masked}`);
      throw new InternalServerErrorException('Verification failed. Please try again.');
    }

    if (!rawChallenge) {
      throw new UnauthorizedException('OTP expired or not found');
    }

    let challenge: { ch: string; hs: string; s: string; ca: string; co: boolean };
    try {
      challenge = JSON.parse(rawChallenge);
    } catch {
      this.logger.error(`Corrupt ${target.label} challenge data for ${masked}`);
      await this.redis.client.del(otpKey).catch(() => {});
      throw new UnauthorizedException('OTP verification error');
    }

    // 2. Compute HMAC of user-supplied OTP with stored salt
    const providedHash = crypto
      .createHmac('sha256', this.hmacSecret)
      .update(otp + challenge.s)
      .digest('hex');

    // 3. Atomic verify-and-consume
    let verifyStatus: number;
    try {
      const result = await this.redis.client.eval(
        VERIFY_AND_CONSUME, 1,
        otpKey,
        providedHash,
      ) as number[];
      verifyStatus = (result[0] ?? -1) as number;
    } catch (_redisError) {
      this.logger.error(`Redis error during ${target.label} OTP verification for ${masked}`);
      throw new InternalServerErrorException('Verification failed. Please try again.');
    }

    // 4. Handle verification result
    switch (verifyStatus) {
      case -1:
        throw new UnauthorizedException('OTP expired or not found');
      case -2:
        throw new UnauthorizedException('OTP already used');
      case 0: {
        // Wrong OTP — enforce verify-failure rate limit
        try {
          const failResult = await this.redis.client.eval(
            ACQUIRE_RATE_LIMIT, 1,
            target.failureKey,
            OTP_VERIFY_FAIL_LIMIT,
            RATE_LIMIT_WINDOW,
          ) as number[];
          const failAllowed = (failResult[0] ?? 0) as number;
          if (failAllowed === 0) {
            const failTtl = (failResult[2] ?? RATE_LIMIT_WINDOW) as number;
            throw new RateLimitException('Too many invalid OTP attempts.', {
              limit: OTP_VERIFY_FAIL_LIMIT,
              remaining: 0,
              retryAfterSeconds: failTtl > 0 ? failTtl : RATE_LIMIT_WINDOW,
            });
          }
        } catch (e) {
          if (e instanceof RateLimitException) throw e;
          this.logger.error(`Redis error during ${target.label} verify-failure rate limit for ${masked}`);
        }
        throw new UnauthorizedException('Invalid OTP');
      }
      case 1:
        break;
      default:
        throw new UnauthorizedException('OTP verification error');
    }

    // 5. Clean up rate-limit keys
    await Promise.all([
      this.redis.client.del(target.requestKey).catch(() => {}),
      this.redis.client.del(target.failureKey).catch(() => {}),
    ]);
  }

  /**
   * Consume the email OTP challenge for `rawEmail`, returning the normalized
   * address it was issued for.
   *
   * @returns the normalized email whose challenge was consumed.
   */
  private async consumeEmailChallenge(rawEmail: string, otp: string): Promise<{ email: string }> {
    const email = normalizeEmail(rawEmail);
    await this.consumeOtpChallenge(
      {
        challengeKey: `otp:email:${email}`,
        requestKey: `otp:req:email:${email}`,
        failureKey: `otp:vatt:email:${email}`,
        masked: maskEmail(email),
        label: 'email',
      },
      otp,
    );
    return { email };
  }

  /**
   * Consume the phone OTP challenge for `rawPhone`, returning the E.164 number it
   * was issued for.
   *
   * Uses exactly the key layout `requestOtp` writes, so a code already delivered
   * over SMS or WhatsApp proves control of the number being linked. No second
   * "linking" challenge format exists: one identifier, one challenge, one consume
   * gate (S1.37-F-05).
   */
  private async consumePhoneChallenge(rawPhone: string, otp: string): Promise<{ phone: string }> {
    const phone = normalizePhone(rawPhone);
    await this.consumeOtpChallenge(
      {
        challengeKey: `otp:${phone}`,
        requestKey: `otp:req:${phone}`,
        failureKey: `otp:vatt:${phone}`,
        masked: maskPhone(phone),
        label: 'phone',
      },
      otp,
    );
    return { phone };
  }

  /**
   * Verify email OTP and issue JWT pair.
   *
   * Lifecycle mirrors phone verifyOtp but uses email-keyed Redis entries
   * and 300s challenge TTL. On success, resolves the user by email —
   * creating an email-only account if no user exists yet.
   *
   * Like the phone path, a verified OTP is the second factor, so the browser is
   * enrolled with a server-issued device credential (S-1).
   */
  async verifyEmailOtp(
    rawEmail: string,
    otp: string,
    deviceId?: string,
    deviceInfo?: { platform: string; userAgent: string },
    context?: AuditRequestContext,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    deviceTrust?: DeviceTrustTransportInstruction;
  }> {
    // Steps 1-5 (challenge read, HMAC compare, atomic consume, failure limits,
    // rate-limit key cleanup) live in consumeEmailChallenge so linking proves
    // mailbox control through exactly the same gate.
    const { email } = await this.consumeEmailChallenge(rawEmail, otp);

    // 6. Resolve or create user by email
    const existing = await this.db.db.query.users.findFirst({
      where: eq(users.email, email),
    });

    let userId: string;
    if (existing) {
      userId = existing.id;
    } else {
      // Email-only registration (D-1)
      userId = crypto.randomUUID();
      await this.db.db.insert(users).values({
        id: userId,
        email,
        fullName: 'New User',
        locale: 'en',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      });
    }

    // 7. Issue JWT pair through existing session infrastructure
    const claims = await this.buildClaims(userId);
    const refreshToken = crypto.randomUUID();
    const tokenHash = this.hashToken(refreshToken);
    const sessionId = crypto.randomUUID();

    const accessToken = this.jwt.sign({
      sub: userId,
      activeOrg: claims.activeOrgId,
      role: claims.roleKey,
      perms: claims.permissions,
      sid: sessionId,
      jti: crypto.randomUUID(),
    });

    await this.db.db.insert(sessions).values({
      id: sessionId,
      userId,
      tokenHash,
      device: deviceInfo?.platform || 'web',
      deviceId: deviceId || null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    await this.audit.record({
      actorType: AuditService.actorTypeForRole(claims.roleKey),
      actorId: userId,
      orgId: claims.activeOrgId,
      action: 'auth.login',
      resource: 'auth',
      metadata: { method: 'email_otp', emailHash: hashIdentifier(email, this.hmacSecret, 'email'), deviceId: deviceId ?? null, sessionId },
      ip: context?.ip,
      userAgent: context?.userAgent ?? deviceInfo?.userAgent,
    });

    const issued = await this.issueDeviceCredential(userId, {
      sessionId,
      label: deviceInfo?.platform ?? 'web',
    });

    return {
      accessToken,
      refreshToken,
      deviceTrust: { credential: issued.credential, maxAgeSeconds: issued.maxAgeSeconds },
    };
  }

  /**
   * Refresh access token using refresh token.
   * Rotation: issues new refresh token, revokes old one.
   * Reuse detection: if old token already revoked, revoke entire chain AND every
   * device-trust credential for the account — a replayed refresh token means the
   * token store is compromised, and the credential lives in the same browser, so
   * the OTP exemption has to go with it (S-1 requirement 6).
   *
   * Device trust is preserved across refresh (requirement 9): a live presented
   * credential is validated, slid, and re-issued as a cookie so an active user is
   * never forced through OTP by a token rotation alone.
   */
  async refreshToken(
    refreshToken: string,
    presentedCredential?: string | null,
  ): Promise<{
    accessToken: string;
    newRefreshToken: string;
    deviceTrust?: DeviceTrustTransportInstruction;
  }> {
    const tokenHash = this.hashToken(refreshToken);

    const session = await this.db.db.query.sessions.findFirst({
      where: eq(sessions.tokenHash, tokenHash),
    });

    if (!session || session.revokedAt) {
      // Reuse detected — revoke entire chain
      if (session?.revokedAt) {
        await this.revokeChain(session.userId);
        await this.revokeAllDeviceCredentials(session.userId, 'ROTATION_REUSE');
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
      deviceId: session.deviceId, // Provenance carried forward; trust is the credential, not this value
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

    // Validate-and-slide the device credential the browser presented, so a
    // rotation never costs a legitimate user their trusted-device status.
    const trust = await this.validateDeviceCredential(presentedCredential, session.userId);

    // Keep the session anchor pointing at the browser's LIVE session: rotation
    // replaced the session row above, and a stale anchor would leave logout
    // unable to find the credential this session earned (finding B6). Only a
    // credential that just validated as trusted is moved.
    if (trust.status === 'trusted') {
      await this.anchorCredentialToSession(presentedCredential, session.userId, newSessionId);
    }

    return {
      accessToken,
      newRefreshToken,
      deviceTrust: this.keepTrustedCredential(presentedCredential, trust),
    };
  }

  /**
   * Logout — revoke the current session, and (S-1, requirement 10) revoke the
   * device-trust credential this browser is presenting.
   *
   * The previous model deliberately kept trust alive after logout ("has this
   * device authenticated this user before"), which is unsafe on any browser
   * profile more than one person can open: after logging out, the next person
   * needed only the password, because the second factor was already waived by a
   * value sitting in that profile's storage. Logout now ends the trust it
   * created, and the cookie is cleared so the browser stops presenting a dead
   * credential.
   *
   * The cost is explicit: the next login from this device asks for OTP once.
   * Trust still survives refresh-token rotation and access-token expiry — only
   * an actual logout (or revocation) ends it.
   *
   * Two independent paths end it, and logout applies both (finding B6):
   *  1. the credential the request is PRESENTING, which needs the cookie plus the
   *     proof header; and
   *  2. the credential the session being closed ENROLLED, looked up by
   *     device_credentials.created_by_session — a server-side link.
   *
   * Path 2 is what makes logout authoritative rather than courtesy. A request
   * that carries no cookie (deliberately stripped, a cookie jar cleared by
   * another tab, a non-browser client holding only the refresh token) used to
   * close the session and leave the second-factor exemption alive in that
   * browser's storage — the exact shared-profile case requirement 10 exists to
   * close. Revocation stays ownership-bound: the session's user must match the
   * credential's user, and credentials enrolled by other sessions (other
   * devices) are untouched.
   */
  async logout(
    refreshToken: string,
    presentedCredential?: string | null,
  ): Promise<{ success: boolean; deviceTrust?: DeviceTrustTransportInstruction }> {
    const tokenHash = this.hashToken(refreshToken);

    // Resolve the owner first: credential revocation must be ownership-bound,
    // so a logout cannot be used to revoke someone else's credential.
    const session = await this.db.db.query.sessions.findFirst({
      where: eq(sessions.tokenHash, tokenHash),
    });

    await this.db.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, tokenHash));

    // Path 2 first: what this session earned, whether or not anything was presented.
    const anchored = session
      ? (await this.revokeCredentialsBySession(session.id, session.userId)) > 0
      : false;

    const cleared =
      (await this.revokePresentedCredential(
        presentedCredential,
        session?.userId ?? null,
        'LOGOUT',
      )) || anchored;

    return { success: true, deviceTrust: cleared ? { clear: true } : undefined };
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

    // Mirror buildClaims: a user with no active membership is still a BUYER,
    // so fall back to the seeded BUYER role instead of leaving the permission
    // keys empty — these keys drive client-side gating (RBAC audit GAP-6).
    let roleId = activeMembership?.roleId ?? null;
    let role = 'BUYER';
    if (roleId) {
      const activeRole = await this.db.db.query.roles.findFirst({
        where: eq(roles.id, roleId),
      });
      if (activeRole) role = activeRole.key;
    } else {
      const buyerRole = await this.db.db.query.roles.findFirst({
        where: eq(roles.key, 'BUYER'),
      });
      roleId = buyerRole?.id ?? null;
    }

    const perms = await this.permissionsForRole(roleId);

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

  // ── Device Trust (audit finding S-1 remediation; migration 0066) ──────

  /**
   * Mint a server-issued device credential and store ONLY its digest.
   *
   * Called after a second factor has actually been satisfied (OTP verified),
   * never from a client-supplied identifier. The secret crosses the wire once,
   * via a Set-Cookie header the controller applies (see AuthController), and is
   * never written to a response body, an audit row or a log line.
   *
   * @param opts.sessionId the session whose authentication enrolled the device;
   *        revoking that session de-trusts the device (requirement 5).
   * @param opts.label non-secret display label for the device list.
   */
  async issueDeviceCredential(
    userId: string,
    opts: { sessionId?: string; label?: string } = {},
  ): Promise<{ credential: string; maxAgeSeconds: number }> {
    const credential = crypto
      .randomBytes(DEVICE_CREDENTIAL_BYTES)
      .toString('base64url');

    const issuedAt = Date.now();
    const expiresAt = new Date(issuedAt + DEVICE_TRUST_SLIDING_MS);
    const hardExpiresAt = new Date(issuedAt + DEVICE_TRUST_HARD_MS);

    await this.db.db.insert(deviceCredentials).values({
      userId,
      credentialHash: this.hashToken(credential),
      // Truncated, not validated: it is display metadata only and never feeds
      // a security decision, so it must never be able to fail a login.
      deviceLabel: (opts.label ?? 'unlabelled').slice(0, 160),
      createdBySession: opts.sessionId ?? null,
      expiresAt,
      hardExpiresAt,
    });

    return {
      credential,
      // The browser cookie must die with the absolute ceiling, not the sliding
      // horizon: Max-Age is absolute, so a shorter cookie lifetime would drop a
      // credential the server still considers live and re-prompt needless OTPs.
      maxAgeSeconds: Math.floor((hardExpiresAt.getTime() - issuedAt) / 1000),
    };
  }

  /**
   * Validate a presented credential and, when it is live, slide its horizon.
   *
   * The lookup is by SHA-256 digest, so this function never holds the plaintext
   * longer than the caller's own argument, and a database read cannot yield
   * something replayable.
   *
   * Failure modes deliberately collapse into "not trusted": an unknown digest,
   * a revoked digest, an expired digest and a digest belonging to another
   * account all produce the same observable behaviour (OTP required), so the
   * endpoint is not an oracle for "does this credential exist?".
   */
  async validateDeviceCredential(
    presented: string | null | undefined,
    userId: string,
  ): Promise<{
    status: DeviceTrustStatus;
    expiresAt?: Date;
    hardExpiresAt?: Date;
  }> {
    if (!presented) return { status: 'absent' };

    const row = await this.db.db.query.deviceCredentials.findFirst({
      where: eq(deviceCredentials.credentialHash, this.hashToken(presented)),
    });

    if (!row) return { status: 'unknown' };

    // Cross-user reuse (requirement 8). The unique digest index means at most
    // one account can own a credential; if that owner is not the account being
    // authenticated, the presentation is rejected. The reason is logged without
    // the identifier or the owner, and never returned to the client.
    if (row.userId !== userId) {
      this.logger.warn(
        'Rejected a device-trust credential presented by a different account ' +
          `(credential ${row.id} is not bound to the authenticating user)`,
      );
      return { status: 'user_mismatch' };
    }

    if (row.revokedAt) return { status: 'revoked' };

    const now = Date.now();
    if (now > row.hardExpiresAt.getTime() || now > row.expiresAt.getTime()) {
      // Expire durably rather than just refusing: the row stops being a live
      // entry, so the device list cannot show trust that does not exist and the
      // digest cannot be re-activated by further presentations.
      await this.db.db
        .update(deviceCredentials)
        .set({ revokedAt: new Date(now), revokedReason: 'EXPIRED' })
        .where(eq(deviceCredentials.id, row.id));
      return { status: 'expired' };
    }

    // Sliding use, clamped at the absolute ceiling (requirement 7).
    const expiresAt = new Date(
      Math.min(now + DEVICE_TRUST_SLIDING_MS, row.hardExpiresAt.getTime()),
    );
    await this.db.db
      .update(deviceCredentials)
      .set({ lastUsedAt: new Date(now), expiresAt })
      .where(eq(deviceCredentials.id, row.id));

    return { status: 'trusted', expiresAt, hardExpiresAt: row.hardExpiresAt };
  }

  /**
   * Revoke one of the caller's own credentials by id (device list "remove").
   * Scoped by user_id in the same statement, so an id belonging to another
   * account revokes nothing and is reported as not found.
   */
  async revokeDeviceCredentialById(
    userId: string,
    credentialId: string,
  ): Promise<{ success: boolean; revokedCount: number }> {
    const result = await this.db.db
      .update(deviceCredentials)
      .set({ revokedAt: new Date(), revokedReason: 'MANUAL' })
      .where(
        and(
          eq(deviceCredentials.id, credentialId),
          eq(deviceCredentials.userId, userId),
          isNull(deviceCredentials.revokedAt),
        ),
      );

    const revokedCount = result['rowCount'] || 0;

    // Recorded because "a device stopped being trusted" is a security-relevant
    // change the account owner (or an investigator) will want to see, and it is
    // the one event that explains a suddenly unexpected OTP prompt. No
    // credential material, not even a digest prefix, is written here.
    if (revokedCount > 0) {
      await this.audit.record({
        actorType: 'SYSTEM',
        actorId: userId,
        action: 'auth.device_trust_revoked',
        resource: 'auth',
        resourceId: credentialId,
        metadata: { revokedCount, reason: 'MANUAL' },
      });
    }

    return { success: true, revokedCount };
  }

  /**
   * Revoke every live credential for an account.
   *
   * Two callers, one shared rule — the OTP exemption must not outlive the
   * authentication it was earned by:
   *  * refresh-token reuse detection (ROTATION_REUSE): a replayed refresh token
   *    means the token store is compromised, and device trust lives in the same
   *    browser, so the second-factor exemption is revoked with it (requirement 6).
   *  * password change (PASSWORD_CHANGE): the credential that produced every
   *    exemption was just replaced, so no browser keeps an OTP-free login path
   *    built on the old secret (finding B5).
   *
   * Returns the number of credentials revoked so the caller can audit it.
   */
  async revokeAllDeviceCredentials(
    userId: string,
    reason:
      | 'ROTATION_REUSE'
      | 'MANUAL'
      | 'SESSION_REVOKED'
      | 'PASSWORD_CHANGE' = 'ROTATION_REUSE',
  ): Promise<number> {
    const result = await this.db.db
      .update(deviceCredentials)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(
        and(
          eq(deviceCredentials.userId, userId),
          isNull(deviceCredentials.revokedAt),
        ),
      );
    return result['rowCount'] || 0;
  }

  /**
   * The caller's trusted-device list — non-secret fields only.
   * `lastFour` of the digest is omitted entirely: even a truncated credential
   * digest would give an attacker candidate material to brute-force against.
   */
  async listDeviceCredentials(userId: string) {
    const rows = await this.db.db.query.deviceCredentials.findMany({
      where: and(eq(deviceCredentials.userId, userId), isNull(deviceCredentials.revokedAt)),
      orderBy: [desc(deviceCredentials.lastUsedAt)],
    });

    return rows.map((row) => ({
      id: row.id,
      deviceLabel: row.deviceLabel,
      createdAt: row.createdAt,
      lastUsedAt: row.lastUsedAt,
      expiresAt: row.expiresAt,
      hardExpiresAt: row.hardExpiresAt,
    }));
  }

  /**
   * Keep a credential's session anchor pointing at the session the browser now
   * holds, after rotation or a trusted password login replaced it.
   *
   * `created_by_session` is what lets logout de-trust a browser that presents
   * nothing (finding B6), and a browser's session row is short-lived: rotation
   * replaces it every refresh, and a trusted password login creates a new one.
   * An anchor that only ever names the enrolment session would be stale within
   * minutes, so the link is maintained rather than frozen at enrolment.
   *
   * Who can move an anchor, and why that is acceptable: only a request that
   * presents the credential itself AND passes the ownership check — i.e. the
   * browser that already holds the second-factor exemption. The anchor is a
   * lookup key for de-trust, never a proof of trust: `validateDeviceCredential`
   * ignores it entirely, so moving it cannot grant, extend or weaken trust for
   * any request. If a credential is suspected copied, revoke account-wide
   * (password change, B5) or per-device from the device list; neither depends
   * on where the anchor currently points.
   */
  private async anchorCredentialToSession(
    presented: string | null | undefined,
    userId: string,
    sessionId: string,
  ): Promise<void> {
    if (!presented) return;
    await this.db.db
      .update(deviceCredentials)
      .set({ createdBySession: sessionId })
      .where(
        and(
          eq(deviceCredentials.credentialHash, this.hashToken(presented)),
          eq(deviceCredentials.userId, userId),
        ),
      );
  }

  /**
   * Revoke the live credential that a specific session enrolled, identified by
   * `device_credentials.created_by_session`.
   *
   * Nothing here is client-influenced: the caller passes the id of the session
   * row this request resolved from its own refresh-token digest, and the write is
   * bound to that session's user. So a logout (or a device sign-out) de-trusts
   * exactly the browser that earned it through that session, and cannot reach
   * another device's credential or another account's.
   *
   * @returns the number of credentials revoked (0 when the session enrolled none).
   */
  private async revokeCredentialsBySession(
    sessionId: string,
    userId: string,
    reason: 'LOGOUT' = 'LOGOUT',
  ): Promise<number> {
    const result = await this.db.db
      .update(deviceCredentials)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(
        and(
          eq(deviceCredentials.createdBySession, sessionId),
          eq(deviceCredentials.userId, userId),
          isNull(deviceCredentials.revokedAt),
        ),
      );
    return result['rowCount'] || 0;
  }

  /**
   * Revoke the credential a browser is presenting, if it belongs to this
   * account. Returns whether a cookie should be cleared from the response.
   *
   * Ownership is re-checked before the write, so a presented digest that lives
   * under another account is left untouched (and untrusted) rather than being a
   * remote revocation primitive against other users.
   */
  private async revokePresentedCredential(
    presented: string | null | undefined,
    userId: string | null,
    reason: 'LOGOUT' | 'MANUAL',
  ): Promise<boolean> {
    if (!presented || !userId) return false;

    const row = await this.db.db.query.deviceCredentials.findFirst({
      where: eq(deviceCredentials.credentialHash, this.hashToken(presented)),
    });
    if (!row) return true; // nothing to revoke; still retire the dead cookie
    if (row.userId !== userId) return false; // not ours to revoke

    await this.db.db
      .update(deviceCredentials)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(deviceCredentials.id, row.id), isNull(deviceCredentials.revokedAt)));

    return true;
  }

  /**
   * Translate a trusted presentation into the transport instruction that keeps
   * the browser cookie in sync with the server-side slide, clamped at the
   * absolute ceiling.
   */
  private keepTrustedCredential(
    presented: string | null | undefined,
    trust: { hardExpiresAt?: Date },
  ): DeviceTrustTransportInstruction | undefined {
    if (!presented || !trust.hardExpiresAt) return undefined;
    const remaining = Math.floor((trust.hardExpiresAt.getTime() - Date.now()) / 1000);
    if (remaining <= 0) return { clear: true };
    return { credential: presented, maxAgeSeconds: remaining };
  }

  // ── Dual Authentication (Password Login) ──────────────────

  /**
   * Login with email and password.
   *
   * Device trust (S-1 remediation): a request is treated as coming from a
   * trusted device ONLY when it presents a server-issued credential that
   * validates for this exact account. The `deviceId` argument is retained
   * purely as session provenance (which session row to attach, and what
   * `revoke-by-device` can later target); it has no influence on the trust
   * decision, so copying a UUID from another browser buys nothing.
   */
  async loginWithPassword(
    rawEmail: string,
    password: string,
    deviceId: string,
    deviceInfo?: { platform: string; userAgent: string },
    context?: AuditRequestContext,
    presentedCredential?: string | null,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    requiresOtp?: boolean;
    otpPhone?: string;
    otpEmail?: string;
    /**
     * Only set on the OTP-challenge branch. 'accepted' = a provider confirmed
     * the send; 'uncertain' = the request is live but delivery is unproven.
     * Clients must not write "code sent" for the second one.
     */
    otpDelivery?: 'accepted' | 'uncertain';
    deviceTrust?: DeviceTrustTransportInstruction;
  }> {
    // Normalize through the same rule the email OTP path uses, so one identity
    // has one rate-limit bucket and one lookup key across both auth methods
    // (S1.37 audit: the raw DTO value was used, making password login
    // case-sensitive while email OTP was case-insensitive).
    const email = normalizeEmail(rawEmail);

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
      // Equalize against the real compare path below, then give the same answer
      // as a wrong password. Any distinct message here would confirm that the
      // identifier has an account.
      await bcrypt.compare(password, await getUnknownUserPasswordHash());
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if password is set
    if (!user.passwordHash) {
      // S1.37 audit: this branch used to answer "Password not set. Please use OTP
      // login or set up credentials.", which disclosed that the email belongs to
      // an existing account. Every email-only account created by Phase 1 has a
      // NULL passwordHash, so the oracle reached the whole new user population.
      // Answer exactly as a wrong password would; the enumeration-prevention
      // invariant already asserted by password-login-regression now holds for
      // all three branches (unknown user / no password / wrong password).
      await bcrypt.compare(password, await getUnknownUserPasswordHash());
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Device trust is decided ONLY by a server-issued credential (S-1). The
    // client-supplied deviceId is not consulted here: it is written to the
    // session as provenance and used by revoke-by-device, nothing more.
    const trust = await this.validateDeviceCredential(presentedCredential, user.id);
    const isTrustedDevice = trust.status === 'trusted';

    if (!isTrustedDevice) {
      // Device not trusted - require OTP verification.
      //
      // Email-only staging release: the second factor follows the channels this
      // release PERMITS, not the shape of the account. The historical rule was
      // "prefer phone, fall back to email for email-only accounts", which under
      // `OTP_CHANNELS=email` locks out every account that happens to have a phone
      // number — the SMS send is refused as a disabled channel, that counts as a
      // definite delivery failure, and login throws while a working email channel
      // sits unused.
      //
      // Phone keeps its historical precedence when it is genuinely usable, so a
      // later phase that re-enables SMS restores the previous behaviour unchanged
      // (requirement 11). "Usable" means permitted AND configured: an operator who
      // lists `sms` without Twilio credentials must not lose the email path.
      //
      // This is channel SELECTION, not fallback. Exactly one request is made, and
      // a failed send on the chosen channel is never retried on the other one
      // (requirement 4).
      let otpResult: { success: boolean; deliveryStatus: string; possiblyDelivered?: boolean };
      let otpChannel: 'phone' | 'email' = 'phone';

      const phoneUsable =
        !!user.phone &&
        this.providerRegistry.isChannelPermitted('sms') &&
        this.providerRegistry.isChannelAvailable('sms');
      const emailUsable =
        !!user.email && this.providerRegistry.isChannelPermitted('email');

      if (phoneUsable) {
        otpResult = await this.requestOtp(user.phone as string);
      } else if (emailUsable) {
        otpResult = await this.requestEmailOtp(user.email as string, context?.ip ?? undefined);
        otpChannel = 'email';
      } else if (user.phone || user.email) {
        // The account has an identifier, but no permitted channel can carry a
        // code to it. Say so without disclosing which identifiers exist.
        throw new UnauthorizedException(
          'OTP delivery is currently unavailable. Please contact support or use a trusted device.',
        );
      } else {
        throw new UnauthorizedException(
          'Account has no phone or email for OTP delivery. Contact support.',
        );
      }

      if (!otpResult.success && !otpResult.possiblyDelivered) {
        // Definite delivery failure — cannot proceed with untrusted device login
        throw new UnauthorizedException(
          'OTP delivery is currently unavailable. Please contact support or use a trusted device.',
        );
      }
      // If possiblyDelivered (timeout), the challenge is still active in Redis.
      // The user may have received the OTP and should be allowed to verify.

      // Password was correct but the device is unknown — record the challenge.
      // The reason is stored as a coarse status: it explains the challenge to an
      // investigator without turning the response into an oracle.
      await this.audit.record({
        actorType: 'SYSTEM',
        actorId: user.id,
        action: 'auth.otp_challenge',
        resource: 'auth',
        metadata: { method: 'password', emailHash: hashIdentifier(email, this.hmacSecret, 'email'), deviceId, reason: trust.status },
        ip: context?.ip,
        userAgent: context?.userAgent ?? deviceInfo?.userAgent,
      });

      return {
        accessToken: '',
        refreshToken: '',
        requiresOtp: true,
        // A browser still presenting a dead credential is told to drop it, so a
        // revoked or expired value cannot be re-attempted on every login.
        deviceTrust: presentedCredential ? { clear: true } : undefined,
        // NOTE: otpPhone returns the full phone number (not masked) because the
        // client needs it for OTP verification — the verify endpoint looks up the
        // challenge by phone. The user already authenticated with the correct
        // password, so this is their own phone on their own session. otpEmail is
        // masked because the email OTP flow uses a different endpoint that takes
        // the email directly from the request body.
        otpPhone: otpChannel === 'phone' ? (user.phone ?? undefined) : undefined,
        otpEmail: otpChannel === 'email' ? maskEmail(user.email ?? '') : undefined,
        // Tells the client whether it may say "code sent". Definite failures
        // threw above, so `success === false` here can only mean the unconfirmed
        // timeout case — which the UI must present as uncertainty, not delivery.
        otpDelivery: otpResult.success ? ('accepted' as const) : ('uncertain' as const),
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

    // This login was authenticated by the credential, so the credential's
    // session anchor moves to the session just created. Without it, a browser
    // that enrolled long ago would log out of a session its credential never
    // named, and the session-anchored half of logout revocation (finding B6)
    // would find nothing.
    await this.anchorCredentialToSession(presentedCredential, user.id, sessionId);

    // Reset rate limit on successful login
    await this.rateLimitService.resetAttempts('password_login', email);

    await this.audit.record({
      actorType: AuditService.actorTypeForRole(claims.roleKey),
      actorId: user.id,
      orgId: claims.activeOrgId,
      action: 'auth.login',
      resource: 'auth',
      metadata: { method: 'password', emailHash: hashIdentifier(email, this.hmacSecret, 'email'), deviceId, sessionId, trustedDevice: true },
      ip: context?.ip,
      userAgent: context?.userAgent ?? deviceInfo?.userAgent,
    });

    // The credential was already validated-and-slided above; re-set the same
    // secret so the browser's absolute Max-Age tracks the new horizon, clamped
    // at the hard ceiling. No new credential is minted on a trusted login:
    // minting one per login would let an attacker who can read the response
    // body... which they cannot, but it would also pile up live rows for one
    // physical device.
    return {
      accessToken,
      refreshToken,
      deviceTrust: this.keepTrustedCredential(presentedCredential, trust),
    };
  }

  /**
   * `checkDeviceTrust(userId, deviceId)` is REMOVED (audit finding S-1).
   *
   * It answered "has any session ever carried this client-supplied UUID for
   * this user within 30 days", so the trust anchor was a value the browser
   * invented in localStorage. Anyone who obtained one — a copied string, a
   * logged header, an XSS-read device id — permanently skipped the second
   * factor, and revoking a session did not revoke the trust it had created.
   * There is deliberately no compatibility shim: the replacement is
   * {@link validateDeviceCredential}, which only accepts a credential this
   * server issued. A legacy UUID-bearing request therefore evaluates as
   * `absent` and is required to verify OTP once.
   */

  /**
   * Set up email and password credentials for a user.
   * User must be authenticated via OTP first.
   */
  async setupCredentials(
    userId: string,
    rawEmail: string,
    password: string,
    deviceId?: string,
  ): Promise<{ success: boolean; message: string }> {
    // Normalize email so the identity is stored in canonical form (trim + lowercase).
    // Without this, a user who sets up "Alice@Example.com" could fail to log in later
    // because loginWithPassword normalizes to "alice@example.com" before lookup.
    const email = normalizeEmail(rawEmail);

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
    const passwordCheck = validatePasswordStrength(password, email, user.phone ?? undefined);
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

    // NOTE: Do NOT revoke existing sessions here.
    //
    // Corrected for the S-1 model: the comment used to justify this by saying the
    // OTP session "established device trust (with deviceId)", which is the
    // pre-remediation claim the audit rejected. Trust comes from the credential
    // minted by that OTP verification (device_credentials.created_by_session), not
    // from the session row or the client-supplied deviceId. What is still true, and
    // is the reason the behaviour stays, is that the caller is authenticated by
    // this very session — revoking it would kill the access and refresh tokens in
    // use mid-request. Setting a password for the first time is not a compromise
    // event, so neither sessions nor credentials are revoked here; contrast
    // changePassword, which revokes both (finding B5).

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
    const passwordCheck = validatePasswordStrength(newPassword, userEmail, user.phone ?? undefined);
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

    // Every device-trust credential this account holds is revoked (finding B5).
    // The exemption means "this browser already completed the second factor",
    // and that conclusion was reached using the secret that has just been
    // replaced — including in the case that motivated the finding: an account
    // whose owner changed the password because the device or the old password
    // may have been compromised. Keeping the exemption alive there would let the
    // next password-only login skip OTP exactly as before. A previously trusted
    // browser therefore gets one OTP challenge on its next login.
    //
    // This runs only on the success path: an incorrect current password, a
    // rejected strength check or an unknown user all throw above, so a failed
    // password change revokes nothing.
    const deTrustedCount = await this.revokeAllDeviceCredentials(
      userId,
      'PASSWORD_CHANGE',
    );
    if (deTrustedCount > 0) {
      await this.audit.record({
        actorType: 'SYSTEM',
        actorId: userId,
        action: 'auth.device_trust_revoked',
        resource: 'auth',
        metadata: { revokedCount: deTrustedCount, reason: 'PASSWORD_CHANGE' },
      });
    }

    // Sessions (behaviour unchanged from the baseline; only the comment is
    // corrected). Naming a device revokes the sessions recorded under that
    // client-supplied `deviceId` — the caller's own device — and leaves other
    // devices signed in; naming none revokes every session for the account. The
    // previous comment ("keep current device if specified") described the
    // opposite of the code below, which is why it is gone rather than the code.
    //
    // Known asymmetry, recorded rather than silently fixed: session revocation is
    // `deviceId`-scoped while credential revocation above is account-wide, so a
    // password change signs other browsers out of trust but not out of their
    // access/refresh sessions. Changing that is a session-semantics change
    // outside this finding's scope.
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
   * Device-check pre-flight (audit finding S-2) — a CONSTANT acknowledgement.
   *
   * WHAT IT USED TO LEAK
   * The old body answered `{canAutoLogin, requiresOtp, hasPassword}` from an
   * unauthenticated POST. `hasPassword: false` distinguished "no such account"
   * from "account with no password", and `canAutoLogin: true` confirmed that a
   * specific address exists AND has an already-trusted device, so an attacker
   * could enumerate accounts, then pick the ones whose second factor was
   * password-only, then aim the OTP endpoints at the ones that were not — with
   * no credential required and, before this change, no throttler of its own.
   *
   * WHY REMOVING THE FIELDS COSTS NOTHING
   * No client ever read them: both the admin and the web login pages awaited
   * the call and discarded the result, and device trust is now carried by the
   * server-issued cookie, which the browser presents automatically. The login
   * flow therefore works exactly as before — `POST /v1/auth/login/password`
   * still decides trust and still returns `requiresOtp` when it must.
   *
   * The identifier is normalized with the same rule every other auth path uses
   * (so `A@B.com` and `a@b.com` cannot be told apart by rate-limit buckets), and
   * the audit/security log records only a keyed hash of it.
   */
  async checkDeviceLogin(rawEmail: string): Promise<{ checked: true }> {
    const email = normalizeEmail(rawEmail);

    // Per-identifier backstop on top of the per-IP ThrottlerGuard: one address
    // cannot be probed in bulk even from a pool of source IPs, and the answer
    // does not change, so exceeding the limit is indistinguishable from being
    // allowed.
    const rateCheck = await this.rateLimitService.checkAndIncrement(
      'device_check',
      email,
      DEVICE_CHECK_LIMIT,
      DEVICE_CHECK_WINDOW_SECONDS,
    );
    if (!rateCheck.allowed) {
      this.logger.warn(
        `Device-check limit reached for identifier ${hashIdentifier(email, this.hmacSecret, 'email')}`,
      );
    }

    await this.audit.record({
      actorType: 'SYSTEM',
      action: 'auth.device_check',
      resource: 'auth',
      // Hashed only: this endpoint is reachable unauthenticated, so a raw
      // address here would turn the audit trail into the enumeration store the
      // response stopped being. The caller's deviceId is not recorded at all —
      // under the S-1 model it drives no decision, so logging it would add an
      // identifier without adding investigative value.
      metadata: { emailHash: hashIdentifier(email, this.hmacSecret, 'email') },
    });

    return { checked: true };
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
   * Revoke sessions by device id, and de-trust the devices they enrolled.
   *
   * `deviceId` here is the operator-facing handle for "this browser": the
   * client-supplied value stored on session rows as provenance. Revoking the
   * sessions it names used to leave the trust behind — the credential minted by
   * one of those very sessions kept granting OTP-free logins after the user
   * clicked "sign this device out". Both halves now go together (S-1
   * requirement 6), keyed on device_credentials.created_by_session, which is
   * the server-side link the client cannot influence.
   */
  async revokeSessionsByDevice(
    userId: string,
    deviceId: string,
  ): Promise<{ success: boolean; revokedCount: number; deTrustedCount: number }> {
    const matching = await this.db.db.query.sessions.findMany({
      where: and(eq(sessions.userId, userId), eq(sessions.deviceId, deviceId)),
      columns: { id: true },
    });

    const result = await this.db.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), eq(sessions.deviceId, deviceId)));

    let deTrustedCount = 0;
    if (matching.length > 0) {
      const revoked = await this.db.db
        .update(deviceCredentials)
        .set({ revokedAt: new Date(), revokedReason: 'SESSION_REVOKED' })
        .where(
          and(
            inArray(deviceCredentials.createdBySession, matching.map((s) => s.id)),
            isNull(deviceCredentials.revokedAt),
          ),
        );
      deTrustedCount = revoked['rowCount'] || 0;
    }

    return {
      success: true,
      revokedCount: result['rowCount'] || 0,
      deTrustedCount,
    };
  }

  // ── Account Linking / Unlinking (S1.35 Phase 1) ────────────

  /**
   * Link a verified email to an existing account.
   *
   * Requirements (S1.35 Step 10, re-enforced by the S1.37 audit):
   * - Proof of mailbox control: a live email OTP for this exact address must be
   *   consumed before the address may be attached.
   * - Email must not already belong to another account.
   * - Concurrency: the write is optimistic on the account's prior email value and
   *   the DB unique index is the final arbiter.
   * - Ownership of the target account is proven by the caller's JWT.
   */
  async linkEmailToAccount(
    userId: string,
    rawEmail: string,
    otp: string,
  ): Promise<{ success: boolean }> {
    // 1. Proof of control — consumes the challenge, so a code cannot be replayed
    //    afterwards to log in.
    const { email } = await this.consumeEmailChallenge(rawEmail, otp);

    // 2. Resolve and lock in the decision we are about to base the write on.
    const target = await this.db.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!target) throw new NotFoundException('User not found');

    // Attaching the address the account already holds is a no-op.
    if (target.email === email) return { success: true };

    // 3. Check if email already belongs to another user
    const existingByEmail = await this.db.db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (existingByEmail && existingByEmail.id !== userId) {
      throw new ConflictException('EMAIL_ALREADY_IN_USE');
    }

    // 4. Update user's email, guarded by optimistic locking on the value this
    //    decision read. A concurrent link that beat step 3 surfaces either as
    //    rowCount 0 or as a unique violation, never as a silent overwrite.
    try {
      const updated = await this.db.db
        .update(users)
        .set({ email, emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(users.id, userId), sql`${users.email} IS NOT DISTINCT FROM ${target.email}`));
      if (((updated as any)['rowCount'] ?? 0) === 0) {
        throw new ConflictException('LINK_CONFLICT_RETRY');
      }
    } catch (err) {
      throw this.translateIdentifierConstraintError(err, 'EMAIL_ALREADY_IN_USE');
    }

    // 5. Audit log
    await this.db.db.insert(accountLinkLog).values({
      userId,
      action: 'LINK',
      identifierType: 'EMAIL',
      identifierHash: hashIdentifier(email, this.hmacSecret, 'email'),
      performedBy: userId,
    });

    return { success: true };
  }

  /**
   * Link a verified phone to an existing account.
   *
   * Requirements (symmetric with linkEmailToAccount, S1.37-F-05):
   * - Proof of control: a live, unconsumed phone OTP for this exact number must be
   *   consumed before the number may be attached. Ownership of the target account
   *   is proven by the caller's JWT; ownership of the identifier is proven here.
   * - The number must not already belong to another account.
   * - Concurrency: the write is optimistic on the account's prior phone value and
   *   the DB unique index is the final arbiter.
   * - The last usable identifier can never be removed by a link (CHECK 23514).
   */
  async linkPhoneToAccount(
    userId: string,
    rawPhone: string,
    otp: string,
  ): Promise<{ success: boolean }> {
    // 1. Proof of control — consumes the challenge, so the same code cannot be
    //    replayed afterwards to log in.
    const { phone } = await this.consumePhoneChallenge(rawPhone, otp);

    // 2. Resolve and lock in the decision we are about to base the write on.
    const target = await this.db.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!target) throw new NotFoundException('User not found');

    // Attaching the number the account already holds is a no-op.
    if (target.phone === phone) return { success: true };

    // 3. Check if phone already belongs to another user
    const existingByPhone = await this.db.db.query.users.findFirst({
      where: eq(users.phone, phone),
    });
    if (existingByPhone && existingByPhone.id !== userId) {
      throw new ConflictException('PHONE_ALREADY_IN_USE');
    }

    // 4. Update user's phone, guarded by optimistic locking on the value this
    //    decision read. A concurrent link that beat step 3 surfaces either as
    //    rowCount 0 or as a unique violation, never as a silent overwrite.
    try {
      const updated = await this.db.db
        .update(users)
        .set({ phone, updatedAt: new Date() })
        .where(and(eq(users.id, userId), sql`${users.phone} IS NOT DISTINCT FROM ${target.phone}`));
      if (((updated as any)['rowCount'] ?? 0) === 0) {
        throw new ConflictException('LINK_CONFLICT_RETRY');
      }
    } catch (err) {
      throw this.translateIdentifierConstraintError(err, 'PHONE_ALREADY_IN_USE');
    }

    // 5. Audit log
    await this.db.db.insert(accountLinkLog).values({
      userId,
      action: 'LINK',
      identifierType: 'PHONE',
      identifierHash: hashIdentifier(phone, this.hmacSecret, 'phone'),
      performedBy: userId,
    });

    return { success: true };
  }

  /**
   * Map a PostgreSQL constraint violation raised by a link/unlink write onto the
   * domain error the API contract promises instead of leaking an HTTP 500.
   * 23505 = unique violation (identifier already taken),
   * 23514 = CHECK violation (the last usable identifier would be removed).
   */
  private translateIdentifierConstraintError(err: unknown, takenCode: string): unknown {
    const code = (err as { code?: string } | null | undefined)?.code;
    if (code === '23505') return new ConflictException(takenCode);
    if (code === '23514') {
      return new BadRequestException(
        'At least one usable identifier (phone or email) must remain on the account.',
      );
    }
    return err;
  }

  /**
   * Unlink email from an account.
   *
   * Safety: cannot remove the last usable authentication method.
   * If the account has no phone, unlinking email is rejected.
   */
  async unlinkEmailFromAccount(
    userId: string,
  ): Promise<{ success: boolean }> {
    const user = await this.db.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new NotFoundException('User not found');

    // Cannot remove last auth method
    if (!user.phone) {
      throw new BadRequestException(
        'Cannot remove email: no phone number linked. At least one authentication method is required.',
      );
    }

    const oldEmail = user.email;
    // Optimistic guard: only clear the email this decision was based on, and
    // translate a concurrent last-identifier race (CHECK 23514) into a 400
    // rather than an HTTP 500.
    try {
      const updated = await this.db.db
        .update(users)
        .set({ email: null, emailVerifiedAt: null, updatedAt: new Date() })
        .where(and(eq(users.id, userId), sql`${users.email} IS NOT DISTINCT FROM ${user.email}`));
      if (((updated as any)['rowCount'] ?? 0) === 0) {
        throw new ConflictException('LINK_CONFLICT_RETRY');
      }
    } catch (err) {
      throw this.translateIdentifierConstraintError(err, 'EMAIL_ALREADY_IN_USE');
    }

    // Audit log
    if (oldEmail) {
      await this.db.db.insert(accountLinkLog).values({
        userId,
        action: 'UNLINK',
        identifierType: 'EMAIL',
        identifierHash: hashIdentifier(oldEmail, this.hmacSecret, 'email'),
        performedBy: userId,
      });
    }

    return { success: true };
  }

  /**
   * Unlink phone from an account.
   *
   * Safety: cannot remove the last usable authentication method.
   * If the account has no email, unlinking phone is rejected.
   */
  async unlinkPhoneFromAccount(
    userId: string,
  ): Promise<{ success: boolean }> {
    const user = await this.db.db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) throw new NotFoundException('User not found');

    // Cannot remove last auth method
    if (!user.email) {
      throw new BadRequestException(
        'Cannot remove phone: no email linked. At least one authentication method is required.',
      );
    }

    const oldPhone = user.phone;
    try {
      const updated = await this.db.db
        .update(users)
        .set({ phone: null, updatedAt: new Date() })
        .where(and(eq(users.id, userId), sql`${users.phone} IS NOT DISTINCT FROM ${user.phone}`));
      if (((updated as any)['rowCount'] ?? 0) === 0) {
        throw new ConflictException('LINK_CONFLICT_RETRY');
      }
    } catch (err) {
      throw this.translateIdentifierConstraintError(err, 'PHONE_ALREADY_IN_USE');
    }

    // Audit log
    if (oldPhone) {
      await this.db.db.insert(accountLinkLog).values({
        userId,
        action: 'UNLINK',
        identifierType: 'PHONE',
        identifierHash: hashIdentifier(oldPhone, this.hmacSecret, 'phone'),
        performedBy: userId,
      });
    }

    return { success: true };
  }

  // ── Helpers ────────────────────────────────────────────────

  /**
   * Check whether the email OTP feature flag is enabled.
   * Reads from the feature_flags table; returns false when the row is absent.
   */
  async isEmailOtpEnabled(): Promise<boolean> {
    try {
      const result = await this.db.db.execute(
        sql`SELECT enabled FROM feature_flags WHERE key = ${FLAG_AUTH_EMAIL_OTP}`,
      );
      // drizzle-orm/node-postgres returns { rows: [...] } from raw execute
      const rows = (result as any)?.rows ?? (result as any);
      return Array.isArray(rows) && rows[0]?.enabled === true;
    } catch {
      return false;
    }
  }

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

    // Resolve the role and its permission set.
    //
    // A user with no organization membership (e.g. a freshly registered buyer
    // who has not yet created or joined an org) still acts as a BUYER, so
    // roleKey defaults to 'BUYER'. Their permissions MUST follow that role:
    // leaving `perms` empty makes PermissionsGuard reject every buyer action —
    // checkout included — with 403 "Missing required permissions: orders:write",
    // because the guard reads this array straight from the JWT. So when no
    // membership binds a roleId we fall back to the seeded BUYER role and load
    // its permissions exactly as we would for any membership-bound role.
    let roleId = activeMembership?.roleId ?? null;
    let roleKey = 'BUYER';
    if (roleId) {
      const role = await this.db.db.query.roles.findFirst({
        where: eq(roles.id, roleId),
      });
      if (role) roleKey = role.key;
    } else {
      const buyerRole = await this.db.db.query.roles.findFirst({
        where: eq(roles.key, 'BUYER'),
      });
      roleId = buyerRole?.id ?? null;
    }

    const permissionList = await this.permissionsForRole(roleId);

    return { activeOrgId, roleKey, permissions: permissionList };
  }

  /**
   * Load a role's permission keys via role_permissions -> permissions in a
   * single batched query (no N+1). Shared by buildClaims and getProfile so the
   * JWT `perms` claim and the profile's client-side gating keys never diverge.
   * Returns [] for a null/unknown role or a role with no grants.
   */
  private async permissionsForRole(roleId: string | null): Promise<string[]> {
    if (!roleId) return [];
    const rolePerms = await this.db.db.query.rolePermissions.findMany({
      where: eq(rolePermissions.roleId, roleId),
    });
    const permIds = rolePerms.map((rp) => rp.permissionId);
    if (permIds.length === 0) return [];
    const perms = await this.db.db.query.permissions.findMany({
      where: inArray(permissions.id, permIds),
    });
    return perms.map((p) => p.key);
  }
}
