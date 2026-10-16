/**
 * P13 Phase 4.1.8 — Defense-in-depth signing exception test.
 *
 * Verifies that a signing exception (createHmac throwing) cannot trigger
 * unsigned delivery. Uses vi.mock to force createHmac to throw.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.hoisted runs before vi.mock — declare the mock function there so it's
// available inside the hoisted vi.mock factory.
const { createHmacMock } = vi.hoisted(() => {
  return { createHmacMock: vi.fn() };
});

// Mock node:crypto BEFORE importing the service — vi.mock is hoisted.
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    createHmac: createHmacMock,
  };
});

// Now import the service — it will use the mocked createHmac.
import { OpsAlertService, UnsignedDeliverySuppressedError } from '../../../modules/operations/ops-alert.service';
import type { DatabaseService } from '../../../common/database/database.service';

const VALID_SECRET = 'a'.repeat(48);

describe('P13 Phase 4.1.8 — signing exception cannot trigger unsigned delivery', () => {
  let mockDb: DatabaseService;

  beforeEach(() => {
    // Minimal mock — the service won't reach the DB for the signing check.
    mockDb = {
      db: {
        execute: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      },
    } as unknown as DatabaseService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('UnsignedDeliverySuppressedError is exported and has the correct name', () => {
    const err = new UnsignedDeliverySuppressedError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('UnsignedDeliverySuppressedError');
    expect(err.message).toBe('test');
  });

  it('createHmac throwing prevents the fetch from being called', async () => {
    // Force createHmac to throw.
    createHmacMock.mockImplementation(() => {
      throw new Error('simulated crypto failure');
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('should not reach fetch'));

    const svc = new OpsAlertService(mockDb);
    // Set valid config — URL + secret both present.
    svc.config.alertWebhookUrl = 'http://127.0.0.1:9999/alerts';
    svc.config.alertWebhookSecret = VALID_SECRET;

    // The deliver() method will:
    // 1. Pass the hasSink check (URL is set)
    // 2. Pass the secret length check (>= 32)
    // 3. Enter the signing try/catch
    // 4. createHmac throws → caught → UnsignedDeliverySuppressedError thrown
    // 5. Outer catch sets failure → FAILED path (no fetch)
    const result = await svc.raise({
      conditionKey: 'p418.signing-exception',
      severity: 'CRITICAL',
      title: 'Signing exception probe',
    });

    // The alert should be FAILED, not SENT.
    expect(result.status).toBe('FAILED');
    // Fetch should never have been called.
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });
});
