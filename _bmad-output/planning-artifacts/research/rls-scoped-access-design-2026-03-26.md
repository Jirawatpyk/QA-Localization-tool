# RLS Scoped Access Design — Epic 5, Story 5.2

**Date:** 2026-03-26
**Scope:** Non-Native Auto-Tag & Native Reviewer Scoped Access
**FRs:** FR29, FR38, FR39
**Status:** Design Spike (pre-implementation)

---

## 1. Current State Analysis

### 1.1 Existing RLS Pattern

All tables use **tenant-only isolation** — every policy checks `tenant_id = jwt.tenant_id`. No role-based or row-level user scoping exists yet.

```sql
-- Current universal pattern (applied to ALL tables)
CREATE POLICY "Tenant isolation: SELECT" ON {table}
  FOR SELECT TO authenticated
  USING (tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid);
```

### 1.2 Existing Role System

| Role | Hierarchy Level | JWT Claim | Current Capabilities |
|---|---|---|---|
| `admin` | 3 | `user_role = 'admin'` | Full CRUD on all tenant data |
| `qa_reviewer` | 2 | `user_role = 'qa_reviewer'` | Review findings, make decisions |
| `native_reviewer` | 1 | `user_role = 'native_reviewer'` | **Not yet enforced at RLS level** |

**Key insight:** `native_reviewer` role exists in `userRoles.role` and `getCurrentUser.ts` but has **zero RLS enforcement** — currently sees everything same as `qa_reviewer` within tenant.

### 1.3 Existing Relevant Tables

| Table | Key Columns | Notes |
|---|---|---|
| `users` | `id`, `tenant_id`, `native_languages: jsonb (string[])` | BCP-47 array already exists |
| `user_roles` | `user_id`, `tenant_id`, `role` | UNIQUE(user_id, tenant_id) |
| `findings` | `id`, `segment_id`, `file_id`, `project_id`, `tenant_id`, `status` | Status includes `'flagged'` |
| `review_actions` | `finding_id`, `user_id`, `action_type`, `metadata: jsonb` | Metadata can hold `{ non_native: true }` |
| `segments` | `id`, `file_id`, `source_text`, `target_text`, `source_lang`, `target_lang` | Has language info |
| `file_assignments` | `file_id`, `assigned_to`, `assigned_by` | **File-level** assignment exists |
| `notifications` | `user_id`, `type`, `title`, `body`, `metadata` | Ready to use |
| `review_sessions` | `reviewer_id`, `project_id` | Per-reviewer sessions |

### 1.4 What Already Exists vs What's Missing

| Capability | Status | Notes |
|---|---|---|
| Native language on user profile | **EXISTS** | `users.native_languages: jsonb (string[])` |
| File-level assignment | **EXISTS** | `file_assignments` table |
| Finding-level assignment | **MISSING** | Need `finding_assignments` table |
| Non-native auto-tag | **MISSING** | Need logic in review action + metadata flag |
| Finding comments (flagger <-> native) | **MISSING** | Need `finding_comments` table |
| Role-scoped RLS on findings | **MISSING** | Need new policies |
| Notification on native comment | **PARTIAL** | `notifications` table exists, trigger logic missing |

---

## 2. New Schema Design

### 2.1 New Table: `finding_assignments`

Links specific findings to native reviewers. This is the **core table for RLS scoping**.

```
finding_assignments
├── id: uuid PK
├── finding_id: uuid FK -> findings.id (ON DELETE CASCADE)
├── file_id: uuid FK -> files.id (ON DELETE CASCADE) -- denormalized for query perf
├── project_id: uuid FK -> projects.id (ON DELETE CASCADE)
├── tenant_id: uuid FK -> tenants.id (ON DELETE RESTRICT)
├── assigned_to: uuid FK -> users.id (ON DELETE RESTRICT) -- native reviewer
├── assigned_by: uuid FK -> users.id (ON DELETE RESTRICT) -- flagger (qa_reviewer)
├── status: varchar(20) NOT NULL DEFAULT 'pending'
│   -- 'pending' | 'in_review' | 'confirmed' | 'overridden'
├── flagger_comment: text -- why native review is needed (FR29)
├── created_at: timestamptz NOT NULL DEFAULT now()
├── updated_at: timestamptz NOT NULL DEFAULT now()
└── UNIQUE(finding_id, assigned_to) -- one assignment per finding per reviewer
```

**Drizzle Schema:**

```typescript
// src/db/schema/findingAssignments.ts
import { pgTable, uuid, varchar, text, timestamp, unique } from 'drizzle-orm/pg-core'

import { files } from './files'
import { findings } from './findings'
import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const findingAssignments = pgTable(
  'finding_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    findingId: uuid('finding_id')
      .notNull()
      .references(() => findings.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    assignedTo: uuid('assigned_to')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignedBy: uuid('assigned_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    // 'pending' | 'in_review' | 'confirmed' | 'overridden'
    flaggerComment: text('flagger_comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_finding_assignments_finding_user').on(table.findingId, table.assignedTo),
  ],
)
```

### 2.2 New Table: `finding_comments`

Threaded comments between flagger and native reviewer on a finding.

```
finding_comments
├── id: uuid PK
├── finding_id: uuid FK -> findings.id (ON DELETE CASCADE)
├── finding_assignment_id: uuid FK -> finding_assignments.id (ON DELETE CASCADE)
├── tenant_id: uuid FK -> tenants.id (ON DELETE RESTRICT)
├── author_id: uuid FK -> users.id (ON DELETE RESTRICT)
├── body: text NOT NULL
├── created_at: timestamptz NOT NULL DEFAULT now()
└── updated_at: timestamptz NOT NULL DEFAULT now()
```

**Drizzle Schema:**

```typescript
// src/db/schema/findingComments.ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

import { findingAssignments } from './findingAssignments'
import { findings } from './findings'
import { tenants } from './tenants'
import { users } from './users'

export const findingComments = pgTable('finding_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  findingId: uuid('finding_id')
    .notNull()
    .references(() => findings.id, { onDelete: 'cascade' }),
  findingAssignmentId: uuid('finding_assignment_id')
    .notNull()
    .references(() => findingAssignments.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  authorId: uuid('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
```

### 2.3 Column Additions to Existing Tables

**No column additions needed.** The existing schema already supports:

- `review_actions.metadata` (jsonb) -> store `{ non_native: true }` flag
- `users.native_languages` (jsonb string[]) -> determine native vs non-native
- `findings.status` -> already includes `'flagged'`

**Rationale:** Adding a `non_native` boolean column to `review_actions` was considered but rejected — using `metadata` jsonb is the established pattern and avoids a migration on a high-traffic table. The flag is write-once (set at action creation), never queried for filtering, only read for display/export.

---

## 3. RLS Policy Design

### 3.1 Design Approach: Two-Layer RLS

The current tenant-only policies must be **replaced** (not just supplemented) for tables where native reviewers need scoped access. The approach:

1. **Admin + QA Reviewer** = same as today (tenant-scoped, full access within tenant)
2. **Native Reviewer** = tenant-scoped + row-scoped (only assigned findings)

**JWT claims used:**
- `tenant_id` (existing)
- `user_role` (existing) — `'admin'` | `'qa_reviewer'` | `'native_reviewer'`
- `sub` (existing) — user ID for assignment check

### 3.2 Findings Table — Role-Scoped Policies

```sql
-- =============================================================================
-- FINDINGS — Role-scoped access (replaces simple tenant isolation)
-- =============================================================================

-- Drop existing tenant-only policy
DROP POLICY IF EXISTS "Tenant isolation: SELECT" ON findings;

-- Admin + QA Reviewer: full tenant access (unchanged behavior)
CREATE POLICY "findings_select_admin_qa" ON findings
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Native Reviewer: ONLY findings assigned to them
CREATE POLICY "findings_select_native" ON findings
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND EXISTS (
      SELECT 1 FROM finding_assignments fa
      WHERE fa.finding_id = findings.id
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
        AND fa.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

-- INSERT: unchanged (pipeline inserts, not role-dependent)
-- Keep existing: "Tenant isolation: INSERT" ON findings

-- UPDATE: Admin + QA Reviewer = tenant-scoped
DROP POLICY IF EXISTS "Tenant isolation: UPDATE" ON findings;

CREATE POLICY "findings_update_admin_qa" ON findings
  FOR UPDATE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  )
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
  );

-- UPDATE: Native Reviewer = only assigned findings
CREATE POLICY "findings_update_native" ON findings
  FOR UPDATE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND EXISTS (
      SELECT 1 FROM finding_assignments fa
      WHERE fa.finding_id = findings.id
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
        AND fa.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  )
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
  );

-- DELETE: keep existing tenant isolation (only admin should delete, enforced at app level)
```

### 3.3 Segments Table — Role-Scoped Policies

Native reviewers should only see segments that belong to their assigned findings.

```sql
-- =============================================================================
-- SEGMENTS — Role-scoped access
-- =============================================================================

-- Drop existing
DROP POLICY IF EXISTS "Tenant isolation: SELECT" ON segments;

-- Admin + QA Reviewer: full tenant access
CREATE POLICY "segments_select_admin_qa" ON segments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Native Reviewer: only segments linked to their assigned findings
CREATE POLICY "segments_select_native" ON segments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND EXISTS (
      SELECT 1 FROM findings f
      JOIN finding_assignments fa ON fa.finding_id = f.id
      WHERE f.segment_id = segments.id
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
        AND fa.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

-- INSERT/UPDATE/DELETE: keep existing tenant isolation
-- (Native reviewers don't modify segments)
```

### 3.4 Finding Assignments Table — New Policies

```sql
-- =============================================================================
-- FINDING_ASSIGNMENTS
-- =============================================================================
ALTER TABLE finding_assignments ENABLE ROW LEVEL SECURITY;

-- Admin + QA Reviewer: full tenant access (can create/view all assignments)
CREATE POLICY "finding_assignments_select_admin_qa" ON finding_assignments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Native Reviewer: only their own assignments
CREATE POLICY "finding_assignments_select_native" ON finding_assignments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
  );

-- INSERT: Admin + QA Reviewer only (they create assignments)
CREATE POLICY "finding_assignments_insert" ON finding_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- UPDATE: Admin/QA can update any, Native can update their own
CREATE POLICY "finding_assignments_update_admin_qa" ON finding_assignments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  )
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
  );

CREATE POLICY "finding_assignments_update_native" ON finding_assignments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
  )
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
  );

-- DELETE: Admin only (enforced at app level + RLS)
CREATE POLICY "finding_assignments_delete" ON finding_assignments
  FOR DELETE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'admin'
  );
```

### 3.5 Finding Comments Table — New Policies

```sql
-- =============================================================================
-- FINDING_COMMENTS
-- =============================================================================
ALTER TABLE finding_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: Anyone involved (admin/qa sees all in tenant, native sees only their assignments)
CREATE POLICY "finding_comments_select_admin_qa" ON finding_comments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

CREATE POLICY "finding_comments_select_native" ON finding_comments
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND EXISTS (
      SELECT 1 FROM finding_assignments fa
      WHERE fa.id = finding_comments.finding_assignment_id
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
    )
  );

-- INSERT: Both roles can comment (flagger and native reviewer)
CREATE POLICY "finding_comments_insert_admin_qa" ON finding_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
    AND author_id = ((SELECT auth.jwt()) ->> 'sub')::uuid
  );

CREATE POLICY "finding_comments_insert_native" ON finding_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND author_id = ((SELECT auth.jwt()) ->> 'sub')::uuid
    AND EXISTS (
      SELECT 1 FROM finding_assignments fa
      WHERE fa.id = finding_comments.finding_assignment_id
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
    )
  );

-- UPDATE: Only own comments
CREATE POLICY "finding_comments_update" ON finding_comments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND author_id = ((SELECT auth.jwt()) ->> 'sub')::uuid
  )
  WITH CHECK (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND author_id = ((SELECT auth.jwt()) ->> 'sub')::uuid
  );

-- DELETE: Admin only
CREATE POLICY "finding_comments_delete" ON finding_comments
  FOR DELETE TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'admin'
  );
```

### 3.6 Review Actions Table — Add Non-Native Scoping

Native reviewers should only see/create review actions for their assigned findings.

```sql
-- =============================================================================
-- REVIEW_ACTIONS — Add native reviewer scoping
-- =============================================================================

-- Drop existing
DROP POLICY IF EXISTS "Tenant isolation: SELECT" ON review_actions;

-- Admin + QA Reviewer: full tenant access (unchanged)
CREATE POLICY "review_actions_select_admin_qa" ON review_actions
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') IN ('admin', 'qa_reviewer')
  );

-- Native Reviewer: only actions on their assigned findings
CREATE POLICY "review_actions_select_native" ON review_actions
  FOR SELECT TO authenticated
  USING (
    tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    AND ((SELECT auth.jwt()) ->> 'user_role') = 'native_reviewer'
    AND EXISTS (
      SELECT 1 FROM finding_assignments fa
      WHERE fa.finding_id = review_actions.finding_id
        AND fa.assigned_to = ((SELECT auth.jwt()) ->> 'sub')::uuid
        AND fa.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid
    )
  );

-- INSERT: Keep existing tenant isolation
-- (App-level logic enforces native reviewer can only create actions for assigned findings)

-- UPDATE/DELETE: Keep existing tenant isolation
```

### 3.7 Tables That DON'T Need Role-Scoped RLS

These tables keep their current tenant-only isolation:

| Table | Reason |
|---|---|
| `projects` | Native reviewers need to see project info for context |
| `files` | Native reviewers need file metadata (language pair, name) |
| `scores` | Read-only for native reviewers; tenant isolation sufficient |
| `glossaries` / `glossary_terms` | Reference data, read-only |
| `notifications` | Already scoped by `user_id` at app level |
| `audit_logs` | Append-only, admin read; tenant isolation sufficient |
| `review_sessions` | Native reviewer will have their own sessions |

**Note on `files`:** Native reviewers can see file metadata but since findings are scoped, they can only access the segments/findings assigned to them within that file. The UI will show "You have access to X flagged segments in this file" (AC5).

---

## 4. Performance Considerations

### 4.1 Index Requirements

The `EXISTS` subqueries in native reviewer policies will be hot paths. Required indexes:

```sql
-- Primary lookup: "which findings are assigned to this user?"
CREATE INDEX idx_finding_assignments_user_tenant
  ON finding_assignments (assigned_to, tenant_id);

-- Join path: finding_id lookup for RLS checks on findings/review_actions
CREATE INDEX idx_finding_assignments_finding_user
  ON finding_assignments (finding_id, assigned_to);

-- Comment lookup by assignment
CREATE INDEX idx_finding_comments_assignment
  ON finding_comments (finding_assignment_id);

-- Comment lookup by finding (for history view)
CREATE INDEX idx_finding_comments_finding
  ON finding_comments (finding_id);
```

### 4.2 RLS Performance Analysis

| Policy | Estimated Cost | Mitigation |
|---|---|---|
| `findings_select_native` | EXISTS subquery per row | Index on `(finding_id, assigned_to)` makes this an index-only scan |
| `segments_select_native` | Double JOIN (findings -> finding_assignments) | Index + typical assignment count < 50 per reviewer |
| `review_actions_select_native` | EXISTS subquery per row | Same index covers this |

**Benchmark target:** Native reviewer queries should complete < 50ms for up to 200 assigned findings.

### 4.3 JWT Claim Caching

The `(SELECT auth.jwt())` subquery is already cached per-query by PostgreSQL (this is the established pattern in all existing RLS policies). The `user_role` and `sub` claims are extracted once per query execution.

---

## 5. Non-Native Auto-Tag Logic

### 5.1 Determination Algorithm

```
isNonNative(user, file):
  userNativeLanguages = user.native_languages  // BCP-47 array from users table
  fileTargetLang = file.targetLang             // from segments/files

  // BCP-47 prefix match: "th" matches "th-TH", "en" matches "en-US"
  return !userNativeLanguages.some(lang =>
    fileTargetLang.startsWith(lang) || lang.startsWith(fileTargetLang)
  )
```

### 5.2 Where Auto-Tag Is Applied

In every Server Action that creates a `review_action` (accept, reject, flag, etc.):

```typescript
// In review action Server Actions
const isNonNative = determineNonNative(currentUser, fileTargetLang)

await db.insert(reviewActions).values({
  // ... existing fields
  metadata: {
    ...existingMetadata,
    ...(isNonNative ? { non_native: true } : {}),
  },
})
```

### 5.3 Impact on Existing Code

Files that create review actions (need `non_native` tagging logic):

- `src/features/review/actions/` — all action files that insert into `review_actions`
- Export/audit trail rendering — need to display the badge

---

## 6. Workflow: Flag for Native Review

### 6.1 Flow

```
1. QA Reviewer (non-native) reviews finding
2. Presses F or clicks "Flag for Native Review"
3. Dialog opens: select native reviewer + add comment
4. Server Action:
   a. UPDATE findings SET status = 'flagged'
   b. INSERT finding_assignments (finding_id, assigned_to, flagger_comment)
   c. INSERT review_actions (action_type = 'flag_for_native', metadata = { non_native: true })
   d. INSERT notifications (to native reviewer)
   e. INSERT audit_logs
5. Native Reviewer logs in
6. Sees "For Verification" queue (only assigned findings via RLS)
7. Can: view source/target/back-translation, read flagger comment, add comment, confirm/override
8. On comment: notification sent to original flagger
9. On confirm/override:
   a. UPDATE findings SET status = new_status
   b. UPDATE finding_assignments SET status = 'confirmed' | 'overridden'
   c. UPDATE review_actions metadata: clear non_native tag on the finding
   d. INSERT audit_logs
```

### 6.2 Finding Status Transitions

```
pending ──[qa_reviewer: flag]──> flagged
flagged ──[native_reviewer: confirm]──> accepted (or re_accepted)
flagged ──[native_reviewer: override]──> rejected (or other status)
```

---

## 7. Migration Plan

### 7.1 Migration Order

```
Migration 00022_story_5_2_finding_assignments.sql
├── 1. CREATE TABLE finding_assignments (with constraints + indexes)
├── 2. CREATE TABLE finding_comments (with constraints + indexes)
├── 3. CREATE performance indexes
└── 4. (Schema only — no data migration needed)

Migration 00023_story_5_2_rls_scoped_access.sql
├── 1. DROP + re-CREATE findings RLS policies (role-scoped)
├── 2. DROP + re-CREATE segments RLS policies (role-scoped)
├── 3. DROP + re-CREATE review_actions RLS policies (role-scoped)
├── 4. CREATE finding_assignments RLS policies (new)
├── 5. CREATE finding_comments RLS policies (new)
└── 6. Enable Realtime on finding_assignments (for live status updates)
```

### 7.2 Backward Compatibility

| Concern | Risk | Mitigation |
|---|---|---|
| Dropping findings SELECT policy | **HIGH** — breaks all existing queries during deploy | Use `CREATE OR REPLACE` where possible; otherwise atomic DROP + CREATE in single transaction |
| Admin/QA behavior change | **LOW** — new policies grant same access | Verify with RLS tests before deploy |
| Native reviewer new restrictions | **NONE** — no native reviewers exist in production yet | Epic 5 is the first to use this role |
| Inngest pipeline inserts | **LOW** — pipeline uses `service_role` key, bypasses RLS | Verify pipeline still works |
| Drizzle queries with `withTenant()` | **NONE** — all app-level queries use `service_role` or server components | RLS is second layer of defense |

### 7.3 Rollback Plan

If role-scoped RLS causes issues:
1. Run rollback migration: re-CREATE original tenant-only policies
2. `finding_assignments` and `finding_comments` tables can remain (no data dependency)

---

## 8. Impact Analysis on Existing Queries

### 8.1 Queries That Need Review

| Location | Query Pattern | Impact |
|---|---|---|
| `src/features/review/` | `db.select().from(findings).where(...)` | No change (uses Drizzle + service-level client) |
| Review page data fetching | Server Component queries | May hit RLS if using anon/authenticated client |
| Realtime subscriptions | `supabase.channel().on('postgres_changes', ...)` | **Affected** — native reviewer subscriptions will only receive changes for assigned findings |
| Export (Epic 8) | Bulk SELECT findings | Need to handle native reviewer case (export only assigned) |

### 8.2 Drizzle Client Analysis

The project uses **three** Supabase client types:

| Client | RLS | Used By |
|---|---|---|
| `createServerClient()` | **YES** — authenticated user's JWT | Server Components, Server Actions |
| `createBrowserClient()` | **YES** — authenticated user's JWT | Client-side Realtime |
| `createAdminClient()` | **NO** — service_role | Inngest pipeline, system operations |

**Critical finding:** Server Actions use `db` from `@/db/client.ts` which likely uses a direct Drizzle connection (not through Supabase RLS). This means **RLS is a second layer of defense** — the primary enforcement is `withTenant()` in app code. The new role-scoped restriction must also be enforced at the **app level** via `requireRole()` checks + explicit assignment validation.

### 8.3 Required App-Level Changes

```
1. Review page data loader:
   - If role === 'native_reviewer': filter findings by finding_assignments
   - Show "You have access to X flagged segments" message

2. Review action Server Actions:
   - Add non_native flag determination
   - For native_reviewer: validate finding is assigned before allowing action

3. New Server Actions needed:
   - flagForNativeReview.action.ts (creates assignment + notification)
   - addFindingComment.action.ts (creates comment + notification)
   - confirmNativeReview.action.ts (updates finding status + clears tag)
   - overrideNativeReview.action.ts (changes finding decision)

4. New components:
   - FlagForNativeDialog (select reviewer + comment)
   - NativeReviewQueue (filtered finding list)
   - FindingCommentThread (comment display + input)
   - NonNativeTag (badge component for export/audit)
```

---

## 9. RLS Test Plan

### 9.1 Test Matrix

| Test Case | Expected |
|---|---|
| Native reviewer SELECT findings — not assigned | 0 rows |
| Native reviewer SELECT findings — assigned | Only assigned rows |
| Native reviewer UPDATE assigned finding | Success |
| Native reviewer UPDATE non-assigned finding | Error / 0 rows |
| Native reviewer SELECT segments — only via assigned findings | Only linked segments |
| Native reviewer INSERT finding_assignment | Error (only qa/admin) |
| QA reviewer SELECT findings | All tenant findings (unchanged) |
| Admin SELECT findings | All tenant findings (unchanged) |
| Cross-tenant native reviewer | 0 rows (tenant isolation maintained) |
| Native reviewer INSERT finding_comment on assigned finding | Success |
| Native reviewer INSERT finding_comment on unassigned finding | Error |

### 9.2 Test File Location

```
src/db/__tests__/rls/finding-assignments-rls.test.ts
src/db/__tests__/rls/native-reviewer-scoped-access-rls.test.ts
```

---

## 10. Open Questions / Decisions for Team

### 10.1 Decisions Needed

| # | Question | Options | Recommendation |
|---|---|---|---|
| D1 | Should native reviewer see ALL files or only files with assigned findings? | A: All files (current plan) / B: Only files with assignments | **A** — file metadata is not sensitive; restricting adds complexity for minimal security gain |
| D2 | Can a finding be assigned to multiple native reviewers? | A: Yes (UNIQUE on finding_id + assigned_to allows it) / B: No (UNIQUE on finding_id only) | **A** — allows reassignment and parallel review by language experts |
| D3 | Should the non_native tag auto-clear when native reviewer confirms? | A: Clear tag / B: Keep tag for audit trail | **B (keep)** — store `native_verified: true` alongside `non_native: true` instead of clearing. Audit trail preservation |
| D4 | How to handle BCP-47 matching edge cases (e.g., `zh-Hans` vs `zh-Hant`)? | A: Exact match / B: Prefix match / C: Language subtag only | **C** — extract primary language subtag (`zh`, `th`, `en`) for comparison. Script/region variants are same-language |
| D5 | Should native reviewer be able to add findings (not just confirm/override)? | A: No (read + action only) / B: Yes (add manual findings on assigned segments) | **A** for MVP — Story 5.2 AC says "confirm or override", not "create". Revisit in Epic 6+ |

### 10.2 Risk Items

| Risk | Impact | Mitigation |
|---|---|---|
| RLS policy migration drops SELECT during deploy window | Users get empty results for ~seconds | Wrap DROP + CREATE in single transaction; deploy during low-traffic window |
| `EXISTS` subquery perf on large finding sets | Slow page load for native reviewers | Indexes + EXPLAIN ANALYZE verification; consider materialized view if > 10K findings |
| JWT `user_role` stale after role change | Native reviewer sees wrong data until token refresh | Existing M3 pattern handles this for writes; for reads, max staleness = JWT TTL (1 hour default) |
| Inngest pipeline uses `service_role` — bypasses all RLS | Not a risk, by design | Document that pipeline correctness depends on app-level code, not RLS |

### 10.3 Future Considerations (Out of Scope for Story 5.2)

- **Bulk assignment:** Assign all findings in a file to a native reviewer (Epic 6+)
- **Assignment workflow:** "Accept assignment" before review starts (currently auto-accepted)
- **Comment editing/deletion:** Only admin can delete; no edit for now (immutability for audit)
- **Notification preferences:** Email/in-app toggle per user (Epic 7+)
- **Native reviewer dashboard:** Aggregated view of all assignments across projects (Epic 8+)

---

## 11. Entity Relationship Diagram (Text)

```
users ──1:N──> finding_assignments (assigned_to)
users ──1:N──> finding_assignments (assigned_by)
users ──1:N──> finding_comments (author_id)

findings ──1:N──> finding_assignments
findings ──1:N──> finding_comments

finding_assignments ──1:N──> finding_comments

[All tables have tenant_id FK to tenants]
```

```
                    ┌──────────────┐
                    │   tenants    │
                    └──────┬───────┘
                           │ tenant_id
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────┴───────┐ ┌─────┴──────┐ ┌───────┴────────┐
   │    users     │ │  findings  │ │    files       │
   │              │ │            │ │                │
   │ native_langs │ │ status     │ │ target_lang    │
   └──┬───┬───────┘ └──┬────────┘ └────────────────┘
      │   │             │
      │   │   ┌─────────┴──────────┐
      │   │   │ finding_assignments │
      │   └──>│ assigned_to        │
      │       │ assigned_by        │
      │       │ flagger_comment    │
      │       │ status             │
      │       └────────┬───────────┘
      │                │
      │   ┌────────────┴────────┐
      └──>│ finding_comments    │
          │ author_id           │
          │ body                │
          └─────────────────────┘
```

---

## 12. Summary

| Item | Count |
|---|---|
| New tables | 2 (`finding_assignments`, `finding_comments`) |
| New RLS policies | 16 (replacing 6 existing + 10 new) |
| Modified RLS policies | 3 tables (`findings`, `segments`, `review_actions`) |
| New indexes | 4 |
| Migrations | 2 (schema + RLS) |
| New Server Actions | 4 |
| New components | 4 |
| Existing code changes | Review actions (add non_native flag), Review page (role-based filtering) |
| Risk level | **Medium** — RLS policy replacement requires careful testing |

---

## 13. Review Findings

### 13.1 Gaps Identified

| # | Gap | Severity | Details |
|---|-----|----------|---------|
| G1 | Missing native-scoped INSERT policy on `review_actions` | **HIGH** | Section 3.6 only adds SELECT policies for native reviewer on `review_actions`. Native reviewers must be able to INSERT review actions (confirm/override) on their assigned findings. Add: `CREATE POLICY "review_actions_insert_native" ON review_actions FOR INSERT TO authenticated WITH CHECK (tenant_id = ... AND user_role = 'native_reviewer' AND EXISTS (SELECT 1 FROM finding_assignments fa WHERE fa.finding_id = review_actions.finding_id AND fa.assigned_to = sub AND fa.tenant_id = ...))` |
| G2 | Missing `tenant_id` in EXISTS subquery of `finding_comments_select_native` | **MEDIUM** | Section 3.5 policy `finding_comments_select_native` checks `fa.assigned_to` but does NOT include `fa.tenant_id` in the EXISTS subquery. This is inconsistent with all other native-scoped policies (e.g., `findings_select_native`, `review_actions_select_native`) which include tenant_id in the EXISTS. Fix: add `AND fa.tenant_id = ((SELECT auth.jwt()) ->> 'tenant_id')::uuid` to the subquery. |
| G3 | Missing index on `findings.segment_id` | **MEDIUM** | The `segments_select_native` policy (Section 3.3) performs `WHERE f.segment_id = segments.id` via JOIN. Without an index on `findings.segment_id`, this becomes a sequential scan on `findings` for every segment row evaluated. Add: `CREATE INDEX idx_findings_segment_id ON findings (segment_id)` to Section 4.1 indexes. |

### 13.2 Migration Notes

| # | Note | Action Required |
|---|------|-----------------|
| N1 | Migration 00023 must use explicit transaction | Migration 00023 (RLS policy replacement) DROPs existing policies then CREATEs new ones. If any CREATE fails mid-migration, the table is left without SELECT policies — all queries return 0 rows. **Wrap the entire migration in explicit `BEGIN; ... COMMIT;`** with a `ROLLBACK` path. Drizzle migrations are NOT auto-transactional for DDL. |
| N2 | Move Realtime enablement from 00023 to 00022 | Section 7.1 places "Enable Realtime on finding_assignments" in migration 00023 (RLS policies). Realtime requires the table to exist — it should be in 00022 (schema creation) immediately after `CREATE TABLE finding_assignments`. This avoids a window where the table exists but Realtime is not enabled. |
| N3 | Remove `updatedAt` from `finding_comments` if immutable | Section 10.3 states "no edit for now (immutability for audit)" for comments. If comments are immutable, the `updatedAt` column in `finding_comments` (Section 2.2) is unnecessary and misleading — it implies mutability. Either: (a) remove `updatedAt` and drop the UPDATE policy, or (b) keep it with a comment explaining future edit capability. Recommendation: remove for now, add back when edit is implemented. |

### 13.3 Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| D1 | Native reviewer file visibility | **A: All files** | File metadata is not sensitive; restricting adds query complexity for minimal security gain. Native reviewer still can only see assigned findings within those files. |
| D2 | Multiple native reviewers per finding | **A: Yes + limit 3** | UNIQUE on `(finding_id, assigned_to)` allows multiple reviewers. Add app-level limit of 3 concurrent assignments per finding to prevent abuse. No schema change needed — enforce in Server Action. |
| D3 | Non-native tag behavior on native confirm | **B: Keep tag for audit trail** | Store `native_verified: true` alongside `non_native: true` instead of clearing. Audit trail preservation is more valuable than cleanup. Tag presence + verified flag tells the full story. |
| D4 | BCP-47 matching strategy | **C: Language subtag only + zh exception** | Extract primary language subtag (`th`, `en`, `ja`) for comparison. Exception: `zh-Hans` vs `zh-Hant` are treated as **different languages** (Simplified vs Traditional Chinese have distinct orthography). Implementation: if primary subtag is `zh`, compare full `language-script` subtag; otherwise compare primary subtag only. |
| D5 | Native reviewer finding creation | **A: No (read + action only)** | Story 5.2 AC scope is "confirm or override", not "create". Adding finding creation expands scope significantly (new form, validation, score recalc). Revisit in Epic 6+. |
