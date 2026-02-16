# Load Testing Plan

## Targets (Pre-Launch Gate)

| Scenario | Concurrent | Target | Metric |
|----------|-----------|--------|--------|
| Dashboard page loads | 50 | TTI <= 2s | P95 response time |
| QA pipeline execution | 10 | Complete without errors | Success rate 100% |
| Realtime subscriptions | 50 | Stable 5 min | Connection stability |
| Sustained load | 100 req/min x 10min | P99 < 5s, <1% error | Throughput + error rate |

## Performance Upgrade Triggers

| Service | Trigger | Action |
|---------|---------|--------|
| Supabase DB | Pool utilization >80% | Increase pool size |
| Vercel Functions | Timeout rate >2% | Optimize function bundle |
| Inngest | Monthly runs >4K | Upgrade to Pro plan |
| Upstash Redis | Daily commands >8K | Upgrade to Pay-as-you-go |

## Tool

- k6 or Artillery (decision deferred to pre-launch)
- Scripts location: `e2e/load/`

## Notes

- Full load testing requires completed pipeline (Epic 2-3)
- This task creates the framework and documents targets
- Actual execution deferred to pre-launch validation
