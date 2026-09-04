import { Injectable } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

/**
 * Rate limiting service for authentication endpoints
 * Uses Redis to track attempts with TTL-based expiration
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Check if action is within rate limit
   * @param action - Type of action (e.g., 'password_login', 'credential_change')
   * @param identifier - Unique identifier (e.g., email, userId, IP)
   * @param maxAttempts - Maximum allowed attempts
   * @returns true if within limit, false if exceeded
   */
  async checkLimit(action: string, identifier: string, maxAttempts: number): Promise<boolean> {
    const key = `rate_limit:${action}:${identifier}`;
    const attempts = await this.redis.client.get(key);
    
    if (!attempts) {
      return true;
    }
    
    return parseInt(attempts, 10) < maxAttempts;
  }

  /**
   * Increment attempt counter for an action
   * @param action - Type of action
   * @param identifier - Unique identifier
   * @param ttlSeconds - Time to live in seconds (default: 900 = 15 minutes)
   */
  async incrementAttempts(action: string, identifier: string, ttlSeconds: number = 900): Promise<void> {
    const key = `rate_limit:${action}:${identifier}`;
    const attempts = await this.redis.client.get(key);
    
    if (!attempts) {
      await this.redis.client.set(key, '1', 'EX', ttlSeconds);
    } else {
      await this.redis.client.incr(key);
    }
  }

  /**
   * Reset attempt counter for an action
   * @param action - Type of action
   * @param identifier - Unique identifier
   */
  async resetAttempts(action: string, identifier: string): Promise<void> {
    const key = `rate_limit:${action}:${identifier}`;
    await this.redis.client.del(key);
  }

  /**
   * Get remaining attempts for an action
   * @param action - Type of action
   * @param identifier - Unique identifier
   * @param maxAttempts - Maximum allowed attempts
   * @returns Number of remaining attempts
   */
  async getRemainingAttempts(action: string, identifier: string, maxAttempts: number): Promise<number> {
    const key = `rate_limit:${action}:${identifier}`;
    const attempts = await this.redis.client.get(key);
    
    if (!attempts) {
      return maxAttempts;
    }
    
    return Math.max(0, maxAttempts - parseInt(attempts, 10));
  }

  /**
   * Check and increment in one operation (atomic)
   * Returns remaining attempts or throws if limit exceeded
   */
  async checkAndIncrement(
    action: string,
    identifier: string,
    maxAttempts: number,
    ttlSeconds: number = 900,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const allowed = await this.checkLimit(action, identifier, maxAttempts);
    
    if (!allowed) {
      const remaining = await this.getRemainingAttempts(action, identifier, maxAttempts);
      return { allowed: false, remaining };
    }
    
    await this.incrementAttempts(action, identifier, ttlSeconds);
    const remaining = await this.getRemainingAttempts(action, identifier, maxAttempts);
    
    return { allowed: true, remaining };
  }
}
