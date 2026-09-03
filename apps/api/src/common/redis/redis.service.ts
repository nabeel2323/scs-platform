import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  public client!: Redis;

  async onModuleInit() {
    const url = process.env['REDIS_URL'] || 'redis://localhost:6379';

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
