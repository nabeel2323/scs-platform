import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
} from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { DatabaseService } from './common/database/database.service';
import { RedisService } from './common/redis/redis.service';

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  @Get('healthz')
  @HealthCheck()
  healthCheck() {
    return this.health.check([]);
  }

  @Get('readyz')
  @HealthCheck()
  async readinessCheck() {
    return this.health.check([
      async () => {
        try {
          await this.db.db.execute(sql`SELECT 1`);

          return {
            database: {
              status: 'up',
            },
          };
        } catch (_error) {
          throw new HealthCheckError('Database check failed', {
            database: {
              status: 'down',
            },
          });
        }
      },

      async () => {
        try {
          await this.redis.client.ping();

          return {
            redis: {
              status: 'up',
            },
          };
        } catch (_error) {
          throw new HealthCheckError('Redis check failed', {
            redis: {
              status: 'down',
            },
          });
        }
      },
    ]);
  }
}
