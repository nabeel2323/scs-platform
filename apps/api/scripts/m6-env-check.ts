/**
 * M6 Environment & Catalog Baseline Check
 * Full auth flow: password login -> OTP request -> OTP verify -> baseline queries.
 *
 * This utility is restricted to explicitly confirmed local development/test systems.
 * Credentials are supplied through the environment and OTP values are never logged.
 */
import Redis from 'ioredis';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + ' is required');
  return value;
}

function readUatConfig() {
  const environment = requiredEnvironmentValue('SCS_ENVIRONMENT').toLowerCase();
  if (environment !== 'development' && environment !== 'test') {
    throw new Error('M6 environment check is restricted to development/test.');
  }
  if (process.env['SCS_UAT_CONFIRM'] !== 'true') {
    throw new Error('Set SCS_UAT_CONFIRM=true to confirm local UAT execution.');
  }

  const apiUrl = process.env['SCS_UAT_API_URL'] ?? 'http://localhost:3000/v1';
  const redisUrl = process.env['SCS_UAT_REDIS_URL'] ?? 'redis://localhost:6379';
  for (const [name, value] of [['SCS_UAT_API_URL', apiUrl], ['SCS_UAT_REDIS_URL', redisUrl]] as const) {
    const parsed = new URL(value);
    if (!LOCAL_HOSTS.has(parsed.hostname)) {
      throw new Error(name + ' must point to a local host.');
    }
  }

  return {
    apiUrl,
    redisUrl,
    email: requiredEnvironmentValue('SCS_UAT_EMAIL'),
    password: requiredEnvironmentValue('SCS_UAT_PASSWORD'),
    phone: requiredEnvironmentValue('SCS_UAT_PHONE'),
    deviceId: process.env['SCS_UAT_DEVICE_ID']?.trim() || 'm6-env-check-device',
  };
}

async function main(): Promise<void> {
  const config = readUatConfig();
  const redis = new Redis(config.redisUrl);

  console.log('=== AUTH ===');
  const loginRes = await fetch(config.apiUrl + '/auth/login/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: config.email,
      password: config.password,
      deviceId: config.deviceId,
    }),
  });
  const loginData = (await loginRes.json()) as any;
  console.log('Login: ' + loginRes.status + ' requiresOtp=' + loginData.requiresOtp);

  let token: string;
  if (loginData.accessToken) {
    token = loginData.accessToken;
  } else {
    const otpReqRes = await fetch(config.apiUrl + '/auth/otp/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: config.phone }),
    });
    console.log('OTP request: ' + otpReqRes.status);

    const otp = await redis.get('otp:' + config.phone);
    if (!otp) {
      console.log('FATAL: Could not read OTP from Redis');
      await redis.quit();
      process.exit(1);
    }
    console.log('OTP retrieved from local Redis (value redacted).');

    const otpVerifyRes = await fetch(config.apiUrl + '/auth/otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: config.phone,
        otp,
        deviceId: config.deviceId,
        deviceInfo: { platform: 'web', userAgent: 'M6-UAT-Script/1.0' },
      }),
    });
    const otpVerifyData = (await otpVerifyRes.json()) as any;
    if (!otpVerifyData.accessToken) {
      console.log('OTP verify FAILED: ' + otpVerifyRes.status);
      await redis.quit();
      process.exit(1);
    }
    token = otpVerifyData.accessToken;
    console.log('OTP verify: OK');
  }

  await redis.quit();

  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  console.log('  User: ' + payload.sub + ', Org: ' + payload.activeOrg + ', Role: ' + payload.role);
  const auth = { Authorization: 'Bearer ' + token };

  console.log('\n=== CATALOG BASELINE ===');
  const endpoints: [string, string, (data: any) => number | string][] = [
    ['Categories', '/admin/categories', (data) => Array.isArray(data) ? data.length : (data.total ?? data.length ?? '?')],
    ['Product Types', '/admin/product-types', (data) => Array.isArray(data) ? data.length : (data.total ?? data.length ?? '?')],
    ['Products', '/admin/products?limit=100', (data) => data.items?.length ?? data.length ?? '?'],
  ];
  for (const [label, endpoint, countFn] of endpoints) {
    try {
      const response = await fetch(config.apiUrl + endpoint, { headers: auth });
      const data = (await response.json()) as any;
      console.log('  ' + label + ': ' + countFn(data));
    } catch (error: any) {
      console.log('  ' + label + ': ERROR - ' + error.message);
    }
  }

  console.log('\n=== PRODUCTS & VARIANTS ===');
  try {
    const productResponse = await fetch(config.apiUrl + '/admin/products?limit=100', { headers: auth });
    const productData = (await productResponse.json()) as any;
    const products = productData.items || productData;
    if (Array.isArray(products)) {
      console.log('  Total products: ' + products.length);
      let totalVariants = 0;
      for (const product of products) {
        const variantResponse = await fetch(config.apiUrl + '/admin/products/' + product.id + '/variants', { headers: auth });
        const variants = (await variantResponse.json()) as any;
        const variantRows = Array.isArray(variants) ? variants : (variants.items || []);
        totalVariants += variantRows.length;
        console.log(
          '  ' + product.id?.substring(0, 8) + '... | ' +
          (product.title || '').substring(0, 40) + ' | status=' + product.status +
          ' | store=' + (product.storeId ? 'owned' : 'canonical') +
          ' | variants=' + variantRows.length,
        );
      }
      console.log('  Total variants: ' + totalVariants);
    }
  } catch (error: any) {
    console.log('  ERROR: ' + error.message);
  }

  console.log('\n=== MERCHANT INFRASTRUCTURE ===');
  try {
    const storesResponse = await fetch(config.apiUrl + '/admin/stores', { headers: auth });
    const storesData = (await storesResponse.json()) as any;
    const stores = Array.isArray(storesData) ? storesData : (storesData.items || storesData.data || []);
    console.log('  Stores: ' + stores.length);
    for (const store of stores) {
      console.log(
        '    ' + store.id?.substring(0, 8) + '... | ' + store.displayName +
        ' | org=' + store.orgId?.substring(0, 8) + ' | status=' + store.status +
        ' | ver=' + store.verificationStatus,
      );
    }
  } catch (error: any) {
    console.log('  Stores: ERROR - ' + error.message);
  }

  console.log('\n=== MARKETPLACE DATA ===');
  const marketEndpoints: [string, string][] = [
    ['Merchant Offers', '/merchant/offers'],
    ['Warehouses', '/admin/warehouses'],
    ['Inventory Items (low-stock)', '/inventory/low-stock'],
    ['Master Orders', '/admin/master-orders'],
    ['Carts', '/admin/carts'],
  ];
  for (const [label, endpoint] of marketEndpoints) {
    try {
      const response = await fetch(config.apiUrl + endpoint, { headers: auth });
      const data = (await response.json()) as any;
      const rows = Array.isArray(data) ? data : (data.items || data.data || []);
      console.log('  ' + label + ': ' + rows.length);
    } catch (error: any) {
      console.log('  ' + label + ': ERROR - ' + error.message);
    }
  }

  console.log('\n=== PRICING DATA ===');
  try {
    const response = await fetch(config.apiUrl + '/admin/price-lists', { headers: auth });
    const data = (await response.json()) as any;
    const rows = Array.isArray(data) ? data : (data.items || data.data || []);
    console.log('  Price Lists: ' + rows.length);
  } catch (error: any) {
    console.log('  Price Lists: ERROR - ' + error.message);
  }

  console.log('\n=== ENVIRONMENT SUMMARY ===');
  console.log('  Node: ' + process.version);
  console.log('  API: ' + config.apiUrl);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('FATAL: ' + message);
  process.exitCode = 1;
});
