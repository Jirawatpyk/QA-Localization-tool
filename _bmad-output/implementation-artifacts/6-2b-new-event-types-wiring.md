# Story 6.2b: New Event Types Wiring

Status: done

## Story

As a QA Reviewer,
I want to receive notifications when file analysis completes, glossary is updated, or a file is auto-passed,
So that I stay informed about project changes and can respond quickly without manual status checking.

## Context: What 6.2a Already Delivered

> **CRITICAL:** 6.2a built the foundation. 6.2b wires the 3 remaining event types. Do NOT recreate any infrastructure.

| Artifact | Status | Location |
|----------|--------|----------|
| `NOTIFICATION_TYPES` — 11 constants (including 3 new) | DONE | `src/lib/notifications/types.ts` |
| `createNotification()` + `createBulkNotification()` | DONE | `src/lib/notifications/createNotification.ts` |
| `getNotificationLink()` — all 11 types mapped | DONE | `src/features/dashboard/helpers/getNotificationLink.ts` |
| `NOTIFICATION_ICON_MAP` — all 11 types mapped | DONE | `src/features/dashboard/helpers/notificationIcons.ts` |
| Zod `z.enum()` validation in `useNotifications` | DONE | `src/features/dashboard/hooks/useNotifications.ts` |
| `AppNotification.type` uses `NotificationType` | DONE | `src/features/dashboard/types.ts` |
| RLS SELECT/UPDATE, partial indexes, Realtime | DONE | migration 0021 + 0024 |

**What's MISSING (6.2b scope):**
1. `analysis_complete` — no INSERT call in `scoreFile.ts` yet
2. `glossary_updated` — no INSERT call in glossary actions yet
3. `auto_pass_triggered` — no INSERT call in `scoreFile.ts` yet
4. Metadata contracts for the 3 new types (TBD from 6.2a CR deferred item)
5. `native_comment_added` metadata missing `projectId` + `fileId` (6.2a CR deferred item)
6. Unit tests for each new notification wiring
7. Self-notify guard (don't notify the user who triggered the action)

## Acceptance Criteria

### AC1: `analysis_complete` Notification on Score Calculated

**Given** the Inngest pipeline finishes processing a file (L1, L1+L2, or L1+L2+L3)
**When** `scoreFile()` completes with `status = 'calculated'`
**Then** the **file assignee** (from `file_assignments WHERE fileId AND status IN ('assigned','in_progress')`) receives an `analysis_complete` notification via `createNotification()`
**And** if no file assignee exists, no notification is sent (guard: skip silently)
**And** the notification includes: `title = "File analysis complete"`, `body` with MQM score + layer info
**And** `projectId` is set as the DB column (not just metadata)
**And** `metadata = { fileId, layerCompleted, mqmScore, status }`
**And** the notification is non-blocking (try/catch — never fail the score)
**And** the triggering user (`userId`) is excluded (self-notify guard — if assignee === triggeredBy, skip)
**And** `status = 'na'`, `status = 'partial'`, or `status = 'auto_passed'` do NOT trigger `analysis_complete`
**Note:** When `status = 'auto_passed'`, only `auto_pass_triggered` fires (AC3) — NOT both. Auto-passed files don't need review, so `analysis_complete` would be misleading.

### AC2: `glossary_updated` Notification on Glossary Changes

**Given** a user modifies glossary data
**When** the action succeeds (after audit log)
**Then** recipients vary by impact level:

**Low-impact (single term):** `createTerm`, `updateTerm`, `deleteTerm`
→ **Tenant admins** (excluding acting user) receive notification

**High-impact (bulk/destructive):** `importGlossary`, `deleteGlossary`
→ **Project members** (admins + users with active `file_assignments` in that project, excluding acting user) receive notification

**And** `projectId` is set as the DB column (derived from glossary → project relationship)
**And** metadata varies by action:

| Action | Recipients | metadata shape |
|--------|-----------|---------------|
| `createTerm` | admins | `{ glossaryId, action: 'term_created', sourceTerm, targetTerm }` |
| `updateTerm` | admins | `{ glossaryId, action: 'term_updated', sourceTerm, targetTerm }` |
| `deleteTerm` | admins | `{ glossaryId, action: 'term_deleted', sourceTerm }` |
| `importGlossary` | project members | `{ glossaryId, action: 'glossary_imported', termCount }` |
| `deleteGlossary` | project members | `{ glossaryId, action: 'glossary_deleted', glossaryName }` |

**And** the notification is fire-and-forget (`.catch(() => {})` per Guardrail #23)

### AC3: `auto_pass_triggered` Notification on Auto-Pass

**Given** `scoreFile()` determines a file is eligible for auto-pass
**When** `status = 'auto_passed'` is persisted
**Then** the **file assignee + all tenant admins** (excluding the triggering user) receive an `auto_pass_triggered` notification
**And** `projectId` is set as the DB column
**And** `metadata = { fileId, mqmScore, threshold, rationale, isNewPair }`
**And** the notification is non-blocking (helper try/catch handles failure)
**Note:** `auto_pass_triggered` fires INSTEAD of `analysis_complete` — auto-passed files don't need review. Admins receive it because auto-pass is a policy decision they need visibility on.

### AC4: Self-Notify Guard

**Given** a user triggers an action that creates a notification (e.g., admin imports glossary)
**When** the recipient list is built
**Then** the acting user's ID is filtered out from recipients
**And** if after filtering, recipients is empty, no notification is created (guard `recipients.length === 0`)

### AC5: Fix `native_comment_added` Missing Metadata (Deferred from 6.2a CR)

**Given** a comment is added to a flagged finding via `addFindingComment.action.ts`
**When** the `native_comment_added` notification is created (line ~108-115)
**Then** `metadata` includes `projectId` and `fileId` (in addition to existing `findingId`, `assignmentId`, `commentId`)
**And** `projectId` is also passed as the DB column (top-level param to `createNotification`)
**And** `getNotificationLink()` now returns a valid route instead of `null` for `native_comment_added`
**And** data is available from the existing `findingAssignments` query — just expand SELECT to include `fileId` + `projectId` (both columns exist on `findingAssignments` table)

### AC6: Unit Tests

**Given** the new notification wiring
**When** tests run
**Then** the following pass:
- `src/features/scoring/helpers/scoreFile.test.ts` — new tests for `analysis_complete` + `auto_pass_triggered` notifications
- `src/features/glossary/actions/createTerm.action.test.ts` — new test for `glossary_updated` notification
- `src/features/glossary/actions/importGlossary.action.test.ts` — new test for `glossary_updated` notification
- `src/features/review/actions/addFindingComment.action.test.ts` — verify metadata includes `projectId` + `fileId` (AC5 fix)
- Existing tests continue to pass (no regression)

## Tasks / Subtasks

**Task dependency:** T1 (shared helper) → T2/T3/T4 (parallel) → T5 → T6

- [x] **T1: Create recipient helper functions** (AC: #1, #3, #4)
  - [x] 1.1 Create `src/lib/notifications/recipients.ts` with 3 helpers:
    - `getAdminRecipients(tenantId, excludeUserId?)` — query `userRoles` WHERE `role = 'admin'` + `withTenant()`, filter out excludeUserId. Return `Array<{ userId: string }>`
    - `getFileAssignee(fileId, tenantId)` — query `file_assignments` WHERE `fileId` AND `status IN ('assigned','in_progress')` + `withTenant()`. Return `string | null` (userId or null if unassigned)
    - `getProjectMembers(projectId, tenantId, excludeUserId?)` — query admins UNION users with active `file_assignments` in project + `withTenant()`, deduplicate, filter out excludeUserId. Return `Array<{ userId: string }>`
  - [x] 1.2 All helpers use `withTenant()` (Guardrail #1)
  - [x] 1.3 Self-notify guard: `excludeUserId` param on `getAdminRecipients` + `getProjectMembers` only. `getFileAssignee` returns single userId — caller handles self-notify guard manually (`if (assignee !== userId)`)
  - [x] 1.4 Unit test: `src/lib/notifications/recipients.test.ts` — tests per helper: returns correct users, excludes self, returns empty when none, deduplication in getProjectMembers

- [x] **T2: Wire `analysis_complete` + `auto_pass_triggered` in `scoreFile.ts`** (AC: #1, #3)
  - [x] 2.1 Import `getFileAssignee`, `getAdminRecipients`, `NOTIFICATION_TYPES` from recipients helper
  - [x] 2.2 After audit log block (line ~262), before graduation notification (line ~267):
    - If `status === 'calculated'` → query `getFileAssignee(fileId, tenantId)` → fire `ANALYSIS_COMPLETE` to assignee (skip if null or assignee === userId)
    - If `status === 'auto_passed'` → fire `AUTO_PASS_TRIGGERED` to **assignee + admins** (deduplicate, exclude triggeredBy user)
    - If `status === 'na'` or `status === 'partial'` → do NOT notify
  - [x] 2.3 Each notification wrapped in try/catch with `logger.warn` (non-blocking)
  - [x] 2.4 `analysis_complete`: use `createNotification()` (single recipient = assignee). Self-notify guard: skip if `assignee === userId`
  - [x] 2.5 `auto_pass_triggered`: merge assignee + admins into deduplicated recipients array, use `createBulkNotification()`. Self-notify guard via `excludeUserId`
  - [x] 2.6 `analysis_complete` metadata: `{ fileId, layerCompleted, mqmScore: newScore.mqmScore, status: newScore.status }`
  - [x] 2.7 `auto_pass_triggered` metadata: `{ fileId, mqmScore: newScore.mqmScore, threshold: autoPassResult.rationaleData.threshold, rationale: newScore.autoPassRationale, isNewPair: autoPassResult.isNewPair }`
  - [x] 2.8 Both pass `projectId` as top-level param (DB column, per `getNotificationLink` contract)
  - [x] 2.9 Add tests in `scoreFile.test.ts` — 5 scenarios: calculated→assignee gets analysis_complete, calculated+no assignee→skip, auto_passed→assignee+admins get auto_pass_triggered, na→no notification, partial→no notification

- [x] **T3: Wire `glossary_updated` in glossary actions** (AC: #2)
  - [x] 3.1 Import helpers in each glossary action:
    - **Low-impact** (createTerm, updateTerm, deleteTerm): import `getAdminRecipients`
    - **High-impact** (importGlossary, deleteGlossary): import `getProjectMembers`
  - [x] 3.2 After audit log block in each action, add notification call:
    - Low-impact: `getAdminRecipients(tenantId, currentUser.id)` → `createBulkNotification()`
    - High-impact: `getProjectMembers(projectId, tenantId, currentUser.id)` → `createBulkNotification()`
    - Fire-and-forget: `.catch(() => {})` (Guardrail #23)
  - [x] 3.3 Each action has unique `title` + `body` + `metadata.action` per AC2 table
  - [x] 3.4 Extract `projectId` from glossary → use as DB column param
  - [x] 3.5 Add 1 notification test each to `createTerm.action.test.ts` and `importGlossary.action.test.ts`

- [x] **T4: Fix `native_comment_added` metadata in `addFindingComment.action.ts`** (AC: #5)
  - [x] 4.1 Expand existing `findingAssignments` SELECT (line ~49-52) to include `fileId` + `projectId`:
    ```
    fileId: findingAssignments.fileId,
    projectId: findingAssignments.projectId,
    ```
  - [x] 4.2 Update `createNotification` call (line ~108-115):
    - Add `projectId: assignment.projectId` as top-level param (DB column)
    - Add `projectId: assignment.projectId, fileId: assignment.fileId` to metadata object
  - [x] 4.3 Add/update test in `addFindingComment.action.test.ts` — verify metadata contains `projectId` + `fileId`
  - [x] 4.4 Mark deferred item as DONE in `_bmad-output/implementation-artifacts/deferred-work.md`

- [x] **T5: Verify existing navigation + icon mappings** (AC: #1, #2, #3, #5)
  - [x] 4.1 Run existing `getNotificationLink.test.ts` — all 11 types should pass (already mapped in 6.2a)
  - [x] 4.2 Run existing `notificationIcons.test.ts` — all 11 types should pass
  - [x] 4.3 Verify `getNotificationLink` correctly resolves new metadata shapes (fileId from metadata, projectId from column)

- [x] **T6: Full test suite verification** (AC: #6)
  - [x] 5.1 `npm run test:unit` — all story-related tests pass (5 pre-existing failures in unrelated files)
  - [x] 5.2 `npm run lint` — 0 errors (66 pre-existing warnings)
  - [x] 5.3 `npm run type-check` — 0 errors
  - [x] 5.4 Regression check: dashboard + notifications module tests still GREEN

## Dev Notes

### Architecture & Patterns

- **Notification helper:** `src/lib/notifications/createNotification.ts` — centralized INSERT (Guardrail #85)
- **Types:** `src/lib/notifications/types.ts` — 11 constants, `NotificationType` union
- **Fire-and-forget pattern:** All notification calls must use `.catch(() => {})` (Guardrail #23) or rely on the helper's internal try/catch. Never let notification failure block the main operation
- **Named exports only** — no `export default`
- **`@/` alias** for all imports

### Existing `createBulkNotification` API

```typescript
interface CreateBulkNotificationInput {
  tenantId: TenantId
  recipients: Array<{ userId: string }>
  type: NotificationType
  title: string
  body: string
  projectId?: string           // ← DB column (preferred for getNotificationLink)
  metadata?: Record<string, unknown>  // ← fileId, action-specific context
}
```

**Internal behavior:** Helper wraps in try/catch + logger.error — never throws. Guard: `if (recipients.length === 0) return`.

### Recipient Helper Design (3 functions in `src/lib/notifications/recipients.ts`)

```typescript
// 1. Admin recipients — reuse existing pattern from scoreFile.ts:332-335
export async function getAdminRecipients(
  tenantId: TenantId,
  excludeUserId?: string,
): Promise<Array<{ userId: string }>> {
  const admins = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(and(eq(userRoles.role, 'admin'), withTenant(userRoles.tenantId, tenantId)))
  if (!excludeUserId) return admins
  return admins.filter(a => a.userId !== excludeUserId)
}

// 2. File assignee — single user from file_assignments
export async function getFileAssignee(
  fileId: string,
  tenantId: TenantId,
): Promise<string | null> {
  const [row] = await db
    .select({ userId: fileAssignments.assignedTo })
    .from(fileAssignments)
    .where(and(
      eq(fileAssignments.fileId, fileId),
      withTenant(fileAssignments.tenantId, tenantId),
      inArray(fileAssignments.status, ['assigned', 'in_progress']),
    ))
    .limit(1)
  return row?.userId ?? null
}

// 3. Project members — admins + users with active assignments in project (deduplicated)
export async function getProjectMembers(
  projectId: string,
  tenantId: TenantId,
  excludeUserId?: string,
): Promise<Array<{ userId: string }>> {
  const admins = await getAdminRecipients(tenantId)
  const assignees = await db
    .selectDistinct({ userId: fileAssignments.assignedTo })
    .from(fileAssignments)
    .where(and(
      eq(fileAssignments.projectId, projectId),
      withTenant(fileAssignments.tenantId, tenantId),
      inArray(fileAssignments.status, ['assigned', 'in_progress']),
    ))
  // Deduplicate (admin may also be assignee)
  const seen = new Set<string>()
  const result: Array<{ userId: string }> = []
  for (const u of [...admins, ...assignees]) {
    if (excludeUserId && u.userId === excludeUserId) continue
    if (seen.has(u.userId)) continue
    seen.add(u.userId)
    result.push(u)
  }
  return result
}
```

**Note:** `inArray()` with empty array is safe here — `file_assignments` will always have at least the 2 status values. But guard `getProjectMembers` result: if empty, skip notification (createBulkNotification already guards `recipients.length === 0`).

### `scoreFile.ts` Insertion Point

```
Line ~240: Transaction commits (newScore persisted)
Line ~242: Audit log try/catch
Line ~262: End of audit log block
  ← INSERT HERE: analysis_complete / auto_pass_triggered notification
Line ~267: Language pair graduation notification (existing)
Line ~282: End of graduation block
Line ~284: Return scoreResult
```

**Decision (Party Mode D1):** `auto_pass_triggered` fires INSTEAD of `analysis_complete` (not both). Auto-passed files don't need review — sending `analysis_complete` to the assignee would be misleading. `auto_pass_triggered` goes to **assignee + admins** because admins need visibility on policy decisions.

**DRY bonus (optional):** The existing `createGraduationNotification()` at line ~303 does an inline admin query (lines 332-335). After T1 creates `getAdminRecipients()`, the dev may refactor graduation to use the new helper too — reducing duplication. Not required for AC but improves consistency.

### Glossary Action Insertion Points

Each glossary action follows this pattern:
```
1. requireRole('admin')
2. Validate input (Zod)
3. DB operation (create/update/delete)
4. writeAuditLog() try/catch
   ← INSERT HERE: glossary_updated notification
5. revalidateTag/revalidatePath
6. return success
```

**Glossary `projectId` extraction:**
- `createTerm` / `updateTerm` / `deleteTerm`: glossary has `projectId` — query from `glossaries` table JOIN or lookup
- `importGlossary`: `parsed.data.projectId` available directly
- `deleteGlossary`: need to capture `projectId` before deletion (read glossary first)

**Note:** `createTerm.action.ts` already queries the glossary to verify ownership (line ~55 area). Reuse the `glossary.projectId` variable.

### Self-Notify Guard Design

Built into all 3 helpers via `excludeUserId` param. Additional guard for `analysis_complete`:
```typescript
// In scoreFile.ts — analysis_complete goes to single assignee
const assignee = await getFileAssignee(fileId, tenantId)
if (assignee && assignee !== userId) {  // Skip if no assignee or self
  createNotification({ ..., userId: assignee, ... }).catch(() => {})
}
```

### Metadata Contracts (finalized for getNotificationLink)

| Type | projectId source | metadata shape |
|------|-----------------|----------------|
| `analysis_complete` | DB column | `{ fileId, layerCompleted, mqmScore, status }` |
| `glossary_updated` | DB column | `{ glossaryId, action, sourceTerm?, targetTerm?, termCount?, glossaryName? }` |
| `auto_pass_triggered` | DB column | `{ fileId, mqmScore, threshold, rationale, isNewPair }` |

**Critical:** `getNotificationLink` reads `fileId` from `metadata.fileId`. Both `analysis_complete` and `auto_pass_triggered` MUST include `fileId` in metadata for navigation to work. `glossary_updated` does NOT need `fileId` — it navigates to `/projects/{projectId}/glossary`.

### Guardrails

| # | Rule | How It Applies |
|---|------|----------------|
| #1 | `withTenant()` on EVERY query | All 3 recipient helpers + all notification queries |
| #4 | `inArray(col, [])` = invalid SQL | `getFileAssignee` uses hardcoded `['assigned', 'in_progress']` (always 2 values — safe). Never pass dynamic empty array |
| #23 | `void asyncFn()` swallows errors | Use `.catch(() => {})` for fire-and-forget notification calls |
| #85 | Centralize notification INSERT | Use `createNotification()` / `createBulkNotification()` — no inline `db.insert(notifications)` |
| #86 | Group at query time, not INSERT | Insert individual rows per recipient; grouping is 6-2c scope |
| #87 | `projectId` as DB column | Always pass `projectId` as top-level param to helper |
| #89 | Notification RLS | Already done — no action needed |
| #90 | Toast coalescing | Individual INSERTs; batching is 6-2c scope |
| #94 | Metadata merge, never replace | Not applicable (all INSERTs, no updates) |

### Scope Boundaries

**IN scope:** Wire 3 event types, create 3 recipient helpers, self-notify guard, unit tests.

**OUT of scope:**
- Toast coalescing / batch grouping UI (6-2c)
- Archive cron (6-2d)
- E2E tests for notifications (6-2c covers grouped UI)

### Party Mode Decisions (2026-04-01)

| # | Decision | Rationale |
|---|----------|-----------|
| **D1** | `auto_passed` → send only `auto_pass_triggered`, NOT `analysis_complete` | Auto-passed files don't need review — analysis_complete would mislead assignee |
| **D2** | Recipients per type: `analysis_complete`→assignee, `auto_pass_triggered`→assignee+admins, `glossary_updated`→admins or project members | Matches architect spike Section 1.3. Reduces notification noise |
| **D3** | `glossary_updated` split by impact: single term→admins only, bulk/delete→project members | Risk-based approach — low-impact changes don't warrant notifying all project members |

### Previous Story Intelligence (6.2a)

**CR findings from 6.2a that apply to 6.2b:**
- `projectId` column is separate from metadata — always pass as top-level param (6.2a CR R1 fix)
- `native_comment_added` lacks lookup mechanism — do NOT try to fix in 6.2b (deferred by design)
- New types metadata was explicitly deferred to 6.2b — this story defines the contracts

**Code Review learnings from 6.1:**
- Fire-and-forget: `.catch(() => {})` pattern (not bare `void`) per Guardrail #23
- Notification failures must NEVER block the main operation
- Test mocks: use valid `NotificationType` values (not arbitrary strings like `'file_processed'`)

### Git Intelligence (recent commits)

```
a6abdee fix(story-6.2a): CR R1+R3 — 9 patches across 3 review rounds
9dedef5 feat(story-6.2a): notification schema & helper centralization
```

Pattern: conventional commits with `feat(story-X.Y)` or `fix(story-X.Y)` prefix.

### Testing Strategy

**Unit tests only** — no E2E for this story (6-2c covers the UI). Test via mock:

1. **`scoreFile.test.ts`** — mock `createNotification`, `createBulkNotification`, `getFileAssignee`, `getAdminRecipients`
   - `calculated` + assignee exists → `createNotification` called with `ANALYSIS_COMPLETE` to assignee
   - `calculated` + no assignee → no notification sent
   - `calculated` + assignee === triggeredBy → self-notify guard, no notification
   - `auto_passed` → `createBulkNotification` called with `AUTO_PASS_TRIGGERED` to assignee+admins
   - `na` / `partial` → no notification at all

2. **Glossary action tests** — mock `createBulkNotification`, `getAdminRecipients`, `getProjectMembers`
   - `createTerm` → `getAdminRecipients` called (low-impact)
   - `importGlossary` → `getProjectMembers` called (high-impact)
   - Verify fire-and-forget pattern (action succeeds even if notification fails)

3. **`recipients.test.ts`** — mock `db` + `drizzleMock`
   - `getAdminRecipients`: returns admins, excludes self, returns empty
   - `getFileAssignee`: returns userId when assigned, returns null when unassigned
   - `getProjectMembers`: returns admins+assignees deduplicated, excludes self, handles empty

### Project Structure Notes

| File | Change |
|------|--------|
| `src/lib/notifications/recipients.ts` | **NEW** — 3 recipient helpers (getAdminRecipients, getFileAssignee, getProjectMembers) |
| `src/lib/notifications/recipients.test.ts` | **NEW** — unit tests for all 3 helpers |
| `src/features/scoring/helpers/scoreFile.ts` | **MODIFY** — add analysis_complete + auto_pass_triggered |
| `src/features/scoring/helpers/scoreFile.test.ts` | **MODIFY** — add notification tests |
| `src/features/glossary/actions/createTerm.action.ts` | **MODIFY** — add glossary_updated |
| `src/features/glossary/actions/updateTerm.action.ts` | **MODIFY** — add glossary_updated |
| `src/features/glossary/actions/deleteTerm.action.ts` | **MODIFY** — add glossary_updated |
| `src/features/glossary/actions/importGlossary.action.ts` | **MODIFY** — add glossary_updated |
| `src/features/glossary/actions/deleteGlossary.action.ts` | **MODIFY** — add glossary_updated |
| `src/features/glossary/actions/createTerm.action.test.ts` | **MODIFY or NEW** — add notification test |
| `src/features/glossary/actions/importGlossary.action.test.ts` | **MODIFY or NEW** — add notification test |
| `src/features/review/actions/addFindingComment.action.ts` | **MODIFY** — expand metadata with projectId + fileId (AC5) |
| `src/features/review/actions/addFindingComment.action.test.ts` | **MODIFY or NEW** — verify metadata fix |

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-6-batch-processing-team-collaboration.md` — Story 6.2 AC]
- [Source: `_bmad-output/implementation-artifacts/6-2a-notification-schema-helper-centralization.md` — Foundation story]
- [Source: `src/lib/notifications/createNotification.ts` — Helper API (79 lines)]
- [Source: `src/lib/notifications/types.ts` — 11 type constants]
- [Source: `src/features/scoring/helpers/scoreFile.ts` — Score calculation + notification site (line ~262)]
- [Source: `src/features/dashboard/helpers/getNotificationLink.ts` — Navigation routes for all 11 types]
- [Source: `src/features/dashboard/helpers/notificationIcons.ts` — Icon mapping for all 11 types]
- [Source: `CLAUDE-guardrails-epic6.md#85-90` — Notification guardrails]
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md` — 6.2a CR deferred: metadata shape TBD]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- scoreFile.test.ts graduation test callIndex shifted from 8→7 due to `createBulkNotification` mock (no longer hitting DB proxy)
- `exactOptionalPropertyTypes: true` required spread pattern `...(val ? { key: val } : {})` instead of `key: val ?? undefined`
- `AutoPassResult` type has no `threshold` — accessed via `rationaleData?.threshold`

### Completion Notes List

- T1: Created `src/lib/notifications/recipients.ts` with 3 helpers (getAdminRecipients, getFileAssignee, getProjectMembers), all using `withTenant()`. 8 unit tests pass.
- T2: Wired `analysis_complete` (calculated→assignee) and `auto_pass_triggered` (auto_passed→assignee+admins) in scoreFile.ts. Self-notify guard on both. 5 new test scenarios added (50 total pass).
- T3: Wired `glossary_updated` in all 5 glossary actions — low-impact (createTerm/updateTerm/deleteTerm→admins) and high-impact (importGlossary/deleteGlossary→project members). Fire-and-forget with `.catch(() => {})`. 2 new tests added.
- T4: Fixed `native_comment_added` metadata — expanded findingAssignments SELECT to include fileId + projectId, added both to notification metadata + projectId as DB column. Marked deferred items DONE.
- T5: Verified all 11 notification types pass for getNotificationLink (21 tests) and notificationIcons (6 tests).
- T6: type-check 0 errors, lint 0 errors, all story-related unit tests GREEN. 5 pre-existing failures in unrelated files.

### File List

**NEW:**
- `src/lib/notifications/recipients.ts` — 3 recipient helpers (getAdminRecipients, getFileAssignee, getProjectMembers)
- `src/lib/notifications/recipients.test.ts` — 8 unit tests for recipient helpers

**MODIFIED:**
- `src/features/scoring/helpers/scoreFile.ts` — added analysis_complete + auto_pass_triggered notifications
- `src/features/scoring/helpers/scoreFile.test.ts` — added 5 notification tests + mocks for createNotification/recipients
- `src/features/glossary/actions/createTerm.action.ts` — added glossary_updated notification (low-impact)
- `src/features/glossary/actions/updateTerm.action.ts` — added glossary_updated notification (low-impact)
- `src/features/glossary/actions/deleteTerm.action.ts` — added glossary_updated notification (low-impact)
- `src/features/glossary/actions/importGlossary.action.ts` — added glossary_updated notification (high-impact)
- `src/features/glossary/actions/deleteGlossary.action.ts` — added glossary_updated notification (high-impact)
- `src/features/glossary/actions/createTerm.action.test.ts` — added notification verification test
- `src/features/glossary/actions/importGlossary.action.test.ts` — added notification verification test
- `src/features/review/actions/addFindingComment.action.ts` — expanded SELECT + metadata with projectId/fileId
- `src/features/review/actions/addFindingComment.action.test.ts` — added metadata verification test + mock for createNotification
- `_bmad-output/implementation-artifacts/deferred-work.md` — marked 2 deferred items as DONE

### Review Findings

- [x] [Review][Patch] P1: `await ...catch(() => {})` redundant double-wrap — inner `.catch` swallows before outer logger [`scoreFile.ts:277,313`] ✅ Fixed: removed inner `.catch()`, outer try/catch handles
- [x] [Review][Patch] P2: `addFindingComment` uses blocking `await createNotification()` — should be fire-and-forget [`addFindingComment.action.ts:110`] ✅ Fixed: changed to `.catch(() => {})` fire-and-forget
- [x] [Review][Patch] P3: `auto_pass_triggered` metadata `threshold`/`isNewPair` become `undefined` when `rationaleData` null — use `?? null` [`scoreFile.ts:323-325`] ✅ Fixed: added `?? null` on threshold, rationale, isNewPair
- [x] [Review][Patch] P4: Test missing assertions for `layerCompleted` + `status` in analysis_complete metadata [`scoreFile.test.ts`] ✅ Fixed: added assertions
- [x] [Review][Patch] P5: Test missing assertions for `rationale` + `isNewPair` in auto_pass_triggered metadata [`scoreFile.test.ts`] ✅ Fixed: added assertions
- [x] [Review][Patch] P6: No independent test for `partial` status notification guard [`scoreFile.test.ts`] ✅ Fixed: added test with `scoreStatus: 'partial'` + reset notification mocks in beforeEach
- [x] [Review][Patch] P7: No test for empty recipients (assignee=self + no admins) → skip notification [`scoreFile.test.ts`] ✅ Fixed: added test
- [x] [Review][Fixed] D1: `addFindingComment` admin commenter notifies only 1 of 2 other parties [`addFindingComment.action.ts:108-109`] ✅ Fixed: Set-based recipient collection notifies all parties except commenter
- [x] [Review][Fixed] D2: `revalidateTag(\`glossary-null\`)` when `glossary.projectId` is null [`createTerm/updateTerm/deleteTerm`] ✅ Fixed: added `if (projectId)` guard before revalidateTag
- [x] [Review][Patch] P8 (R2): `deleteGlossary.action.ts` revalidateTag missing same `if (projectId)` guard ✅ Fixed
