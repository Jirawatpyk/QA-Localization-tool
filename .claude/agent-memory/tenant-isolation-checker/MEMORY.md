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

1. MEDIUM — `useNotifications.ts` Realtime channel: filter is `user_id=eq.${userId}` only, no tenant_id filter in Supabase channel subscription. Relies entirely on RLS.
2. LOW — `createTerm.action.ts` L57-65: duplicate-check query on `glossary_terms` filters by `glossaryId` only (no explicit tenant guard). Safe because `glossaryId` was verified via withTenant() in the same request, but pattern is inconsistent.
3. LOW — `updateTerm.action.ts` L79-93: same pattern — dup check on `glossaryTerms` by `glossaryId` only. Same risk level as above.

### Story 2.1 Audit Results (Upload Infrastructure)

New tables confirmed tenant-scoped: `upload_batches` (has tenant_id, RLS in 00010_upload_batches_rls.sql)

**PASS:**

- `checkDuplicate.action.ts` — withTenant() on files (WHERE) + withTenant() on scores (leftJoin ON clause); PASS
- `createBatch.action.ts` — INSERT with tenantId from session + audit log; PASS
- `getUploadedFiles.action.ts` — withTenant() on files; PASS
- `route.ts` (upload) — files INSERT uses tenantId from session; admin client used ONLY for Storage (not DB); PASS

**HIGH FINDING (unresolved):**

- `route.ts` L49+L135 — `batchId` taken from FormData (user-controlled), written to files.batch_id without verifying the batch belongs to currentUser.tenantId. RLS on upload_batches only blocks direct writes, NOT FK references from another table's INSERT. This is a cross-tenant batchId injection risk. Fix: SELECT upload_batches with withTenant() to verify ownership before use.
- `route.ts` L52+L126 — `projectId` from FormData written to files.project_id without ownership check. Same pattern — no SELECT with withTenant() on projects table before INSERT. RLS on files INSERT only checks tenant_id on the new row, not that the projectId belongs to that tenant. Fix: verify projectId via withTenant() SELECT on projects before proceeding.

### Story 2.2 Audit Results (SDLXLIFF/XLIFF Parser)

**PASS (all checks):**

- `parseFile.action.ts` — SELECT files uses withTenant(); UPDATE 'parsing' uses withTenant(); UPDATE 'parsed' uses withTenant(); markFileFailed() UPDATE uses withTenant(); batchInsertSegments() sets tenantId explicitly from session; defense-in-depth cross-tenant check (file.tenantId !== currentUser.tenantId) present; all 3 audit log writes carry tenantId from session. FULL PASS.
- `sdlxliffParser.ts` — pure XML parser, zero DB access, zero Supabase calls confirmed. No tenant isolation concerns.

**Confirmed schema facts:**

- `segments` table has `tenant_id` column (uuid, notNull, FK to tenants). INSERT-level isolation enforced.
- `files` table has `tenant_id` column confirmed. All UPDATE WHERE clauses use withTenant(files.tenantId, ...).

**Pattern noted:** `batchInsertSegments()` does NOT use withTenant() helper on the INSERT (INSERT has no WHERE clause by design), but sets `tenantId` field explicitly in each row value object — this is the correct and only way to enforce tenant isolation on INSERTs. Consistent with createProject, createBatch patterns.

### Story 2.3 Audit Results (Excel Bilingual Parser)

**PASS (all checks):**

- `previewExcelColumns.action.ts` — requireRole('qa_reviewer', 'write') before any DB access; SELECT files uses and(eq(files.id, fileId), withTenant(files.tenantId, currentUser.tenantId)); Storage download uses file.storagePath from the verified DB row (NOT from client input); excelParser.ts is zero-DB pure computation. FULL PASS.
- `parseFile.action.ts` (Excel branch) — SELECT projects uses and(eq(projects.id, file.projectId), withTenant(projects.tenantId, currentUser.tenantId)); file.projectId sourced from verified file row (not client); all markFileFailed() calls pass tenantId from session; batchInsertSegments() unchanged from Story 2.2 — tenantId set explicitly in value object. FULL PASS.

**Key observation:** Both actions derive the Storage path (file.storagePath) and the project FK (file.projectId) from the tenant-verified DB row, never from user input. This is the correct defense-in-depth pattern for Storage downloads and FK chaining.

**Schema confirmations (Story 2.3):**

- `projects` table — `tenant_id` column confirmed (uuid, notNull, FK to tenants). withTenant() on projects SELECT is correct.
- `excelParser.ts` — zero DB access, zero Supabase calls confirmed via grep. No tenant isolation concerns.

### Story 2.4 Audit Results (L1 Rule Engine)

**CRITICAL FINDING (unresolved):**

- `runRuleEngine.action.ts` L166-169 — final status UPDATE to `l1_completed` uses `eq(files.id, input.fileId)` with NO `withTenant()`. An attacker who knows another tenant's fileId (via GUID enumeration) can transition that file's status. Must add `withTenant(files.tenantId, currentUser.tenantId)` to the WHERE clause. Severity: CRITICAL.

**HIGH FINDING (unresolved):**

- `runRuleEngine.action.ts` L183-186 — rollback UPDATE to `failed` (inside catch block) uses `eq(files.id, input.fileId)` with NO `withTenant()`. Same cross-tenant status-tampering risk. Must add `withTenant(files.tenantId, currentUser.tenantId)`. Severity: HIGH (exploitable only when an exception occurs, but the fix is still mandatory).

**PASS:**

- CAS guard UPDATE (L54-64) — withTenant() correctly present alongside eq(files.id) and eq(files.status). Atomically scoped to tenant + fileId + status guard.
- segments SELECT (L76-85) — withTenant() + eq(segments.fileId). Both dimensions present.
- suppressionRules SELECT (L91-100) — withTenant() + eq(isActive) + eq(projectId). Three-way filter correct. projectId sourced from verified `file` object (not user input).
- findings INSERT batch (L136-141) — tenantId set explicitly from currentUser.tenantId in each row value object. Correct INSERT pattern.
- Audit log write (L150-163) — tenantId from currentUser.tenantId. PASS.
- glossaryCache.ts (getCachedGlossaryTerms) — withTenant() on glossaries SELECT; glossary_terms accessed via inArray(glossaryIds) (safe, IDs came from tenant-scoped query). Pre-existing PASS confirmed again.

**Schema confirmations (Story 2.4):**

- `findings` table — tenant_id column (uuid, notNull, FK to tenants). Confirmed.
- `suppression_rules` — tenant_id column (uuid, notNull, FK to tenants). Confirmed.

### Story 2.5 Audit Results (MQM Score Calculation)

**PASS (all checks):**

- `autoPassChecker.ts` — languagePairConfigs SELECT: withTenant() present; scores+segments JOIN: withTenant() on BOTH sides (L57+L58, defense-in-depth confirmed); projects SELECT (fallback branch): withTenant() present. FULL PASS.
- `calculateScore.action.ts` — segments SELECT: withTenant() present; findings SELECT: withTenant() present; scores SELECT inside transaction: withTenant() present; scores DELETE inside transaction: withTenant() present; scores INSERT: tenantId set explicitly from session in value object (correct INSERT pattern); notifications SELECT (dedup guard): withTenant() present; userRoles SELECT (admin list): withTenant() present; notifications INSERT: tenantId from session in value object. FULL PASS.
- `penaltyWeightLoader.ts` — severity_configs SELECT uses `or(eq(tenantId), isNull(tenantId))` which is the correct and intentional pattern for this table (nullable tenant_id = system defaults). withTenant() helper is intentionally NOT used here because the query must include NULL rows. The application-level resolution (L42-56) correctly prioritizes tenant rows over system rows. PASS (by design, documented in code comment).

**Schema confirmations (Story 2.5):**

- `scores` table — tenant_id column (uuid, notNull, FK to tenants). Confirmed.
- `notifications` table — tenant_id column (uuid, notNull, FK to tenants). Confirmed.
- `severity_configs` — nullable tenant_id (null = system default). Intentional design; withTenant() would be wrong here.
- `languagePairConfigs`, `segments`, `findings`, `userRoles` — all previously confirmed as tenant-scoped.

**Pattern noted — severity_configs fallback query:**
`loadPenaltyWeights()` intentionally omits withTenant() in favor of `or(eq(tenantId), isNull(tenantId))` because system default rows have tenant_id IS NULL. This is the documented exception. It does NOT leak cross-tenant data because the query only returns rows for the calling tenant OR NULL-tenant rows, and the resolution logic at L42 always prefers tenant-specific rows first.

**Pattern noted — inner JOIN defense-in-depth (autoPassChecker.ts L51-59):**
The scores+segments JOIN applies withTenant() to BOTH tables in the same AND clause. This is the gold standard pattern for multi-table queries. Record as a positive example for future code reviews.

## Key Patterns to Watch

- `glossary_terms` has NO tenant_id — always access via verified glossaryId from glossaries table
- `severity_configs` has nullable tenant_id (system defaults have NULL) — query must handle this
- `taxonomy_definitions` is global — never add tenant filter (it would be wrong)
- RSC pages that do inline Drizzle queries must use withTenant() — currently all do
- Inngest route handler has NO functions registered yet — no Inngest tenant isolation to audit
- INSERT isolation pattern: no WHERE clause on INSERT — instead set `tenantId` field explicitly in value object. withTenant() only applies to SELECT/UPDATE/DELETE WHERE clauses.
