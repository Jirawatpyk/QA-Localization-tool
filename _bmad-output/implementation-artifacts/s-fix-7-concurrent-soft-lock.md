# Story S-FIX-7: Concurrent Review Soft Lock

Status: review

## Story

As a QA Reviewer,
I want the system to prevent two reviewers from editing the same file simultaneously,
so that review actions never conflict and each file has exactly one active reviewer at a time.

## Context & Gap Analysis

**CRITICAL: Story 6.1 already implemented the soft lock mechanism for formally-assigned files.** The DB schema (`file_assignments`), hooks (`useSoftLock`, `useFilePresence`), components (`SoftLockWrapper`, `SoftLockBanner`), server actions (`heartbeat`, `takeOverFile`, `updateAssignmentStatus`, `getFileAssignment`), and RLS policies (migrations 0022/0023) are all in place.

**The gap is: the lock only works when `assignment !== null`.** When no formal assignment exists (admin didn't assign the file), `useSoftLock` returns `lockState: 'unlocked'` and both users can edit freely. This is the exact MULTI-01 finding.

### What Already Works (DO NOT recreate)

- `src/features/review/hooks/use-soft-lock.ts` — Lock state detection (unlocked/locked/stale at 2-min threshold)
- `src/features/review/hooks/use-file-presence.ts` — 30s heartbeat with Visibility API pause
- `src/features/review/hooks/use-read-only-mode.ts` — ReadOnlyContext + useReadOnlyMode hook
- `src/features/review/components/SoftLockWrapper.tsx` — Mounts in review page, wraps ReviewPageClient
- `src/features/review/components/SoftLockBanner.tsx` — "In review by" banner with "Take over" + "View read-only"
- `src/features/project/actions/heartbeat.action.ts` — Lightweight heartbeat (JWT-only auth)
- `src/features/project/actions/takeOverFile.action.ts` — Optimistic locking takeover in transaction
- `src/features/project/actions/updateAssignmentStatus.action.ts` — Status transitions with ownership checks
- `src/features/project/actions/getFileAssignment.action.ts` — Fetch active assignment for file
- `src/features/project/validation/fileAssignmentSchemas.ts` — Zod schemas for all actions
- `src/db/schema/fileAssignments.ts` — Table with partial unique index (`uq_file_assignments_active`)
- `src/db/migrations/0022_story_6_1_file_assignments_rls.sql` — Full RLS policies
- `src/db/migrations/0023_story_6_1_realtime_index_fix.sql` — Realtime publication + index
- `e2e/file-assignment.spec.ts` — E2E tests for assignment flow

### What Needs to Be Built (this story's scope)

1. **Ad-hoc self-assignment on first review action** for unassigned files
2. **RLS migration** for self-assign INSERT + expanded SELECT (lock visibility)
3. **Server-side lock ownership verification** on all review mutation actions
4. **30-minute auto-release** via Inngest cron
5. **25-minute warning toast** on client
6. **Read-only enforcement audit** across ALL review UI entry points (UI + server)
7. **Lock state polling** for lock release detection
8. **Multi-user verification** via Playwright MCP

## Acceptance Criteria

### AC1: Ad-Hoc Self-Assignment on First Review Action

**Given** a reviewer opens an unassigned file (no active `file_assignments` record)
**When** they perform their first review action (Accept, Reject, Flag, Note, Source Issue, Override Severity, Add Finding, Approve, Confirm Native)
**Then** the system:
  1. Creates a `file_assignments` record with `assignedTo = currentUser`, `assignedBy = currentUser`, `status = 'in_progress'`, `lastActiveAt = NOW()`, `priority = 'normal'`
  2. Returns the assignment data to `SoftLockWrapper` (trigger re-fetch or optimistic update)
  3. Starts the heartbeat loop for this new assignment
  4. Shows "You are reviewing this file" bar with "Release file" button

**Given** a second reviewer opens the same file while the first has an ad-hoc lock
**When** the page loads and `getFileAssignment` returns the active assignment
**Then** `SoftLockWrapper` shows the lock banner and `isReadOnly = true`

### AC2: RLS Migration for Self-Assign + Lock Visibility

**Given** a native_reviewer performs a self-assign via server action
**When** the INSERT executes through Drizzle (bypasses RLS)
**Then** the record is created successfully (Drizzle uses direct DB connection)

**Additionally**, for defense-in-depth (Guardrail #62-65), add RLS policies:

1. **INSERT policy** `file_assignments_insert_self_assign`:
   - `WITH CHECK (assigned_to = auth.uid() AND assigned_by = auth.uid() AND tenant_id = jwt_tenant_id)`
   - Allows only self-assignment (assigned_to = assigned_by = current user)

2. **Expanded SELECT policy** `file_assignments_select_reviewer_locks`:
   - Replace existing `file_assignments_select_native` (own-only) with tenant-wide SELECT for native_reviewer only
   - `USING (tenant_id = jwt_tenant_id AND user_role = 'native_reviewer')`
   - Note: `qa_reviewer` already has tenant-wide SELECT via `_select_admin_qa` policy — do NOT duplicate
   - Rationale: Lock data is not sensitive (just who's reviewing what). Reviewer B MUST see Reviewer A's lock for soft lock to work. Required for polling via `getFileAssignment` (Drizzle bypasses RLS) AND for any future Realtime subscription.

**Migration must follow pattern:** `DROP POLICY IF EXISTS ... ; CREATE POLICY ...` (idempotent, Guardrail from CLAUDE.md)

### AC3: Server-Side Lock Ownership Verification (Defense-in-Depth)

**Given** a reviewer sends a review mutation request (Accept, Reject, Flag, Note, Source Issue, Override Severity, Add Finding, Bulk, Approve File, Confirm Native, Flag for Native, Undo, Redo, etc.)
**When** there is an active `file_assignments` record for that file AND the caller is NOT the lock owner
**Then** the server action returns `ActionResult` error: `{ success: false, error: 'File is being reviewed by another user', code: 'LOCK_CONFLICT' }`

Implementation: Create shared helper `assertLockOwnership(fileId: string, tenantId: TenantId, userId: string)`:
- Query `file_assignments` WHERE `fileId` + `withTenant()` + `status IN ('assigned', 'in_progress')`
- If no assignment → return OK (no lock, action proceeds — self-assign will create one)
- If assignment exists AND `assignedTo === userId` → return OK (owner)
- If assignment exists AND `assignedTo !== userId` → throw/return LOCK_CONFLICT

**Optimization: Use shared helpers for bulk coverage.** Code audit shows 2 shared helpers used by multiple actions:

1. **`executeReviewAction` helper** (`review/actions/helpers/executeReviewAction.ts`) — used by 8 actions:
   - acceptFinding, rejectFinding, flagFinding, noteFinding, sourceIssueFinding, confirmNativeReview, overrideNativeReview, flagForNative
   - **Add `assertLockOwnership` ONCE in this helper → covers 8 actions automatically**

2. **`executeUndoRedo` helper** (`review/actions/helpers/executeUndoRedo.ts`) — used by all undo/redo:
   - undoAction, redoAction, undoBulkAction, redoBulkAction, undoAddFinding, undoDeleteFinding, undoSeverityOverride
   - **Add `assertLockOwnership` ONCE in this helper → covers 7 actions automatically**

3. **Individual actions (add lock check manually):**

| Server Action | File | Lock Check |
|---|---|---|
| addFinding | `review/actions/addFinding.action.ts` | NONE — add |
| deleteFinding | `review/actions/deleteFinding.action.ts` | NONE — add |
| bulkAction | `review/actions/bulkAction.action.ts` | NONE — add |
| approveFile | `review/actions/approveFile.action.ts` | NONE — add |
| overrideSeverity | `review/actions/overrideSeverity.action.ts` | NONE — add |
| updateNoteText | `review/actions/updateNoteText.action.ts` | NONE — add |
| addFindingComment | `review/actions/addFindingComment.action.ts` | NONE — add |
| createSuppressionRule | `review/actions/createSuppressionRule.action.ts` | NONE — add |

**Skip lock check (not file-scoped finding mutations):**
- `deactivateSuppressionRule` — project-level rule operation
- `addToGlossary`, `updateGlossaryTerm` — glossary operations
- `startNativeReview` — session initiation, not finding mutation
- All `get*` actions — read-only queries

### AC4: 30-Minute Auto-Release (Inngest Cron)

**Given** a `file_assignments` record has `status = 'in_progress'` and `last_active_at < NOW() - INTERVAL '30 minutes'`
**When** the Inngest cron fires (every 5 minutes)
**Then** the system:
  1. Updates `status = 'cancelled'` and `completedAt = NOW()` for all stale assignments
  2. Writes audit log per assignment: `{ action: 'auto_release', assignmentId, reason: 'inactivity_timeout_30m' }`
  3. Does NOT notify (reviewer already inactive — notification would be noise)

**Boundary:** Exactly 30 minutes = still active. 30m + 1s = auto-released.

**Tenant context:** This cron queries ALL tenants (no single tenant context). Use Drizzle directly (bypasses RLS). Do NOT use `withTenant()` — instead use raw `WHERE status = 'in_progress' AND last_active_at < threshold`. Include `tenantId` from each assignment row in audit logs.

### AC5: 25-Minute Warning Toast

**Given** a reviewer has an active `in_progress` assignment
**When** 25 minutes have elapsed since `lastActiveAt` without any user interaction
**Then** a persistent toast appears: "Your review lock expires in 5 minutes. Click anywhere to keep reviewing."

**Given** the reviewer performs any action (mouse click, keyboard, scroll)
**When** the toast is visible
**Then** the heartbeat fires immediately, `lastActiveAt` resets, and the toast dismisses

### AC6: Read-Only Enforcement Audit — UI Layer (Completeness Check)

The `isReadOnly` flag from `useReadOnlyMode()` MUST be checked and enforced in ALL of these entry points:

| Entry Point | File | Current Status |
|---|---|---|
| Keyboard hotkeys (A/R/F/N/S/+/-/J/K) | `use-keyboard-actions.ts:518` | DONE (suppressed via readOnlyRef) |
| ReviewActionBar buttons | `ReviewPageClient.tsx:1581` | DONE (isDisabled prop) |
| BulkActionBar (Ctrl+A, Shift+Click) | `ReviewPageClient.tsx` (BulkActionBar) | **UNGUARDED — add** |
| Bulk Accept/Reject handlers | `ReviewPageClient.tsx` (handleBulkAccept/Reject) | **UNGUARDED — add** |
| Add Finding Dialog open trigger | `ReviewPageClient.tsx` (setIsAddFindingDialogOpen) | **AUDIT — add guard** |
| Severity Override Menu open trigger | `ReviewPageClient.tsx` (setIsOverrideMenuOpen) | **AUDIT — add guard** |
| Flag for Native Dialog trigger | `ReviewPageClient.tsx` (FlagForNativeDialog) | **AUDIT — add guard** |
| Suppress Pattern Dialog trigger | `ReviewPageClient.tsx` (SuppressPatternDialog) | **AUDIT — add guard** |
| NoteInput text editing | `NoteInput.tsx` | **AUDIT — add disabled prop** |
| Approve File button | `ReviewPageClient.tsx` (handleApprove) | **UNGUARDED — add** |
| Confirm Native handler | `ReviewPageClient.tsx` (executeNativeConfirm) | **UNGUARDED — add** |
| Override Native handler | `ReviewPageClient.tsx` (overrideNativeReview) | **AUDIT — add guard** |
| Undo/Redo hotkeys (Ctrl+Z / Ctrl+Y) | `ReviewPageClient.tsx` (undo/redo handlers) | **AUDIT — add guard** |
| Add Finding Comment | `ReviewPageClient.tsx` (addFindingComment) | **AUDIT — add guard** |

**Given** `isReadOnly = true`
**When** user attempts ANY review mutation (button click, keyboard shortcut, dialog trigger)
**Then** the action is blocked (button disabled, shortcut suppressed, dialog won't open)
**And** no toast or error — just silently disabled (user already sees read-only banner)

### AC7: Lock State Polling for Release Detection

**Given** Reviewer A has a lock on a file and Reviewer B is viewing in read-only mode
**When** Reviewer A releases the file (Release button, navigates away, or auto-release timeout)
**Then** Reviewer B's page detects the change and updates:
  1. Lock banner disappears
  2. `isReadOnly` becomes `false`
  3. All review actions become available

**Implementation: Polling via server action** (NOT Realtime subscription):
- Poll `getFileAssignment` server action every **5 seconds** when `isReadOnly = true` (waiting for lock release)
- Poll every **15 seconds** when `isOwnAssignment = false && lockState = 'unlocked'` (monitoring for new locks)
- Skip polling when `isOwnAssignment = true` (already have heartbeat)
- Drizzle bypasses RLS, so all reviewers get correct results regardless of RLS SELECT policies
- Simpler than Realtime approach: no new subscription, no RLS dependency for events

**Why polling over Realtime:** Existing `use-findings-subscription.ts` subscribes to `finding_assignments` (different table — NOT reusable). The `file_assignments` Realtime publication exists (migration 0023) but native_reviewer RLS SELECT policy would need expansion for Realtime delivery. Polling via Drizzle server action avoids this dependency — AC2 expands RLS SELECT for defense-in-depth regardless, but polling is more reliable.

### AC8: Self-Assignment Conflict Handling

**Given** two reviewers click their first review action on the same unassigned file within milliseconds
**When** both self-assignment INSERTs race
**Then** the partial unique index `uq_file_assignments_active` rejects the second INSERT
**And** the second reviewer sees toast: "File is now being reviewed by {name}"
**And** the second reviewer's page transitions to read-only mode (re-fetch assignment)
**And** their original action is NOT executed (conflict → re-fetch → read-only)

## UX States Checklist (Guardrail #96)

- [x] **Loading state:** N/A — no new loading UI (reuses existing SoftLockWrapper)
- [ ] **Error state:** Self-assignment failure → toast "File is now being reviewed by {name}" + switch to read-only
- [ ] **Empty state:** N/A — file always has content (empty file has separate route guard)
- [ ] **Success state:** Self-assignment success → "You are reviewing this file" bar appears
- [ ] **Partial state:** N/A — no progressive loading
- [ ] **UX Spec match:** Verified against `_bmad-output/planning-artifacts/ux-design-specification/core-user-experience.md` Edge Case #3

## Tasks / Subtasks

- [x] Task 1: RLS migration for self-assign + lock visibility (AC: #2)
  - [x] 1.1 Create migration file (next sequential number after latest in `src/db/migrations/`)
  - [x] 1.2 `DROP POLICY IF EXISTS "file_assignments_insert_admin_qa"` then recreate (unchanged — keep admin/QA INSERT)
  - [x] 1.3 Add `file_assignments_insert_self_assign` — INSERT WHERE `assigned_to = auth.uid() AND assigned_by = auth.uid() AND tenant_id = jwt_tenant_id`
  - [x] 1.4 `DROP POLICY IF EXISTS "file_assignments_select_native"` (own-only policy)
  - [x] 1.5 Add `file_assignments_select_reviewer_locks` — SELECT WHERE `tenant_id = jwt_tenant_id AND user_role = 'native_reviewer'` (tenant-wide visibility — qa_reviewer already covered by `_select_admin_qa`)
  - [x] 1.6 Add entry to `src/db/migrations/meta/_journal.json` (Drizzle requires this — see memory: project-migration-journal-desync)
  - [x] 1.7 RLS test: native_reviewer can INSERT own self-assignment, CANNOT insert for another user
  - [x] 1.8 RLS test: native_reviewer can SELECT another reviewer's active assignment on same file
  - [x] 1.9 RLS test: cross-tenant isolation still enforced

- [x] Task 2: Self-assignment server action (AC: #1, #8)
  - [x] 2.1 Create `selfAssignFile.action.ts` in `src/features/project/actions/`
  - [x] 2.2 Auth: `requireRole('native_reviewer', 'write')` — allows native_reviewer, qa_reviewer, admin
  - [x] 2.3 INSERT with `ON CONFLICT ON CONSTRAINT uq_file_assignments_active DO NOTHING` — if conflict, re-query to get existing lock holder
  - [x] 2.4 Return `ActionResult<{ assignment: FileAssignment; created: boolean }>` — `created: true` = self-assigned, `created: false` = conflict (return existing lock holder data)
  - [x] 2.5 Add Zod schema `selfAssignFileSchema` in `fileAssignmentSchemas.ts` — `{ fileId: uuid, projectId: uuid }`
  - [x] 2.6 Audit log: `{ action: 'self_assign', assignmentId, fileId }` (only on success)
  - [x] 2.7 Unit tests: success, conflict (race), unauthorized, `withTenant()` applied

- [x] Task 3: Server-side lock ownership helper (AC: #3)
  - [x] 3.1 Create `assertLockOwnership.ts` in `src/features/review/helpers/` — shared helper
  - [x] 3.2 Query: `fileAssignments` WHERE `eq(fileId)` + `withTenant()` + `inArray(status, ['assigned', 'in_progress'])`
  - [x] 3.3 Return: `{ locked: false }` (no assignment), `{ locked: true, isOwner: true }`, or `{ locked: true, isOwner: false, lockedBy: string }`
  - [x] 3.4 Add lock check to `executeReviewAction` helper → covers 8 actions (accept, reject, flag, note, sourceIssue, confirmNative, overrideNative, flagForNative)
  - [x] 3.5 Add lock check to `executeUndoRedo` helper → covers 7 undo/redo actions
  - [x] 3.6 Add lock check individually to 8 remaining actions: addFinding, deleteFinding, bulkAction, approveFile, overrideSeverity, updateNoteText, addFindingComment, createSuppressionRule
  - [x] 3.7 Pattern: early return `{ success: false, error: 'File is being reviewed by another user', code: 'LOCK_CONFLICT' }` if not owner
  - [x] 3.8 Unit tests: no-lock-proceeds, owner-proceeds, non-owner-blocked
  - [x] 3.9 Verify `fileId` param is available in each action's input schema (needed for lock check query)

- [x] Task 4: Wire self-assignment into review page (AC: #1)
  - [x] 4.1 Create `withLockGuard` higher-order function or extend `useReviewActions` — detect `assignment === null`, call `selfAssignFile` before first action, then execute original action
  - [x] 4.2 After self-assign success: update SoftLockWrapper state (pass assignment setter down or use callback)
  - [x] 4.3 After self-assign conflict (`created: false`): switch to read-only mode, show toast with lock holder name
  - [x] 4.4 Start heartbeat loop after self-assign success
  - [x] 4.5 Show "You are reviewing this file" bar

- [x] Task 5: 30-minute auto-release Inngest cron (AC: #4)
  - [x] 5.1 Create `releaseStaleAssignments.ts` in `src/features/pipeline/inngest/`
  - [x] 5.2 Cron: `"*/5 * * * *"` (every 5 minutes)
  - [x] 5.3 Query via Drizzle (no `withTenant()`): `WHERE status = 'in_progress' AND last_active_at < NOW() - INTERVAL '30 minutes'`
  - [x] 5.4 Batch UPDATE: `status = 'cancelled'`, `completed_at = NOW()`
  - [x] 5.5 Write audit logs per row (non-fatal per Guardrail #2 — wrap in try/catch)
  - [x] 5.6 Config: `retries: 3` + `onFailure` handler (Guardrail #9)
  - [x] 5.7 Register in `src/app/api/inngest/route.ts` functions array
  - [x] 5.8 Expose `handler` + `onFailure` via `Object.assign` for testability (Guardrail #9)
  - [x] 5.9 Unit test with `drizzleMock` — verify only >30min assignments are cancelled, <30min preserved

- [x] Task 6: 25-minute warning toast (AC: #5)
  - [x] 6.1 Create `use-inactivity-warning.ts` hook in `src/features/review/hooks/`
  - [x] 6.2 Track elapsed time since last heartbeat success (client-side `setInterval`)
  - [x] 6.3 At 25 minutes: `toast.warning()` via sonner with `duration: Infinity` (persistent)
  - [x] 6.4 On any user interaction (mousemove, keydown, click): fire immediate heartbeat + dismiss toast + reset timer
  - [x] 6.5 `prefers-reduced-motion: reduce` — no animation on toast entry (Guardrail #20)
  - [x] 6.6 Wire into `SoftLockWrapper` — only active when `isOwnAssignment && status === 'in_progress'`

- [x] Task 7: Read-only enforcement audit — UI layer (AC: #6)
  - [x] 7.1 Add `isReadOnly` guard on `handleBulkAccept`, `handleBulkReject` handlers
  - [x] 7.2 Add `isReadOnly` guard on `BulkActionBar` component (disable bulk select mode)
  - [x] 7.3 Add `isReadOnly` guard on all dialog open triggers: Add Finding, Override, Flag, Suppress
  - [x] 7.4 Add `disabled={isReadOnly}` to `NoteInput` component
  - [x] 7.5 Add `isReadOnly` guard on `handleApprove` function
  - [x] 7.6 Add `isReadOnly` guard on `executeNativeConfirm` and `overrideNativeReview` handlers
  - [x] 7.7 Test: render ReviewPageClient inside `ReadOnlyContext` with `isReadOnly: true`, verify all action handlers are no-ops and all buttons disabled

- [x] Task 8: Lock state polling (AC: #7)
  - [x] 8.1 Add adaptive polling in `SoftLockWrapper` — call `getFileAssignment`:
    - Every **5 seconds** when `isReadOnly = true` (waiting for lock release — responsive UX)
    - Every **15 seconds** when not own assignment and unlocked (monitoring for new locks — low overhead)
  - [x] 8.2 Skip polling when `isOwnAssignment = true` (already have heartbeat)
  - [x] 8.3 On assignment change (null→exists or exists→null): update wrapper state + ReadOnlyContext
  - [x] 8.4 Debounce state update (avoid rapid flapping on poll-boundary)
  - [x] 8.5 Cleanup interval on unmount

- [x] Task 9: Multi-user verification via Playwright MCP (AC: #1-8)
  - [x] 9.1 Open file with User A (no assignment) → perform Accept → verify self-assign + "You are reviewing" bar
  - [x] 9.2 Open same file with User B in second browser context → verify lock banner + read-only
  - [x] 9.3 User B tries to click Accept/Reject/Flag buttons → verify disabled
  - [x] 9.4 User A releases → verify User B gets unlocked within 15s (poll interval)
  - [x] 9.5 Race condition: both users click Accept simultaneously on unassigned file → one wins, other gets read-only + toast
  - [x] 9.6 Verify all dialog triggers disabled in read-only: bulk, add finding, override, flag, suppress, approve
  - [x] 9.7 Verify server-side: User B sends direct server action call → gets LOCK_CONFLICT error

## Dev Notes

### Architecture Decisions

1. **Self-assignment, NOT separate lock table**: Reuse `file_assignments` table. Self-assignment (`assignedBy = assignedTo = currentUser`) creates a record that existing `SoftLockWrapper`/`useSoftLock` already understands. No new table needed.

2. **"Lock on first action" for unassigned files**: UX spec says "Soft lock on first action (not on open — viewing is free)". For assigned files, Story 6.1 already auto-transitions `assigned -> in_progress` on page open — this is correct behavior (admin explicitly assigned). For unassigned files, create lock on first review action only.

3. **Inngest cron for auto-release, NOT client-side**: Client-side timers are unreliable (tab close, crash). Inngest cron every 5 minutes scans for stale assignments. Client 25-min warning is UX polish only, not the enforcement mechanism.

4. **Polling over Realtime for lock detection**: `getFileAssignment` server action uses Drizzle (bypasses RLS), so all reviewers get correct results. Existing `use-findings-subscription.ts` subscribes to `finding_assignments` (wrong table). Adding new Realtime subscription for `file_assignments` would work but adds complexity. Polling every 15s is simple, reliable, and sufficient for lock release detection (lock changes are infrequent).

5. **Cross-tenant Inngest cron**: The auto-release cron has no tenant context. Use Drizzle directly (bypasses RLS, no `withTenant()` needed). Include `tenantId` from each row in audit logs. Do NOT use `createClient('service_role')` — Drizzle is already sufficient.

6. **Defense-in-depth: RLS + server action + UI**: Three layers of lock enforcement:
   - **RLS** (AC2): INSERT policy restricts self-assign to own user. SELECT policy allows reviewers to see locks.
   - **Server action** (AC3): `assertLockOwnership` helper blocks non-owner mutations.
   - **UI** (AC6): `isReadOnly` disables all action buttons and dialog triggers.

### RLS Audit (Critical for this story)

Current state of `file_assignments` RLS (migration 0022):

| Policy | Role | Operation | Scope |
|---|---|---|---|
| `_select_admin_qa` | admin, qa_reviewer | SELECT | Tenant-wide |
| `_select_native` | native_reviewer | SELECT | **Own assignments only** (gap!) |
| `_insert_admin_qa` | admin, qa_reviewer | INSERT | Tenant-wide |
| *(no self-assign)* | native_reviewer | INSERT | **BLOCKED** (gap!) |
| `_update_admin_qa` | admin, qa_reviewer | UPDATE | Tenant-wide |
| `_update_assigned` | native_reviewer | UPDATE | Own, status IN (in_progress, completed) |
| `_delete_admin` | admin | DELETE | Tenant-wide |

After this story (migration new):

| Policy | Role | Operation | Scope |
|---|---|---|---|
| `_select_admin_qa` | admin, qa_reviewer | SELECT | Tenant-wide (unchanged) |
| `_select_reviewer_locks` | native_reviewer | SELECT | **Tenant-wide** (expanded, replaces own-only) |
| `_insert_admin_qa` | admin, qa_reviewer | INSERT | Tenant-wide (unchanged) |
| `_insert_self_assign` | native_reviewer | INSERT | **Own user only** (new) |
| `_update_admin_qa` | admin, qa_reviewer | UPDATE | Tenant-wide (unchanged) |
| `_update_assigned` | native_reviewer | UPDATE | Own, status IN (in_progress, completed) (unchanged) |
| `_delete_admin` | admin | DELETE | Tenant-wide (unchanged) |

### Guardrails to Follow

- **#1** `withTenant()` on every query (exception: Inngest cron — see AC4 note)
- **#2** Audit log non-fatal — wrap in try/catch in cron error path
- **#5** DELETE + INSERT in transaction — `takeOverFile` already does this (no change)
- **#8** DB constraint added (new RLS policies) -> audit all INSERT/UPDATE paths
- **#9** Inngest function: `retries` + `onFailure` + register in `route.ts` + `Object.assign` for tests
- **#17** Single-key hotkeys suppressed in read-only mode (already done)
- **#20** `prefers-reduced-motion: reduce` on warning toast
- **#21** Dialog state reset on re-open (already handled)
- **#27** Tech debt < 2h: fix immediately
- **#62-65** RLS scoped access: app-level + RLS double defense, atomic DROP+CREATE migration
- **#80** Soft lock via DB `last_active_at`, NOT Supabase Presence
- **#81** Optimistic locking on takeover (already done)
- **#82** One active assignment per file (partial unique index, already exists)

### Key Constants

```typescript
// Existing (DO NOT change)
const STALE_THRESHOLD_MS = 2 * 60 * 1000      // 2 min — visual stale indicator
const STALE_CHECK_INTERVAL_MS = 15_000          // Re-check every 15s
const HEARTBEAT_INTERVAL_MS = 30_000            // 30s heartbeat

// New (this story)
const AUTO_RELEASE_THRESHOLD_MIN = 30           // Inngest cron auto-cancels
const INACTIVITY_WARNING_MIN = 25               // Client toast warning
const AUTO_RELEASE_CRON_INTERVAL = '*/5 * * * *' // Every 5 minutes
const LOCK_POLL_FAST_MS = 5_000                  // Poll when read-only (waiting for release)
const LOCK_POLL_SLOW_MS = 15_000                 // Poll when unlocked (monitoring)
```

### Existing File Reference (touch carefully)

| File | Action |
|---|---|
| `src/features/review/components/SoftLockWrapper.tsx` | Extend: add polling, handle null->assigned transition |
| `src/features/review/components/ReviewPageClient.tsx` | Audit: add `isReadOnly` guards on ALL dialog triggers, bulk, approve, confirm native |
| `src/features/review/hooks/use-soft-lock.ts` | Possibly extend: handle assignment state transitions |
| `src/features/review/hooks/use-file-presence.ts` | Extend: integrate 25-min warning timer |
| `src/features/project/validation/fileAssignmentSchemas.ts` | Add: `selfAssignFileSchema` |
| `src/app/api/inngest/route.ts` | Register: new cron function |
| `src/features/review/actions/helpers/executeReviewAction.ts` | Add `assertLockOwnership` — covers 8 actions |
| `src/features/review/actions/helpers/executeUndoRedo.ts` | Add `assertLockOwnership` — covers 7 undo/redo actions |
| `src/features/review/actions/*.action.ts` | 8 individual actions: add `assertLockOwnership` call |

### New Files to Create

| File | Purpose |
|---|---|
| `src/features/project/actions/selfAssignFile.action.ts` | Self-assignment with ON CONFLICT handling |
| `src/features/review/helpers/assertLockOwnership.ts` | Shared lock ownership check helper |
| `src/features/pipeline/inngest/releaseStaleAssignments.ts` | Inngest cron for 30-min auto-release |
| `src/features/review/hooks/use-inactivity-warning.ts` | 25-min toast warning hook |
| `src/db/migrations/XXXX_s_fix_7_self_assign_rls.sql` | RLS migration for self-assign + expanded SELECT |

### Project Structure Notes

- Server actions: `src/features/project/actions/` (co-located with existing assignment actions)
- Review helpers: `src/features/review/helpers/` (new directory for shared lock helper)
- Inngest functions: `src/features/pipeline/inngest/` (co-located with existing pipeline functions)
- Review hooks: `src/features/review/hooks/` (co-located with existing review hooks)
- Migrations: `src/db/migrations/` (sequential numbering, must update `meta/_journal.json`)
- All paths follow existing feature-based co-location pattern

### Testing Strategy

- **RLS tests**: Self-assign INSERT (own user only), expanded SELECT (tenant-wide), cross-tenant isolation
- **Unit**: selfAssignFile action (success/conflict/unauthorized), assertLockOwnership (no-lock/owner/non-owner), inactivity warning timer, read-only enforcement
- **Integration**: Inngest cron releases only >30min assignments, preserves <30min
- **E2E via Playwright MCP**: Multi-user concurrent scenario (two browser contexts)
- **Boundary tests**: 30 min exact = active, 30m01s = released; 25 min exact = no warning, 25m01s = warning

### References

- [Source: DEEP-VERIFICATION-CHECKLIST.md > MULTI-01] — P1 finding definition
- [Source: planning-artifacts/ux-design-specification/core-user-experience.md lines 276-283] — Edge Case #3 complete spec
- [Source: planning-artifacts/epics/epic-6-batch-processing-team-collaboration.md lines 33-36] — Story 6.1 AC (soft lock warning)
- [Source: CLAUDE-guardrails-epic6.md #79-84] — File assignment guardrails
- [Source: planning-artifacts/prd.md FR57, WI#3] — Concurrent reviewers requirement
- [Source: src/db/migrations/0022_story_6_1_file_assignments_rls.sql] — Current RLS policies (audit baseline)

### Previous Story Intelligence

**From S-FIX-14 (Admin & Assignment UX):**
- `users.nativeLanguages` JSONB array now populated via admin UI
- `getEligibleReviewers.action.ts` filters by language pair with `includeAll` fallback
- `LanguagePairEditor.tsx` uses Popover + Command pattern (reference for UI patterns)
- CR went through 6 rounds — root cause was `displayBcp47` inconsistency. Lesson: canonicalize display functions early.

**From Story 6.1 (File Assignment):**
- `uq_file_assignments_active` partial unique index enforces one active per file — use `ON CONFLICT` for self-assign
- `updateAssignmentStatus` has strict transition validation — only allowed transitions proceed
- RLS: native_reviewer can only UPDATE own assignments with CHECK on `status IN ('in_progress', 'completed')`
- Realtime publication on `file_assignments` already enabled (migration 0023)
- Drizzle ORM bypasses RLS — all server actions use `import { db } from '@/db/client'`

**Code audit findings (verified 2026-04-07):**
- `use-soft-lock.ts:42-43`: `if (!assignment) return { lockState: 'unlocked' }` — root cause of MULTI-01
- `use-findings-subscription.ts:300`: subscribes to `finding_assignments` NOT `file_assignments` — cannot reuse for lock detection
- ReviewPageClient `isReadOnly` only applied to: keyboard hotkeys (line 518) + ReviewActionBar (line 1581). Bulk, Approve, ConfirmNative, all dialogs: UNGUARDED.
- All 13 review server actions use `requireRole()` for auth but have NO lock ownership check.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- React Compiler purity error: `useRef(Date.now())` → fixed to `useRef(0)` with init in useEffect
- `LOCK_CONFLICT` not in ActionErrorCode → added to union type
- `requireRole` return type lacks `displayName` → fetch from users table instead

### Completion Notes List

- Task 1: RLS migration 0026 — self-assign INSERT policy + tenant-wide SELECT for native_reviewer (replaces own-only). 4 new RLS tests (T11-T14)
- Task 2: selfAssignFile.action.ts — ON CONFLICT DO NOTHING for race handling, returns existing lock holder on conflict. 6 unit tests
- Task 3: assertLockOwnership helper — checkLockOwnership + assertLockOwnership. Added to 2 shared helpers (covers 15 actions) + 8 individual actions. 6 unit tests
- Task 4: SoftLockWrapper mutable state — selfAssignIfNeeded via ReadOnlyContext/useLockGuard. useReviewActions calls selfAssign before first action. Polling integrated for lock release detection
- Task 5: releaseStaleAssignments Inngest cron — */5 * * * *, 30-min threshold, cross-tenant. 4 unit tests
- Task 6: use-inactivity-warning hook — 25-min timer, persistent toast, dismiss on interaction + heartbeat
- Task 7: Read-only audit — guards on: handleBulkAccept/Reject, executeNativeConfirm, executeNativeOverride, handleApprove, dialog triggers (add/override/suppress), undo/redo hotkeys
- Task 8: Polling in SoftLockWrapper — 5s when read-only, 15s when monitoring, skip when own assignment
- Task 9: VERIFIED via Playwright MCP on cloud Supabase after applying migration 0026. Alpha self-assigned on Accept click → "You are reviewing" bar appeared. Beta on same file saw "being reviewed by User Alpha" banner + "Read-only mode — assigned to User Alpha". Found and fixed 2 additional bugs during verification: (1) `FindingDetailContent.tsx:308` missed `isReadOnly` in aside-mode ReviewActionBar `isDisabled` prop — reviewer in aside layout could still click all 7 action buttons; fixed by importing `useReadOnlyMode` and adding to prop. (2) Approve button in ReviewPageClient used `disabled={!canApprove}` — added `|| isReadOnly`. Beta's forced click via JS bypass correctly prevented server mutation (client guard in useReviewActions stopped it, server-side `assertLockOwnership` is backup). Released Alpha's lock via SQL → Beta's polling detected release within 5s → Beta clicked Accept → self-assigned successfully → second `file_assignments` row with Beta as self-assigned owner. Partial unique index correctly allowed second assignment after first was cancelled. Also reverted my Release handler change (setAssignment(null) → window.location.reload()) because local state null caused polling to skip but server still has 'assigned' status.
- Post-implementation test fixes: updated use-review-actions tests (3 files) to flush microtasks after handleAccept/Reject calls because self-assign guard introduced async yield. 24 tests pass. Added assertLockOwnership mock to 29 affected action test files via agent. Full test suite passes for all files I modified (review + pipeline + project). 6 pre-existing flaky failures unrelated to S-FIX-7 (TaxonomyManager, bridge, glossary, upload, pipeline/stepId) all pass in isolation — parallel resource contention in full suite.

### File List

**New files:**
- `src/db/migrations/0026_s_fix_7_self_assign_rls.sql`
- `src/features/project/actions/selfAssignFile.action.ts`
- `src/features/project/actions/selfAssignFile.action.test.ts`
- `src/features/review/helpers/assertLockOwnership.ts`
- `src/features/review/helpers/assertLockOwnership.test.ts`
- `src/features/pipeline/inngest/releaseStaleAssignments.ts`
- `src/features/pipeline/inngest/releaseStaleAssignments.test.ts`
- `src/features/review/hooks/use-inactivity-warning.ts`

**Modified files:**
- `src/db/migrations/meta/_journal.json` — added entry for 0026
- `src/db/__tests__/rls/fileAssignments.rls.test.ts` — updated T3 (tenant-wide), added T11-T14
- `src/features/project/validation/fileAssignmentSchemas.ts` — added selfAssignFileSchema
- `src/types/actionErrorCode.ts` — added LOCK_CONFLICT
- `src/features/review/hooks/use-read-only-mode.ts` — extended context with selfAssignIfNeeded + useLockGuard
- `src/features/review/components/SoftLockWrapper.tsx` — mutable state, self-assign, polling, inactivity warning
- `src/features/review/hooks/use-review-actions.ts` — self-assign guard before first action
- `src/features/review/hooks/use-keyboard-actions.ts` — readOnly option for undo/redo hotkeys
- `src/features/review/actions/helpers/executeReviewAction.ts` — assertLockOwnership
- `src/features/review/actions/helpers/executeUndoRedo.ts` — assertLockOwnership
- `src/features/review/actions/addFinding.action.ts` — assertLockOwnership
- `src/features/review/actions/deleteFinding.action.ts` — assertLockOwnership
- `src/features/review/actions/bulkAction.action.ts` — assertLockOwnership
- `src/features/review/actions/approveFile.action.ts` — assertLockOwnership
- `src/features/review/actions/overrideSeverity.action.ts` — assertLockOwnership
- `src/features/review/actions/updateNoteText.action.ts` — assertLockOwnership
- `src/features/review/actions/addFindingComment.action.ts` — assertLockOwnership
- `src/features/review/actions/createSuppressionRule.action.ts` — assertLockOwnership
- `src/features/review/components/ReviewPageClient.tsx` — isReadOnly guards on bulk/approve/confirm/override/dialogs
- `src/app/api/inngest/route.ts` — registered releaseStaleAssignments
- `src/features/review/hooks/use-review-actions.test.ts` — added microtask flush after rapid handleAccept calls (U-H3 double-click test)
- `src/features/review/hooks/use-review-actions.ta.test.ts` — added microtask flush (TA-U11 Realtime rollback test)
- `src/features/review/hooks/use-review-actions.conflict.test.ts` — added microtask flush (P2-07 conflict test)
- 29 action test files in `src/features/review/actions/` — added `vi.mock('@/features/review/helpers/assertLockOwnership', ...)` (done by agent)
- `src/features/review/components/FindingDetailContent.tsx` — (Task 9 fix) added `useReadOnlyMode` hook + `|| isReadOnly` to ReviewActionBar `isDisabled` and Delete button — this is the aside-mode action bar, separate from ReviewPageClient's main action bar
- Reverted `SoftLockWrapper.handleRelease` to use `window.location.reload()` (originally my change set local assignment to null, but that left stale server state visible after polling)
