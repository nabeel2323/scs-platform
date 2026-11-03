# OTP-S1.39 — Staging Readiness Assessment

**Date:** 2026-11-03
**Scope:** Deployment, configuration, monitoring, and operational readiness for staging activation
**PR:** #104 — `feat/auth-email-otp-phase1` → `develop`

---

## 1. Pre-Deployment Checklist

### 1.1 Environment Variables

| Variable | Required? | Default | Staging Value | Status |
|----------|-----------|---------|---------------|--------|
| `SMTP_HOST` | Yes (for email) | `localhost` | **MUST SET** | ⚠️ Operator action required |
| `SMTP_PORT` | No | `587` | `587` (TLS) | ✅ OK |
| `SMTP_SECURE` | No | `false` | `true` (recommended) | ✅ OK |
| `SMTP_FROM` | Yes (for email) | `noreply@scsp.dev` | **MUST SET** (production domain) | ⚠️ Operator action required |
| `SMTP_USER` | Optional | unset | **SET IF AUTH REQUIRED** | ⚠️ Depends on SMTP provider |
| `SMTP_PASSWORD` | Optional | unset | **SET IF AUTH REQUIRED** | ⚠️ Depends on SMTP provider |
| `OTP_HMAC_SECRET` | Yes (production) | dev default | **MUST SET** (≥32 chars, unique) | ⚠️ Operator action required |
| `FLAG_AUTH_EMAIL_OTP` | No (DB flag used) | `false` | N/A (not read from env) | ✅ OK (DB-seeded) |

**Action required before staging deployment:**
1. Set `SMTP_HOST` to staging SMTP server
2. Set `SMTP_FROM` to production email address (e.g., `noreply@scsp.dev`)
3. Set `OTP_HMAC_SECRET` to a unique, random value (≥32 chars)
4. If SMTP requires authentication, set `SMTP_USER` and `SMTP_PASSWORD`

**Verification:** After deployment, check logs for:
```
[Bootstrap] P13 alert channel: ... (no webhook configured — alerts are persisted and logged only)
```
This confirms the production config gate passed.

### 1.2 Database Migrations

| Migration | File | Idempotent? | Pre-flight? | Status |
|-----------|------|-------------|-------------|--------|
| 0064 | `0064_email_identity.sql` | YES | YES (duplicate emails, orphan users) | ✅ Ready to apply |
| 0065 | `0065_hmac_identifier_hash.sql` | YES | YES (column width check) | ✅ Ready to apply |

**Application procedure:**
```bash
# Migrations are applied automatically by the migrate one-shot service during docker compose up
docker compose up -d
```

**Manual application (if needed):**
```bash
cd infra/drizzle
psql -U $DB_USER -d $DB_NAME -f migrations/0064_email_identity.sql
psql -U $DB_USER -d $DB_NAME -f migrations/0065_hmac_identifier_hash.sql
```

**Pre-flight checks (migration 0064):**
- Validates no duplicate emails (case-insensitive) exist
- Validates no orphan users (NULL phone AND NULL email) exist
- If pre-flight fails, migration aborts without changes

**Rollback procedure:**
```sql
-- Soft rollback: disable feature flag (no schema rollback needed)
UPDATE feature_flags SET enabled = false WHERE key = 'auth.email_otp.enabled';
```

### 1.3 Feature Flag

**Current state:** Seeded as `false` (disabled) by migration 0064

**Activation procedure:**
```sql
-- Enable email OTP in staging
UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled';
```

**Verification:**
```sql
-- Confirm flag is enabled
SELECT key, enabled FROM feature_flags WHERE key = 'auth.email_otp.enabled';
-- Expected: auth.email_otp.enabled | t
```

**Rollback:**
```sql
-- Disable email OTP (immediate effect, no restart)
UPDATE feature_flags SET enabled = false WHERE key = 'auth.email_otp.enabled';
```

**Impact when disabled:**
- All 6 Phase 1 endpoints return 404 (not 403 — prevents enumeration)
- Existing phone OTP and password login flows unaffected
- No error messages or user-facing changes (silent disable)

---

## 2. Infrastructure Readiness

### 2.1 SMTP Provider

**Status:** ⚠️ NOT CONFIGURED FOR STAGING

**Required actions:**
1. Provision SMTP service (e.g., SendGrid, AWS SES, Mailgun)
2. Configure DNS records (SPF, DKIM, DMARC) for sending domain
3. Set environment variables in staging deployment
4. Test delivery with a small batch of emails

**Recommended providers:**
- **SendGrid:** Free tier (100 emails/day), easy setup, good deliverability
- **AWS SES:** Low cost ($0.10/1000 emails), requires AWS account, good for high volume
- **Mailgun:** Developer-friendly, good API, free tier (5000 emails/month for 3 months)

**Testing procedure:**
```bash
# Send test email via API
curl -X POST http://localhost:3000/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Check logs for delivery confirmation
docker logs api-service | grep "SMTP delivery"
```

### 2.2 Redis

**Status:** ✅ READY

**Current usage:**
- OTP challenge storage (HMAC-hashed keys)
- Rate limit counters (per-email, per-IP)
- Session storage (refresh tokens)

**Configuration:**
- Connection: `REDIS_URL` environment variable
- Key prefix: `otp:` (challenges), `ratelimit:` (counters), `session:` (tokens)
- TTL: 300s (email OTP), 90s (phone OTP), configurable

**Monitoring:**
```bash
# Check Redis connectivity
redis-cli -u $REDIS_URL ping
# Expected: PONG

# Check OTP challenge count
redis-cli -u $REDIS_URL keys "otp:*" | wc -l

# Check rate limit counters
redis-cli -u $REDIS_URL keys "ratelimit:*" | wc -l
```

### 2.3 PostgreSQL

**Status:** ✅ READY

**Current usage:**
- User accounts (phone, email, password hash)
- Sessions (access tokens, refresh tokens)
- Feature flags (auth.email_otp.enabled)
- Audit log (account link/unlink events)

**Configuration:**
- Connection: `DATABASE_URL` environment variable
- Pool size: 10 connections (default)
- SSL: Required in production

**Monitoring:**
```sql
-- Check user count with email
SELECT COUNT(*) FROM users WHERE email IS NOT NULL;

-- Check feature flag
SELECT key, enabled FROM feature_flags WHERE key = 'auth.email_otp.enabled';

-- Check recent audit log entries
SELECT * FROM account_link_log ORDER BY created_at DESC LIMIT 10;
```

---

## 3. Monitoring & Alerting

### 3.1 Current State

**Status:** ⚠️ GAP — No email-OTP-specific monitoring

**Existing monitoring (P13 OpsAlertService):**
- Worker lease failures
- Outbox dispatch failures
- Financial invariant violations
- General HTTP errors (5xx)

**Missing monitoring:**
- ❌ Email delivery failures (SMTP errors)
- ❌ Rate limit triggers (per-email, per-IP)
- ❌ OTP verification failures (invalid/expired OTP)
- ❌ Unusual auth patterns (spike in failures, enumeration attempts)
- ❌ OTP delivery SLO metric (>98% success rate target)

### 3.2 Log-Based Monitoring (Interim)

**Until automated alerts are added, monitor these log patterns:**

**Email delivery failures:**
```bash
docker logs api-service | grep "SMTP delivery failed" | wc -l
# Alert if count > 10 in 5 minutes
```

**Rate limit triggers:**
```bash
docker logs api-service | grep "Rate limit exceeded" | wc -l
# Alert if count > 100 in 1 minute (may indicate attack)
```

**OTP verification failures:**
```bash
docker logs api-service | grep "Invalid or expired OTP" | wc -l
# Alert if count > 50 in 15 minutes (may indicate brute force)
```

**Feature flag changes:**
```bash
docker logs api-service | grep "Feature flag" | grep "auth.email_otp.enabled"
# Monitor for unexpected toggles
```

### 3.3 Recommended Alerts (Follow-Up Sprint)

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| Email delivery failure rate | >5% failures in 5 min | HIGH | Check SMTP provider status, verify credentials |
| Rate limit spike | >100 triggers in 1 min | MEDIUM | Check for attack, consider tightening limits |
| OTP verification failure spike | >50 failures in 15 min | MEDIUM | Check for brute force, consider temporary IP block |
| Feature flag disabled | `auth.email_otp.enabled = false` | LOW | Confirm intentional disable, check for unauthorized changes |
| OTP delivery SLO breach | <98% success rate in 1 hour | HIGH | Investigate SMTP provider, check logs for errors |

---

## 4. Operational Runbooks

### 4.1 Existing Runbooks

**Migration runbook:** `docs/production/OTP-S1.37-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md`
- Pre-flight checks (section 7)
- Migration application (section 8)
- Post-migration verification SQL (section 9)
- Rollback procedure (section 10)

**General deployment:** `infra/deploy/README.md`
- Container-based deployment
- Migration auto-application
- Health check endpoints

### 4.2 Missing Runbooks

**⚠️ SMTP failure playbook:** NOT AVAILABLE

**Recommended content:**
1. **Symptom:** Email delivery failures in logs
2. **Diagnosis:**
   - Check SMTP provider status page
   - Verify SMTP credentials in environment
   - Test SMTP connectivity: `telnet $SMTP_HOST $SMTP_PORT`
   - Check DNS records (SPF, DKIM, DMARC)
3. **Resolution:**
   - If provider outage: wait for resolution, consider failover provider
   - If credential issue: update environment variables, restart service
   - If DNS issue: update DNS records, wait for propagation
4. **Rollback:** Disable feature flag if unresolved

**⚠️ Rate limit attack playbook:** NOT AVAILABLE

**Recommended content:**
1. **Symptom:** Spike in rate limit triggers (>100/min)
2. **Diagnosis:**
   - Identify source IPs: `grep "Rate limit exceeded" logs | awk '{print $IP}' | sort | uniq -c`
   - Check if distributed (many IPs) or concentrated (few IPs)
3. **Resolution:**
   - If concentrated: block IPs at firewall/WAF level
   - If distributed: tighten rate limits temporarily
   - Consider CAPTCHA challenge for suspicious requests
4. **Escalation:** If attack persists, engage security team

---

## 5. Deployment Procedure

### 5.1 Pre-Deployment

1. **Verify environment variables:**
   ```bash
   # Check staging .env file
   grep -E "SMTP_|OTP_HMAC_SECRET" .env.staging
   ```

2. **Verify database connectivity:**
   ```bash
   psql -U $DB_USER -d $DB_NAME -c "SELECT 1"
   ```

3. **Verify Redis connectivity:**
   ```bash
   redis-cli -u $REDIS_URL ping
   ```

4. **Verify SMTP connectivity:**
   ```bash
   telnet $SMTP_HOST $SMTP_PORT
   # Expected: 220 smtp.provider.com ESMTP
   ```

### 5.2 Deployment

1. **Pull latest code:**
   ```bash
   git pull origin develop
   ```

2. **Build containers:**
   ```bash
   docker compose build
   ```

3. **Apply migrations:**
   ```bash
   docker compose up migrate
   # Wait for "Migrations complete" message
   ```

4. **Start services:**
   ```bash
   docker compose up -d
   ```

5. **Verify health:**
   ```bash
   curl http://localhost:3000/health
   # Expected: {"status":"ok"}
   ```

### 5.3 Post-Deployment

1. **Verify feature flag is OFF:**
   ```sql
   SELECT key, enabled FROM feature_flags WHERE key = 'auth.email_otp.enabled';
   -- Expected: auth.email_otp.enabled | f
   ```

2. **Test email OTP flow (with flag OFF):**
   ```bash
   curl -X POST http://localhost:3000/v1/auth/otp/email/request \
     -H "Content-Type: application/json" \
     -d '{"email": "test@example.com"}'
   # Expected: 404 Not Found
   ```

3. **Enable feature flag:**
   ```sql
   UPDATE feature_flags SET enabled = true WHERE key = 'auth.email_otp.enabled';
   ```

4. **Test email OTP flow (with flag ON):**
   ```bash
   curl -X POST http://localhost:3000/v1/auth/otp/email/request \
     -H "Content-Type: application/json" \
     -d '{"email": "test@example.com"}'
   # Expected: 200 OK with delivery status
   ```

5. **Check logs for successful delivery:**
   ```bash
   docker logs api-service | grep "SMTP delivery"
   # Expected: "SMTP delivery accepted for a***@example.com"
   ```

6. **Monitor for 24 hours:**
   - Watch for email delivery failures
   - Watch for rate limit triggers
   - Watch for OTP verification failures
   - Check user feedback

---

## 6. Rollback Procedure

### 6.1 Soft Rollback (Feature Flag)

**When to use:** Issues with email OTP flow, but no data corruption

**Procedure:**
```sql
-- Disable feature flag (immediate effect)
UPDATE feature_flags SET enabled = false WHERE key = 'auth.email_otp.enabled';
```

**Impact:**
- All 6 Phase 1 endpoints return 404
- Existing phone OTP and password login unaffected
- No user-facing error messages (silent disable)
- No data loss or corruption

**Verification:**
```bash
curl -X POST http://localhost:3000/v1/auth/otp/email/request \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
# Expected: 404 Not Found
```

### 6.2 Hard Rollback (Schema Revert)

**When to use:** Data corruption, critical bugs, security vulnerabilities

**⚠️ WARNING:** This is a destructive operation. Requires database downtime.

**Procedure:**
1. **Disable feature flag:**
   ```sql
   UPDATE feature_flags SET enabled = false WHERE key = 'auth.email_otp.enabled';
   ```

2. **Stop services:**
   ```bash
   docker compose stop api web mobile
   ```

3. **Revert migration 0065:**
   ```sql
   -- Remove hash_version column
   ALTER TABLE account_link_log DROP COLUMN IF EXISTS hash_version;
   
   -- Narrow identifier_hash back to varchar(64)
   ALTER TABLE account_link_log ALTER COLUMN identifier_hash TYPE varchar(64);
   ```

4. **Revert migration 0064:**
   ```sql
   -- Drop account_link_log table
   DROP TABLE IF EXISTS account_link_log;
   
   -- Drop case-insensitive email index
   DROP INDEX IF EXISTS idx_users_email_lower;
   
   -- Make phone NOT NULL again
   ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
   
   -- Remove CHECK constraint
   ALTER TABLE users DROP CONSTRAINT IF EXISTS users_at_least_one_identifier;
   
   -- Remove feature flag
   DELETE FROM feature_flags WHERE key = 'auth.email_otp.enabled';
   ```

5. **Start services:**
   ```bash
   docker compose up -d
   ```

6. **Verify:**
   ```bash
   curl http://localhost:3000/health
   # Expected: {"status":"ok"}
   ```

**Impact:**
- All email identifiers removed from user accounts
- Users with only email (no phone) will be orphaned — **MANUAL INTERVENTION REQUIRED**
- Account link log lost — **AUDIT TRAIL GAP**
- Feature flag removed — **CANNOT RE-ENABLE WITHOUT RE-APPLYING MIGRATIONS**

**Recommendation:** Avoid hard rollback unless absolutely necessary. Prefer soft rollback + forward-fix.

---

## 7. Success Criteria

### 7.1 Deployment Success

- ✅ Migrations applied without errors
- ✅ Services start and pass health checks
- ✅ Feature flag is OFF by default
- ✅ Email OTP endpoints return 404 when flag is OFF
- ✅ Phone OTP and password login flows unaffected

### 7.2 Activation Success

- ✅ Feature flag toggled ON
- ✅ Email OTP request returns 200 with delivery status
- ✅ Email OTP verify returns 200 with JWT tokens
- ✅ Account linking works with OTP proof-of-control
- ✅ Rate limiting enforced (5 req/15min per email, 20 req/60s per IP)
- ✅ Timing floor enforced (250ms minimum response time)
- ✅ No PII in logs (emails and phones masked)
- ✅ No OTP values in logs

### 7.3 Operational Success (24h Monitoring)

- ✅ Email delivery success rate >98%
- ✅ Rate limit triggers <100/hour (normal usage)
- ✅ OTP verification failures <50/day (normal usage)
- ✅ No security incidents (enumeration, brute force, data leaks)
- ✅ No user complaints or support tickets

---

## 8. Risk Assessment

### 8.1 High Risk

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SMTP provider outage | LOW | HIGH | Soft rollback (disable feature flag), monitor provider status |
| OTP_HMAC_SECRET leak | LOW | CRITICAL | Rotate secret immediately, invalidate all pending OTPs, audit access |
| Email enumeration attack | MEDIUM | MEDIUM | Timing floor (250ms), enumeration-resistant responses, rate limiting |

### 8.2 Medium Risk

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Rate limit too aggressive | LOW | MEDIUM | Monitor user complaints, adjust limits if needed |
| Email delivery delays | MEDIUM | LOW | Log delivery times, investigate slow providers |
| Feature flag accidentally enabled | LOW | MEDIUM | Require SQL command to enable (not env var), audit flag changes |

### 8.3 Low Risk

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration fails mid-application | LOW | HIGH | Pre-flight checks, idempotent migrations, rollback procedure |
| Redis connection failure | LOW | MEDIUM | Rate limiting fails open (allows requests), OTP challenges fail closed (rejects) |
| Database connection failure | LOW | CRITICAL | Service health check fails, automatic restart, alert operations team |

---

## 9. Recommendations

### 9.1 Before Staging Deployment

1. **Set SMTP credentials** in staging environment
2. **Set unique OTP_HMAC_SECRET** (≥32 chars, random)
3. **Test SMTP connectivity** from staging servers
4. **Review migration pre-flight checks** (duplicate emails, orphan users)

### 9.2 Before Production Activation

1. **Deploy to staging** and run full test suite
2. **Monitor staging for 48 hours** — verify no issues
3. **Create SMTP failure playbook** in operational runbooks
4. **Add OpsAlertService hooks** for email delivery failures
5. **Load test email OTP flow** — verify rate limits and timing floor

### 9.3 After Production Activation

1. **Monitor logs for 24 hours** — watch for delivery failures, rate limits, verification failures
2. **Track email delivery success rate** — target >98%
3. **Collect user feedback** — identify UX issues or confusion
4. **Review rate limit settings** — adjust if too aggressive or too lenient
5. **Plan follow-up sprint** — address operational gaps (monitoring, alerting, runbooks)

---

## 10. Conclusion

**Staging readiness: ✅ READY (with operator actions)**

The Phase 1 email-first identity implementation is ready for staging deployment. All code is tested, typed, and documented. Migrations are idempotent and safe. Feature flag provides soft rollback capability.

**Blocking actions:**
1. ⚠️ Configure SMTP credentials in staging environment
2. ⚠️ Set unique OTP_HMAC_SECRET (≥32 chars)
3. ⚠️ Test SMTP connectivity before deployment

**Non-blocking gaps (can be addressed in follow-up sprint):**
- No email-OTP-specific monitoring/alerting
- No SMTP failure playbook
- No OTP delivery SLO metric collection

**Recommendation:** Proceed with staging deployment after completing blocking actions. Monitor closely for 48 hours before production activation.

---

**Report prepared by:** Staging readiness assessment (S1.39 task)
**Date:** 2026-11-03
**Status:** COMPLETE — READY FOR STAGING DEPLOYMENT (pending operator actions)
