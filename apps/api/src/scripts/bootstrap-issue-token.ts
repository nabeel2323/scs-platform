/**
 * Operator CLI — issue a short-lived, single-use bootstrap authorization for
 * initial Super Admin provisioning or Super Admin recovery (ADR-0004).
 *
 * Usage:
 *   pnpm --filter @scs/api bootstrap:issue-super-admin-token
 *
 * Environment variables (all required):
 *   DATABASE_URL        PostgreSQL connection string (never printed)
 *   SCS_ENVIRONMENT     Explicitly named target environment:
 *                       development | test | staging | production
 *   SCS_OPERATOR        Name/identifier of the operator issuing the token
 *
 * Flags:
 *   --ttl-seconds       Token lifetime in seconds (default: 86400 = 24h;
 *                       min: 300 = 5min; max: 604800 = 7 days)
 *   --revoke-existing   Revoke any existing unexpired token before issuing
 *   --confirm-production Required when SCS_ENVIRONMENT=production
 *   --purpose           Authorization purpose: super_admin_bootstrap |
 *                       super_admin_recovery (default: super_admin_bootstrap)
 *
 * Security properties:
 *   - Transaction-scoped pg_advisory_xact_lock serializes issuance so
 *     concurrent CLI invocations cannot independently issue multiple valid
 *     tokens.
 *   - Lock acquired before any existence check (Super Admin or token).
 *   - Checks, optional revocation, token insertion, and audit recording all
 *     occur inside the same transaction; rollback on any failure.
 *   - The plaintext token is generated with 256 bits of entropy and shown
 *     exactly once on stdout. It is never stored, logged, or audited.
 *   - Only the SHA-256 digest is persisted in bootstrap_authorizations.
 *   - Refuses to run against an unknown environment, against production
 *     without --confirm-production, when a Super Admin already exists, or
 *     when an unexpired token already exists (unless --revoke-existing).
 *   - Never infers environment from DATABASE_URL; never prints credentials.
 */

import { Client } from 'pg';
import crypto from 'node:crypto';

type Environment = 'development' | 'test' | 'staging' | 'production';

const VALID_ENVIRONMENTS: Environment[] = [
  'development',
  'test',
  'staging',
  'production',
];

type BootstrapPurpose = 'super_admin_bootstrap' | 'super_admin_recovery';

const VALID_PURPOSES: BootstrapPurpose[] = [
  'super_admin_bootstrap',
  'super_admin_recovery',
];

export interface IssueTokenOptions {
  databaseUrl: string;
  environment: Environment;
  operator: string;
  ttlSeconds: number;
  revokeExisting: boolean;
  confirmProduction: boolean;
  purpose: BootstrapPurpose;
}

export interface IssueTokenResult {
  token: string;
  digest: string;
  expiresAt: Date;
  purpose: BootstrapPurpose;
}

function parseEnvironment(raw?: string): Environment {
  if (!raw) {
    throw new Error(
      'SCS_ENVIRONMENT is required. Set it explicitly to one of: ' +
        VALID_ENVIRONMENTS.join(', ') +
        '. Do not infer the environment from DATABASE_URL alone.',
    );
  }
  const env = raw.trim().toLowerCase() as Environment;
  if (!VALID_ENVIRONMENTS.includes(env)) {
    throw new Error(
      `Unknown SCS_ENVIRONMENT "${raw}". Must be one of: ` +
        VALID_ENVIRONMENTS.join(', '),
    );
  }
  return env;
}

function parsePurpose(raw?: string): BootstrapPurpose {
  if (!raw) return 'super_admin_bootstrap';
  const purpose = raw.trim().toLowerCase() as BootstrapPurpose;
  if (!VALID_PURPOSES.includes(purpose)) {
    throw new Error(
      `Invalid --purpose "${raw}". Must be one of: ` +
        VALID_PURPOSES.join(', '),
    );
  }
  return purpose;
}

function parseFlags(argv: string[]): {
  ttlSeconds: number;
  revokeExisting: boolean;
  confirmProduction: boolean;
  purpose: BootstrapPurpose;
} {
  let ttlSeconds = 24 * 60 * 60;
  let revokeExisting = false;
  let confirmProduction = false;
  let purpose: BootstrapPurpose = 'super_admin_bootstrap';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--ttl-seconds') {
      const next = argv[++i];
      if (!next) throw new Error('--ttl-seconds requires a value');
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed < 300) {
        throw new Error('--ttl-seconds must be at least 300 (5 minutes)');
      }
      if (parsed > 604800) {
        throw new Error('--ttl-seconds must not exceed 604800 (7 days)');
      }
      ttlSeconds = parsed;
    } else if (arg === '--revoke-existing') {
      revokeExisting = true;
    } else if (arg === '--confirm-production') {
      confirmProduction = true;
    } else if (arg === '--purpose') {
      const next = argv[++i];
      if (!next) throw new Error('--purpose requires a value');
      purpose = parsePurpose(next);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: pnpm --filter @scs/api bootstrap:issue-super-admin-token

Required env vars:
  DATABASE_URL        PostgreSQL connection string (never printed)
  SCS_ENVIRONMENT     development | test | staging | production
  SCS_OPERATOR        Operator name/identifier

Flags:
  --ttl-seconds       Token lifetime in seconds (default: 86400, min: 300, max: 604800)
  --revoke-existing   Revoke any existing unexpired token before issuing
  --confirm-production Required when SCS_ENVIRONMENT=production
  --purpose           Authorization purpose: super_admin_bootstrap |
                      super_admin_recovery (default: super_admin_bootstrap)

Operator safety:
  - SCS_ENVIRONMENT must be set explicitly; it is never inferred from
    DATABASE_URL.
  - DATABASE_URL is never printed or logged.
  - Production requires --confirm-production.
  - The plaintext token is shown exactly once on stdout and never stored.
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  return { ttlSeconds, revokeExisting, confirmProduction, purpose };
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function tokenDigest(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

const ISSUANCE_ADVISORY_LOCK_KEY = 0x53435343; // 'SCSC'

export async function issueToken(
  options: IssueTokenOptions,
): Promise<IssueTokenResult> {
  const {
    databaseUrl,
    environment,
    operator,
    ttlSeconds,
    revokeExisting,
    confirmProduction,
    purpose,
  } = options;

  if (!VALID_PURPOSES.includes(purpose)) {
    throw new Error(
      `Invalid purpose "${purpose}". Must be one of: ${VALID_PURPOSES.join(', ')}`,
    );
  }

  if (environment === 'production' && !confirmProduction) {
    throw new Error(
      'Refusing to issue a bootstrap token against production without ' +
        '--confirm-production. Use the approved production procedure.',
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query(`SELECT pg_advisory_xact_lock(${ISSUANCE_ADVISORY_LOCK_KEY})`);

    const existingAdmin = await client.query(`
      SELECT COUNT(*)::int AS cnt
      FROM users u
      INNER JOIN organization_members om ON om.user_id = u.id
      INNER JOIN roles r ON r.id = om.role_id
      WHERE u.status = 'ACTIVE'
        AND om.status = 'ACTIVE'
        AND r.key = 'SUPER_ADMIN'
    `);

    if (Number(existingAdmin.rows[0].cnt) > 0) {
      await client.query('ROLLBACK');
      throw new Error(
        'An active Super Admin already exists. Bootstrap/recovery is not ' +
          'available on an initialized platform.',
      );
    }

    const existingToken = await client.query(`
      SELECT COUNT(*)::int AS cnt
      FROM bootstrap_authorizations
      WHERE consumed = FALSE
        AND expires_at > NOW()
    `);

    if (Number(existingToken.rows[0].cnt) > 0 && !revokeExisting) {
      await client.query('ROLLBACK');
      throw new Error(
        'An unexpired bootstrap authorization already exists. ' +
          'Use --revoke-existing to revoke it and issue a new one.',
      );
    }

    if (revokeExisting) {
      await client.query(`
        UPDATE bootstrap_authorizations
        SET consumed = TRUE, consumed_at = NOW()
        WHERE consumed = FALSE
          AND expires_at > NOW()
      `);
    }

    const plaintextToken = generateToken();
    const digest = tokenDigest(plaintextToken);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const tokenId = crypto.randomUUID();

    await client.query(`
      INSERT INTO bootstrap_authorizations (
        id, token_digest, expires_at, consumed, purpose, created_by, created_at
      )
      VALUES ($1, $2, $3, FALSE, $4, $5, NOW())
    `, [tokenId, digest, expiresAt, purpose, operator]);

    await client.query(`
      INSERT INTO audit_logs (
        id, actor_type, actor_id, action, resource, resource_id, org_id,
        metadata, ip, user_agent, created_at
      )
      VALUES ($1, 'SYSTEM', NULL, 'auth.bootstrap.token_issued', 'auth', NULL, NULL,
              $2, NULL, NULL, NOW())
    `, [
      crypto.randomUUID(),
      JSON.stringify({
        environment,
        operator,
        purpose,
        expiresAt: expiresAt.toISOString(),
      }),
    ]);

    await client.query('COMMIT');

    return { token: plaintextToken, digest, expiresAt, purpose };
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));

  const environment = parseEnvironment(process.env['SCS_ENVIRONMENT']);
  const databaseUrl = process.env['DATABASE_URL'];
  const operator = process.env['SCS_OPERATOR'];

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  if (!operator) {
    throw new Error('SCS_OPERATOR is required — identify the operator issuing the token');
  }

  if (environment === 'production' && !flags.confirmProduction) {
    throw new Error(
      'Refusing to issue a bootstrap token against production without ' +
        '--confirm-production. Use the approved production procedure.',
    );
  }

  console.log(`=== Bootstrap Token Issuance ===`);
  console.log(`Environment: ${environment}`);
  console.log(`Operator:    ${operator}`);
  console.log(`Purpose:     ${flags.purpose}`);
  console.log(`TTL:         ${flags.ttlSeconds}s`);
  console.log('');

  const result = await issueToken({
    databaseUrl,
    environment,
    operator,
    ttlSeconds: flags.ttlSeconds,
    revokeExisting: flags.revokeExisting,
    confirmProduction: flags.confirmProduction,
    purpose: flags.purpose,
  });

  console.log('');
  console.log('========================================');
  console.log('BOOTSTRAP AUTHORIZATION ISSUED');
  console.log('========================================');
  console.log('');
  console.log('Token (show once, never store):');
  console.log(result.token);
  console.log('');
  console.log('Expires at:  ' + result.expiresAt.toISOString());
  console.log('Environment: ' + environment);
  console.log('Purpose:     ' + result.purpose);
  console.log('');
  console.log('Provide this token to the administrator completing');
  console.log('setup via the Admin application.');
  console.log('It is single-use and expires at the time above.');
  console.log('');
}

const isMainScript = typeof process !== 'undefined'
  && process.argv[1]
  && process.argv[1].includes('bootstrap-issue-token.ts');

if (isMainScript) {
  main().catch((err: Error) => {
    console.error('\nBOOTSTRAP TOKEN ISSUANCE FAILED:', err.message);
    process.exit(1);
  });
}
