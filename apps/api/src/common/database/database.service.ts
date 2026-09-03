import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../drizzle/schema';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private client!: postgres.Sql;
  public db!: PostgresJsDatabase<typeof schema>;

  async onModuleInit() {
    const connectionString =
      process.env['DATABASE_URL'] || 'postgresql://scs:scs_dev_2026@localhost:5432/scs_platform';

    this.client = postgres(connectionString, {
      max: parseInt(process.env['DATABASE_POOL_MAX'] || '20', 10),
      idle_timeout: 20,
      connect_timeout: 10,
    });

    this.db = drizzle(this.client, { schema });
  }

  async onModuleDestroy() {
    await this.client?.end();
  }
}
