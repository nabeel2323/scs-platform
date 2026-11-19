# Synthetic Test Identity and Tenant Matrix

**Purpose:** reusable identity model for the SCS remediation test campaign. All identities below are synthetic. Generate fresh UUIDs per test run; do not persist these fixtures to the shared Supabase database.

## 1. Core identity set

| Identity | Organization | Store membership | Expected authority |
|---|---|---|---|
| Buyer A | Buyer Org A | None | Own profile, cart, orders and buyer-visible published catalog |
| Buyer B | Buyer Org B | None | Own profile, cart and orders; must not read Buyer A records |
| Merchant Owner A | Merchant Org A | ACTIVE OWNER of Store A | Manage Store A catalog, offers, pricing, inventory, fulfillment and allowed analytics |
| Merchant Staff A | Merchant Org A | ACTIVE STAFF of Store A with explicit permissions | Only granted Store A operations; no owner-only membership or finance actions |
| Merchant Owner B | Merchant Org B | ACTIVE OWNER of Store B | Manage Store B only; must not access Store A |
| Platform Admin | Platform scope | No merchant membership required | Explicit platform-admin operations and audited bypass paths |
| Platform Moderator | Platform scope | No merchant membership required | Moderation-only operations; no implicit finance or owner authority |
| Suspended Staff A | Merchant Org A | SUSPENDED membership in Store A | Denied all store-member operations |
| Inactive Store Owner | Merchant Org A | ACTIVE membership in an INACTIVE store | Denied operations requiring an active store |
| Unauthenticated caller | None | None | 401 on protected endpoints |

## 2. Minimum data fixtures

Create per test run:

- Two independent organizations and two independent stores, each with distinct owners.
- One active staff member in Store A with a restricted permission subset.
- One suspended membership and one inactive store.
- Two buyers, each belonging to a different organization.
- At least one published product/variant/offer per store and one non-published product per store.
- One product with two seller offers and a concrete variant to validate exact offer attribution.
- One SAR offer and one non-SAR offer to validate currency separation.
- One MOQ/orderIncrement offer with quantity boundary cases.
- Two warehouses, each belonging to a different store, plus inventory rows for both.
- One master order with at least two seller sub-orders for per-store shipping and order-detail tests.
- Synthetic payment references only; no provider capture.
- Outbox events for carrier/non-carrier ownership, worker leases and retry/dead-letter cases.
- One shipment with a mocked carrier provider for label-worker tests; no real carrier credentials or shipment creation.

## 3. Required negative authorization matrix

| Caller | Target | Expected |
|---|---|---|
| Buyer A | Buyer B profile/cart/order | DENY |
| Buyer A | Merchant unpublished product | DENY |
| Merchant Owner A | Store B offer/pricing/inventory | DENY |
| Merchant Staff A | Store A owner-only action | DENY |
| Suspended Staff A | Store A operations | DENY |
| Inactive Store Owner | Inactive Store operations | DENY |
| Merchant Owner B | Store A shipment/label/analytics | DENY |
| Platform Moderator | Finance settlement/refund mutation | DENY unless explicitly granted |
| Unauthenticated caller | Protected route | 401 |
| Platform Admin | Explicitly privileged platform route | ALLOW and audit |

## 4. Financial and commercial correctness cases

- MOQ minimum boundary, below MOQ, and exact increment from MOQ.
- Stale offer terms changed between cart validation and checkout; checkout must re-read under lock.
- Two-session seller MOQ update vs buyer checkout contention; checkout must observe committed new terms.
- Multiple sellers and selected-offer identity preserved through cart and checkout.
- Mixed currencies displayed as separate subtotals; never add unlike currencies.
- Unsupported DIGITAL payment rejected before transaction/provider/payment insert.
- Shipping and tax shown per supplier/currency; server preview and final checkout must agree.
- Promotion apply/remove recalculates from authoritative server state.

## 5. Worker and event cases

- Two workers compete for one event; exactly one claims it.
- Expired lease reclaimed by another worker; stale owner cannot complete.
- Carrier worker claims only carrier-prefixed events; generic dispatcher excludes them.
- Duplicate label request returns existing active/pending work; duplicate outbox event does not create duplicate label object/row.
- Carrier label URL must pass allowlist validation; redirects, non-PDF payloads and oversized payloads fail closed.
- Retryable provider/storage failure retries; unsupported provider/invalid URL becomes terminal/dead-letter.
- Auto-completion and return-expiration workers respect buyer confirmation, owner leases and protected financial states.

## 6. Fixture hygiene

- Use generated UUIDs and reserved example domains; never use real phone numbers, email addresses, tokens, credentials or customer records.
- Each test owns its own transaction/container/schema where practical and restores any shared fixture fields in `finally`/cleanup.
- Never leave temporary MOQ, currency, store status, role or membership changes behind.
- Do not run these write fixtures against the connected shared Supabase project.
