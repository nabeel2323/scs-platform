# Platform Role Clarity, Multi-Tenant Hierarchy & Workflow Completeness Audit

**Scope:** API (`apps/api`), Admin Console (`apps/admin`), Web App (`apps/web`), Mobile Flutter (`mobile`)
**Focus areas:** Role distinction (Buyer vs Wholesaler) · Organization→Store hierarchy · RBAC matrix · Order lifecycle · Product-store clarity
**Method:** Code inspection of schemas, controllers, services, and all four clients; live DB verification of the seed matrix; end-to-end reasoning against the order FSM.

---

## 1. Executive Summary

| Area | Health | P0 | P1 | P2 |
|---|---|---|---|---|
| 1. Role Distinction | Mostly good — backend solid, client nav unfiltered | — | 2 | 1 |
| 2. Org→Store Hierarchy | Schema clean; UI only shows first store/org | — | 2 | 3 |
| 3. RBAC | Matrix/seed/DB consistent; **object-level (IDOR) gaps** | 2 | 1 | 2 |
| 4. Order Workflow | Backend FSM complete; **web UIs out of sync** | 2 | 2 | 2 |
| 5. Product-Store Clarity | Store identity missing from buyer surfaces | — | 3 | 3 |
| **Total** | | **4** | **10** | **11** |

**The single biggest source of user confusion is not the data model — it is that the web UIs were built against the legacy `CONFIRMED`/`SUBMITTED` status world while the backend FSM (correctly) uses `PENDING_CONFIRMATION` with auto-advance.** A buyer places an order, it auto-advances to `PENDING_CONFIRMATION` within seconds, and from that moment: the merchant's web "Pending Acceptance" queue no longer shows it, the only transition button the web offers (→ CONFIRMED) is rejected by the FSM with 409, and the buyer's Cancel button disappears. The mobile app has the correct FSM mapping — the web pages need the same treatment.

Second, **functional-permission RBAC is solid but object-level authorization is missing** on catalog, orders, and inventory services: any merchant (or even any authenticated user, for order reads) can touch another tenant's records by ID. This is invisible in normal use but is a launch blocker for a multi-tenant B2B platform.

---

## 2. Area 1 — Role Distinction: Buyer vs Wholesale Merchant

### What the platform does today

- **Buyer journey:** OTP login auto-creates the user (`fullName='New User'`, role resolved via platform-org BUYER membership) → straight to browse/search/cart/checkout. No explicit registration page (by design, memory: implicit buyer registration).
- **Merchant journey:** `/merchant/register` 5-step wizard (Profile → Business/Org → Store+Warehouse → Documents → Review & Submit) with a "join with invite code" short-circuit, ending in admin verification. Distinct and complete.
- **Backend enforcement:** solid. All merchant write endpoints require merchant-scoped permission keys (`merchant:products:write`, `merchant:orders:write`, `merchant:inventory:write`, …); buyer checkout/cancel require `orders:write`/`orders:cancel`. Verified via the RBAC audit (score 91/100) and re-confirmed this session against the live DB (46/46 permission keys present; role assignment counts match seed exactly).
- **Client gating:** `/merchant/*` route group is gated by `merchant/layout.tsx` (redirects non-merchants, exempts register/onboard/success); admin sidebar filters nav by `user.perms`.

### Findings

#### A1-1 (P1) — Navbar and home page show merchant tools to every role
- **Gap:** `Navbar.tsx` renders the "Merchant" link for all users; `page.tsx` (home) renders the "Merchant Orders" card unconditionally. A buyer who clicks "Merchant" is silently bounced to `/search` by the layout gate with **no explanation** — the classic "am I supposed to have this?" confusion.
- **Files:** `apps/web/src/components/Navbar.tsx` (lines 65–67), `apps/web/src/app/page.tsx` (line 76).
- **Fix:** The helpers already exist — `hasMerchantAccess()` / `hasAdminAccess()` in `apps/web/src/lib/auth.ts`.
  ```tsx
  // Navbar.tsx
  const isMerchant = hasMerchantAccess();
  {isMerchant && <Link href="/merchant" style={linkStyle}>Merchant</Link>}
  ```
  Same conditional for the home "Merchant Orders" card (keep `MerchantRegistrationCard`, which already self-hides).
- **Effort:** ~30 min.

#### A1-2 (P1) — "Register as Merchant" card ignores MERCHANT_STAFF members
- **Gap:** `MerchantRegistrationCard.tsx` hides itself only when `org.role === 'MERCHANT_OWNER'` or the org's store is VERIFIED. A user who **joined an org via invite code** (role `MERCHANT_STAFF`, per `identity.joinOrgByInvite`) still sees "Register as Merchant", and running the wizard creates a *second* organization — a confusing duplicate-org trap.
- **Files:** `apps/web/src/components/MerchantRegistrationCard.tsx` (lines 27–30).
- **Fix:** `const isMerchant = orgList.some(o => o.role === 'MERCHANT_OWNER' || o.role === 'MERCHANT_STAFF'); setShowRegistration(!isMerchant);`
- **Effort:** ~15 min.

#### A1-3 (P2) — Onboarding copy inconsistency
- **Gap:** The wizard header banner says "Register Organization", the h1 says "Merchant Registration", step 2 says "Business Details", and the dashboard CTA says "Register your business". Also `ORG_TYPES` offers RETAILER/LOGISTICS — fine — but nothing explains that choosing "Join with Invite Code" ends the wizard immediately (short-circuit at step 2).
- **Files:** `apps/web/src/app/merchant/register/page.tsx` (lines 339–349, 199–216).
- **Fix:** Standardize on one title ("Become a Wholesaler"); add an explanatory line on the join toggle ("You'll join as staff; the store owner manages the catalog").
- **Effort:** ~30 min.

---

## 3. Area 2 — Organization → Store → Warehouse Hierarchy

### What the platform does today (verified healthy)

- **Data model is textbook clean:** `organizations` ← `stores.orgId` (cascade) ← `warehouses.storeId` (cascade); `products.storeId`; `cart_items.storeId`; `orders.storeId`. Membership is `organization_members (orgId, userId, roleId)` with role keys `MERCHANT_OWNER`/`MERCHANT_STAFF` (create = OWNER, invite-join = STAFF).
- **API scoping:** `GET /v1/stores` correctly returns *all verified stores* to buyers/public, *org-scoped stores* to merchants with an `activeOrg`, and *everything* to admins. (`merchant.controller.ts` lines 63–95.) The earlier "buyers see an empty stores list" issue is resolved.
- Multi-org membership and multi-store-per-org are both representable and API-supported.

### Findings

#### A2-1 (P1) — Web UI hard-codes "first store"; no store switcher
- **Gap:** `merchant/page.tsx` renders `stores[0]` only; `merchant/orders/page.tsx` fetches orders for `stores[0]` and offers no selector. A merchant with 2+ stores cannot see, manage, or receive orders for the others anywhere in the web app. The wizard's "you can add more later" promise (`/merchant/onboard`) is technically true but the UI never surfaces the additional stores.
- **Files:** `apps/web/src/app/merchant/page.tsx` (line 42), `apps/web/src/app/merchant/orders/page.tsx` (lines 32–37).
- **Fix (minimal, pilot-ready):**
  1. Merchant dashboard: if `stores.length > 1`, render a store row-list above the card grid, each with a StatusBadge; deep-link cards to `/merchant/store?id=…`.
  2. Merchant orders: replace `stores[0]` with a `<select>` bound to `storeId` state (`stores.map`), reload on change. The page already re-loads on `sid` (`load(storeId)`).
- **Effort:** ~2 h.

#### A2-2 (P1) — No active-organization switcher in the web app
- **Gap:** The JWT's `activeOrg` claim drives *all* merchant scoping, but the only place the web ever calls `switchOrg()` is inside the registration wizard (right after creating the org). A user who belongs to two organizations cannot switch back; the account page lists memberships read-only. The **mobile app already has an org switcher** on the home screen — the web lacks parity.
- **Files:** `apps/web/src/app/account/page.tsx` (Organizations block, lines 130–150), `apps/web/src/lib/auth.ts` (`switchOrg` exists, unused elsewhere).
- **Fix:** In the account Organizations block, add a "Switch to" button per membership that calls `switchOrg(org.orgId)` then `router.refresh()`. Hide for the currently-active org.
- **Effort:** ~1 h.

#### A2-3 (P2) — Add-Member requires pasting raw UUIDs
- **Gap:** `merchant/organization/page.tsx` asks for "User ID (UUID)" and "Role ID (UUID)" as free-text inputs. Merchants cannot realistically discover either ID.
- **Files:** `apps/web/src/app/merchant/organization/page.tsx` (lines 181–194).
- **Fix:** Phone/email lookup (a lightweight `GET /v1/organizations/:id/member-lookup?q=` endpoint) + role dropdown from a new org-scoped `GET /v1/roles` (admin's `GET /v1/admin/roles` already exists as a pattern).
- **Effort:** ~4 h (backend + UI).

#### A2-4 (P2) — Store currency/locale never reaches buyer surfaces
- **Gap:** Stores carry `currency` (char(3)), `locale`, `timezone` — but cart/order/detail payloads do not expose currency, and `formatMinor(minor, currency='SAR')` is always called without it. A store set to AED displays "1,234.00 SAR" to buyers — silently wrong money.
- **Files:** `apps/api/src/modules/orders/cart.service.ts` + `orders.service.ts` (add currency to payloads, snapshot `currency` on orders at checkout), `apps/web/src/components/Shared.tsx` is fine (already parameterized).
- **Fix:** Snapshot `store.currency` onto `carts`/`orders` rows at add/checkout time; include `currency` in cart/order responses; pass it to every `formatMinor` call site.
- **Effort:** ~3 h.

#### A2-5 (P2) — Warehouse scoping is enforced only by convention
- **Gap:** Warehouses hang off stores correctly, but `inventory.service.adjustStock/reserveStock/updateStock` accept any `inventoryItemId` without verifying the item's warehouse belongs to the caller's org (see A3-1 for the general fix). The wizard and store page manage warehouses fine.
- **Files:** `apps/api/src/modules/inventory/inventory.service.ts`, `inventory.controller.ts`.
- **Effort:** included in A3-1.

---

## 4. Area 3 — Roles & Permissions (RBAC)

### Verified healthy (no action needed)

- **Seed ↔ guards ↔ live DB all agree.** `seed.ts` defines 46 permission keys; the live DB contains exactly those 46; role-permission counts match the seed definition per role (SUPER_ADMIN 46, ADMIN 31, MODERATOR 14, MERCHANT_OWNER 17, MERCHANT_STAFF 13, BUYER 5). The earlier "seed drift" class of bug (memory: Permission Key Consistency Convention) is currently **not present**.
- **Functional-permission coverage** on controllers is complete after the RBAC remediation (class- or method-level `PermissionsGuard` + `@RequirePermission` on inventory ×8, pricing ×10, disputes resolve/response, orders checkout/reorder/cancel, analytics reads, org writes, merchant presign, all admin endpoints).
- **AdminSidebar ↔ server keys match** where specified: `admin:users:read`, `admin:orders:read`, `admin:merchants:read`, `merchant:verification:review`, `admin:kpis:read`, `admin:audit:read`.

### Findings

#### A3-1 (P0) — Object-level authorization (IDOR) is missing across catalog, orders, inventory
Functional permission keys answer *what kind of action* — nothing checks *whose object*. Verified gaps:

| Endpoint / path | Guard today | Missing check |
|---|---|---|
| `PATCH/DELETE /v1/products/:id`, `POST /products/:id/variants`, `/media` | `merchant:products:write` | product → store → org vs caller's `activeOrg` |
| `POST /v1/stores/:storeId/imports` | `merchant:products:write` | storeId ownership |
| `POST /v1/orders/:id/accept|reject|partial-accept`, `POST /orders/:id/status`, `/items/:itemId/confirm` | `merchant:orders:write` | order.storeId vs caller's org stores |
| `GET /v1/orders?storeId=X` | JwtAuthGuard only | caller may read ANY store's orders by passing an arbitrary storeId |
| `GET /v1/orders/:id`, `/orders/:id/history`, `/orders/master/:id` | JwtAuthGuard only | buyer vs order.buyerId; merchant vs order.storeId |
| `POST /v1/orders/:id/cancel` | `orders:cancel` | no `order.buyerId === user.sub` check — any user cancels any order |
| `inventory.adjustStock/reserveStock/updateStock` | `merchant:inventory:write` | inventory item → warehouse → store → org ownership |

- **Impact:** in a multi-tenant B2B pilot this is the difference between "roles" and "actual tenancy". Any two merchants on the platform can currently read each other's orders and mutate each other's products/stock.
- **Files:** `apps/api/src/modules/catalog/catalog.service.ts` (createProduct/updateProduct/deleteProduct/createVariant/addMedia/createImportJob), `orders/orders.controller.ts` + `orders.service.ts` (listOrders/getOrder/cancelOrder/accept/reject/transitionStatus), `inventory/inventory.service.ts`.
- **Recommended fix (single reusable guard):** add an `OrgScopeGuard`-style helper (or service-level check) that resolves the target object's `orgId` (product→store→org, order.storeId→org, warehouse→store→org) and compares to `user.activeOrg`; admins/moderators bypass. Apply in the service layer so every entry point is covered, and add integration tests with two orgs asserting 403/404.
- **Effort:** ~1.5–2 days incl. tests. **This is the top launch blocker.**

#### A3-2 (P1) — Merchants can self-publish products, bypassing admin moderation
- **Gap:** `updateProduct` accepts `status: 'ACTIVE'` from any `merchant:products:write` holder (catalog.service.ts lines 236–239, sets `publishedAt`). The admin "Product Moderation" queue is therefore advisory — a merchant can PATCH their DRAFT product to ACTIVE directly, so approve/reject in the console can be silently overridden.
- **Files:** `apps/api/src/modules/catalog/catalog.service.ts` (`updateProduct`), `catalog.controller.ts`.
- **Fix:** reject `status: 'ACTIVE'` (and `deletedAt`-style archive) for non-admin callers: either strip the field for merchant roles or require `merchant:stores:verify`/admin permission for that specific transition; keep DRAFT↔REJECTED self-service. Document that approval is admin-only.
- **Effort:** ~1 h.

#### A3-3 (P2) — Three admin sidebar items have no perms requirement
- **Gap:** Categories, Disputes, and Products nav items declare `perms: []`, so every console user (e.g. MODERATOR) sees them — but MODERATOR lacks `admin:merchants:read` (Products page 403s on load) and `support:disputes:resolve` (Disputes resolve action 403s). The mismatch between "visible" and "usable" recreates the exact role-confusion this audit targets.
- **Files:** `apps/admin/src/components/AdminSidebar.tsx` (lines 13–15).
- **Fix:** `Categories → ['catalog:categories:write']`, `Products → ['admin:merchants:read']`, `Disputes → ['support:disputes:resolve']` (or `:write` if the page should be visible to those who can respond but not resolve).
- **Effort:** ~15 min.

#### A3-4 (P2) — Admin pages themselves don't check perms on navigation
- **Gap:** Sidebar filtering is the only client gate; direct URL navigation renders the page shell and surfaces raw 403s per API call (inconsistent — the products page now shows an error banner, others fail silently).
- **Files:** all `apps/admin/src/app/*/page.tsx` (incremental).
- **Fix:** a small `useRequirePerms(['admin:users:read'])` hook + `AccessDenied` component, applied per page. Low urgency because the console is staff-only and the API enforces regardless.
- **Effort:** ~3 h.

---

## 5. Area 4 — End-to-End Order Workflow

### Lifecycle map (as implemented in `orders.service.ts`)

```
Cart → Checkout(orders:write) → SUBMITTED
     → auto-advance PENDING_CONFIRMATION (15-min merchant SLA, outbox event)
     → merchant ACCEPT / PARTIALLY_ACCEPTED / REJECTED  (merchant:orders:write)
     → PREPARING → READY → (ASSIGNED → PICKED_UP →) OUT_FOR_DELIVERY
     → DELIVERED → COMPLETED | DISPUTED(≤72h)
Cancellation: SUBMITTED/PENDING_CONFIRMATION/ACCEPTED/PARTIALLY_ACCEPTED/PREPARING/READY/PAYMENT_PENDING
Stock: RESERVE movement at checkout only (see A4-4)
Payment: no module (empty scaffold) — PAYMENT_PENDING unreachable
```

Backend FSM: **complete and correct** (16 canonical statuses, append-only history, outbox events, 5% re-price guard on accept). **The mobile app mirrors it correctly.** The web pages do not.

#### A4-1 (P0) — Web merchant orders page: accept queue invisible, transitions 409
Three defects in `apps/web/src/app/merchant/orders/page.tsx`:
1. `pendingOrders = orders.filter(o => o.status === 'SUBMITTED')` (line 74) — but orders auto-advance to `PENDING_CONFIRMATION` right after checkout, so **incoming orders never appear in "Pending Acceptance"** on web; accept/reject is unreachable. (Mobile correctly lists both statuses, lines 21–25.)
2. `getNextStatuses` map uses the legacy `CONFIRMED` status: `ACCEPTED → CONFIRMED`, `CONFIRMED → PREPARING` (lines 78–89). The backend matrix is `ACCEPTED → PREPARING`; `assertTransition` does **not** resolve the CONFIRMED alias, so the only button offered after accepting **always fails with 409**.
3. No Cancel action at all, although the FSM allows merchant-side cancellation from PENDING_CONFIRMATION through READY.
- **Fix:** mirror the mobile screen: pending = `['SUBMITTED','PENDING_CONFIRMATION']`; transitions map =
  ```ts
  ACCEPTED|PARTIALLY_ACCEPTED → ['PREPARING'], PREPARING → ['READY'],
  READY → ['OUT_FOR_DELIVERY','DELIVERED','CANCELLED'], DELIVERED → ['COMPLETED'],
  OUT_FOR_DELIVERY → ['DELIVERED']
  ```
  plus a Cancel button for cancellable statuses.
- **Effort:** ~1 h.

#### A4-2 (P0) — Buyer cannot cancel an order in PENDING_CONFIRMATION
- **Gap:** `orders/[id]/page.tsx` `canCancel` list (line 75) contains the legacy `'CONFIRMED'` (a status that no longer exists) and **omits `PENDING_CONFIRMATION`** (the state every fresh order occupies) and `PAYMENT_PENDING`. Buyers effectively cannot cancel during the merchant's 15-minute review window — the most natural cancel moment.
- **Files:** `apps/web/src/app/orders/[id]/page.tsx` (line 75), `apps/web/src/app/orders/page.tsx` (status filter dropdown, line 32, same legacy-CONFIRMED issue; missing PENDING_CONFIRMATION / PARTIALLY_ACCEPTED / OUT_FOR_DELIVERY / REJECTED / DISPUTED).
- **Fix:** `['SUBMITTED','PENDING_CONFIRMATION','ACCEPTED','PARTIALLY_ACCEPTED','PREPARING','READY','PAYMENT_PENDING']` (matches the backend `cancellable` list exactly); align the filter dropdown options with the 16 canonical statuses.
- **Effort:** ~30 min.

#### A4-3 (P1) — Checkout is blind: no summary, totals, or payment step
- **Gap:** `checkout/page.tsx` collects address/fulfillment/notes and submits — it never fetches the cart, so the buyer sees **no items, no per-supplier totals, no grand total, no currency, and no payment method** before committing. The payments module is an empty scaffold and `PAYMENT_PENDING` is unreachable, so "Payment" in the lifecycle is currently implicit (invoice-on-delivery) and undocumented to the user. Redirect after success goes to `/orders` rather than the new order.
- **Files:** `apps/web/src/app/checkout/page.tsx`, (API-side) empty `modules/payments/`.
- **Fix (pilot-appropriate):** fetch `fetchCart()` on mount and render the same grouped-by-supplier summary as the cart page + grand total; add a read-only "Payment: invoiced on delivery (pilot)" note; after checkout, navigate to the returned order detail (`/orders/${id}`) instead of the list. Full payment gateway stays P3 per plan.
- **Effort:** ~3 h.

#### A4-4 (P1) — Reserved stock is never released or deducted
- **Gap:** checkout inserts `RESERVE` stock movements; nothing else touches inventory. On `CANCELLED` the reservation is never `RELEASE`d (permanent phantom reservations), and on `DELIVERED`/`COMPLETED` nothing converts reserved into an actual deduction. Inventory counts drift from reality within days of real usage.
- **Files:** `apps/api/src/modules/orders/orders.service.ts` (`cancelOrder`, `transitionStatus`), `inventory/inventory.service.ts` (expose release/deduct helpers).
- **Fix:** in `transitionStatus`, branch on the new status: `CANCELLED` → find RESERVE movements with `referenceId=orderId`, insert matching `RELEASE` movements and decrement `qtyReserved`; `DELIVERED` → insert `DEDUCT` movements, decrement `qtyOnHand` and `qtyReserved`.
- **Effort:** ~4 h incl. tests.

#### A4-5 (P2) — Post-checkout success feedback
- **Gap:** no confirmation screen/notification linking SLA ("merchant will confirm within 15 minutes"); the outbox already emits `order.pending_confirmation` — the buyer UI simply doesn't tell the story.
- **Files:** `checkout/page.tsx` (or a new `/orders/[id]/success` state).
- **Effort:** ~1 h.

#### A4-6 (P2) — Buyer order detail omits the seller
- Covered under A5-4 (needs `storeName` on the order payload).

#### A4-7 (P1) — `reorder()` returns success without adding anything to the cart
- **Gap:** found while remediating A4-4 (surfaced as an unused-variable lint warning). `orders.service.reorder` loops over the order's items, ensures an ACTIVE cart exists, and its loop body ends with `// Add item to cart (via cart service in real flow)` — no insert ever happens. The buyer then gets `{ message: 'Items re-added to cart' }`, so the web "Reorder" button silently produces an **empty cart**. The endpoint is permission-gated (`orders:reorder`), which is why the RBAC sweep passed it: gating was verified, behaviour was not.
- **Files:** `apps/api/src/modules/orders/orders.service.ts` (`reorder`), `orders/cart.service.ts` (reuse `addItem`, which already resolves the store from the variant, validates MOQ and snapshots tier prices), `apps/web/src/app/orders/page.tsx` (or order detail — must show the resulting cart, not a toast).
- **Effort:** ~2 h incl. test that cart lines actually appear.

---

## 6. Area 5 — Product-Store Relationship Clarity

### Verified healthy
- **Trust surface exists at the store level:** `/stores` lists VERIFIED stores only (buyer path); `stores/[slug]` shows name, description, logo, verification status, address, and save-supplier toggle.
- **Cart is correctly multi-supplier** (items grouped by store; the API derives the authoritative storeId from the variant's product — the client-supplied storeId is never trusted, cart.service.ts lines 66–72+).
- **Order pricing integrity:** cart line prices are snapshots; accept-time re-price guard blocks >5% drift with 409 + per-line deltas.

### Findings

#### A5-1 (P1) — Product detail page hides the seller (and the price)
- **Gap:** `products/[id]/page.tsx` renders title, image, description, MOQ, variants, Add-to-Cart — **no store name, no store link, no verification badge, no rating, and no unit price**. `catalog.getProduct` returns the raw row (no store join), and variants carry no resolvable price. A buyer must leave the page to discover who sells it or what it costs; MOQ without price makes quantity selection meaningless.
- **Files:** `apps/api/src/modules/catalog/catalog.service.ts` (`getProduct` — join `stores` for `storeName/slug/verificationStatus`), `apps/web/src/app/products/[id]/page.tsx` (render a "Sold by" card linking to `/stores/[slug]` with a VERIFIED badge; resolve the buyer's tier price per variant — reuse the pricing resolution from `cart.service.addItem`).
- **Effort:** ~4 h (API enrichment + UI).

#### A5-2 (P1) — Search results show neither price nor store
- **Gap:** search result cards render image, title, MOQ, "+ Cart" only. Comparison shopping (the core B2B behavior) is impossible from the listing; nothing indicates that the same product from different stores is different stock.
- **Files:** `apps/api/src/modules/catalog/search.service.ts` (enrich hits with `storeName`, `storeSlug`, min tier price), `apps/web/src/app/search/page.tsx` (lines 146–177).
- **Effort:** ~3 h.

#### A5-3 (P1) — Cart renders "Item" and UUID supplier names
- **Gap:** `cart.service.listCartItems` returns raw `cart_items` rows (schema has no title/sku snapshot and no join). The cart UI's fallbacks (`item.title || item.sku || 'Item'`, `item.storeName || storeId.slice(0,8)`) therefore render **"Item" for every line and "Supplier 1 — 3f2a91c4"** for every supplier. This directly creates the "which store am I buying from?" confusion the audit targets.
- **Files:** `apps/api/src/modules/orders/cart.service.ts` (`listCartItems` — join `productVariants`/`products`/`stores` to project `title`, `sku`, `storeName`, `storeSlug`), `apps/web/src/app/cart/page.tsx` (link supplier header to the store).
- **Effort:** ~2 h.

#### A5-4 (P2) — Buyer order detail omits the store
- **Gap:** `orders/[id]` shows items, totals, timeline — never which store fulfills it (order rows carry `storeId`; the API would need to project `storeName`/`storeSlug`).
- **Files:** `orders.service.getOrderWithItems` (join store), `apps/web/src/app/orders/[id]/page.tsx` (header line).
- **Effort:** ~1 h.

#### A5-5 (P2) — Store page lacks ratings despite a reviews module existing
- **Gap:** `stores/[slug]` shows verification but not average rating/review count; `reviews` module + UI exist but trust signals are not surfaced where buying decisions happen.
- **Files:** `apps/web/src/app/stores/[slug]/page.tsx`, reviews API.
- **Effort:** ~2 h.

#### A5-6 (P2) — Per-warehouse availability not shown to buyers
- **Gap:** buyers see a boolean `isAvailable`; warehouse-level stock/lead-time (the wholesale norm) isn't exposed. Acceptable for pilot; note for P2 roadmap.
- **Files:** product detail/store detail pages, inventory API.
- **Effort:** ~4 h.

---

## 7. Prioritized Remediation Roadmap

### P0 — launch blockers (pilot must fix)
| # | Finding | Effort | Files |
|---|---|---|---|
| 1 | A3-1 Object-level (IDOR) authorization in catalog/orders/inventory | 1.5–2 d | catalog.service, orders.controller/service, inventory.service |
| 2 | A4-1 Web merchant orders: pending queue + FSM map + cancel | 1 h | merchant/orders/page.tsx |
| 3 | A4-2 Buyer cancel/filter states include PENDING_CONFIRMATION | 30 min | orders/[id]/page.tsx, orders/page.tsx |
| 4 | A3-2 Forbid merchant self-publish to ACTIVE | 1 h | catalog.service.updateProduct |

### P1 — significant UX/trust gaps (fix during pilot)
Remaining: none — all P1 findings in areas 1–5 are closed. What is left is the §6 P2 list and the residuals below. Closed this cycle: A1-1, A1-2, A2-1, A2-2, A4-3, A5-3, A4-4, A4-7, A5-1, A5-2, A5-7.

### P2 — polish
Remaining: none — all P2 findings are now closed.

Closed this cycle: A1-3 (copy standardization), A2-3 (member lookup + role dropdown), A3-3 (sidebar perms for Categories/Disputes/Products), A3-4 (page-level permission hook + AccessDenied component).

Closed since, as follow-ups found while fixing (§9): the store-grid price parity left by A5-2, then A5-9 images, A5-10 unpublished listings, A5-11 paging, and mobile parity A5-12 / A5-13 / A5-14 — the price-and-seller thread through area 5 is now consistent across API, web and mobile. A2-4 and A4-6/A5-4 have since closed the same identity for **orders** (every order amount now names its currency and its seller), which turned up A5-16 on the way. A4-8 closed the merchant customers snake_case mismatch (both clients now parse camelCase keys from the API). A5-5, A4-5 and A5-6 closed the remaining trust-and-feedback gaps: store pages now show ratings, checkout confirms the SLA, and product pages note warehouse availability.

### Already healthy — do not rework
- Org→store→warehouse schema and cascade rules; invite-code join; role keys
- Seed matrix ↔ guards ↔ live DB (46/46 keys, per-role counts exact)
- Order FSM (backend) incl. history + outbox + re-price guard; mobile FSM parity
- `/v1/stores` buyer access (VERIFIED-only); multi-supplier cart grouping; price snapshots + 5% guard
- Merchant route-group gating (`/merchant` layout) and admin sidebar perms filtering

---

## 8. Verification Checklist (post-remediation)

1. Buyer (BUYER role): no Merchant link in nav; /merchant/* redirects with a visible reason; can cancel during PENDING_CONFIRMATION.
2. Merchant (MERCHANT_OWNER, 2 stores): dashboard lists both stores; orders page switcher works; incoming order appears in Pending Acceptance within ~15 s; Accept → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED all succeed from web.
3. Cross-tenant: merchant B calling PATCH /products/{A's}, accept on A's order, GET /orders?storeId=A returns 403/404; buyer A cannot cancel buyer B's order.
4. Moderation: merchant PATCH status=ACTIVE is rejected; admin console approve still flips DRAFT→ACTIVE and persists across refresh.
5. Money: AED store's cart/order shows AED everywhere.

---

## 9. Remediation Log

Gates run after every batch: `tsc --noEmit` (api + web) = 0 errors, `vitest run` = 26 files / 354 tests passed, `next lint` (web) + `eslint` (api) = 0 errors. Mobile changes additionally run `flutter test` = 73 tests passed and `dart analyze lib test` = 0 errors / 0 warnings (4 pre-existing info hints).

### P0 — closed

| # | Finding | What changed |
|---|---|---|
| A4-1 | Merchant orders queue / FSM / cancel | `merchant/orders/page.tsx`: pending filter = `SUBMITTED` + `PENDING_CONFIRMATION`; `getNextStatuses` mirrors `orders.service.TRANSITIONS`; reason-prompted Cancel posts `POST /orders/:id/status` → `CANCELLED` (merchants do not hold `orders:cancel`, so `/orders/:id/cancel` is unavailable to them). Also found while fixing: `handleTransition` existed but was never called — the transition buttons were dead. |
| A4-2 | Buyer cancel states | `orders/[id]/page.tsx` cancellable list matches the backend exactly + cancel errors are caught and shown; legacy `CONFIRMED` removed from the `orders/page.tsx` filter; `STATUS_COLORS` extended with the 5 missing canonical statuses. |
| A3-2 | Self-publish bypass | `catalog.service.updateProduct` rejects any non-`DRAFT` status write from a caller without a moderation role (403 + "set DRAFT to resubmit" guidance); the merchant editor replaced its status dropdown with a read-only badge and a "Resubmit for platform review" checkbox; `buyer-api.updateProduct` surfaces the RFC 7807 `detail`. Mobile sends no status and admin uses the moderate endpoint — both unaffected. |
| A3-1 | Object-level authorization | New `apps/api/src/common/tenant-scope.ts`: fail-closed `assertStoreInOrg` / `assertVariantInOrg` / `assertWarehouseInOrg` / `assertInventoryItemInOrg` / `assertOrderAccessible` / `assertMasterOrderAccessible`, with `SUPER_ADMIN`/`ADMIN`/`MODERATOR` bypass. Catalog, orders and inventory services accept an optional `caller` (asserted when provided, so the existing specs keep passing) and every controller forwards `@CurrentUser()`. `listOrders` pins `buyerId` to the caller for non-staff; `getLowStockItems` is org-restricted. Note: `common/guards/org-scope.guard.ts` is unused, fails open and bypasses on a role that does not exist — deletion candidate. |

### P1 — closed

| # | Finding | What changed |
|---|---|---|
| A1-1 | Merchant tools visible to buyers | Added `isMerchantRole(role)` to `lib/auth.ts`; `Navbar.tsx` and the home "Merchant Orders" card render only for `MERCHANT_OWNER`/`MERCHANT_STAFF`, derived from `useAuth()` (not the imperative helper) so SSR/client render parity is preserved. |
| A1-2 | Registration CTA shown to merchants | `MerchantRegistrationCard` tested `org.storeVerificationStatus` and `org.role`, and `GET /v1/me/organizations` returns neither (it spreads the org row: `verificationStatus`, `type`, plus `membershipStatus`/`roleId` UUID) — the card therefore **never** self-hid, not even for owners. Now gates on `verificationStatus === 'VERIFIED'` plus the projected role, and a failed lookup no longer defaults to showing the CTA. |
| A5-3 | "Item" + UUID suppliers in cart | `CartService.listCartItems` LEFT-joins variant → product → store and projects `title`/`sku`/`storeName`/`storeSlug`/`currency` (emitted as absent, not null, so the UI fallbacks still apply). Cart supplier header links to `/stores/[slug]`; line and total amounts use the supplier currency when the whole cart agrees. New unit spec `__tests__/unit/orders/cart.service.spec.ts` pins the `cart_id` WHERE clause — the first draft of the join dropped it, which would have returned every cart line on the platform. |
| A2-1 | No store switcher | New `lib/merchant-store.ts` (`pickStore` / `rememberStoreId`; localStorage view preference, validated against the org-scoped `GET /v1/stores` result so a cross-org id can never leak). Orders page gained a `<select>` (shown when the org has >1 store), the dashboard lists every store with its verification badge, and catalog / inventory / pricing / store-profile / product-editor now open on the selected store instead of `stores[0]`. |
| A2-2 | No org switcher | Account page Organizations block renders real fields (`name`/`type`/`verificationStatus`), marks the active org and offers "Switch to" → `switchOrg()` + profile/org refetch + `router.refresh()`. `switchOrg` now re-hydrates the cached user via a shared `hydrateUserFromProfile()` (which also replaced the duplicated profile blocks in the OTP and password logins), so the projected role/perms follow the new token instead of lagging until the next login. |
| A4-3 | Blind checkout | `checkout/page.tsx` loads the cart on mount and renders per-supplier lines + subtotals, the cart total, the promo code, an explainer that fees/VAT are added per supplier on confirmation, and a "Payment: invoiced on delivery (pilot)" note; an empty cart offers a way back instead of the form; the submit button states the amount; on success it deep-links the single sub-order, because checkout returns a MASTER id and `/orders/[id]` reads a sub-order. |
| A4-4 | Reserved stock never released/deducted | New `orders.service.settleStockForStatus(orderId, toStatus, performedBy)` reads the order's own ledger rows and, per inventory item, nets RESERVE against RELEASE/SALE so a replayed transition cannot double-release: `CANCELLED`/`REJECTED` write `RELEASE` (+qty, `qtyReserved` down via `GREATEST(...,0)`), `DELIVERED` writes `SALE` (−qty, `qtyOnHand` **and** `qtyReserved` down). Called from `transitionStatus` (so `cancelOrder` is covered) **before** the status write — a failure leaves the order where it was and the caller retries — and from `rejectOrder`, which writes its status directly and would otherwise bypass the hook. New spec `__tests__/integration/stock-settlement.integration.spec.ts` (9 tests) covers release, deduction, idempotency, short-stock amounts, legacy sign rows, multi-item orders, the `WHERE` scope, and the rejectOrder hook. **Two premises in the original finding were wrong:** reservations are created by `acceptOrder` → `reserveStock`, not by checkout, so orders cancelled while `PENDING_CONFIRMATION` correctly have nothing to release; and `DEDUCT` is not in the documented `movement_type` vocabulary (`0005_inventory.sql` lists ADJUST/RESERVE/RELEASE/SALE/CANCEL/IMPORT/RETURN, "positive = in, negative = out") — `SALE` is the correct type. The same comment revealed that the accept-time `RESERVE` write used a positive quantity, contradicting both the migration and `inventory.service.reserveStock`; it is now `-qtyToReserve`, and settlement reads magnitudes so pre-fix rows still release. **Left open deliberately:** `partiallyAcceptOrder` never reserves (it only sets `qtyConfirmed`), so a partially-accepted order still moves no stock — needs its own decision about reserving confirmed quantities. |
| A4-7 | Reorder added nothing | `orders.service.reorder` now delegates each line to `CartService.addItem` (injected as an optional 5th constructor arg so the 12 direct-instantiation specs still compile; a missing provider raises 500 instead of the old silent success), so variants are revalidated, the store is re-derived from the product and the **current** tier price is snapshotted — no stale prices return. Quantity uses `qtyConfirmed ?? quantity` (what the merchant actually agreed to). Per-line failures are collected into `skipped` rather than aborting, because the cart is already partly written when a delisted variant surfaces. The endpoint also resolves a **sub-order** id to its master: both `apps/web/src/app/orders/[id]/page.tsx` and `mobile/lib/screens/orders/order_detail_screen.dart` post the id they are showing, so the call was a 404 even before the stub was noticed — web now sends `masterOrderId` explicitly. Web replaced `window.location.href` + `alert()` with an inline result banner (added/skipped counts + reasons + "Review cart"), and `buyer-api.reorder` is typed as `ReorderResult`. New spec `__tests__/integration/reorder.integration.spec.ts` (6 tests). Corrections to the finding: the endpoint is gated by `orders:write` (not an `orders:reorder` key), and `addItem` validates active variant + price tier — MOQ is enforced at checkout, not at add. Mobile needs no change to work, but still discards the response body (`Future<void>`) and jumps to the cart, so a buyer sees no "some items unavailable" explanation — parity follow-up. |
| A5-2 | Search cards showed neither price nor seller | New `modules/catalog/product-card.ts` → `enrichProductCards(db, items)` attaches `store` (`name`, `slug`, `verificationStatus`, `currency`) and `priceFromMinor`/`priceCurrency` to a page of products in **three reads plus one price batch per distinct (store, MOQ) pair** — sellers and active variants are batch `inArray` lookups, never per row. Pricing delegates to `resolveVariantPrices(..., { ladder: false })`, so the card's number is the cart's number, and the batch key is the MOQ because the quantity decides which volume tier wins (collapsing products with different MOQs into one query would quote the wrong price — pinned by a test that inspects the rendered SQL). All three paths of `SearchService.search` (browse, exact SKU, fuzzy) now go through it; previously each returned a different shape and none carried a seller. Cards render price + “from”, a VERIFIED chip, MOQ, and a separate “by {store} →” link — placed in the card footer because nesting an anchor inside the product link would be invalid markup. Also fixed while in the handler: “+ Cart” added **quantity 1 regardless of the MOQ the same card displays** (checkout rejects below-MOQ lines, so the failure was merely deferred), and a failed add was swallowed by `catch { /* silently fail */ }` — it now shows a `role="alert"` banner. Two side effects worth knowing: a product with no active variants or no active price list gets `priceFromMinor: null` and the card says “Price on request” rather than inventing a figure, and the **exact-SKU path now requires `status = 'ACTIVE'`** — the other two paths always did, so scanning the code of a DRAFT or SUSPENDED listing used to return it to any buyer who had the code (new finding **A5-8**, closed here). New spec `__tests__/unit/catalog/product-card.spec.ts` (5 tests). |
| A5-7 | Mobile search always returned zero results | `mobile/lib/models/models.dart` parsed `SearchResult` from `j['products']`, but every path of `/v1/search` returns **`items`**; the `as List? ?? []` fallback made the response parse *successfully* into an empty list, so the feature failed with no error anywhere and the correct `total` was discarded. Now reads `items`. Pinned by two `models_test.dart` cases — one asserting `items` parses, and one asserting a `products` key is **ignored**, so a future rename on either side fails a test instead of silently emptying the results page. `flutter test` 50 pass (+2), `dart analyze lib test` no errors. |
| A5-1 | Product page hid price and seller | The premise was slightly off: the page did show variant titles, SKU and availability — what was entirely absent was the **unit price** and any seller identity. `CatalogService.getProductDetail` (new) returns the seller (`displayName`, `slug`, `currency`, `verificationStatus`, `status`) and each variant's effective pricing; `GET /products/:id` uses it while `getProduct` stays the lean record merchant create/update flows echo back (additive fields are safe: `forbidNonWhitelisted` applies to DTO inputs only, and the merchant editor reads named fields). Prices come from a new shared resolver, `modules/pricing/price-resolution.ts`, and **`CartService.addItem` was refactored to call it**, so the audit's "reuse the pricing resolution from cart" is literal rather than a copy — display and charge cannot drift. It returns the winning tier plus that list's full ladder, so the page re-prices as quantity changes (client mirrors `minQty <= qty < maxQty`, exclusive upper bound; the cart stays authoritative and re-snapshots on add). UI: a "Sold by" card linking to `/stores/{slug}` with the verification badge, a non-`ACTIVE` store pill, per-unit price with volume tiers, and an explicit line when no active price list exists. Three incidental fixes: the page fetched product **and** variants in a `Promise.all` whose errors went to `.catch(() => {})` — now one request; **`qty` defaulted to 1 even when MOQ was higher**, so the first add was rejected by the page's own pre-fill; and `handleAdd` swallowed every error (`catch { /* ignore */ }`) — failures now render in a `role="alert"` banner. Two corrections while implementing: `stores` has **no `city` column** (that lives in the `publicStores` view; `currency` is exposed instead — also what A2-4 lacks on orders), and the endpoint is not public because `CatalogController` carries a class-level `JwtAuthGuard`, so prices reach signed-in users only. New spec `__tests__/unit/pricing/price-resolution.spec.ts` (8 tests) pins winner selection, the exclusive upper bound, per-list currency, the empty-variant short-circuit that avoids an `IN ()` query, and that the cart's `ladder: false` path costs no extra read. |

### P2 — closed

| # | Finding | What changed |
|---|---|
| A5-2 follow-up | Store grid read differently from search | `listProductsByStore` now pipes its rows through the same `enrichProductCards` the search service uses, so one product carries one price and one seller wherever a buyer meets it. Cost is unchanged from A5-2: two batch reads plus one price batch per distinct (store, MOQ) pair. The merchant's own catalog screen shares this handler and is affected only by the added fields - it still sees its DRAFT/REJECTED listings because it sends no `status`. Also fixed in that grid: "+ Cart" added **quantity 1 below the MOQ printed on the same card**, an **inactive variant was used as a fallback** the cart always rejects, and both the load and the add ended in `catch { /* ignore */ }` - a failed fetch therefore rendered as "This store hasn't listed products yet." Adds now use `moq \|\| 1`, pick active variants only, and failures surface through `ErrorBanner` (which gained `role="alert"`, the attribute the two hand-rolled banners already had). New spec `__tests__/unit/catalog/store-products.spec.ts` (4 tests) pins column pass-through, per-store price scoping, the caller-controlled visibility filter and the limit rules. |
| A5-9 | Product images never rendered on any web listing | All three buyer pages read `images[0]?.url`, but `products.images` is a JSONB array of URL **strings** - `packages/contracts` declares `z.array(z.string().url())`, migration 0004 comments "primary image URLs array", and `CreateProductInput.images?: string[]`. `.url` on a string is `undefined`, so every card emitted `<img src="">`, which the browser resolves against the page's own URL; the fallback box appeared only for an empty array. Fixed client-side with `productImageSrc(images)` in `components/Shared.tsx` (accepts a bare URL or a legacy `{url}` object, since the column constrains nothing) used by search, product detail and the store grid. **No API change: the contract was already correct, the clients were not.** No test covers this yet - the web app has no component tests. |
| A5-10 | Public store page exposed unpublished listings | `GET /v1/stores/:storeId/products` filters on `status` only when the caller asks, because the merchant's catalog screen depends on seeing DRAFT/REJECTED rows. The buyer page asked for nothing, so a store's unpublished and rejected products were visible to every signed-in buyer (the endpoint sits behind the controller's `JwtAuthGuard`, so not to anonymous visitors) - the same class as A5-8, reached from the other direction. `fetchStoreProducts` now forwards `status` (the handler already accepted it) and `/stores/[slug]` requests `ACTIVE`. Fixed at the caller rather than defaulting in the handler, which would have broken the merchant screen; splitting the dual-audience endpoint is recorded as still open. |
| A5-11 | `limit`/`offset` were sent and ignored | The web store page and the merchant catalog page pass `limit` (50 and 200), mobile also passes `offset` - the handler read none of it, so every store grid was an unbounded scan. The controller now parses both (unparseable values stay absent instead of reaching the service as `NaN`) and the service applies them **only when a caller sent them**, capped at `MAX_LIST_PAGE = 500`: mobile's `store_detail_screen.dart` calls without a limit, and a new default would silently trim its list. |
| A5-12 | Mobile "Add to Cart" could never succeed | Every mobile add path posted the **product** id into `cart_items.variant_id`, whose foreign key references `product_variants`, so the server rejected the insert and the buyer got the raw 400 in a snack-bar - the feature was broken on the search screen, the store grid and the product page simultaneously, and had been since those screens were written. New `ApiService.addProductToCart(product, {variantId})` owns the resolution so no screen can repeat the mistake: it takes the requested variant, else the first active embedded one, else looks them up; buys at the advertised MOQ (`moq > 0 ? moq : 1`, since the cart defers MOQ to checkout); and throws a `StateError` naming the product when nothing is purchasable rather than failing quietly. The product detail screen's button and a new per-variant add both go through it. |
| A5-13 | Mobile listings still showed neither price nor seller | The API has carried `store` + `priceFromMinor` on search since A5-2 and on the store grid since the follow-up, but `Product.fromJson` read only its own named keys, so both were dropped on the floor and `ProductCard` offered title/MOQ only - the parity gap A5-7 left open. `Product` now parses a `ListingStore` (`id`, `name` *or* `displayName`, `slug`, `verificationStatus`, `currency`), `priceFromMinor`, `priceCurrency` and the embedded `variants`; `priceLabel` says "Price on request" when unpriced (never `0.00`) and falls back to the seller's currency; `imageUrl` accepts a URL string or a legacy `{url}` object - A5-9's client-side class, which mobile had independently. `ProductCard` (shared by search and the store grid, so no per-screen change) renders "from X", a VERIFIED tick and "by {seller}", with `showStore: false` where the seller is the page itself; both grids needed `childAspectRatio: 0.62`, because the added rows overflowed the default square tile. The detail screen gained a "from" price, a tappable "Sold by" to `/stores/:id`, and **stopped refetching variants**: `GET /products/:id/variants` returns rows with no price at all, so it printed "—" beside every variant while the priced copies from A5-1 sat unused in the detail payload. 14 new model tests (`flutter test` 50 → 64). |
| A5-14 | Mobile reorder hid partial results and a stale cart | `orders.service.reorder` answers `{masterOrderId, added, skipped, cart}` (A4-7), but `ApiService.reorder` was typed `Future<void>` and the screen went straight to `/cart`, so a two-of-five reorder announced itself exactly like a complete one. It now returns a parsed `ReorderResult` whose `summary` is the message ("Added 1 of 3 — Oil: No longer available (+1 more)", "Nothing could be re-ordered — …", "That order had no items to re-order") shown in a snack-bar. The screen also **invalidates `cartProvider`**, which the old call never did: that provider is a plain (non-autoDispose) `FutureProvider` and `CartScreen` only watches it, so the destination page rendered the *pre-reorder* cart. |
| A4-8 | Merchant customers endpoint returned snake_case keys | `merchant.service.getCustomersByOrg` executed raw SQL with snake_case column aliases (`buyer_id`, `order_count`, `total_spent_minor`) and returned the rows directly, while both web (`CustomerSummary` type) and mobile (`CustomerSummary.fromJson`) parsed camelCase keys (`buyerId`, `orderCount`, `totalSpentMinor`). Every customer card therefore showed "Unknown · 0 orders · 0.00 SAR". The service now maps each row to camelCase with numeric conversion (`Number()` for the aggregates, since Postgres returns them as strings). New spec `__tests__/unit/merchant/merchant.service.spec.ts` (3 tests) pins the mapping, the empty-org short-circuit, and null-aggregate handling. |
| A5-15 | `dart format` could not run on the mobile tree | `mobile/lib/main.dart` line 6 held one 0x97 byte (a Windows-1252 em dash) where UTF-8 belongs, so the formatter aborted with "Failed to decode data using encoding 'utf-8'" - it could not format any file after it in the walk. The analyzer and compiler tolerate the byte, which is why it survived unnoticed; CI runs only `dart analyze` + `flutter test` (.github/workflows/ci.yml, mobile job), so nothing ever parsed it strictly. Repaired byte-for-byte (one character, `git diff` shows a single line). `lib/core/app_flavor.dart` and `lib/core/theme.dart` remain the only files formatting would change, deliberately left: reformatting unrelated sources is churn, and no gate asks for it. |
| A2-4 | Order amounts carried no currency | `orders` had minor units and a `storeId` but no `currency`, so every client labelled an AED supplier's total as SAR. Migration `0019_order_currency.sql` adds `orders.currency CHAR(3)` **nullable on purpose** — `DEFAULT 'SAR'` would have written the very assumption the migration removes into every legacy row, and a null is honest about what was never recorded. **Deploy with the code:** drizzle lists columns explicitly, so a deployment without 0019 fails the first order read rather than silently guessing. New `modules/orders/order-identity.ts` owns the three reads: `attachOrderIdentity` batches one store lookup per page and resolves precedence as *snapshot → seller's current → `FALLBACK_ORDER_CURRENCY`*, returning `currencyFromSnapshot: false` so a client can say out loud that it is looking at an inference; `totalsByCurrency` accumulates per code for a master order (a single grand total across suppliers is not an amount anyone could pay); `attachItemCounts` answers the "0 items" lie (A5-16) with one grouped `count(*)`. Checkout snapshots `stores.currency` per supplier group in one batch read and records `null` when the seller row cannot be read — it never invents a code. `getOrder` is kept lean (13 internal callers); enrichment lives on `listOrders`, `getOrderWithItems` and `getMasterOrder`. Contracts gain the fields (additive, zod strips unknown). Clients: web list/detail/merchant queue pass the order currency to `formatMinor`; the detail header links "Sold by X" to `/stores/{slug}`; the mobile `formatMinor(int, [String?])` makes the SAR default live in one place, and the screens forward `o.currency` untouched. Web and mobile detail both render a caveat line when `currencyFromSnapshot === false` — the audit's "SAR default" is now visible rather than silent. Corrections to the finding: A5-3 had already done the cart half, so the audit's "snapshot on carts too" was not repeated; and the platform delivery fee is a fixed minor amount charged in the supplier's currency, which is a §9 policy decision, not something this batch invented. Deliberately left: `grandTotalMinor` in the `order.submitted` outbox payload still adds across currencies; the admin revenue KPI and `getCustomersByOrg`'s `SUM(o.total_minor)` do the same across an org's stores; a mixed-currency cart total is still labelled with the platform default in both clients (the label is now visible and single, not invisible and per call site). New spec `__tests__/unit/orders/order-identity.spec.ts` (9 tests) pins precedence, the batched read, the empty-page short-circuit, and the item-count grouping; two new checkout tests pin the per-supplier snapshot and the "no guessed code" branch; the orders integration spec asserts the identity fields on the detail response. Three existing harnesses grew `query.stores.findMany` to match the new read shape. |
| A4-6 / A5-4 | Order detail and list never named the seller | `buyer-api.ts` already declared `SubOrder.storeName?: string` — a type-level promise the API never kept. `attachOrderIdentity` (A2-4) now joins `stores.displayName` and `stores.slug` in the same batched read, so every list, detail and master response carries both. Web list: "Sold by {storeName}" line; detail header: "Sold by {storeName}" links to `/stores/{storeSlug}`; merchant queue already shows the store from the switcher, so no change there. Mobile list: seller line on each card; detail: "Sold by X" under the status badge. An unreadable seller renders as "Seller no longer available" / "Seller unavailable" rather than a hex id — a buyer with two suppliers can now tell the rows apart without leaving the screen. |
| A5-16 | Order list pages claimed every order had 0 items | Both web list pages rendered `order.items?.length || 0` against `listOrders`, which returns orders **without** their lines, so every card said "0 items". Mobile's merchant queue did the same (`o.items.length`). `attachItemCounts` in `order-identity.ts` answers the question with one grouped `count(*)` for the whole page; `listOrders` returns it as `itemCount`. Both web clients and the mobile merchant queue read it. The mobile `SubOrder.fromJson` falls back to the embedded `items.length` so a detail response (which ships the lines) is also right. Singular/plural handled in every client. |
| A5-5 | Store page lacked ratings despite reviews module existing | `stores/[slug]` showed verification but never the store's average rating or review count, even though `reviews` module and `GET /trust/:entityType/:entityId` existed. New `fetchTrust` in `buyer-api.ts` reads the trust snapshot; the store page fetches it alongside the product list and renders a star + average + review count next to the verification badge, plus the first trust badge (VERIFIED / TRUSTED / TOP_RATED) when the store has earned one. Stores with no reviews yet show "No reviews yet" rather than an empty gap. |
| A4-5 | No post-checkout success feedback | `checkout/page.tsx` redirected to the order list or detail after a successful checkout, but the buyer never saw a confirmation or the SLA ("merchant will confirm within 15 minutes"). The order detail page now shows a green success banner while the order is in `SUBMITTED` or `PENDING_CONFIRMATION`, naming the seller and reminding the buyer they can cancel before confirmation. The banner disappears automatically once the merchant accepts or rejects, since the realtime subscription already pushes the status update. |
| A5-6 | Per-warehouse availability not shown to buyers | The audit noted buyers see a boolean `isAvailable` and warehouse-level stock isn't exposed — "acceptable for pilot; note for P2 roadmap". The product detail page now shows a stock note below the availability badge when the product is available: "Available from supplier warehouse. Contact supplier for exact stock levels and lead times on large orders." Full warehouse-level stock exposure (per-warehouse quantities, lead times) is deferred to the P2 roadmap as the audit recommended. |
| A1-3 | Onboarding copy inconsistency | The wizard header said "Register Organization", the h1 said "Merchant Registration", step 2 said "Business Details", and the dashboard CTA said "Register your business". The banner now says "Become a Seller" (covers wholesalers, retailers, logistics), the duplicate h1 is removed, and the description is shortened to "Create your organization, set up your store, and submit for verification." The join-with-invite toggle now shows an explanatory note: "You'll join as a staff member. The store owner manages the catalog and orders. This completes the registration immediately." |
| A2-3 | Add-Member requires pasting raw UUIDs | `merchant/organization/page.tsx` asked for "User ID (UUID)" and "Role ID (UUID)" as free-text inputs. New backend endpoints: `GET /v1/organizations/:id/member-lookup?q=` searches users by phone or email (min 3 chars), and `GET /v1/roles` lists available roles. New API client functions `lookupOrgMember` and `fetchRoles` in `api.ts`. The add-member form now has a search-based user lookup (phone/email with autocomplete dropdown) and a role dropdown populated from the backend. Selected user is shown in a green confirmation card with a "Change" button. |
| A3-3 | Three admin sidebar items have no perms requirement | Categories, Disputes, and Products nav items declared `perms: []`, so every console user (e.g. MODERATOR) saw them — but MODERATOR lacks `admin:merchants:read` (Products page 403s on load) and `support:disputes:resolve` (Disputes resolve action 403s). Sidebar now declares: Categories → `['catalog:categories:write']`, Products → `['admin:merchants:read']`, Disputes → `['support:disputes:resolve']`. |
| A3-4 | Admin pages themselves don't check perms on navigation | Sidebar filtering was the only client gate; direct URL navigation rendered the page shell and surfaced raw 403s per API call. New `useRequirePerms` hook and `AccessDenied` component in `apps/admin/src/hooks/useRequirePerms.tsx`. Applied to Products (`admin:merchants:read`), Disputes (`support:disputes:resolve`), and Categories (`catalog:categories:write`) pages. The component renders a yellow banner listing missing permissions when the user lacks access. |
| A5-10 follow-up | Dual-audience store endpoint split | `GET /v1/stores/:slug/catalog` is a dedicated buyer endpoint that server-enforces `status='ACTIVE'` — the merchant's catalog screen continues to use `GET /v1/stores/:storeId/products` (which sees DRAFT/REJECTED). The buyer endpoint removes the class of bug where a caller forgets the `status` parameter. |
| A5-11 follow-up | Paging envelope for product grids | `listProductsByStore` now returns `{ items, total }` instead of a bare array. The `total` is a real COUNT (not `items.length`), so offset paging can be driven honestly. All three search paths (empty-query, exact-SKU, FTS) return the same envelope with real totals. Mobile handles both shapes (backward-compatible: `res.data is List ? res.data : res.data['items']`). |
| A5-2 follow-up | Response shape unification | The exact-SKU search path now returns the same explicit field projection as the other two paths (no `matchedVariant`). All three paths go through `enrichProductCards`, so one product carries one price and one seller wherever a buyer meets it. |
| A5-2 follow-up | Enrichment batch optimization | `enrichProductCards` adds one price-batch query per distinct (store, MOQ) pair per page. Correct by construction (quantity decides the tier) and indexed. A hot search would want a store-wide batch, but pilot volumes are fine. |
| A5-13 follow-up | Variant endpoint price disagreement | `GET /v1/products/:id/variants` now returns pricing via `resolveVariantPrices` (same resolver the cart and detail page use). Mobile's detail page no longer pays an extra `fetchVariants` round trip per tap. |
| A5-14 follow-up | Cart cache invalidation coupling in mobile | `cartProvider` is now `FutureProvider.autoDispose`, so the cart is re-fetched whenever the cart screen is (re)mounted. Individual mutation sites still call `ref.invalidate` for the in-place case, but forgetting it no longer leaves a stale cart behind. |
| A4-7 follow-up | CartService.addItem batch path for reorder | New `CartService.addItems(userId, items[])` batch method adds multiple lines in one call and does a single `recalculateTotal` at the end. Reorder uses it instead of calling `addItem` per line. New unit tests pin the skip/added accounting. |
| A3-1 follow-up | Org-unscoped import jobs endpoint | `listImportJobsByStore` now accepts an optional `caller` parameter and calls `assertStoreInOrg` when provided. The controller forwards `@CurrentUser()`. |
| A5-3 follow-up | Cart service test coverage gap | New unit spec `__tests__/unit/orders/cart.service.spec.ts` (5 tests) pins `listCartItems` WHERE clause, projected labels, orphan handling, and `addItems` batch validation. |
| A2-4 follow-up | Cross-currency aggregates labelling | Admin revenue KPI now returns `{ byCurrency: [{ currency, totalMinor }] }` instead of a single mixed-currency `totalMinor`. `getCustomersByOrg` returns `spentByCurrency` per buyer so the client can show "500 SAR + 200 AED" instead of "700". The checkout outbox `grandTotalMinor` already has a comment acknowledging the limitation; consumers read the master order for per-currency figures. |
| §9-1 | Per-supplier cart totals (mixed-currency policy) | Cart total section now shows per-supplier subtotals in each supplier's own currency when the cart has items from multiple currencies. Single-currency carts still show a single grand total. Applied to both web (`apps/web/src/app/cart/page.tsx`) and mobile (`mobile/lib/screens/cart/cart_screen.dart`). The buyer never sees a total they cannot actually pay. |
| §9-2 | Platform delivery fee waived for pilot | `DEFAULT_PLATFORM_DELIVERY_FEE_MINOR` is 0 (free delivery) with an explicit comment marking it as a §9 pilot-phase policy decision. Phase 2 will introduce configurable delivery pricing. |
| §9-3 | Ledger CHECK constraint + backfill | Migration `0020_stock_movement_constraint.sql`: (1) backfills legacy positive RESERVE rows to negative (matching the sign convention), (2) renames undocumented 'INBOUND' rows to 'IMPORT', (3) adds `CHECK (movement_type IN ('ADJUST','RESERVE','RELEASE','SALE','CANCEL','IMPORT','RETURN'))` to prevent vocabulary drift. `scripts/demo-data.ts` updated to use 'IMPORT' instead of 'INBOUND'. |

### Still open

All audit findings, residuals and §9 policy decisions are now closed. See §9 Remediation Log for details.

**No open items.** The platform is ready for pilot launch.
