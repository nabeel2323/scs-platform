/**
 * Demo data script — populates the database with realistic sample data
 * for UI validation and end-to-end workflow testing.
 *
 * Uses `docker exec psql` to avoid Docker Desktop Windows networking issues.
 *
 * Usage: pnpm --filter @scs/api db:demo
 * Requires: docker compose up -d && pnpm db:migrate && pnpm db:seed
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const CONTAINER = 'scs-postgres';
const DB_USER = 'scs';
const DB_NAME = 'scs_platform';

function psql(query: string): string {
  return execFileSync('docker', [
    'exec', CONTAINER, 'psql', '-U', DB_USER, '-d', DB_NAME, '-t', '-A', '-c', query,
  ], { encoding: 'utf-8' }).trim();
}

function sqlValue(s: string | number | boolean | null): string {
  if (s === null) return 'NULL';
  if (typeof s === 'number') return String(s);
  if (typeof s === 'boolean') return s ? 'TRUE' : 'FALSE';
  return `'${String(s).replace(/'/g, "''")}'`;
}
function uuid(): string { return crypto.randomUUID(); }
function now(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

// ── ID registry ──────────────────────────────────────────────
const IDs = {
  // Users
  superAdmin: uuid(), adminUser: uuid(), moderator: uuid(),
  merchantOwner1: uuid(), merchantStaff1: uuid(),
  merchantOwner2: uuid(), buyer1: uuid(), buyer2: uuid(),
  // Organizations
  orgWholesale: uuid(), orgRetail: uuid(), orgLogistics: uuid(), orgPlatform: uuid(),
  // Roles (looked up)
  roleId: {} as Record<string, string>,
  // Stores
  storeElectronics: uuid(), storeGroceries: uuid(),
  // Warehouses
  warehouseRiyadh: uuid(), warehouseJeddah: uuid(), warehouseDammam: uuid(),
  // Categories
  catElectronics: uuid(), catPhones: uuid(), catLaptops: uuid(), catAccessories: uuid(),
  catGroceries: uuid(), catDairy: uuid(), catProduce: uuid(), catBeverages: uuid(),
  // Brands
  brandSamsung: uuid(), brandApple: uuid(), brandAlmarai: uuid(), brandNestle: uuid(),
  // Products & Variants
  products: [] as string[], variants: [] as string[],
  // Price lists
  priceListElectronics: uuid(), priceListGroceries: uuid(),
  // Orders
  masterOrder1: uuid(), masterOrder2: uuid(), masterOrder3: uuid(),
  order1: uuid(), order2: uuid(), order3: uuid(), order4: uuid(),
  // Promotions
  promoSummer: uuid(), promoBulk10: uuid(),
};

// ════════════════════════════════════════════════════════════════
async function main() {
  console.log('🎭 Generating demo data...\n');

  // ── 0. Look up role IDs ────────────────────────────────────
  for (const key of ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'MERCHANT_OWNER', 'MERCHANT_STAFF', 'BUYER']) {
    IDs.roleId[key] = psql(`SELECT id FROM roles WHERE key = '${key}';`);
  }
  console.log('  ✓ Role IDs resolved');

  // ── 1. USERS ───────────────────────────────────────────────
  console.log('  Creating 8 demo users...');
  const usersData = [
    { id: IDs.superAdmin, phone: '+966500000001', name: 'Fahad Al-Rashid', locale: 'ar' },
    { id: IDs.adminUser, phone: '+966500000002', name: 'Noura Al-Saud', locale: 'ar' },
    { id: IDs.moderator, phone: '+966500000003', name: 'Khalid Hassan', locale: 'ar' },
    { id: IDs.merchantOwner1, phone: '+966500000010', name: 'Abdullah Al-Zahrani', locale: 'ar' },
    { id: IDs.merchantStaff1, phone: '+966500000011', name: 'Mohammed Al-Ghamdi', locale: 'ar' },
    { id: IDs.merchantOwner2, phone: '+966500000020', name: 'Sara Al-Otaibi', locale: 'ar' },
    { id: IDs.buyer1, phone: '+966500000100', name: 'Youssef Ibrahim', locale: 'ar' },
    { id: IDs.buyer2, phone: '+966500000101', name: 'Layla Mahmoud', locale: 'ar' },
  ];
  for (const u of usersData) {
    psql(`INSERT INTO users (id, phone, full_name, locale, status)
      VALUES (${sqlValue(u.id)}, ${sqlValue(u.phone)}, ${sqlValue(u.name)}, ${sqlValue(u.locale)}, 'ACTIVE')
      ON CONFLICT (phone) DO NOTHING;`);
  }

  // ── 2. ORGANIZATIONS ──────────────────────────────────────
  console.log('  Creating 4 organizations...');
  const orgsData = [
    { id: IDs.orgWholesale, name: 'Gulf Tech Wholesale', type: 'WHOLESALER', country: 'SA', status: 'VERIFIED' },
    { id: IDs.orgRetail, name: 'Al-Baraka Groceries', type: 'RETAILER', country: 'SA', status: 'VERIFIED' },
    { id: IDs.orgLogistics, name: 'Swift Logistics Co.', type: 'LOGISTICS', country: 'SA', status: 'PENDING' },
    { id: IDs.orgPlatform, name: 'SCS Platform Ops', type: 'PLATFORM', country: 'SA', status: 'VERIFIED' },
  ];
  for (const o of orgsData) {
    psql(`INSERT INTO organizations (id, type, name, country, verification_status)
      VALUES (${sqlValue(o.id)}, ${sqlValue(o.type)}, ${sqlValue(o.name)}, ${sqlValue(o.country)}, ${sqlValue(o.status)})
      ON CONFLICT (id) DO NOTHING;`);
  }

  // Org memberships
  const memberships = [
    { org: IDs.orgWholesale, user: IDs.merchantOwner1, role: IDs.roleId['MERCHANT_OWNER'] },
    { org: IDs.orgWholesale, user: IDs.merchantStaff1, role: IDs.roleId['MERCHANT_STAFF'] },
    { org: IDs.orgRetail, user: IDs.merchantOwner2, role: IDs.roleId['MERCHANT_OWNER'] },
    { org: IDs.orgPlatform, user: IDs.superAdmin, role: IDs.roleId['SUPER_ADMIN'] },
    { org: IDs.orgPlatform, user: IDs.adminUser, role: IDs.roleId['ADMIN'] },
    { org: IDs.orgPlatform, user: IDs.moderator, role: IDs.roleId['MODERATOR'] },
  ];
  for (const m of memberships) {
    psql(`INSERT INTO organization_members (id, org_id, user_id, role_id, status)
      VALUES (${sqlValue(uuid())}, ${sqlValue(m.org)}, ${sqlValue(m.user)}, ${sqlValue(m.role ?? null)}, 'ACTIVE')
      ON CONFLICT DO NOTHING;`);
  }
  console.log('  ✓ Org memberships created');

  // ── 3. STORES ─────────────────────────────────────────────
  console.log('  Creating 2 stores...');
  psql(`INSERT INTO stores (id, org_id, slug, display_name, description, currency, status, verification_status, address)
    VALUES (${sqlValue(IDs.storeElectronics)}, ${sqlValue(IDs.orgWholesale)}, 'gulf-tech',
      'Gulf Tech Electronics', 'Wholesale electronics — phones, laptops, accessories',
      'SAR', 'ACTIVE', 'VERIFIED',
      '{"city":"Riyadh","district":"Al Olaya","street":"King Fahd Road"}'::jsonb)
    ON CONFLICT (id) DO NOTHING;`);
  psql(`INSERT INTO stores (id, org_id, slug, display_name, description, currency, status, verification_status, address)
    VALUES (${sqlValue(IDs.storeGroceries)}, ${sqlValue(IDs.orgRetail)}, 'al-baraka',
      'Al-Baraka Groceries', 'Fresh groceries — dairy, produce, beverages',
      'SAR', 'ACTIVE', 'VERIFIED',
      '{"city":"Jeddah","district":"Al Rawdah","street":"Tahlia Street"}'::jsonb)
    ON CONFLICT (id) DO NOTHING;`);

  // ── 4. WAREHOUSES ─────────────────────────────────────────
  console.log('  Creating 3 warehouses...');
  psql(`INSERT INTO warehouses (id, store_id, name, address, manager_name, manager_phone, status)
    VALUES
      (${sqlValue(IDs.warehouseRiyadh)}, ${sqlValue(IDs.storeElectronics)}, 'Riyadh Main Warehouse',
        '{"city":"Riyadh","area":"Industrial District"}'::jsonb, 'Ahmad Saleh', '+966555000001', 'ACTIVE'),
      (${sqlValue(IDs.warehouseJeddah)}, ${sqlValue(IDs.storeGroceries)}, 'Jeddah Cold Storage',
        '{"city":"Jeddah","area":"Port District"}'::jsonb, 'Omar Tariq', '+966555000002', 'ACTIVE'),
      (${sqlValue(IDs.warehouseDammam)}, ${sqlValue(IDs.storeElectronics)}, 'Dammam Overflow',
        '{"city":"Dammam","area":"Industrial City"}'::jsonb, 'Faisal Noor', '+966555000003', 'ACTIVE')
    ON CONFLICT DO NOTHING;`);

  // ── 5. CATEGORIES ─────────────────────────────────────────
  console.log('  Creating 8 categories...');
  const cats = [
    { id: IDs.catElectronics, parent: null, path: '/electronics', name: 'Electronics', nameAr: 'إلكترونيات', slug: 'electronics' },
    { id: IDs.catPhones, parent: IDs.catElectronics, path: '/electronics/phones', name: 'Phones', nameAr: 'هواتف', slug: 'phones' },
    { id: IDs.catLaptops, parent: IDs.catElectronics, path: '/electronics/laptops', name: 'Laptops', nameAr: 'أجهزة كمبيوتر محمولة', slug: 'laptops' },
    { id: IDs.catAccessories, parent: IDs.catElectronics, path: '/electronics/accessories', name: 'Accessories', nameAr: 'إكسسوارات', slug: 'accessories' },
    { id: IDs.catGroceries, parent: null, path: '/groceries', name: 'Groceries', nameAr: 'بقالة', slug: 'groceries' },
    { id: IDs.catDairy, parent: IDs.catGroceries, path: '/groceries/dairy', name: 'Dairy', nameAr: 'ألبان', slug: 'dairy' },
    { id: IDs.catProduce, parent: IDs.catGroceries, path: '/groceries/produce', name: 'Fruits & Vegetables', nameAr: 'فواكه وخضروات', slug: 'produce' },
    { id: IDs.catBeverages, parent: IDs.catGroceries, path: '/groceries/beverages', name: 'Beverages', nameAr: 'مشروبات', slug: 'beverages' },
  ];
  for (const c of cats) {
    psql(`INSERT INTO categories (id, store_id, parent_id, path, slug, name, name_ar, description, sort_order, is_active)
      VALUES (${sqlValue(c.id)}, NULL, ${c.parent ? sqlValue(c.parent) : 'NULL'}, ${sqlValue(c.path)}, ${sqlValue(c.slug)},
        ${sqlValue(c.name)}, ${sqlValue(c.nameAr)}, ${sqlValue(c.name + ' category')}, 0, TRUE)
      ON CONFLICT (id) DO NOTHING;`);
  }

  // ── 6. BRANDS ─────────────────────────────────────────────
  console.log('  Creating 4 brands...');
  const brands = [
    { id: IDs.brandSamsung, name: 'Samsung', nameAr: 'سامسونج', slug: 'samsung' },
    { id: IDs.brandApple, name: 'Apple', nameAr: 'آبل', slug: 'apple' },
    { id: IDs.brandAlmarai, name: 'Almarai', nameAr: 'المراعي', slug: 'almarai' },
    { id: IDs.brandNestle, name: 'Nestlé', nameAr: 'نسليه', slug: 'nestle' },
  ];
  for (const b of brands) {
    psql(`INSERT INTO brands (id, name, name_ar, slug, is_active)
      VALUES (${sqlValue(b.id)}, ${sqlValue(b.name)}, ${sqlValue(b.nameAr)}, ${sqlValue(b.slug)}, TRUE)
      ON CONFLICT (id) DO NOTHING;`);
  }

  // ── 7. PRODUCTS & VARIANTS ────────────────────────────────
  console.log('  Creating 10 products with variants...');
  const productsDef = [
    // Electronics store products
    { title: 'Samsung Galaxy S24 Ultra', titleAr: 'سامسونج جالكسي S24 ألترا', slug: 'samsung-galaxy-s24-ultra', cat: IDs.catPhones, brand: IDs.brandSamsung, store: IDs.storeElectronics, price: 499900, desc: 'Latest Samsung flagship with AI features' },
    { title: 'iPhone 15 Pro Max', titleAr: 'آيفون 15 برو ماكس', slug: 'iphone-15-pro-max', cat: IDs.catPhones, brand: IDs.brandApple, store: IDs.storeElectronics, price: 549900, desc: 'Titanium design with A17 Pro chip' },
    { title: 'Samsung Galaxy A54', titleAr: 'سامسونج جالكسي A54', slug: 'samsung-galaxy-a54', cat: IDs.catPhones, brand: IDs.brandSamsung, store: IDs.storeElectronics, price: 159900, desc: 'Mid-range powerhouse' },
    { title: 'MacBook Pro 14" M3', titleAr: 'ماك بوك برو 14 ام 3', slug: 'macbook-pro-14-m3', cat: IDs.catLaptops, brand: IDs.brandApple, store: IDs.storeElectronics, price: 799900, desc: 'Professional laptop with M3 Pro chip' },
    { title: 'Samsung USB-C Cable 2m', titleAr: 'كيبل سامسونج USB-C 2 متر', slug: 'samsung-usbc-cable-2m', cat: IDs.catAccessories, brand: IDs.brandSamsung, store: IDs.storeElectronics, price: 4900, desc: 'Fast charging USB-C cable' },
    // Grocery store products
    { title: 'Almarai Fresh Milk 1L', titleAr: 'حليب المراعي الطازج 1 لتر', slug: 'almarai-fresh-milk-1l', cat: IDs.catDairy, brand: IDs.brandAlmarai, store: IDs.storeGroceries, price: 650, desc: 'Fresh full cream milk' },
    { title: 'Almarai Laban 200ml Pack', titleAr: 'لبن المراعي 200 مل', slug: 'almarai-laban-200ml', cat: IDs.catDairy, brand: IDs.brandAlmarai, store: IDs.storeGroceries, price: 300, desc: 'Fresh laban pack of 6' },
    { title: 'Nestlé Nescafé Classic 200g', titleAr: 'نسكافيه كلاسيك 200 جرام', slug: 'nescafe-classic-200g', cat: IDs.catBeverages, brand: IDs.brandNestle, store: IDs.storeGroceries, price: 3250, desc: 'Instant coffee classic blend' },
    { title: 'Fresh Oranges 1kg', titleAr: 'برتقال طازج 1 كيلو', slug: 'fresh-oranges-1kg', cat: IDs.catProduce, brand: null, store: IDs.storeGroceries, price: 850, desc: 'Premium Egyptian oranges' },
    { title: 'Bananas 1kg', titleAr: 'موز 1 كيلو', slug: 'bananas-1kg', cat: IDs.catProduce, brand: null, store: IDs.storeGroceries, price: 650, desc: 'Fresh Ecuadorian bananas' },
  ];

  for (const p of productsDef) {
    const pid = uuid();
    const vid = uuid();
    IDs.products.push(pid);
    IDs.variants.push(vid);
    psql(`INSERT INTO products (id, store_id, category_id, brand_id, slug, title, title_ar, description, status, condition, is_available, moq, published_at)
      VALUES (${sqlValue(pid)}, ${sqlValue(p.store)}, ${sqlValue(p.cat)}, ${p.brand ? sqlValue(p.brand) : 'NULL'},
        ${sqlValue(p.slug)}, ${sqlValue(p.title)}, ${sqlValue(p.titleAr)}, ${sqlValue(p.desc)},
        'ACTIVE', 'NEW', TRUE, 1, ${sqlValue(now(-5))})
      ON CONFLICT (id) DO NOTHING;`);
    // Variant = default SKU
    const sku = p.slug.toUpperCase().replace(/-/g, '_') + '_001';
    psql(`INSERT INTO product_variants (id, product_id, sku, title, title_ar, unit, is_active)
      VALUES (${sqlValue(vid)}, ${sqlValue(pid)}, ${sqlValue(sku)}, ${sqlValue(p.title)}, ${sqlValue(p.titleAr)}, 'PCS', TRUE)
      ON CONFLICT (id) DO NOTHING;`);
  }
  console.log(`  ✓ ${IDs.products.length} products, ${IDs.variants.length} variants created`);

  // ── 8. PRICE LISTS & TIERS ────────────────────────────────
  console.log('  Setting up pricing...');
  psql(`INSERT INTO price_lists (id, store_id, name, currency, channel, audience, is_active, priority)
    VALUES
      (${sqlValue(IDs.priceListElectronics)}, ${sqlValue(IDs.storeElectronics)}, 'Electronics B2B Default', 'SAR', 'B2B', 'PUBLIC', TRUE, 0),
      (${sqlValue(IDs.priceListGroceries)}, ${sqlValue(IDs.storeGroceries)}, 'Groceries B2B Default', 'SAR', 'B2B', 'PUBLIC', TRUE, 0)
    ON CONFLICT DO NOTHING;`);

  // Price tiers: base price + bulk discount tiers
  const electronicsVariants = IDs.variants.slice(0, 5);
  const groceryVariants = IDs.variants.slice(5);
  const electronicsPrices = [499900, 549900, 159900, 799900, 4900];
  const groceryPrices = [650, 300, 3250, 850, 650];

  for (let i = 0; i < electronicsVariants.length; i++) {
    const base = electronicsPrices[i]!;
    psql(`INSERT INTO price_tiers (id, price_list_id, variant_id, min_qty, max_qty, unit_price_minor)
      VALUES
        (${sqlValue(uuid())}, ${sqlValue(IDs.priceListElectronics)}, ${sqlValue(electronicsVariants[i]!)}, 1, 9, ${base}),
        (${sqlValue(uuid())}, ${sqlValue(IDs.priceListElectronics)}, ${sqlValue(electronicsVariants[i]!)}, 10, 49, ${Math.round(base * 0.95)}),
        (${sqlValue(uuid())}, ${sqlValue(IDs.priceListElectronics)}, ${sqlValue(electronicsVariants[i]!)}, 50, NULL, ${Math.round(base * 0.90)})
      ON CONFLICT DO NOTHING;`);
  }
  for (let i = 0; i < groceryVariants.length; i++) {
    const base = groceryPrices[i]!;
    psql(`INSERT INTO price_tiers (id, price_list_id, variant_id, min_qty, max_qty, unit_price_minor)
      VALUES
        (${sqlValue(uuid())}, ${sqlValue(IDs.priceListGroceries)}, ${sqlValue(groceryVariants[i]!)}, 1, 23, ${base}),
        (${sqlValue(uuid())}, ${sqlValue(IDs.priceListGroceries)}, ${sqlValue(groceryVariants[i]!)}, 24, 99, ${Math.round(base * 0.92)}),
        (${sqlValue(uuid())}, ${sqlValue(IDs.priceListGroceries)}, ${sqlValue(groceryVariants[i]!)}, 100, NULL, ${Math.round(base * 0.85)})
      ON CONFLICT DO NOTHING;`);
  }

  // ── 9. INVENTORY ──────────────────────────────────────────
  console.log('  Populating inventory...');
  // Electronics → Riyadh warehouse
  for (let i = 0; i < electronicsVariants.length; i++) {
    const invId = uuid();
    const qty = [200, 150, 500, 50, 2000][i]!;
    psql(`INSERT INTO inventory_items (id, variant_id, warehouse_id, qty_on_hand, qty_reserved, reorder_point, max_stock)
      VALUES (${sqlValue(invId)}, ${sqlValue(electronicsVariants[i]!)}, ${sqlValue(IDs.warehouseRiyadh)}, ${qty}, ${Math.round(qty * 0.05)}, ${Math.round(qty * 0.1)}, ${qty * 2})
      ON CONFLICT DO NOTHING;`);
    // Stock movement: initial stock
    psql(`INSERT INTO stock_movements (id, inventory_item_id, movement_type, quantity, reference_type, reason, performed_by)
      VALUES (${sqlValue(uuid())}, ${sqlValue(invId)}, 'INBOUND', ${qty}, 'INITIAL_STOCK', 'Demo initial stock', ${sqlValue(IDs.merchantStaff1)})
      ON CONFLICT DO NOTHING;`);
  }
  // Some electronics → Dammam overflow
  for (let i = 0; i < 3; i++) {
    const invId = uuid();
    const qty = [100, 80, 250][i]!;
    psql(`INSERT INTO inventory_items (id, variant_id, warehouse_id, qty_on_hand, qty_reserved, reorder_point)
      VALUES (${sqlValue(invId)}, ${sqlValue(electronicsVariants[i]!)}, ${sqlValue(IDs.warehouseDammam)}, ${qty}, ${Math.round(qty * 0.03)}, ${Math.round(qty * 0.1)})
      ON CONFLICT DO NOTHING;`);
  }
  // Groceries → Jeddah cold storage
  for (let i = 0; i < groceryVariants.length; i++) {
    const invId = uuid();
    const qty = [1000, 3000, 500, 800, 1200][i]!;
    psql(`INSERT INTO inventory_items (id, variant_id, warehouse_id, qty_on_hand, qty_reserved, reorder_point, max_stock)
      VALUES (${sqlValue(invId)}, ${sqlValue(groceryVariants[i]!)}, ${sqlValue(IDs.warehouseJeddah)}, ${qty}, ${Math.round(qty * 0.02)}, ${Math.round(qty * 0.15)}, ${qty * 3})
      ON CONFLICT DO NOTHING;`);
    psql(`INSERT INTO stock_movements (id, inventory_item_id, movement_type, quantity, reference_type, reason, performed_by)
      VALUES (${sqlValue(uuid())}, ${sqlValue(invId)}, 'INBOUND', ${qty}, 'INITIAL_STOCK', 'Demo initial stock', ${sqlValue(IDs.merchantOwner2)})
      ON CONFLICT DO NOTHING;`);
  }

  // ── 10. PROMOTIONS ────────────────────────────────────────
  console.log('  Creating 2 promotions...');
  psql(`INSERT INTO promotions (id, store_id, code, name, description, promo_type, scope, discount_value, min_order_minor, max_discount_minor, max_redemptions, redemption_count, per_user_limit, starts_at, ends_at, is_active)
    VALUES
      (${sqlValue(IDs.promoSummer)}, ${sqlValue(IDs.storeElectronics)}, 'SUMMER25', 'Summer Sale 25%', '25% off all electronics', 'PERCENTAGE', 'STORE', 25, 50000, 200000, 1000, 42, 1, ${sqlValue(now(-10))}, ${sqlValue(now(20))}, TRUE),
      (${sqlValue(IDs.promoBulk10)}, ${sqlValue(IDs.storeGroceries)}, 'BULK10', 'Bulk Discount 10%', '10% off orders over 100 SAR', 'PERCENTAGE', 'STORE', 10, 10000, 50000, 500, 15, 3, ${sqlValue(now(-5))}, ${sqlValue(now(30))}, TRUE)
    ON CONFLICT DO NOTHING;`);

  // ── 11. ORDERS ────────────────────────────────────────────
  console.log('  Creating orders in various states...');

  // Helper to create a complete order
  function createOrder(
    masterId: string, orderId: string, buyerId: string, storeId: string,
    status: string, variantIdx: number, qty: number, unitPrice: number,
    daysAgo: number, promoCode?: string,
  ) {
    const lineTotal = unitPrice * qty;
    const deliveryFee = storeId === IDs.storeElectronics ? 5000 : 2500;
    const tax = Math.round(lineTotal * 0.15);
    const total = lineTotal + deliveryFee + tax;
    const vId = IDs.variants[variantIdx]!;
    const sku: string = psql(`SELECT sku FROM product_variants WHERE id = '${vId}';`) || 'UNKNOWN';
    const title: string = psql(`SELECT title FROM product_variants WHERE id = '${vId}';`) || 'Unknown';

    // Master order
    psql(`INSERT INTO master_orders (id, buyer_id, status, delivery_address, notes)
      VALUES (${sqlValue(masterId)}, ${sqlValue(buyerId)}, 'CONFIRMED',
        '{"city":"Riyadh","district":"Al Nakheel","street":"King Abdullah Rd","building":"123A"}'::jsonb, 'Demo order')
      ON CONFLICT (id) DO NOTHING;`);

    // Sub-order
    psql(`INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, promo_code,
        subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, total_minor, sla_confirmed_at, sla_at)
      VALUES (${sqlValue(orderId)}, ${sqlValue(masterId)}, ${sqlValue(storeId)}, ${sqlValue(buyerId)}, ${sqlValue(status)},
        'PLATFORM_DELIVERY', ${promoCode ? sqlValue(promoCode) : 'NULL'},
        ${lineTotal}, 0, ${deliveryFee}, ${tax}, ${total},
        ${sqlValue(now(daysAgo + 1))}, ${sqlValue(now(daysAgo + 3))})
      ON CONFLICT (id) DO NOTHING;`);

    // Order item
    psql(`INSERT INTO order_items (id, order_id, variant_id, sku, title, quantity, qty_confirmed, unit_price_minor, tier_min_qty, line_total_minor)
      VALUES (${sqlValue(uuid())}, ${sqlValue(orderId)}, ${sqlValue(vId)}, ${sqlValue(sku)}, ${sqlValue(title)},
        ${qty}, ${status !== 'SUBMITTED' ? qty : 'NULL'}, ${unitPrice}, 1, ${lineTotal})
      ON CONFLICT DO NOTHING;`);

    // Financial breakdown
    const commission = Math.round(lineTotal * 0.05);
    const merchantNet = lineTotal - commission;
    psql(`INSERT INTO order_financial_breakdown (id, order_id, products_minor, discount_minor, delivery_fee_minor, tax_minor, commission_minor, merchant_net_minor, finalized_at)
      VALUES (${sqlValue(uuid())}, ${sqlValue(orderId)}, ${lineTotal}, 0, ${deliveryFee}, ${tax}, ${commission}, ${merchantNet},
        ${status === 'COMPLETED' ? sqlValue(now(daysAgo + 5)) : 'NULL'})
      ON CONFLICT DO NOTHING;`);

    // Status history
    const historyStatuses = ['SUBMITTED'];
    if (['CONFIRMED', 'READY', 'DISPATCHED', 'DELIVERED', 'COMPLETED'].includes(status)) historyStatuses.push('CONFIRMED');
    if (['READY', 'DISPATCHED', 'DELIVERED', 'COMPLETED'].includes(status)) historyStatuses.push('READY');
    if (['DISPATCHED', 'DELIVERED', 'COMPLETED'].includes(status)) historyStatuses.push('DISPATCHED');
    if (['DELIVERED', 'COMPLETED'].includes(status)) historyStatuses.push('DELIVERED');
    if (status === 'COMPLETED') historyStatuses.push('COMPLETED');
    if (status === 'CANCELLED') { historyStatuses.length = 0; historyStatuses.push('SUBMITTED', 'CANCELLED'); }

    for (let i = 0; i < historyStatuses.length; i++) {
      const from = i > 0 ? historyStatuses[i - 1] : null;
      psql(`INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by, actor_type, reason)
        VALUES (${sqlValue(uuid())}, ${sqlValue(orderId)}, ${from ? sqlValue(from) : 'NULL'}, ${sqlValue(historyStatuses[i]!)},
          ${i === 0 ? sqlValue(buyerId) : sqlValue(storeId === IDs.storeElectronics ? IDs.merchantOwner1 : IDs.merchantOwner2)},
          ${i === 0 ? "'BUYER'" : "'MERCHANT'"}, ${sqlValue(i === 0 ? 'Order placed' : `Status advanced to ${historyStatuses[i]!}`)})
        ON CONFLICT DO NOTHING;`);
    }
  }

  // Order 1: Electronics — COMPLETED
  createOrder(IDs.masterOrder1, IDs.order1, IDs.buyer1, IDs.storeElectronics, 'COMPLETED', 0, 2, 499900, -10, 'SUMMER25');
  // Order 2: Electronics — CONFIRMED
  createOrder(IDs.masterOrder2, IDs.order2, IDs.buyer1, IDs.storeElectronics, 'CONFIRMED', 1, 1, 549900, -3);
  // Order 3: Groceries — READY
  createOrder(IDs.masterOrder3, IDs.order3, IDs.buyer2, IDs.storeGroceries, 'READY', 5, 24, 650, -1, 'BULK10');
  // Order 4: Groceries — CANCELLED
  const mo4 = uuid(), o4 = uuid();
  createOrder(mo4, o4, IDs.buyer2, IDs.storeGroceries, 'CANCELLED', 7, 5, 3250, -2);

  // ── 12. NOTIFICATIONS ─────────────────────────────────────
  console.log('  Creating notifications...');
  const notifTypes = [
    { user: IDs.buyer1, type: 'ORDER', template: 'order.confirmed', title: 'Order Confirmed', body: 'Your order for iPhone 15 Pro Max has been confirmed by Gulf Tech Electronics.', status: 'READ' },
    { user: IDs.buyer1, type: 'ORDER', template: 'order.ready', title: 'Order Ready for Pickup', body: 'Your order is ready. Please visit the store.', status: 'DELIVERED' },
    { user: IDs.buyer2, type: 'ORDER', template: 'order.submitted', title: 'Order Submitted', body: 'Your grocery order has been submitted to Al-Baraka Groceries.', status: 'DELIVERED' },
    { user: IDs.buyer2, type: 'ORDER', template: 'order.cancelled', title: 'Order Cancelled', body: 'Your order has been cancelled.', status: 'DELIVERED' },
    { user: IDs.merchantOwner1, type: 'ORDER', template: 'order.new', title: 'New Order Received', body: 'New order from Youssef Ibrahim — 2x Samsung Galaxy S24 Ultra', status: 'DELIVERED' },
    { user: IDs.merchantOwner2, type: 'INVENTORY', template: 'inventory.low', title: 'Low Stock Alert', body: 'Nescafé Classic 200g is below reorder point (150 remaining)', status: 'PENDING' },
    { user: IDs.adminUser, type: 'SYSTEM', template: 'system.welcome', title: 'Welcome to SCS Platform', body: 'Your admin account has been activated.', status: 'READ' },
    { user: IDs.superAdmin, type: 'SYSTEM', template: 'system.alert', title: 'New Merchant Verification Request', body: 'Swift Logistics Co. has submitted verification documents.', status: 'PENDING' },
  ];
  for (const n of notifTypes) {
    psql(`INSERT INTO notifications (id, user_id, type, channel, template, title, body, status, sent_at, delivered_at, read_at)
      VALUES (${sqlValue(uuid())}, ${sqlValue(n.user)}, ${sqlValue(n.type)}, 'IN_APP', ${sqlValue(n.template)},
        ${sqlValue(n.title)}, ${sqlValue(n.body)}, ${sqlValue(n.status)},
        ${sqlValue(now(-2))}, ${n.status !== 'PENDING' ? sqlValue(now(-2)) : 'NULL'},
        ${n.status === 'READ' ? sqlValue(now(-1)) : 'NULL'})
      ON CONFLICT DO NOTHING;`);
  }

  // Notification preferences
  for (const userId of [IDs.buyer1, IDs.buyer2, IDs.merchantOwner1, IDs.merchantOwner2]) {
    for (const type of ['ORDER', 'INVENTORY', 'SYSTEM']) {
      for (const channel of ['IN_APP', 'PUSH']) {
        psql(`INSERT INTO notification_preferences (id, user_id, type, channel, is_enabled)
          VALUES (${sqlValue(uuid())}, ${sqlValue(userId)}, ${sqlValue(type)}, ${sqlValue(channel)}, TRUE)
          ON CONFLICT DO NOTHING;`);
      }
    }
  }

  // ── 13. AUDIT LOGS ────────────────────────────────────────
  console.log('  Creating audit logs...');
  const auditEntries = [
    { actor: 'SYSTEM', action: 'user.created', resource: 'users', resourceId: IDs.buyer1, meta: '{"phone":"+966500000100"}' },
    { actor: 'SYSTEM', action: 'user.created', resource: 'users', resourceId: IDs.buyer2, meta: '{"phone":"+966500000101"}' },
    { actor: 'SYSTEM', action: 'store.verified', resource: 'stores', resourceId: IDs.storeElectronics, meta: '{"verifiedBy":"admin"}' },
    { actor: 'SYSTEM', action: 'store.verified', resource: 'stores', resourceId: IDs.storeGroceries, meta: '{"verifiedBy":"admin"}' },
    { actor: 'MERCHANT', action: 'product.created', resource: 'products', resourceId: IDs.products[0], org: IDs.orgWholesale, meta: '{"title":"Samsung Galaxy S24 Ultra"}' },
    { actor: 'MERCHANT', action: 'product.created', resource: 'products', resourceId: IDs.products[5], org: IDs.orgRetail, meta: '{"title":"Almarai Fresh Milk 1L"}' },
    { actor: 'MERCHANT', action: 'price_list.updated', resource: 'price_lists', resourceId: IDs.priceListElectronics, org: IDs.orgWholesale, meta: '{"tiers_added":15}' },
    { actor: 'BUYER', action: 'order.created', resource: 'orders', resourceId: IDs.order1, meta: '{"total_minor":1054800}' },
    { actor: 'MERCHANT', action: 'order.confirmed', resource: 'orders', resourceId: IDs.order1, org: IDs.orgWholesale, meta: '{"sla_hours":48}' },
    { actor: 'MERCHANT', action: 'order.completed', resource: 'orders', resourceId: IDs.order1, org: IDs.orgWholesale, meta: '{"final_amount_minor":1054800}' },
    { actor: 'BUYER', action: 'order.created', resource: 'orders', resourceId: IDs.order2, meta: '{"total_minor":557400}' },
    { actor: 'ADMIN', action: 'promotion.created', resource: 'promotions', resourceId: IDs.promoSummer, org: IDs.orgPlatform, meta: '{"code":"SUMMER25"}' },
  ];
  for (const a of auditEntries) {
    psql(`INSERT INTO audit_logs (id, actor_type, actor_id, action, resource, resource_id, org_id, metadata, ip)
      VALUES (${sqlValue(uuid())}, ${sqlValue(a.actor)}, NULL, ${sqlValue(a.action)}, ${sqlValue(a.resource)},
        ${a.resourceId != null ? sqlValue(a.resourceId) : 'NULL'}, ${a.org ? sqlValue(a.org) : 'NULL'}, '${a.meta}'::jsonb, '127.0.0.1')
      ON CONFLICT DO NOTHING;`);
  }

  // ── 14. REVIEWS ───────────────────────────────────────────
  console.log('  Creating reviews...');
  // Review for completed order
  psql(`INSERT INTO reviews (id, order_id, reviewer_id, subject_id, subject_type, rating, title, body, dimensions, is_verified)
    VALUES (${sqlValue(uuid())}, ${sqlValue(IDs.order1)}, ${sqlValue(IDs.buyer1)}, ${sqlValue(IDs.storeElectronics)}, 'STORE',
      5, 'Excellent service', 'Fast delivery and authentic product. Highly recommended!',
      '{"quality":5,"packaging":5,"communication":5}'::jsonb, TRUE)
    ON CONFLICT DO NOTHING;`);

  // ── 15. FEATURE FLAGS ─────────────────────────────────────
  console.log('  Setting feature flags...');
  const flags = [
    { key: 'enable_push_notifications', enabled: true, desc: 'Enable FCM/APNs push notifications' },
    { key: 'enable_multi_currency', enabled: false, desc: 'Multi-currency support (Phase 2)' },
    { key: 'enable_arabic_rtl', enabled: true, desc: 'Arabic RTL layout support' },
    { key: 'enable_analytics_v2', enabled: false, desc: 'Advanced analytics dashboard (Phase 2)' },
    { key: 'enable_live_chat', enabled: false, desc: 'Real-time chat support (Phase 3)' },
  ];
  for (const f of flags) {
    psql(`INSERT INTO feature_flags (key, enabled, description)
      VALUES (${sqlValue(f.key)}, ${sqlValue(f.enabled)}, ${sqlValue(f.desc)})
      ON CONFLICT (key) DO UPDATE SET enabled = EXCLUDED.enabled, description = EXCLUDED.description;`);
  }

  // ── 16. BUSINESS DOCUMENTS ────────────────────────────────
  console.log('  Creating business documents...');
  psql(`INSERT INTO business_documents (id, org_id, store_id, doc_type, file_name, mime_type, file_size, storage_key, verification_status, uploaded_by, reviewed_by, reviewed_at)
    VALUES
      (${sqlValue(uuid())}, ${sqlValue(IDs.orgWholesale)}, ${sqlValue(IDs.storeElectronics)}, 'COMMERCIAL_REGISTRATION', 'gulf_tech_cr.pdf', 'application/pdf', 245000, 'docs/gulf-tech/cr.pdf', 'VERIFIED', ${sqlValue(IDs.merchantOwner1)}, ${sqlValue(IDs.adminUser)}, ${sqlValue(now(-15))}),
      (${sqlValue(uuid())}, ${sqlValue(IDs.orgWholesale)}, ${sqlValue(IDs.storeElectronics)}, 'TAX_CERTIFICATE', 'gulf_tech_vat.pdf', 'application/pdf', 120000, 'docs/gulf-tech/vat.pdf', 'VERIFIED', ${sqlValue(IDs.merchantOwner1)}, ${sqlValue(IDs.adminUser)}, ${sqlValue(now(-15))}),
      (${sqlValue(uuid())}, ${sqlValue(IDs.orgRetail)}, ${sqlValue(IDs.storeGroceries)}, 'COMMERCIAL_REGISTRATION', 'al_baraka_cr.pdf', 'application/pdf', 198000, 'docs/al-baraka/cr.pdf', 'VERIFIED', ${sqlValue(IDs.merchantOwner2)}, ${sqlValue(IDs.adminUser)}, ${sqlValue(now(-12))}),
      (${sqlValue(uuid())}, ${sqlValue(IDs.orgLogistics)}, NULL, 'COMMERCIAL_REGISTRATION', 'swift_logistics_cr.pdf', 'application/pdf', 310000, 'docs/swift/cr.pdf', 'PENDING', ${sqlValue(IDs.merchantOwner1)}, NULL, NULL)
    ON CONFLICT DO NOTHING;`);

  // ── 17. VERIFICATION REQUESTS ─────────────────────────────
  console.log('  Creating verification requests...');
  psql(`INSERT INTO verification_requests (id, store_id, org_id, status, submitted_by, reviewed_by, reviewed_at, decision_notes, auto_verified, submitted_at, resolved_at)
    VALUES
      (${sqlValue(uuid())}, ${sqlValue(IDs.storeElectronics)}, ${sqlValue(IDs.orgWholesale)}, 'APPROVED', ${sqlValue(IDs.merchantOwner1)}, ${sqlValue(IDs.adminUser)}, ${sqlValue(now(-14))}, 'All documents verified', FALSE, ${sqlValue(now(-16))}, ${sqlValue(now(-14))}),
      (${sqlValue(uuid())}, ${sqlValue(IDs.storeGroceries)}, ${sqlValue(IDs.orgRetail)}, 'APPROVED', ${sqlValue(IDs.merchantOwner2)}, ${sqlValue(IDs.adminUser)}, ${sqlValue(now(-11))}, 'Documents approved', FALSE, ${sqlValue(now(-13))}, ${sqlValue(now(-11))})
    ON CONFLICT DO NOTHING;`);

  // ── 18. OUTBOX EVENTS ────────────────────────────────────
  console.log('  Creating outbox events...');
  const outboxEvents = [
    { type: 'user.registered', aggregate: IDs.buyer1, status: 'DISPATCHED' },
    { type: 'user.registered', aggregate: IDs.buyer2, status: 'DISPATCHED' },
    { type: 'store.verified', aggregate: IDs.storeElectronics, status: 'DISPATCHED' },
    { type: 'order.created', aggregate: IDs.order1, status: 'DISPATCHED' },
    { type: 'order.status.changed', aggregate: IDs.order1, status: 'DISPATCHED' },
    { type: 'order.created', aggregate: IDs.order2, status: 'PENDING' },
    { type: 'promotion.created', aggregate: IDs.promoSummer, status: 'DISPATCHED' },
  ];
  for (const e of outboxEvents) {
    psql(`INSERT INTO outbox_events (id, event_type, aggregate_id, status, attempts, dispatched_at)
      VALUES (${sqlValue(uuid())}, ${sqlValue(e.type)}, ${sqlValue(e.aggregate)}, ${sqlValue(e.status)},
        ${e.status === 'DISPATCHED' ? 1 : 0}, ${e.status === 'DISPATCHED' ? sqlValue(now(-5)) : 'NULL'})
      ON CONFLICT DO NOTHING;`);
  }

  // ── SUMMARY ────────────────────────────────────────────────
  console.log('\n✅ Demo data generated successfully!');
  console.log('');
  console.log('  📊 Summary:');
  console.log(`     8 users (SUPER_ADMIN, ADMIN, MODERATOR, 2× MERCHANT_OWNER, MERCHANT_STAFF, 2× BUYER)`);
  console.log(`     4 organizations (WHOLESALER, RETAILER, LOGISTICS, PLATFORM)`);
  console.log(`     2 stores (Gulf Tech Electronics, Al-Baraka Groceries)`);
  console.log(`     3 warehouses (Riyadh, Jeddah, Dammam)`);
  console.log(`     8 categories (Electronics → Phones/Laptops/Accessories, Groceries → Dairy/Produce/Beverages)`);
  console.log(`     4 brands (Samsung, Apple, Almarai, Nestlé)`);
  console.log(`     10 products with 10 variants`);
  console.log(`     2 price lists with quantity-based tiers`);
  console.log(`     2 promotions (SUMMER25, BULK10)`);
  console.log(`     4 orders (COMPLETED, CONFIRMED, READY, CANCELLED)`);
  console.log(`     8 notifications across users`);
  console.log(`     12 audit log entries`);
  console.log(`     1 review, 5 feature flags, 4 business documents`);
  console.log(`     2 verification requests, 7 outbox events`);
  console.log('');
  console.log('  🔑 Test Accounts:');
  console.log(`     SUPER_ADMIN:     +966500000001 (Fahad Al-Rashid)`);
  console.log(`     ADMIN:           +966500000002 (Noura Al-Saud)`);
  console.log(`     MODERATOR:       +966500000003 (Khalid Hassan)`);
  console.log(`     MERCHANT_OWNER:  +966500000010 (Abdullah Al-Zahrani) — Gulf Tech`);
  console.log(`     MERCHANT_STAFF:  +966500000011 (Mohammed Al-Ghamdi) — Gulf Tech`);
  console.log(`     MERCHANT_OWNER:  +966500000020 (Sara Al-Otaibi) — Al-Baraka`);
  console.log(`     BUYER:           +966500000100 (Youssef Ibrahim)`);
  console.log(`     BUYER:           +966500000101 (Layla Mahmoud)`);
  console.log('');
}

main().catch((err) => {
  console.error('❌ Demo data generation failed:', err);
  process.exit(1);
});
