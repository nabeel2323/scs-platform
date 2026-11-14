/**
 * Mock Redis factory with Lua `eval()` simulation for OTP unit tests.
 *
 * Simulates the four atomic Lua scripts used by identity.service.ts.
 * Uses plain async functions (no vi.fn wrapping) for maximum compatibility.
 */

interface StoreEntry {
  value: string;
  ttl: number;
}

export function createMockRedisStore() {
  const store = new Map<string, StoreEntry>();

  // ── Lua script implementations ─────────────────────────────────

  function acquireRateLimit(key: string, maxAttempts: number, windowSec: number): number[] {
    const raw = store.get(key);
    const count = raw ? parseInt(raw.value, 10) : 0;

    if (count >= maxAttempts) {
      const currentTtl = raw ? raw.ttl : -1;
      const ttl = currentTtl > 0 ? currentTtl : windowSec;
      return [0, count, ttl];
    }

    const newCount = count + 1;
    const existingTtl = raw?.ttl;
    store.set(key, {
      value: newCount.toString(),
      ttl: (existingTtl && existingTtl > 0) ? existingTtl : windowSec,
    });

    const finalTtl = store.get(key)!.ttl;
    return [1, newCount, finalTtl];
  }

  function createChallenge(
    key: string,
    challengeId: string,
    otpHash: string,
    salt: string,
    expirySec: number,
    createdAt: string,
  ): number[] {
    const challenge = JSON.stringify({
      ch: challengeId,
      hs: otpHash,
      s: salt,
      ca: createdAt,
      co: false,
    });
    store.set(key, { value: challenge, ttl: expirySec });
    return [1];
  }

  function cleanupChallenge(key: string, challengeId: string): number[] {
    const raw = store.get(key);
    if (!raw) return [0];

    try {
      const challenge = JSON.parse(raw.value);
      if (challenge.ch === challengeId) {
        store.delete(key);
        return [1];
      }
    } catch {
      // corrupt data — don't delete
    }
    return [0];
  }

  function verifyAndConsume(key: string, providedHash: string): number[] {
    const raw = store.get(key);
    if (!raw) return [-1];

    try {
      const challenge = JSON.parse(raw.value);
      if (challenge.co) return [-2];
      if (challenge.hs !== providedHash) return [0];
      store.delete(key);
      return [1];
    } catch {
      return [-1];
    }
  }

  // ── eval dispatch ──────────────────────────────────────────────

  function dispatchEval(
    script: string,
    numKeys: number,
    ...args: (string | number)[]
  ): number[] {
    const keys = args.slice(0, numKeys).map(String);
    const argv = args.slice(numKeys).map(String);

    // Dispatch based on unique patterns in each Lua script's code
    if (script.includes('cjson.encode')) {
      // CREATE_CHALLENGE — the only script that uses cjson.encode
      return createChallenge(
        keys[0]!, argv[0]!, argv[1]!, argv[2]!,
        parseInt(argv[3]!, 10), argv[4]!,
      );
    }
    if (script.includes('remaining')) {
      // ACQUIRE_RATE_LIMIT — the only script that computes 'remaining'
      return acquireRateLimit(keys[0]!, parseInt(argv[0]!, 10), parseInt(argv[1]!, 10));
    }
    if (script.includes('challenge.ch == challengeId')) {
      // CLEANUP_CHALLENGE — the only script that checks challengeId match
      return cleanupChallenge(keys[0]!, argv[0]!);
    }
    if (script.includes('challenge.co')) {
      // VERIFY_AND_CONSUME — the only script that checks consumed flag
      return verifyAndConsume(keys[0]!, argv[0]!);
    }

    throw new Error(`Mock Redis: unrecognized Lua script (first 80 chars: ${script.slice(0, 80)})`);
  }

  // ── Return mock Redis object ───────────────────────────────────

  return {
    client: {
      get: async (key: string) => store.get(key)?.value ?? null,
      set: async (key: string, value: string, _mode?: string, ttl?: number) => {
        store.set(key, { value, ttl: ttl ?? -1 });
        return 'OK' as const;
      },
      del: async (key: string) => (store.delete(key) ? 1 : 0),
      incr: async (key: string) => {
        const existing = store.get(key);
        const newVal = existing ? parseInt(existing.value, 10) + 1 : 1;
        store.set(key, { value: newVal.toString(), ttl: existing?.ttl ?? 900 });
        return newVal;
      },
      expire: async (key: string, seconds: number) => {
        const existing = store.get(key);
        if (existing) existing.ttl = seconds;
        return 1;
      },
      ttl: async (key: string) => {
        const entry = store.get(key);
        if (!entry) return -2;
        return entry.ttl;
      },
      eval: async (script: string, numKeys: number, ...args: (string | number)[]) => {
        return dispatchEval(script, numKeys, ...args);
      },
    },
    _store: store,
  };
}
