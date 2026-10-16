/**
 * P13 Phase 4 — In-process operational counters.
 *
 * Deliberately a plain module and NOT a Nest provider: the code that needs to
 * increment these (AuditService, CommissionReversalService, the guards) lives in
 * modules that must not import OperationsModule, and OperationsModule already
 * imports them. A shared dependency-free module breaks that cycle without
 * introducing a bus, a new DI graph edge, or an external metrics stack.
 *
 * The P13 monitor reads the snapshot once per scan. Because these counters are
 * per-process, they are an alert *input*, not an audit record; anything that has
 * to survive a restart is written to `ops_alerts` instead.
 *
 * NEVER store identifiers with sensitive content here — counts and error codes only.
 */

export type OpsCounterName =
  /** AuditService.insert(audit_logs) threw — critical audit durability failure. */
  | 'audit_write_failures_total'
  | 'audit_write_success_total'
  /** A commission reversal was attempted with an idempotency key that already exists. */
  | 'commission_reversal_duplicate_attempts_total'
  /** A commission reversal threw for a reason other than the idempotency conflict. */
  | 'commission_reversal_failures_total'
  /** Refund issuance/confirmation threw, leaving a return in REFUND_FAILED. */
  | 'refund_operation_failures_total'
  /** A request was denied because P13 pilot enforcement is active and the org is not allowlisted. */
  | 'pilot_eligibility_denials_total'
  /** An object-level tenant check rejected a financial record access. */
  | 'financial_isolation_denials_total'
  /** Alert sink delivery attempted / failed. */
  | 'alert_delivery_attempts_total'
  | 'alert_delivery_failures_total';

interface CounterState {
  value: number;
  lastAt: Date | null;
  lastReason: string | null;
}

const registry = new Map<OpsCounterName, CounterState>();

function state(name: OpsCounterName): CounterState {
  let entry = registry.get(name);
  if (!entry) {
    entry = { value: 0, lastAt: null, lastReason: null };
    registry.set(name, entry);
  }
  return entry;
}

/** Increment a named counter. `reason` is truncated and must not carry PII or secrets. */
export function recordOpsCounter(
  name: OpsCounterName,
  amount = 1,
  reason?: string,
): void {
  const entry = state(name);
  entry.value += amount;
  entry.lastAt = new Date();
  entry.lastReason = reason ? reason.slice(0, 200) : entry.lastReason;
}

/** Current value of a counter (0 if never touched). */
export function getOpsCounter(name: OpsCounterName): number {
  return state(name).value;
}

/** Full snapshot — what the monitor and the ops status endpoint read. */
export function opsCounterSnapshot(): Record<
  string,
  { value: number; lastAt: string | null; lastReason: string | null }
> {
  const out: Record<string, { value: number; lastAt: string | null; lastReason: string | null }> = {};
  for (const [name, entry] of registry) {
    out[name] = {
      value: entry.value,
      lastAt: entry.lastAt ? entry.lastAt.toISOString() : null,
      lastReason: entry.lastReason,
    };
  }
  return out;
}

/** Test-only: reset all counters so specs are order-independent. */
export function resetOpsCounters(): void {
  registry.clear();
}
