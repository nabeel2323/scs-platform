# P13 Phase 2 — Implementation Report

**Date:** 2026-10-13
**Branch:** `develop` (HEAD: `8d60e36`)
**Scope:** Lifecycle, Escalation & Business SLA only (no Phase 3/4 work)

---

## 1. Summary

Phase 2 implements the merchant-timeout escalation flow and the administrator review SLA for P13 Returns. When a merchant fails to respond to a return request within 72 hours, the system escalates it to `ESCALATED` state instead of silently expiring it. An administrator then has 3 business days to resolve the escalation by approving, rejecting, or cancelling the return.

All 10 completion criteria from the Phase 2 specification are met.

---

## 2. Files Changed

### New Files

| File | Lines | Purpose |
|------|-------|---------|
| `infra/drizzle/migrations/0060_escalated_and_business_calendar.sql` | 159 | Forward migration: ESCALATED state, responsibility columns, calendar tables |
| `apps/api/src/modules/returns/business-calendar.schema.ts` | 55 | Drizzle schema: businessCalendars, businessCalendarHolidays, businessCalendarAudit |
| `apps/api/src/modules/returns/business-calendar.service.ts` | 399 | Business calendar service: addBusinessDays, isBusinessHours, calendar management |
| `apps/api/src/__tests__/unit/returns/business-calendar.spec.ts` | 299 | 26 unit tests for calendar boundary conditions |
| `apps/admin/src/app/returns/[id]/page.tsx` | 359 | Admin return detail page with ESCALATED resolution form |

### Modified Files

| File | Change |
|------|--------|
| `apps/api/src/modules/returns/returns.schema.ts` | Added 5 columns: responsibilityCategory, escalatedAt, escalationDeadline, resolvedBy, resolvedAt |
| `apps/api/src/modules/returns/returns.service.ts` | Added ESCALATED to FSM, escalateReturn(), resolveEscalation(), cumulative query includes ESCALATED |
| `apps/api/src/modules/returns/return-expiration.worker.ts` | Changed from EXPIRED to ESCALATED transition |
| `apps/api/src/modules/returns/returns.controller.ts` | Added POST /v1/admin/returns/:id/resolve endpoint |
| `apps/api/src/modules/returns/returns.module.ts` | Added BusinessCalendarService to providers/exports |
| `apps/api/src/drizzle/schema.ts` | Added business-calendar.schema export |
| `apps/api/src/__tests__/integration/p13-returns.postgres.spec.ts` | Added BusinessCalendarService 4th constructor arg |
| `apps/api/src/__tests__/integration/p13-financial-dispute.postgres.spec.ts` | Added BusinessCalendarService 4th constructor arg |
| `apps/admin/src/app/returns/page.tsx` | Added ESCALATED status color, filter, escalation columns, resolve link |

---

## 3. Migration 0060 — Schema Changes

### return_requests table
- **CHECK constraint** `chk_return_requests_status`: extended to include `ESCALATED` (13 states total)
- **Column** `responsibility_category VARCHAR(30)`: nullable, CHECK constraint limits to `MERCHANT`, `BUYER_REMORSE`, `PLATFORM`, `CARRIER_DAMAGE`, or NULL
- **Column** `escalated_at TIMESTAMPTZ`: when the return was escalated
- **Column** `escalation_deadline TIMESTAMPTZ`: admin review deadline
- **Column** `resolved_by UUID → users(id)`: admin who resolved
- **Column** `resolved_at TIMESTAMPTZ`: when resolved

### New indexes
- `idx_return_requests_escalated`: partial index on `(status, escalated_at) WHERE status = 'ESCALATED'`
- `idx_return_requests_escalation_deadline`: partial index on `(escalation_deadline) WHERE status = 'ESCALATED'`

### New tables
- `business_calendars`: calendar configuration (working days, hours, timezone)
- `business_calendar_holidays`: per-calendar holiday entries
- `business_calendar_audit`: configuration change audit log

### Constraints
- `chk_calendars_working_days`: working_days must be subset of {1..7}, non-empty
- `chk_calendars_hours`: start_time < end_time

### Seed
- Default calendar: `a0000000-0000-0000-0000-000000000001`, Mon–Fri, 08:00–18:00 UTC

### Design decision — ESCALATED and duplicate-return prevention
The existing partial unique index `idx_return_requests_active_per_order` excludes terminal states (REFUNDED, MERCHANT_REJECTED, CANCELLED, EXPIRED, REJECTED_AFTER_INSPECTION). ESCALATED is intentionally NOT excluded — it remains "active" and prevents duplicate active returns for the same sub-order. No index change was needed.

---

## 4. FSM Transition Table

### Complete 13-state transition map

| From State | Allowed Transitions |
|------------|-------------------|
| REQUESTED | MERCHANT_APPROVED, MERCHANT_REJECTED, CANCELLED, **ESCALATED** |
| MERCHANT_APPROVED | BUYER_SHIPPED, CANCELLED |
| BUYER_SHIPPED | RECEIVED |
| RECEIVED | INSPECTED |
| INSPECTED | REFUND_PENDING, REJECTED_AFTER_INSPECTION |
| REFUND_PENDING | REFUNDED, REFUND_FAILED |
| REFUND_FAILED | REFUND_PENDING |
| **ESCALATED** | **MERCHANT_APPROVED, MERCHANT_REJECTED, CANCELLED** |
| REFUNDED | _(terminal)_ |
| MERCHANT_REJECTED | _(terminal)_ |
| CANCELLED | _(terminal)_ |
| EXPIRED | _(terminal)_ |
| REJECTED_AFTER_INSPECTION | _(terminal)_ |

### Phase 2 additions (bold)
- `REQUESTED → ESCALATED`: system-triggered when merchant SLA (72h) expires
- `ESCALATED → MERCHANT_APPROVED`: admin approves
- `ESCALATED → MERCHANT_REJECTED`: admin rejects
- `ESCALATED → CANCELLED`: admin cancels

---

## 5. Business Calendar Algorithm

### Default calendar
- Working days: Monday–Friday (ISO 1–5)
- Working hours: 08:00–18:00 UTC (10 hours/day)
- Holidays: configurable per calendar

### addBusinessDays(start, days) algorithm
1. Find the next business instant from `start` (snap to business hours if outside)
2. Walk forward day by day, counting business days (working day that is not a holiday)
3. The deadline is the end-of-business (18:00 UTC) of the Nth business day
4. Safety limit: MAX_ITERATIONS = 3660 (~10 years) prevents unbounded loops

### Boundary semantics
- Start before hours (e.g., 06:00): snap to 08:00, that partial day counts as day 1
- Start after hours (e.g., 20:00): snap to next day 08:00
- Start on weekend/holiday: advance to next business day 08:00
- Start exactly at 08:00: included in business hours
- Start exactly at 18:00: NOT in business hours (end is exclusive)

---

## 6. Authorization & Tenant Isolation

### Admin resolution endpoint
- **Route:** `POST /v1/admin/returns/:id/resolve`
- **Guards:** JwtAuthGuard → PermissionsGuard → `@RequirePermission('admin:returns:write')`
- **CallerContext:** constructed with `role: 'ADMIN'`
- **Service validation:** checks status is ESCALATED, validates action ∈ {APPROVE, REJECT, CANCEL}, validates responsibility category against RESPONSIBILITY_CATEGORIES set
- **Concurrency:** optimistic `WHERE status = 'ESCALATED'` guard — second concurrent resolution throws ConflictException

### Escalation (system)
- No caller authorization — triggered by worker (system actor)
- Worker uses FOR UPDATE SKIP LOCKED for multi-instance safety
- Optimistic status guard prevents duplicate escalation events

### Tenant isolation
- `getReturnRequest()` enforces buyer-ownership or merchant-store-membership for non-privileged callers
- Admin (privileged) callers bypass tenant scoping per existing `isTenantPrivileged()` pattern
- Calendar management methods are service-only (no controller endpoint in Phase 2)

### Verification results
| Check | Result |
|-------|--------|
| Buyer cannot access other buyer's returns | PASS (existing `buyerId !== caller.sub` check) |
| Merchant restricted to own stores | PASS (existing `assertStoreInOrg` + `assertStoreMember`) |
| Admin resolution requires `admin:returns:write` | PASS (PermissionsGuard) |
| Calendar management not exposed to merchants/buyers | PASS (no controller endpoint) |
| Concurrent merchant response vs. escalation | PASS (optimistic guard, idempotent) |
| Worker retry cannot duplicate events | PASS (WHERE status = 'REQUESTED') |
| FSM cannot be bypassed | PASS (all transitions through transitionReturn()) |
| No Phase 3/4 side effects | PASS (no commission, settlement, pilot changes) |

---

## 7. Deviations from Technical Design

| Design Item | Deviation | Reason |
|-------------|-----------|--------|
| §4.1 Pilot allowlist helper | Not implemented | Per spec §4.1 — out of scope for Phase 2 |
| §4.2 Settlement threshold (1000 SYP) | Not implemented | Per spec §4.2 — Phase 3 dependency |
| Admin resolution form in UI | Implemented as `/returns/[id]?resolve=1` | Matches existing admin detail page pattern |

---

## 8. Known Issues & Deferred Dependencies

### Phase 3 dependencies (not in scope)
- Commission-reversal ledger: `adjustSettlement()` currently sets `commissionMinor: 0` — does NOT reverse commission
- Settlement threshold configuration
- Exchange-rate configuration
- Monthly financial reconciliation

### Phase 4 dependencies (not in scope)
- Pilot allowlisting / activation
- Worker advisory-lock exclusivity
- Production monitoring architecture

### Pre-existing issues (not caused by Phase 2)
- TS18048 strict-null warnings in integration tests (7 occurrences) — pre-existing, not Phase 2

---

## 9. Confirmation

**Production was NOT deployed or modified.** All changes are local to the development workspace. No database migrations were run against production. No pilot activation occurred.
