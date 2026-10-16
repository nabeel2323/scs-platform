/**
 * P13 Phase 4 — Operational configuration.
 *
 * Single place where the P13 operational env vars are parsed and defaulted, so
 * that "fail closed" is a property of the code rather than of a particular
 * deployment's .env file. Every default below is the safe one:
 *
 *   - the worker is OFF unless explicitly enabled
 *   - pilot enforcement is OFF (legacy behaviour) unless explicitly switched to
 *     `allowlist`, at which point an unreadable/empty allowlist denies everything
 *   - alert delivery falls back to log-only when no sink is configured
 *
 * `resolveP13OpsConfig()` is called per service construction; tests can pass an
 * explicit overrides object instead of mutating process.env.
 */

/** The single protected P13 background job guarded by the lease. */
export const P13_LEASE_KEY = 'p13-return-expiration';

/** The single durable control that pauses P13 background processing. */
export const P13_PAUSE_CONTROL_KEY = 'p13.worker.paused';

/** feature_flags key that turns pilot allowlist enforcement on. */
export const P13_PILOT_FLAG_KEY = 'p13.pilot.enabled';

export type P13PilotMode = 'legacy' | 'allowlist';

export interface P13OpsConfig {
  /** Master switch for protected P13 background jobs. Default: disabled. */
  workerEnabled: boolean;
  pollIntervalMs: number;
  /** Delay before the first tick, so boot initialisation is not competing with work. */
  startupDelayMs: number;
  /** How long a lease stays valid without a heartbeat. */
  leaseTtlSeconds: number;
  /** How often the holder renews its lease (must be < leaseTtlSeconds). */
  heartbeatIntervalMs: number;
  /** How often a standby worker retries acquisition after losing/handing over. */
  acquireRetryMs: number;
  /** Expected number of worker-enabled instances; drives the count-anomaly alert. */
  expectedWorkerCount: number;
  /** Monitor scan cadence. */
  monitorIntervalMs: number;
  /** Alert sink. Empty => log-only (documented limitation, never a silent drop). */
  alertWebhookUrl: string | null;
  /**
   * HMAC-SHA256 secret for signing outbound webhook payloads.
   * When a webhook URL is configured, a secret of at least 32 characters is required.
   * If the secret is missing or too short, delivery is refused (fail closed) —
   * unsigned alerts are never sent.
   */
  alertWebhookSecret: string | null;
  alertDeliveryTimeoutMs: number;
  /** Re-notification window for an already-SENT alert with the same dedup key. */
  alertRepeatWindowMs: number;
  /**
   * Maximum age (seconds) of a webhook timestamp before receivers should reject it.
   * Used by the signing module for replay protection. Default: 300 (5 minutes).
   */
  alertFreshnessWindowSeconds: number;
  pilotMode: P13PilotMode;
  /** Thresholds used by the monitor's checks. */
  thresholds: {
    pollFailureAlertCount: number;
    heartbeatStaleMs: number;
    requestedStaleMs: number;
    refundStuckMs: number;
  };
}

const DEFAULTS = {
  workerEnabled: false,
  pollIntervalMs: 120_000,
  startupDelayMs: 45_000,
  leaseTtlSeconds: 90,
  heartbeatIntervalMs: 30_000,
  acquireRetryMs: 20_000,
  expectedWorkerCount: 1,
  monitorIntervalMs: 60_000,
  alertDeliveryTimeoutMs: 5_000,
  alertRepeatWindowMs: 15 * 60_000,
  alertFreshnessWindowSeconds: 300,
  pilotMode: 'legacy' as P13PilotMode,
  pollFailureAlertCount: 3,
  heartbeatStaleMs: 5 * 60_000,
  requestedStaleMs: 10 * 60_000,
  refundStuckMs: 30 * 60_000,
};

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** `'true'`/`'1'`/`'yes'` enable; anything else (including garbage) does not. */
function boolFalseDefault(value: string | undefined): boolean {
  return ['true', '1', 'yes'].includes((value ?? '').trim().toLowerCase());
}

export function resolveP13OpsConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<P13OpsConfig> = {},
): P13OpsConfig {
  const pilotModeRaw = (env['P13_PILOT_MODE'] ?? DEFAULTS.pilotMode).trim().toLowerCase();
  const pilotMode: P13PilotMode = pilotModeRaw === 'allowlist' ? 'allowlist' : 'legacy';

  const config: P13OpsConfig = {
    workerEnabled: boolFalseDefault(env['P13_WORKER_ENABLED']),
    pollIntervalMs: int(
      // Keep the Phase 2/3 variable working so existing deployments do not change behaviour.
      env['P13_WORKER_POLL_INTERVAL_MS'] ?? env['RETURN_EXPIRATION_POLL_INTERVAL_MS'],
      DEFAULTS.pollIntervalMs,
    ),
    leaseTtlSeconds: int(env['P13_WORKER_LEASE_TTL_SECONDS'], DEFAULTS.leaseTtlSeconds),
    startupDelayMs: int(env['P13_WORKER_STARTUP_DELAY_MS'], DEFAULTS.startupDelayMs),
    heartbeatIntervalMs: int(
      env['P13_WORKER_HEARTBEAT_INTERVAL_MS'],
      DEFAULTS.heartbeatIntervalMs,
    ),
    acquireRetryMs: int(env['P13_WORKER_ACQUIRE_RETRY_MS'], DEFAULTS.acquireRetryMs),
    expectedWorkerCount: int(env['P13_WORKER_EXPECTED_COUNT'], DEFAULTS.expectedWorkerCount),
    monitorIntervalMs: int(env['P13_MONITOR_INTERVAL_MS'], DEFAULTS.monitorIntervalMs),
    alertWebhookUrl: (env['P13_OPS_ALERT_WEBHOOK_URL'] ?? '').trim() || null,
    alertWebhookSecret: (env['P13_OPS_ALERT_WEBHOOK_SECRET'] ?? '').trim() || null,
    alertDeliveryTimeoutMs: int(
      env['P13_ALERT_DELIVERY_TIMEOUT_MS'],
      DEFAULTS.alertDeliveryTimeoutMs,
    ),
    alertRepeatWindowMs: int(env['P13_ALERT_REPEAT_WINDOW_MS'], DEFAULTS.alertRepeatWindowMs),
    alertFreshnessWindowSeconds: int(
      env['P13_ALERT_FRESHNESS_WINDOW_SECONDS'],
      DEFAULTS.alertFreshnessWindowSeconds,
    ),
    pilotMode,
    thresholds: {
      pollFailureAlertCount: int(
        env['P13_ALERT_POLL_FAILURE_THRESHOLD'],
        DEFAULTS.pollFailureAlertCount,
      ),
      heartbeatStaleMs: int(env['P13_ALERT_HEARTBEAT_STALE_MS'], DEFAULTS.heartbeatStaleMs),
      requestedStaleMs: int(env['P13_ALERT_REQUESTED_STALE_MS'], DEFAULTS.requestedStaleMs),
      refundStuckMs: int(env['P13_ALERT_REFUND_STUCK_MS'], DEFAULTS.refundStuckMs),
    },
  };

  const merged = { ...config, ...overrides };

  // A heartbeat cadence at or beyond the TTL would let the lease expire while the
  // holder is healthy — two workers could then both believe they own it. Clamp it.
  const heartbeatCeilingMs = merged.leaseTtlSeconds * 1000 * 0.5;
  if (merged.heartbeatIntervalMs > heartbeatCeilingMs) {
    merged.heartbeatIntervalMs = Math.max(1_000, Math.floor(heartbeatCeilingMs));
  }

  // Fail closed: when a webhook URL is configured but the signing secret is
  // missing or too short, null out the URL so delivery falls back to log-only.
  // Unsigned alerts are never sent to an external sink.
  if (merged.alertWebhookUrl && (!merged.alertWebhookSecret || merged.alertWebhookSecret.length < 32)) {
    merged.alertWebhookSecret = null;
    merged.alertWebhookUrl = null;
  }

  return merged;
}
