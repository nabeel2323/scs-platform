# SCS P13 — Business Sign-Off Register (Returns, Refunds & Disputes)

**Milestone:** `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13` — Returns, Refunds & Disputes Integration
**Baseline:** branch `develop`, HEAD `762d950`, migration `0059_return_requests.sql`
**Technical gate (prior task):** `P13 RELEASE CLOSURE READINESS = PASS WITH CONDITIONS`
**Companion documents:**
- `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-BUSINESS-RULES-ARCHITECTURE-LOCK.md` (§7.1 VAT, §10 AC-P13-001…030, D-1…D-9 decisions)
- `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-RELEASE-CLOSURE-READINESS-REPORT.md`
- `SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-10-P13-BUSINESS-SIGNOFF-AND-RELEASE-AUTHORIZATION-REPORT.md` (this register's gate output)

> **Authorization rule (binding for this register).** A decision may be set to `APPROVED` **only** by an explicit, attributable instruction from the named business owner. It must **not** be inferred from implemented code, passing tests, architecture documents, prior implementation, or from a prompt. Until such an instruction is recorded here with approver name, role, date, and rationale, every decision remains `PENDING`. The current implementation reflects **proposed defaults** chosen so the feature is coherent and testable — not evidence of business approval.

---

## 0. Status Summary

| # | Decision | Proposed default (as implemented) | Accountable approver role | Status |
|---|---|---|---|---|
| 1 | Return window | 14 days from delivery | Head of Operations / COO (co: Customer Experience) | **PENDING** |
| 2 | Commission on refunds | Retain original platform commission | Finance Lead / CFO | **PENDING** |
| 3 | Delivery-fee refunds | Refund only on full sub-order returns | Finance Lead (co: Head of Operations) | **PENDING** |
| 4 | Merchant response SLA | 72 hours before automatic expiry | Head of Merchant Partnerships | **PENDING** |
| 5 | Settlement recovery | Manual admin handling (no automated clawback) | Financial Controller | **PENDING** |
| 6 | Voucher returns | Require admin review | Finance Lead (co: Risk / Fraud) | **PENDING** |
| D | Deployment target | Owner must select pilot vs multi-instance | CTO / Head of Engineering (co: Ops) | **PENDING** |

**Overall register status: 0 of 6 business decisions and 0 of 1 deployment-target decision approved → release is BLOCKED on business approvals.**

---

## 1. Decision register (one block per decision)

### Decision 1 — Return window
- **Proposed default:** A return request must be raised within **14 days of delivery**; `return_requests.expires_at = orders.deliveredAt + 14 days`.
- **Available alternatives:** 7 / 14 / 21 / 30 days; differentiated windows per category (e.g., short window for consumables, longer for durable IT hardware); per-buyer-contract windows for negotiated B2B accounts.
- **Business & financial consequences:** Shorter windows reduce restocking/return-abuse exposure and accelerate settlement finality but lower buyer satisfaction and can conflict with contractual commitments to large buyers. Longer windows increase the volume of late returns, delay merchant cash settlement, and enlarge the working-capital float held against unsettled orders. The value is env-overridable via `RETURN_WINDOW_MS`.
- **Approver name & role:** `<to be designated>` — Head of Operations / COO (co-approver: Customer Experience lead).
- **Decision:** **PENDING**
- **Decision date & rationale:** _not yet recorded_.
- **Evidence / reference:** Lock §5 return-window rule; implemented in `apps/api/src/modules/returns/returns.service.ts` (window constant) and exercised by the expiration path (browser E2E scenario B06 — expired→cancel→re-initiate). Propagation of `expires_at` verified by AC-P13-013.

### Decision 2 — Commission on refunds
- **Proposed default:** On refund, the platform **retains the original commission** on the refunded goods value. A settlement adjustment equal to the VAT-exclusive commission (`round(gross_refund / 1.15 × commission_rate)`) is recorded so the merchant is **not** credited commission on refunded volume; the platform keeps the fee already earned at sale.
- **Available alternatives:** (a) claw back commission to the merchant on refund (reduce merchant receivable); (b) retain commission but only for returns beyond a threshold; (c) partial retention.
- **Business & financial consequences:** Retaining commission protects platform take-rate revenue on returned volume and avoids a negative-revenue edge case, but shifts return cost onto merchants and may strain merchant relations for high-return categories. Clawback is merchant-friendly but reduces platform revenue and complicates settlement reconciliation.
- **Approver name & role:** `<to be designated>` — Finance Lead / CFO.
- **Decision:** **PENDING**
- **Decision date & rationale:** _not yet recorded_.
- **Evidence / reference:** Lock D-2 (settlement recovery / commission treatment); settlement-adjustment flow verified by PostgreSQL spec AC-P13-024 (`settlement_adjustments`, `net_amount_minor` unchanged) and browser E2E F01/D03.

### Decision 3 — Delivery-fee refunds
- **Proposed default:** Delivery fee (and its VAT) is refunded **only when the entire sub-order quantity is returned/refunded** (`includeDeliveryFee = entire sub-order refunded`); partial returns refund goods + proportional VAT only.
- **Available alternatives:** always refund delivery on any return; never refund delivery; refund delivery pro-rata to returned weight/volume.
- **Business & financial consequences:** Refunding delivery only on full returns protects margin against partial-return shipping-cost leakage and matches the economic reality that a partial return still consumed the shipment. Always-refund improves buyer goodwill on partial returns but erodes delivery margin and can be exploited. Runtime proof: browser E2E B03 partial return refunded goods+VAT = 287,500 with delivery excluded (fee 50,000).
- **Approver name & role:** `<to be designated>` — Finance Lead (co-approver: Head of Operations).
- **Decision:** **PENDING**
- **Decision date & rationale:** _not yet recorded_.
- **Evidence / reference:** AC-P13-027 (VAT-exclusive + delivery-fee eligibility) verified 10/10 in `p13-financial-dispute.postgres.spec.ts`; lock D-3.

### Decision 4 — Merchant response SLA
- **Proposed default:** A merchant must respond to a return request within **72 hours**; an un-actioned request past its `expires_at` is automatically transitioned `REQUESTED → EXPIRED` by the expiration worker.
- **Available alternatives:** 24 / 48 / 72 / 120 hours; auto-expire vs auto-approve-on-timeout (buyer-favorable); escalation reminder instead of hard expiry.
- **Business & financial consequences:** A tighter SLA speeds buyer resolution but penalises merchants unable to inspect quickly and may expire legitimate returns; a looser SLA protects merchants but lengthens buyer wait and delays settlement. Auto-approve-on-timeout shifts the decision burden off the merchant but increases refund exposure to un-reviewed returns.
- **Approver name & role:** `<to be designated>` — Head of Merchant Partnerships (co-approver: Customer Experience).
- **Decision:** **PENDING**
- **Decision date & rationale:** _not yet recorded_.
- **Evidence / reference:** AC-P13-008 (`REQUESTED → EXPIRED`), AC-P13-021 (no buyer action on expiry) via `returns-fsm.spec.ts` (86/86) and `p13-returns.postgres.spec.ts`; worker behaviour assessed in the readiness report §8.

### Decision 5 — Settlement recovery method
- **Proposed default:** Recovering a refund from an already-settled merchant is handled **manually by an admin** creating a settlement adjustment (settlement `adjustment` type, guarded by `settlement_adjustment`), rather than an automated clawback against future settlements.
- **Available alternatives:** automated clawback against the merchant's next settlement; a merchant-deferred repayment schedule; write-off below a threshold.
- **Business & financial consequences:** Manual handling gives finance full control and an auditable trail and prevents unexpected auto-deductions from merchant balances, at the cost of operational effort and latency. Automated clawback scales better and recovers faster but risks over-deduction, disputes, and edge cases when a merchant has no future settlement to offset.
- **Approver name & role:** `<to be designated>` — Financial Controller.
- **Decision:** **PENDING**
- **Decision date & rationale:** _not yet recorded_.
- **Evidence / reference:** AC-P13-010 (`REFUND_ISSUED → SETTLEMENT_RECOVERY_REQUIRED`, SYSTEM-triggered), AC-P13-024 (adjustment persistence) in `p13-financial-dispute.postgres.spec.ts`; settlement guarded in `settlements.service.ts`.

### Decision 6 — Voucher refunds
- **Proposed default:** Refunds issued as a **store credit / voucher require admin review** before issue (consistent with the admin `approve-refund` oversight path); they are not auto-issued on merchant inspection alone.
- **Available alternatives:** auto-issue voucher on merchant approve (cash still admin-reviewed); buyer chooses cash vs voucher; voucher auto-issued up to a value threshold.
- **Business & financial consequences:** Admin review of vouchers reduces fraud and misuse of non-cash refund rails and keeps liability recognised centrally, adding handling time. Auto-issued vouchers improve buyer resolution speed but create stored-value liability and abuse surface without a human check.
- **Approver name & role:** `<to be designated>` — Finance Lead (co-approver: Risk / Fraud).
- **Decision:** **PENDING**
- **Decision date & rationale:** _not yet recorded_.
- **Evidence / reference:** Admin oversight gating AC-P13-005 / AC-P13-023 (403 + denied UI + cross-org) in browser E2E A01/A02/A03/D01/D02; `issue-refund` / `approve-refund` guarded by `admin:returns:write`.

---

## 2. Deployment-target decision (§3)

The authorized owner **must explicitly select exactly one** deployment target. This register does **not** assume a target.

- **Selected target:** `<to be designated>` — ☐ `LIMITED_SINGLE_PROCESS_PILOT` ☐ `MULTI_INSTANCE_PRODUCTION`
- **Approver name & role:** `<to be designated>` — CTO / Head of Engineering (co-approver: Operations lead).
- **Decision:** **PENDING**
- **Decision date & rationale:** _not yet recorded_.

### Option A — `LIMITED_SINGLE_PROCESS_PILOT`
Choosing this target means the owner **accepts the existing in-process expiration worker** as sufficient for a single-instance pilot, provided the following operational controls are in place and owned:

- [ ] **Alert on repeated expiration-poll errors** — page/notify when the worker logs consecutive poll failures.
- [ ] **Monitor overdue requests** — query/alert on `status = 'REQUESTED' AND expires_at < NOW() - interval '10 min'` to catch any row the worker has not yet expired.
- [ ] **Confirm the designated worker instance** — record which single API instance owns the worker so duplicates are impossible during the pilot.
- [ ] **Monitor startup registration and worker activity** — verify the `ReturnExpirationWorker` module-init log line on each boot and periodic activity.

Acceptance criteria for this option: `RETURN_WINDOW_MS` and the poll interval are set for the pilot; the four controls above are assigned to a named operator; and the platform is **not** run with more than one API replica until the target changes.

### Option B — `MULTI_INSTANCE_PRODUCTION`
This target **retains a blocking condition**: P13 must **not** be released to multi-instance production until a supported durable scheduler **or** an equivalent leader-coordinated worker has been **implemented, tested, and independently verified**. The current worker's `FOR UPDATE SKIP LOCKED` claim prevents double-processing and restart recovery is state-based, but it registers on **every** API replica and has no enable/disable flag, so uncontrolled multi-instance production is not established.

- No BullMQ, external scheduler, Kubernetes CronJob, or new infrastructure is introduced by this task; the durable-scheduler work is deferred until the owner selects this target and authorizes it.

> **Boundary:** Selecting Option A without the four controls checked, or releasing to Option B before the durable-scheduler condition is independently verified, would leave the AC-P13-008 / AC-P13-009 acceptance basis unestablished. The target and its controls must be recorded by the owner before release closure.
