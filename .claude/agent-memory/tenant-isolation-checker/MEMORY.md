# Tenant Isolation Checker — Agent Memory

See `patterns.md` for detailed notes on all findings and architecture patterns.

## Global Tables (No tenant_id — Expected)

- `taxonomy_definitions` — global, shared across all tenants (no tenant_id, no RLS per ERD 1.9)
- `tenants` — the tenant registry itself

## All Tenant-Scoped Tables (Confirmed via Schema Scan)

- `users` — has tenant_id; UPDATE by `users.id` alone is safe (Supabase Auth UID globally unique)
- `user_roles` — always filter by both userId + tenantId
- `projects`, `files`, `scores`, `findings`, `review_actions`
- `notifications`, `audit_logs`, `glossaries`
- `glossary_terms` — NO tenant_id column! Access via `glossary_id` FK → glossaries (which has tenant_id)
- `language_pair_configs`, `segments`, `review_sessions`
- `ai_usage_logs`, `ai_metrics_timeseries`, `audit_results`, `exported_reports`
- `feedback_events`, `file_assignments`, `fix_suggestions`, `run_metadata`
- `self_healing_config`, `severity_configs` (nullable tenant_id = system default rows)
- `suppression_rules`

## Story Audit Index (all detail in patterns.md)

| Story / Batch                    | Result          | Notable                                                                                      |
| -------------------------------- | --------------- | -------------------------------------------------------------------------------------------- |
| 1.1–1.7 baseline                 | PASS            | All server actions + pages                                                                   |
| 2.1–2.7                          | 0C/0H/0M/0L     | Upload, parsers, L1, scoring, pipeline, batch                                                |
| 2.10                             | 0C/0H/0M/1L     | 1 LOW: perf test hardcoded non-UUID-v4 strings                                               |
| 3.0                              | 0C/0H/0M/0L     | layerFilter=undefined additive-only inside and() confirmed                                   |
| 3.0.5                            | 0C/0H/0M/0L     | Pure UI story, zero new DB paths                                                             |
| 3.1                              | 0C/0H/0M/0L     | ai_usage_logs confirmed tenant-scoped                                                        |
| 3.1a                             | 0C/0H/0M/0L     | LEFT JOIN canonical pattern established                                                      |
| 3.2a                             | 0C/0H/0M/0L     | INNER JOIN glossaryTerms→glossaries correct; rollback path scoped                            |
| 3.2b5                            | 0C/0H/0M/0L     | Upload-pipeline wiring                                                                       |
| 3.2c                             | 0C/0H/4M/3L     | AT RISK — Realtime hooks missing tenant_id filter + polling no defense-in-depth              |
| CI Fix (reorderMappings + proxy) | 0C/0H/0M/1L     | LOW: revalidateTag() 2-arg call                                                              |
| Taxonomy deep-dive               | 0C/0H/0M/4L     | All LOW pre-existing                                                                         |
| Pipeline+Scoring deep-dive       | 0C/0H/0M/0L     | 23 files all PASS                                                                            |
| Parity+Dashboard+Project         | 0C/1H/1M/0L     | HIGH: getDashboardData scores JOIN no withTenant; MEDIUM: compareWithXbench no fileId filter |
| 3.4 R1                           | 0C/1H/0M/0L     | HIGH: retryAiAnalysis cross-project contamination → FIXED in R2                              |
| 3.4 R2                           | 0C/0H/0M/0L     | SECURE — all 6 files PASS                                                                    |
| **3.5**                          | **0C/2H/0M/0L** | **AT RISK — use-threshold-subscription.ts: Realtime no tenant filter + prop tenantId trust** |
| **4.0 pre-CR**                   | **0C/0H/2M/1L** | **AT RISK — use-score-subscription.ts: Realtime+polling missing tenant_id filter**           |

## OPEN FINDINGS (unresolved)

1. LOW — `createTerm.action.ts` L57-65: dup-check on `glossary_terms` by `glossaryId` only. Safe via FK chain. ACCEPTED.
2. LOW — `updateTerm.action.ts` L79-93: same pattern. ACCEPTED.
3. Story 3.2c findings (4M/3L) — status unknown (may have been fixed in 3.5; re-verify at Epic 4 sign-off).
4. **Story 3.5 HIGH x2** — `use-threshold-subscription.ts`: (a) Realtime channel missing `filter: tenant_id=eq.${tenantId}`; (b) polling fallback trusts prop `tenantId` instead of session. **MUST fix before sign-off.**
5. **Story 4.0 MEDIUM x2** — `use-score-subscription.ts`: (a) Realtime channel filters `file_id` only, no `tenant_id=eq.${tenantId}`; (b) polling fallback `.eq('file_id', fileId)` only, no `.eq('tenant_id', tenantId)`. Fix: add `tenantId` param, compound filter on both paths. **MUST fix before sign-off.**
6. **Story 4.0 LOW x1** — `getDashboardData.action.ts` L61-62: raw SQL `ANY()` instead of Drizzle `inArray()`. No isolation impact. Anti-pattern only.

## Key Patterns to Watch

- `glossary_terms` has NO tenant_id — always access via verified glossaryId from glossaries table
- `severity_configs` has nullable tenant_id (system defaults have NULL) — query must handle this
- `taxonomy_definitions` is global — never add tenant filter (it would be wrong)
- `ai_usage_logs` is tenant-scoped — SELECT uses withTenant(); INSERT sets tenantId in values
- INSERT isolation pattern: no WHERE on INSERT — set `tenantId` in value object explicitly
- Inngest tenantId chain: `requireRole()` → Inngest event payload → typed parameter → every DB query
- ANTI-PATTERN: `withTenant()` not in `.where()` = dead code. Flag HIGH.
- ANTI-PATTERN: INSERT with unverified FK from client — always SELECT with withTenant() first.
- ANTI-PATTERN: over-broad DELETE in idempotent re-run — scope DELETE to specific layer/entity.
- LEFT JOIN rule: `withTenant()` on driving table goes in WHERE; on joined table goes in JOIN condition.
- Realtime rule: EVERY `postgres_changes` channel on a tenant-scoped table MUST include `filter: tenant_id=eq.${tenantId}`.
- Polling fallback rule: EVERY PostgREST polling query MUST include `.eq('tenant_id', tenantId)`.
- Realtime publication gap: tables must be added via `ALTER PUBLICATION supabase_realtime ADD TABLE t;` or channels silently never fire. Only `user_roles` confirmed published so far.
- Prop tenantId trust: hooks that accept tenantId as prop should derive from session or assert match.
