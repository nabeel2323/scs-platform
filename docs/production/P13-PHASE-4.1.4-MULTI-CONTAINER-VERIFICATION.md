# P13 Phase 4.1.4 — Multi-Container Verification

| Field | Value |
|-------|-------|
| Phase | 4.1.4 — Priority 2 |
| Date | 2026-10-15 |
| Result | **PASS — 10/10 scenarios** |
| Method | Direct SQL against disposable PostgreSQL (ci-migration-postgres) |

## 1. Test Infrastructure

- Container: `ci-migration-postgres` (postgis/postgis:16-3.4)
- Database: `scs_migration_test` (61 migrations applied, 98 tables)
- Test script: `worker_exclusivity_tests.sql`
- All tests use `test-*` prefixed lease keys, cleaned up after

## 2. Scenario Results

### Scenario 1: Single worker acquires unheld lease
```sql
UPDATE worker_leases SET holder_id = 'worker-A', epoch = epoch + 1, ...
WHERE lease_key = 'test-s1' AND (holder_id IS NULL OR expires_at <= now())
```
**Result: PASS** — Worker A acquired, epoch=1

### Scenario 2: Second worker blocked while first holds
```sql
UPDATE worker_leases SET holder_id = 'worker-B', ...
WHERE lease_key = 'test-s1' AND (holder_id IS NULL OR expires_at <= now() OR holder_id = 'worker-B')
```
**Result: PASS** — 0 rows returned, Worker B correctly blocked

### Scenario 3: Heartbeat renewal with epoch fencing
- 3a: Correct epoch renewal → **PASS** (1 row updated)
- 3b: Stale epoch (999) renewal → **PASS** (0 rows, correctly rejected)

### Scenario 4: Lease expiry detection
Force-expired lease detected via `expires_at <= now()` check.
**Result: PASS**

### Scenario 5: Takeover after expiry
Worker B acquired expired lease, epoch incremented to 2.
**Result: PASS**

### Scenario 6: Epoch fencing on recordPollSuccess
Stale worker (epoch=1) tried to write — fenced off by `AND epoch = 1` WHERE clause when current epoch is 2.
**Result: PASS** — Stale worker write correctly rejected

### Scenario 7: Voluntary release transfers ownership
- 7a: Worker B released (holder_id=NULL) → **PASS**
- 7b: Worker C acquired (epoch=3) → **PASS**

### Scenario 8: Force expire for recovery
Operator force-expired Worker C's lease, Worker D took over (epoch=4).
**Result: PASS**

### Scenario 9: Race on expired lease (simulated)
Two workers raced on expired lease. Worker E won (1 row), Worker F got 0 rows.
**Result: PASS** — Only one winner, PostgreSQL row locking prevents dual acquisition

### Scenario 10: Independent lease keys
Worker X acquired `test-s10a`, Worker Y acquired `test-s10b`, Worker Z blocked from `test-s10a`.
**Result: PASS** — Lease keys are independent

## 3. Exclusivity Verification

```sql
SELECT CASE WHEN MAX(live) <= 1 THEN 'PASS' ELSE 'FAIL' END
FROM (SELECT lease_key, COUNT(DISTINCT holder_id) AS live ... GROUP BY lease_key) sub;
```
**Result: PASS** — No lease has more than 1 live holder

## 4. Summary

| # | Scenario | Result |
|---|----------|--------|
| 1 | Single worker acquires | PASS |
| 2 | Second worker blocked | PASS |
| 3 | Heartbeat + epoch fencing | PASS |
| 4 | Lease expiry detection | PASS |
| 5 | Takeover after expiry | PASS |
| 6 | Epoch fencing on writes | PASS |
| 7 | Voluntary release | PASS |
| 8 | Force expire recovery | PASS |
| 9 | Race condition | PASS |
| 10 | Independent lease keys | PASS |

**PASS** — Worker exclusivity mechanism is correct. Database row locking + epoch fencing provide mutual exclusion, crash recovery, and stale-worker protection.
