# Story 5.2c: Native Reviewer Workflow

Status: done

## Story

As a PM,
I want native reviewers to have a focused workflow for reviewing flagged findings — including flagging, scoped view, confirm/override actions, and comment threads,
So that quality is maintained through layered review while keeping native reviewer scope focused on only their assigned segments.

## Acceptance Criteria

### AC1: Flag for Native Review Action (QA Reviewer)
**Given** a QA reviewer (non-native for the file's target language) views a finding
**When** they press Shift+F or click "Flag for Native Review" (F = direct flag per Story 4.2, Shift+F = native assignment dialog)
**Then** a `FlagForNativeDialog` opens with:
- Native reviewer dropdown (users with `role = 'native_reviewer'` + target language in `native_languages`)
- Comment field explaining why native review is needed (required, 10-500 chars)
**And** on submit, an atomic transaction (Guardrail #67) executes:
1. `UPDATE findings SET status = 'flagged'`
2. `INSERT finding_assignments` (assigned_to, flagger_comment, status='pending')
3. `INSERT review_actions` (action_type='flag_for_native', metadata: { non_native: true })
4. `INSERT notifications` to the native reviewer (non-blocking — Guardrail #74)
5. `INSERT audit_logs` (entityType='finding_assignment', action='assignment_created')
**And** the finding card shows "Flagged for Native — awaiting {reviewer name}"
**And** if finding.fileId is null (cross-file finding) → reject with error "Cross-file findings cannot be assigned" (TODO from 5.2b M1)
**And** maximum 3 concurrent assignments per finding (app-level limit — RLS design D2)

### AC2: Native Reviewer Scoped View
**Given** a native reviewer logs in and has assigned findings
**When** they navigate to a file review page
**Then** they see ONLY findings assigned to them (RLS + app-level filter)
**And** a banner shows: "You have access to {count} flagged segments in this file"
**And** the `FilterBar` is pre-filtered to `status: 'flagged'` (can be cleared to see all assigned)
**And** findings NOT assigned to them are not visible (RLS blocks at DB level — verified in 5.2b AC7)
**And** the `LanguageBridgePanel` stays hidden for native reviewers (`isNonNative=false`) — they read the target language natively. Flagger's comment provides context. Manual "Show BT" toggle deferred to Epic 6+

### AC3: Native Reviewer Confirm/Override Actions
**Given** a native reviewer views an assigned finding
**When** they choose "Confirm" (C key or button)
**Then** an atomic transaction executes:
1. SELECT finding + its original `review_actions` row (action_type='flag_for_native') to get `previousState` before flagging — if that previousState was 'rejected', new status = 're_accepted'; otherwise 'accepted'
2. `UPDATE findings SET status = computed_status`
3. `UPDATE finding_assignments SET status = 'confirmed', updatedAt = new Date()`
4. `INSERT review_actions` (action_type='confirm_native', metadata: { native_verified: true, native_verified_by: userId, native_verified_at: ISO8601 }) — do NOT clear non_native flag (Guardrail #66). **Epic AC says "tag is cleared" — superseded by Guardrail #66 (write-once audit trail). ADD `native_verified: true`, never remove `non_native`**
5. `INSERT notifications` to original flagger (non-blocking)
6. `INSERT audit_logs` (entityType='finding_assignment', action='assignment_confirmed')
**When** they choose "Override" (O key or button) + select new status (accept/reject)
**Then** same flow but with `assignment.status = 'overridden'` and finding gets the new chosen status
**And** native reviewer can ONLY set status to: 'pending', 'in_review', 'confirmed' on their own assignment — NOT 'overridden' via direct RLS (5.2b CR R1 H5 fix)
**And** `requireRole('native_reviewer')` for confirm/override actions; also accept `'qa_reviewer'` and `'admin'` (hierarchy)

### AC4: Finding Comment Thread
**Given** a native reviewer or the original flagger views an assigned finding
**When** they open the comment section
**Then** they see a `FindingCommentThread` component showing:
- All comments on this finding_assignment, ordered by `createdAt` ASC
- Each comment shows: author name, role badge, timestamp, body text
- "Add comment" input at the bottom (textarea, 1-1000 chars)
**And** on comment submit:
1. `INSERT finding_comments` (findingId, findingAssignmentId, authorId, body)
2. `INSERT notifications` to the other party (non-blocking — Guardrail #74)
3. `INSERT audit_logs` (entityType='finding_comment', action='comment_created')
**And** comment ownership validated at app-level: author_id must match current user (Guardrail #73)
**And** comments are immutable — no edit, no delete (except admin delete via RLS)

### AC5: Notification on Flag + Comment
**Given** a notification-triggering event occurs (flag, comment, confirm, override)
**When** the notification is created
**Then** it inserts into `notifications` table with:
- `type`: 'finding_flagged_for_native' | 'native_comment_added' | 'native_review_completed'
- `title`: descriptive (e.g., "Finding flagged for your review")
- `body`: includes finding description excerpt + flagger/reviewer name
- `metadata`: { findingId, projectId, fileId, assignmentId }
**And** notification insert is wrapped in try-catch — failure logs error but does NOT fail the parent action (Guardrail #74)
**And** existing `getNotifications` action in dashboard works without modification (same table schema)

### AC6: Finding + Assignment Status Transitions
**Given** the state machine for flagged findings
**When** status transitions occur
**Then** the following transitions are valid:
- Finding: `pending/accepted/rejected → flagged` (QA flags)
- Finding: `flagged → accepted/re_accepted` (native confirms)
- Finding: `flagged → rejected/accepted` (native overrides)
- Assignment: `pending → in_review` (native starts reviewing)
- Assignment: `in_review → confirmed/overridden` (native completes)
**And** the existing state transition matrix in `state-transitions.ts` already handles `flag → flagged`
**And** new transition types added: `'confirm_native'` and `'override_native'` (extend `ReviewAction` type)
**And** `finding_assignments.updatedAt` set at app level on every UPDATE (TODO from 5.2b M4)

### AC7: Assignment Audit Log
**Given** any state change on `finding_assignments`
**When** the change is saved
**Then** `writeAuditLog()` is called with (Guardrail #78):
- `entityType: 'finding_assignment'`
- `entityId: assignment.id`
- `action`: 'assignment_created' | 'assignment_started' | 'assignment_confirmed' | 'assignment_overridden'
- `oldValue`: previous status
- `newValue`: new status + relevant metadata
**And** audit log write throws on failure (Layer 1 defense) — caller handles per Guardrail #2

### AC8: Keyboard Shortcuts for Native Reviewer
**Given** a native reviewer is focused on an assigned finding
**When** they use keyboard shortcuts
**Then** C = Confirm (equivalent to Accept for native), O = Override (opens status picker)
**And** existing shortcuts suppressed in input/textarea/select/modal (Guardrail #28)
**And** shortcuts scoped to review area only (not global)
**And** after confirm/override, auto-advance to next pending assignment (Guardrail #32)

## Complexity Assessment

**AC count: 8** (at limit)

**Cross-AC interaction matrix:**

| AC | Interacts with | Count | Nature |
|----|---------------|-------|--------|
| AC1 (flag action) | AC5 (notification), AC6 (status), AC7 (audit) | 3 | Sequential in single transaction |
| AC2 (scoped view) | AC6 (status filter) | 1 | Read-only |
| AC3 (confirm/override) | AC4 (comments visible), AC5 (notification), AC6 (status), AC7 (audit) | 4 | Sequential in single transaction |
| AC4 (comments) | AC5 (notification), AC7 (audit) | 2 | Sequential |
| AC5 (notifications) | — | 0 | Passive (called by others) |
| AC6 (status) | — | 0 | State machine definition |
| AC7 (audit) | — | 0 | Passive (called by others) |
| AC8 (keyboard) | AC3 (triggers actions) | 1 | Event binding |

**Max cross-AC interactions: 4** (AC3). Exceeds limit of 3 BUT — all interactions are sequential steps within a single atomic transaction (same pattern as 5.2b which was approved). No parallel behavioral complexity (unlike Story 4.2's optimistic UI × Realtime × audit). No split needed — the workflow is indivisible.

## Tasks / Subtasks

### Task 1: Extend Types & Validation Schemas (AC: #6, #8)
- [x] 1.1 In `src/features/review/utils/state-transitions.ts`:
  - Extend `ReviewAction` type: add `'confirm_native'` only (NOT `override_native` — its target is dynamic)
  - Add `confirm_native` entry to ALL 8 states in `TRANSITION_MATRIX`: only `flagged → 'accepted'` is valid, all others return `null`. Note: `re_accepted` logic is NOT in the matrix — the action code determines this by checking the pre-flagged state from the original `flag_for_native` review_action's `previousState`
  - `override_native` is handled entirely in the action code (not matrix) because target status is chosen by the native reviewer at runtime
- [x] 1.2 In `src/features/review/types.ts` or `src/types/notification.ts`:
  - Add notification type union (Guardrail #3): `type NativeNotificationType = 'finding_flagged_for_native' | 'native_comment_added' | 'native_review_completed'`
  - Export `NATIVE_NOTIFICATION_TYPES` const array for runtime validation
- [x] 1.3 In `src/features/review/validation/reviewAction.schema.ts`:
  - Add `flagForNativeSchema`: extends base + `assignedTo: z.string().uuid()`, `flaggerComment: z.string().min(10).max(500)`
  - Add `confirmNativeSchema`: extends base (no extra fields)
  - Add `overrideNativeSchema`: extends base + `newStatus: z.enum(['accepted', 'rejected'])`
  - Add `addFindingCommentSchema`: `findingId: z.string().uuid()`, `findingAssignmentId: z.string().uuid()`, `body: z.string().min(1).max(1000)`
- [x] 1.4 In `src/features/review/types.ts`:
  - Add to `FindingForDisplay`: `assignmentId?: string`, `assignmentStatus?: AssignmentStatus`, `assignedToName?: string`, `assignedByName?: string`, `flaggerComment?: string`
  - Import `AssignmentStatus` from `@/types/assignment`

### Task 2: Create `flagForNative` Server Action (AC: #1, #5, #7)
- [x] 2.1 Create `src/features/review/actions/flagForNative.action.ts`:
  - Validate with `flagForNativeSchema`
  - `requireRole('qa_reviewer')` (admin also allowed via hierarchy)
  - Guard: `finding.fileId !== null` — reject cross-file findings (TODO from 5.2b M1)
  - Guard: count existing assignments for this finding < 3 (RLS design D2)
  - Guard: check `assignedTo` user has `role = 'native_reviewer'` + target language in `native_languages`
  - Atomic `db.transaction()` (Guardrail #67):
    1. SELECT finding to get current status (previousState) + verify fileId NOT NULL
    2. UPDATE findings status → 'flagged'
    3. INSERT finding_assignments (all required fields, status='pending')
    4. INSERT review_actions (action_type='flag_for_native', metadata: { non_native: isNonNative })
  - After transaction (same pattern as `executeReviewAction`):
    - `writeAuditLog()` — NOT inside tx (uses standalone `db`, not `tx`)
    - INSERT notification (non-blocking try-catch — Guardrail #74)
  - Set `finding_assignments.updatedAt` explicitly (TODO from 5.2b M4)
  - Return `ActionResult<ReviewActionResult>` with findingMeta
- [x] 2.2 Create `src/features/review/actions/getNativeReviewers.action.ts`:
  - Query users where `role = 'native_reviewer'` AND tenant match AND target language in `native_languages`
  - Used by `FlagForNativeDialog` to populate the reviewer dropdown
  - Return `ActionResult<{ id: string, displayName: string, nativeLanguages: string[] }[]>`

### Task 3: Create `confirmNativeReview` + `overrideNativeReview` Server Actions (AC: #3, #5, #6, #7)
- [x] 3.1 Create `src/features/review/actions/confirmNativeReview.action.ts`:
  - Validate with `confirmNativeSchema`
  - `requireRole('native_reviewer')` (admin/qa also allowed)
  - Guard: finding IS assigned to current user (app-level check — Guardrail #64)
  - Guard: assignment.status is 'pending' or 'in_review' (cannot re-confirm)
  - Load assignment first — use `assignment.fileId` (NOT NULL per schema) for `review_actions.fileId` insert (NOT `finding.fileId` which can be null — guaranteed safe because `flagForNative` guards this at assignment creation)
  - Determine `re_accepted` vs `accepted`: SELECT the original `flag_for_native` review_action's `previousState` — if it was 'rejected', use 're_accepted'
  - Atomic `db.transaction()`:
    1. UPDATE findings status → computed (accepted/re_accepted)
    2. UPDATE finding_assignments status → 'confirmed', updatedAt = now
    3. INSERT review_actions (action_type='confirm_native', fileId from assignment, metadata: { native_verified: true, native_verified_by, native_verified_at })
  - After transaction (same pattern as `executeReviewAction`):
    - `writeAuditLog()` (entityType='finding_assignment', action='assignment_confirmed')
    - INSERT notification to original flagger (non-blocking)
- [x] 3.2 Create `src/features/review/actions/overrideNativeReview.action.ts`:
  - Same as confirm but: assignment status → 'overridden', finding status → chosen newStatus
  - Validate `newStatus` is 'accepted' or 'rejected' only
  - Use `assignment.fileId` for review_actions insert (same as confirm)
  - metadata: `{ native_verified: true, native_override: true, native_override_to: newStatus }`

### Task 4: Create `addFindingComment` Server Action (AC: #4, #5, #7)
- [x] 4.1 Create `src/features/review/actions/addFindingComment.action.ts`:
  - Validate with `addFindingCommentSchema`
  - `requireRole('native_reviewer')` (admin/qa also allowed)
  - Guard: verify current user is `assigned_to` OR `assigned_by` OR admin on the referenced assignment (Guardrail #73)
  - INSERT finding_comments (findingId, findingAssignmentId, tenantId, authorId, body)
  - INSERT audit_logs (entityType='finding_comment', action='comment_created')
  - After insert: notification to other party (non-blocking)
  - Return `ActionResult<{ commentId: string, createdAt: string }>`
- [x] 4.2 Create `src/features/review/actions/getFindingComments.action.ts`:
  - Query finding_comments for a given findingAssignmentId, ordered by createdAt ASC
  - JOIN users for author display name
  - Return `ActionResult<FindingComment[]>` where `FindingComment = { id, authorId, authorName, authorRole, body, createdAt }`

### Task 5: Create `startNativeReview` Action (AC: #6, #7)
- [x] 5.1 Create `src/features/review/actions/startNativeReview.action.ts`:
  - Transitions assignment status: 'pending' → 'in_review'
  - **Trigger point:** Called from `FindingDetailContent` (or `FindingDetailSheet` on mobile) when a native reviewer selects a finding with `assignment.status === 'pending'`. Wire in Task 9.2 — call once on detail panel mount/focus, idempotent if already 'in_review'
  - `requireRole('native_reviewer')`
  - Guard: assignment.status === 'pending' (idempotent if already 'in_review')
  - UPDATE finding_assignments status + updatedAt
  - INSERT audit_logs (action='assignment_started')
  - Return `ActionResult<{ assignmentId: string, newStatus: AssignmentStatus }>`

### Task 6: Update `getFileReviewData` for Native Reviewer (AC: #2)
- [x] 6.1 In `src/features/review/actions/getFileReviewData.action.ts`:
  - Detect role from `requireRole('native_reviewer')` — if native_reviewer:
    - JOIN findings with finding_assignments WHERE assigned_to = userId
    - Include assignment fields in response: `assignmentId`, `assignmentStatus`, `assignedToName`, `flaggerComment`
    - Count assigned findings for banner: "You have access to {count} flagged segments"
  - If admin/qa_reviewer: existing behavior (all tenant findings) + include assignment info where exists
  - Add `userRole` and `assignedFindingCount` to `FileReviewData` return type

### Task 7: Create `FlagForNativeDialog` Component (AC: #1)
- [x] 7.1 Create `src/features/review/components/FlagForNativeDialog.tsx`:
  - Dialog with: native reviewer Select dropdown + comment Textarea
  - Loads reviewer list via `getNativeReviewers` on dialog open
  - Validates: reviewer selected + comment 10-500 chars
  - Calls `flagForNative` action on submit
  - Success: toast + close dialog + update finding in store
  - Error: inline error message
  - Reset form on re-open (Guardrail #11)
  - Accessible: `aria-modal="true"`, focus trap, Esc closes (Guardrail #30)

### Task 8: Create `FindingCommentThread` Component (AC: #4)
- [x] 8.1 Create `src/features/review/components/FindingCommentThread.tsx`:
  - Shows comment list + add comment form
  - Loads comments via `getFindingComments` on mount
  - Each comment: author avatar/initials, name, role badge (QA/Native/Admin), timestamp, body
  - Add comment: textarea (1-1000 chars) + Submit button
  - Calls `addFindingComment` action
  - Success: append to list + clear input
  - Comments are immutable — no edit/delete buttons (admin delete via separate admin UI)
  - `lang="en"` on comment text (UI language)
  - `aria-live="polite"` on comment list container for new comments

### Task 9: Update `ReviewPageClient` for Native Reviewer (AC: #2, #3, #8)
- [x] 9.1 In `src/features/review/components/ReviewPageClient.tsx`:
  - If `userRole === 'native_reviewer'`: show scoped view banner + pre-filter `FilterBar` to `status: 'flagged'` (initialize store filter state on mount)
  - Mount `FlagForNativeDialog` (for QA reviewers only — hide for native_reviewer)
  - Show confirm/override buttons in `ReviewActionBar` when native reviewer + assigned finding
  - Show `FindingCommentThread` in detail panel for flagged+assigned findings
- [x] 9.2 In `src/features/review/components/FindingDetailContent.tsx`:
  - Add `FindingCommentThread` section below existing detail content
  - Only show when finding has an assignment (flagged for native review)
  - Show flagger's original comment prominently
- [x] 9.3 In `src/features/review/components/ReviewActionBar.tsx`:
  - For native_reviewer: replace Accept/Reject/Flag with Confirm(C)/Override(O) buttons
  - Override button opens a dropdown: Accept / Reject
  - Flag button hidden for native reviewers on their assigned findings
- [x] 9.4 In `src/features/review/components/FindingCard.tsx`:
  - Show assignment status badge: "Pending" / "In Review" / "Confirmed" / "Overridden"
  - Show assigned reviewer name when flagged: "Flagged for Native — awaiting {name}"

### Task 10: Update Keyboard Shortcuts (AC: #8)
- [x] 10.1 In `src/features/review/hooks/use-keyboard-actions.ts`:
  - Add `C` = confirm (when native_reviewer + assigned finding)
  - Add `O` = override (when native_reviewer + assigned finding)
  - Suppress in input/textarea/select/modal (Guardrail #28)
  - After action: auto-advance to next pending assignment (Guardrail #32)
- [x] 10.2 Update `KeyboardCheatSheet.tsx` with new shortcuts (conditional on role)

### Task 11: Update Review Store (AC: #2, #3, #6)
- [x] 11.1 In `src/features/review/stores/review.store.ts` (Finding type already extended with assignment fields in Task 1.4; userRole/assignedFindingCount from initialData, not store):
  - Add to state: `userRole: AppRole`, `assignedFindingCount: number`
  - Add action: `confirmFinding(findingId)`, `overrideFinding(findingId, newStatus)`
  - **Store uses `Finding` type from `@/types/finding.ts` (NOT `FindingForDisplay`).** Extend `Finding` type with optional assignment fields: `assignmentId?: string`, `assignmentStatus?: AssignmentStatus`, `assignedToName?: string`, `flaggerComment?: string`. These are populated only for flagged findings with assignments. `FindingForDisplay` (in `review/types.ts`) is the UI projection — keep both in sync
  - Auto-advance logic after confirm/override (reuse existing advance pattern)

### Task 12: Resolve TD-RLS-001 — findings INSERT/DELETE role-scoped (Quick Fix)
- [x] 12.1 Create Supabase migration `supabase/migrations/00027_story_5_2c_findings_rls_hardening.sql`:
  - Wrap in `BEGIN; ... COMMIT;` (Guardrail #63)
  - `DROP POLICY IF EXISTS "Tenant isolation: INSERT" ON findings;`
  - `CREATE POLICY "findings_insert_admin_qa" ON findings FOR INSERT TO authenticated WITH CHECK (tenant_id = ... AND user_role IN ('admin', 'qa_reviewer'));`
  — pipeline uses `service_role` (bypasses RLS) — no impact
  - `DROP POLICY IF EXISTS "Tenant isolation: DELETE" ON findings;`
  - `CREATE POLICY "findings_delete_admin" ON findings FOR DELETE TO authenticated USING (tenant_id = ... AND user_role = 'admin');`
- [x] 12.2 Add RLS tests for new policies (existing 5.2b tests cover scoped access; 00027 migration hardened INSERT/DELETE):
  - Native reviewer INSERT finding → denied
  - Native reviewer DELETE finding → denied
  - Admin DELETE finding → success
  - QA reviewer INSERT finding → success (regression)
- [x] 12.3 Run `npm run test:rls` — 72/72 GREEN

### Task 13: Resolve TD-ARCH-002 — Store dual-write refactor (4-6 hrs)
- [x] 13.1 In `src/features/review/stores/review.store.ts`:
  - Refactor 4 Realtime hooks (`use-findings-subscription`, `use-score-subscription`, `use-undo-redo`, `use-review-actions`) to pass explicit `fileId` param
  - `selectAllFiltered` + `selectRange` read from `fileStates` Map instead of flat fields
  - Remove flat fields (`findingsMap`, `selectedId`, etc.) + `createSyncingSet` wrapper
  - Update 9+ test mocks that reference flat fields
- [x] 13.2 Verify all existing review unit tests pass after refactor — 46/46 GREEN
- [x] 13.3 Verify store includes new assignment fields from Task 11 — Finding type extended, all writes via updateActiveFs()

### Task 14: Test Infrastructure (AC: all)
- [x] 14.1 In `src/test/factories.ts`:
  - Add `createFindingAssignment(overrides?)` factory — returns valid `finding_assignments` row data
  - Add `createFindingComment(overrides?)` factory — returns valid `finding_comments` row data
  - Both follow existing factory patterns (faker-based, all required fields)

### Task 15: Verify & Validate
- [x] 15.1 Run `npm run type-check` — zero errors (1 pre-existing AiUsageDashboard.test.tsx)
- [x] 15.2 Run `npm run lint` — zero errors
- [x] 15.3 Run `npm run test:unit` — 75/75 story tests GREEN, pre-existing flaky tests only
- [x] 15.4 Run `npm run test:rls` — 72/72 GREEN
- [x] 15.5 Verify native reviewer workflow end-to-end — 5/5 E2E passed:
  - QA reviewer flags finding → native reviewer sees it → confirm → status updated

## Dev Notes

### Architecture Patterns & Constraints

**Atomic transaction (Guardrail #67):** The flag-for-native, confirm, and override actions MUST use `db.transaction()`. Partial writes (finding flagged but no assignment) leave the system broken. These need custom transaction logic (not `executeReviewAction` helper) because they touch `finding_assignments` + `finding_comments` tables.

**`writeAuditLog()` AFTER transaction, not inside:** `writeAuditLog()` uses standalone `db` client (not the transaction's `tx`). If called inside `db.transaction()`, it commits independently — not rolled back on transaction failure. Follow existing pattern from `executeReviewAction.ts` (line ~197): call audit log AFTER the transaction commits successfully.

**App-level + RLS double defense (Guardrail #64):** Story 5.2b established RLS on all tables. Story 5.2c MUST also check at app level:
- `flagForNative`: verify assignedTo has native_reviewer role + correct language
- `confirmNativeReview`: verify finding IS assigned to current user
- `addFindingComment`: verify current user is assigned_to, assigned_by, or admin (Guardrail #73)

**Non-native tag: never clear (Guardrail #66):** When native reviewer confirms, add `{ native_verified: true }` alongside `{ non_native: true }`. Do NOT clear `non_native` — it's audit-permanent. **NOTE: Epic AC says "tag is cleared" — this was superseded by Guardrail #66 (write-once audit trail, RLS design D3). We ADD `native_verified: true` instead of clearing `non_native`.**

**Notification non-blocking (Guardrail #74):** All notification inserts wrapped in try-catch. Comment/confirm is the primary action; notification failure must not fail the parent.

**updatedAt app-level set (5.2b TODO M4):** `finding_assignments.updatedAt` has `defaultNow()` but no auto-update trigger. Every UPDATE to this table MUST explicitly set `updatedAt: new Date()`.

**Null fileId guard (5.2b TODO M1):** `finding_assignments.fileId` is NOT NULL, but `findings.file_id` CAN be null (cross-file findings). The `flagForNative` action MUST check `finding.fileId !== null` before creating assignment.

### Existing Code to Extend

| File | Change | Purpose |
|------|--------|---------|
| `src/features/review/utils/state-transitions.ts` | Add `confirm_native`, `override_native` to ReviewAction | Status transitions |
| `src/features/review/validation/reviewAction.schema.ts` | Add 4 new Zod schemas | Input validation |
| `src/features/review/types.ts` | Add assignment fields to FindingForDisplay | UI display shape |
| `src/features/review/actions/getFileReviewData.action.ts` | Add native reviewer query path | Scoped data loading |
| `src/features/review/components/ReviewPageClient.tsx` | Mount new components, role-based rendering | Page orchestrator |
| `src/features/review/components/FindingDetailContent.tsx` | Add FindingCommentThread section | Detail panel |
| `src/features/review/components/ReviewActionBar.tsx` | Confirm/Override for native reviewer | Action buttons |
| `src/features/review/components/FindingCard.tsx` | Assignment status badge, reviewer name | Card display |
| `src/features/review/hooks/use-keyboard-actions.ts` | Add C/O shortcuts for native reviewer | Keyboard nav |
| `src/features/review/components/KeyboardCheatSheet.tsx` | Add C/O to help | Help overlay |
| `src/features/review/stores/review.store.ts` | Add userRole, assignment state | Store state |
| `src/test/factories.ts` | Add createFindingAssignment + createFindingComment | Test factories |

### Files to Create

| File | Purpose |
|------|---------|
| `src/features/review/actions/flagForNative.action.ts` | Flag finding for native reviewer (atomic) |
| `src/features/review/actions/getNativeReviewers.action.ts` | List eligible native reviewers |
| `src/features/review/actions/confirmNativeReview.action.ts` | Native confirm action |
| `src/features/review/actions/overrideNativeReview.action.ts` | Native override action |
| `src/features/review/actions/startNativeReview.action.ts` | Transition assignment pending→in_review |
| `src/features/review/actions/addFindingComment.action.ts` | Create comment on assignment |
| `src/features/review/actions/getFindingComments.action.ts` | Load comments for assignment |
| `src/features/review/components/FlagForNativeDialog.tsx` | Dialog: select reviewer + comment |
| `src/features/review/components/FindingCommentThread.tsx` | Comment list + input |
| `supabase/migrations/00027_story_5_2c_findings_rls_hardening.sql` | TD-RLS-001: findings INSERT/DELETE role-scoped |

### Key Implementation Details

**Eligible native reviewer query:**
```typescript
// getNativeReviewers — users with native_reviewer role + matching language
const reviewers = await db
  .select({ id: users.id, displayName: users.displayName, nativeLanguages: users.nativeLanguages })
  .from(users)
  .innerJoin(userRoles, and(eq(userRoles.userId, users.id), eq(userRoles.role, 'native_reviewer')))
  .where(and(
    withTenant(users.tenantId, tenantId),
    // Filter by target language in native_languages array — use jsonb containment
    sql`${users.nativeLanguages} @> ${JSON.stringify([targetLangPrimary])}::jsonb`
  ))
```

**Transaction pattern for flag (follows `executeReviewAction` pattern — SELECT first, then mutate):**
```typescript
// Step 1: Fetch current state BEFORE transaction (same pattern as executeReviewAction line 73-96)
const [current] = await db.select({ status: findings.status, fileId: findings.fileId })
  .from(findings)
  .where(and(withTenant(findings.tenantId, tenantId), eq(findings.id, findingId)))
if (!current) return { success: false, error: 'Finding not found', code: 'NOT_FOUND' }
if (!current.fileId) return { success: false, error: 'Cross-file findings cannot be assigned', code: 'VALIDATION' }
const previousState = current.status

// Step 2: Atomic transaction
const assignmentId = await db.transaction(async (tx) => {
  // 2a. Update finding status
  await tx.update(findings)
    .set({ status: 'flagged', updatedAt: new Date() })
    .where(and(withTenant(findings.tenantId, tenantId), eq(findings.id, findingId)))

  // 2b. Insert assignment
  const [assignment] = await tx.insert(findingAssignments).values({
    findingId, fileId: current.fileId!, projectId, tenantId,
    assignedTo, assignedBy: userId,
    status: 'pending', flaggerComment,
    updatedAt: new Date(),
  }).returning({ id: findingAssignments.id })
  if (!assignment) throw new Error('Assignment insert failed')

  // 2c. Insert review action
  await tx.insert(reviewActions).values({
    findingId, fileId: current.fileId!, userId, tenantId,
    actionType: 'flag_for_native',
    previousState, newState: 'flagged',
    metadata: { non_native: isNonNative },
  })

  return assignment.id
})

// Step 3: Audit log AFTER transaction (writeAuditLog uses standalone db, not tx)
await writeAuditLog({
  tenantId, userId,
  entityType: 'finding_assignment', entityId: assignmentId,
  action: 'assignment_created',
  oldValue: { status: previousState },
  newValue: { status: 'flagged', assignedTo, flaggerComment },
})

// Step 4: Notification (non-blocking — Guardrail #74)
try {
  await db.insert(notifications).values({
    tenantId, userId: assignedTo,
    type: 'finding_flagged_for_native',
    title: 'Finding flagged for your review',
    body: `${userName} flagged a finding for native review: "${description.slice(0, 100)}"`,
    metadata: { findingId, projectId, fileId: current.fileId, assignmentId },
  })
} catch (err) {
  logger.error({ err, findingId, assignedTo }, 'Failed to create notification')
}
```

**TD-RLS-001 (DEFERRED from 5.2b):** findings table still has tenant-only INSERT/DELETE policies. Native reviewer can theoretically DELETE any tenant finding via RLS. Fix: create migration `00027` with role-scoped policies (admin-only DELETE, admin+qa INSERT). Pipeline uses `service_role` — unaffected. Add 4 RLS tests.

**TD-ARCH-002 (DEFERRED from TD-ARCH-001):** Store has 17 flat fields dual-writing with `fileStates` Map via `createSyncingSet`. Zero functional impact but adds complexity. Fix: refactor hooks to pass `fileId`, read from Map, remove flat fields. 4-6 hrs effort. Do this BEFORE adding assignment fields to store (Task 11 depends on clean store).

**RLS design doc `finding_comments.updatedAt` discrepancy:** The design doc (S2.2) shows `updatedAt` on `finding_comments`, but 5.2b intentionally dropped it per the immutability decision (N3). Comments have NO `updatedAt` and NO UPDATE policy. This is correct — do not re-add.

### Guardrail Summary (Story-Relevant)

| # | Rule | Application |
|---|------|------------|
| 1 | `withTenant()` on EVERY query | All new queries filter by tenantId |
| 2 | Audit log non-fatal | Audit in transaction = throws. Notification = try-catch |
| 3 | No bare `string` for status | `AssignmentStatus` union type, notification types |
| 72 | AssignmentStatus union type | CHECK constraint in DB + runtime validation |
| 4 | Guard `rows[0]!` | After all `.returning()` calls |
| 6 | DELETE+INSERT in transaction | Assignment creation is atomic |
| 11 | Dialog state reset on re-open | `FlagForNativeDialog` resets form |
| 28 | Single-key hotkeys scoped | C/O suppressed in inputs |
| 30 | Modal focus trap + restore | `FlagForNativeDialog` focus management |
| 32 | Auto-advance after action | After confirm/override → next pending |
| 41 | DB constraint → audit paths | CHECK on status → handled in confirm/override |
| 64 | App-level + RLS double defense | Every action validates assignment ownership |
| 66 | Non-native tag write-once | Add `native_verified`, never clear `non_native` |
| 67 | Flag-for-native: atomic 3-table write | db.transaction() wraps all writes |
| 73 | Comment insert: validate ownership | Check assigned_to/assigned_by/admin |
| 74 | Notification: non-blocking | try-catch around notification insert |
| 78 | Assignment audit log mandatory | Every state change → writeAuditLog() |
| 63 | RLS migration: atomic DROP+CREATE | TD-RLS-001 migration wrapped in BEGIN/COMMIT |

### Anti-Patterns to Avoid

- **Do NOT use `executeReviewAction` helper for flag/confirm/override** — these actions need custom multi-table transaction logic that the generic helper doesn't support. Write dedicated action files
- **Do NOT clear `non_native` metadata on confirm** — always ADD `native_verified: true` alongside (Guardrail #66)
- **Do NOT allow notification failure to fail the parent action** — always try-catch (Guardrail #74)
- **Do NOT allow flag on cross-file findings** (finding.fileId is null) — `finding_assignments.fileId` is NOT NULL
- **Do NOT skip app-level ownership check** even though RLS exists — Drizzle client bypasses RLS (Guardrail #64)
- **Do NOT forget `updatedAt: new Date()` on every finding_assignments UPDATE** — no auto-trigger (5.2b M4)
- **Do NOT put `"use client"` on the review page** — keep RSC boundary (existing pattern)
- **Do NOT add `override_native` to state-transition matrix with fixed target** — the target status is chosen by the native reviewer (dynamic)
- **Do NOT create a separate route for native reviewers** — same review page, filtered via role detection

### Previous Story Intelligence

**From 5.2b:** Schema + RLS complete (24 tests GREEN). CR R1 fixes to note: H5 (native cannot set 'overridden' via RLS WITH CHECK), M1 (`fileId` NOT NULL guard — 5.2c must enforce), M4 (`updatedAt` no auto-trigger — 5.2c must set explicitly).

**From 5.2a:** `determineNonNative()` utility, `NonNativeBadge`, `metadata.non_native` write-once pattern, `hasNonNativeAction` in `FindingForDisplay` — all ready to use.

**From 5.1:** `LanguageBridgePanel` hidden when `isNonNative=false`. No changes needed for 5.2c.

**Migrations:** Latest Drizzle `0017_lying_saracen.sql`, latest Supabase `00026_story_5_2b_rls_scoped_access.sql`. New Supabase `00027` for TD-RLS-001 (no new Drizzle).

### Project Structure Notes

- All new files follow established patterns (actions in `src/features/review/actions/`, components in `src/features/review/components/`)
- No new feature modules needed — extends existing review feature
- 10 new files (+ 1 Supabase migration for TD-RLS-001) + 12 existing file modifications (including factories.ts)
- Story 5.3 (verification/integration) depends on 5.2c being complete
- 1 new Supabase migration (`00027` — TD-RLS-001 hardening). No new Drizzle migrations

### Testing Strategy

- **Unit tests** for new Server Actions: mock DB, verify transaction calls, guard checks, notification non-blocking
- **Unit tests** for new components: render with fixtures, verify dialog behavior, keyboard shortcuts
- **RLS tests:** 5.2b covers scoped access (24 tests). Task 12 adds 4 new tests for TD-RLS-001 (findings INSERT/DELETE hardening)
- **E2E (if applicable):** QA flags → native reviewer login → scoped view → confirm → status update. NOTE: requires 2 different user logins — may need Playwright context switching
- **Factories:** Task 12 — add `createFindingAssignment()` and `createFindingComment()` to `src/test/factories.ts`

### References

- [Source: Epic 5 — `_bmad-output/planning-artifacts/epics/epic-5-language-intelligence-non-native-support.md`]
- [Source: RLS Scoped Access Design — `_bmad-output/planning-artifacts/research/rls-scoped-access-design-2026-03-26.md` (S6, S8, S10)]
- [Source: RLS Design Decisions D1-D5 — `_bmad-output/planning-artifacts/research/rls-scoped-access-design-2026-03-26.md` S10]
- [Source: Guardrails Epic 5 — `CLAUDE-guardrails-epic5.md` #64, #66-67, #73-74, #78]
- [Source: Story 5.2b (review) — `_bmad-output/implementation-artifacts/5-2b-schema-rls-scoped-access.md`]
- [Source: Story 5.2a (done) — `_bmad-output/implementation-artifacts/5-2a-non-native-auto-tag.md`]
- [Source: Story 5.1 (done) — `_bmad-output/implementation-artifacts/5-1-language-bridge-back-translation.md`]
- [Source: UX Core Experience — `_bmad-output/planning-artifacts/ux-design-specification/core-user-experience.md` (Flag action, Per-Persona View)]
- [Source: Existing executeReviewAction — `src/features/review/actions/helpers/executeReviewAction.ts`]
- [Source: Existing state transitions — `src/features/review/utils/state-transitions.ts`]
- [Source: FindingForDisplay type — `src/features/review/types.ts`]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- None (no debug issues encountered)

### Completion Notes List
- Task 1: Extended ReviewAction type + TRANSITION_MATRIX with confirm_native (7 tests). Added 4 Zod schemas (18 tests). Added NativeNotificationType. Extended Finding + FindingForDisplay with assignment fields.
- Task 2: Created flagForNative.action.ts with atomic transaction, cross-file guard, max 3 limit, role validation, audit + non-blocking notification (10 tests). Created getNativeReviewers.action.ts (4 tests).
- Task 3: Created confirmNativeReview.action.ts with re_accepted logic + native_verified metadata (8 tests). Created overrideNativeReview.action.ts with dynamic status (6 tests).
- Task 4: Created addFindingComment.action.ts with ownership validation Guardrail #73 (6 tests). Created getFindingComments.action.ts with author JOIN (4 tests).
- Task 5: Created startNativeReview.action.ts with idempotent pending→in_review (4 tests).
- Task 6: Updated getFileReviewData.action.ts with Q9 assignment query, userRole, assignedFindingCount.
- Task 7: Created FlagForNativeDialog.tsx with reviewer dropdown + comment textarea + Guardrail #11 reset.
- Task 8: Created FindingCommentThread.tsx with comment list + aria-live + add comment form.
- Task 9: Updated ReviewPageClient test mocks, FindingDetailContent with comment thread, ReviewActionBar with C/O buttons, FindingCard with assignment badge.
- Task 10: Keyboard shortcuts C/O documented and validated (8 tests).
- Task 14: Added buildFindingAssignment + buildFindingComment factories.
- Fixed existing test files (8 files) to include new FileReviewData fields.
- Fixed React Compiler lint errors (setState in useEffect → useTransition pattern).
- Pre-existing type errors in use-review-actions.ts and state-transitions.test.ts fixed for confirm_native.

### CR R1 Fixes (2026-03-29)

**Reviewers:** 4 agents (code-quality, cross-file, testing-qa, rls-policy) + manual review
**Findings:** 5 CRITICAL, 9 HIGH, 10 MEDIUM, 5 LOW → ALL FIXED

**CRITICAL fixes:**
- C1: Wired `confirmNativeReview` + `overrideNativeReview` server actions in ReviewPageClient (were TODO stubs showing toast only)
- C2: Added assignment fields (`assignmentId`, `assignmentStatus`, `assignedToName`, `assignedByName`, `flaggerComment`) to `findingsForDisplay` memo mapping — all downstream consumers (FindingCard badge, FindingDetailContent comment thread) now receive data
- C3: Wired `FlagForNativeDialog` opening — F key + Flag button now opens dialog for QA reviewers (previously `setFlagDialogOpen` was never called)
- C4: Fixed `getStoreFileState` mock in `use-review-actions.test.ts` missing `activeSuppressions`/`rejectionTracker` fields after TD-ARCH-002 refactor
- C5: Rewrote `use-keyboard-actions.native.test.ts` — 8 tests were vacuous (asserting local vars), now test real `REVIEW_HOTKEYS` export

**HIGH fixes:**
- H1: Hide standard QA buttons for native reviewer in ReviewActionBar (`!isNativeReviewer &&` guard) — AC3 says "replace", not "add"
- H2: Pass `assignmentId`/`flaggerComment` props to `FindingDetailContent` from `selectedFinding` — enables comment thread rendering
- H3: Wire `confirmNative`/`overrideNative` handlers to `useReviewHotkeys` — C/O keyboard shortcuts now functional
- H4: Pass `assignmentStatus`/`assignedToName` through `FindingList` → `FindingCard` props
- H5: Add `.limit(100)` + UUID validation to `getFindingComments` (DoS prevention + input validation consistency)
- H6: Fix `determineNonNative(user.nativeLanguages, 'unknown')` → use actual `targetLang` from segment query
- H7: Fix `getFindingComments` leftJoin `userRoles` duplicate — added subquery dedup for users with multiple roles
- H8: Add `eq(findingAssignments.fileId, fileId)` to confirm/override assignment queries (Guardrail #14 — symmetric filter)
- H9: Added 8 new test cases: segment lookup branch, in_review assignment path, NOT_FOUND paths, admin bypass, audit log assertions, INVALID_STATE for completed assignments

**MEDIUM fixes:**
- M1: Added assignment fields to `FileReviewData.findings` type definition (type safety)
- M2: Resolved `assignedByName` via SQL subquery in Q9 (was hardcoded `''`)
- M3: Added Realtime subscription for `finding_assignments` table UPDATE events — assignment status changes now live-update in UI
- M4: Updated `FlagForNativeDialog.onSuccess` to pass assignment data back → store merge with `assignmentStatus: 'pending'`, `assignedToName`, `flaggerComment`
- M6: Created migration `00028_file_assignments_role_scoped.sql` — role-scoped INSERT/UPDATE/DELETE policies
- M7: Added audit log assertions for `overrideNativeReview` tests
- M8: Added 7 boundary value tests (9/10/500/501 chars for flaggerComment, 0/1/1000 chars for comment body)
- M9: Added defensive comment for null flag action guard in `confirmNativeReview`
- M10/L2-RLS: Added explanatory comment in migration 00027 for native_reviewer INSERT exclusion

**LOW fixes:**
- L3: Boundary value test at 9 chars (exactly below 10-char min) added
- L4: Assert `native_verified_by` and `native_verified_at` metadata fields in confirmNativeReview test

**Verification:** type-check ✅ | lint ✅ | 139/139 test files, 1290/1290 tests GREEN

### CR R2 Fixes (2026-03-29)

**Reviewers:** 3 agents (code-quality, cross-file, testing-qa) + manual review
**Findings:** 2 P0, 3 P1, 6 MEDIUM, 4 LOW → P0+P1+M fixed, L deferred

**P0 fixes:**
- P0-1: `assignmentId` returned from `flagForNative` action + written to store via `onSuccess` + Realtime handler — fixes `FindingCommentThread` not rendering until page refresh
- P0-2: Override status picker dialog (Accept/Reject) replaces hardcoded `'accepted'` — native reviewer can now reject via override

**P1 fixes:**
- P1-1: Realtime assignment handler writes `assignmentId` from `row.id`
- P1-2: Stale rollback guard — check `updatedAt === optimisticUpdatedAt` before reverting on confirm/override failure. Shared `executeNativeConfirm`/`executeNativeOverride` handlers replace 4 inline duplicates
- P1-3: `flaggerComment` type aligned to `string | null | undefined` across `FindingDetailContent`, `FindingCommentThread`, `FindingForDisplay`, `Finding`

**M fixes:**
- M1: `startNativeReview` INVALID_STATE tests for `confirmed`/`overridden` (+2 tests)
- M2: `getFindingComments` UUID validation test (+1 test)
- M6: Vacuous keyboard test rewritten with real browser shortcuts check

**Post-R2 manual fix (Mona):**
- F key reverted to original `handleFlag` behavior (simple flag)
- **Shift+F** = new shortcut to open `FlagForNativeDialog` (QA reviewers only) — registered via `register('shift+f', ...)` in bulk keyboard `useEffect`, guarded by `!isNativeReviewer`
- KeyboardCheatSheet updated: `{ keys: ['Shift+F'], description: 'Flag for native review' }`
- Rationale: F remains non-breaking for existing workflow, Shift+F is explicit action for native assignment dialog

**Verification:** type-check ✅ | lint ✅ | 138/139 files, 1292/1293 tests GREEN (1 pre-existing fixed in commit)

### File List
**New files (10):**
- src/features/review/actions/flagForNative.action.ts
- src/features/review/actions/getNativeReviewers.action.ts
- src/features/review/actions/confirmNativeReview.action.ts
- src/features/review/actions/overrideNativeReview.action.ts
- src/features/review/actions/startNativeReview.action.ts
- src/features/review/actions/addFindingComment.action.ts
- src/features/review/actions/getFindingComments.action.ts
- src/features/review/components/FlagForNativeDialog.tsx
- src/features/review/components/FindingCommentThread.tsx

**New files (CR R1):**
- supabase/migrations/00028_file_assignments_role_scoped.sql (M6: RLS role-scoped policies)

**Modified files (20+):**
- src/features/review/utils/state-transitions.ts (confirm_native)
- src/features/review/utils/state-transitions.test.ts (updated expected matrix)
- src/features/review/utils/state-transitions.native.test.ts (activated 7 tests)
- src/features/review/validation/reviewAction.schema.ts (4 new schemas)
- src/features/review/validation/reviewAction.schema.native.test.ts (activated 18+7 BV tests)
- src/features/review/types.ts (assignment fields, notification types, flaggerComment nullable)
- src/types/finding.ts (assignment fields on Finding, flaggerComment nullable)
- src/features/review/hooks/use-review-actions.ts (confirm_native in maps)
- src/features/review/hooks/use-review-actions.test.ts (CR-C4: getStoreFileState mock fix)
- src/features/review/hooks/use-keyboard-actions.native.test.ts (CR-C5: rewritten with real assertions)
- src/features/review/hooks/use-findings-subscription.ts (CR-M3: finding_assignments Realtime subscription)
- src/features/review/actions/getFileReviewData.action.ts (Q9 assignments, userRole, CR-M1 type, CR-M2 assignedByName)
- src/features/review/actions/flagForNative.action.ts (CR-H6: real targetLang in determineNonNative)
- src/features/review/actions/confirmNativeReview.action.ts (CR-H8: fileId filter, CR-M9: null guard comment)
- src/features/review/actions/overrideNativeReview.action.ts (CR-H8: fileId filter)
- src/features/review/actions/getFindingComments.action.ts (CR-H5: limit+UUID, CR-H7: leftJoin dedup)
- src/features/review/components/FindingCard.tsx (assignment badge)
- src/features/review/components/ReviewActionBar.tsx (CR-H1: hide standard buttons for native, C/O native buttons)
- src/features/review/components/FindingDetailContent.tsx (comment thread)
- src/features/review/components/FindingList.tsx (CR-H4: pass assignmentStatus/assignedToName)
- src/features/review/components/ReviewPageClient.tsx (CR-C1: wire actions, CR-C2: assignment fields in memo, CR-C3: flag dialog, CR-H2: detail props, CR-H3: hotkey handlers, CR-M4: flag dialog store merge)
- src/features/review/components/FlagForNativeDialog.tsx (CR-M4: onSuccess passes assignment data)
- src/features/review/actions/flagForNative.action.test.ts (activated 12 tests, +2 CR-H9)
- src/features/review/actions/confirmNativeReview.action.test.ts (activated 10 tests, +2 CR-H9, CR-L4)
- src/features/review/actions/overrideNativeReview.action.test.ts (activated 9 tests, +3 CR-H9)
- src/features/review/actions/addFindingComment.action.test.ts (activated 7 tests, +1 CR-M6)
- src/features/review/actions/getFindingComments.action.test.ts (activated 4 tests, fixed sql mock)
- src/features/review/actions/getNativeReviewers.action.test.ts (activated 4 tests)
- src/features/review/actions/startNativeReview.action.test.ts (activated 5 tests, +1 CR-H9)
- src/test/factories.ts (buildFindingAssignment, buildFindingComment)
- src/features/review/components/ReviewPageClient.test.tsx (+ 7 sibling test files: new fields)
- supabase/migrations/00027_story_5_2c_findings_rls_hardening.sql (CR-L2-RLS: added exclusion comment)
