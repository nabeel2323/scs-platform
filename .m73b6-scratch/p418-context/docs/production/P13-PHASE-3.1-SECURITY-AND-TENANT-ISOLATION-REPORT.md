# P13 Phase 3.1 — Security and Tenant Isolation Report

## 1. Scope

Verified tenant isolation across all Phase 3 financial services and controller endpoints.

## 2. Tenant Isolation Model

### Data Ownership Chain
```
settlement_adjustments.org_id → derived from sub_order → store → org
commission_reversals.org_id → derived from return_request → sub_order → store → org
reconciliation_runs.org_id → set from caller's activeOrg
reconciliation_discrepancies.org_id → inherited from reconciliation run
```

### Enforcement Points

| Service | Method | Tenant Filter | Verified |
|---------|--------|---------------|----------|
| SettlementAdjustmentService | createAdjustment() | orgId from sub-order → store lookup | YES |
| SettlementAdjustmentService | getAdjustment() | `eq(orgId, org)` in WHERE clause | YES |
| SettlementAdjustmentService | listAdjustments() | `eq(orgId, org)` in WHERE clause | YES |
| SettlementAdjustmentService | lockAdjustment() | `eq(orgId, org)` in FOR UPDATE query | YES |
| SettlementAdjustmentService | approveAdjustment() | Via lockAdjustment() | YES |
| SettlementAdjustmentService | rejectAdjustment() | Via lockAdjustment() | YES |
| SettlementAdjustmentService | postAdjustment() | Via lockAdjustment() | YES |
| CommissionReversalService | processCommissionReversal() | orgId resolved and persisted | YES |
| CommissionReversalService | listReversals() | `eq(orgId, org)` in WHERE clause | YES |
| ReconciliationService | executeReconciliation() | orgId from caller, all checks scoped | YES |
| ReconciliationService | getReconciliationRun() | `eq(orgId, org)` in WHERE clause | YES |
| ReconciliationService | listReconciliationRuns() | `eq(orgId, org)` in WHERE clause | YES |
| ReconciliationService | resolveDiscrepancy() | `eq(orgId, org)` in WHERE clause | YES |

### Controller Enforcement
All 13 financial endpoints pass `user.activeOrg` to service methods. No endpoint exposes cross-tenant data.

## 3. Authorization Verification

### Permission Matrix

| Permission | Role | Access |
|-----------|------|--------|
| `admin:commission:read` | ADMIN, SUPER_ADMIN, FINANCE | List commission reversals |
| `admin:commission:write` | ADMIN, SUPER_ADMIN | Write commission data |
| `admin:adjustments:read` | ADMIN, SUPER_ADMIN, FINANCE | List/view adjustments |
| `admin:adjustments:write` | ADMIN, SUPER_ADMIN | Create/submit adjustments |
| `admin:adjustments:approve` | ADMIN, SUPER_ADMIN, FINANCE | Approve/reject/post |
| `admin:reconciliation:read` | ADMIN, SUPER_ADMIN, FINANCE | List/view runs |
| `admin:reconciliation:write` | ADMIN, SUPER_ADMIN, FINANCE | Execute/resolve |

### Self-Dealing Prevention
- Creator CANNOT be ANY approver for dual-approval adjustments
- Two distinct non-creator approvers required (1 Finance + 1 admin)
- Duplicate approval from same user rejected (UNIQUE index + service check)

### Approval Hash Binding
- Hash includes: `amountMinor:currency:reason:subOrderId:adjustmentType`
- Any material change invalidates prior approvals
- Posting re-verifies hash before applying

## 4. Known Limitations

1. **No API-level authorization tests** — Service-level logic is tested; full HTTP authorization tests require running NestJS test server with testcontainers.
2. **FINANCE role has `admin:adjustments:approve`** — This allows Finance to approve but NOT create adjustments (which requires `admin:adjustments:write`). This is intentional.
3. **Historical orgId backfill** — Existing records have `orgId = null`. A backfill is recommended before production use.
