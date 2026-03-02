# Tenant Isolation Checker — Agent Memory

See `patterns.md` for detailed notes on architecture and violations.

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

## Baseline Audit — ALL Files with DB Queries (Stories 1.1–1.7)

### PASS (correct tenant isolation)

- `updateProject.action.ts` — withTenant() on SELECT and UPDATE, both sides
- `updateLanguagePairConfig.action.ts` — withTenant() on SELECT and UPDATE/INSERT
- `createProject.action.ts` — INSERT with tenantId from session; PASS (INSERT-only, no read needed)
- `createUser.action.ts` — INSERT with tenantId from session; PASS
- `updateUserRole.action.ts` — SELECT/UPDATE filter by both userId + tenantId; PASS
- `getNotifications.action.ts` — withTenant() + userId filter; PASS (FIXED in CR round 4)
- `markNotificationRead.action.ts` — withTenant() + userId filter; PASS (FIXED in CR round 4)
- `updateTourState.action.ts` — withTenant() on UPDATE; PASS (FIXED in CR round 4)
- `getDashboardData.action.ts` — withTenant() on files + projects JOIN + scores JOIN; PASS (FIXED)
- `requireRole.ts` — SELECT userRoles by userId + tenantId; PASS
- `getCurrentUser.ts` — SELECT users by id (Supabase Auth UID = global PK); acceptable
- `createTerm.action.ts` — verifies glossary ownership via withTenant(); PASS
- `updateTerm.action.ts` — verifies via glossaries JOIN + withTenant(); PASS
- `deleteTerm.action.ts` — verifies via glossaries JOIN + withTenant(); PASS
- `deleteGlossary.action.ts` — withTenant() on SELECT and DELETE; PASS
- `importGlossary.action.ts` — verifies project + glossary ownership via withTenant(); PASS
- `getGlossaryTerms.action.ts` — withTenant() on glossary ownership check; PASS
- `glossaryCache.ts` — withTenant() on glossaries; glossary_terms accessed via glossaryId (safe)
- `taxonomyCache.ts` — global table, no tenant_id needed; PASS
- `admin/page.tsx` — withTenant() on users + userRoles JOIN filter; PASS
- `projects/page.tsx` — withTenant() on projects; files JOIN also filters tenantId; PASS
- `glossary/page.tsx` — withTenant() on projects + glossaries; PASS
- `settings/page.tsx` — withTenant() on projects + languagePairConfigs; PASS
- `taxonomy/* actions` — global table (no tenant_id needed), audit logged with tenantId; PASS
- `writeAuditLog.ts` — INSERT-only with tenantId from caller; PASS
- `setupNewUser.action.ts` — bootstrap context (no tenantId exists yet), documented; PASS
- `taxonomySeed.ts` — server-side seed script, global table; PASS

### OPEN FINDINGS (unresolved from previous story audits)

1. ~~MEDIUM — `useNotifications.ts` Realtime channel~~ → ✅ RESOLVED (2026-02-26): Verified at `src/features/dashboard/hooks/useNotifications.ts:66` — already has compound filter `user_id=eq.${userId}&tenant_id=eq.${tenantId}` + client-side guard at line 71. Original tracker had wrong file path.
2. LOW — `createTerm.action.ts` L57-65: duplicate-check query on `glossary_terms` filters by `glossaryId` only (no explicit tenant guard). Safe because `glossaryId` was verified via withTenant() in the same request, but pattern is inconsistent. ACCEPTED (safe via FK chain).
3. LOW — `updateTerm.action.ts` L79-93: same pattern — dup check on `glossaryTerms` by `glossaryId` only. Same risk level as above. ACCEPTED (safe via FK chain).

### RESOLVED FINDINGS (verified 2026-02-25)

Items below were flagged in earlier audits but have been FIXED. Kept for historical reference.

### Stories 2.1–2.7 Audit Results (Upload, Parsers, L1, Scoring, Pipeline, Batch)

**All PASS — 0C/0H/0M/0L.** Full detail in `patterns.md`.

Key schema confirmations: `upload_batches`, `segments`, `findings`, `scores`, `suppression_rules`,
`notifications`, `parity_reports`, `missing_check_reports` — all tenant-scoped. `glossaryTerms`
has NO tenant_id (access via verified glossaryId FK). `severity_configs` has nullable tenant_id
(system defaults NULL — use `or(eq, isNull)` not `withTenant()` for that table specifically).

### Story 3.0 Audit Results (Score & Review Infrastructure — 2026-02-26)

**Result: 0C/0H/0M/0L — SECURE.** Key pattern: `layerFilter ? eq(...) : undefined` in `scoreFile()`
is additive-only inside `and()` — Drizzle treats undefined as no-op; `withTenant()` remains active.
`recalculateScore.ts` (Inngest): zero DB queries; delegates to scoreFile(); tenantId from event.data.

### Story 2.10 Audit Results (Parity Verification Tests — 2026-02-26)

**Result: 0C/0H/0M/1L — SECURE.** See `patterns.md` § "Story 2.10" for full detail.

- LOW: `buildPerfSegments()` in `factories.ts` uses hardcoded non-UUID-v4 strings — zero security risk.

### Story 3.1a Audit Results (AI Usage Dashboard — 2026-02-28)

**Result: 0C/0H/0M/0L — SECURE (full pass, 5 files).**

Files: `getAiUsageSummary`, `getAiUsageByProject`, `getAiSpendByModel`, `getAiSpendTrend`, `exportAiUsage` (all in `src/features/dashboard/actions/`).

Key LEFT JOIN patterns confirmed correct:

- `getAiUsageByProject`: drives from `projects` (outer); `withTenant(projects.tenantId)` in WHERE; `withTenant(aiUsageLogs.tenantId)` in JOIN condition. Zero-spend projects preserved correctly.
- `exportAiUsage`: drives from `aiUsageLogs` (outer); `withTenant(aiUsageLogs.tenantId)` in WHERE; `withTenant(projects.tenantId)` in JOIN condition. Project name enrichment cannot leak cross-tenant names.
- In both cases: WHERE-side filter guards the driving table; JOIN-side filter guards the enrichment table. This is the canonical correct pattern for tenant-safe LEFT JOINs.

### Story 3.1 Audit Results (AI Cost Control, Throttling, Model Pinning — 2026-02-27)

**Result: 0C/0H/0M/0L — SECURE (full pass, 10 files).** See `patterns.md` § "Story 3.1" for full detail.

New table: `ai_usage_logs` — tenant-scoped (`tenantId uuid notNull FK tenants`). Confirmed PASS.
New `projects` columns: `aiBudgetMonthlyUsd`, `budgetAlertThresholdPct`, `l2PinnedModel`, `l3PinnedModel` — all SELECT/UPDATE queries use `withTenant()`.

Feature gap (not security): `runL2ForFile.ts` + `runL3ForFile.ts` call `getModelForLayer` (static),
not `getModelForLayerWithFallback` (per-project pinned). Pinning is not yet applied at runtime.
NOTE: Resolved in Story 3.2a — `runL2ForFile.ts` now calls `getModelForLayerWithFallback()` correctly.

### Story 3.2a Audit Results (AI Provider Integration / L2 Real Implementation — 2026-03-01)

**Result: 0C/0H/0M/0L — SECURE (full pass, 2 primary files + 2 indirect deps).**

Files: `src/features/pipeline/helpers/runL2ForFile.ts`, `src/lib/ai/costs.ts`,
`src/lib/ai/budget.ts` (indirect), `src/lib/ai/providers.ts` (indirect).

Key patterns confirmed:

- INNER JOIN `glossaryTerms` → `glossaries` with `withTenant(glossaries.tenantId)` in WHERE is correct (glossaryTerms has no tenant_id; INNER JOIN eliminates any row whose parent glossary fails the tenant filter). Matches established pattern from glossaryCache.ts.
- `taxonomyDefinitions` SELECT correctly omits withTenant() — global table, no tenant_id column (ERD 1.9).
- Atomic DELETE+INSERT transaction (Step 9): DELETE scoped by `withTenant() + fileId + layer='L2'` (no over-broad delete); INSERT sets tenantId in values object directly.
- Rollback path (catch block) also applies `withTenant()` on the status-to-failed UPDATE — both happy path and error path are isolated.
- `logAIUsage()` INSERT in `costs.ts`: `tenantId` flows from `AIUsageRecord` parameter (set by runL2ForFile from its own typed parameter); INSERT sets value directly — correct.
- Feature gap from Story 3.1 resolved: `runL2ForFile.ts` now calls `getModelForLayerWithFallback()`.

### Story 3.0.5 Audit Results (UX Foundation Gap Fix — 2026-03-01)

**Result: 0C/0H/0M/0L — SECURE (full pass, 9 files).** Pure UI story — zero new DB access paths.

Files audited:

- `src/components/layout/actions/getBreadcrumbEntities.action.ts` — placeholder only, no DB queries
- `src/components/layout/app-breadcrumb.tsx` — 'use client', delegates to server action only
- `src/components/layout/app-header.tsx` — presentation only, tenantId flows from server parent
- `src/components/layout/app-sidebar.tsx` — navigation only, no data access
- `src/features/batch/components/ScoreBadge.tsx` — presentation only, no data access
- `src/features/dashboard/components/RecentFilesTable.tsx` — props from pre-audited getDashboardData
- `src/features/taxonomy/components/TaxonomyMappingTable.tsx` — props-only, callbacks to server actions
- 2 test files — no DB clients instantiated

FORWARD RISK (Epic 4): `getBreadcrumbEntities.action.ts` will need real DB queries when review routes
are created. MUST use `getCurrentUser()`/`requireRole()` for tenantId (not from input params), then
`withTenant(projects.tenantId, tenantId)` for project name lookup and
`withTenant(reviewSessions.tenantId, tenantId)` for session name lookup. Input `projectId`/`sessionId`
are URL-sourced and must be treated as untrusted.

### Story 3.2b5 Audit Results (Upload-Pipeline Wiring — 2026-03-02)

**Result: 0C/0H/0M/0L — SECURE (full pass, 11 files).**

Files: `UploadPageClient.tsx`, `UploadProgressList.tsx`, `FileUploadZone.tsx`,
`parseFile.action.ts`, `createBatch.action.ts`, `ProcessingModeDialog.tsx`,
`getFilesWordCount.action.ts`, `startProcessing.action.ts`, `getFileHistory.action.ts`,
`processFile.ts` (Inngest), `e2e/pipeline-findings.spec.ts`, `e2e/upload-segments.spec.ts`,
`e2e/helpers/pipeline-admin.ts`.

Pure client-side wiring story — no new DB query paths introduced.
Key confirmed patterns:

- `parseFile(fileId)`: client passes only UUID; action resolves tenantId from requireRole(); fileId verified via withTenant() before CAS mutation.
- `createBatch({ projectId })`: projectId from client is verified via withTenant() ownership SELECT before INSERT; tenantId in INSERT values from session only.
- `startProcessing({ fileIds, projectId, mode })`: all client inputs validated against session tenantId via withTenant() before Inngest dispatch; tenantId injected into event payload from session (not client).
- `getFileHistory` LEFT JOIN scores: withTenant on `files` (driving table) in WHERE; withTenant on `scores` (joined table) in JOIN condition — canonical pattern confirmed again.
- `processFile.ts` batch check query: 3-way AND filter (withTenant + projectId + batchId) — correct.
- `service_role` in `e2e/helpers/pipeline-admin.ts`: intentional and correct — E2E test infra only, never imported by src/ application code.

## Key Patterns to Watch

- `glossary_terms` has NO tenant_id — always access via verified glossaryId from glossaries table
- `severity_configs` has nullable tenant_id (system defaults have NULL) — query must handle this
- `taxonomy_definitions` is global — never add tenant filter (it would be wrong)
- `ai_usage_logs` is tenant-scoped — SELECT uses withTenant(); INSERT sets tenantId in values
- RSC pages that do inline Drizzle queries must use withTenant() — currently all do
- Inngest functions ARE NOW ACTIVE — `processBatch` + `processFilePipeline` + `batchComplete` all confirmed tenant-safe
- INSERT isolation pattern: no WHERE clause on INSERT — set `tenantId` explicitly in value object. withTenant() only for SELECT/UPDATE/DELETE.
- Inngest tenantId pattern: Server Action sources tenantId from requireRole() → injects into event payload → helper functions receive tenantId as typed parameter.
- ANTI-PATTERN: `withTenant(col, val)` called standalone (not in `.where()`) is dead code — must be composed into AND clause. Flag as HIGH.
- ANTI-PATTERN: INSERT with unverified FK from client input — always SELECT with withTenant() first to verify ownership.
- ANTI-PATTERN: over-broad DELETE in idempotent re-run — scope DELETE to the specific layer/entity being regenerated.
- LEFT JOIN isolation rule (confirmed 3.1a): withTenant() on driving table goes in WHERE; withTenant() on joined table goes in JOIN condition. Putting the join-side filter in WHERE converts LEFT JOIN to INNER JOIN, dropping zero-rows. Both sides MUST be filtered (Guardrail #14).
