# Operational Playbooks

## 1. Concierge Catalog Import

**When:** A new merchant needs their catalog imported but cannot do it themselves.

**Steps:**
1. Receive catalog data (CSV/Excel) from merchant via ops email
2. Admin logs in → Merchant Onboarding → Verification Queue
3. Verify merchant's store is APPROVED
4. Use `POST /v1/stores/{storeId}/imports` to upload the file
5. Monitor import job via `GET /v1/imports/{id}` until COMPLETED
6. Review imported products in admin console
7. Notify merchant that catalog is ready

**SLA:** Complete within 48h of merchant verification approval.

---

## 2. Verification Review SLA

**When:** A merchant submits their verification request.

**SLA:** 48 hours from submission.

**Steps:**
1. Monitor `GET /v1/verification/queue` for SUBMITTED requests
2. For each request:
   - Review store details (name, address, category)
   - Check uploaded documents (commercial registration, tax certificate)
   - Verify document validity dates
3. Decision:
   - **APPROVED:** Click approve → `merchant.verification.approved` event fires
   - **REJECTED:** Click reject with mandatory reason → merchant notified
   - **REVISION:** Request specific changes → merchant can resubmit
4. Track SLA compliance in admin dashboard

**Escalation:** If queue exceeds 20 pending requests, alert ops lead.

---

## 3. Order-Blocking Incident Response

**When:** Orders are stuck (not being accepted, checkout failing, etc.)

**Response time:** < 30 minutes.

**Triage:**
1. Check `/healthz` and `/readyz` — is the API healthy?
2. Check outbox dispatcher — are events being processed?
   ```sql
   SELECT status, COUNT(*) FROM outbox_events GROUP BY status;
   ```
3. Check order status — are orders stuck in SUBMITTED?
   ```sql
   SELECT status, COUNT(*) FROM orders 
   WHERE created_at > NOW() - INTERVAL '1 hour' 
   GROUP BY status;
   ```
4. Check database connections — is PgBouncer saturated?
5. Check Redis — is OTP/refresh token store accessible?

**Common causes:**
- Outbox dispatcher crash → restart dispatcher pod
- DB connection pool exhausted → check PgBouncer, increase pool if needed
- Redis down → OTP fails → fallback to manual verification
- Merchant not accepting orders → send notification, escalate after 2h

**Post-incident:**
1. Write incident report (what, when, impact, root cause, fix)
2. Add monitoring/alerting for the failure mode
3. Update this playbook if needed

---

## 4. Drop-off Reason Logging (First 30 Days)

**When:** A user abandons checkout or leaves the app mid-flow.

**Tracking:**
- `analytics_events` table captures: `checkout_started`, `cart_item_added`, `checkout_abandoned`
- Query drop-off rate:
  ```sql
  SELECT 
    COUNT(DISTINCT CASE WHEN event_type = 'checkout_started' THEN user_id END) AS started,
    COUNT(DISTINCT CASE WHEN event_type = 'order_submitted' THEN user_id END) AS completed
  FROM analytics_events
  WHERE created_at > NOW() - INTERVAL '7 days';
  ```

**Action items:**
- If drop-off > 50%: investigate UX friction points
- If drop-off increases after a deploy: check for regressions
- Log reasons (price too high, delivery fee, payment failure) in metadata

---

## 5. OTP/SMS Provider Failover Drill

**Frequency:** Monthly.

**Steps:**
1. Identify primary SMS provider
2. Simulate provider failure (disable primary in config)
3. Verify OTP requests route to secondary provider
4. Measure delivery time (should be < 10s)
5. Verify WhatsApp fallback activates if both SMS providers fail
6. Restore primary provider
7. Document results and any issues found

**Success criteria:**
- Failover completes within 30s
- No OTP delivery failures during drill
- All users receive OTP within 15s of failover
