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

### Story 2.1 Audit Results (Upload Infrastructure)

New tables confirmed tenant-scoped: `upload_batches` (has tenant_id, RLS in 00010_upload_batches_rls.sql)

**PASS:**

- `checkDuplicate.action.ts` — withTenant() on files (WHERE) + withTenant() on scores (leftJoin ON clause); PASS
- `createBatch.action.ts` — INSERT with tenantId from session + audit log; PASS
- `getUploadedFiles.action.ts` — withTenant() on files; PASS
- `route.ts` (upload) — files INSERT uses tenantId from session; admin client used ONLY for Storage (not DB); PASS
- `route.ts` — ✅ FIXED (verified 2026-02-25): projectId and batchId from FormData now verified via SELECT + withTenant() before use (lines 88-115)

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

**✅ RESOLVED (verified 2026-02-25):**

- Logic moved from `runRuleEngine.action.ts` to `runL1ForFile.ts` (Story 2.6 refactor). All 3 UPDATE statements (CAS, final l1_completed, rollback failed) now include `withTenant()`. Confirmed at lines 47, 142, 181 of `runL1ForFile.ts`.

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

### Story 2.6 Audit Results (Inngest Pipeline Foundation)

**PASS (all checks — FULL PASS across all three primary files and their full Inngest execution chain):**

- `startProcessing.action.ts` — requireRole() before any DB access; files SELECT uses withTenant() + eq(projectId) + inArray(fileIds); projects UPDATE uses withTenant(); tenantId sourced exclusively from requireRole() session (never from client input); pipeline event payload includes tenantId from session; audit log carries tenantId from session. FULL PASS.
- `runL1ForFile.ts` (helper, not server action) — tenantId received as function parameter from Inngest event payload (not from user input). CAS guard UPDATE uses withTenant(); segments SELECT uses withTenant() + eq(fileId); suppressionRules SELECT uses withTenant() + eq(isActive) + eq(projectId); getGlossaryTerms() uses withTenant() on glossaries JOIN (correct — glossaryTerms has no tenant_id); findings DELETE inside transaction uses withTenant(); findings INSERT batch: tenantId set explicitly in each value object; l1_completed UPDATE uses withTenant(); rollback UPDATE uses withTenant(). FULL PASS.
- `scoreFile.ts` (helper, not server action) — tenantId received as function parameter from Inngest event payload. segments SELECT uses withTenant() + eq(fileId) + eq(projectId); findings SELECT uses withTenant() + eq(fileId) + eq(projectId); scores SELECT inside transaction uses withTenant(); scores DELETE inside transaction uses withTenant(); scores INSERT: tenantId set explicitly in value object; createGraduationNotification() — notifications dedup SELECT uses withTenant(); userRoles SELECT uses withTenant(); notifications INSERT: tenantId set explicitly in value object. FULL PASS.
- `processBatch.ts` — no DB access; fan-out propagates tenantId from event.data through to each pipeline.process-file event payload. Tenant context never lost across steps. PASS.
- `processFile.ts` — no direct DB queries in handler; delegates to runL1ForFile() + scoreFile() with tenantId from event.data; onFailure handler UPDATE files uses withTenant(). concurrency key is event.data.projectId (correct — project-scoped queue). FULL PASS.

**Schema confirmations (Story 2.6):**

- `glossaryTerms` — confirmed NO tenant_id column; access via glossaryId FK to glossaries (which has tenant_id). INNER JOIN approach in getGlossaryTerms() is the correct and only safe pattern.
- `severityConfigs` — nullable tenant_id column confirmed. loadPenaltyWeights() exception (or(eq, isNull) instead of withTenant()) re-confirmed correct.

**Pattern noted — tenantId in Inngest helpers:**
Helper functions (runL1ForFile, scoreFile) receive tenantId as a typed function parameter. This is the correct pattern for Inngest runtime — there is no session to read from. The security boundary is the Server Action (startProcessing) which sources tenantId from requireRole() and injects it into the event payload. Inngest's event payload is server-controlled and cannot be tampered with by clients.

**Note — Inngest route handler now has functions registered:**
`processBatch` and `processFilePipeline` are active. Both correctly propagate tenant context. Update checklist: Inngest IS now in scope for future audits.

### Story 2.7 Audit Results (Batch Summary, File History, Parity Tools)

New tables confirmed tenant-scoped: `parity_reports`, `missing_check_reports` (both have tenant_id, notNull FK to tenants)

**PASS:**

- `getBatchSummary.action.ts` — withTenant() on projects SELECT; withTenant() on files (WHERE) AND scores (LEFT JOIN ON clause); gold standard LEFT JOIN pattern. FULL PASS.
- `getFileHistory.action.ts` — identical LEFT JOIN pattern; withTenant() on files (WHERE) + scores (LEFT JOIN ON). FULL PASS.
- `compareWithXbench.action.ts` — withTenant() on findings SELECT + eq(projectId). Read-only, no INSERT. PASS (with low-severity unverified projectId note — no data leak risk).
- `batchComplete.ts` — Inngest handler; tenantId from event.data; delegates entirely to crossFileConsistency(); no direct DB access. PASS.
- `batches/page.tsx` — withTenant() on uploadBatches + eq(projectId); requireRole() before DB access. PASS.
- `batches/[batchId]/page.tsx` — no direct DB access; delegates to getBatchSummary() Server Action. PASS.

**✅ ALL RESOLVED (verified 2026-02-25):**

- `crossFileConsistency.ts` — DELETE now scoped to `scope='cross-file' + detectedByLayer='L1' + inArray(fileIds)` (line 185-202)
- `reportMissingCheck.action.ts` — standalone withTenant() removed; proper project ownership SELECT with withTenant() added (line 47-55)
- `generateParityReport.action.ts` — project ownership SELECT with withTenant() added before INSERT (line 64-72)

**Schema confirmations (Story 2.7):**

- `parity_reports` — tenant_id (uuid, notNull, FK to tenants). Confirmed.
- `missing_check_reports` — tenant_id (uuid, notNull, FK to tenants). Confirmed.
- `upload_batches` — tenant_id (uuid, notNull, FK to tenants). Re-confirmed (Story 2.1).

## Key Patterns to Watch

- `glossary_terms` has NO tenant_id — always access via verified glossaryId from glossaries table
- `severity_configs` has nullable tenant_id (system defaults have NULL) — query must handle this
- `taxonomy_definitions` is global — never add tenant filter (it would be wrong)
- RSC pages that do inline Drizzle queries must use withTenant() — currently all do
- Inngest functions ARE NOW ACTIVE — `processBatch` + `processFilePipeline` + `batchComplete` all confirmed tenant-safe
- INSERT isolation pattern: no WHERE clause on INSERT — instead set `tenantId` field explicitly in value object. withTenant() only applies to SELECT/UPDATE/DELETE WHERE clauses.
- Inngest tenantId pattern: Server Action sources tenantId from requireRole() → injects into event payload → helper functions receive tenantId as typed parameter. This is the correct trust boundary for Inngest.
- ANTI-PATTERN: `withTenant(col, val)` called standalone (not passed to `.where()`) is dead code — the helper returns a SQL expression object; it must be composed into a query. Flag any standalone call as HIGH (misleading security comment risk). _Example fixed: reportMissingCheck.action.ts (2026-02-25)_
- ANTI-PATTERN: INSERT with unverified FK from client input — always add a prior SELECT with withTenant() to verify ownership of the referenced entity before writing. _Example fixed: reportMissingCheck + generateParityReport (2026-02-25)_
- ANTI-PATTERN for DELETE-then-reinsert idempotency: over-broad DELETE (project-level) wipes other layers' data. Always scope DELETE to the specific layer/scope being regenerated (e.g., `eq(findings.scope, 'cross-file')`).
