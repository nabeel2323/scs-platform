import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { resolveRedisUrl } from '../../config/env-gate';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  public client!: Redis;

  async onModuleInit() {
    // Gate-resolved like DATABASE_URL (P13 Phase 4.1, finding F-4). Redis holds the
    // access-token denylist consulted by JwtAuthGuard, so a defaulted localhost target
    // in a deployed environment would be an authentication failure, not a cache miss.
    const url = resolveRedisUrl({
      nodeEnv: process.env['NODE_ENV'],
      url: process.env['REDIS_URL'],
    });

    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy(times: number) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
    });

    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }
}
