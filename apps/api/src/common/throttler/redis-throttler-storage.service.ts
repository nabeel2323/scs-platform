/**
 * S1.7 — Redis-backed distributed throttler storage.
 *
 * Replaces the default in-memory ThrottlerStorageService so that rate-limit
 * counters are shared across all API replicas through the single Redis
 * instance already used for OTP challenges and the access-token denylist.
 *
 * Key design decisions:
 *  - All counter logic is a single Lua EVAL for atomicity (no read-then-write races).
 *  - Keys are prefixed `scs:throttle:` to avoid collision with OTP challenge keys
 *    (`otp:`), per-phone rate-limit keys (`otp:req:`, `otp:vatt:`), session keys,
 *    and any other application namespace.
 *  - The guard already hashes `ControllerName-methodName-throttlerName-tracker`
 *    into the key, so each (route, profile, IP) tuple gets an independent counter.
 *  - On Redis failure the storage throws; the global exception filter maps this
 *    to a 503 (fail-closed for OTP abuse prevention). The per-phone Lua rate
 *    limits in IdentityService have their own independent fail-closed path.
 *  - No phone numbers, OTP values, or authentication tokens appear in keys or logs.
 */
import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';

/**
 * Shape returned by ThrottlerStorage.increment(). The interface
 * ThrottlerStorageRecord is not re-exported from the package index in v6.x,
 * so we declare the structural type locally (matching the interface exactly).
 */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/** Atomic Lua script for the increment + block check + TTL management. */
const INCREMENT_SCRIPT = `
local hitKey    = KEYS[1]
local blockKey  = KEYS[2]
local ttlMs     = tonumber(ARGV[1])
local limit     = tonumber(ARGV[2])
local blockMs   = tonumber(ARGV[3])

-- If a block is active and has not expired, reject immediately.
if redis.call('EXISTS', blockKey) == 1 then
  local blockTtlMs = redis.call('PTTL', blockKey)
  if blockTtlMs > 0 then
    local hitTtlMs = redis.call('PTTL', hitKey)
    local totalHits = tonumber(redis.call('GET', hitKey) or '0')
    return cjson.encode({
      totalHits = totalHits,
      timeToExpire = math.ceil(math.max(hitTtlMs, 0) / 1000),
      isBlocked = true,
      timeToBlockExpire = math.ceil(blockTtlMs / 1000)
    })
  end
end

-- Increment the sliding-window counter.
local count = redis.call('INCR', hitKey)
if count == 1 then
  redis.call('PEXPIRE', hitKey, ttlMs)
end

local hitTtlMs = redis.call('PTTL', hitKey)
if hitTtlMs < 0 then
  redis.call('PEXPIRE', hitKey, ttlMs)
  hitTtlMs = ttlMs
end

-- Block if the limit is exceeded.
local isBlocked = false
local blockTtlMs = 0
if count > limit then
  isBlocked = true
  redis.call('SET', blockKey, '1', 'PX', blockMs)
  blockTtlMs = blockMs
end

return cjson.encode({
  totalHits = count,
  timeToExpire = math.ceil(hitTtlMs / 1000),
  isBlocked = isBlocked,
  timeToBlockExpire = math.ceil(blockTtlMs / 1000)
})
`;

/** Prefix for all throttler keys — collision-resistant against OTP/session namespaces. */
const KEY_PREFIX = 'scs:throttle:';

@Injectable()
export class RedisThrottlerStorageService
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly logger = new Logger(RedisThrottlerStorageService.name);
  private scriptSha: string | null = null;

  constructor(private readonly redisService: RedisService) {}

  private get client(): Redis {
    return this.redisService.client;
  }

  async onModuleDestroy() {
    // No cleanup needed — the Redis connection is owned by RedisService.
  }

  /**
   * Atomically increment the hit counter for the given key and return the
   * current throttling state. This is the single method required by the
   * ThrottlerStorage interface (v6.x).
   *
   * @param key             Hashed identifier (controller-method-throttlerName-tracker).
   * @param ttl             Window duration in milliseconds.
   * @param limit           Maximum hits allowed within the window.
   * @param blockDuration   Duration (ms) to keep the block active after limit is exceeded.
   * @param _throttlerName  Name of the throttler profile (unused — already part of key hash).
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `${KEY_PREFIX}${key}`;
    const blockKey = `${KEY_PREFIX}${key}:blocked`;

    try {
      const result = await this.evalWithRetry(
        hitKey,
        blockKey,
        ttl,
        limit,
        blockDuration,
      );
      return result;
    } catch (err) {
      // S1.8 F-1 fix: Fail-closed with 503 (Service Unavailable) instead of
      // letting the raw Redis error propagate as a generic 500. The
      // AllExceptionsFilter maps HttpException subclasses to their correct
      // status code, so a 503 correctly signals a security-dependency outage
      // to clients and monitoring — distinct from an application bug.
      this.logger.error(
        `Redis throttler storage unavailable — failing closed: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'Rate-limit service is temporarily unavailable. Please retry.',
      );
    }
  }

  /**
   * Try EVALSHA first (cached script), fall back to EVAL on NOSCRIPT error.
   * This avoids re-uploading the script on every call while handling Redis
   * restarts that flush the script cache.
   */
  private async evalWithRetry(
    hitKey: string,
    blockKey: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<ThrottlerStorageRecord> {
    // Attempt with cached SHA if available.
    if (this.scriptSha) {
      try {
        const raw = await this.client.evalsha(
          this.scriptSha,
          2,
          hitKey,
          blockKey,
          String(ttl),
          String(limit),
          String(blockDuration),
        );
        return this.parseResult(raw);
      } catch (err) {
        if ((err as Error).message?.startsWith('NOSCRIPT')) {
          this.scriptSha = null; // Script was flushed; fall through to EVAL.
        } else {
          throw err;
        }
      }
    }

    // Upload and execute via EVAL.
    const raw = await this.client.eval(
      INCREMENT_SCRIPT,
      2,
      hitKey,
      blockKey,
      String(ttl),
      String(limit),
      String(blockDuration),
    );
    // Cache the SHA for subsequent EVALSHA calls.
    // ioredis doesn't expose the SHA from eval(), so we compute it ourselves.
    if (!this.scriptSha) {
      const crypto = await import('node:crypto');
      this.scriptSha = crypto
        .createHash('sha1')
        .update(INCREMENT_SCRIPT)
        .digest('hex');
    }
    return this.parseResult(raw);
  }

  private parseResult(raw: unknown): ThrottlerStorageRecord {
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return {
          totalHits: Number(parsed.totalHits) || 0,
          timeToExpire: Number(parsed.timeToExpire) || 0,
          isBlocked: Boolean(parsed.isBlocked),
          timeToBlockExpire: Number(parsed.timeToBlockExpire) || 0,
        };
      } catch {
        // If JSON parsing fails, treat as a non-blocked zero-hit state.
        return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
      }
    }
    return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
  }
}
