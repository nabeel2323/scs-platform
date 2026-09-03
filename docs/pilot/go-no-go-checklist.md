# Pilot Launch — Go/No-Go Checklist

## Pre-Launch Readiness

### Technical Readiness
- [ ] All M1–M6 backend modules implemented and compile clean
- [ ] Load tests pass p95 budgets (checkout < 800ms, search < 300ms)
- [ ] RBAC verification script passes (all routes object-level authorized)
- [ ] Outbox dispatcher running and dispatching events
- [ ] Health endpoints (`/healthz`, `/readyz`) responding correctly
- [ ] Database migrations run cleanly from scratch
- [ ] Seed script populates roles, permissions, test data
- [ ] Docker Compose dev environment starts all services
- [ ] OTel dashboards configured with all 5 panels
- [ ] Alerting rules active (critical, warning, info)

### Security Readiness
- [ ] SAST scan clean (no critical/high findings)
- [ ] Dependency scan clean (no known CVEs)
- [ ] All protected routes have JWT auth guard
- [ ] Admin routes have permissions guard
- [ ] CORS allowlist configured (no wildcard in production)
- [ ] Helmet security headers enabled
- [ ] Rate limiting configured on auth endpoints
- [ ] OTP throttling active (per-phone cooldown)
- [ ] SQL injection tested (parameterized queries only)
- [ ] Secrets not in code (env vars only)

### Operational Readiness
- [ ] Operational playbooks documented and reviewed
- [ ] Concierge import process tested
- [ ] Verification review SLA (48h) process defined
- [ ] Incident response playbook tested (< 30 min response)
- [ ] OTP/SMS failover drill completed
- [ ] Backup + PITR configured (quarterly restore drill scheduled)
- [ ] Monitoring dashboards accessible to ops team
- [ ] On-call rotation defined

### Business Readiness
- [ ] Anchor suppliers identified and committed (min 3)
- [ ] Anchor supplier catalogs imported (min 20 SKUs each)
- [ ] Retailer group recruited (min 10 for pilot)
- [ ] Launch area defined (geofence for delivery)
- [ ] Field support team trained (min 2 people)
- [ ] Merchant onboarding flow tested end-to-end
- [ ] Buyer purchase flow tested end-to-end
- [ ] Dispute resolution process defined

---

## Go/No-Go Decision Matrix

| KPI | Target | Gate |
|---|---|---|
| Activation rate (verified merchants who create catalog) | > 60% | Must pass |
| First-order conversion (registered buyers who place order) | > 20% | Must pass |
| Order completion rate (submitted → delivered) | > 80% | Must pass |
| Repeat order rate (buyers with 2+ orders in 14d) | > 15% | Monitor |
| Active merchants (placed/accepted order in 7d) | > 50% | Monitor |

**Go:** All "Must pass" KPIs met during dry-run week.
**No-Go:** Any "Must pass" KPI below target → investigate and fix before launch.

---

## Pilot Week Schedule

| Day | Activity |
|---|---|
| Mon | Final dry-run with anchor suppliers + retailer group |
| Tue | Soft launch (5 retailers, 2 suppliers) — monitor closely |
| Wed | Expand to 10 retailers — check order acceptance times |
| Thu | Full pilot group (all recruited retailers) |
| Fri | Week 1 review — KPI check, issue triage, playbook updates |
| Sat–Sun | Monitoring only — auto-escalation if issues |

---

## Post-Launch Monitoring (First 30 Days)

- Daily KPI review (activation, conversion, completion, repeat)
- Weekly playbook review and update
- Drop-off reason analysis (checkout abandonment)
- OTP delivery variance measurement
- Verification queue SLA tracking
- Order acceptance time tracking
- Incident log review
