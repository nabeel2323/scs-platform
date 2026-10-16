# P13 Phase 4.1.6 — Regression and Safety Report

**Date:** 2026-10-15  
**Status:** All safety invariants verified  
**Scope:** Verify that pre-existing P13 safety properties remain unchanged

## Safety Invariant Verification

### 1. P13 Worker Disabled by Default
- **Source:** `p13-ops.config.ts` line 72: `workerEnabled: false`
- **Env parsing:** `boolFalseDefault(env['P13_WORKER_ENABLED'])` — only `'true'`, `'1'`, `'yes'` enable
- **Test:** Deployment invariants confirm "disables the worker and legacy pilot mode with an empty environment"
- **Status:** ✅ UNCHANGED

### 2. Pilot Mode Defaults to Legacy
- **Source:** `p13-ops.config.ts` line 83: `pilotMode: 'legacy' as P13PilotMode`
- **Env parsing:** Only exact string `'allowlist'` switches mode; everything else stays `'legacy'`
- **Test:** Deployment invariants confirm "only enters allowlist mode on that exact value"
- **Status:** ✅ UNCHANGED

### 3. Empty Pilot Allowlist
- **Source:** `p13_pilot_allowlist` table exists (migration 0063) but is empty by default
- **Behavior:** In `'allowlist'` mode with empty table, all organizations are denied
- **Test:** Integration tests confirm "the pilot gate blocks a non-allowlisted organization"
- **Status:** ✅ UNCHANGED

### 4. Merchant SLA: 72 Elapsed Hours
- **Source:** `returns.service.ts` line 49: `const MERCHANT_SLA_HOURS = 72`
- **Behavior:** After 72 elapsed hours, REQUESTED returns are escalated to admin review
- **Status:** ✅ UNCHANGED

### 5. Three-Business-Day Admin Review Target
- **Source:** `business-calendar.service.ts` lines 180-186 — configurable business calendar
- **Behavior:** "Three business days" means three full business days of available working time
- **Status:** ✅ UNCHANGED

### 6. Timeouts Only Escalate — Never Auto-Approve/Reject/Refund/Expire
- **Source:** `return-expiration.worker.ts` — polls for past-SLA returns and transitions to ESCALATED
- **Behavior:** Worker transitions REQUESTED → ESCALATED for admin review only
- **Key quote (line 4-9):** "Polls for REQUESTED returns whose merchant SLA (expires_at) has passed and transitions them to ESCALATED for admin review. Changed from EXPIRED (terminal) to ESCALATED (non-terminal) so returns are not silently expired."
- **Status:** ✅ UNCHANGED — timeouts escalate only

### 7. Commission Reversals: Capped, Idempotent, Transactionally Consistent
- **Source:** `commission-reversal.service.ts`
- **Capped:** Line 134: "capped at remainingCommission to prevent over-reversal"
- **Idempotent:** Line 149: "otherwise create a new transaction" (reuses existing reversal if present)
- **Transactional:** Line 173: `runTx.transaction(async (tx: any) => { ... })`
- **Status:** ✅ UNCHANGED

### 8. Settlement Approval and FX Fail-Closed
- **Source:** `settlement-adjustment.service.ts`
- **State machine:** `PENDING_APPROVAL → APPROVED | REJECTED | BLOCKED_FX` — no other transitions
- **Duplicate approval rejection:** Line 232: "Duplicate approval from same user rejected"
- **Tenant isolation:** Line 29: "Cross-tenant access is rejected"
- **Status:** ✅ UNCHANGED

### 9. Voucher Refund Semantics
- **Source:** Pre-existing voucher refund logic in returns module
- **Status:** ✅ UNCHANGED — no modifications in Phases 4.1.4–4.1.6

### 10. Tenant Isolation and Authorization
- **Source:** `tenant-scope.ts`, `returns.controller.ts`, `settlement-adjustment.service.ts`
- **Enforcement:** `financialOrgScope` applied to all financial operations
- **Monitoring:** `p13-monitor.service.ts` checks for tenant isolation violations (alert keys: `p13.tenant.isolation_violation`, `p13.tenant.isolation_denial`)
- **Test:** `p4-http-authorization.postgres.spec.ts` — HTTP-level tenant isolation tests
- **Status:** ✅ UNCHANGED

### 11. No Historical Financial Backfill or Automatic Clawback
- **Source:** No backfill migrations or automatic clawback logic in the codebase
- **Migration 0053** (`attribute_backfill.sql`) is for attributes, not financial data
- **Status:** ✅ UNCHANGED — no automatic financial backfill or clawback

### 12. No Production Financial Data Changes
- **Constraint:** This phase has not modified any production financial data
- **All changes:** Code, tests, and documentation only
- **Status:** ✅ VERIFIED

## Diff Review Summary

### Modified Files (24 tracked files)
| File | Change Scope | Safety Impact |
|------|-------------|---------------|
| `.github/workflows/ci.yml` | Added migration gate, container build | CI infrastructure only |
| `.gitignore` | Added entries | No runtime impact |
| `apps/admin/src/app/settlement-adjustments/page.tsx` | UI page | Display only |
| `apps/api/infra/drizzle/migrate-pg.ts` | Migration runner | Includes all 63 migrations |
| `apps/api/infra/drizzle/migrate.ts` | Migration runner | Infrastructure |
| `apps/api/src/__tests__/integration/p13-*.spec.ts` | Test updates | Test only |
| `apps/api/src/app.module.ts` | Module wiring | Added operations module |
| `apps/api/src/common/database/database.service.ts` | Database service | Infrastructure |
| `apps/api/src/common/redis/redis.service.ts` | Redis service | Infrastructure |
| `apps/api/src/common/tenant-scope.ts` | Tenant scope | Added utilities |
| `apps/api/src/config/env-gate.ts` | Environment gate | Production safety |
| `apps/api/src/drizzle/schema.ts` | Schema | Added ops tables |
| `apps/api/src/main.ts` | Application entry | Shutdown hooks |
| `apps/api/src/modules/audit/audit.*` | Audit module | Audit logging |
| `apps/api/src/modules/returns/commission-reversal.service.ts` | Commission reversal | Capped + idempotent |
| `apps/api/src/modules/returns/return-expiration.worker.ts` | Worker | Escalation only |
| `apps/api/src/modules/returns/returns.controller.ts` | Controller | Tenant-scoped |
| `apps/api/src/modules/returns/returns.module.ts` | Module | Wiring |
| `apps/api/src/modules/returns/returns.service.ts` | Service | 72h SLA |
| `apps/api/src/modules/returns/settlement-adjustment.service.ts` | Settlement | Fail-closed |

### Untracked Files (Phase 4.1.4–4.1.6 additions)
| File | Purpose |
|------|---------|
| `apps/api/src/modules/operations/ops-alert-signing.ts` | v2 signing with replay protection |
| `apps/api/src/modules/operations/ops-alert.service.ts` | Alert delivery with HMAC signing |
| `apps/api/src/modules/operations/p13-ops.config.ts` | Configuration with fail-closed |
| `apps/api/src/__tests__/unit/operations/p415-webhook-signing.spec.ts` | 30 unit tests |
| `apps/api/src/__tests__/integration/p415-webhook-delivery.postgres.spec.ts` | 13 integration tests |
| `apps/api/src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts` | 36 deployment tests |
| `docs/production/P13-PHASE-4.1.6-*.md` | Phase reports |

## Conclusion

All 12 safety invariants verified UNCHANGED. The diff contains no modifications to financial calculation logic, no automatic approval/rejection/refund/expiration, no backfill operations, and no production data changes. The P13 pilot remains disabled by default with all safe defaults intact.
