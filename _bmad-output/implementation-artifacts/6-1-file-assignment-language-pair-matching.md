# Story 6.1: File Assignment & Language-Pair Matching

Status: review

## Story

As an Admin or PM,
I want to assign files to specific reviewers filtered by language pair and urgency,
So that work is distributed efficiently to reviewers with the right language expertise.

## Acceptance Criteria

### AC1: ReviewerSelector Component with Language-Pair Filtering & Workload

**Given** an Admin or PM views a batch of uploaded files
**When** they open the file assignment interface
**Then** they see a ReviewerSelector component showing:
- Available reviewers filtered by language pair compatibility (file's target language matches reviewer's `nativeLanguages` JSONB array)
- Each reviewer's current workload = `COUNT(file_assignments WHERE assigned_to = reviewer AND status IN ('assigned', 'in_progress'))`
- An urgency flag toggle (Normal / Urgent) — FR56
**And** language-pair filtering shows only reviewers whose profile includes the file's target language
**And** the reviewer with lowest workload and matching language is auto-suggested (star icon)

### AC2: File Assignment Creation with Notification & Audit

**Given** the Admin assigns a file to a reviewer
**When** the assignment is saved
**Then** `file_assignments` row is created with `status = 'assigned'`, `priority` as selected
**And** the assigned reviewer receives a notification: "File '{filename}' assigned to you" — FR60
**And** the assignment is logged in the immutable audit trail
**And** the Realtime subscription pushes the change to connected clients

### AC3: Urgent File Priority Queue in Inngest

**Given** a file has urgency flag set to 'urgent'
**When** the file appears in the reviewer's queue
**Then** it is displayed at the top with a red "Urgent" badge
**And** urgent files are processed first in the Inngest queue via `priority.run` config expression — FR58
**And** within the same project concurrency key, urgent events execute before normal events

### AC4: Soft Lock Warning & Take Over

**Given** a file is already assigned to a reviewer
**When** another reviewer attempts to open it for review
**Then** a soft lock warning banner displays: "This file is being reviewed by {name} — last active {time}" — FR57
**And** the second reviewer can choose: "View read-only" or "Take over" (with notification to original assignee)
**And** "Take over" uses optimistic locking (`WHERE id = :currentAssignmentId AND status IN ('assigned', 'in_progress')`) — if 0 rows updated, return conflict error
**And** the takeover creates a transaction: `UPDATE old → 'cancelled'` + `INSERT new → 'in_progress'` + `INSERT notification` + `INSERT audit_log`

### AC5: Database Schema Validation

**Given** file assignment data
**When** I inspect the database
**Then** `file_assignments` table contains: id, file_id, project_id, tenant_id, assigned_to, assigned_by, priority (normal/urgent), status (assigned/in_progress/completed/cancelled), assigned_at (createdAt), started_at, completed_at, last_active_at
**And** partial unique index enforces one active assignment per file: `UNIQUE(file_id, tenant_id) WHERE status IN ('assigned', 'in_progress')`
**And** RLS policies enforce tenant isolation + role-based access (admin/qa full, native own-only)
**And** `file_assignments` is published to `supabase_realtime`

### AC6: Heartbeat & Stale Detection

**Given** a reviewer has an active file assignment
**When** they are actively reviewing the file
**Then** a heartbeat updates `last_active_at` every 30 seconds via Server Action
**And** heartbeat pauses when the browser tab is hidden (Visibility API)
**And** if `NOW() - last_active_at > 2 minutes`, the reviewer is shown as "inactive since {time}" in soft lock UI

### AC7: Status Auto-Transition on File Open

**Given** a reviewer is assigned to a file (status = 'assigned')
**When** they open the file for review (not read-only)
**Then** the assignment status transitions to `in_progress` automatically
**And** `startedAt` is set to `NOW()`
**And** the heartbeat begins (AC6)
**And** if the reviewer explicitly releases the file, status returns to `assigned` and `startedAt` is cleared

## Tasks / Subtasks

**Task dependency order:** T1 → T2 → T3 → T4/T5/T6 (parallel) → T7/T8 (parallel) → T9/T10

- [x] Task 1: RLS Policies + Realtime Publication (AC: #5)
  - [x] 1.1 Create migration `src/db/migrations/0022_story_6_1_file_assignments_rls.sql`
  - [x] 1.2 Add RLS policies: `file_assignments_select_admin_qa`, `file_assignments_select_native` (own only), `file_assignments_insert_admin_qa`, `file_assignments_update_admin_qa`, `file_assignments_update_assigned` (own status transitions), `file_assignments_delete_admin`
  - [x] 1.3 Add `file_assignments` to `supabase_realtime` publication (use `DO $$ IF NOT EXISTS $$` pattern)
  - [x] 1.4 Add performance indexes: `idx_file_assignments_project_status` on (project_id, status)

- [x] Task 2: Centralized Notification Helper (AC: #2)
  - [x] 2.1 Create `src/lib/notifications/createNotification.ts` — centralized INSERT helper with tenant scoping, non-blocking try/catch (Guardrail #85). Define notification type constants: `'file_assigned'`, `'file_reassigned'`, `'file_urgent'`, `'assignment_completed'` (4 new types from spike section 7.1)
  - [x] 2.2 Migrate existing inline notification INSERTs to use the helper (scoreFile, flagForNative, confirmNativeReview, overrideNativeReview, addFindingComment)

- [x] Task 3: Zod Schemas + Server Actions (AC: #1, #2, #4, #6, #7)
  - [x] 3.1 Create Zod validation schemas: `assignFileSchema`, `takeOverFileSchema`, `updateAssignmentStatusSchema`, `heartbeatSchema`, `getEligibleReviewersSchema` — in `src/features/project/validation/`
  - [x] 3.2 `src/features/project/actions/assignFile.action.ts` — requireRole(['admin', 'qa_reviewer']), validate with Zod, create assignment, send notification, audit log. Return `ActionResult<FileAssignment>`
  - [x] 3.3 `src/features/project/actions/takeOverFile.action.ts` — optimistic locking, cancel old + insert new in transaction, notify original assignee. Return `ActionResult<FileAssignment>`. Guard `rows[0]!` after RETURNING (Guardrail #3)
  - [x] 3.4 `src/features/project/actions/updateAssignmentStatus.action.ts` — status transitions (assigned→in_progress, in_progress→completed, in_progress→assigned for release). Guard `rows[0]!` after RETURNING (Guardrail #3). Return `ActionResult<FileAssignment>`
  - [x] 3.5 `src/features/project/actions/heartbeat.action.ts` — **lightweight**: JWT claim check only (M3 read pattern, no DB role lookup), UPDATE `last_active_at` only. Return `ActionResult<{ ok: true }>`
  - [x] 3.6 `src/features/project/actions/getEligibleReviewers.action.ts` — LEFT JOIN file_assignments + COUNT FILTER + withTenant() + language pair match. Return `ActionResult<ReviewerOption[]>`

- [x] Task 4: E2E Test Stubs for Review Page Changes — BEFORE implementation (AC: #4, #6, #7) — Guardrail #92
  - [x] 4.1 Created `e2e/file-assignment.spec.ts` — 20 tests (all `test.skip`), covers AC1-AC7, 3 viewports, 3 boundary tests, 2-user multi-context, seed helpers (seedFileAssignment, updateFileAssignment)
  - [x] 4.2 Stubs define the contract — unskip as implementation progresses

- [x] Task 5: UI Components (AC: #1, #4)
  - [x] 5.1 `src/features/project/components/ReviewerSelector.tsx` — shadcn Command (searchable), language badges, workload count, auto-suggest lowest workload
  - [x] 5.2 `src/features/project/components/FileAssignmentDialog.tsx` — Dialog wrapper with ReviewerSelector + priority radio + notes textarea + Cancel/Assign buttons. Single-file assignment only (bulk assignment deferred — see Dev Notes)
  - [x] 5.3 `src/features/review/components/SoftLockBanner.tsx` — AlertTriangle warning banner with "View Read-Only" / "Take Over (notify {name})" buttons, `role="alert"` + `aria-live="polite"`
  - [x] 5.4 `src/components/ui/UrgentBadge.tsx` — reusable red "Urgent" badge component

- [x] Task 6: Hooks (AC: #4, #6, #7)
  - [x] 6.1 `src/features/review/hooks/use-file-presence.ts` — 30s heartbeat via setInterval, pause on `document.visibilityState === 'hidden'`, resume on focus
  - [x] 6.2 `src/features/review/hooks/use-soft-lock.ts` — check current assignment on file open, return lock state (locked/unlocked/stale). Auto-call `updateAssignmentStatus` (assigned→in_progress) when assigned reviewer opens file
  - [x] 6.3 `src/features/project/hooks/use-file-assignment-subscription.ts` — Realtime subscription for file_assignments changes

- [x] Task 7: Inngest Priority Queue (AC: #3)
  - [x] 7.1 Add `priority` field to `PipelineFileEventData` and `PipelineBatchEventData` types (default: 'normal')
  - [x] 7.2 Add `priority: { run: "event.data.priority == 'urgent' ? 100 : 0" }` to processFile Inngest function config
  - [x] 7.3 Pass `priority` from file assignment to pipeline event in `processBatch`

- [x] Task 8: Integration into Review Page (AC: #4, #6, #7)
  - [x] 8.1 Add SoftLockBanner + SoftLockWrapper to review page layout — show when file has active assignment by another user
  - [x] 8.2 Integrate useFilePresence hook — start heartbeat when file is opened by assigned reviewer
  - [x] 8.3 Read-only mode — persistent banner when viewing read-only
  - [x] 8.4 Auto-transition: when assigned reviewer opens file, trigger assigned→in_progress via useSoftLock hook

- [x] Task 9: File List Assignment UI (AC: #1, #2)
  - [x] 9.1 Add FileAssignmentCell with "Assign" button to file list rows
  - [x] 9.2 Show assignment status badge on file rows (assigned to {name}, unassigned)
  - [x] 9.3 Urgent files shown with UrgentBadge

- [x] Task 10: Unit + RLS Tests (AC: #5, #6)
  - [x] 10.1 RLS tests: `src/db/__tests__/rls/fileAssignments.rls.test.ts` — cross-tenant isolation, native_reviewer sees own only, admin/qa full access
  - [x] 10.2 Unit tests for assignFile and heartbeat Server Actions
  - [x] 10.3 Unit tests for createNotification helper (6 tests)
  - [x] 10.4 Boundary value tests for stale threshold: at 119s (active), 120s (boundary), 121s (stale) — 7 tests in use-soft-lock.test.ts

- [x] Task 11: E2E Tests — unskip stubs + add remaining scenarios (AC: all)
  - [x] 11.1 Unskip all 20 `test.skip(true, ...)` stubs in `e2e/file-assignment.spec.ts`
  - [x] 11.2 Assign file to reviewer, verify notification, verify audit (tests ready)
  - [x] 11.3 Soft lock: open file as different user, verify warning banner, take over flow (tests ready)
  - [x] 11.4 Priority: assign urgent file, verify badge display, verify queue ordering (tests ready)
  - [x] 11.5 Read-only mode: verify action buttons disabled, keyboard shortcuts suppressed (tests ready)
  - [x] 11.6 Auto-transition: assigned reviewer opens file → status becomes in_progress (tests ready)

## Dev Notes

### Critical: What Already Exists (DO NOT Recreate)

The **schema, types, and indexes** for `file_assignments` already exist from Epic 5 prep sprint:

- **Schema:** `src/db/schema/fileAssignments.ts` — all columns already defined (id, fileId, projectId, tenantId, assignedTo, assignedBy, status, priority, notes, startedAt, completedAt, lastActiveAt, createdAt, updatedAt)
- **Types:** `src/types/assignment.ts` — `FILE_ASSIGNMENT_STATUSES = ['assigned', 'in_progress', 'completed', 'cancelled']`, `FILE_ASSIGNMENT_PRIORITIES = ['normal', 'urgent']`, both with derived union types
- **Indexes:** Partial unique on (fileId, tenantId) WHERE status IN ('assigned', 'in_progress'), index on (assignedTo, status), index on (fileId, tenantId)
- **Relations:** `src/db/schema/relations.ts` lines 277-297 — file, project, tenant, assignedToUser, assignedByUser

**What's MISSING (must create):**
1. RLS policies for `file_assignments` (currently no RLS at all)
2. Realtime publication for `file_assignments`
3. Centralized notification helper
4. All Server Actions for assignment workflow
5. All UI components (ReviewerSelector, FileAssignmentDialog, SoftLockBanner)
6. All hooks (useFilePresence, useSoftLock, useFileAssignmentSubscription)
7. Inngest priority config
8. Review page integration (soft lock banner, read-only mode)
9. File list assignment UI

### Notifications Table Already Exists

`src/db/schema/notifications.ts` has all needed columns:
- id, tenantId, userId, type, title, body, isRead, metadata (JSONB), **projectId** (FK), **archivedAt** (nullable), createdAt
- RLS policies exist (migration 0021): user-scoped SELECT/UPDATE
- Published to `supabase_realtime` (migration 0020)
- Partial indexes on unread + archive queries

**Current inline INSERT sites to migrate:** scoreFile, flagForNative, confirmNativeReview, overrideNativeReview, addFindingComment — all must use the new centralized helper (Guardrail #85).

**New notification types for this story** (per spike section 7.1):

| Type Constant | Recipient | Message Template |
|---------------|-----------|-----------------|
| `file_assigned` | Assigned reviewer | "File '{filename}' assigned to you" |
| `file_reassigned` | Original reviewer | "{name} took over file '{filename}'" |
| `file_urgent` | Assigned reviewer | "File '{filename}' marked as urgent" |
| `assignment_completed` | Admin who assigned | "{reviewer} completed review of '{filename}'" |

### Auth Infrastructure

- `requireRole()` at `src/lib/auth/requireRole.ts` — M3 pattern, returns `{ userId, tenantId, role, nativeLanguages }`
- `getCurrentUser()` at `src/lib/auth/getCurrentUser.ts` — includes `nativeLanguages: string[]` (BCP-47 array)
- `users.nativeLanguages` column exists as JSONB string array
- Role hierarchy: admin > qa_reviewer > native_reviewer

### Language-Pair Matching Logic

- File's target language: from `projects.targetLangs` JSONB array (per-file override possible via segment-level `targetLang`)
- Reviewer's languages: from `users.nativeLanguages` JSONB array (BCP-47 codes)
- Match: use `@>` JSONB containment operator in SQL: `u.native_languages @> :targetLangJsonb`
- Sort eligible reviewers by workload ASC (LEFT JOIN + COUNT FILTER pattern per Guardrail #83)

### Soft Lock Design Decisions

- **DB `last_active_at` column** (NOT Supabase Presence) — simpler for 6-9 concurrent users (NFR20)
- **30-second heartbeat** via Server Action — pause when tab hidden (Visibility API)
- **2-minute stale threshold** — after 2 min without heartbeat, show "inactive since {time}"
- **Optimistic locking** on takeover — check `WHERE id = :currentAssignmentId AND status IN ('assigned', 'in_progress')`, 0 rows = conflict
- **Transaction for takeover:** UPDATE old→cancelled + INSERT new→in_progress + INSERT notification + INSERT audit_log

### Inngest Priority Integration

- Current config: `concurrency: [{ key: 'event.data.projectId', limit: 1 }]` — serializes per project
- Add: `priority: { run: "event.data.priority == 'urgent' ? 100 : 0" }` — urgent events jump queue
- Add `priority` to event data types — backward compatible (default: 'normal')
- Urgent events wait for current processing to finish, then run next (no interruption)

### Read-Only Mode Rules

- Disable all finding action buttons (Accept/Reject/Flag/Add/Delete)
- Suppress keyboard shortcuts: A/R/F/N/S/+/-/J/K/C/O (use same suppression pattern as modal — Guardrail #17)
- Show persistent banner: "Read-only mode — assigned to {name}"
- Navigation, viewing details, back-translations still work
- No heartbeat sent (does not affect soft lock timestamp)

### Scope Boundaries

**IN scope:** Single-file assignment via FileAssignmentDialog, soft lock, takeover, heartbeat, priority queue, read-only mode, notifications, RLS, Realtime, E2E.

**OUT of scope (deferred):** Bulk assignment (`BulkAssignDialog` — select multiple files, assign all to one reviewer). The spike section 2.5 designs this, but it adds significant complexity. Defer to a follow-up story or Epic 7. Task 9 file list UI shows per-file "Assign" button only.

### Server Action Pattern Requirements

All Server Actions MUST:
1. Return `ActionResult<T>` (never plain return)
2. Validate input with Zod schema (schemas in `src/features/project/validation/`)
3. Call `requireRole()` for authorization (except heartbeat — JWT claim check only)
4. Call `withTenant()` on every query
5. Guard `rows[0]!` after `.returning()` — `if (rows.length === 0) throw` before access (Guardrail #3)
6. Write to audit log on state changes (non-fatal in error paths per Guardrail #2)

**Heartbeat performance note:** This action fires every 30 seconds from every active reviewer. It MUST be lightweight — use JWT claim check only (M3 read pattern), no DB role lookup via `requireRole()`. Single UPDATE statement, no audit log, no notification.

### Guardrails to Follow

| # | Guardrail | Where It Applies |
|---|-----------|------------------|
| #1 | `withTenant()` on EVERY query | All server actions, workload query |
| #2 | Audit log non-fatal in error paths | takeOverFile transaction audit |
| #3 | Guard `rows[0]!` after RETURNING | assignFile, takeOverFile, updateAssignmentStatus |
| #5 | DELETE + INSERT = transaction | takeOverFile: cancel old + insert new |
| #8 | DB constraint → audit all INSERT/UPDATE | partial unique index enforcement |
| #17 | Keyboard shortcut suppression | Read-only mode shortcut suppression |
| #79 | Union type for status/priority | FileAssignmentStatus, FileAssignmentPriority |
| #80 | Soft lock via DB, not Presence | last_active_at + heartbeat pattern |
| #81 | Optimistic locking on takeover | WHERE id AND status check |
| #82 | One active assignment per file | Partial unique index |
| #83 | LEFT JOIN + COUNT FILTER for workload | getEligibleReviewers query |
| #84 | Inngest priority config | process-file-pipeline priority.run |
| #85 | Centralized notification helper | createNotification.ts |
| #89 | Notification RLS required | Already exists (migration 0021) |
| #91 | useViewportTransition for responsive | SoftLockBanner responsive behavior |
| #92 | Responsive E2E test-first | Task 4 writes stubs BEFORE Tasks 5-9 |
| #93 | result.output try/catch only | No AI calls in this story (N/A) |
| #94 | Metadata merge never replace | assignment metadata operations |

### Project Structure Notes

All new files follow existing co-location patterns:
- Server Actions: `src/features/project/actions/{verb}.action.ts`
- Components: `src/features/project/components/` (assignment UI) + `src/features/review/components/` (soft lock)
- Hooks: `src/features/review/hooks/` (file presence, soft lock) + `src/features/project/hooks/` (assignment subscription)
- Shared: `src/components/ui/UrgentBadge.tsx`, `src/lib/notifications/createNotification.ts`
- RLS Tests: `src/db/__tests__/rls/fileAssignments.rls.test.ts`
- E2E: `e2e/file-assignment.spec.ts`
- Migration: `src/db/migrations/XXXX_story_6_1_file_assignments_rls.sql`

### Previous Story Intelligence (Epic 5.3 Verification)

Key patterns from Story 5.3 that apply:
- **RLS migration pattern:** Use atomic `DROP POLICY IF EXISTS + CREATE POLICY` (not `CREATE OR REPLACE` which doesn't exist for policies). Follow `src/db/migrations/00026_story_5_2b_rls_scoped_access.sql` template
- **JWT claims pattern:** `((SELECT auth.jwt()) ->> 'tenant_id')::uuid` + `((SELECT auth.jwt()) ->> 'user_role')` + `((SELECT auth.jwt()) ->> 'sub')::uuid`
- **Realtime publication:** Wrap in `DO $$ IF NOT EXISTS $$` (ALTER PUBLICATION not idempotent)
- **E2E auth pattern:** `signupOrLogin` creates NEW tenant — use `moveUserToTenant()` for multi-user tests
- **E2E viewport:** Set viewport BEFORE navigate, wait `[data-layout-mode="desktop"]`
- **E2E dotenv:** Always `INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test`

### References

- [Source: epics/epic-6-batch-processing-team-collaboration.md — Story 6.1 AC]
- [Source: prd.md — FR56, FR57, FR58, FR60]
- [Source: CLAUDE-guardrails-epic6.md — Guardrails #79-94]
- [Source: research/file-assignment-ux-spike-2026-03-30.md — Full technical design]
- [Source: research/notification-spike-2026-03-30.md — Notification architecture]
- [Source: architecture/implementation-patterns-consistency-rules.md — Naming, ActionResult pattern]
- [Source: architecture/project-structure-boundaries.md — File organization]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Zod UUID validation failure in unit tests — test IDs must be valid UUIDs, not plain strings
- React Compiler purity errors: Date.now() forbidden in render, setState forbidden in useEffect, ref writes forbidden in render — resolved with interval-based stale check and render-time adjustment pattern

### Completion Notes List
- T1: RLS migration `0022_story_6_1_file_assignments_rls.sql` — 6 role-based policies (DROP old + CREATE new), Realtime publication, performance index
- T2: `createNotification` + `createBulkNotification` centralized helpers with 8 notification type constants. Migrated 5 inline INSERT sites (scoreFile, flagForNative, confirmNativeReview, overrideNativeReview, addFindingComment)
- T3: 5 Zod schemas + 6 Server Actions (assignFile, takeOverFile, updateAssignmentStatus, heartbeat, getEligibleReviewers, getFileAssignment)
- T5: 4 UI components (ReviewerSelector, FileAssignmentDialog, SoftLockBanner, UrgentBadge)
- T6: 3 hooks (useFilePresence, useSoftLock, useFileAssignmentSubscription)
- T7: `priority` field added to PipelineFileEventData + PipelineBatchEventData, `priority.run` config on processFile, priority forwarded in processBatch fan-out
- T8: SoftLockWrapper integration into review page via page.tsx RSC fetch + client wrapper
- T9: FileAssignmentCell component with Assign button + badge + UrgentBadge, integrated into FileHistoryTable
- T10: 16 unit tests (assignFile 5, heartbeat 5, createNotification 6) + 7 boundary tests (useSoftLock) + RLS test file (10 tests, requires Supabase)
- T11: Unskipped all 20 E2E test stubs in file-assignment.spec.ts

### Change Log
- 2026-03-31: Story 6.1 implementation complete — all 11 tasks done
- 2026-03-31: Bug fix round — 2 Critical + 8 Important bugs fixed:
  - C-1: Moved audit+notification outside db.transaction() in takeOverFile (Guardrail #2, #5)
  - C-2: Added ownership check in updateAssignmentStatus (security)
  - I-1: Fire-and-forget notifications in assignFile (Guardrail #85)
  - I-2: Heartbeat enabled for both assigned+in_progress own assignment
  - I-3: isAutoSuggested only when workload strictly lower (non-deterministic fix)
  - I-4: Added toast.error on takeover failure (UX)
  - I-5: Stale state no longer blocks read-only (allows takeover)
  - I-6: null lastActiveAt + assigned status = stale (prevents permanent lock)
  - I-7: ORDER BY + keep-first in getFileHistory Query 4
  - I-8: RLS WITH CHECK tightened — reviewer cannot set status back to 'assigned'
- 2026-03-31: E2E debugging — 12 root causes found and fixed (testid alignment, hydration waits, data flow gaps, read-only context, keyboard suppression, separate files per test group)

### File List
- `src/db/migrations/0022_story_6_1_file_assignments_rls.sql` (new)
- `src/lib/notifications/createNotification.ts` (new)
- `src/lib/notifications/createNotification.test.ts` (new)
- `src/features/project/validation/fileAssignmentSchemas.ts` (new)
- `src/features/project/actions/assignFile.action.ts` (new)
- `src/features/project/actions/assignFile.action.test.ts` (new)
- `src/features/project/actions/takeOverFile.action.ts` (new)
- `src/features/project/actions/updateAssignmentStatus.action.ts` (new)
- `src/features/project/actions/heartbeat.action.ts` (new)
- `src/features/project/actions/heartbeat.action.test.ts` (new)
- `src/features/project/actions/getEligibleReviewers.action.ts` (new)
- `src/features/project/actions/getFileAssignment.action.ts` (new)
- `src/features/project/components/ReviewerSelector.tsx` (new)
- `src/features/project/components/FileAssignmentDialog.tsx` (new)
- `src/features/project/components/FileAssignmentCell.tsx` (new)
- `src/features/project/hooks/use-file-assignment-subscription.ts` (new)
- `src/features/review/components/SoftLockBanner.tsx` (new)
- `src/features/review/components/SoftLockWrapper.tsx` (new)
- `src/features/review/hooks/use-file-presence.ts` (new)
- `src/features/review/hooks/use-soft-lock.ts` (new)
- `src/features/review/hooks/use-soft-lock.test.ts` (new)
- `src/components/ui/UrgentBadge.tsx` (new)
- `src/db/__tests__/rls/fileAssignments.rls.test.ts` (new)
- `e2e/file-assignment.spec.ts` (modified — unskipped 20 stubs)
- `src/app/(app)/projects/[projectId]/review/[fileId]/page.tsx` (modified — SoftLockWrapper integration)
- `src/features/batch/components/FileHistoryTable.tsx` (modified — Assignment column)
- `src/features/review/actions/flagForNative.action.ts` (modified — centralized notification)
- `src/features/review/actions/confirmNativeReview.action.ts` (modified — centralized notification)
- `src/features/review/actions/overrideNativeReview.action.ts` (modified — centralized notification)
- `src/features/review/actions/addFindingComment.action.ts` (modified — centralized notification)
- `src/features/scoring/helpers/scoreFile.ts` (modified — centralized notification)
- `src/features/pipeline/inngest/processFile.ts` (modified — priority.run config)
- `src/features/pipeline/inngest/processBatch.ts` (modified — priority forwarding)
- `src/types/pipeline.ts` (modified — priority field on event data types)
- `src/features/pipeline/inngest/processBatch.payload.test.ts` (modified — added 'priority' to required keys)
- `src/features/review/hooks/use-read-only-mode.ts` (new — ReadOnlyContext for review page)
- `src/features/review/hooks/use-keyboard-actions.ts` (modified — readOnlyRef suppression)
- `src/features/review/components/ReviewPageClient.tsx` (modified — isReadOnly integration)
- `src/features/batch/components/FileHistoryPageClient.tsx` (modified — targetLanguage + assignment data)
- `src/features/batch/actions/getFileHistory.action.ts` (modified — Query 4 file_assignments JOIN)
- `src/app/(app)/projects/[projectId]/files/page.tsx` (modified — targetLanguage from project)
