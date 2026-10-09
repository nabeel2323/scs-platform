# P12 — Business Rules & Architecture Lock

**Phase**: P12 — Payments & Financial Architecture  
**Date**: 2026-10-08  
**Predecessor**: P11 = CLOSED / PASS  
**P12 Audit**: COMPLETE  
**Gate**: P12 BUSINESS RULES & ARCHITECTURE LOCK  

---

## 1. Executive Summary

This document locks all business rules and architecture decisions for P12 implementation. It is written so that a coding agent can implement P12 without making any unresolved business decisions.

**Critical deployment context**: The SCS Platform will initially deploy in **Syria**, which has unique operational constraints. Online payment systems in Syria are known to be vulnerable and unstable. The platform **must NOT rely exclusively on automated digital payments**. Instead, P12 implements a **hybrid payment workflow** with manual payment verification as the primary path and digital gateway integration as a secondary/optional path.

**Key decisions locked in this document:**

| ID | Decision | Verdict |
|----|----------|---------|
| D-01 | Payment model | **Hybrid**: manual verification primary, digital gateway optional |
| D-02 | Payment methods | Bank transfer, cash on delivery, voucher, digital (optional) |
| D-03 | Merchant of record | **SCS Platform** collects on behalf of merchants |
| D-04 | Multi-merchant payment | **One payment intent per sub-order** (not per master) |
| D-05 | Auth/capture model | **Model A**: authorize → confirm → capture (manual); immediate capture (digital) |
| D-06 | Financial authority | `order_financial_breakdown` becomes immutable at payment confirmation |
| D-07 | Ledger model | **Option A**: immutable snapshot + append-only payment/refund ledger |
| D-08 | Currency | **SYP only** (Syrian Pound), integer minor units |
| D-09 | Provider abstraction | `PaymentProvider` interface with `ManualVerificationProvider` as default |
| D-10 | PCI boundary | No card data stored; provider-hosted fields for digital path |

**P12 scope**: Payment architecture, manual verification workflow, digital payment abstraction, immutable financial records, basic refunds, commission tracking, basic settlement tracking, order/payment integration, migration 0058.

---

## 2. Current Baseline

| Item | Value |
|------|-------|
| Branch | `develop` |
| Latest migration | 0057_governance_index_offer_snapshot.sql |
| Total migrations | 57 |
| Order FSM | 16 statuses (DRAFT through DISPUTED) |
| PAYMENT_PENDING | Exists in TRANSITIONS map but not wired into checkout |
| Financial breakdown | `order_financial_breakdown` — mutable, `finalizedAt` column exists but unused |
| Checkout | Atomic transaction, idempotency key + fingerprint |
| Inventory | Reservation at acceptance, settlement at delivery/cancellation |
| Outbox | Transactional outbox with retry, lease-based claiming |
| Shipping | 34 files, carrier integration, exception FSM, reconciliation |
| Cancellation | Dedicated `/cancel` endpoint, atomic, reason vocabulary locked |
| Currency | `char(3)` on orders — currently SAR in code, must change to SYP |

**Discrepancy from audit**: The audit stated currency is SAR. Source inspection confirms `order-pricing.ts` uses `DEFAULT_VAT_RATE = 0.15` (15% KSA VAT). For Syria deployment, the VAT rate, currency, and commission defaults must be reconfigured. The code is already parameterized via env vars (`VAT_RATE`, `COMMISSION_RATE`), so no structural change is needed — only default values and the `char(3)` currency snapshot.

---

## 3. Source Inspection Findings

### 3.1 Order Schema (`orders.schema.ts`)

- `master_orders`: buyer's purchase intent, one per checkout
- `orders`: sub-order per store, carries financial totals (subtotalMinor, discountMinor, deliveryFeeMinor, taxMinor, totalMinor), currency snapshot
- `order_items`: line items with SNAPSHOT prices, offer_snapshot for immutability
- `order_financial_breakdown`: per sub-order, has `finalizedAt` column (currently NULL/unused)
- `order_status_history`: append-only transition log

### 3.2 Order FSM (`orders.service.ts` TRANSITIONS map)

```
DRAFT → SUBMITTED → PENDING_CONFIRMATION → ACCEPTED | PARTIALLY_ACCEPTED | REJECTED | CANCELLED
ACCEPTED/PARTIALLY_ACCEPTED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
PAYMENT_PENDING → PREPARING | CANCELLED  (exists but unreachable from checkout)
DELIVERED/COMPLETED → DISPUTED
```

**Finding**: `PAYMENT_PENDING` already exists in the transition map with transitions to `PREPARING` and `CANCELLED`. However, it is unreachable from the checkout flow. P12 must wire it into the checkout → merchant acceptance pipeline.

### 3.3 Checkout Flow

- Single atomic transaction: master order + sub-orders + items + financials + status history + cart conversion
- Idempotency key + request fingerprint (SHA-256)
- `computeOrderFinancials()` called per sub-order
- Post-transaction: auto-advance SUBMITTED → PENDING_CONFIRMATION, merchant notification
- **No payment step exists** — order is created and immediately advances to PENDING_CONFIRMATION

### 3.4 Financial Calculation Engine (`order-pricing.ts`)

- Integer minor units throughout — correct
- VAT: `Math.round(taxable * vatRate)` where taxable = netGoods + deliveryFee
- Commission: `Math.round(netGoods * commissionRate)` on net goods only
- Discount clamped to [0, subtotal]
- All outputs non-negative integers

### 3.5 Inventory

- `inventory_items`: qtyOnHand, qtyReserved per (variant, warehouse)
- `stock_movements`: append-only ledger (SALE, CANCEL, ADJUSTMENT, RELEASE)
- Reservation at merchant acceptance, settlement at DELIVERED/CANCELLED/REJECTED
- M7.3-C: return conditions (GOOD, DAMAGED, DEFECTIVE, UNSALEABLE) with write-off logic

### 3.6 Outbox

- `outbox_events`: event_type, aggregate_id, payload, status, attempts, lease (lockedAt/lockedBy)
- Transactional writes (inside DB transaction)
- Dispatcher: 1s poll, FOR UPDATE SKIP LOCKED, exponential backoff
- Tenant-scoped (organizationId, storeId)

---

## 4. Provider Evaluation

### 4.1 Deployment Context: Syria

Syria presents unique payment constraints:
- Banking infrastructure is fragmented and unreliable
- International payment providers (Stripe, etc.) do not operate in Syria
- Syrian Pound (SYP) is volatile with multiple exchange rates
- Cash-based economy dominates B2B transactions
- Bank transfers work but require manual confirmation (no automated clearing)
- Third-party voucher systems (hawala, money exchange offices) are common
- Digital payment gateways are emerging but unstable

### 4.2 Provider Evaluation Matrix

| Criterion | Manual Verification | Bank Transfer (auto) | Moyasar | Tap | Stripe |
|-----------|:---:|:---:|:---:|:---:|:---:|
| Syria availability | ✅ Always | ✅ Mostly | ❌ No | ❌ No | ❌ No |
| SAR/SYP support | ✅ Any | ✅ Any | SAR only | SAR/SYP | Multi |
| Payment Intent model | N/A | N/A | ✅ Yes | ✅ Yes | ✅ Yes |
| Webhook support | N/A | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| Manual verification | ✅ Native | ❌ No | ❌ No | ❌ No | ❌ No |
| Cash on delivery | ✅ Native | ❌ No | ❌ No | ❌ No | ❌ No |
| Voucher support | ✅ Native | ❌ No | ❌ No | Partial | ❌ No |
| PCI scope | None | None | SAQ-A | SAQ-A | SAQ-A |
| Marketplace model | Flexible | N/A | Connect-like | Ghazal | Connect |
| Operational in Syria | ✅ | ⚠️ Intermittent | ❌ | ❌ | ❌ |

### 4.3 Selected Provider

```text
SELECTED PROVIDER: Hybrid — Manual Verification (primary) + Digital Gateway (secondary/optional)
REASON: Syria deployment requires manual payment verification as the primary path.
        No international digital provider operates reliably in Syria.
        The architecture must treat manual verification as a first-class payment method,
        not a fallback. Digital gateway integration is deferred to when/where infrastructure stabilizes.
ALTERNATIVES CONSIDERED: Moyasar (KSA-native, excellent API, but Syria-unavailable),
        Tap Payments (regional, good marketplace model, but Syria-unavailable)
REJECTED ALTERNATIVES: Stripe (no Syria presence), direct bank integration (no automated
        clearing in Syria), cryptocurrency (regulatory risk)
```

### 4.4 Digital Gateway Future Path

When the platform expands beyond Syria, a digital gateway (Moyasar or Tap for KSA/GCC) can be added by implementing the `PaymentProvider` interface (§18). The manual verification provider remains the default for Syria operations. No structural architecture change is needed — only a new provider adapter.

---

## 5. Merchant-of-Record Decision

```text
MERCHANT OF RECORD: SCS Platform

The SCS Platform is the merchant of record. The platform:
- Presents the total to the buyer at checkout
- Receives payment (whether manual or digital) on behalf of the merchant
- Tracks what is owed to each merchant (settlement)
- Deducts platform commission before settlement

This is a marketplace model, not a direct seller model.
```

**Rationale**: The platform already splits master orders into per-merchant sub-orders with independent financial breakdowns. The platform collects commission (5% default). The merchant-of-record model aligns with this architecture.

---

## 6. Money Flow

### 6.1 Manual Payment (Primary — Syria)

```
Buyer
  │
  ├── Bank Transfer ──► SCS Platform Bank Account
  │                        │
  │                        ├── Buyer uploads transfer receipt
  │                        ├── Admin/Merchant verifies receipt
  │                        └── Payment confirmed → Order proceeds
  │
  ├── Cash on Delivery ──► Merchant collects at delivery
  │                        │
  │                        ├── Merchant confirms cash received
  │                        └── Payment confirmed → Order proceeds
  │
  └── Voucher ──────────► Buyer presents voucher code
                           │
                           ├── System validates voucher
                           ├── Voucher issuer settles with platform
                           └── Payment confirmed → Order proceeds
```

### 6.2 Digital Payment (Secondary — Future/Optional)

```
Buyer
  │
  └── Card/Apple Pay ──► Payment Gateway ──► SCS Platform Account
                                              │
                                              ├── Webhook: payment authorized
                                              ├── Webhook: payment captured
                                              └── Order proceeds
```

### 6.3 Settlement Flow (All Methods)

```
SCS Platform Account (or merchant-collected cash)
  │
  ├── Gross amount per sub-order
  ├── − Platform commission (5% of net goods)
  ├── − Platform fees (delivery fee if applicable)
  ├── − Refunds (if any)
  └── = Merchant amount owed
        │
        └── Tracked in settlement_records (P12: tracking only, no bank payout)
```

---

## 7. Multi-Merchant Payment Model

### 7.1 Decision: One Payment Record Per Sub-Order

```text
SELECTED MODEL: Option B — One payment record per merchant sub-order
```

**Rationale**: 
- Each sub-order has an independent financial breakdown (products, discount, delivery, tax, commission, merchant net)
- Manual verification is inherently per-payment (each bank transfer receipt corresponds to a specific amount/merchant)
- Cash on delivery is collected per merchant at delivery
- Partial merchant acceptance/rejection requires independent payment tracking
- Refund allocation is deterministic per sub-order

### 7.2 Master Order Payment Architecture

```
Master Order (idempotency key, fingerprint)
 ├── Sub-Order A (Merchant A) → Payment Record A (method, status, amount)
 ├── Sub-Order B (Merchant B) → Payment Record B (method, status, amount)
 └── Sub-Order C (Merchant C) → Payment Record C (method, status, amount)
```

### 7.3 Payment Method Selection

At checkout, the buyer selects a payment method **per sub-order** (or globally for all sub-orders, which is then replicated to each sub-order's payment record).

**Supported methods:**
- `BANK_TRANSFER` — buyer transfers to platform bank account, uploads receipt
- `CASH_ON_DELIVERY` — merchant collects cash at delivery
- `VOUCHER` — buyer presents voucher code (validated at checkout or post-checkout)
- `DIGITAL` — payment gateway (future, optional)

### 7.4 Allocation Rules

| Component | Allocation |
|-----------|------------|
| Products | Per sub-order from `order_financial_breakdown.productsMinor` |
| Discount | Per sub-order from `order_financial_breakdown.discountMinor` |
| Shipping | Per sub-order from `order_financial_breakdown.deliveryFeeMinor` |
| Tax (VAT) | Per sub-order from `order_financial_breakdown.taxMinor` |
| Commission | Per sub-order from `order_financial_breakdown.commissionMinor` |
| Merchant Net | Per sub-order from `order_financial_breakdown.merchantNetMinor` |

All allocation is already computed by `computeOrderFinancials()` per sub-order at checkout. No cross-sub-order allocation logic is needed.

### 7.5 Partial Merchant Acceptance + Payment

If Merchant A accepts, Merchant B rejects, Merchant C accepts:

| Merchant | Order Status | Payment Status | Financial Consequence |
|----------|-------------|----------------|----------------------|
| A | ACCEPTED | CONFIRMED | Buyer pays A's sub-order amount |
| B | REJECTED | REFUNDED/CANCELLED | B's sub-order amount is not charged (or refunded if pre-paid) |
| C | ACCEPTED | CONFIRMED | Buyer pays C's sub-order amount |

**For bank transfer**: If the buyer transferred a single lump sum covering all sub-orders, and B rejects, the platform owes B's portion back to the buyer. The `payment_records` table tracks the original amount; a `refunds` record tracks the refund.

**For cash on delivery**: Each merchant collects independently. B simply doesn't collect. No refund needed.

**For voucher**: Voucher is validated for the total amount. If B rejects, the voucher's effective value decreases. Platform tracks the adjustment.

---

## 8. Order/Payment State Machines

### 8.1 Order State Machine (Extended)

The existing 16-status FSM is extended with **two new statuses** for the payment gate:

```
DRAFT
  → SUBMITTED
    → PENDING_CONFIRMATION  (auto-advance, merchant notified)
      → PAYMENT_PENDING     (NEW: awaiting payment confirmation)
        → PAYMENT_CONFIRMED (NEW: payment verified — manual or digital)
          → ACCEPTED | PARTIALLY_ACCEPTED | REJECTED  (merchant decision)
            → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
              → DISPUTED (≤72h window)

Any pre-DELIVERED → CANCELLED
```

**New transitions added to TRANSITIONS map:**

```typescript
PENDING_CONFIRMATION: ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'CANCELLED', 'PAYMENT_PENDING'],
PAYMENT_PENDING: ['PAYMENT_CONFIRMED', 'CANCELLED'],
PAYMENT_CONFIRMED: ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'CANCELLED'],
```

**When payment is not required** (e.g., credit terms, zero-total orders): The existing flow is preserved — `PENDING_CONFIRMATION → ACCEPTED` directly, bypassing payment states.

### 8.2 Payment Record State Machine

```
CREATED          — payment record created at checkout
  → AWAITING_PAYMENT    — buyer notified to pay (bank transfer/COD/voucher)
    → AWAITING_VERIFICATION — payment proof submitted (receipt uploaded, voucher presented)
      → CONFIRMED        — payment verified (by admin, merchant, or system)
      → REJECTED         — payment proof rejected (invalid receipt, insufficient amount)
        → AWAITING_PAYMENT — buyer can re-submit
    → EXPIRED            — payment window elapsed without confirmation
  → PROCESSING          — digital payment in progress (authorization pending)
    → AUTHORIZED          — digital payment authorized
      → CAPTURED          — funds captured
        → PARTIALLY_REFUNDED — partial refund issued
          → REFUNDED        — fully refunded
        → REFUNDED
      → REFUND_FAILED
    → FAILED              — digital payment failed
  → CANCELLED            — payment cancelled (order cancelled before payment)
```

**Terminal states**: CONFIRMED, EXPIRED, CANCELLED, REFUNDED (fully)

### 8.3 Payment Event (Immutable)

Payment events are **append-only** records of every state transition and external signal:

```
PAYMENT_CREATED
PAYMENT_METHOD_SELECTED
PAYMENT_PROOF_SUBMITTED     (bank transfer receipt uploaded)
PAYMENT_VERIFICATION_STARTED (admin began review)
PAYMENT_CONFIRMED            (admin/system verified)
PAYMENT_REJECTED             (admin rejected proof)
PAYMENT_EXPIRED              (timeout)
PAYMENT_AUTHORIZE_REQUESTED  (digital)
PAYMENT_AUTHORIZED           (digital)
PAYMENT_CAPTURED             (digital)
PAYMENT_FAILED               (digital)
PAYMENT_REFUND_REQUESTED
PAYMENT_REFUND_SUCCEEDED
PAYMENT_REFUND_FAILED
PAYMENT_CANCELLED
```

Each event is immutable. Once written, never updated or deleted.

### 8.4 Refund State Machine

```
REQUESTED → PROCESSING → SUCCEEDED
                     → FAILED
```

### 8.5 Settlement State Machine

```
PENDING    — settlement calculated but not yet actionable
CALCULATED — net amount determined (gross − commission − fees − refunds)
DUE        — payment to merchant is due
PAID       — merchant has been paid (manually tracked in P12; automated in P20+)
```

---

## 9. Authorization/Capture Decision

### 9.1 Decision: Model A — Authorize → Confirm → Capture (with manual variant)

```text
SELECTED MODEL: Model A (modified for hybrid)
```

**For manual payments (bank transfer, voucher):**
- "Authorization" = buyer submits payment proof (receipt, voucher code)
- "Capture" = admin/merchant verifies the proof and confirms payment
- No hold/reserve on buyer's funds — the buyer has already transferred

**For cash on delivery:**
- "Authorization" = merchant accepts the order (commitment to deliver)
- "Capture" = merchant confirms cash received at delivery
- No pre-authorization needed — payment and delivery are simultaneous

**For digital payments (future):**
- "Authorization" = gateway authorizes the charge (hold on buyer's card)
- "Capture" = platform captures the authorized amount
- Standard Payment Intent flow

### 9.2 Rationale

This model aligns with the existing merchant acceptance workflow:
- Merchant acceptance already triggers inventory reservation
- Payment confirmation must precede merchant acceptance (buyer has paid)
- The gap between payment and acceptance is where manual verification occurs
- Digital payments can use the same flow with automated authorization/capture

### 9.3 Inventory Implications

- **Inventory reservation** still occurs at merchant acceptance (unchanged from current)
- Merchant acceptance now requires PAYMENT_CONFIRMED status first
- If payment fails or expires, the order is CANCELLED — no inventory is reserved
- If merchant rejects after payment confirmed, refund is triggered

### 9.4 Payment Failure Scenarios

| Scenario | Behavior |
|----------|----------|
| Bank transfer receipt rejected | Buyer can re-submit or cancel. Order stays PAYMENT_PENDING |
| Bank transfer expires (72h) | Order auto-transitions to CANCELLED. Outbox event emitted |
| COD merchant doesn't collect | Order proceeds normally; settlement tracks zero collection |
| Voucher invalid | Checkout rejects. If post-checkout: payment REJECTED, buyer must re-pay |
| Digital auth fails | Buyer redirected to retry. Order stays PAYMENT_PENDING |
| Digital capture fails after auth | Void authorization. Refund if already captured. Order → CANCELLED |

---

## 10. Checkout Integration

### 10.1 Modified Checkout Flow

```
1. Buyer submits checkout (existing: cart, address, fulfillment, shipping)
2. Buyer selects payment method (NEW: per sub-order or global)
3. Checkout transaction (existing atomic transaction):
   a. Create master_orders row
   b. For each store: create orders row, order_items, order_financial_breakdown
   c. Create payment_records row per sub-order (NEW)
   d. Set order status = SUBMITTED
   e. Mark cart CONVERTED
   f. Write outbox event: order.submitted
4. Post-transaction (existing):
   a. Auto-advance: SUBMITTED → PENDING_CONFIRMATION
   b. Notify merchants
5. NEW — Payment gating:
   a. If method = CASH_ON_DELIVERY:
      → Order proceeds to merchant acceptance (no payment gate)
      → payment_record.status = AWAITING_PAYMENT (will be confirmed at delivery)
   b. If method = BANK_TRANSFER:
      → Order transitions: PENDING_CONFIRMATION → PAYMENT_PENDING
      → Buyer shown bank details + upload receipt UI
      → Outbox event: payment.awaiting_verification
   c. If method = VOUCHER:
      → Order transitions: PENDING_CONFIRMATION → PAYMENT_PENDING
      → Buyer enters voucher code
      → System validates voucher → auto-confirms or requires manual review
   d. If method = DIGITAL:
      → Order transitions: PENDING_CONFIRMATION → PAYMENT_PENDING
      → Payment intent created via provider adapter
      → Buyer redirected to payment page
```

### 10.2 COD Special Case

Cash on delivery bypasses the payment gate because payment occurs at the point of delivery. The order flows directly from PENDING_CONFIRMATION to merchant acceptance. The payment record is created with status AWAITING_PAYMENT and is confirmed when the merchant confirms cash collection at delivery.

**Financial implication**: COD orders have settlement risk — the merchant collects cash but may not remit to the platform. P12 tracks this in settlement_records. Actual collection enforcement is a business process, not a system constraint.

### 10.3 Idempotency

The existing checkout idempotency architecture (idempotency key + fingerprint) is preserved. The payment record is created inside the same atomic transaction. Replaying the same idempotency key returns the same order with the same payment record.

---

## 11. Financial Authority

### 11.1 Single Source of Truth

| Field | Authoritative Source | Mutable Until |
|-------|---------------------|---------------|
| Subtotal | `order_financial_breakdown.productsMinor` | Payment confirmation |
| Discount | `order_financial_breakdown.discountMinor` | Payment confirmation |
| Net Goods | Computed: products − discount | Payment confirmation |
| Shipping | `order_financial_breakdown.deliveryFeeMinor` | Payment confirmation |
| VAT | `order_financial_breakdown.taxMinor` | Payment confirmation |
| Total | `order_financial_breakdown` totalMinor (= taxable + tax) | Payment confirmation |
| Commission | `order_financial_breakdown.commissionMinor` | Payment confirmation |
| Merchant Net | `order_financial_breakdown.merchantNetMinor` | Payment confirmation |
| Buyer Paid | `payment_records.confirmed_amount_minor` | Never (after confirmation) |
| Refunded | SUM(`refunds.amount_minor`) WHERE status=SUCCEEDED | Append-only |
| Outstanding | Buyer Paid − Refunded | Derived |
| Settlement Amount | `settlement_records.net_minor` | Calculated, then immutable |

### 11.2 Financial Immutability Rule

**`order_financial_breakdown` becomes immutable when `payment_records.status = CONFIRMED`.**

At that point:
- `order_financial_breakdown.finalizedAt` is set to the confirmation timestamp
- No further UPDATE is permitted on the breakdown row
- Any financial adjustment (refund, correction) is recorded as an append-only entry in the `refunds` or `adjustments` table
- The original breakdown is never modified

**Enforcement**: A database-level trigger or application-level guard prevents UPDATE on `order_financial_breakdown` WHERE `finalized_at IS NOT NULL`.

### 11.3 Partial Acceptance Financial Recalculation

The existing `partiallyAcceptOrder()` recalculates financials when a merchant confirms fewer items than ordered. This recalculation is permitted **only before payment confirmation**. Once payment is confirmed:
- Partial acceptance triggers a refund for the unconfirmed portion
- The original financial breakdown remains immutable
- The refund amount is recorded in `refunds`

---

## 12. Immutable Financial Model

### 12.1 When Values Become Immutable

| Event | What Becomes Immutable |
|-------|----------------------|
| Checkout | Financial breakdown is written (mutable until payment confirmation) |
| Payment confirmation | `finalizedAt` set. Breakdown is now immutable |
| Order completion | No further changes permitted on any financial field |

### 12.2 Post-Confirmation Adjustments

After payment confirmation, corrections use **append-only adjustment records**:

```
REFUND         — money returned to buyer (full or partial)
ADJUSTMENT     — platform-initiated correction (e.g., pricing error discovered post-facto)
COMMISSION_ADJ — commission rate correction
FEE_ADJUSTMENT — fee correction
SETTLEMENT     — merchant payout record
```

Each adjustment record contains:
- `id`, `payment_record_id`, `order_id`
- `type` (REFUND, ADJUSTMENT, etc.)
- `amount_minor`, `currency`
- `reason`
- `created_by`, `created_at`
- Immutable once written

### 12.3 Correction Protocol

If a financial error is discovered after payment confirmation:
1. DO NOT update `order_financial_breakdown`
2. Create an adjustment record with the correction amount
3. If the buyer overpaid: create a refund record
4. If the buyer underpaid: create an outstanding balance record
5. All adjustments are auditable via `payment_events`

---

## 13. Ledger Model

### 13.1 Decision: Option A — Immutable Snapshot + Append-Only Ledger

```text
SELECTED MODEL: Option A
```

**What is immutable:**
- `order_financial_breakdown` after `finalizedAt` is set (at payment confirmation)

**What is append-only:**
- `payment_records` — payment lifecycle (status transitions are new rows or immutable state changes)
- `payment_events` — every signal received (webhook, manual verification, system event)
- `refunds` — refund records (never updated, only status transitions)
- `settlement_records` — settlement calculations (immutable once calculated)
- `stock_movements` — inventory ledger (already append-only)
- `order_status_history` — order FSM transitions (already append-only)

**What is derived:**
- Outstanding balance = SUM(confirmed payments) − SUM(successful refunds)
- Merchant amount owed = SUM(sub-order merchant net) − SUM(refunds allocated to merchant)
- Platform revenue = SUM(commission) + SUM(fees)

**What is mutable operational state:**
- `orders.status` — FSM transitions (controlled by assertTransition)
- `payment_records.status` — payment lifecycle (controlled by payment state machine)
- `orders.metadata` — operational notes

### 13.2 Source of Truth Hierarchy

1. `payment_records` + `payment_events` = what was paid and when
2. `order_financial_breakdown` (finalized) = what was agreed at checkout
3. `refunds` = what was returned
4. `settlement_records` = what is owed to merchants
5. Derived values = computed from the above on read

---

## 14. Manual Payment Verification Workflow

### 14.1 Bank Transfer Flow

```
1. Checkout: payment_method = BANK_TRANSFER
2. Order → PAYMENT_PENDING
3. System displays platform bank details to buyer:
   - Bank name, account number, IBAN, account holder
   - Reference: order number or payment record ID
   - Amount: totalMinor in display currency
   - Deadline: 72 hours from checkout
4. Buyer transfers funds externally
5. Buyer uploads transfer receipt via:
   POST /v1/payments/:id/proof
   Body: { receiptUrl, receiptReference, notes }
6. payment_record.status → AWAITING_VERIFICATION
7. payment_events: PAYMENT_PROOF_SUBMITTED
8. Admin/Merchant reviews receipt:
   POST /v1/admin/payments/:id/verify
   Body: { decision: CONFIRMED | REJECTED, notes, verifiedAmountMinor }
9. If CONFIRMED:
   - payment_record.status → CONFIRMED
   - payment_record.confirmed_at = now
   - order_financial_breakdown.finalized_at = now
   - Order transitions: PAYMENT_PENDING → PAYMENT_CONFIRMED → PENDING_CONFIRMATION
   - Merchant notified
   - payment_events: PAYMENT_CONFIRMED
10. If REJECTED:
    - payment_record.status → REJECTED
    - Buyer notified, can re-submit
    - payment_events: PAYMENT_REJECTED
```

### 14.2 Cash on Delivery Flow

```
1. Checkout: payment_method = CASH_ON_DELIVERY
2. payment_record.status = AWAITING_PAYMENT
3. Order proceeds directly to merchant acceptance (no payment gate)
4. Merchant accepts → inventory reserved → fulfillment begins
5. At delivery: merchant collects cash from buyer
6. Merchant confirms cash collection:
   POST /v1/payments/:id/confirm-cash
   Body: { amountCollectedMinor, notes }
7. payment_record.status → CONFIRMED
8. payment_record.confirmed_amount_minor = amountCollectedMinor
9. settlement_records created for merchant
10. payment_events: PAYMENT_CONFIRMED (cash)
```

### 14.3 Voucher Flow

```
1. Checkout: payment_method = VOUCHER
2. Buyer enters voucher code
3. System validates voucher:
   - Code exists and is active
   - Voucher amount >= order total
   - Voucher has not been fully redeemed
4. If valid:
   - payment_record.status → CONFIRMED (auto-confirmed)
   - Voucher balance decremented
   - Order transitions: PAYMENT_PENDING → PAYMENT_CONFIRMED
5. If invalid:
   - Checkout rejects with error
   - Buyer must select different payment method
```

### 14.4 Verification Authorization

| Action | Who Can Perform |
|--------|----------------|
| Submit payment proof (bank transfer) | Buyer (order owner) |
| Verify bank transfer | ADMIN, SUPER_ADMIN, or MERCHANT_OWNER of the selling store's org |
| Confirm cash collection | MERCHANT_OWNER/STAFF of the selling store's org, or DRIVER |
| Reject payment proof | ADMIN, SUPER_ADMIN |
| Override any payment status | SUPER_ADMIN only |

### 14.5 Audit Trail

Every manual verification action is recorded in:
1. `payment_events` — append-only payment lifecycle
2. `audit_logs` — platform audit trail (action, actor, resource)
3. `order_status_history` — order FSM transitions

Manual verification entries include:
- `actor_id` (who verified)
- `actor_type` (ADMIN, MERCHANT, SYSTEM)
- `verification_notes` (free-text justification)
- `verified_amount_minor` (may differ from requested — partial verification)
- `receipt_url` (for bank transfers — stored reference)
- `ip_address` (from request context)

---

## 15. Refund Architecture

### 15.1 Refund Scope

P12 implements basic full and partial refunds. Full returns/disputes workflow is P13.

### 15.2 Refund Rules

| Rule | Value |
|------|-------|
| Who can request | BUYER (own orders), ADMIN (any order) |
| Who can approve | ADMIN, SUPER_ADMIN |
| Maximum refundable | `payment_record.confirmed_amount_minor` − SUM(previous refunds) |
| Full refund | Entire confirmed amount |
| Partial refund | Any amount up to maximum |
| Multiple partial refunds | Permitted, total must not exceed confirmed amount |
| Refund method | Same as original payment method (bank transfer → bank refund, COD → cash return) |
| Refund timing | Immediate for manual; provider-mediated for digital |
| Refund reason | Required (from controlled vocabulary) |

### 15.3 Refund Reasons (Controlled Vocabulary)

```
CUSTOMER_REQUEST
MERCHANT_UNABLE_TO_FULFILL
OUT_OF_STOCK
PRICE_ERROR
PAYMENT_ERROR
DUPLICATE_CHARGE
PRODUCT_NOT_AS_DESCRIBED
SYSTEM_ERROR
ADMINISTRATIVE
OTHER
```

### 15.4 Refund + Partial Merchant Acceptance

If a merchant partially accepts (confirms fewer items), and payment was already collected:
- The unconfirmed portion triggers an automatic refund
- Refund amount = original payment − confirmed portion financial total
- Refund is recorded in `refunds` table
- Buyer is notified

### 15.5 Refund Idempotency

Each refund has a unique `idempotency_key`. Repeated requests with the same key return the existing refund record. The `refunds` table has a UNIQUE constraint on `idempotency_key`.

### 15.6 Refund Reconciliation

A scheduled job compares local refund records against provider refund status (for digital payments). For manual refunds, the admin dashboard shows outstanding refund requests.

---

## 16. Settlement Architecture

### 16.1 Settlement Calculation

After payment confirmation and order completion (DELIVERED → COMPLETED):

```
Gross buyer payment (confirmed_amount_minor)
  − Refunds (SUM of successful refund amounts)
  − Platform commission (commissionMinor from financial breakdown)
  − Platform fees (deliveryFeeMinor if platform delivery)
  = Merchant amount owed (net_minor)
```

### 16.2 Settlement Record

```
settlement_records:
  id                    UUID PK
  sub_order_id          UUID FK → orders.id
  payment_record_id     UUID FK → payment_records.id
  merchant_store_id     UUID FK → stores.id
  gross_minor           BIGINT (buyer's payment for this sub-order)
  refund_minor          BIGINT (total refunds against this sub-order)
  commission_minor      BIGINT (platform commission)
  fee_minor             BIGINT (platform delivery fee if applicable)
  net_minor             BIGINT (gross − refund − commission − fee)
  currency              CHAR(3)
  status                VARCHAR(24) (PENDING, CALCULATED, DUE, PAID)
  calculated_at         TIMESTAMPTZ
  paid_at               TIMESTAMPTZ (NULL until manually marked paid)
  payment_reference     TEXT (manual payout reference — check number, transfer ID)
  notes                 TEXT
  created_at            TIMESTAMPTZ
  updated_at            TIMESTAMPTZ
```

### 16.3 P12 Scope

P12 implements settlement **tracking only**:
- Calculate what is owed to each merchant
- Display settlement status in admin and merchant portals
- Allow admin to mark settlements as PAID (manual bank transfer, check, etc.)
- Record payment reference for audit

P12 does **NOT** implement:
- Automated bank payout to merchants
- Scheduled settlement runs
- Multi-currency settlement

### 16.4 COD Settlement Special Case

For cash on delivery:
- Merchant collects cash directly from buyer
- `gross_minor` = confirmed cash amount
- Merchant owes platform: commission + fees
- Net settlement can be negative (merchant owes platform money)
- Admin tracks outstanding merchant balances

---

## 17. Commission Architecture

### 17.1 Commission Calculation

Commission is calculated by `computeOrderFinancials()` at checkout:

```
commissionMinor = Math.round(netGoods * commissionRate)
```

Where:
- `netGoods` = productsMinor − discountMinor
- `commissionRate` = `COMMISSION_RATE` env var (default 0.05 = 5%)
- Commission is on **net goods only** — VAT and delivery are NOT commissionable

### 17.2 Commission Collection

Commission is tracked, not collected, in P12:
- `order_financial_breakdown.commissionMinor` records the commission amount
- `settlement_records.commission_minor` records the commission deducted
- Actual commission collection happens through settlement (platform retains commission before paying merchant)

### 17.3 Commission After Refund

If a refund is issued:
- Commission is recalculated on the post-refund net goods amount
- Commission adjustment = original commission − recalculated commission
- The adjustment is recorded in `refunds` (as a commission reduction)

---

## 18. Payment Provider Abstraction

### 18.1 Interface

```typescript
interface PaymentProvider {
  readonly key: string;  // 'manual', 'moyasar', 'tap', 'stripe'
  
  createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntentResult>;
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult>;
  cancelPayment(providerPaymentId: string): Promise<void>;
  refund(params: RefundParams): Promise<RefundResult>;
  
  // Webhook handling (no-op for manual provider)
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;
  parseWebhookEvent(rawBody: Buffer): ParsedWebhookEvent;
}
```

### 18.2 Manual Verification Provider (Default)

```typescript
class ManualVerificationProvider implements PaymentProvider {
  readonly key = 'manual';
  
  async createPaymentIntent(params): Promise<PaymentIntentResult> {
    // Creates a payment_record with status AWAITING_PAYMENT
    // Returns bank details / payment instructions
  }
  
  async getPaymentStatus(): Promise<PaymentStatusResult> {
    // Returns current payment_record status
  }
  
  async cancelPayment(): Promise<void> {
    // Sets payment_record status to CANCELLED
  }
  
  async refund(params): Promise<RefundResult> {
    // Creates a refund record (manual processing)
  }
  
  verifyWebhookSignature(): boolean { return true; }  // N/A for manual
  parseWebhookEvent(): ParsedWebhookEvent { /* N/A */ }
}
```

### 18.3 Provider Registry

```typescript
class PaymentProviderRegistry {
  private providers = new Map<string, PaymentProvider>();
  
  register(provider: PaymentProvider): void;
  get(key: string): PaymentProvider;
  getDefault(): PaymentProvider;  // Returns 'manual' provider
}
```

### 18.4 Replaceability

Business logic depends only on the `PaymentProvider` interface, never on concrete provider classes. The provider is selected per payment record based on `payment_method`. Adding a new provider (e.g., Moyasar for KSA expansion) requires only implementing the interface and registering it.

---

## 19. Webhook Architecture

### 19.1 Scope

Webhooks are relevant only for digital payment providers. The manual verification provider does not use webhooks.

### 19.2 Webhook Security (Digital Path)

When a digital provider is configured:

| Requirement | Implementation |
|-------------|---------------|
| Signature verification | Provider-specific HMAC verification on raw body |
| Replay protection | Timestamp validation (±5 minutes) |
| Event deduplication | `payment_events.provider_event_id` UNIQUE constraint |
| Tenant routing | Payment record → order → store → org |
| Rate limiting | Existing throttle guard on webhook endpoint |
| Raw body handling | NestJS raw body parser for signature verification |

### 19.3 Webhook Processing

```
1. Receive webhook POST
2. Verify signature (reject if invalid → 401)
3. Parse event body
4. Check deduplication (provider_event_id already processed → 200 OK, skip)
5. Look up payment_record by provider_payment_id
6. If not found → 404 (log for investigation)
7. Process event based on type:
   - payment.authorized → payment_record.status = AUTHORIZED
   - payment.captured → payment_record.status = CAPTURED, trigger order transition
   - payment.failed → payment_record.status = FAILED, notify buyer
   - payment.refunded → create refund record
8. Write payment_event (append-only)
9. Write outbox event (payment.webhook_received)
10. Return 200 OK
```

### 19.4 Webhook Failure Handling

| Scenario | Behavior |
|----------|----------|
| Signature invalid | Reject immediately (401). Log. Do not process |
| Event duplicated | Return 200. Skip processing. Log dedup hit |
| Event unknown | Log warning. Return 200. Do not reject |
| Event malformed | Return 400. Log full payload for investigation |
| Event out of order | Process based on current payment_record state. Reject if invalid transition |
| References unknown payment | Return 404. Log. Create reconciliation alert |
| Event after refund | Process normally (refunds are additive) |
| Event after cancellation | Reject if payment already CANCELLED. Log |
| Contradictory events | Process in received order. Last consistent state wins. Flag for reconciliation |

---

## 20. Idempotency Architecture

### 20.1 Payment Intent Creation

- `payment_records.idempotency_key` UNIQUE constraint
- Key = checkout idempotency key (shared with master_orders)
- 100 concurrent requests with same key → exactly 1 payment record created
- PostgreSQL unique violation → return existing record

### 20.2 Manual Verification

- `payment_records.id` is the verification target
- Only one admin can verify at a time (optimistic lock: `UPDATE WHERE status = AWAITING_VERIFICATION`)
- Concurrent verify attempts → ConflictException (409)

### 20.3 Capture (Digital)

- `payment_records.provider_capture_id` UNIQUE constraint
- Capture request includes idempotency key
- Provider-level idempotency (provider returns existing capture)

### 20.4 Refund

- `refunds.idempotency_key` UNIQUE constraint
- Total refunded tracked: `SUM(amount_minor) WHERE status IN ('PROCESSING', 'SUCCEEDED')`
- Refund request rejected if `amount > confirmed_amount − already_refunded`
- Concurrent refund requests: PostgreSQL unique constraint + row-level locking

### 20.5 Reconciliation

- Reconciliation job is idempotent (safe to run repeatedly)
- Uses `payment_records.last_reconciled_at` to track last check
- No state mutation unless divergence detected

---

## 21. Reconciliation Architecture

### 21.1 Purpose

Detect divergence between local payment state and external reality.

### 21.2 Manual Payment Reconciliation

For manual payments, reconciliation detects:
- Payments in PAYMENT_PENDING for longer than the timeout window (72h default)
- Payment proofs submitted but not verified within SLA
- Orders in PAYMENT_CONFIRMED without corresponding settlement records

### 21.3 Digital Payment Reconciliation (Future)

For digital payments:
- Query provider API for payment status
- Compare with local `payment_records.status`
- Flag divergence for admin review
- Never auto-correct — always require human confirmation for financial state changes

### 21.4 Recovery Actions

| Local State | Provider State | Action |
|-------------|---------------|--------|
| PAYMENT_PENDING | N/A (manual) | Auto-expire after 72h |
| AWAITING_VERIFICATION | N/A | Escalate to admin after 24h |
| PROCESSING | CAPTURED (provider) | Admin confirms locally |
| PROCESSING | FAILED (provider) | Admin marks failed locally |
| CAPTURED | REFUNDED (provider) | Create local refund record |

### 21.5 Admin Recovery

Admin dashboard shows:
- Stale PAYMENT_PENDING orders (>72h)
- Unverified payment proofs (>24h)
- Divergent payment states (digital)
- Manual "force confirm" / "force fail" actions (SUPER_ADMIN only)
- All recovery actions logged in `payment_events` and `audit_logs`

---

## 22. Failure Model

### 22.1 Error Classification

Following the existing shipping/carrier error classification pattern:

| Classification | Examples | Behavior |
|---------------|----------|----------|
| **RETRYABLE** | Network timeout, HTTP 503, temporary provider outage | Exponential backoff retry |
| **TERMINAL** | Invalid signature, insufficient funds, expired card, rejected proof | No retry. Notify user |
| **INDETERMINATE** | HTTP 500, timeout with unknown state, connection reset | Reconciliation required. Do not assume success or failure |

### 22.2 Specific Failure Scenarios

| Failure | Classification | Action |
|---------|---------------|--------|
| Provider timeout | INDETERMINATE | Do not assume payment succeeded. Mark PROCESSING. Reconcile |
| DNS failure | RETRYABLE | Retry with backoff |
| Connection refused | RETRYABLE | Retry with backoff |
| HTTP 5xx | RETRYABLE | Retry with backoff (max 5 attempts) |
| HTTP 4xx | TERMINAL | Do not retry. Return error to caller |
| Malformed response | TERMINAL | Log full response. Alert admin |
| Signature failure | TERMINAL | Reject webhook. Log |
| Webhook timeout | INDETERMINATE | Provider will retry webhook. Dedup on event ID |
| Duplicate webhook | TERMINAL | Return 200. Skip processing |
| Provider outage | RETRYABLE | Circuit breaker. Reconcile when back |
| Local DB failure after provider success | INDETERMINATE | Reconciliation detects divergence |
| Worker crash | INDETERMINATE | Outbox retry on restart. Idempotency prevents duplication |
| Process restart | RETRYABLE | Outbox dispatcher resumes. Lease-based claiming |

### 22.3 Invariant

**Never automatically assume a payment succeeded because an HTTP request timed out.** This is the same conservative principle used in the shipping/carrier integration.

---

## 23. Security Model

### 23.1 Payment IDOR Protection

- Every payment API endpoint validates: `payment_record.order.buyerId === caller.id` (buyer) or tenant scope (merchant/admin)
- Cross-store payment access blocked by `assertStoreInOrg()`
- Cross-organization access blocked by `isTenantPrivileged()` check

### 23.2 Amount Integrity

- **Buyer-supplied amounts are NEVER trusted for financial operations**
- The server resolves the authoritative amount from `order_financial_breakdown`
- Refund amount validated against `confirmed_amount − already_refunded` (server-side)
- Payment proof amount is compared against expected total (advisory, not blocking — admin verifies)

### 23.3 Webhook Forgery Prevention (Digital)

- HMAC signature verification on raw request body
- Timestamp validation (±5 minutes)
- Event ID deduplication (UNIQUE constraint)
- Provider-specific secret management (env vars, encrypted at rest)

### 23.4 Manual Verification Security

- Only ADMIN/SUPER_ADMIN or store-owner can verify payments
- Verification requires explicit action (POST with decision)
- All verification actions logged with actor, timestamp, IP, notes
- SUPER_ADMIN can override any payment state (break-glass)
- Receipt uploads stored with integrity hash

### 23.5 Tenant Isolation

- Payment records scoped to sub-order → store → organization
- Admin financial views filtered by organization membership
- Merchant financial views filtered to own stores only
- Buyer financial views filtered to own orders only

---

## 24. PCI Boundary

### 24.1 What SCS Stores

```
SCS stores:
- payment_record.id (internal UUID)
- payment_record.provider_payment_id (provider reference, if digital)
- payment_record.status
- payment_record.amount_minor
- payment_record.currency
- payment_record.payment_method (BANK_TRANSFER, COD, VOUCHER, DIGITAL)
- payment_record.receipt_url (buyer-uploaded proof, if bank transfer)
- payment_event records (append-only lifecycle)
- timestamps
```

### 24.2 What SCS Does NOT Store

```
SCS does NOT store:
- PAN (Primary Account Number)
- CVV/CVC
- Raw card numbers
- Sensitive authentication data
- Bank account numbers (platform's own bank details are configuration, not stored per-payment)
- Full receipt images (stored as object storage references, not inline)
```

### 24.3 PCI Scope

For manual payments: **No PCI scope** — no card data enters the system.
For digital payments (future): **SAQ-A** — provider-hosted payment fields, SCS only handles redirects and webhooks.

---

## 25. Concurrency Model

### 25.1 Payment Intent Creation

**Invariant**: 100 concurrent identical creation requests → exactly 1 chargeable payment record.

**Mechanism**: `payment_records.idempotency_key` UNIQUE constraint. PostgreSQL rejects duplicates. Application catches unique violation (23505) and returns existing record.

### 25.2 Manual Verification

**Invariant**: 100 concurrent verify attempts → exactly 1 verification transition.

**Mechanism**: `UPDATE payment_records SET status = 'CONFIRMED' WHERE id = $1 AND status = 'AWAITING_VERIFICATION'`. Check rowCount. If 0 → concurrent verification already handled.

### 25.3 Capture (Digital)

**Invariant**: 100 concurrent capture attempts → exactly 1 successful capture.

**Mechanism**: `payment_records.provider_capture_id` UNIQUE. Provider-level idempotency. Application-level optimistic lock on status transition.

### 25.4 Refund

**Invariant**: 100 concurrent refund requests for same amount → total successful refund ≤ refundable amount.

**Mechanism**: Row-level lock on `payment_records` during refund calculation. `SELECT confirmed_amount_minor FROM payment_records WHERE id = $1 FOR UPDATE`. Compute `refundable = confirmed − SUM(pending+succeeded refunds)`. Insert refund only if `amount ≤ refundable`.

### 25.5 Payment vs Cancellation

**Invariant**: Concurrent payment confirmation and order cancellation must have deterministic outcome.

**Mechanism**: Both operations acquire row-level lock on `orders` via `SELECT ... FOR UPDATE`. If payment confirms first → cancellation blocked (order is past payment gate). If cancellation first → payment confirmation blocked (order is CANCELLED).

### 25.6 Payment vs Merchant Rejection

**Invariant**: If payment is confirmed but merchant rejects, refund must be deterministic.

**Mechanism**: Merchant rejection after PAYMENT_CONFIRMED triggers automatic refund creation. The rejection transaction checks `payment_record.status` and creates refund if CONFIRMED.

---

## 26. Database Schema Design

### 26.1 New Tables

#### payment_records

```sql
CREATE TABLE IF NOT EXISTS payment_records (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                UUID NOT NULL REFERENCES orders(id),
  provider_key            VARCHAR(40) NOT NULL DEFAULT 'manual',
  provider_payment_id     VARCHAR(200),
  idempotency_key         VARCHAR(120) UNIQUE,
  payment_method          VARCHAR(24) NOT NULL,  -- BANK_TRANSFER, COD, VOUCHER, DIGITAL
  status                  VARCHAR(30) NOT NULL DEFAULT 'CREATED',
  amount_minor            BIGINT NOT NULL,
  currency                CHAR(3) NOT NULL,
  confirmed_amount_minor  BIGINT,
  failure_code            VARCHAR(40),
  failure_reason          TEXT,
  receipt_url             TEXT,           -- buyer-uploaded proof
  receipt_reference       VARCHAR(200),   -- buyer-provided transfer reference
  voucher_code            VARCHAR(100),
  verified_by             UUID REFERENCES users(id),
  verified_at             TIMESTAMPTZ,
  verification_notes      TEXT,
  expires_at              TIMESTAMPTZ,
  confirmed_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  last_reconciled_at      TIMESTAMPTZ,
  metadata                JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### payment_events

```sql
CREATE TABLE IF NOT EXISTS payment_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_record_id     UUID NOT NULL REFERENCES payment_records(id),
  event_type            VARCHAR(40) NOT NULL,
  provider_event_id     VARCHAR(200) UNIQUE,  -- dedup for digital webhooks
  from_status           VARCHAR(30),
  to_status             VARCHAR(30) NOT NULL,
  actor_id              UUID REFERENCES users(id),
  actor_type            VARCHAR(16) NOT NULL DEFAULT 'SYSTEM',
  amount_minor          BIGINT,
  notes                 TEXT,
  receipt_url           TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### refunds

```sql
CREATE TABLE IF NOT EXISTS refunds (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_record_id     UUID NOT NULL REFERENCES payment_records(id),
  order_id              UUID NOT NULL REFERENCES orders(id),
  idempotency_key       VARCHAR(120) UNIQUE,
  provider_refund_id    VARCHAR(200),
  amount_minor          BIGINT NOT NULL,
  currency              CHAR(3) NOT NULL,
  status                VARCHAR(24) NOT NULL DEFAULT 'REQUESTED',
  reason                VARCHAR(40) NOT NULL,
  notes                 TEXT,
  requested_by          UUID REFERENCES users(id),
  approved_by           UUID REFERENCES users(id),
  provider_refund_status VARCHAR(40),
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### settlement_records

```sql
CREATE TABLE IF NOT EXISTS settlement_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_order_id          UUID NOT NULL REFERENCES orders(id),
  payment_record_id     UUID NOT NULL REFERENCES payment_records(id),
  merchant_store_id     UUID NOT NULL REFERENCES stores(id),
  gross_minor           BIGINT NOT NULL,
  refund_minor          BIGINT NOT NULL DEFAULT 0,
  commission_minor      BIGINT NOT NULL DEFAULT 0,
  fee_minor             BIGINT NOT NULL DEFAULT 0,
  net_minor             BIGINT NOT NULL,
  currency              CHAR(3) NOT NULL,
  status                VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  calculated_at         TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  payment_reference     TEXT,
  notes                 TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 26.2 Constraints and Indexes

```sql
-- Payment records
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_records_idempotency ON payment_records(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_records_order ON payment_records(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_status ON payment_records(status);
CREATE INDEX IF NOT EXISTS idx_payment_records_method ON payment_records(payment_method);
CREATE INDEX IF NOT EXISTS idx_payment_records_expires ON payment_records(expires_at) WHERE status = 'AWAITING_PAYMENT';

-- Payment events (append-only)
CREATE INDEX IF NOT EXISTS idx_payment_events_record ON payment_events(payment_record_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_provider ON payment_events(provider_event_id) WHERE provider_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_events_type ON payment_events(event_type);

-- Refunds
CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_idempotency ON refunds(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_payment ON refunds(payment_record_id);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);

-- Settlement
CREATE INDEX IF NOT EXISTS idx_settlement_order ON settlement_records(sub_order_id);
CREATE INDEX IF NOT EXISTS idx_settlement_store ON settlement_records(merchant_store_id);
CREATE INDEX IF NOT EXISTS idx_settlement_status ON settlement_records(status);

-- Financial breakdown immutability guard
-- (Application-level: reject UPDATE WHERE finalized_at IS NOT NULL)
```

### 26.3 Foreign Keys and Tenant Boundaries

- `payment_records.order_id` → `orders.id` (CASCADE on delete)
- `payment_events.payment_record_id` → `payment_records.id` (CASCADE)
- `refunds.payment_record_id` → `payment_records.id` (CASCADE)
- `refunds.order_id` → `orders.id` (CASCADE)
- `settlement_records.sub_order_id` → `orders.id` (CASCADE)
- `settlement_records.payment_record_id` → `payment_records.id` (CASCADE)
- `settlement_records.merchant_store_id` → `stores.id` (CASCADE)

All tenant scoping flows through `orders.store_id` → `stores.org_id`. Payment records inherit tenant context from their parent order.

---

## 27. Migration 0058 Design

### 27.1 Migration File

`0058_payment_financial_architecture.sql`

### 27.2 Contents

1. Create `payment_records` table (as defined in §26.1)
2. Create `payment_events` table (as defined in §26.1)
3. Create `refunds` table (as defined in §26.1)
4. Create `settlement_records` table (as defined in §26.1)
5. Create all indexes (§26.2)
6. Add `payment_method` column to `orders` table (VARCHAR(24), nullable for legacy)
7. Add `payment_status` column to `orders` table (VARCHAR(30), nullable for legacy)
8. Update TRANSITIONS map to include new payment states
9. Add CHECK constraint on `payment_records.status` (valid values)
10. Add CHECK constraint on `refunds.amount_minor > 0`

### 27.3 Safety

- All `CREATE TABLE IF NOT EXISTS` — idempotent
- All `CREATE INDEX IF NOT EXISTS` — idempotent
- New columns on `orders` are nullable — compatible with existing rows
- No data migration required for existing orders
- No breaking changes to existing APIs

### 27.4 Rollback Considerations

- New tables can be dropped without affecting existing functionality
- New columns on `orders` can be dropped (nullable, no default dependency)
- No existing data references the new tables

---

## 28. Existing Order / Legacy Data Strategy

### 28.1 Grandfathering

Existing orders (created before P12) are treated as **legacy**:

```
Legacy orders:
  payment_method = NULL (not applicable)
  payment_status = NULL (not applicable)
  No payment_records row exists
```

### 28.2 Rules

- Existing orders continue to function with their current FSM flow
- No payment gate is applied to legacy orders
- Legacy orders display "Payment: N/A (legacy)" in UI
- No fabricated historical payment records
- Existing `order_financial_breakdown` rows remain mutable (they were never finalized)

### 28.3 Migration Compatibility

- `orders.payment_method` is nullable — legacy rows have NULL
- `orders.payment_status` is nullable — legacy rows have NULL
- Application code checks for NULL payment_method → skip payment gate
- `payment_records` has no rows for legacy orders — queries handle absence gracefully

---

## 29. Buyer UX Contract

### 29.1 Buyer Sees

| Screen | Information |
|--------|------------|
| Checkout | Payment method selection (bank transfer, COD, voucher, digital) |
| Post-checkout (bank transfer) | Platform bank details, amount, reference, upload receipt button, deadline |
| Post-checkout (COD) | "Pay on delivery" confirmation. Order tracking |
| Post-checkout (voucher) | Voucher code entry. Confirmation |
| Order detail | Payment status, amount, currency, receipt reference |
| Order detail (after refund) | Refund status, amount, reason |

### 29.2 Buyer Does NOT See

- Merchant settlement amounts
- Commission details
- Other merchants' sub-orders financial details
- Internal verification notes

---

## 30. Merchant UX Contract

### 30.1 Merchant Sees

| Screen | Information |
|--------|------------|
| Order list | Paid orders (payment confirmed), pending payment orders |
| Order detail | Gross, commission, merchant net, payment status |
| Settlement | Settlement records: gross, commission, fees, net, status |
| Cash confirmation | COD orders awaiting cash confirmation at delivery |

### 30.2 Merchant Does NOT See

- Other merchants' financial details
- Platform-wide settlement totals
- Buyer payment proofs (unless merchant is also verifier)

---

## 31. Admin/Finance UX Contract

### 31.1 Admin Sees

| Screen | Information |
|--------|------------|
| Payment list | All payment records across all orders |
| Payment detail | Full lifecycle: events, proofs, verification status |
| Verification queue | Payment proofs awaiting verification |
| Refund list | All refund requests, status |
| Settlement dashboard | All settlement records, status, outstanding |
| Reconciliation | Stale payments, divergent states, recovery actions |

### 31.2 Admin Can Do

| Action | Permission |
|--------|-----------|
| Verify/reject payment proof | ADMIN, SUPER_ADMIN |
| Force-confirm payment | SUPER_ADMIN only |
| Force-fail payment | SUPER_ADMIN only |
| Approve refund | ADMIN, SUPER_ADMIN |
| Mark settlement as paid | ADMIN, SUPER_ADMIN |
| Override any payment state | SUPER_ADMIN only |

---

## 32. Outbox Events

### 32.1 Payment Domain Events

```
payment.created                  — payment record created at checkout
payment.awaiting_payment         — buyer notified to pay
payment.proof_submitted          — buyer uploaded receipt / entered voucher
payment.verification_started     — admin began review
payment.confirmed                — payment verified (manual or digital)
payment.rejected                 — payment proof rejected
payment.expired                  — payment window elapsed
payment.authorized               — digital payment authorized
payment.captured                 — digital payment captured
payment.failed                   — payment failed (any method)
payment.cancelled                — payment cancelled
payment.refund_requested         — refund requested
payment.refund_succeeded         — refund processed
payment.refund_failed            — refund failed
payment.reconciliation_required  — divergence detected
payment.settlement_calculated    — settlement record created
```

### 32.2 Integration with Existing Events

Payment events are published alongside order events:
- `order.submitted` → payment.created (same transaction)
- `payment.confirmed` → order transitions PAYMENT_PENDING → PAYMENT_CONFIRMED
- `payment.failed` → order transitions PAYMENT_PENDING → CANCELLED

### 32.3 Notification Boundary

P12 emits domain events. P14 (notification delivery) consumes them. P12 does NOT implement email/SMS/push delivery.

---

## 33. Observability Requirements

### 33.1 Structured Events

All payment operations emit structured logs:

```
[payment] action=created order_id=... payment_id=... method=BANK_TRANSFER amount_minor=...
[payment] action=proof_submitted payment_id=... receipt_url=...
[payment] action=verified payment_id=... verified_by=... amount_minor=...
[payment] action=confirmed payment_id=... order_id=...
[payment] action=refund_requested payment_id=... refund_id=... amount_minor=...
```

### 33.2 Correlation

- Payment events carry `order_id` and `payment_record_id` for tracing
- Outbox events carry `aggregate_id` = payment_record_id
- Audit logs carry `resource_id` = payment_record_id

### 33.3 Metrics (Future)

P12 does not implement metrics export (P17). However, the event structure is designed so that metrics can be derived later:
- payment.created count / rate
- payment.confirmed mean time to confirm
- payment.expired count
- refund rate

---

## 34. P12 Scope

### 34.1 P12 MUST Include

- Manual payment verification workflow (bank transfer, COD, voucher)
- Payment provider abstraction (interface + manual provider)
- Payment record + event entities
- Immutable financial records (finalizedAt)
- Order FSM extension (PAYMENT_PENDING, PAYMENT_CONFIRMED)
- Basic refunds (full and partial)
- Commission tracking (via existing calculation + settlement)
- Basic settlement tracking (calculation + status, no bank payout)
- Checkout integration (payment method selection)
- Admin verification UI (verify/reject payment proofs)
- Merchant cash confirmation UI
- Migration 0058
- Security (IDOR, tenant isolation, amount integrity)
- Concurrency (idempotency, optimistic locking, row-level locks)
- Outbox events for payment domain
- Legacy order grandfathering

### 34.2 P12 MUST NOT Include

- Digital payment gateway implementation (provider adapter only)
- Actual merchant bank payouts
- Multi-currency support
- Subscriptions / recurring payments
- Escrow
- Full chargeback workflow
- Full returns workflow (P13)
- Full dispute-to-money workflow (P13)
- Notification provider integration (P14)
- Inventory receiving / transfers / cycle counting (P15)
- Mobile search parity (P16)
- XLSX export (P19)
- Merchant analytics (P18)
- Observability platform (P17)
- Unrelated refactoring

---

## 35. Explicitly Deferred Work

| Item | Deferred To | Rationale |
|------|-----------|-----------|
| Digital payment gateway | P12 optional / P13 | Syria infrastructure not ready |
| Merchant bank payouts | P20 | Requires banking integration |
| Multi-currency | P13+ | SYP only for initial deployment |
| Full returns workflow | P13 | Separate from payment |
| Full disputes→money | P13 | Depends on returns |
| Email/SMS/push notifications | P14 | Separate concern |
| Inventory warehouse ops | P15 | Separate concern |
| Chargeback handling | P13+ | Requires digital payments |
| Automated settlement runs | P20 | Manual tracking sufficient for pilot |
| Subscription payments | P13+ | Not in B2B pilot scope |

---

## 36. Acceptance Criteria

### 36.1 Architecture

- [x] Provider model locked: Hybrid manual+digital
- [x] Provider abstraction defined: `PaymentProvider` interface
- [x] Merchant-of-record locked: SCS Platform
- [x] Multi-merchant payment model locked: per sub-order
- [x] Order/payment state machines locked: §8
- [x] Authorization/capture model locked: Model A (modified)
- [x] Refund model locked: §15
- [x] Settlement model locked: §16
- [x] Commission model locked: §17
- [x] Financial authority locked: §11
- [x] Immutability model locked: §12

### 36.2 Database

- [x] Migration 0058 design complete: §27
- [x] payment_records defined: §26.1
- [x] payment_events defined: §26.1
- [x] refunds defined: §26.1
- [x] settlement_records defined: §26.1
- [x] Constraints defined: §26.2
- [x] Indexes defined: §26.2
- [x] Tenant boundaries defined: §26.3

### 36.3 Security

- [x] Webhook security defined: §19
- [x] PCI boundary defined: §24
- [x] Amount integrity defined: §23.2
- [x] IDOR protections defined: §23.1
- [x] Tenant isolation defined: §23.5

### 36.4 Concurrency

- [x] Payment idempotency defined: §20.1
- [x] Verification idempotency defined: §20.2
- [x] Capture race defined: §20.3
- [x] Refund race defined: §20.4
- [x] Cancellation/payment race defined: §25.5
- [x] Merchant rejection/payment race defined: §25.6

### 36.5 Failure Recovery

- [x] Timeout behavior defined: §22
- [x] Provider outage behavior defined: §22
- [x] Webhook retry defined: §19.4
- [x] Reconciliation defined: §21
- [x] Indeterminate payment state defined: §22
- [x] Admin recovery defined: §21.5

### 36.6 Existing Data

- [x] Legacy order strategy defined: §28
- [x] No fabricated historical payments: §28.2
- [x] Existing financial data preserved: §28.3

---

## 37. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Manual verification creates operational bottleneck | HIGH | SLA monitoring, admin queue dashboard, merchant self-verification for own orders |
| COD cash non-remittance by merchant | HIGH | Settlement tracking, merchant agreement, admin oversight |
| SYP currency volatility | MEDIUM | Integer minor units, env-configurable rates, no multi-currency in P12 |
| Bank transfer fraud (fake receipts) | HIGH | Admin verification required, receipt hash, amount matching |
| Voucher system abuse | MEDIUM | Voucher validation at checkout, single-use enforcement |
| Syria sanctions compliance | HIGH | Legal review required before deployment. Platform must comply with applicable sanctions regimes |
| Payment state divergence (manual) | MEDIUM | Reconciliation job, admin dashboard, expiry automation |
| Existing order FSM complexity increase | MEDIUM | Payment states are additive. Legacy orders bypass payment gate. No breaking changes |

---

## 38. Architecture Decisions (ADR-style)

### ADR-P12-001: Hybrid Manual+Digital Payment Model

**Context**: Syria deployment requires non-digital payment paths. International gateways unavailable.  
**Decision**: Manual verification is the primary payment model. Digital gateway is optional/future.  
**Consequence**: Platform can operate without any payment gateway. Operational overhead for verification.

### ADR-P12-002: Per-Sub-Order Payment Records

**Context**: Master orders span multiple merchants. Each has independent financials.  
**Decision**: One payment record per sub-order, not per master order.  
**Consequence**: Deterministic refund/settlement allocation per merchant. Independent payment lifecycle per sub-order.

### ADR-P12-003: Financial Immutability at Payment Confirmation

**Context**: `order_financial_breakdown` is currently mutable. Audit requires immutability after payment.  
**Decision**: `finalizedAt` set when payment confirmed. Application guard prevents further updates.  
**Consequence**: Post-confirmation corrections use append-only adjustment records.

### ADR-P12-004: SYP as Initial Currency

**Context**: Syria deployment. Syrian Pound is the local currency.  
**Decision**: SYP (Syrian Pound), integer minor units (fils). Env-configurable VAT/commission rates.  
**Consequence**: Default values change from SAR/15% to SYP/Syria-appropriate rates.

### ADR-P12-005: COD Bypasses Payment Gate

**Context**: Cash on delivery means payment at point of delivery, not before.  
**Decision**: COD orders skip PAYMENT_PENDING and proceed to merchant acceptance. Payment confirmed at delivery.  
**Consequence**: COD has settlement risk (merchant collects cash). Tracked via settlement_records.

### ADR-P12-006: PAYMENT_PENDING and PAYMENT_CONFIRMED as Order States

**Context**: Payment verification is a gate between checkout and merchant acceptance.  
**Decision**: Add PAYMENT_PENDING and PAYMENT_CONFIRMED to the order FSM.  
**Consequence**: Existing TRANSITIONS map extended. Legacy orders (NULL payment_method) bypass these states.

---

## 39. Final Gate

```
P12 BUSINESS RULES & ARCHITECTURE LOCK = LOCKED / GO

Migration 0058 = REQUIRED
Implementation may begin = YES

Next Gate:
P12 IMPLEMENTATION
```

All business decisions are locked. All state machines are defined. All database schemas are designed. All concurrency invariants are specified. All security boundaries are documented. A coding agent can implement P12 without making unresolved business decisions.

**Key caveat**: Syria sanctions compliance requires legal review before deployment. This is a business/legal gate, not an architecture gate. The architecture supports compliance (audit trails, tenant isolation, manual verification) but legal approval is external to this lock.
