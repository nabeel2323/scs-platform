/**
 * k6 smoke test — /healthz + auth flow
 *
 * Usage: k6 run infra/load/smoke.js
 * Gate: p95 < 400ms, error rate < 1%
 */

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<400'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // ── Health check ─────────────────────────────────────────
  const healthRes = http.get(`${BASE_URL}/healthz`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
  });

  // ── OTP request ──────────────────────────────────────────
  const otpRes = http.post(
    `${BASE_URL}/v1/auth/otp/request`,
    JSON.stringify({ phone: '+966500000000' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  check(otpRes, {
    'otp request status is 201': (r) => r.status === 201,
  });

  sleep(1);
}
