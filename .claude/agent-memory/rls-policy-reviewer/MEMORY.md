# RLS Policy Reviewer — Agent Memory

## JWT Claim Path (CRITICAL)

- All policies use top-level JWT claim: `((SELECT auth.jwt()) ->> 'tenant_id')::uuid`
- NOT `app_metadata` — the `custom_access_token_hook` injects `tenant_id` at root JWT level
- Subquery wrapper `(SELECT auth.jwt())` is intentional — per-query caching (94-99% faster)
- Source: `supabase/migrations/00001_rls_policies.sql` + `00003_custom_access_token_hook.sql`

## RLS Migration Files

- Main RLS policies: `supabase/migrations/00001_rls_policies.sql` (all tenant-scoped tables)
- Upload batches RLS: `supabase/migrations/00011_upload_batches_rls.sql`
- Severity configs fix: `supabase/migrations/00008_fix_severity_configs_rls.sql`
- Story 2.2 columns (no new RLS needed): `supabase/migrations/00013_story_2_2_segments_columns.sql`
- Story 5.2b scoped access: `supabase/migrations/00026_story_5_2b_rls_scoped_access.sql`
- Story 5.2c findings hardening: `supabase/migrations/00027_story_5_2c_findings_rls_hardening.sql`

## Tables — RLS Status

All tenant-scoped tables have RLS enabled via `00001_rls_policies.sql`.
CRUD coverage: SELECT/INSERT/UPDATE/DELETE policies on all main tables.

### Intentionally Global Tables (no tenant_id, read-only by authenticated)

- `taxonomy_definitions` — shared reference data, only service_role can write
- `severity_configs` (partially global) — SELECT open to all authenticated, writes tenant-scoped or NULL

### Special RLS Pattern: glossary_terms

- Previously: no direct `tenant_id` column, used EXISTS subquery via parent `glossaries` table
- Updated in `00024_glossary_terms_tenant_id.sql`: now has direct `tenant_id` column, standard pattern

## Story 5.1 Audit Findings (2026-03-27)

### CRITICAL: back_translation_cache — Supabase migration missing

- Drizzle migration `src/db/migrations/0015_brainy_junta.sql` creates table + enables RLS + creates policies
- But NO corresponding `supabase/migrations/00025_*.sql` exists for `back_translation_cache`
- For Supabase-hosted Postgres, RLS policies must be in `supabase/migrations/` — Drizzle migrations only apply via `npm run db:migrate` which connects directly to DB but does NOT go through Supabase migration tracking
- Risk: If Supabase Cloud is used as source of truth, table exists but policies may not be tracked

### CRITICAL: Wrong JWT pattern in Drizzle migration policies

- `0015_brainy_junta.sql` lines 26-28 use `current_setting('app.current_tenant_id', true)` — NOT the project standard
- Project standard: `((SELECT auth.jwt()) ->> 'tenant_id')::uuid` (confirmed across all 24 Supabase migrations)
- `app.current_tenant_id` is NEVER set by application code — searching `src/` found zero `set_config` or `current_setting` calls
- This means ALL three policies (SELECT, INSERT, UPDATE) will evaluate to NULL, and `NULL::uuid` comparison fails = policies block all access for authenticated users
- No DELETE policy created at all

### Missing: DELETE policy for back_translation_cache

- `0015_brainy_junta.sql` creates SELECT, INSERT, UPDATE — but no DELETE policy
- `invalidateBTCacheForGlossary()` and `deleteExpiredBTCache()` in btCache.ts use `db.delete()` which needs a DELETE policy

## Policy Naming Convention

- Standard: `"Tenant isolation: SELECT"`, `"Tenant isolation: INSERT"`, etc.
- Exceptions: `"Read: all authenticated"`, `"Write: tenant-scoped"` (severity_configs)

## Key Principle: Adding Columns Does NOT Require New RLS Policies

- RLS operates at row level — existing policies automatically cover all columns in the row
- When Story 2.2 added 4 columns to `segments`, NO policy changes were needed
- Only need new RLS if: new TABLE added, or table previously had no RLS

## tenant_id Schema Pattern

- Always `uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' })`
- NOT NULL constraint at DB level prevents NULL bypass even if policy has a bug

## Drizzle Schema Files

- One file per table in `src/db/schema/`
- camelCase in TS (tenantId) maps to snake_case in DB (tenant_id)

## Story 5.2b Audit Findings — RESOLVED (2026-03-28, re-verified same date)

### RESOLVED: review_actions — all 4 operations properly covered in 00026

- 00026 drops SELECT+UPDATE+DELETE (lines 152-154) then INSERT (line 179) — all 4 from 00001 dropped
- New policies: select_admin_qa + select_native, insert_admin_qa + insert_native, update_admin_qa, delete_admin
- NO native UPDATE — intentional (review_actions is append-only audit trail for native reviewer)
- Note: no comment in migration explaining why native has no UPDATE — add comment for future auditors

### RESOLVED: segments — all 4 operations properly scoped in 00026

- 00026 drops ALL 4 policies from 00001 (SELECT+INSERT+UPDATE+DELETE) at lines 89-92
- New policies: select_admin_qa + select_native (scoped via finding→assignment JOIN), insert_admin_qa, update_admin_qa, delete_admin
- Native reviewer: SELECT scoped only, NO insert/update/delete (design enforced, not just documented)

### New Tables from Story 5.2b (VERIFIED)

- `finding_assignments` — RLS enabled in 00026 Section 0, full CRUD: admin_qa+native SELECT, admin_qa INSERT, admin_qa+native UPDATE (native WITH CHECK prevents reassignment), admin-only DELETE
- `finding_comments` — RLS enabled in 00026 Section 0, SELECT/INSERT/DELETE only, intentionally NO UPDATE (immutable audit trail per RLS design N3). comment in findingComments.ts line 8-9.

### Open Items (LOW priority) from 5.2b audit

- naming inconsistency: `finding_assignments_insert` + `finding_assignments_delete` missing role suffix (vs `_admin_qa` / `_admin` pattern used on other policies)
- missing test: qa_reviewer DELETE denied on finding_assignments
- missing test: native_reviewer segments INSERT/UPDATE/DELETE denied

### RBAC Pattern for Role-Scoped Migrations (confirmed from 5.2b)

- Must DROP ALL 4 operations on a table when replacing, not just SELECT
- 00026 correctly drops all 4 on segments, review_actions, findings SELECT+UPDATE
- findings INSERT+DELETE kept as tenant-only from 00001 (intentional — pipeline uses service_role for INSERT)

### JWT Claims for Role-Based Policies

- `user_role` claim: `((SELECT auth.jwt()) ->> 'user_role')` — returns 'admin' | 'qa_reviewer' | 'native_reviewer'
- `user_id` (sub) claim: `((SELECT auth.jwt()) ->> 'sub')::uuid` — used for owner-scoped policies
- EXISTS subquery MUST include tenant_id to prevent cross-tenant bypass via shared IDs
- finding_comments uses double-binding: `fa.id = finding_comments.finding_assignment_id AND fa.finding_id = finding_comments.finding_id` — prevents mismatched insert attack

## Story 5.2c Audit Findings (2026-03-29)

### VERIFIED: 00027 is correctly structured and atomic

- BEGIN/COMMIT wraps both DROP+CREATE (Guardrail #63 compliant)
- Section 1: DROP "Tenant isolation: INSERT" → CREATE "findings_insert_admin_qa" (admin+qa_reviewer only)
- Section 2: DROP "Tenant isolation: DELETE" → CREATE "findings_delete_admin" (admin only)
- JWT pattern: `((SELECT auth.jwt()) ->> 'tenant_id')::uuid` and `((SELECT auth.jwt()) ->> 'user_role')` — CORRECT

### VERIFIED: 00026 SELECT/UPDATE policies NOT regressed by 00027

- 00026 dropped "Tenant isolation: SELECT" + "Tenant isolation: UPDATE" → replaced with role-scoped variants
- 00027 drops "Tenant isolation: INSERT" + "Tenant isolation: DELETE" — these still existed in 00001 after 00026 ran
- No double-drop risk: the two migrations touch disjoint policy names

### findings table — complete policy set after 00026+00027

- SELECT: findings_select_admin_qa + findings_select_native (from 00026)
- INSERT: findings_insert_admin_qa (from 00027) — replaces tenant-only "Tenant isolation: INSERT"
- UPDATE: findings_update_admin_qa + findings_update_native (from 00026)
- DELETE: findings_delete_admin (from 00027) — replaces tenant-only "Tenant isolation: DELETE"
- Pipeline INSERT via service_role bypasses RLS — unaffected by 00027

### LOW: file_assignments — tenant-only policies (no role scoping)

- `file_assignments` table has tenant_id, full CRUD policies in 00001 — but all 4 are tenant-only (no role check)
- A native_reviewer CAN insert/update/delete file_assignments via RLS — only app-level Server Action guards prevent this
- Intentional or oversight? No Supabase migration from 5.2b/5.2c has addressed this
- Risk level: LOW because file_assignments is admin/QA workflow; native_reviewer is not expected to touch this table; app guards exist

### LOW: findings.rls.test.ts not updated for 00027

- `findings.rls.test.ts` only tests cross-tenant isolation (Tenant B cannot read/insert Tenant A findings)
- No test for: native_reviewer cannot INSERT findings, qa_reviewer CAN INSERT, admin-only DELETE
- These are new behaviors introduced by 00027 — tests lag behind policy changes

## Links to Detail Files

- See `patterns.md` for architecture patterns (general project)
