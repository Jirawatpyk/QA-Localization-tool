# Story 5.2b: Schema + RLS Scoped Access

Status: done

## Story

As a PM,
I want the database schema and RLS policies for finding-level assignment and native reviewer scoped access,
So that Story 5.2c can build the native reviewer workflow on a secure, tenant-isolated, role-scoped foundation.

## Acceptance Criteria

### AC1: `finding_assignments` Table Schema
**Given** the dev agent runs the Drizzle migration
**When** the `finding_assignments` table is created
**Then** it has columns: `id` (uuid PK), `findingId` (FK CASCADE → findings), `fileId` (FK CASCADE → files, denormalized), `projectId` (FK CASCADE → projects), `tenantId` (FK RESTRICT → tenants), `assignedTo` (FK RESTRICT → users), `assignedBy` (FK RESTRICT → users), `status` (varchar(20) NOT NULL DEFAULT 'pending'), `flaggerComment` (text nullable), `createdAt`, `updatedAt`
**And** UNIQUE constraint on `(findingId, assignedTo)` — one assignment per finding per reviewer
**And** RLS enabled in the Supabase migration atomically with policies (Guardrail #71, pattern from 00025)

### AC2: `finding_comments` Table Schema
**Given** the dev agent runs the Drizzle migration
**When** the `finding_comments` table is created
**Then** it has columns: `id` (uuid PK), `findingId` (FK CASCADE → findings), `findingAssignmentId` (FK CASCADE → finding_assignments), `tenantId` (FK RESTRICT → tenants), `authorId` (FK RESTRICT → users), `body` (text NOT NULL), `createdAt`
**And** no `updatedAt` column (comments are immutable for audit — RLS design doc N3)
**And** RLS enabled in the Supabase migration atomically with policies (Guardrail #71, pattern from 00025)

### AC3: `AssignmentStatus` Union Type
**Given** the TypeScript types are defined
**When** `AssignmentStatus` is used in code
**Then** it is `'pending' | 'in_review' | 'confirmed' | 'overridden'` (Guardrail #72)
**And** exported from `src/types/assignment.ts` alongside `ASSIGNMENT_STATUSES` const array (same pattern as `FindingStatus` in `src/types/finding.ts`)
**And** DB column has CHECK constraint in the migration

### AC4: Performance Indexes
**Given** the migration creates indexes
**When** native reviewer RLS policies execute EXISTS subqueries
**Then** the following indexes exist (Guardrail #65):
- `idx_finding_assignments_finding_user` on `(findingId, assignedTo)` — for RLS EXISTS on findings/review_actions
- `idx_finding_assignments_user_tenant` on `(assignedTo, tenantId)` — for "my assignments" listing
- `idx_finding_comments_assignment` on `(findingAssignmentId)` — for comment lookup by assignment
- `idx_finding_comments_finding` on `(findingId)` — for finding history view
- **NOTE:** `idx_findings_segment` on `findings(segment_id)` ALREADY EXISTS (migration 00005) — no new index needed for G3. Verify with `\di idx_findings_segment` in psql

### AC5: Role-Scoped RLS Policies on Existing Tables
**Given** the Supabase migration replaces tenant-only policies
**When** the new role-scoped policies are applied atomically (Guardrail #63: BEGIN/COMMIT transaction)
**Then** on `findings` SELECT: admin+qa_reviewer = full tenant access, native_reviewer = EXISTS on finding_assignments (Guardrail #62)
**And** on `findings` UPDATE: admin+qa_reviewer = full tenant access, native_reviewer = EXISTS on finding_assignments (MUST include — design doc S3.2 `findings_update_native`, required for Story 5.2c confirm/override)
**And** on `segments` SELECT: admin+qa_reviewer = full tenant access, native_reviewer = EXISTS via findings→finding_assignments JOIN
**And** on `review_actions` SELECT: admin+qa_reviewer = full tenant access, native_reviewer = EXISTS on finding_assignments
**And** on `review_actions` INSERT: keep existing tenant policy for admin+qa, ADD separate `review_actions_insert_native` policy with EXISTS check on finding_assignments (RLS design gap G1)
**And** existing INSERT/DELETE policies for admin+qa_reviewer are preserved (no regression)
**And** pipeline operations (service_role) are unaffected

### AC6: RLS Policies on New Tables
**Given** the Supabase migration creates RLS policies for new tables
**When** `finding_assignments` policies are applied
**Then** SELECT: admin+qa = tenant-scoped, native = own assignments only (`assigned_to = jwt.sub`)
**And** INSERT: admin+qa only (they create assignments)
**And** UPDATE: admin+qa = tenant-scoped, native = own assignments only (WITH CHECK must include `assigned_to = jwt.sub` — prevents self-reassignment)
**And** DELETE: admin only
**When** `finding_comments` policies are applied
**Then** SELECT: admin+qa = tenant-scoped, native = only on their assignments (EXISTS on finding_assignments with `tenant_id` — RLS design gap G2 fix)
**And** INSERT: admin+qa = tenant + author_id check, native = assignment ownership + author_id check
**And** UPDATE: none (comments immutable — AC2)
**And** DELETE: admin only

### AC7: RLS Integration Tests
**Given** the RLS tests verify every role × operation combination (Guardrail #76)
**When** the test suite runs against Supabase
**Then** test matrix covers:
- Native reviewer SELECT findings — not assigned → 0 rows
- Native reviewer SELECT findings — assigned → only assigned rows
- Native reviewer UPDATE assigned finding → success
- Native reviewer UPDATE non-assigned finding → 0 rows affected
- Native reviewer SELECT segments — only via assigned findings
- Native reviewer INSERT finding_assignment → denied
- Native reviewer INSERT finding_comment on assigned → success
- Native reviewer INSERT finding_comment on unassigned → denied
- QA reviewer SELECT findings → all tenant findings (no regression)
- Admin SELECT findings → all tenant findings (no regression)
- Cross-tenant native reviewer → 0 rows (tenant isolation maintained)
- Native reviewer INSERT review_action on assigned finding → success (G1 fix)
- Native reviewer DELETE finding_comment → denied (admin-only)
- Native reviewer UPDATE finding_assignments to reassign → denied by WITH CHECK (assigned_to = jwt.sub)

### AC8: Drizzle Relations & Schema Export
**Given** the schema files are created
**When** the schema is exported
**Then** `findingAssignments` and `findingComments` are exported from `src/db/schema/index.ts`
**And** relations are defined in `src/db/schema/relations.ts`:
- findings → hasMany findingAssignments, hasMany findingComments
- findingAssignments → belongsTo finding, file, project, tenant, assignedTo (user), assignedBy (user); hasMany findingComments
- findingComments → belongsTo finding, findingAssignment, tenant, author (user)
- users → hasMany findingAssignments (as assignedTo), hasMany findingAssignments (as assignedBy), hasMany findingComments

## Complexity Assessment

**AC count: 8** (at limit)

**Cross-AC interaction matrix:**

| AC | Interacts with | Count |
|----|---------------|-------|
| AC1 (finding_assignments schema) | AC3 (status type), AC4 (indexes), AC6 (RLS), AC8 (relations) | 4 |
| AC2 (finding_comments schema) | AC4 (indexes), AC6 (RLS), AC8 (relations) | 3 |
| AC3 (AssignmentStatus type) | AC1 (schema column) | 1 |
| AC4 (indexes) | AC1, AC2 (tables), AC5 (RLS perf) | 3 |
| AC5 (RLS existing tables) | AC1 (EXISTS subquery target) | 1 |
| AC6 (RLS new tables) | AC1, AC2 (table definitions) | 2 |
| AC7 (RLS tests) | AC5, AC6 (policies to test) | 2 |
| AC8 (relations/exports) | AC1, AC2 (schema files) | 2 |

**Max cross-AC interactions: 4** (AC1). Exceeds limit of 3 but this is a schema-only story with no UI or Server Action logic — all interactions are structural, not behavioral. No split needed.

## Tasks / Subtasks

### Task 1: Create `AssignmentStatus` Type (AC: #3)
- [x] 1.1 Create `src/types/assignment.ts`:
  ```typescript
  export const ASSIGNMENT_STATUSES = ['pending', 'in_review', 'confirmed', 'overridden'] as const
  export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number]
  ```
  Follow exact pattern from `src/types/finding.ts` (const array + derived type)

### Task 2: Create `finding_assignments` Drizzle Schema (AC: #1)
- [x] 2.1 Create `src/db/schema/findingAssignments.ts`:
  - Columns per AC1 (see RLS design doc S2.1 for exact schema)
  - `status: varchar('status', { length: 20 }).notNull().default('pending')` — runtime validated against `ASSIGNMENT_STATUSES`
  - UNIQUE constraint: `unique('uq_finding_assignments_finding_user').on(table.findingId, table.assignedTo)`
  - FK references: `findings.id` CASCADE, `files.id` CASCADE, `projects.id` CASCADE, `tenants.id` RESTRICT, `users.id` RESTRICT (both assignedTo + assignedBy)
- [x] 2.2 Verify `fileAssignments.ts` pattern (existing file-level assignments) — follow same structure for consistency

### Task 3: Create `finding_comments` Drizzle Schema (AC: #2)
- [x] 3.1 Create `src/db/schema/findingComments.ts`:
  - Columns per AC2 — NO `updatedAt` (immutable comments)
  - FK references: `findings.id` CASCADE, `findingAssignments.id` CASCADE, `tenants.id` RESTRICT, `users.id` RESTRICT

### Task 4: Add Relations (AC: #8)
- [x] 4.1 In `src/db/schema/relations.ts`:
  - Add imports for `findingAssignments` and `findingComments`
  - Add `findingAssignmentsRelations`: belongs to finding, file, project, tenant; has many findingComments. **CRITICAL: 2 FKs to users require `relationName`:**
    ```typescript
    assignedToUser: one(users, { fields: [findingAssignments.assignedTo], references: [users.id], relationName: 'assignedTo' }),
    assignedByUser: one(users, { fields: [findingAssignments.assignedBy], references: [users.id], relationName: 'assignedBy' }),
    ```
    (Same pattern as existing `fileAssignmentsRelations` at relations.ts:276-284 — verified)
  - Add `findingCommentsRelations`: belongs to finding, findingAssignment, tenant, authorUser
  - Update `findingsRelations`: add `findingAssignments: many(findingAssignments)` and `findingComments: many(findingComments)`
  - Update `usersRelations`: add `assignedFindings: many(findingAssignments, { relationName: 'assignedTo' })`, `createdAssignments: many(findingAssignments, { relationName: 'assignedBy' })`, `findingComments: many(findingComments)`
  - Update `filesRelations`: add `findingAssignments: many(findingAssignments)`
  - Update `projectsRelations`: add `findingAssignments: many(findingAssignments)`
  - Update `tenantsRelations`: add `findingAssignments: many(findingAssignments)`, `findingComments: many(findingComments)`
- [x] 4.2 In `src/db/schema/index.ts`:
  - Add `export { findingAssignments } from './findingAssignments'`
  - Add `export { findingComments } from './findingComments'`
  - Add `findingAssignmentsRelations` and `findingCommentsRelations` to relations export block
  - Update comment "// 27 tables + relations" → "// 33 tables + relations" (actual count: 31 existing + 2 new = 33)

### Task 5: Fix Orphan Migration TD-DB-006 (Quick Fix)
- [x] 5.1 Delete orphan file `src/db/migrations/0014_typical_gauntlet.sql` — never registered in `_journal.json`, never run. The UNIQUE constraint it declares (`uq_scores_file_tenant`) is already in the Drizzle schema/snapshot but was never applied to DB
- [x] 5.2 Add to the Supabase migration (Task 7, Section 8): `ALTER TABLE scores ADD CONSTRAINT IF NOT EXISTS uq_scores_file_tenant UNIQUE(file_id, tenant_id);` — applies the missing constraint to production DB

### Task 6: Generate Drizzle Migration (AC: #1, #2, #4)
- [x] 6.1 Run `npm run db:generate` — creates migration SQL for both new tables
- [x] 6.2 Verify generated migration has `finding_assignments` CREATE TABLE BEFORE `finding_comments` (FK dependency: `finding_comments.finding_assignment_id` → `finding_assignments.id`)
- [x] 6.3 Manually add to the generated migration SQL (Drizzle doesn't auto-generate these):
  - CHECK constraint on `finding_assignments.status`: `ALTER TABLE finding_assignments ADD CONSTRAINT chk_finding_assignments_status CHECK (status IN ('pending', 'in_review', 'confirmed', 'overridden'));`
  - **NOTE:** Do NOT add `ENABLE ROW LEVEL SECURITY` here — it goes in the Supabase migration (Task 7) atomically with policies (pattern from 00025). Table without policies + RLS enabled = all queries return 0 rows
  - **NOTE:** `idx_findings_segment` on `findings(segment_id)` already exists (migration 00005) — do NOT recreate
- [x] 6.4 Run `npm run db:migrate` to apply

### Task 7: Create Supabase RLS Migration (AC: #5, #6, TD-DB-006)
- [x] 7.1 Create `supabase/migrations/00026_story_5_2b_rls_scoped_access.sql`:
  - Wrap in `BEGIN; ... COMMIT;` (Guardrail #63 — atomic DROP+CREATE)
  - **Section 0: ENABLE RLS on new tables** — `ALTER TABLE finding_assignments ENABLE ROW LEVEL SECURITY; ALTER TABLE finding_comments ENABLE ROW LEVEL SECURITY;` (MUST be inside BEGIN block, before policies — pattern from 00025)
  - **Section 1: findings** — `DROP POLICY IF EXISTS "Tenant isolation: SELECT" ON findings;` + `DROP POLICY IF EXISTS "Tenant isolation: UPDATE" ON findings;` → CREATE `findings_select_admin_qa`, `findings_select_native`, `findings_update_admin_qa`, `findings_update_native` (design doc S3.2 — ALL 4 policies)
  - **Section 2: segments** — `DROP POLICY IF EXISTS "Tenant isolation: SELECT" ON segments;` → CREATE `segments_select_admin_qa`, `segments_select_native`
  - **Section 3: review_actions** — `DROP POLICY IF EXISTS "Tenant isolation: SELECT" ON review_actions;` → CREATE `review_actions_select_admin_qa`, `review_actions_select_native` + ADD (not replace) `review_actions_insert_native` (G1 fix — existing INSERT policy kept for admin+qa)
  - **Section 4: finding_assignments** — CREATE all role-scoped policies (SELECT ×2, INSERT, UPDATE ×2, DELETE per AC6)
  - **Section 5: finding_comments** — CREATE all role-scoped policies (SELECT ×2, INSERT ×2, DELETE — NO UPDATE policy, comments immutable)
  - **Section 6: performance indexes** — 4 indexes from AC4 (finding_assignments × 2, finding_comments × 2). Use `CREATE INDEX IF NOT EXISTS` for idempotency
  - **Section 7: Realtime** — `ALTER PUBLICATION supabase_realtime ADD TABLE finding_assignments;` (design doc S7.1 — required for live status updates in Story 5.2c)
  - **Section 8: TD-DB-006 fix** — `ALTER TABLE scores ADD CONSTRAINT IF NOT EXISTS uq_scores_file_tenant UNIQUE(file_id, tenant_id);` (orphan migration never applied — Task 5)
  - Keep all existing INSERT/DELETE policies that are NOT being replaced (verify each table)
  - **Policy names use double quotes in SQL** (case-sensitive, whitespace-sensitive)
- [x] 7.2 Use exact SQL from RLS design doc sections 3.2–3.6 with the following fixes:
  - G1 fix: Add `review_actions_insert_native` policy (missing from original design)
  - G2 fix: Add `fa.tenant_id` check in `finding_comments_select_native` EXISTS subquery
  - G3: NO action needed — `idx_findings_segment` already exists (migration 00005)

### Task 8: RLS Integration Tests (AC: #7)
- [x] 8.1 Create `src/db/__tests__/rls/finding-assignments-rls.test.ts`:
  - Test finding_assignments table policies:
    - Admin: full CRUD within tenant
    - QA Reviewer: SELECT + INSERT within tenant, no DELETE
    - Native Reviewer: SELECT only own assignments, UPDATE own assignments, INSERT denied, DELETE denied
    - Cross-tenant: 0 rows
- [x] 8.2 Create `src/db/__tests__/rls/native-reviewer-scoped-access-rls.test.ts`:
  - Test scoped access on existing tables:
    - Native reviewer SELECT findings: 0 rows when not assigned, only assigned when has assignments
    - Native reviewer UPDATE assigned finding: success
    - Native reviewer UPDATE non-assigned finding: 0 rows
    - Native reviewer SELECT segments: only segments linked to assigned findings
    - Native reviewer INSERT review_action on assigned finding: success
    - Native reviewer INSERT review_action on non-assigned finding: denied
    - QA reviewer SELECT findings: all tenant findings (regression check)
    - Admin SELECT findings: all tenant findings (regression check)
  - Test finding_comments scoped access:
    - Native reviewer INSERT comment on own assignment: success
    - Native reviewer INSERT comment on others' assignment: denied
    - Native reviewer SELECT comments: only on own assignments
- [x] 8.3 Follow existing RLS test patterns from `src/db/__tests__/rls/` — use Supabase test helpers, set JWT claims for each role
- [x] 8.4 Run: `npm run test:rls` (requires `npx supabase start`)

### Task 9: Verify & Validate (All ACs + TD-DB-006)
- [x] 9.1 Run `npm run type-check` — zero errors
- [x] 9.2 Run `npm run lint` — zero errors
- [x] 9.3 Run `npm run test:unit` — all existing tests pass (no regression)
- [x] 9.4 Run `npm run test:rls` — all RLS tests pass including new ones
- [x] 9.5 Verify migration is idempotent: running `db:migrate` again has no effect
- [x] 9.6 Verify `0014_typical_gauntlet.sql` is deleted and `uq_scores_file_tenant` constraint exists in DB (TD-DB-006)

## Dev Notes

### Architecture Patterns & Constraints

**Schema pattern:** Follow `fileAssignments.ts` exactly — same FK pattern, same naming convention, same timestamp columns. The `finding_assignments` table mirrors `file_assignments` structure but adds `flaggerComment` and uses a different status enum.

**RLS atomic migration (Guardrail #63):** The most critical aspect of this story. The Supabase migration MUST wrap all DROP+CREATE in a single transaction. Between DROP and CREATE, all SELECT queries return 0 rows. Test: run migration against local Supabase and verify no query errors during migration.

**Drizzle migration vs Supabase migration:** Drizzle generates the schema (CREATE TABLE). Supabase migrations handle RLS policies (which Drizzle doesn't manage). This story needs BOTH:
1. Drizzle migration → `src/db/migrations/` auto-numbered (schema + CHECK constraint only — NO `ENABLE RLS` here)
2. Supabase migration → `supabase/migrations/00026_*.sql` (ENABLE RLS + policies + indexes + Realtime — all in single BEGIN/COMMIT transaction)

**Comments immutable (RLS design N3):** `finding_comments` has NO `updatedAt` column and NO UPDATE RLS policy. If comment editing is needed later, add both in a future story. Current design: immutable for audit trail integrity.

**Index on findings.segmentId (G3 — ALREADY EXISTS):** The `idx_findings_segment` index on `findings(segment_id)` already exists from `supabase/migrations/00005_performance_indexes.sql`. The `segments_select_native` RLS policy's JOIN path is already covered. Do NOT create a duplicate index.

### Existing Code to Extend

| File | Change | Purpose |
|------|--------|---------|
| `src/db/schema/index.ts` | Add 2 exports + 2 relation exports | Register new schemas |
| `src/db/schema/relations.ts` | Add 2 new relation blocks + update 5 existing | Wire relationships |
| `src/types/` (new file) | Create `assignment.ts` | AssignmentStatus type |

### Files to Create

| File | Purpose |
|------|---------|
| `src/db/schema/findingAssignments.ts` | Drizzle schema for finding_assignments table |
| `src/db/schema/findingComments.ts` | Drizzle schema for finding_comments table |
| `src/types/assignment.ts` | AssignmentStatus union type + const array |
| `supabase/migrations/00026_story_5_2b_rls_scoped_access.sql` | RLS policies migration |
| `src/db/__tests__/rls/finding-assignments-rls.test.ts` | RLS tests for new tables |
| `src/db/__tests__/rls/native-reviewer-scoped-access-rls.test.ts` | RLS tests for scoped access |

### Key Implementation Details

**JWT claims available for RLS:**
- `((SELECT auth.jwt()) ->> 'tenant_id')::uuid` — tenant ID
- `((SELECT auth.jwt()) ->> 'user_role')` — `'admin'` | `'qa_reviewer'` | `'native_reviewer'`
- `((SELECT auth.jwt()) ->> 'sub')::uuid` — user ID
- Use `(SELECT auth.jwt())` wrapper (cached per query) — NOT bare `auth.jwt()`

**RLS policy naming convention (from existing codebase):**
- `{table}_select_admin_qa` — admin + qa_reviewer SELECT
- `{table}_select_native` — native_reviewer SELECT
- `{table}_insert` — role-specific INSERT
- `{table}_update_admin_qa` / `{table}_update_native` — role-specific UPDATE
- `{table}_delete` — admin DELETE

**Exact policy names to DROP (verified from `supabase/migrations/00001_rls_policies.sql`):**
- findings: `"Tenant isolation: SELECT"`, `"Tenant isolation: UPDATE"` (DROP + re-CREATE as role-scoped)
- segments: `"Tenant isolation: SELECT"` (DROP + re-CREATE as role-scoped)
- review_actions: `"Tenant isolation: SELECT"` (DROP + re-CREATE as role-scoped)

**Existing policies to KEEP (DO NOT DROP):**
- findings: `"Tenant isolation: INSERT"` (pipeline uses service_role), `"Tenant isolation: DELETE"` (tenant-only — NOT role-scoped, see TD-RLS-001)

**Existing policies REPLACED with role-scoped (post-CR agent security hardening):**
- segments: INSERT/UPDATE → admin+qa only, DELETE → admin only (native reviewers read-only)
- review_actions: INSERT replaced (admin+qa + native-assigned), UPDATE → admin+qa only, DELETE → admin only

**Native reviewer INSERT on review_actions (G1 — CRITICAL):**
The RLS design doc section 3.6 is missing INSERT policy for native reviewers. Without this, native reviewers cannot confirm/override findings (Story 5.2c). Do NOT drop the existing INSERT policy — ADD a new one alongside it:
```sql
CREATE POLICY "review_actions_insert_native" ON review_actions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND EXISTS (
      SELECT 1 FROM finding_assignments fa
      WHERE fa.finding_id = review_actions.finding_id
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
        AND fa.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );
```

**Existing RLS policies to audit before DROP:**
Check `supabase/migrations/00001_rls_policies.sql` for exact current policy names on findings, segments, review_actions. The policy names may differ from what the design doc assumes. Use `DROP POLICY IF EXISTS` with the ACTUAL names.

### Guardrail Summary (Story-Relevant)

| # | Rule | Application |
|---|------|------------|
| 1 | `withTenant()` on EVERY query | All new tables have tenant_id column |
| 3 | No bare `string` for status | `AssignmentStatus` union type (AC3) |
| 41 | DB constraint → audit INSERT/UPDATE paths | CHECK on status column → Story 5.2c actions must handle |
| 62 | RLS: prefer EXISTS subquery | All native-scoped policies use EXISTS |
| 63 | RLS migration: atomic DROP+CREATE | Supabase migration wrapped in BEGIN/COMMIT |
| 64 | App-level + RLS double defense | Schema only — app-level checks in Story 5.2c |
| 65 | Composite index on finding_assignments | 4 indexes in AC4 (G3 already exists) |
| 71 | Enable RLS from migration day 1 | Both tables ENABLE RLS in CREATE migration |
| 72 | AssignmentStatus union type | AC3 |
| 76 | RLS test mandatory for every role-scoped policy | AC7 full test matrix |
| 78 | finding_assignments audit log mandatory | Schema only — audit writes in Story 5.2c |

### Anti-Patterns to Avoid

- **Do NOT create RLS policies without transaction wrapping** — a failed mid-migration leaves tables without SELECT policies (all queries return 0 rows)
- **Do NOT add `updatedAt` to finding_comments** — comments are immutable for audit. If edit needed later, add column + UPDATE policy together
- **Do NOT skip the `tenant_id` check inside EXISTS subqueries** — even though the outer USING already checks tenant_id, the subquery table may have rows from other tenants if it doesn't filter (RLS design G2)
- **Do NOT use Drizzle migration for RLS** — Drizzle doesn't manage RLS policies. Use Supabase migration only
- **Do NOT assume existing policy names** — read actual `supabase/migrations/00001_rls_policies.sql` to get the exact names before writing DROP statements
- **Do NOT add UPDATE policy on finding_comments** — immutable by design
- **Do NOT forget the native INSERT policy on review_actions** — G1 gap from original design
- **Do NOT forget `findings_update_native` policy** — without it native reviewers cannot confirm/override findings (Story 5.2c will break)
- **Do NOT create duplicate `idx_findings_segment_id` index** — `idx_findings_segment` already exists from migration 00005
- **Do NOT place `ENABLE ROW LEVEL SECURITY` in Drizzle migration** — must be in Supabase migration atomically with policies (pattern from 00025)

### Previous Story Intelligence (Story 5.2a)

Story 5.2a established:
- `review_actions.metadata` jsonb stores `{ non_native: true/false }` — Story 5.2b does NOT modify this
- `hasNonNativeAction` field in `FindingForDisplay` — Story 5.2b does NOT modify this
- `determineNonNative()` utility used by all review actions — reuse in Story 5.2c
- `requireRole('qa_reviewer')` on all review actions — Story 5.2c will need `requireRole('native_reviewer')` for native-specific actions
- All 15+ action files already pass `nativeLanguages` in user param — no further changes needed for 5.2b

Story 5.1 established:
- `back_translation_cache` table with RLS — follow same Supabase migration pattern
- `btConfidenceThreshold` on projects table — no change needed
- `AILayer` type extended to `'BT'` — no change needed

### Git Intelligence

Recent commits show:
- Story 5.2a CR R2 complete (commit `c0aa7b8`) — all non-native metadata wiring done
- Cross-file review fixes (commits `fef2170`, `e921702`, `0c67d7e`) — dashboard + bridge + pipeline
- Latest Drizzle migration: `0016_fix_bt_cache_rls.sql`
- Latest Supabase migration: `00025_story_5_1_back_translation_cache_rls.sql`
- New Drizzle migration: auto-numbered by `npm run db:generate` (note: there are duplicate `0014_*` files — Drizzle handles this internally). New Supabase migration: `00026_*`

### RLS Test Patterns (from existing tests — verified)

Existing RLS tests are in `src/db/__tests__/rls/`. Follow these patterns:
- Import `{ admin, setupTestTenant, cleanupTestTenant, tenantClient, TestTenant }` from `./helpers`
- `setupTestTenant(email)` creates tenant + user with `admin` role + returns `{ id, userId, jwt }`
- `tenantClient(jwt)` creates RLS-subject client for a user
- **For native_reviewer tests:** `setupTestTenant` always creates `admin` role. Must create additional users with different roles:
  ```typescript
  // After setupTestTenant, create extra users for role testing:
  const nativeUser = await admin.auth.admin.createUser({ email: 'native@test.local', password: '...', email_confirm: true })
  await admin.from('users').insert({ id: nativeUser.data.user!.id, tenant_id: tenantA.id, email: 'native@test.local', display_name: 'Native', native_languages: ['th'] })
  await admin.from('user_roles').insert({ user_id: nativeUser.data.user!.id, tenant_id: tenantA.id, role: 'native_reviewer' })
  await admin.auth.admin.updateUserById(nativeUser.data.user!.id, { app_metadata: { tenant_id: tenantA.id, user_role: 'native_reviewer' } })
  // Sign in to get JWT
  const { data: session } = await anonClient.auth.signInWithPassword({ email: 'native@test.local', password: '...' })
  const nativeJwt = session.session!.access_token
  ```
- Create test data via admin client (service_role bypasses RLS), then verify access with role-specific `tenantClient(jwt)`
- Test both positive (allowed) and negative (denied) cases
- Assert row count for SELECT, success/error for INSERT/UPDATE/DELETE
- **Cleanup order in `afterAll`** (FK RESTRICT on tenants.id prevents cleanup if rows remain):
  1. Delete `finding_comments` → `finding_assignments` → extra test data (findings, segments, files, projects)
  2. Delete additional native/qa users manually: `admin.from('user_roles').delete()`, `admin.from('users').delete()`, `admin.auth.admin.deleteUser()`
  3. Then call `cleanupTestTenant()` for the primary tenant users
  - **IMPORTANT: Use separate `anonClient` for signIn, NOT `admin.auth.signInWithPassword()`** — pollutes admin session (see helpers.ts:100-103)

### Project Structure Notes

- All new files follow established patterns (schema files in `src/db/schema/`, types in `src/types/`, RLS tests in `src/db/__tests__/rls/`)
- No new feature modules or components needed — this is infrastructure only
- 6 new files + 2 existing file modifications (schema/index.ts, schema/relations.ts) + 1 orphan deletion (TD-DB-006)
- Story 5.2c depends on this story's schema + RLS being complete

### References

- [Source: Epic 5 — `_bmad-output/planning-artifacts/epics/epic-5-language-intelligence-non-native-support.md`]
- [Source: RLS Scoped Access Design — `_bmad-output/planning-artifacts/research/rls-scoped-access-design-2026-03-26.md` (S2-S4, S7, S10)]
- [Source: RLS Design Gaps G1-G3 — `_bmad-output/planning-artifacts/research/rls-scoped-access-design-2026-03-26.md` S13.1]
- [Source: Guardrails Epic 5 — `CLAUDE-guardrails-epic5.md` #62-65, #71-72, #76, #78]
- [Source: Story 5.2a (done) — `_bmad-output/implementation-artifacts/5-2a-non-native-auto-tag.md`]
- [Source: Story 5.1 (done) — `_bmad-output/implementation-artifacts/5-1-language-bridge-back-translation.md`]
- [Source: Existing fileAssignments pattern — `src/db/schema/fileAssignments.ts`]
- [Source: FindingStatus type pattern — `src/types/finding.ts`]
- [Source: Existing RLS policies — `supabase/migrations/00001_rls_policies.sql`]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- RLS test failure 1: WITH CHECK on finding_assignments returns error (not empty array) → fixed assertion to check both
- RLS test failure 2: review_actions old INSERT policy too permissive (ORed with new native policy) → replaced with role-scoped INSERT
- RLS test failure 3: finding_comments INSERT native policy missing `finding_id` consistency check → added `fa.finding_id = finding_comments.finding_id`
- ATDD test bugs: review_actions INSERT used wrong column names (`performed_by` → `user_id`, `new_status` → `new_state`, missing `previous_state`/`file_id`)

### Completion Notes List
- AC1: `finding_assignments` table created with all columns, UNIQUE constraint, 6 FKs ✅
- AC2: `finding_comments` table created — immutable (no updatedAt), no UPDATE policy ✅
- AC3: `AssignmentStatus` union type + const array + CHECK constraint ✅
- AC4: 4 performance indexes created (IF NOT EXISTS) ✅
- AC5: Role-scoped RLS on findings (4 policies), segments (2), review_actions (4 — including INSERT replacement) ✅
- AC6: Role-scoped RLS on finding_assignments (6 policies), finding_comments (5 policies) ✅
- AC7: 31/31 RLS integration tests GREEN (expanded from 24 in CR R1/R2) ✅
- AC8: Drizzle relations (2 new + 5 updated) + schema exports ✅
- TD-DB-006: Orphan migration deleted + `uq_scores_file_tenant` constraint applied ✅
- **Design improvement:** review_actions INSERT policy replaced (old was role-agnostic → new is admin+qa scoped)
- **Design improvement:** finding_comments INSERT/SELECT native policies now verify `finding_id` consistency with assignment
- **Security hardening (post-CR agent fix):** Tightened ALL remaining tenant-only policies to role-scoped:
  - segments INSERT/UPDATE → admin+qa only, DELETE → admin only (native reviewers read-only on segments)
  - review_actions UPDATE → admin+qa only, DELETE → admin only (native reviewers cannot modify audit trail)
  - Verified: 64/64 RLS tests GREEN (11 test files, 0 regression)
- **DB pushed:** Cloud ✅ + Local Supabase ✅ (Drizzle migration + RLS migration both applied)

### CR R1 Fixes (2026-03-28)
**17 findings fixed (5 HIGH, 6 MEDIUM, 6 LOW) from 4 agents + manual review:**
- **H1:** Native INSERT denial test used UNIQUE-masked finding → now uses separate unassigned finding
- **H2:** "0 findings" boundary test was vacuous (Tenant B had no findings) → seeded finding in Tenant B
- **H3:** `review_actions_select_native` policy had 0 test coverage → added 2 SELECT tests (positive + negative)
- **H4:** Missing positive native UPDATE status test → added `pending→in_review` test
- **H5:** Native could SET `status='overridden'` via RLS → added `AND status IN ('pending','in_review','confirmed')` to WITH CHECK
- **M1:** `findingAssignments.fileId` NOT NULL vs nullable `findings.file_id` → documented constraint + TODO(5.2c)
- **M2:** WITH CHECK reassignment test used vacuous error-or-empty guard → simplified to `expect(data).toHaveLength(0)`
- **M3:** Comment SELECT test depended on sibling INSERT → seeded in beforeAll
- **M4:** `updatedAt` lacks auto-update trigger → added TODO(5.2c)
- **M5:** findings INSERT/DELETE still tenant-only → created TD-RLS-001, fixed Dev Notes "(admin-only)" label
- **M6:** Policy names inconsistent → `finding_assignments_insert` → `_insert_admin_qa`, `_delete` → `_delete_admin`
- **L1:** `fileAssignments.status` bare string → added `$type<'pending'|'accepted'|'completed'>()`
- **L2:** Drizzle migration lacked ENABLE RLS → added defense-in-depth statements
- **L3:** DELETE denial test used broad tenant filter → now targets specific commentId
- **L4:** Misleading test comment ("wrong assignment") → clarified as "mismatched finding_id vs assignment"
- **L5:** QA reviewer INSERT test missing → added
- **L6:** Native write denial tests on segments missing → added INSERT + DELETE denial tests
- **RLS reviewer doc fix:** Added intent comment for no native UPDATE on review_actions
- **Conditional scans ran:** rls-policy-reviewer (schema changed). inngest-function-validator skipped (no Inngest files).

### File List
**New files:**
- `src/types/assignment.ts` — AssignmentStatus union type
- `src/db/schema/findingAssignments.ts` — Drizzle schema
- `src/db/schema/findingComments.ts` — Drizzle schema (immutable)
- `src/db/migrations/0017_lying_saracen.sql` — Drizzle migration (CREATE TABLE + CHECK + ENABLE RLS)
- `supabase/migrations/00026_story_5_2b_rls_scoped_access.sql` — Supabase RLS migration (8 sections)

**Modified files:**
- `src/db/schema/relations.ts` — 2 new relation blocks + 5 updated
- `src/db/schema/index.ts` — 2 new table exports + 2 new relation exports
- `src/db/schema/fileAssignments.ts` — L1 fix: `$type<>()` on status column

**Deleted files:**
- `src/db/migrations/0014_typical_gauntlet.sql` — orphan (TD-DB-006)

**ATDD test files (unskipped + fixed + CR R1/R2 expanded):**
- `src/db/__tests__/rls/finding-assignments-rls.test.ts` — 15 tests (+3 from CR R1: H4 status update, H5 overridden denial, L5 qa INSERT)
- `src/db/__tests__/rls/native-reviewer-scoped-access-rls.test.ts` — 16 tests (+4 from CR R1: H2 seeded Tenant B, H3 review_actions SELECT ×2, L6 segments write denial ×2)

### CR R2 Fixes (2026-03-28)
**3 findings fixed (0 HIGH, 3 MEDIUM) from 3 agents (code-quality, testing-qa, cross-file):**
- **M1:** [XFR-P1] RLS WITH CHECK status subset had no cross-reference → added comments in both `assignment.ts` and `00026` migration linking ASSIGNMENT_STATUSES to the RLS whitelist
- **M2:** [TQA] `review_actions SELECT` test depended on prior INSERT test ��� seeded review_action in `beforeAll`, added specific `seededReviewActionId` assertion
- **M3:** [TQA] `native UPDATE status` test didn't protect restore → wrapped in `try/finally` to guarantee status reset on assertion failure
- **CR R2 result:** 0 Critical, 0 High — code quality clean. 31/31 RLS tests GREEN.
