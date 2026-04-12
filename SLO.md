# SLO Definition — B&E Trusted Registry

## Service Level Objectives

| Indicator | Objective | Window |
|---|---|---|
| `/api/health` availability | ≥ 99.5% HTTP 200 | 30-day rolling |
| `/api/health/ready` availability | ≥ 99.0% HTTP 200 (DB reachable) | 30-day rolling |
| `/api/metrics/business` latency | p95 < 1 000 ms | 7-day rolling |
| `/api/metrics/business degraded` | degraded=false ≥ 99% of checks | 7-day rolling |
| Auth register/login latency | p95 < 2 000 ms | 7-day rolling |
| Stripe checkout session creation | ≥ 99.0% success (non-4xx) | 30-day rolling |
| Webhook signature rejection rate | 100% unsigned requests rejected (HTTP 400) | always |

## Error Budget

- Health availability 99.5% → allows ~3.6 hours downtime / 30 days
- DB readiness 99.0% → allows ~7.2 hours / 30 days
- Metrics latency / degraded → evaluated weekly via monitor-prod.sh cron

## SLO Breach Response

1. **Liveness fails** → Immediate incident (P1), page on-call, check Railway deployment status
2. **Readiness fails** → P1, check Postgres service on Railway, verify environment variables
3. **Metrics degraded=true** → P2, check DB query load, check pg_stat_activity, consider vacuuming
4. **Latency SLO breach** → P2, check Railway logs, identify slow queries
5. **Stripe checkout fail rate** → P1, check Stripe dashboard, verify STRIPE_SECRET_KEY rotation status

## Measurement Tools

- `scripts/monitor-prod.sh` — end-to-end check (run every 5 min via cron)
- `scripts/monitor-and-alert.sh` — alerting wrapper (Slack, ntfy, email)
- `scripts/ops-daily-report.sh` — daily observability report
- GitHub Actions CI `production-health` job — post-merge health gate
- `/metrics` — Prometheus-compatible endpoint (scrape-able by any agent)
- `/api/metrics/business` — business KPI endpoint
