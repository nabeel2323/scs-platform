/**
 * k6 search flow load test
 *
 * Simulates search with filters, category browsing, and product detail views.
 * Target: p95 < 300ms (per §9.3 budget).
 *
 * Usage: k6 run infra/load/search.js
 * Gate: p95 < 300ms, error rate < 1%
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const searchFailRate = new Rate('search_failed');

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 200 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
    search_failed: ['rate<0.02'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Arabic + English search queries
const QUERIES = [
  'arز', 'arز حليب', 'rice', 'milk', 'bread', 'water',
  'chicken', 'oil', 'sugar', 'tea', 'coffee', 'eggs',
  'juice', 'cheese', 'butter', 'yogurt', 'pasta', 'cereal',
  'soap', 'shampoo', 'detergent', 'tissue', 'diapers',
];

function authenticate() {
  const phone = `+9665${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`;
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
  const token = authenticate();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  group('Search Flow', () => {
    // 1. Browse top categories
    const catRes = http.get(`${BASE_URL}/v1/search/categories`, { headers });
    check(catRes, { 'categories loaded': (r) => r.status === 200 });

    // 2. Browse popular brands
    const brandRes = http.get(`${BASE_URL}/v1/search/brands`, { headers });
    check(brandRes, { 'brands loaded': (r) => r.status === 200 });

    // 3. Search with random query
    const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
    const searchRes = http.get(
      `${BASE_URL}/v1/search?q=${encodeURIComponent(query)}&limit=20`,
      { headers },
    );
    const searchOk = check(searchRes, {
      'search returned': (r) => r.status === 200,
      'search has results array': (r) => {
        const body = r.json();
        return Array.isArray(body?.items);
      },
    });
    searchFailRate.add(!searchOk);

    // 4. Search with filters
    const filteredRes = http.get(
      `${BASE_URL}/v1/search?q=${encodeURIComponent(query)}&storeId=${__ENV.STORE_ID || '00000000-0000-0000-0000-000000000001'}&limit=10`,
      { headers },
    );
    check(filteredRes, {
      'filtered search returned': (r) => r.status === 200,
    });

    // 5. SKU exact match (fast path)
    const skuRes = http.get(
      `${BASE_URL}/v1/search?q=SKU-TEST-001`,
      { headers },
    );
    check(skuRes, {
      'SKU search returned': (r) => r.status === 200,
    });
  });

  sleep(0.5);
}
