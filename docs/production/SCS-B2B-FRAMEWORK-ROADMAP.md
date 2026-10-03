# SCS-B2B-FRAMEWORK-ROADMAP

## Recommended Roadmap to a Coherent, Production-Ready B2B Platform

| Field | Value |
|-------|-------|
| Source | `SCS-B2B-FRAMEWORK-COMPLETENESS-AUDIT.md` (2026-10-02) |
| Baseline | `develop` @ `d554fd7425664590bceed757facf9a293389f334` (M7.3-B.6 CLOSED/PASS) |
| Nature | RECOMMENDATION ONLY — nothing herein is implemented by the audit |
| Governance | Every milestone should follow the established four-gate pattern: Pre-Implementation Architecture Audit → Business Rules + Architecture Decision Lock → Implementation → Independent Runtime Verification → Release Closure |

---

## 1. Roadmap Logic

The sequence is derived from the audit's dependency analysis, not from re-listing the existing milestone plan:

1. **Visibility before new behavior** — the B.5-verified shipping/RTS backend is unusable by humans; exposing it (R0) is cheaper and higher-value than any new backend.
2. **Close physical loops before financial loops** — returns/restock (R1) complete the goods cycle that refunds (R3) will financially settle.
3. **Payments is the financial root** — refunds, invoices, finance console, and dispute closure all depend on it (R2).
4. **Commercial depth after the spine is stable** — segment pricing, address book, i18n, reporting (R4) ride on stable order/payment contracts.
5. **Product-gated B2B procurement last** — RFQ, approvals, credit require explicit product decisions and, for credit, regulated partners (P7 fence).

No UI work package is scheduled before its backend contract is verified-stable.

---

## 2. Phase R0 — Ship-Ops Visibility (M7.3-B.6) — CLOSED / PASS

**Objective:** make the verified M7.2.3/M7.3 shipping, exception, RTS, and carrier-recovery capabilities operable by humans.

**Status:** CLOSED / PASS — independently runtime-verified and release-closed (2026-10-03). All work packages delivered. Playwright 5/5, API JSON buyer projection verified, tenant isolation verified, full regression suite green.

| ID | Work Package | Why Now | Dependencies | API | UI | DB | Integration | Testing | Exit Criteria |
|----|--------------|---------|--------------|-----|----|----|-------------|---------|---------------|
| R0.1 | Admin Ship-Ops console: shipments list/detail, exception report/retry, RTS queue (approve/reject/complete/LOST), carrier recovery queue | BLOCKING G-01/G-03: ops cannot run delivery | none — B.5 contracts verified | reuse `v1/shipments/*`, `v1/carrier/*` | new admin pages /shipments, /exceptions, /carriers | none | none | component + Playwright | admin executes full RTS lifecycle + recovery action from UI; permission-filtered nav |
| R0.2 | Merchant delivery ops: create/cancel shipment, labels, exception visibility, RTS request/track | BLOCKING G-02: merchants cannot run platform delivery | none | reuse `v1/shipments/*` | merchant /merchant/orders + new /merchant/shipments | none | none | component + Playwright | merchant completes create→label→exception→RTS-request from web |
| R0.3 | Exception/RTS state surfacing for buyers (tracking detail + status labels) | HIGH F-16.5: delivery distress invisible | R0.1 states | reuse tracking endpoints | buyer order tracking | none | none | component | buyer sees exception/RTS states accurately |
| R0.4 | DRIVER provisioning decision + seed/RBAC | MEDIUM G-10: driver flow unprovisioned | product/ops decision | seed script | none | seed data | none | integration | DRIVER role seeded with least-privilege perms or driver flow formally descoped |
| R0.5 | Playwright critical-path suite (checkout→accept→ship→exception→RTS) + refresh stale CAPABILITY-MATRIX | HIGH G-18/G-20 before UI surface doubles | none | none | tests | none | none | E2E suite green in CI | critical ship-ops paths covered; matrix refreshed |

**Prerequisites:** B.5 (done). **Enables:** R1 (RTS actions must exist in UI for return-to-stock operations), R6 (reconciliation UI hooks). **Closure:** `docs/production/SCS-M7.3-B.6-RELEASE-CLOSURE.md`.

---

## 3. Phase R1 — Returns Loop (M7.3-C, as audited)

**Objective:** implement the M7.3-C audit scope — inventory return-to-stock + RTS physical handling (return condition/quantity recording, physical verification).

| ID | Work Package | Why Now | Dependencies | API | UI | DB | Integration | Testing | Exit Criteria |
|----|--------------|---------|--------------|-----|----|----|-------------|---------|---------------|
| R1.1 | Return-to-stock on RTS_COMPLETED with RETURN movements | HIGH X-3: sold-then-returned stock leaks | B.5 (done); R0.2 recommended | extend completeRTS path | merchant/admin confirmation (from R0) | possible migration (condition/qty columns) | none | PG integration + concurrency | 8 audit conditions satisfied; restock atomic with confirmation; ledger correct |
| R1.2 | Return condition + quantity recording | audit BD-B5-006 deferral | R1.1 | RTS complete payload | R0 console fields | as above | none | unit + PG | condition/qty persisted + auditable |
| R1.3 | Post-delivery buyer return request (RMA) — if locked into M7.3-C scope per audit conditions | HIGH G-06 | product lock via four-gate process | new returns endpoints | buyer request + merchant/admin handling | returns tables | none | PG integration | buyer→merchant→receipt→inspection→restock runs E2E |

**Prerequisites:** B.5 (done), four-gate lock per the completed M7.3-C audit. **Enables:** R3 refund linkage (returns financially settle only after refunds exist).

---

## 4. Phase R2 — Financial Foundation (Phase 3 kickoff)

**Objective:** give the platform a real money path — payment provider + COD capture + payment status in the order timeline — plus the notification channels production OTP requires.

| ID | Work Package | Why Now | Dependencies | API | UI | DB | Integration | Testing | Exit Criteria |
|----|--------------|---------|--------------|-----|----|----|-------------|---------|---------------|
| R2.1 | Payment provider integration (hosted SDK; card data never in platform — plan §1380) | BLOCKING G-04: no revenue path | product: provider selection; PCI scope decision | payments module: initiate/confirm/webhook/status | checkout payment step; payment status on timeline | payment_transactions, order payment fields | provider | PG + provider-sandbox E2E | card checkout completes in sandbox; PAYMENT_PENDING becomes reachable; idempotent webhooks |
| R2.2 | COD two-step capture at POD | plan Phase 3 core; KSA-relevant | R2.1 data model | capture endpoints + driver/POD flow | driver/mobile + merchant confirmation | as above | none | PG integration | COD order captured at delivery with audit |
| R2.3 | Fee/VAT correctness (G-23) before money flows | currently zeroed (BG-2) | none | order-pricing fix: zone fees + configurable VAT | checkout displays real amounts | config | none | unit + E2E | financial breakdown equals zone fee + VAT rules |
| R2.4 | SMS provider live wiring + email channel | HIGH G-11: OTP rides a stub today | provider contracts | notifications providers | none | templates | SMS + email | integration (sandbox) | OTP delivered via real provider in staging; email channel available for docs |
| R2.5 | Admin finance console v1: payments monitor, reconciliation view | plan §1380 | R2.1 | admin payments endpoints | admin /finance pages | read views | none | component | admin sees payment states + failures |

**Prerequisites:** product decisions (provider, COD policy). **Enables:** R3 (refunds), invoices, R4 (reporting with revenue), dispute financial closure.

---

## 5. Phase R3 — Refunds & Dispute Closure (M7.3-D + M7.3-E alignment)

| ID | Work Package | Why Now | Dependencies | API | UI | DB | Integration | Testing | Exit Criteria |
|----|--------------|---------|--------------|-----|----|----|-------------|---------|---------------|
| R3.1 | Refund automation (cancellation, RTS, returns) — M7.3-D | BLOCKING G-05: financial closure impossible | R2.1 | refunds endpoints + provider refunds | admin approvals; merchant visibility | refunds tables | provider | PG + sandbox | cancelled/returned orders refund correctly incl. partial |
| R3.2 | Dispute resolution financial levers — M7.3-E | HIGH X-4: disputes resolve with no money lever | R3.1 | dispute-resolve → refund linkage | admin dispute console actions | dispute ↔ refund link | none | PG integration | dispute resolution can issue full/partial refund with audit |
| R3.3 | Invoices + credit notes (PDF, VAT-compliant; Arabic/English when R4.3 lands) | HIGH G-07: B2B buyers require documents | R2.1 | documents service | buyer/admin download | invoices, credit_notes | PDF renderer | snapshot + integration | invoice issued per completed order; credit note per refund |

**Prerequisites:** R2. **Enables:** finance-grade reporting, collections-era features later.

---

## 6. Phase R4 — Commercial Depth & Market Fit

| ID | Work Package | Why Now | Dependencies | API | UI | DB | Integration | Testing | Exit Criteria |
|----|--------------|---------|--------------|-----|----|----|-------------|---------|---------------|
| R4.1 | Buyer address book (org-scoped, multi-location, validated) | MEDIUM G-09: B2B multi-site delivery | none | addresses CRUD + checkout picker | buyer addresses UI | addresses table | none | unit + E2E | org buyer selects saved address at checkout |
| R4.2 | Segment pricing activation (segments entity + resolution + admin assignment) | MEDIUM G-08/X-5: dormant schema | product decision | segments CRUD; resolution filters audience/segment | admin + merchant pricing UI | buyer_segments, price_list links | none | PG integration | segment member sees contract price at PDP/cart/checkout |
| R4.3 | Arabic + RTL i18n across web/admin/mobile (+ Arabic documents) | HIGH G-13: KSA market fit | product decision; translation vendor | none | i18n framework + ar-SA | locale resources | none | visual/E2E | full buyer+merchant journey in Arabic RTL |
| R4.4 | Reporting v1: merchant sales/orders; admin ops dashboard (exception aging, RTS cycle time) | MEDIUM G-19 | R2 (finance data) | report endpoints | merchant + admin dashboards | materialized views | none | integration | dashboards render correct figures vs. DB |
| R4.5 | Buyer-org member management on web (parity) | MEDIUM F-006 | none | reuse org endpoints | web org pages | none | none | component | buyer org admin manages members on web |

**Prerequisites:** R0–R3 for stable base; each item is independently schedulable. **Enables:** R5 targeting, enterprise procurement later.

---

## 7. Phase R5 — Notification Expansion (M7.3-F)

| ID | Work Package | Why Now | Dependencies | API | UI | DB | Integration | Testing | Exit Criteria |
|----|--------------|---------|--------------|-----|----|----|-------------|---------|---------------|
| R5.1 | Event-driven notifications for shipment/RTS/refund/return states (consumes outbox) | MEDIUM G-12/X-8: state changes silent | R0 states surfaced; R2.4 channels | notification subscribers | preferences UI additions | templates | SMS/email/push | integration | each lifecycle event notifies correct party on chosen channel |
| R5.2 | Org-scoped notification routing (merchant staff, buyer org admins) | B2B correctness | R4.5 | routing rules | preferences | none | none | unit | events reach org roles not just individuals |

---

## 8. Phase R6 — Platform Hardening & Ops Maturity

| ID | Work Package | Why Now | Dependencies | API | UI | DB | Integration | Testing | Exit Criteria |
|----|--------------|---------|--------------|-----|----|----|-------------|---------|---------------|
| R6.1 | Reconciliation worker: scheduled recovery-queue sweeps, stale-state detection, alerting | MEDIUM G-22: drift undetected today | R0.3 console; R2.5 | worker + alerts | admin alerts surface | job state | none | integration (clock-injected) | stale carrier states auto-detected + alerted |
| R6.2 | Admin order intervention (defined scope: cancel/force-transition with full audit) | MEDIUM G-17 | product decision | admin transition endpoints | admin order detail actions | audit fields | none | PG integration | admin intervention executes with complete audit trail |
| R6.3 | Feature-flag console | LOW G-21 | none | flags controller | admin settings page | flags (exists) | none | component | ops toggles flags from UI |
| R6.4 | WebSocket E2E verification + realtime hardening (BG-4) | LOW | none | none | none | none | none | WS E2E | order/notification pushes verified E2E |

---

## 9. Phase R7 — Advanced B2B (product-gated; do not start without explicit product lock)

| ID | Work Package | Gate | Notes |
|----|--------------|------|-------|
| R7.1 | RFQ / quotation domain (request→quote→negotiate→accept→convert) | product decision G-14 | absent from authoritative plan; large surface; reuse offer/FSM patterns |
| R7.2 | Buyer-side order approvals + spending limits | product decision G-15 | enterprise procurement tier |
| R7.3 | Bulk CSV/Excel ordering + reorder templates | product decision G-24 | natural extension of import pipeline patterns |
| R7.4 | Trade credit / payment terms / AR aging | **P7 regulated partners only** (documented fence) | do not build in-platform lending |
| R7.5 | Multi-warehouse/branch hierarchy | Phase 7 scope | Phase-1 fence lifts only with plan revision |
| R7.6 | Chat UI over shipped conversations schema | documented fast-follow | low risk, schema ready |

---

## 10. Dependency Graph (authoritative for this roadmap)

```text
                         ┌────────────────────────────┐
                         │  B.5 (DONE): cancellation, │
                         │  exceptions, RTS backend   │
                         └─────────────┬──────────────┘
                                       │
              ┌────────────────────────┼─────────────────────────┐
              ▼                        ▼                         ▼
   ┌───────────────────┐   ┌────────────────────┐    ┌────────────────────┐
   │ R0 Ship-Ops UI     │   │ R1 Returns (M7.3-C) │    │ R2 Payments+COD+   │
   │ (admin/merchant/   │──▶│  restock+condition │    │ channels+fees      │
   │ buyer visibility,  │   └─────────┬──────────┘    └─────────┬──────────┘
   │ DRIVER, Playwright)│             │                         │
   └───────────────────┘             ▼                         ▼
                              ┌────────────────────────────────────┐
                              │ R3 Refunds (M7.3-D) → dispute      │
                              │ closure (M7.3-E) → invoices        │
                              └─────────────┬──────────────────────┘
                                            │
              ┌─────────────────────────────┼──────────────────────────────┐
              ▼                             ▼                              ▼
   ┌────────────────────┐        ┌────────────────────┐        ┌────────────────────┐
   │ R4 Commercial depth │        │ R5 Notifications    │        │ R6 Hardening:      │
   │ addresses, segments,│        │ expansion (M7.3-F)  │        │ reconciliation     │
   │ i18n/RTL, reporting │        │ (consumes all above │        │ worker, admin      │
   └─────────┬──────────┘        │  events)            │        │ intervention, flags│
             │                   └────────────────────┘        └─────────┬──────────┘
             ▼                                                           ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │ R7 Advanced B2B (product-gated): RFQ, approvals, bulk ordering, credit (P7), │
   │ multi-warehouse, chat UI                                                     │
   └──────────────────────────────────────────────────────────────────────────────┘
```

Hard dependency rules:
- R1 requires B.5 (satisfied). R1.3 (RMA) additionally requires its four-gate lock.
- R3.1 requires R2.1. R3.2 requires R3.1. R3.3 requires R2.1.
- R4.4 (finance reporting) requires R2. R5.1 requires R0 + R2.4.
- R6.1 requires R0.1/R0.3. R7 items require explicit product locks (and R7.4 requires regulated partners).

---

## 11. Suggested Sequence Summary

| Order | Milestone (proposed) | Theme | Blocks removed |
|-------|----------------------|-------|----------------|
| 1 | M7.3-B.6 (R0) | Ship-Ops Visibility | G-01, G-02, G-03, G-10, G-18, G-20 | — **CLOSED / PASS** |
| 2 | M7.3-C (R1) | Returns + restock | X-3, G-06 |
| 3 | M8.1 (R2) | Payments + channels + fee/VAT | G-04, G-11, G-23 |
| 4 | M7.3-D (R3.1) | Refunds | G-05 |
| 5 | M7.3-E (R3.2–3.3) | Dispute closure + documents | X-4, G-07 |
| 6 | M8.2 (R4) | Commercial depth + i18n + reporting | G-08, G-09, G-13, G-19 |
| 7 | M7.3-F (R5) | Notification expansion | G-12 |
| 8 | M8.3 (R6) | Ops maturity | G-17, G-21, G-22, BG-4 |
| 9+ | R7 (product-gated) | Advanced B2B procurement | G-14, G-15, G-16, G-24 |

Milestone names M7.3-C/D/E/F are retained where the existing roadmap locks already define their scope (C audited; D/E/F named in the B.0 lock §27). M7.3-B.6 (R0) is CLOSED / PASS; new milestones (M8.x) are proposed identifiers only.

---

## 12. Product Decisions Required (roadmap cannot proceed past the listed gate without them)

| # | Decision | Blocks | Current evidence |
|---|----------|--------|------------------|
| PD-1 | Payment provider + COD policy | R2.1/R2.2 | plan Phase 3 defines shape; provider unselected |
| PD-2 | SMS + email providers | R2.4 | notifications.service stub |
| PD-3 | DRIVER operating model (provision or descope) | R0.4 | role unseeded; mobile screen exists |
| PD-4 | RFQ/quotation scope (in/out) | R7.1 | absent from plan and code |
| PD-5 | Buyer approvals/spending limits (in/out) | R7.2 | absent from plan and code |
| PD-6 | Arabic/RTL scope and timing | R4.3 | UI hardcoded en/ltr |
| PD-7 | Segment/contract pricing activation | R4.2 | schema columns dark since 0006 |
| PD-8 | Admin order intervention scope | R6.2 | admin detail read-only; backend undefined |
| PD-9 | Multi-warehouse/branch (plan fence lift?) | R7.5 | Phase-1 explicit non-goal |
| PD-10 | Trade credit (P7 partner model) | R7.4 | documented P7 fence |

---

*This roadmap is a recommendation derived from the read-only audit. It does not modify any code, schema, business rule, or existing milestone lock.*
