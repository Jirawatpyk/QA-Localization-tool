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

### CI Fix Commits Audit Results (reorderMappings + proxy + pipeline-admin — 2026-03-03)

**Result: 0C/0H/0M/1L — SECURE.**

Files:

- `src/features/taxonomy/actions/reorderMappings.action.ts` — global table (taxonomyDefinitions), no tenant_id column. withTenant() correctly absent. Access control via requireRole('admin','write') (M3 write path: DB-verified role with tenantId-scoped userRoles query). Audit log includes tenantId from currentUser. Transaction + Promise.all pattern confirmed correct for parallel UPDATE within transaction.
- `src/proxy.ts` — no DB queries. tenantId extracted from JWT claims only (not from URL/headers). Passed to downstream via response header x-tenant-id (not used for data access decisions). No data returned to user, no isolation risk.
- `e2e/helpers/pipeline-admin.ts` — service_role used correctly. Confirmed: zero imports from src/ application code (grepped). PostgREST queries filter by projectId/fileId (owned by test tenant). Intentional E2E test infra use of service_role per established pattern.

LOW finding: `revalidateTag('taxonomy', 'minutes')` at L77 passes two arguments. Next.js `revalidateTag()` accepts one string; second arg is silently ignored. Same pattern in createMapping, deleteMapping, updateMapping actions. Not a security issue — functional bug only (cache invalidation still fires on correct tag).

NOTE: `pipeline-admin.ts` was already audited in Story 3.2b5 — re-verified here, still PASS. No new queries added across the 3 CI fix commits.

### Taxonomy Feature Full Deep-Dive Audit (2026-03-03)

**Result: 0C/0H/0M/4L — SECURE (10 files).**

Files: `createMapping.action.ts`, `deleteMapping.action.ts`, `getTaxonomyMappings.action.ts`,
`updateMapping.action.ts`, `reorderMappings.action.ts`, `taxonomyCache.ts`,
`admin/taxonomy/page.tsx`, `TaxonomyManager.tsx`, `TaxonomyMappingTable.tsx`,
`AddMappingDialog.tsx`, `taxonomySeed.ts`.

Key confirmed patterns:

- Every action calls `requireRole('admin', 'write')` — M3 write path enforced on all mutations.
- `getTaxonomyMappings` uses `requireRole('admin', 'read')` — read path enforced.
- No action accepts `tenantId` from client — all audit logs use `currentUser.tenantId` from session.
- `taxonomyDefinitions` has NO `tenant_id` (confirmed in schema) — `withTenant()` correctly absent from ALL taxonomy queries. This is the documented exception per ERD 1.9.
- `admin/taxonomy/page.tsx`: auth guard via `getCurrentUser()` + role check before `getCachedTaxonomyMappings()`.
- `getCachedTaxonomyMappings()` is a flat shared cache — correct by design since data is global.
- No client component passes `tenantId` to server actions.

4 LOW findings — all pre-existing, no new issues:

- 3x `revalidateTag('taxonomy', 'minutes')` two-argument calls (functional no-op second arg) — createMapping, deleteMapping, updateMapping, reorderMappings. Already in MEMORY.md from CI Fix Commits audit.
- 1x `AddMappingDialog` missing `useEffect` reset on re-open (Guardrail #11 UX bug, zero security risk).

### Pipeline & Scoring Full Deep-Dive Audit (2026-03-03)

**Result: 0C/0H/0M/0L — SECURE (full pass, 23 files).**

Scope: `src/features/pipeline/helpers/` (runL1/L2/L3ForFile, crossFileConsistency, chunkSegments),
`src/features/pipeline/inngest/` (processFile, processBatch, batchComplete, recalculateScore),
`src/features/pipeline/actions/` (all 5 actions), `src/features/pipeline/engine/ruleEngine.ts`,
`src/features/scoring/helpers/scoreFile.ts`, `src/features/scoring/actions/calculateScore.action.ts`,
`src/features/scoring/autoPassChecker.ts`, `src/features/scoring/penaltyWeightLoader.ts`,
`src/lib/ai/budget.ts`, `src/lib/ai/costs.ts`, `src/lib/ai/providers.ts`,
`src/lib/cache/glossaryCache.ts`, `src/app/api/inngest/route.ts`.

Key invariants confirmed across all files:

- Tenant ID chain unbroken: `requireRole()` → `inngest.send(tenantId)` → `event.data.tenantId` → typed parameter → every DB query.
- withTenant() on every SELECT/UPDATE/DELETE on every tenant-scoped table.
- JOIN defense-in-depth: withTenant() applied to BOTH sides of every JOIN on tenant-scoped tables.
- Error paths (catch/rollback) also apply withTenant() — neither happy nor error path can mutate another tenant's records.
- Atomic DELETE+INSERT transactions: DELETE always scoped to `withTenant() + fileId + layer` — no over-broad delete.
- AI segment ID validation: AI-returned segmentIds validated against tenant-scoped segmentIdSet before INSERT. Prevents cross-tenant hallucinated IDs.
- `ruleEngine.ts` (processFile): pure in-memory function, zero DB calls, no isolation concern.
- `route.ts`: only registers Inngest functions, no DB access, no service_role.

### Parity + Dashboard + Project Feature Deep-Dive Audit (2026-03-03)

**Result: 0C/1H/1M/0L — AT RISK. 2 findings require fixes.**

Scope: `src/features/parity/actions/` (3 files), `src/features/dashboard/actions/` (8 files),
`src/features/project/actions/` (3 files). 14 source files total.

**HIGH finding:** `getDashboardData.action.ts` L60 — `scores` LEFT JOIN has NO `withTenant()` on
`scores.tenantId` in the JOIN condition. `scores` is tenant-scoped (has tenantId column). The
`files` driving table is correctly filtered in WHERE via `withTenant(files.tenantId)`, BUT the
`scores` JOIN condition only has `eq(scores.fileId, files.id)`. An attacker who manipulates
`scores.fileId` to collide with a cross-tenant file ID (theoretically, FK prevents this at DB
level, but app-level defense-in-depth requires the filter). Per Guardrail #14 / established
LEFT JOIN rule: withTenant() must appear on BOTH sides. Query must be:
`.leftJoin(scores, and(eq(scores.fileId, files.id), withTenant(scores.tenantId, tenantId)))`

**MEDIUM finding:** `compareWithXbench.action.ts` L66-69 — findings query has `withTenant()` on
`findings.tenantId` BUT does NOT filter by `fileId`. When a `fileId` is provided in the input,
the query fetches ALL findings for the project (across ALL files). The actual file-scoping is
delegated to `compareFindings()` in memory. This is not a data-leakage bug (no cross-tenant
data visible since tenantId filter is present) but it DOES violate Guardrail #14 asymmetric
filter rule and loads more data than necessary. Parallel query in `generateParityReport.action.ts`
L77-80 has the same issue. Recommend: `fileId ? and(withTenant(...), eq(findings.projectId, projectId), eq(findings.fileId, fileId)) : and(withTenant(...), eq(findings.projectId, projectId))`

PASS files:

- `compareWithXbench.action.ts` — tenantId from requireRole(); project ownership verified first
- `generateParityReport.action.ts` — same pattern; INSERT sets tenantId from session; audit logged
- `reportMissingCheck.action.ts` — project ownership verified; INSERT sets tenantId from session; audit logged
- `getNotifications.action.ts` — withTenant() + userId filter; PASS
- `markNotificationRead.action.ts` — withTenant() + userId filter on both branches; PASS
- `getAiUsageSummary.action.ts` — withTenant(); PASS
- `getAiUsageByProject.action.ts` — withTenant() on projects (WHERE) + aiUsageLogs (JOIN); PASS
- `getAiSpendByModel.action.ts` — withTenant(); PASS
- `getAiSpendTrend.action.ts` — withTenant(); PASS
- `exportAiUsage.action.ts` — withTenant() on aiUsageLogs (WHERE) + projects (JOIN); PASS
- `createProject.action.ts` — INSERT with tenantId from requireRole(); PASS
- `updateProject.action.ts` — withTenant() on SELECT + UPDATE; PASS
- `updateLanguagePairConfig.action.ts` — withTenant() on SELECT, UPDATE, INSERT; PASS

### Story 3.2b5 Audit Results (Upload-Pipeline Wiring — 2026-03-02)

**Result: 0C/0H/0M/0L — SECURE (full pass, 11 files).** See `patterns.md` § "Story 3.1" for detail.

### Story 3.2c Audit Results (L2 Results Display + Score Update — 2026-03-03)

**Result: 0C/0H/4M/3L — AT RISK (3 files).** See `patterns.md` § "Story 3.2c" for full detail.

Files: `getFileReviewData.action.ts`, `use-score-subscription.ts`, `use-findings-subscription.ts`.

Open findings requiring fixes:

- MEDIUM x4: Q4 LEFT JOIN uses cross-column `eq()` instead of `withTenant()` on joined table; both polling fallbacks (scores + findings) have no `.eq('tenant_id', tenantId)` defense-in-depth; scores + findings tables not added to `supabase_realtime` publication (channels are dead code).
- LOW x3: `(fileId, projectId)` pair not cross-validated in Q1; Realtime channel missing compound tenant filter; `mapRowToFinding()` does not validate `tenant_id` of returned rows.

New patterns discovered:

- Tables must be explicitly published via `ALTER PUBLICATION supabase_realtime ADD TABLE {t};`
- Polling fallback PostgREST queries MUST include `.eq('tenant_id', tenantId)` per project convention
- Canonical LEFT JOIN: enrichment table filter in JOIN condition = `withTenant(col, tenantId)` literal, NOT cross-column `eq(col, drivingTable.col)`

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
