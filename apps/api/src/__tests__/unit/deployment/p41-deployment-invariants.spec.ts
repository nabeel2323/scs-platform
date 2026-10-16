/**
 * P13 Phase 4.1 — deployment-artifact invariants.
 *
 * Why these tests exist at all: Phase 4 discovered that work described as completed in
 * its own reports was absent from the working tree (the CI gate edits were lost), and
 * that `app.enableShutdownHooks()` — without which the lease-release-on-shutdown path
 * never runs — had never actually been added. Both were invisible to every existing
 * test. This file is the guard that turns that class of silent loss into a failing
 * assertion.
 *
 * The static checks parse the real files in `infra/`; the behavioural checks exercise the
 * pure config gate. Nothing here needs PostgreSQL, Redis, or Docker.
 */

import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DEV_DATABASE_URL,
  DEV_REDIS_URL,
  INSECURE_DEV_SECRET,
  assertJwtConfig,
  assertProductionConfig,
  describeAlertSink,
  isProductionLikeEnv,
  resolveDatabaseUrl,
  resolveRedisUrl,
} from '../../../config/env-gate';
import { resolveP13OpsConfig } from '../../../modules/operations/p13-ops.config';

/**
 * Walk up from the test's working directory to find the repository root. Vitest runs
 * with cwd = apps/api; the root is the first ancestor holding pnpm-workspace.yaml.
 * Deliberately avoids `__dirname` (not guaranteed under the ESM module runner) and
 * avoids a hard-coded `../../../..` depth that breaks when a spec moves directory.
 */
function repoRoot(): string {
  let dir = process.cwd();
  for (let up = 0; up < 8; up++) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate repository root (pnpm-workspace.yaml) from ${process.cwd()}`);
}

const ROOT = repoRoot();
const read = (rel: string): string => readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * The `HEALTHCHECK` instruction and its continued CMD line, and nothing else.
 *
 * Written as a line walk rather than a regex because the `m` flag makes `$` match at
 * the end of every line, which silently truncates a multi-line instruction to its first
 * line. Dockerfiles also use the word in comments, so this anchors on line start.
 */
function healthcheckBlock(text: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith('HEALTHCHECK'));
  if (start === -1) return '';
  const out: string[] = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim() === '') break;
    out.push(line);
  }
  return out.join('\n');
}

const MAIN_TS = 'apps/api/src/main.ts';
const WORKER_TS = 'apps/api/src/modules/returns/return-expiration.worker.ts';
const COMPOSE_PROD = 'infra/docker-compose.prod.yml';
const COMPOSE_DEV = 'infra/docker-compose.dev.yml';
const ENV_TEMPLATE = 'infra/deploy/.env.production.example';
const DOCKERIGNORE = '.dockerignore';
const API_DOCKERFILE = 'infra/deploy/api.Dockerfile';
const WEB_DOCKERFILE = 'infra/deploy/web.Dockerfile';
const ADMIN_DOCKERFILE = 'infra/deploy/admin.Dockerfile';
const DOCKERFILES = [API_DOCKERFILE, WEB_DOCKERFILE, ADMIN_DOCKERFILE];

describe('P13 Phase 4.1 — graceful shutdown wiring', () => {
  it('enables Nest shutdown hooks, before the process starts listening', () => {
    const src = read(MAIN_TS);
    // Without this, `onModuleDestroy` never fires on SIGTERM/SIGINT and a container
    // stop leaves worker_leases pointing at a dead holder until the TTL expires.
    expect(src).toMatch(/app\.enableShutdownHooks\(\)/);
    const hooksAt = src.indexOf('app.enableShutdownHooks()');
    const listenAt = src.indexOf('.listen(');
    expect(listenAt).toBeGreaterThan(-1);
    expect(hooksAt).toBeLessThan(listenAt);
  });

  it('releases the lease from an awaited onModuleDestroy with a bounded wait', () => {
    const src = read(WORKER_TS);
    // `async onModuleDestroy` + `await` is the fix; the fire-and-forget version made
    // release timing unobservable and unverifiable.
    expect(src).toMatch(/async\s+onModuleDestroy\s*\(/);
    expect(src).toMatch(/await\s+Promise\.race/);
    // The guard must not keep the process alive on its own.
    expect(src).toMatch(/\.unref\(\)/);
  });

  it('keeps every application image in exec form so Node receives SIGTERM as PID 1', () => {
    for (const file of DOCKERFILES) {
      const dockerfile = read(file);
      const cmd = dockerfile.match(/^CMD\s+(.*)$/m);
      // Shell form (`CMD node x`) puts /bin/sh as PID 1 and swallows SIGTERM.
      expect(cmd, `${file} must declare a CMD`).not.toBeNull();
      expect(cmd?.[1]?.trim(), `${file} CMD must be exec form`).toMatch(/^\[.*\]$/);
    }
  });
});

describe('P13 Phase 4.1 — production configuration gate', () => {
  it('treats only development and test as exempt from production rules', () => {
    expect(isProductionLikeEnv('development')).toBe(false);
    expect(isProductionLikeEnv('test')).toBe(false);
    expect(isProductionLikeEnv(undefined)).toBe(false);
    for (const env of ['production', 'staging', ' Production ', 'prod']) {
      expect(isProductionLikeEnv(env)).toBe(true);
    }
  });

  it('requires DATABASE_URL outside development instead of using the dev DSN', () => {
    expect(resolveDatabaseUrl({ nodeEnv: 'development' })).toBe(DEV_DATABASE_URL);
    expect(resolveDatabaseUrl({ nodeEnv: 'test' })).toBe(DEV_DATABASE_URL);
    expect(resolveDatabaseUrl({ nodeEnv: 'production', url: ' postgres://x/y ' })).toBe(
      'postgres://x/y',
    );
    expect(() => resolveDatabaseUrl({ nodeEnv: 'production' })).toThrow(/DATABASE_URL/);
    // The message must not quote the credential it is refusing to use.
    try {
      resolveDatabaseUrl({ nodeEnv: 'production' });
      throw new Error('expected throw');
    } catch (err) {
      expect(String(err)).not.toContain('scs_dev_2026');
    }
  });

  it('requires REDIS_URL outside development', () => {
    expect(resolveRedisUrl({ nodeEnv: 'test' })).toBe(DEV_REDIS_URL);
    expect(resolveRedisUrl({ nodeEnv: 'production', url: 'redis://cache:6379' })).toBe(
      'redis://cache:6379',
    );
    expect(() => resolveRedisUrl({ nodeEnv: 'production' })).toThrow(/REDIS_URL/);
  });

  it('classifies the alert sink without ever exposing the URL', () => {
    expect(describeAlertSink(undefined)).toEqual({ configured: false, channel: 'log-only' });
    expect(describeAlertSink('   ')).toEqual({ configured: false, channel: 'log-only' });

    const secret = 'https://hooks.example.test/svc/ SuperSecretToken123'.replace(' ', '');
    const status = describeAlertSink(secret);
    expect(status.channel).toBe('webhook');
    expect(status.invalidReason).toBeUndefined();
    // The whole point: nothing that looks like the URL may leak into the summary.
    expect(JSON.stringify(status)).not.toContain('SuperSecretToken123');
    expect(JSON.stringify(status)).not.toContain('example.test');

    expect(describeAlertSink('not-a-url').invalidReason).toBe('not_absolute_url');
    expect(describeAlertSink('ftp://hooks.example.test/x').invalidReason).toBe(
      'unsupported_protocol',
    );
    // Credentials in userinfo are rejected rather than echoed.
    const withAuth = describeAlertSink('https://user: pass@hooks.example.test/x'.replace(' ', ''));
    expect(withAuth.invalidReason).toBe('unsupported_protocol');
    expect(JSON.stringify(withAuth)).not.toContain('pass');
  });

  it('boots cleanly with a valid production configuration and returns only a channel', () => {
    const sink = assertProductionConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://db/app',
      REDIS_URL: 'redis://cache:6379',
      JWT_ACCESS_SECRET: 'a-production-secret-of-32-chars',
      P13_OPS_ALERT_WEBHOOK_URL: 'https://alerts.example.test/p13',
    });
    expect(sink).toEqual({ configured: true, channel: 'webhook' });
  });

  it('refuses to start when the alert sink is configured but undeliverable', () => {
    expect(() =>
      assertProductionConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://db/app',
        REDIS_URL: 'redis://cache:6379',
        JWT_ACCESS_SECRET: 'a-production-secret-of-32-chars',
        P13_OPS_ALERT_WEBHOOK_URL: 'broken-url',
      }),
    ).toThrow(/P13_OPS_ALERT_WEBHOOK_URL/);
  });

  it('is inert in development so local tooling and existing specs do not need secrets', () => {
    expect(() => assertProductionConfig({ NODE_ENV: 'development' })).not.toThrow();
    expect(assertProductionConfig({ NODE_ENV: 'development' }).channel).toBe('log-only');
  });

  it('still rejects the insecure JWT default through the same gate', () => {
    expect(() =>
      assertJwtConfig({ NODE_ENV: 'production', JWT_ACCESS_SECRET: INSECURE_DEV_SECRET }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });
});

describe('P13 Phase 4.1 — default configuration cannot activate P13', () => {
  it('disables the worker and legacy pilot mode with an empty environment', () => {
    const cfg = resolveP13OpsConfig({});
    expect(cfg.workerEnabled).toBe(false);
    expect(cfg.pilotMode).toBe('legacy');
    expect(cfg.alertWebhookUrl).toBeNull();
  });

  it('stays disabled under a production NODE_ENV with no P13_* variables at all', () => {
    const cfg = resolveP13OpsConfig({ NODE_ENV: 'production' });
    expect(cfg.workerEnabled).toBe(false);
    expect(cfg.pilotMode).toBe('legacy');
  });

  it('only enables the worker on an explicit truthy value', () => {
    for (const value of ['true', '1', 'yes', 'TRUE']) {
      expect(resolveP13OpsConfig({ P13_WORKER_ENABLED: value }).workerEnabled).toBe(true);
    }
    // Anything else — including typos and empty strings — must not enable it.
    for (const value of ['', 'false', '0', 'ture', 'enabled', 'on']) {
      expect(resolveP13OpsConfig({ P13_WORKER_ENABLED: value }).workerEnabled).toBe(false);
    }
  });

  it('only enters allowlist mode on that exact value', () => {
    expect(resolveP13OpsConfig({ P13_PILOT_MODE: 'allowlist' }).pilotMode).toBe('allowlist');
    for (const value of ['', 'legacy', 'ALOWLIST', 'on']) {
      expect(resolveP13OpsConfig({ P13_PILOT_MODE: value }).pilotMode).toBe('legacy');
    }
  });

  it('clamps the heartbeat below half the lease TTL no matter what is configured', () => {
    // A heartbeat slower than the TTL lets the lease expire while the holder is alive,
    // which is how two instances could both believe they own the job.
    const cfg = resolveP13OpsConfig({
      P13_WORKER_LEASE_TTL_SECONDS: '60',
      P13_WORKER_HEARTBEAT_INTERVAL_MS: '300000',
    });
    expect(cfg.heartbeatIntervalMs).toBeLessThanOrEqual(60_000 * 0.5);
  });
});

describe('P13 Phase 4.1 — container build hygiene', () => {
  it.each(DOCKERFILES)('%s bakes no secret and pins the CI toolchain', (file) => {
    const dockerfile = read(file);
    // No credential-shaped build arguments.
    for (const arg of dockerfile.match(/^ARG\s+([A-Z_]+)/gm) ?? []) {
      const name = arg.replace(/^ARG\s+/, '');
      expect(name).not.toMatch(/SECRET|PASSWORD|TOKEN|ACCESS_KEY|_KEY$/);
    }
    expect(dockerfile).not.toMatch(/^COPY\s+.*\.env/m);
    expect(dockerfile).not.toMatch(/RUN\s+.*export\s+[A-Z_]*(SECRET|PASSWORD|TOKEN)/);
    // Reproducibility must match CI exactly.
    expect(dockerfile).toContain('FROM node:22-slim');
    expect(dockerfile).toContain('pnpm@9.15.9');
    expect(dockerfile).toContain('--frozen-lockfile');
    // And it must not depend on the host store that Phase 4 found corrupted on Windows.
    expect(dockerfile).not.toMatch(/COPY\s+node_modules/);
  });

  it('healthchecks the API on the versioned liveness route, not readiness', () => {
    const dockerfile = read(API_DOCKERFILE);
    expect(dockerfile).toMatch(/HEALTHCHECK/);
    // Scoped to the HEALTHCHECK instruction itself (anchored at line start, because
    // the file also mentions the word in a comment): the surrounding documentation
    // explains why readiness is probed at the orchestrator level, so a whole-file
    // string check would fail on correct comments.
    const health = healthcheckBlock(dockerfile);
    expect(health, 'no HEALTHCHECK instruction found').not.toBe('');
    expect(health).toContain('/v1/healthz');
    // /readyz touches Postgres and Redis; probing it for liveness would get a healthy
    // process killed during a dependency blip.
    expect(health).not.toContain('/v1/readyz');
  });

  it('ships the migration directory inside the API image so schema and code travel together', () => {
    const dockerfile = read(API_DOCKERFILE);
    expect(dockerfile).toContain('infra/drizzle/migrations');
  });

  it('excludes credentials, host dependencies and dumps from every build context', () => {
    const ignore = read(DOCKERIGNORE);
    for (const required of [
      'node_modules/',
      '.env',
      '.env.*',
      '*.pem',
      '*.key',
      '*.dump',
      '.next/',
      'test-token.txt',
      'apps/scs-platform-b2-test/',
    ]) {
      expect(ignore, `.dockerignore must exclude ${required}`).toContain(required);
    }
    // Deliberately stricter than the pre-4.1 default: no env file, example or not.
    expect(ignore).not.toMatch(/^!\.env\.example$/m);
  });
});

describe('P13 Phase 4.1 — production Compose safety posture', () => {
  const compose = read(COMPOSE_PROD);

  it('contains none of the development credentials', () => {
    // The dev stack's values must never be reachable as fallbacks in the prod file.
    expect(compose).not.toContain('scs_dev_2026');
    expect(compose).not.toContain('scs_minio_2026');
    expect(compose).not.toContain(INSECURE_DEV_SECRET);
    expect(compose).not.toContain('dev-access-secret');
    // No trust auth: that is how a password-less Postgres happens. Checked as a YAML
    // key, because the file's own comment explains why the key is absent.
    expect(compose).not.toMatch(/^\s*POSTGRES_HOST_AUTH_METHOD\s*:/m);
  });

  it('requires every credential through interpolation rather than defaulting it', () => {
    for (const variable of [
      'POSTGRES_PASSWORD',
      'REDIS_PASSWORD',
      'S3_ACCESS_KEY',
      'S3_SECRET_KEY',
      'JWT_ACCESS_SECRET',
      'API_CORS_ORIGINS',
    ]) {
      expect(compose, `${variable} must be mandatory`).toContain(`${variable}:?`);
      expect(compose, `${variable} must not have a default`).not.toMatch(
        new RegExp(`\\$\\{${variable}:-`),
      );
    }
  });

  it('hard-codes the worker off on the shared API environment block', () => {
    // It must be a literal, not a variable an operator can set wrong in a shared file.
    expect(compose).toContain('P13_WORKER_ENABLED: "false"');
    // And the only "true" in the file belongs to the profile-gated worker service.
    const trues = compose.match(/P13_WORKER_ENABLED:\s*"true"/g) ?? [];
    expect(trues).toHaveLength(1);
  });

  it('keeps the worker behind a Compose profile so a plain `up` cannot start it', () => {
    const workerStart = compose.indexOf('\n  worker:');
    const webStart = compose.indexOf('\n  web:');
    const workerBlock = compose.slice(workerStart, webStart > workerStart ? webStart : undefined);
    expect(workerBlock).toMatch(/profiles:\s*\[\s*"p13-worker"\s*\]/);
    // The API service must not carry that profile or enable the flag.
    const apiBlock = compose.slice(compose.indexOf('\n  api:'), workerStart);
    expect(apiBlock).not.toMatch(/P13_WORKER_ENABLED:\s*"true"/);
    expect(apiBlock).not.toMatch(/profiles:/);
  });

  it('defaults pilot enforcement to legacy', () => {
    expect(compose).toMatch(/P13_PILOT_MODE:\s*\$\{P13_PILOT_MODE:-legacy\}/);
    expect(compose).not.toContain('P13_PILOT_MODE:-allowlist');
  });

  it('runs migrations as a one-shot gate the API tier waits on', () => {
    expect(compose).toMatch(/migrate:\s*\n\s*build:/);
    expect(compose).toMatch(/restart:\s*"no"/);
    expect(compose).toContain('condition: service_completed_successfully');
    // No application replica may run migrations itself.
    const apiBlock = compose.slice(compose.indexOf('\n  api:'), compose.indexOf('\n  worker:'));
    expect(apiBlock).not.toMatch(/migrate-pg\.ts/);
    // Nothing in this file may run a per-replica entrypoint migration.
    expect(compose).not.toMatch(/entrypoint:.*migrate/);
  });

  it('gives the API tier more stop time than the lease-release guard needs', () => {
    expect(compose).toMatch(/stop_grace_period:\s*30s/);
    expect(compose).toMatch(/init:\s*true/);
  });

  it('scales the API tier instead of assuming a single process', () => {
    expect(compose).toMatch(/replicas:\s*\$\{API_REPLICAS:-2\}/);
    // Two replicas cannot share a published host port, so the API tier publishes none.
    const apiBlock = compose.slice(compose.indexOf('\n  api:'), compose.indexOf('\n  worker:'));
    expect(apiBlock).not.toMatch(/^\s{4}ports:/m);
  });

  it('authenticates Redis, which carries the token denylist', () => {
    expect(compose).toMatch(/--requirepass/);
    expect(compose).toMatch(/REDIS_URL:\s*redis:\/\/:\$\{REDIS_PASSWORD/);
  });
});

describe('P13 Phase 4.1 — environment template carries no secrets', () => {
  const template = read(ENV_TEMPLATE);

  it('documents every boot-blocking variable with a placeholder value', () => {
    const assignments = template
      .split(/\r?\n/)
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => line.slice(0, line.indexOf('=')));
    for (const required of [
      'JWT_ACCESS_SECRET',
      'POSTGRES_PASSWORD',
      'REDIS_PASSWORD',
      'S3_ACCESS_KEY',
      'S3_SECRET_KEY',
      'API_CORS_ORIGINS',
      'PUBLIC_API_URL',
      'P13_PILOT_MODE',
      'P13_EXPECTED_WORKER_COUNT',
      'P13_OPS_ALERT_WEBHOOK_URL',
    ]) {
      expect(assignments, `template must define ${required}`).toContain(required);
    }
  });

  it('contains no real credential and no working default for one', () => {
    expect(template).not.toContain('scs_dev_2026');
    expect(template).not.toContain('scs_minio_2026');
    // Secret-bearing lines must be placeholders an operator has to replace.
    for (const line of template.split(/\r?\n/)) {
      if (!/^(JWT_ACCESS_SECRET|POSTGRES_PASSWORD|REDIS_PASSWORD|S3_ACCESS_KEY|S3_SECRET_KEY)=/.test(line)) {
        continue;
      }
      expect(line).toMatch(/__REPLACE_ME/);
    }
    // The well-known dev JWT default may appear only as a warning in a comment, never
    // as a value — naming it is useful, shipping it as usable would not be.
    for (const line of template.split(/\r?\n/)) {
      if (line.includes(INSECURE_DEV_SECRET)) {
        expect(line.trimStart().startsWith('#'), `not a comment: ${line}`).toBe(true);
      }
    }
  });

  it('leaves the alert webhook unset rather than pointing at a repository host', () => {
    expect(template).toMatch(/^P13_OPS_ALERT_WEBHOOK_URL=$/m);
    expect(template).not.toMatch(/hooks\.|webhook\.app|slack\.com/);
  });

  it('is reachable by the documented copy command', () => {
    expect(existsSync(path.join(ROOT, 'infra', 'deploy', '.env.production.example'))).toBe(true);
    // .dockerignore excludes every .env variant, so this file must not be baked into
    // an image — it is a repository artifact for operators.
    expect(read(DOCKERIGNORE)).toContain('**/.env.*');
  });
});

describe('P13 Phase 4.1 — the dev-only stack is not silently reused', () => {
  it('keeps docker-compose.dev.yml as infrastructure only', () => {
    const dev = read(COMPOSE_DEV);
    // The dev file builds no application images; if that changes, the prod-like file's
    // reason to exist needs re-examining rather than copying.
    expect(dev).not.toMatch(/dockerfile:/);
    expect(dev).not.toMatch(/P13_WORKER_ENABLED/);
  });
});
