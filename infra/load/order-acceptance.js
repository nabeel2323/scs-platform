/**
 * k6 order acceptance flow load test
 *
 * Simulates merchant accepting/rejecting orders, status transitions.
 * Target: p95 < 400ms for read, < 800ms for write.
 *
 * Usage: k6 run infra/load/order-acceptance.js
 * Gate: p95 < 800ms, error rate < 1%
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const acceptFailRate = new Rate('accept_failed');

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
    accept_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

function authenticate(phone) {
  http.post(`${BASE_URL}/v1/auth/otp/request`, JSON.stringify({ phone }),
    { headers: { 'Content-Type': 'application/json' } });
  const verifyRes = http.post(`${BASE_URL}/v1/auth/otp/verify`,
    JSON.stringify({ phone, code: '123456' }),
    { headers: { 'Content-Type': 'application/json' } });
  if (verifyRes.status === 200 || verifyRes.status === 201) {
    return verifyRes.json()?.accessToken || verifyRes.json()?.access_token || '';
  }
  return '';
}

export default function () {
  // Buyer creates order
  const buyerPhone = `+9665${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;
  const buyerToken = authenticate(buyerPhone);
  if (!buyerToken) return;

  const buyerHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${buyerToken}`,
  };

  // Add to cart and checkout
  http.post(`${BASE_URL}/v1/cart/items`, JSON.stringify({
    storeId: __ENV.STORE_ID || '00000000-0000-0000-0000-000000000001',
    variantId: __ENV.VARIANT_ID || '00000000-0000-0000-0000-000000000001',
    quantity: 1,
    priceMinor: 1500,
  }), { headers: buyerHeaders });

  const checkoutRes = http.post(`${BASE_URL}/v1/checkout`, JSON.stringify({
    deliveryAddress: { lat: 24.7136, lng: 46.6753, city: 'Riyadh' },
    idempotencyKey: `oa-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }), { headers: buyerHeaders });

  if (checkoutRes.status !== 200 && checkoutRes.status !== 201) return;

  const masterOrder = checkoutRes.json();

  // Merchant authenticates
  const merchantPhone = `+9665${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;
  const merchantToken = authenticate(merchantPhone);
  if (!merchantToken) return;

  const merchantHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${merchantToken}`,
  };

  group('Order Acceptance Flow', () => {
    // 1. List orders (merchant view)
    const listRes = http.get(
      `${BASE_URL}/v1/orders?storeId=${__ENV.STORE_ID || '00000000-0000-0000-0000-000000000001'}&status=SUBMITTED`,
      { headers: merchantHeaders },
    );
    check(listRes, { 'orders listed': (r) => r.status === 200 });

    // 2. Get order detail
    if (masterOrder?.subOrders?.length > 0) {
      const subOrderId = masterOrder.subOrders[0].id;

      const detailRes = http.get(`${BASE_URL}/v1/orders/${subOrderId}`, { headers: merchantHeaders });
      check(detailRes, { 'order detail retrieved': (r) => r.status === 200 });

      // 3. Accept order
      const acceptStart = Date.now();
      const acceptRes = http.post(
        `${BASE_URL}/v1/orders/${subOrderId}/accept`,
        null,
        { headers: merchantHeaders },
      );
      const acceptOk = check(acceptRes, {
        'order accepted': (r) => r.status === 200,
      });
      acceptFailRate.add(!acceptOk);

      // 4. Status transitions
      if (acceptRes.status === 200) {
        const transitions = ['CONFIRMED', 'PREPARING', 'READY'];
        for (const status of transitions) {
          const statusRes = http.post(
            `${BASE_URL}/v1/orders/${subOrderId}/status`,
            JSON.stringify({ status }),
            { headers: merchantHeaders },
          );
          check(statusRes, {
            [`status → ${status}`]: (r) => r.status === 200,
          });
          sleep(0.2);
        }
      }

      // 5. Get status history
      const historyRes = http.get(`${BASE_URL}/v1/orders/${subOrderId}/history`, { headers: merchantHeaders });
      check(historyRes, {
        'status history retrieved': (r) => r.status === 200,
      });
    }
  });

  sleep(1);
}
