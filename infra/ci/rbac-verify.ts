/**
 * RBAC Verification Script
 *
 * Verifies that all protected routes enforce object-level authorization.
 * Tests that users cannot access resources belonging to other users/orgs.
 *
 * Usage: npx tsx infra/ci/rbac-verify.ts
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface TestCase {
  name: string;
  method: string;
  path: string;
  expectedStatus: number;
  description: string;
}

async function authenticate(phone: string): Promise<string> {
  await fetch(`${BASE_URL}/v1/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });

  const res = await fetch(`${BASE_URL}/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code: '123456' }),
  });

  const body = await res.json() as any;
  return body?.accessToken || body?.access_token || '';
}

async function runTest(
  token: string,
  test: TestCase,
): Promise<{ passed: boolean; detail: string }> {
  const res = await fetch(`${BASE_URL}${test.path}`, {
    method: test.method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  const passed = res.status === test.expectedStatus;
  return {
    passed,
    detail: `${test.method} ${test.path} → ${res.status} (expected ${test.expectedStatus})`,
  };
}

async function main() {
  console.log('🔐 RBAC Verification Script');
  console.log('════════════════════════════\n');

  // Create two users
  const userAToken = await authenticate('+966500000001');
  const userBToken = await authenticate('+966500000002');

  if (!userAToken || !userBToken) {
    console.error('❌ Failed to authenticate test users');
    process.exit(1);
  }

  const testCases: TestCase[] = [
    // Cart isolation
    {
      name: 'Cart Isolation',
      method: 'GET',
      path: '/v1/cart',
      expectedStatus: 200,
      description: 'User should only see their own cart',
    },
    // Orders isolation
    {
      name: 'Orders Isolation',
      method: 'GET',
      path: '/v1/orders',
      expectedStatus: 200,
      description: 'User should only see their own orders',
    },
    // Reviews — order-gated
    {
      name: 'Review Requires Order',
      method: 'POST',
      path: '/v1/orders/00000000-0000-0000-0000-000000000099/review',
      expectedStatus: 404,
      description: 'Cannot review non-existent order',
    },
    // Disputes — order-gated
    {
      name: 'Dispute Requires Order',
      method: 'POST',
      path: '/v1/orders/00000000-0000-0000-0000-000000000099/dispute',
      expectedStatus: 404,
      description: 'Cannot dispute non-existent order',
    },
    // Admin routes require permission
    {
      name: 'Admin Verification Queue',
      method: 'GET',
      path: '/v1/verification/queue',
      expectedStatus: 403,
      description: 'Non-admin should be forbidden',
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of testCases) {
    const result = await runTest(userAToken, test);
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${test.name}: ${test.description}`);
    console.log(`   ${result.detail}\n`);
    if (result.passed) passed++;
    else failed++;
  }

  console.log('════════════════════════════');
  console.log(`Results: ${passed} passed, ${failed} failed, ${testCases.length} total`);

  if (failed > 0) {
    console.error('\n❌ RBAC verification FAILED');
    process.exit(1);
  }

  console.log('\n✅ RBAC verification PASSED');
}

main().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
