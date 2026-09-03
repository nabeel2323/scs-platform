/**
 * k6 checkout flow load test
 *
 * Simulates full checkout: cart → checkout → order submitted.
 * Target: p95 < 800ms (per §9.3 budget).
 *
 * Usage: k6 run infra/load/checkout.js
 * Gate: p95 < 800ms, error rate < 1%, checkout success > 95%
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const checkoutDuration = new Trend('checkout_duration', true);
const checkoutFailRate = new Rate('checkout_failed');

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // ramp up
    { duration: '1m', target: 50 },    // spike
    { duration: '30s', target: 100 },  // peak
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'],
    checkout_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
    checkout_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

function authenticate(phone) {
  const otpRes = http.post(
    `${BASE_URL}/v1/auth/otp/request`,
    JSON.stringify({ phone }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  const verifyRes = http.post(
    `${BASE_URL}/v1/auth/otp/verify`,
    JSON.stringify({ phone, code: '123456' }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (verifyRes.status === 200 || verifyRes.status === 201) {
    const body = verifyRes.json();
    return body?.accessToken || body?.access_token || '';
  }
  return '';
}

export default function () {
  const phone = `+9665${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;
  const token = authenticate(phone);

  if (!token) {
    checkoutFailRate.add(1);
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  group('Checkout Flow', () => {
    // 1. Get active cart
    const cartRes = http.get(`${BASE_URL}/v1/cart`, { headers });
    check(cartRes, {
      'cart retrieved': (r) => r.status === 200,
    });

    // 2. Add item to cart (if empty)
    const cart = cartRes.json();
    if (!cart?.items || cart.items.length === 0) {
      const addRes = http.post(
        `${BASE_URL}/v1/cart/items`,
        JSON.stringify({
          storeId: __ENV.STORE_ID || '00000000-0000-0000-0000-000000000001',
          variantId: __ENV.VARIANT_ID || '00000000-0000-0000-0000-000000000001',
          quantity: 1,
          priceMinor: 1500,
        }),
        { headers },
      );
      check(addRes, { 'item added to cart': (r) => r.status === 200 || r.status === 201 });
    }

    // 3. Checkout
    const checkoutStart = Date.now();
    const checkoutRes = http.post(
      `${BASE_URL}/v1/checkout`,
      JSON.stringify({
        deliveryAddress: {
          lat: 24.7136,
          lng: 46.6753,
          street: 'Test Street',
          city: 'Riyadh',
        },
        idempotencyKey: `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }),
      { headers },
    );
    checkoutDuration.add(Date.now() - checkoutStart);

    const checkoutOk = check(checkoutRes, {
      'checkout succeeded': (r) => r.status === 200 || r.status === 201,
      'checkout has master order': (r) => {
        const body = r.json();
        return body?.id !== undefined;
      },
    });

    checkoutFailRate.add(!checkoutOk);

    // 4. Verify order exists
    if (checkoutRes.status === 200 || checkoutRes.status === 201) {
      const order = checkoutRes.json();
      const orderRes = http.get(`${BASE_URL}/v1/orders/${order.id}`, { headers });
      check(orderRes, {
        'order retrievable': (r) => r.status === 200,
      });
    }
  });

  sleep(1);
}
