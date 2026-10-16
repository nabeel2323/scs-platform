# P13 Phase 4.1.9 — External Dependencies and Decisions

**Phase:** 4.1.9 — Release Candidate Validation and Outstanding Gate Closure
**Date:** 2026-10-15
**Branch:** `develop` | **HEAD:** `ed6c30f`

---

## 1. External Webhook Receiver Gate

**Status: BLOCKED BY EXTERNAL DEPENDENCY**

No production webhook receiver implementation exists in this repository. External delivery remains disabled (`P13_OPS_ALERT_WEBHOOK_URL` not configured).

### Receiver Contract Requirements

Per `P13-PHASE-4.1.8-RECEIVER-CONTRACT.md`, the receiver owner must implement and verify:

1. **Raw-body HMAC-SHA256 verification** over `<timestamp>.<raw-body>` canonical input
2. **Constant-time signature comparison** to prevent timing attacks
3. **Timestamp freshness enforcement** (reject stale deliveries)
4. **Atomic persistent deduplication** by alert ID
5. **Safe handling of concurrent duplicate deliveries** (idempotent processing)
6. **End-to-end tests** for valid, tampered, stale, duplicate, and concurrent requests
7. **Receiver-owner sign-off** with attributable approval

### Protocol Specification

- Header: `X-SCS-Alert-Signature: sha256=<hex>`
- Header: `X-SCS-Alert-Timestamp: <unix-seconds>`
- Canonical input: `${timestamp}.${rawBody}`
- Algorithm: HMAC-SHA256 with shared secret (minimum 32 characters)

**External delivery must remain disabled until a real receiver passes these requirements.**

---

## 2. Hosted CI Gate

**Status: NOT RUN**

Hosted CI has not run because no push or pull request has been created. Authorization to push/PR has not been granted.

### Handoff Package

| Item | Value |
|------|-------|
| Branch | `develop` |
| HEAD | `ed6c30f` |
| Working-tree changes | 25 modified tracked + 76 untracked files |
| Tracked diff | 999 insertions(+), 160 deletions(-) |
| Local validation | Typecheck PASS, Lint PASS (0 errors), Build PASS (367 files), 68/68 P13 tests PASS (Windows + Linux), 63/63 migrations applied |
| Remaining CI requirements | Full integration suite, contract tests, mobile analysis, container smoke tests |

### Proposed Safe Procedure for Hosted CI

1. Commit working-tree changes to `develop` with explicit authorization
2. Push to origin — CI triggers automatically on `push` to `develop`
3. Monitor CI pipeline for all job results
4. Address any CI failures before proceeding
5. Create PR to `main` only after CI passes on `develop`

---

## 3. Outstanding Business Decisions (D01–D15)

**All 15 decisions remain PROVISIONAL — PENDING APPROVAL. Zero have attributable approval evidence.**

Source: `P13-CONSOLIDATED-DECISION-AND-GATE-REASSESSMENT.md` and `P13-PHASE-0-CLOSURE-CHECKLIST-v2.md`.

### Returns Policy Decisions

| ID | Topic | Provisional Position | Approver | Status |
|----|-------|---------------------|----------|--------|
| D01 | Return window | 14 days from delivery | Head of Operations / COO | PROVISIONAL |
| D02 | Merchant response SLA | 72 hours from request creation | Head of Merchant Partnerships | PROVISIONAL |
| D03 | Merchant timeout → escalation | Escalate to admin; no auto-approve/reject/expire | Head of Operations / COO | PROVISIONAL |
| D08 | Full sub-order return delivery fee | Full-sub-order delivery fee refund only | Finance Lead (co: Ops) | PROVISIONAL |
| D09 | Delivery-fee exception | Admin-authorized exception for partials | Finance Lead (co: Ops) | PROVISIONAL |
| D10 | Carrier-damage delivery fee | Refund for material carrier damage; partials to admin | Finance Lead (co: Ops) | PROVISIONAL |
| D11 | Administrator review target | 3 business days from escalation (calendar TBD) | Head of Operations / COO | PROVISIONAL |

### Commission Reversal Decisions

| ID | Topic | Provisional Position | Approver | Status |
|----|-------|---------------------|----------|--------|
| D04 | Merchant-responsibility commission | Reverse commission on net goods | Finance Lead / CFO | PROVISIONAL |
| D05 | Buyer-remorse commission | Retain commission | Finance Lead / CFO | PROVISIONAL |
| D06 | Platform-responsibility commission | Reverse commission on net goods | Finance Lead / CFO | PROVISIONAL |
| D07 | Carrier-damage commission | Reverse commission on net goods | Finance Lead / CFO | PROVISIONAL |

### Financial Governance Decisions

| ID | Topic | Provisional Position | Approver | Status |
|----|-------|---------------------|----------|--------|
| D12 | Settlement adjustment authorization | Manual Finance/admin adjustment; no auto clawback | Financial Controller | PROVISIONAL |
| D13 | Voucher permitted outcomes | Administrator review for every voucher return | Finance Lead (co: Risk) | PROVISIONAL |

### Operational Decisions

| ID | Topic | Provisional Position | Approver | Status |
|----|-------|---------------------|----------|--------|
| D14 | Deployment target | Limited single-process pilot on Docker Compose VPS | CTO / Head of Engineering | PROVISIONAL |
| D15 | Pilot operational controls | Four controls, one worker-enabled instance | CTO / Head of Engineering (co: SRE) | PROVISIONAL |

---

## 4. Open Questions (OQ-01–OQ-12)

**All 12 open questions remain OPEN. Zero have attributable resolution evidence.**

| ID | Topic | Accountable | Blocking |
|----|-------|-------------|----------|
| OQ-01 | Business calendar definition | Head of Operations / COO | **YES** — D11 |
| OQ-02 | SLA trigger timestamps | Head of Operations / COO | **YES** — D02, D11 |
| OQ-03 | Return eligibility edge cases | Head of Operations / COO | No |
| OQ-04 | Commission allocation + rounding | Finance Lead / CFO + Engineering | **YES** — D04, D06, D07 |
| OQ-05 | Delivery-fee allocation (D09) | Finance Lead / CFO | No |
| OQ-06 | Exception audit trail (D09) | Finance Lead / CFO (co: Risk) | No |
| OQ-07 | Settlement adjustment authorization (D12) | Financial Controller | No |
| OQ-08 | Voucher risk/fraud outcomes (D13) | Risk / Fraud Lead | No |
| OQ-09 | Pilot operational owners | CTO / SRE | No (Phase 3) |
| OQ-10 | Pilot scope and criteria | CTO / Head of Engineering | No (Phase 3) |
| OQ-11 | Materiality definition | Finance Lead (co: Ops) | No |
| OQ-12 | Dispute workflow | Head of Operations / COO | No |

---

## 5. Deployment-Target Decision (D14)

**Status: PROVISIONAL — PENDING APPROVAL**

The established deployment target (per repository evidence) is Docker Compose on a single Linux VPS:
- `infra/backup/README.md` references a pilot VPS with cron-based `pg_dump`
- Paths: `/opt/scs/infra/backup/backup-db.sh`, retention 14 days dev / 30 days pilot
- Off-host copy to S3/MinIO `scs-backups` bucket
- `infra/k8s/` is an empty placeholder — no Kubernetes manifests exist

This decision requires CTO / Head of Engineering approval before any production deployment.

---

## 6. Summary

| External Dependency | Status |
|--------------------|--------|
| Webhook receiver | **BLOCKED BY EXTERNAL DEPENDENCY** |
| Hosted CI | **NOT RUN** (requires push/PR authorization) |
| Business decisions (15) | **ALL PROVISIONAL — PENDING APPROVAL** |
| Open questions (12) | **ALL OPEN** |
| Deployment target (D14) | **PROVISIONAL — PENDING APPROVAL** |
