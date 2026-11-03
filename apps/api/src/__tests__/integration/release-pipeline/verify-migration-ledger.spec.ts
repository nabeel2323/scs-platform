/**
 * Migration Ledger Verification — Integration Tests
 *
 * Tests the verify-migration-ledger.mjs script using disposable PostgreSQL.
 * Verifies:
 * - Ledger consistency detection (all files recorded)
 * - Missing migration detection (file exists but not in log)
 * - Orphaned log entry detection (log entry but no file)
 * - Error handling (missing env vars, connection failures)
 *
 * @see apps/api/scripts/verify-migration-ledger.mjs
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GenericContainer, Wait } from '@testcontainers/generic';
import { StartedTestContainer } from '@testcontainers/core';
import pg from 'pg';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..', '..');
const scriptPath = path.resolve(apiRoot, 'scripts', 'verify-migration-ledger.mjs');
const migrationsDir = path.resolve(apiRoot, 'infra', 'drizzle', 'migrations');

describe('Migration Ledger Verification', () => {
  let container: StartedTestContainer;
  let pool: pg.Pool;
  let connectionString: string;

  beforeAll(async () => {
    // Start disposable PostgreSQL
    container = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
        POSTGRES_DB: 'test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
      .start();

    const host = container.getHost();
    const port = container.getMappedPort(5432);
    connectionString = `postgresql://test:test@${host}:${port}/test`;

    pool = new Pool({ connectionString });
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    // Clean up tables before each test
    await pool.query('DROP TABLE IF EXISTS _migration_log CASCADE');
  });

  describe('Script execution', () => {
    it('should exit with code 2 when DATABASE_URL is missing', () => {
      const env = { ...process.env };
      delete env['DATABASE_URL'];

      expect(() => {
        execSync(`node ${scriptPath}`, { env, stdio: 'pipe' });
      }).toThrow();
    });

    it('should exit with code 2 when _migration_log table does not exist', async () => {
      const env = {
        ...process.env,
        DATABASE_URL: connectionString,
      };

      try {
        execSync(`node ${scriptPath}`, { env, stdio: 'pipe' });
        expect.fail('Script should have exited with code 2');
      } catch (err: any) {
        expect(err.status).toBe(2);
        expect(err.stderr.toString()).toContain('_migration_log table does not exist');
      }
    });

    it('should exit with code 0 when ledger is consistent', async () => {
      // Create _migration_log table
      await pool.query(`
        CREATE TABLE _migration_log (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      // Get actual migration files
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

      // Insert all files into log
      for (const file of files) {
        await pool.query('INSERT INTO _migration_log (name) VALUES ($1)', [file]);
      }

      const env = {
        ...process.env,
        DATABASE_URL: connectionString,
      };

      const output = execSync(`node ${scriptPath}`, { env, encoding: 'utf8' });
      expect(output).toContain('VERIFICATION PASSED');
      expect(output).toContain(`All ${files.length} migration file(s) are recorded`);
    });

    it('should exit with code 1 when migration file is missing from log', async () => {
      // Create _migration_log table
      await pool.query(`
        CREATE TABLE _migration_log (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      // Get actual migration files
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

      // Insert all but the first file
      for (const file of files.slice(1)) {
        await pool.query('INSERT INTO _migration_log (name) VALUES ($1)', [file]);
      }

      const env = {
        ...process.env,
        DATABASE_URL: connectionString,
      };

      try {
        execSync(`node ${scriptPath}`, { env, stdio: 'pipe' });
        expect.fail('Script should have exited with code 1');
      } catch (err: any) {
        expect(err.status).toBe(1);
        expect(err.stderr.toString()).toContain('VERIFICATION FAILED');
        expect(err.stderr.toString()).toContain('not recorded in _migration_log');
      }
    });

    it('should warn about orphaned log entries but exit with code 0', async () => {
      // Create _migration_log table
      await pool.query(`
        CREATE TABLE _migration_log (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      // Get actual migration files
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

      // Insert all files plus an orphaned entry
      for (const file of files) {
        await pool.query('INSERT INTO _migration_log (name) VALUES ($1)', [file]);
      }
      await pool.query('INSERT INTO _migration_log (name) VALUES ($1)', ['9999-orphaned-migration.sql']);

      const env = {
        ...process.env,
        DATABASE_URL: connectionString,
      };

      const output = execSync(`node ${scriptPath}`, { env, encoding: 'utf8' });
      expect(output).toContain('VERIFICATION PASSED');
      expect(output).toContain('WARNING: Orphaned _migration_log entries detected');
      expect(output).toContain('9999-orphaned-migration.sql');
    });
  });

  describe('Ledger consistency logic', () => {
    it('should detect empty migration directory', async () => {
      // Create _migration_log table
      await pool.query(`
        CREATE TABLE _migration_log (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      // Temporarily rename migrations directory
      const tempDir = `${migrationsDir}.tmp`;
      fs.renameSync(migrationsDir, tempDir);
      fs.mkdirSync(migrationsDir);

      try {
        const env = {
          ...process.env,
          DATABASE_URL: connectionString,
        };

        const output = execSync(`node ${scriptPath}`, { env, encoding: 'utf8' });
        expect(output).toContain('Found 0 migration file(s)');
        expect(output).toContain('VERIFICATION PASSED');
      } finally {
        // Restore original directory
        fs.rmdirSync(migrationsDir);
        fs.renameSync(tempDir, migrationsDir);
      }
    });

    it('should handle case-sensitive filename matching', async () => {
      // Create _migration_log table
      await pool.query(`
        CREATE TABLE _migration_log (
          name TEXT PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

      // Insert with different case (should fail verification)
      for (const file of files) {
        await pool.query('INSERT INTO _migration_log (name) VALUES ($1)', [file.toUpperCase()]);
      }

      const env = {
        ...process.env,
        DATABASE_URL: connectionString,
      };

      try {
        execSync(`node ${scriptPath}`, { env, stdio: 'pipe' });
        expect.fail('Script should have exited with code 1');
      } catch (err: any) {
        expect(err.status).toBe(1);
        expect(err.stderr.toString()).toContain('not recorded in _migration_log');
      }
    });
  });
});
