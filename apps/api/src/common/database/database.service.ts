import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../drizzle/schema';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  public db!: NodePgDatabase<typeof schema>;

  async onModuleInit() {
    const connectionString =
      process.env['DATABASE_URL'] || 'postgresql://scs:scs_dev_2026@127.0.0.1:15432/scs_platform';

    this.pool = new Pool({
      connectionString,
      max: parseInt(process.env['DATABASE_POOL_MAX'] || '20', 10),
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
    } as any);

    this.db = drizzle(this.pool, { schema });
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
