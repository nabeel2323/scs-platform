import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, PoolClient } from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as schema from '../../drizzle/schema';
import { resolveDatabaseUrl } from '../../config/env-gate';
import { PERMISSIONS, ROLES } from './rbac-seed.data';

/**
 * Resolve the migrations directory. Works for both:
 * - Compiled JS: dist/common/database/ -> repo root/infra/drizzle/migrations
 * - tsx/ts-node:  src/common/database/ -> repo root/infra/drizzle/migrations
 */
function resolveMigrationsDir(): string {
  // From compiled dist/ or source src/, go up to apps/api root, then to repo infra/
  const here = __dirname; // e.g. .../apps/api/dist/common/database or .../apps/api/src/common/database
  const apiRoot = path.resolve(here, '..', '..', '..'); // apps/api
  return path.resolve(apiRoot, '..', '..', 'infra', 'drizzle', 'migrations');
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private static readonly logger = new Logger('DatabaseService');
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

    // Auto-migrate and seed in development mode so debugging "just works".
    const nodeEnv = (process.env['NODE_ENV'] ?? 'development').trim().toLowerCase();
    if (nodeEnv === 'development' || nodeEnv === 'test') {
      await this.runDevMigrationsAndSeed(connectionString, sslCaFile);
    }

    this.db = drizzle(this.pool, { schema });
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }

  /**
   * Development-only: apply pending SQL migrations and run the RBAC seed.
   * Uses a dedicated client so it doesn't consume a pool connection during bootstrap.
   * Idempotent — safe to run on every start.
   */
  private async runDevMigrationsAndSeed(
    connectionString: string,
    sslCaFile: string | undefined,
  ): Promise<void> {
    const bootstrapPool = new Pool({
      connectionString,
      max: 2,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
      ...(sslCaFile && {
        ssl: {
          ca: fs.readFileSync(sslCaFile, 'utf8'),
          rejectUnauthorized: true,
        },
      }),
    });

    let client: PoolClient | undefined;
    try {
      client = await bootstrapPool.connect();
      await client.query('SELECT 1'); // prove connectivity

      // ── Migrations ──────────────────────────────────────────────────────
      const migrationsDir = resolveMigrationsDir();
      if (fs.existsSync(migrationsDir)) {
        const files = fs
          .readdirSync(migrationsDir)
          .filter((f) => f.endsWith('.sql'))
          .sort();

        // Ensure migration log table exists
        await client.query(`CREATE TABLE IF NOT EXISTS _migration_log (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )`);

        const appliedRes = await client.query('SELECT name FROM _migration_log ORDER BY name');
        const applied = new Set(appliedRes.rows.map((r) => r.name));
        const pending = files.filter((f) => !applied.has(f));

        if (pending.length > 0) {
          DatabaseService.logger.log(`Applying ${pending.length} pending migration(s)...`);
          for (const file of pending) {
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
            try {
              await client.query('BEGIN');
              await client.query(sql);
              await client.query('INSERT INTO _migration_log (name) VALUES ($1)', [file]);
              await client.query('COMMIT');
              DatabaseService.logger.log(`  ✓ ${file}`);
            } catch (err: any) {
              await client.query('ROLLBACK');
              DatabaseService.logger.error(`  ✗ ${file}: ${err.message}`);
              throw err;
            }
          }
          DatabaseService.logger.log(`Migrations complete (${pending.length} applied).`);
        } else {
          DatabaseService.logger.log(`Database up-to-date — all ${files.length} migration(s) applied.`);
        }
      } else {
        DatabaseService.logger.warn(`Migrations directory not found: ${migrationsDir}`);
      }

      // ── RBAC Seed (idempotent) ──────────────────────────────────────────
      await this.runDevSeed(client);
    } catch (err: any) {
      DatabaseService.logger.error(`Dev bootstrap failed: ${err.message}`);
      // Don't crash — let the app try to start anyway (tables may already exist).
    } finally {
      if (client) {
        try { await client.release(); } catch { /* ignore */ }
      }
      await bootstrapPool.end();
    }
  }

  /**
   * Idempotent RBAC seed — ensures permissions, roles, and mappings exist.
   * Uses data from rbac-seed.data.ts (compiled with the rest of src/).
   */
  private async runDevSeed(client: PoolClient): Promise<void> {
    await client.query('BEGIN');
    try {
      // 1. Permissions
      let newPerms = 0;
      for (const key of PERMISSIONS) {
        const res = await client.query(
          `INSERT INTO permissions (id, key) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
          [randomUUID(), key],
        );
        if (res.rowCount && res.rowCount > 0) newPerms++;
      }

      // 2. Roles
      let newRoles = 0;
      for (const role of ROLES) {
        const res = await client.query(
          `INSERT INTO roles (id, key, name) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING`,
          [randomUUID(), role.key, role.name],
        );
        if (res.rowCount && res.rowCount > 0) newRoles++;
      }

      // 3. Resolve IDs for role-permission mappings
      const rolesRes = await client.query(`SELECT id, key FROM roles`);
      const roleById = new Map<string, string>();
      for (const row of rolesRes.rows) roleById.set(row.key, row.id);

      const permsRes = await client.query(`SELECT id, key FROM permissions`);
      const permById = new Map<string, string>();
      for (const row of permsRes.rows) permById.set(row.key, row.id);

      // 4. Role-permission mappings
      let newMappings = 0;
      for (const role of ROLES) {
        const roleId = roleById.get(role.key);
        if (!roleId) continue;
        for (const permKey of role.permissions) {
          const permId = permById.get(permKey);
          if (!permId) continue;
          const res = await client.query(
            `INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [roleId, permId],
          );
          if (res.rowCount && res.rowCount > 0) newMappings++;
        }
      }

      await client.query('COMMIT');

      if (newPerms > 0 || newRoles > 0 || newMappings > 0) {
        DatabaseService.logger.log(
          `Seed: ${newPerms} new permission(s), ${newRoles} new role(s), ${newMappings} new mapping(s).`,
        );
      } else {
        DatabaseService.logger.log('Seed: RBAC data up-to-date.');
      }
    } catch (err: any) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      DatabaseService.logger.error(`Seed failed: ${err.message}`);
    }
  }
}
