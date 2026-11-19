# SLO Definitions & Alerting Rules

> **Status — 19 November 2026.** The values below are proposed SLO targets and alert thresholds, not measured production SLOs or proof that dashboards/alerts are active. The currently observed staging topology is a single Render API web service; Kubernetes/pod-specific rows below must be adapted to actual Render metrics before being treated as operational controls. See [the remediation plan](../remediation/IMPLEMENTATION-PLAN.md) and [progress tracker](../remediation/IMPLEMENTATION-PROGRESS.md) for verified monitoring/worker status.

## Service Level Objectives

### API Availability
| SLO | Target | Measurement |
|---|---|---|
| API uptime | 99.5% | `1 - (5xx_count / total_requests)` over 30d rolling |
| API p95 latency (read) | < 400ms | `histogram_quantile(0.95, http_request_duration_seconds)` |
| API p95 latency (write) | < 800ms | Same, filtered to POST/PATCH/DELETE |
| Search p95 latency | < 300ms | Filtered to `/v1/search` path |
| Checkout p95 latency | < 800ms | Filtered to `/v1/checkout` path |

### Business Metrics
| Metric | Target | Alert Threshold |
|---|---|---|
| OTP delivery success rate | > 98% | < 95% for 5 min |
| Checkout success rate | > 95% | < 90% for 5 min |
| Order acceptance rate (12h) | > 80% | < 70% for 1h |
| Outbox event dispatch lag | < 5s | > 30s for 5 min |

### Infrastructure
| Metric | Target | Alert Threshold |
|---|---|---|
| DB connection pool utilization | < 60% | > 80% for 5 min |
| Redis memory usage | < 70% | > 85% for 10 min |
| Pod CPU utilization | < 60% | > 80% for 10 min |
| Pod memory utilization | < 70% | > 85% for 5 min |
| Disk usage (PG data) | < 70% | > 80% for 30 min |

---

## Alerting Rules

### Critical (Page immediately)
- API returns > 50% 5xx errors for 2 min
- Database unreachable for 1 min
- All API pods crashed
- Checkout completely broken (0 successes for 5 min)

### Warning (Notify on-call)
- API p95 > 800ms for 10 min
- Search p95 > 500ms for 10 min
- DB connection pool > 80% for 5 min
- Outbox dispatch lag > 30s for 5 min
- OTP delivery rate < 95% for 5 min
- Redis memory > 85% for 10 min

### Info (Business hours)
- Single pod restart
- Outbox event retry count > 3
- Verification queue > 20 pending
- Orders stuck in SUBMITTED > 2h

---

## OTel Dashboard Panels

### 1. API Overview
- Request rate (req/s) by endpoint
- Error rate (%) by status code
- Latency heatmap (p50/p90/p95/p99)

### 2. Business Flows
- Checkout funnel (started → submitted → accepted → completed)
- Order status distribution (pie chart)
- Search queries per minute + zero-result rate

### 3. Infrastructure
- Pod CPU/memory over time
- DB active connections + pool utilization
- Redis hit rate + memory usage
- Outbox pending events count

### 4. Merchant Operations
- Verification queue depth + SLA compliance
- Average order acceptance time
- Order rejection rate

### 5. Error Tracking
- Top 10 error messages by frequency
- Error rate by endpoint
- 4xx vs 5xx breakdown
