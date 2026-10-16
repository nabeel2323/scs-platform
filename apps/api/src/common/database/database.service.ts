import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as fs from 'node:fs';
import * as schema from '../../drizzle/schema';
import { resolveDatabaseUrl } from '../../config/env-gate';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  public db!: NodePgDatabase<typeof schema>;

  async onModuleInit() {
    // Resolved through the production config gate (P13 Phase 4.1, finding F-4): the
    // development DSN is used only in development/test, and a deployed process that
    // has no DATABASE_URL refuses to boot instead of silently aiming at a local box.
    const connectionString = resolveDatabaseUrl({
      nodeEnv: process.env['NODE_ENV'],
      url: process.env['DATABASE_URL'],
    });

    const sslCaFile = process.env['PGSSLROOTCERT'];

    this.pool = new Pool({
      connectionString,
      max: parseInt(process.env['DATABASE_POOL_MAX'] || '20', 10),
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
      ...(sslCaFile && {
        ssl: {
          ca: fs.readFileSync(sslCaFile, 'utf8'),
          rejectUnauthorized: true,
        },
      }),
    });

    this.db = drizzle(this.pool, { schema });
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
