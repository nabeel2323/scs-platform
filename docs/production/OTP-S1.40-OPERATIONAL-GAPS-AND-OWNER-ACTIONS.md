# OTP-S1.40 — Operational Gaps & Owner Actions

**Date:** 2026-11-03
**Scope:** Operational gaps, monitoring needs, and required owner actions for Phase 1 staging activation
**PR:** #104 (merged at `428b8fa`)

---

## 1. Executive Summary

The Phase 1 email-first identity implementation is **code-complete, tested, and merged**. However, several operational gaps remain that should be addressed before or shortly after staging activation. This document catalogs all gaps, classifies them by severity, and specifies the owner actions required.

**Gap summary:**
- 🔴 HIGH: 0 gaps
- 🟡 MEDIUM: 3 gaps (monitoring, alerting, runbooks)
- 🟢 LOW: 2 gaps (type safety, documentation)
- ⚠️ REQUIRES OWNER ACTION: 5 items

---

## 2. Monitoring Gaps

### 2.1 M-01: No Email-OTP-Specific Alerting

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Status** | ⚠️ GAP — NOT BLOCKING |
| **Source** | `apps/api/src/modules/operations/ops-alert.service.ts` |
| **Impact** | Operations team cannot detect email delivery outages automatically |

**Current state:**
- Email delivery failures are logged at WARN/ERROR level
- Rate limit triggers are logged at ERROR level
- OTP verification failures are logged at ERROR level
- **No `OpsAlertService.raise()` calls for any email-OTP conditions**

**Required implementation:**
```typescript
// In identity.service.ts, add alert calls:

// After SMTP delivery failure
if (!deliveryResult.success) {
  await this.opsAlertService.raise({
    type: 'EMAIL_DELIVERY_FAILURE',
    severity: 'HIGH',
    message: `SMTP delivery failed for email OTP`,
    metadata: { emailHash, deliveryError: deliveryResult.error }
  });
}

// After rate limit trigger
if (!rateCheck.allowed) {
  await this.opsAlertService.raise({
    type: 'RATE_LIMIT_EXCEEDED',
    severity: 'MEDIUM',
    message: `Rate limit exceeded for email OTP request`,
    metadata: { emailHash, ipHash, limit: rateCheck.limit }
  });
}

// After verification failure spike (track in Redis)
if (failureCount > 50) {
  await this.opsAlertService.raise({
    type: 'OTP_VERIFICATION_FAILURE_SPIKE',
    severity: 'MEDIUM',
    message: `Unusual spike in OTP verification failures`,
    metadata: { failureCount, window: '15min' }
  });
}
```

**Owner action:** Create follow-up ticket for monitoring implementation
**Estimated effort:** 1-2 days
**Priority:** Follow-up sprint (not blocking for staging activation)

---

### 2.2 M-02: P13 Monitor Does Not Scan Email-OTP Conditions

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Status** | ⚠️ GAP — NOT BLOCKING |
| **Source** | `apps/api/src/modules/operations/p13-monitor.service.ts` |
| **Impact** | No automated anomaly detection for auth patterns |

**Current state:**
- P13 monitor scans for worker lease failures, outbox dispatch failures, financial invariant violations
- **No scans for email-OTP-specific conditions**

**Required implementation:**
```typescript
// In p13-monitor.service.ts, add scan methods:

async scanEmailOtpConditions() {
  // 1. Email delivery success rate (last 1 hour)
  const deliveryStats = await this.db.db.execute(sql`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN metadata->>'deliveryStatus' = 'accepted' THEN 1 ELSE 0 END) AS success
    FROM audit_log
    WHERE action = 'auth.otp_request'
      AND metadata->>'channel' = 'email'
      AND created_at > NOW() - INTERVAL '1 hour'
  `);
  
  const successRate = deliveryStats.success / deliveryStats.total;
  if (successRate < 0.95) {
    await this.opsAlertService.raise({
      type: 'OTP_DELIVERY_SLO_BREACH',
      severity: 'HIGH',
      message: `Email OTP delivery success rate below 95%`,
      metadata: { successRate, window: '1hour' }
    });
  }
  
  // 2. Rate limit trigger rate (last 15 min)
  const rateLimitCount = await this.db.db.execute(sql`
    SELECT COUNT(*) FROM audit_log
    WHERE action = 'rate_limit_exceeded'
      AND created_at > NOW() - INTERVAL '15 minutes'
  `);
  
  if (rateLimitCount > 100) {
    await this.opsAlertService.raise({
      type: 'RATE_LIMIT_SPIKE',
      severity: 'MEDIUM',
      message: `Unusual spike in rate limit triggers`,
      metadata: { count: rateLimitCount, window: '15min' }
    });
  }
}
```

**Owner action:** Create follow-up ticket for monitor extension
**Estimated effort:** 1 day
**Priority:** Follow-up sprint

---

### 2.3 M-03: No OTP Delivery SLO Metric Collection

| Field | Value |
|-------|-------|
| **Severity** | MEDIUM |
| **Status** | ⚠️ GAP — NOT BLOCKING |
| **Source** | `docs/monitoring/slo-and-alerting.md` |
| **Impact** | SLO compliance cannot be measured automatically |

**Current state:**
- SLO documentation defines target: >98% delivery success rate
- Alert threshold defined: <95% for 5 minutes
- **No automated metric collection or alerting rule**

**Required implementation:**
1. Create Redis metric collection:
   ```typescript
   // Track delivery attempts and outcomes
   await redis.incr(`metrics:email_otp:delivery:attempts:${date}`);
   if (success) {
     await redis.incr(`metrics:email_otp:delivery:success:${date}`);
   }
   ```

2. Create Grafana dashboard:
   - Panel 1: Email OTP delivery success rate (time series)
   - Panel 2: Delivery attempts per hour (bar chart)
   - Panel 3: Average delivery time (time series)
   - Alert rule: Success rate <95% for 5 min → page on-call

3. Create Prometheus exporter (if using Prometheus):
   ```typescript
   const emailOtpDeliverySuccess = new Counter({
     name: 'email_otp_delivery_success_total',
     help: 'Total successful email OTP deliveries'
   });
   ```

**Owner action:** Create follow-up ticket for SLO implementation
**Estimated effort:** 2-3 days
**Priority:** Follow-up sprint

---

## 3. Runbook Gaps

### 3.1 R-01: No SMTP Failure Playbook

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Status** | ⚠️ GAP — NOT BLOCKING |
| **Source** | `docs/playbooks/operational-playbooks.md` |
| **Impact** | Operators lack guidance for email delivery outages |

**Current state:**
- Operational playbooks cover SMS/WhatsApp provider failover
- **No playbook for SMTP failure scenarios**

**Required content:**

```markdown
# SMTP Failure Playbook

## Symptom
Email delivery failures in logs:
```bash
docker logs api-service | grep "SMTP delivery failed" | wc -l
# Alert if count > 10 in 5 minutes
```

## Diagnosis

### Step 1: Check SMTP provider status
- SendGrid: https://status.sendgrid.com/
- AWS SES: https://health.aws.amazon.com/health/status
- Mailgun: https://status.mailgun.com/

### Step 2: Verify SMTP credentials
```bash
docker compose exec api printenv | grep SMTP_
# Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD are set
```

### Step 3: Test SMTP connectivity
```bash
docker compose exec api node -e "
const net = require('net');
const client = new net.Socket();
client.connect(process.env.SMTP_PORT, process.env.SMTP_HOST, () => {
  console.log('Connected');
  client.destroy();
});
client.on('error', (e) => console.error('Error:', e.message));
"
```

### Step 4: Check DNS records
```bash
dig TXT your-domain.com
# Verify SPF record: v=spf1 include:provider.com ~all

dig TXT default._domainkey.your-domain.com
# Verify DKIM record exists

dig TXT _dmarc.your-domain.com
# Verify DMARC record: v=DMARC1; p=quarantine; ...
```

## Resolution

### If provider outage
- Wait for provider resolution
- Consider failover to secondary provider (if configured)
- Soft rollback: disable feature flag if outage > 1 hour

### If credential issue
- Update SMTP_USER and SMTP_PASSWORD in environment
- Restart API service: `docker compose restart api`

### If DNS issue
- Update DNS records with provider
- Wait for propagation (up to 48 hours)
- Test with different DNS resolver: `dig @8.8.8.8 TXT your-domain.com`

## Rollback
```sql
UPDATE feature_flags SET enabled = false WHERE key = 'auth.email_otp.enabled';
```

## Escalation
- If unresolved after 1 hour: engage SMTP provider support
- If unresolved after 4 hours: page on-call engineer
- If data loss suspected: page engineering manager
```

**Owner action:** Add playbook to `docs/playbooks/operational-playbooks.md`
**Estimated effort:** 2 hours
**Priority:** Before production activation

---

### 3.2 R-02: No Email OTP Incident Response Procedure

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Status** | ⚠️ GAP — NOT BLOCKING |
| **Source** | N/A |
| **Impact** | No documented procedure for email OTP security incidents |

**Required content:**

```markdown
# Email OTP Incident Response Procedure

## Incident: OTP Enumeration Attack

### Symptoms
- Spike in email OTP requests from single IP
- Same email requested multiple times
- Timing analysis attempts (response times vary)

### Response
1. Verify timing floor is enforced (250ms minimum)
2. Check rate limits are triggering (5 req/15min per email, 20 req/60s per IP)
3. If attack persists, block IP at WAF/firewall level
4. Monitor logs for successful verifications (should be zero)

## Incident: OTP Brute Force Attack

### Symptoms
- Spike in verification failures for single email
- Multiple OTP codes attempted
- Failures concentrated in short time window

### Response
1. Verify max attempts limit is enforced (5 attempts per challenge)
2. Check challenge TTL (300s for email)
3. If attack persists, temporarily increase lockout duration
4. Notify affected user via alternative channel

## Incident: SMTP Credential Compromise

### Symptoms
- Unauthorized use of SMTP credentials
- Spam/phishing emails sent from platform address
- SMTP provider alerts

### Response
1. Rotate SMTP_PASSWORD immediately
2. Revoke SMTP API keys with provider
3. Audit email logs for unauthorized sends
4. Notify affected users if PII exposed
5. Update environment variables and restart API

## Incident: OTP_HMAC_SECRET Compromise

### Symptoms
- Unauthorized Redis access
- OTP challenges precomputed
- Successful verifications without email delivery

### Response
1. Rotate OTP_HMAC_SECRET immediately
2. Flush all OTP challenges from Redis: `redis-cli FLUSHDB` (or key pattern: `redis-cli keys "otp:*" | xargs redis-cli del`)
3. All pending OTPs become invalid — users must request new ones
4. Audit Redis access logs
5. Update environment variable and restart API
```

**Owner action:** Create incident response document
**Estimated effort:** 3 hours
**Priority:** Before production activation

---

## 4. Type Safety Gaps

### 4.1 T-01: Mobile `requestEmailOtp()` Returns Untyped Map

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Status** | ⚠️ GAP — NOT BLOCKING |
| **Source** | `mobile/lib/services/api_service.dart` line 160 |
| **Impact** | Type-safety gap only; wire format is correct |

**Current state:**
```dart
Future<Map<String, dynamic>> requestEmailOtp(String email) async =>
    (await _dio.post('/v1/auth/otp/email/request', data: {'email': email})).data;
```

**Web client (typed):**
```typescript
export async function requestEmailOtp(email: string): Promise<EmailOtpRequestResponse> {
  // ...
  return res.json();
}
```

**Required fix:**
Generate typed Dart model from OpenAPI spec:
```bash
# Install openapi-generator-cli
npm install @openapitools/openapi-generator-cli -g

# Generate Dart client
openapi-generator-cli generate \
  -i packages/contracts/openapi/openapi.json \
  -g dart-dio \
  -o mobile/lib/generated/
```

**Owner action:** Create follow-up ticket for Dart client generation
**Estimated effort:** 1 day
**Priority:** Backlog (low)

---

## 5. Documentation Gaps

### 5.1 D-01: README Does Not Mention Email OTP Feature

| Field | Value |
|-------|-------|
| **Severity** | LOW |
| **Status** | ⚠️ GAP — NOT BLOCKING |
| **Source** | `README.md`, `mobile/README.md` |
| **Impact** | New developers unaware of Phase 1 feature |

**Required update:**
Add section to root `README.md`:
```markdown
## Email-First Identity (Phase 1)

The platform supports dual-identifier authentication: phone (SMS/WhatsApp) and email (SMTP).

### Features
- Email OTP delivery via SMTP
- Account linking/unlinking with proof-of-control
- Enumeration-resistant responses
- Rate limiting (per-email and per-IP)
- Feature flag kill switch

### Configuration
See `docs/production/OTP-S1.40-ENVIRONMENT-CONFIGURATION-REGISTER.md` for required environment variables.

### Activation
Email OTP is disabled by default. Enable via feature flag:
```sql
UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled';
```
```

**Owner action:** Update README files
**Estimated effort:** 30 minutes
**Priority:** Backlog (low)

---

## 6. Required Owner Actions

### 6.1 Before Staging Deployment

| # | Action | Priority | Estimated Effort | Blocker? |
|---|--------|----------|------------------|----------|
| 1 | Configure SMTP credentials in staging environment | 🔴 HIGH | 30 min | YES — cannot test email delivery without SMTP |
| 2 | Generate and set OTP_HMAC_SECRET (≥32 chars, unique) | 🔴 HIGH | 5 min | YES — API refuses to boot without it |
| 3 | Verify staging database is accessible and backed up | 🔴 HIGH | 1 hour | YES — migrations require DB access |
| 4 | Verify staging Redis is accessible | 🟡 MEDIUM | 15 min | NO — but required for rate limiting |
| 5 | Test SMTP connectivity from staging servers | 🟡 MEDIUM | 30 min | NO — but required for email delivery |

### 6.2 Before Production Activation

| # | Action | Priority | Estimated Effort | Blocker? |
|---|--------|----------|------------------|----------|
| 6 | Deploy to staging and run full smoke test suite | 🔴 HIGH | 2 hours | YES — must verify staging before production |
| 7 | Monitor staging for 48 hours | 🔴 HIGH | 48 hours (passive) | YES — must verify stability |
| 8 | Configure production SMTP credentials | 🔴 HIGH | 30 min | YES — cannot send emails without SMTP |
| 9 | Generate production OTP_HMAC_SECRET (different from staging) | 🔴 HIGH | 5 min | YES — security requirement |
| 10 | Review and approve staging activation results | 🟡 MEDIUM | 1 hour | NO — but recommended |

### 6.3 Follow-Up Sprint (Recommended)

| # | Action | Priority | Estimated Effort | Blocker? |
|---|--------|----------|------------------|----------|
| 11 | Add OpsAlertService hooks for email delivery failures | 🟡 MEDIUM | 1-2 days | NO — but required for monitoring |
| 12 | Extend P13MonitorService to scan email-OTP conditions | 🟡 MEDIUM | 1 day | NO — but required for anomaly detection |
| 13 | Create SMTP failure playbook | 🟢 LOW | 2 hours | NO — but required for incident response |
| 14 | Implement OTP delivery SLO metric collection | 🟢 LOW | 2-3 days | NO — but required for SLA compliance |
| 15 | Generate typed Dart client from OpenAPI spec | 🟢 LOW | 1 day | NO — type safety improvement only |
| 16 | Update README files to mention email OTP feature | 🟢 LOW | 30 min | NO — documentation improvement only |

---

## 7. Risk Assessment

### 7.1 High Risk (Mitigated)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SMTP provider outage | LOW | HIGH | Soft rollback (disable feature flag), monitor provider status |
| OTP_HMAC_SECRET leak | LOW | CRITICAL | Rotate secret immediately, flush Redis, invalidate pending OTPs |
| Email enumeration attack | MEDIUM | MEDIUM | Timing floor (250ms), enumeration-resistant responses, rate limiting |

### 7.2 Medium Risk (Monitoring Gaps)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Email delivery failures go unnoticed | MEDIUM | MEDIUM | Add OpsAlertService hooks (gap M-01) |
| Rate limit attacks go unnoticed | MEDIUM | MEDIUM | Extend P13MonitorService (gap M-02) |
| SLO breaches go unmeasured | LOW | LOW | Implement metric collection (gap M-03) |

### 7.3 Low Risk (Documentation Gaps)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Operators lack SMTP failure guidance | LOW | LOW | Create playbook (gap R-01) |
| New developers unaware of feature | LOW | LOW | Update README (gap D-01) |
| Mobile client lacks type safety | LOW | LOW | Generate typed client (gap T-01) |

---

## 8. Recommendations

### 8.1 Immediate (Before Staging Activation)

1. ✅ **Complete all owner actions in Section 6.1** (SMTP config, HMAC secret, DB backup)
2. ✅ **Run smoke test suite** (OTP-S1.40-STAGING-SMOKE-TEST-PLAN.md)
3. ✅ **Verify all tests pass** (463 unit + 55 web)

### 8.2 Short-Term (Before Production Activation)

1. ⚠️ **Complete all owner actions in Section 6.2** (staging monitoring, production config)
2. ⚠️ **Create SMTP failure playbook** (gap R-01)
3. ⚠️ **Create incident response procedure** (gap R-02)

### 8.3 Long-Term (Follow-Up Sprint)

1. 📋 **Add OpsAlertService hooks** (gap M-01)
2. 📋 **Extend P13MonitorService** (gap M-02)
3. 📋 **Implement SLO metric collection** (gap M-03)
4. 📋 **Generate typed Dart client** (gap T-01)
5. 📋 **Update README files** (gap D-01)

---

## 9. Acceptance Criteria for Staging Activation

**All must be true before declaring staging activation complete:**

- [ ] SMTP credentials configured and tested
- [ ] OTP_HMAC_SECRET set (≥32 chars, unique)
- [ ] Migrations 0064 and 0065 applied successfully
- [ ] Feature flag toggled ON
- [ ] All smoke tests pass (8 phases, 30+ tests)
- [ ] Email delivery success rate >98% (first 24 hours)
- [ ] No security incidents (enumeration, brute force, data leaks)
- [ ] No user complaints or support tickets
- [ ] Logs show no errors or warnings
- [ ] Rate limiting enforced correctly
- [ ] Timing floor enforced (≥250ms)
- [ ] Kill switch works (feature flag toggle OFF → 404)

---

## 10. References

**Documentation:**
- `docs/production/OTP-S1.40-STAGING-ACTIVATION-RUNBOOK.md`
- `docs/production/OTP-S1.40-ENVIRONMENT-CONFIGURATION-REGISTER.md`
- `docs/production/OTP-S1.40-MIGRATION-AND-ROLLBACK-PLAN.md`
- `docs/production/OTP-S1.40-STAGING-SMOKE-TEST-PLAN.md`

**Implementation:**
- `apps/api/src/modules/operations/ops-alert.service.ts`
- `apps/api/src/modules/operations/p13-monitor.service.ts`
- `docs/monitoring/slo-and-alerting.md`
- `docs/playbooks/operational-playbooks.md`

**S1.39 findings:**
- `docs/production/OTP-S1.39-FINDINGS-AND-REMEDIATION-REGISTER.md` (operational gaps O-01 to O-05)

---

**Document prepared by:** S1.40 staging activation preparation
**Date:** 2026-11-03
**Status:** COMPLETE — ALL GAPS DOCUMENTED, OWNER ACTIONS IDENTIFIED
