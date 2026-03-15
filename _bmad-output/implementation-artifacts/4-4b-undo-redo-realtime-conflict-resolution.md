# Story 4.4b: Undo/Redo & Realtime Conflict Resolution

Status: ready-for-dev

## Story

As a QA Reviewer,
I want to undo/redo my review actions with Ctrl+Z/Ctrl+Shift+Z and receive conflict notifications when another reviewer changes the same finding,
so that I can confidently correct mistakes and collaborate without data loss.

## Scope Boundaries

| Feature | In Scope | Out of Scope |
|---------|----------|-------------|
| Undo status changes (accept/reject/flag/note/source_issue) | Yes | — |
| Undo severity override | Yes — restore previous severity + originalSeverity | — |
| Undo manual add finding | Yes — delete the manually added finding | — |
| Undo manual delete finding | Yes — re-insert with full snapshot | — |
| Redo all above | Yes | — |
| Realtime conflict detection (UPDATE + DELETE) | Yes | — |
| Undo update_note (text revert) | No | UndoEntry tracks status/severity only, not description text. Non-undoable action — user can manually re-edit note |
| Soft lock during note typing | No | Epic 5+ (UX spec concurrent editing) |
| Ctrl+Y as redo alias | Yes — trivial addition alongside Ctrl+Shift+Z | — |

## Acceptance Criteria

### AC1: Undo Single Action (Ctrl+Z)

**Given** a review action (accept/reject/flag/note/source_issue) was just performed
**When** the reviewer presses Ctrl+Z
**Then:**
- The finding reverts to its previous state atomically
- Server Action verifies `previous_state` matches current DB state before reverting (conflict check)
- Toast confirms: "Undone: [action description]" via `aria-live="polite"` region (Guardrail #33)
- Score recalculates via existing Inngest `finding.changed` event
- Auto-advance does NOT trigger on undo (stay on current finding)
- Audit log records undo action with `action_type: 'undo'`
- If undoing a **reject**: insert `feedback_events` row with `action: 'undo_reject'` to invalidate original AI training data (note: column is `action` varchar(30), NOT `event_type`)

### AC2: Undo Bulk Action (Atomic)

**Given** a bulk accept/reject was just performed (e.g., 8 findings bulk-accepted)
**When** the reviewer presses Ctrl+Z
**Then:**
- ALL findings in the batch revert to their individual previous states (bulk = 1 undo entry)
- Server Action receives the findings array from the client UndoEntry (NOT a batchId lookup — the client already has the snapshot)
- Each finding's `previous_state` is verified against current DB state
- Partially conflicted batches: revert non-conflicted findings, show conflict dialog for conflicted ones
- Toast confirms: "Undone: Bulk accept (8 findings)" or "Partially undone: 6/8 findings (2 conflicts)"
- If undoing a **bulk reject**: insert `feedback_events` rows with `action: 'undo_reject'` for each reverted finding

### AC3: Undo Severity Override

**Given** a severity override was just performed (e.g., Critical → Minor)
**When** the reviewer presses Ctrl+Z
**Then:**
- Finding's `severity` reverts to value before override
- Finding's `original_severity` is restored (null if first override, previous value otherwise)
- `UndoEntry.previousSeverity` stores the pre-override severity snapshot
- Score recalculates with restored severity
- Toast confirms: "Undone: Override severity (Critical → Minor)" via `aria-live="polite"`

### AC4: Undo Manual Add/Delete Finding

**Given** a manual finding was just added (Hotkey: +) or deleted
**When** the reviewer presses Ctrl+Z
**Then:**
- **Undo add**: the manually added finding is deleted (DELETE from findings + review_actions in transaction)
- **Undo delete**: the deleted finding is re-inserted with original data from snapshot (INSERT with explicit `id: snapshot.id` to override `defaultRandom()`, handle FK by inserting finding FIRST then review_actions)
- `UndoEntry` for delete stores full `FindingSnapshot` (all columns needed for re-insert)
- **FK guard**: before re-insert, verify `segmentId` still exists (segments FK is `onDelete: cascade` — if segment was deleted, undo-delete fails gracefully with toast "Cannot restore: parent segment was deleted")
- Toast confirms action via `aria-live="polite"`

### AC5: Redo (Ctrl+Shift+Z)

**Given** an action was undone via Ctrl+Z
**When** the reviewer presses Ctrl+Shift+Z
**Then:**
- The undone action is re-applied (finding returns to the state before undo)
- Redo stack clears when any NEW action is performed (standard undo/redo behavior)
- Server Action validates state consistency before re-applying
- Toast confirms: "Redone: [action description]" via `aria-live="polite"`

### AC6: Undo Stack Limits & Lifecycle

**Given** the undo stack management rules
**Then:**
- Undo stack stored in Zustand (per-tab, NOT persisted to server or localStorage)
- Max 20 entries; when 21st action performed, oldest entry dropped (FIFO)
- Stack clears on file navigation (`resetForFile()` already resets store)
- Bulk action = 1 stack entry (not N entries)
- New action clears redo stack
- Undo/redo are independent of browser native undo (no `document.execCommand`)
- Components use selector functions `selectCanUndo`/`selectCanRedo` (NOT full stack array) to avoid re-render on stack mutations

### AC7: Realtime Conflict Detection

**Given** reviewer A has an undo entry for finding #14 (previous_state: 'pending')
**When** reviewer B changes finding #14 via Supabase Realtime UPDATE event
**Then:**
- The undo entry for finding #14 is marked as `stale` in the store (per-finding, not entire entry)
- When reviewer A attempts Ctrl+Z on that entry, a conflict dialog appears:
  - Title: "Conflict Detected"
  - Body: "Finding #14 was modified by another user. Current state: Rejected. Your undo would revert to: Pending."
  - Actions: "Undo Anyway" (force revert) | "Cancel" (keep current state, remove from undo stack)
- Non-stale entries in the same batch can still be undone without conflict
- **Bulk conflict UX**: when bulk undo encounters partial conflicts, server reverts non-conflicted findings immediately, then returns `{ reverted, conflicted }`. Client shows single conflict dialog listing ALL conflicted findings: "2 of 8 findings were modified. Force undo remaining?" → "Force All" (force-undo all conflicted) | "Skip" (keep conflicted as-is, non-conflicted already reverted). No per-finding dialogs
- **On Realtime DELETE event**: remove all undo/redo entries referencing that finding, toast "Finding #14 no longer exists" via `aria-live="polite"`
- **Distinction**: stale (modified by other user) → conflict dialog on undo attempt; deleted → auto-remove from stack + toast

### AC8: Conflict Dialog UX

**Given** a conflict is detected during undo
**Then:**
- Dialog uses `AlertDialog` from shadcn/ui (not custom modal)
- Dialog is accessible: focus trap, Esc closes, `aria-modal="true"` (Guardrail #30)
- "Undo Anyway" = destructive action styling (red button)
- "Cancel" = default focus
- After resolution, removed from undo stack (no re-undo of conflicted entries)
- `aria-live="assertive"` announces conflict to screen readers (Guardrail #33)
- Dialog resets state on re-open (Guardrail #11)

## Tasks / Subtasks

### Task 1: UndoEntry Type & Zustand Store Extension (AC: #6)
- [ ] 1.1 Define `UndoEntry` type (SINGLE SOURCE OF TRUTH — see Dev Notes "Undo Entry Shape")
- [ ] 1.2 Define `FindingSnapshot` type for undo-delete — must match actual `findings` table columns exactly: `{ id, segmentId, fileId, projectId, tenantId, reviewSessionId, status, severity, originalSeverity, category, description, detectedByLayer, aiModel, aiConfidence, suggestedFix, sourceTextExcerpt, targetTextExcerpt, scope, relatedFileIds, segmentCount, createdAt, updatedAt }`. WARNING: column names differ from story shorthand — use `suggestedFix` (NOT `suggestion`), `aiConfidence` (NOT `confidence`). No `metadata` or `wordCount` column exists on `findings` table
- [ ] 1.3 Add `UndoRedoSlice` to `review.store.ts`: `undoStack: UndoEntry[]`, `redoStack: UndoEntry[]`, `undoFindingIndex: Map<string, Set<string>>` (findingId → Set of undoEntry IDs for O(1) lookup in Realtime handler), `pushUndo()`, `popUndo()`, `pushRedo()`, `popRedo()`, `clearUndoRedo()`, `markEntryStale(findingId)`, `removeEntriesForFinding(findingId)`. `pushUndo`/`popUndo` must maintain `undoFindingIndex` in sync
- [ ] 1.4 Expose undo/redo state via selector functions (NOT store fields — Zustand has no computed properties). Components MUST use: `const canUndo = useReviewStore(s => s.undoStack.length > 0)` and `const canRedo = useReviewStore(s => s.redoStack.length > 0)`. Export these as named selector functions: `export const selectCanUndo = (s: ReviewState) => s.undoStack.length > 0`. NEVER select the full `undoStack` array in render — only select length or boolean
- [ ] 1.5 Wire `resetForFile()` to also clear undo/redo stacks
- [ ] 1.6 Enforce max 20 entries in `pushUndo()` (drop oldest via `slice(-20)` if overflow)
- [ ] 1.7 Clear redo stack on any new action (`pushUndo` should call `set({ redoStack: [] })`)

### Task 2: Audit actionType Values (AC: #1)
- [ ] 2.1 Audit ALL Zod schemas and union types that validate `actionType` — add `'undo'` and `'redo'` as valid values
- [ ] 2.2 Check `src/features/review/validation/reviewAction.schema.ts` — update any action type enum/union
- [ ] 2.3 Check `src/types/finding.ts` or any `ReviewActionType` union — add `'undo' | 'redo'`
- [ ] 2.4 Check `src/db/schema/reviewActions.ts` — column is `varchar(50)`, no migration needed, but verify no runtime validation rejects unknown values

### Task 3: Undo Server Action — Status Revert (AC: #1, #2)
- [ ] 3.1 Create `src/features/review/actions/undoAction.action.ts`
- [ ] 3.2 Schema: `undoActionSchema = { findingId: uuid, fileId: uuid, projectId: uuid, previousState: FindingStatus, expectedCurrentState: FindingStatus, force: z.boolean().default(false) }`
- [ ] 3.3 Logic: fetch finding with `withTenant()` → if `!force`: verify `status === expectedCurrentState` → if mismatch, return `{ success: false, code: 'CONFLICT', error: 'State mismatch' }` → if match (or force=true): UPDATE finding `status` to `previousState` + set `updatedAt: new Date()` (CRITICAL: without updatedAt, Realtime merge guard in `useFindingsSubscription` will silently drop the change as stale) + INSERT `review_actions` with `action_type: 'undo'`. Return `serverUpdatedAt` in response for client timestamp sync
- [ ] 3.4 **feedback_events handling**: if original action was 'reject', INSERT `feedback_events` row with `action: 'undo_reject'` (column is `action` varchar(30), NOT `event_type`). Copy pattern from `rejectFinding.action.ts` lines 77-101 but set `action: 'undo_reject'` and `isFalsePositive: false`
- [ ] 3.5 Create `src/features/review/actions/undoBulkAction.action.ts` — accepts `{ findings: Array<{ findingId, previousState, expectedCurrentState }>, fileId, projectId }`
- [ ] 3.6 Bulk undo: transaction → verify each finding → partition into `canRevert` + `conflicted` → UPDATE `canRevert` findings → INSERT `review_actions` rows → INSERT `feedback_events` for undone rejects → return `{ reverted: string[], conflicted: string[] }`
- [ ] 3.7 Both actions: write audit log (best-effort, Guardrail #2)
- [ ] 3.8 Both actions: send `finding.changed` Inngest event for score recalculation

### Task 4: Undo Server Action — Severity Override Revert (AC: #3)
- [ ] 4.1 Create `src/features/review/actions/undoSeverityOverride.action.ts`
- [ ] 4.2 Schema: `undoSeverityOverrideSchema = { findingId: uuid, fileId: uuid, projectId: uuid, previousSeverity: FindingSeverity, previousOriginalSeverity: FindingSeverity | null, expectedCurrentSeverity: FindingSeverity }`
- [ ] 4.3 Logic: fetch finding → verify `severity === expectedCurrentSeverity` → UPDATE `severity` to `previousSeverity`, `original_severity` to `previousOriginalSeverity` + INSERT `review_actions` with `action_type: 'undo'`
- [ ] 4.4 Send `finding.changed` Inngest event (severity affects MQM score)

### Task 5: Undo Server Action — Manual Add/Delete Revert (AC: #4)
- [ ] 5.1 Create `src/features/review/actions/undoAddFinding.action.ts` — DELETE finding + associated review_actions in transaction (reverse of `addFinding.action.ts`)
- [ ] 5.2 Create `src/features/review/actions/undoDeleteFinding.action.ts` — re-INSERT finding from `FindingSnapshot` with explicit `id: snapshot.id` (overrides `defaultRandom()`). Handle FK order: insert finding FIRST, then review_actions. **FK guard before insert**: verify `segmentId` still exists in `segments` table (FK is `onDelete: cascade` — if parent segment was deleted, return `{ success: false, code: 'FK_VIOLATION', error: 'Parent segment was deleted' }`). Same check for `fileId → files`
- [ ] 5.3 Both: `withTenant()` on all queries, best-effort audit log, Inngest event

### Task 6: Redo Server Action (AC: #5)
- [ ] 6.1 Create `src/features/review/actions/redoAction.action.ts` — copy `undoAction.action.ts`, swap `previousState` ↔ `targetState` in UPDATE clause
- [ ] 6.2 Schema: `redoActionSchema = { findingId: uuid, fileId: uuid, projectId: uuid, targetState: FindingStatus, expectedCurrentState: FindingStatus }`
- [ ] 6.3 Create `src/features/review/actions/redoBulkAction.action.ts` — copy `undoBulkAction.action.ts` with reversed states
- [ ] 6.4 Redo of severity override: call `overrideSeverity.action.ts` with `newSeverity` from the UndoEntry's `newStates` context (the redo re-applies the override, so use the post-override severity as the target). Direction: UndoEntry stores `previousSeverity` = pre-override value. In redo context, the "target" is the opposite of what undo stored — use `UndoEntry.newSeverity` (add field if needed, or derive from the override action's original parameters stored in metadata)
- [ ] 6.5 Redo of add finding: call `addFinding.action.ts` with snapshot data
- [ ] 6.6 Redo of delete finding: call `deleteFinding.action.ts`

### Task 7: Hook — useUndoRedo (AC: #1, #2, #3, #4, #5, #8)
- [ ] 7.1 Create `src/features/review/hooks/use-undo-redo.ts`
- [ ] 7.2 `performUndo()`: pop from undoStack → branch by entry type:
  - `action === 'severity_override'` → call `undoSeverityOverride`
  - `action === 'add'` → call `undoAddFinding`
  - `action === 'delete'` → call `undoDeleteFinding`
  - `type === 'bulk'` → call `undoBulkAction`
  - default (single status change) → call `undoAction`
- [ ] 7.3 Optimistic revert before server call, rollback on failure
- [ ] 7.4 On success → push to redoStack → toast via `aria-live="polite"`
- [ ] 7.5 On conflict (code: 'CONFLICT') → show ConflictDialog → "Undo Anyway" calls with `force: true`
- [ ] 7.6 `performRedo()`: pop from redoStack → branch by entry type (mirror of undo) → push to undoStack on success
- [ ] 7.7 Debounce: 300ms guard via `inFlightRef = useRef(false)` pattern (matching `useReviewActions` debounce)
- [ ] 7.8 Handle deleted findings: check if finding exists in `findingsMap` before undo, auto-remove if missing

### Task 8: Realtime Conflict Detection (AC: #7)
- [ ] 8.1 Extend `useFindingsSubscription` — on UPDATE event, check if changed finding has entries in undoStack → call `markEntryStale(findingId)`
- [ ] 8.2 On DELETE event from Realtime → call `removeEntriesForFinding(findingId)` + toast "Finding no longer exists" via `aria-live="polite"`
- [ ] 8.3 For bulk entries: mark stale per-finding (`staleFindings.add(findingId)`), not entire batch

### Task 9: Conflict Dialog Component (AC: #8)
- [ ] 9.1 Create `src/features/review/components/ConflictDialog.tsx` — shadcn AlertDialog
- [ ] 9.2 Props: `{ open, finding: { id, currentState, undoTargetState }, onForceUndo, onCancel }`
- [ ] 9.3 Accessible: focus trap, Esc = cancel, `aria-modal="true"`, `aria-live="assertive"` for announcement
- [ ] 9.4 "Undo Anyway" = destructive variant (red), "Cancel" = default focus
- [ ] 9.5 Reset state on re-open via `useEffect(() => { if (open) ... }, [open])` (Guardrail #11)
- [ ] 9.6 Focus restore on close: `useRef(document.activeElement)` before open → restore on close (Guardrail #30)

### Task 10: Keyboard Integration (AC: #7 from AC section above, mapped to keyboard AC)
- [ ] 10.1 Register `Ctrl+Z` and `Ctrl+Shift+Z` in `use-keyboard-actions.ts` — scope: 'review' (not global)
- [ ] 10.2 Also register `Ctrl+Y` as alias for redo (same handler as Ctrl+Shift+Z)
- [ ] 10.3 Guard: suppress when `event.target` is input/textarea/select/contenteditable (Guardrail #28/34)
- [ ] 10.4 Guard: suppress when any modal is open (check `document.querySelector('[aria-modal="true"]')`)
- [ ] 10.5 Wire to `useUndoRedo().performUndo()` / `performRedo()`

### Task 11: Wire to Existing Actions (AC: #1, #6) — MUST execute Task 11.1 BEFORE 11.2
- [ ] 11.1 In `use-review-actions.ts`: after successful single action, push UndoEntry to store via `pushUndo()` — entry includes `action` type so undo can branch correctly. For severity override: also store `previousSeverity` and `previousOriginalSeverity`
- [ ] 11.2 In `ReviewPageClient.tsx` `executeBulk()`: after successful bulk action, capture `result.data.batchId` (already returned by `bulkAction` server action but currently unused — the `executeBulk` function is void, so store batchId in the UndoEntry directly). Push UndoEntry with `type: 'bulk'`, `batchId: result.data.batchId`, and snapshot all `previousStates` from the pre-action finding snapshots
- [ ] 11.3 In manual add finding flow: push UndoEntry with `action: 'add'`, snapshot = `{ findingId }` (server will find+delete)
- [ ] 11.4 In manual delete finding flow: push UndoEntry with `action: 'delete'`, snapshot = full `FindingSnapshot` (needed for re-insert)

### Task 12: Unit Tests (AC: all)
- [ ] 12.1 Undo stack store tests in `src/features/review/stores/review.store.test.ts`:
  - push/pop LIFO order
  - **Boundary**: stack=0 → pop returns undefined
  - **Boundary**: stack=1 → pop returns entry, stack becomes empty
  - **Boundary**: stack=20 → push keeps 20
  - **Boundary**: stack=20 + push 21st → oldest dropped, stack=20
  - clear-on-file-switch (`resetForFile()`)
  - clear-redo-on-new-action
  - `markEntryStale(findingId)` — single and bulk entries
  - `removeEntriesForFinding(findingId)` — removes from both undo and redo stacks
  - `canUndo`/`canRedo` derived selectors
- [ ] 12.2 `undoAction.action.test.ts`: happy path, state mismatch conflict, force=true bypass, deleted finding (Guardrail #4), feedback_events insert on undo-reject, audit log
- [ ] 12.3 `undoBulkAction.action.test.ts`: full revert, partial conflict, feedback_events for undone rejects, empty findings array guard
- [ ] 12.4 `undoSeverityOverride.action.test.ts`: happy path, severity mismatch, originalSeverity restore
- [ ] 12.5 `undoAddFinding.action.test.ts`: happy path, finding already deleted
- [ ] 12.6 `undoDeleteFinding.action.test.ts`: happy path, re-insert with original ID, FK handling
- [ ] 12.7 `redoAction.action.test.ts`: happy path, state mismatch
- [ ] 12.8 `redoBulkAction.action.test.ts`: happy path, partial conflict
- [ ] 12.9 `use-undo-redo.test.ts`: undo flow (all 5 action types), redo flow, debounce (300ms), conflict dialog trigger, deleted finding removal
- [ ] 12.10 `ConflictDialog.test.tsx`: render, force undo click, cancel click, a11y (focus trap, aria-modal), state reset on re-open

### Task 13: E2E Tests (AC: #1, #2, #3, #5, #7)
- [ ] 13.1 E2E: accept finding → Ctrl+Z → finding reverts to pending → score updates
- [ ] 13.2 E2E: bulk accept 3 findings → Ctrl+Z → all 3 revert
- [ ] 13.3 E2E: undo → Ctrl+Shift+Z → finding re-accepted
- [ ] 13.4 E2E: undo severity override → severity reverts → score updates (covers AC3 via UI)
- [ ] 13.5 E2E: switch file → undo stack cleared → Ctrl+Z = no-op

## Dev Notes

### Existing Code to Extend (NOT Reinvent)

| Component | File | What to Do |
|-----------|------|------------|
| Zustand store | `src/features/review/stores/review.store.ts` | Add `UndoRedoSlice` (new slice, existing pattern) |
| Single actions | `src/features/review/hooks/use-review-actions.ts` | After success → `pushUndo()`. Reference: the `inFlightRef = useRef(false)` guard at top of `executeAction` |
| Bulk actions | `src/features/review/components/ReviewPageClient.tsx` | After `executeBulk()` success → `pushUndo()` |
| Keyboard | `src/features/review/hooks/use-keyboard-actions.ts` | Register Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y in 'review' scope |
| Realtime | `src/features/review/hooks/use-findings-subscription.ts` | On UPDATE → `markEntryStale()`, on DELETE → `removeEntriesForFinding()` |
| State transitions | `src/features/review/utils/state-transitions.ts` | No changes needed — undo uses raw `previousState` |
| Action helper | `src/features/review/actions/helpers/executeReviewAction.ts` | Study pattern for undoAction (same tenant/auth/audit flow) |
| Severity override | `src/features/review/actions/overrideSeverity.action.ts` | Study for undo severity — note `severity` + `original_severity` columns |
| Add finding | `src/features/review/actions/addFinding.action.ts` | Study for undo-add (reverse = delete) |
| Delete finding | `src/features/review/actions/deleteFinding.action.ts` | Study for undo-delete (reverse = re-insert with snapshot) |
| Reject → feedback | `src/features/review/actions/rejectFinding.action.ts` lines 77-101 | Study `feedback_events` insert pattern for undo-reject |

### Implementation Strategy: Shared Helper

The 7 undo/redo server actions share the same core flow (validate → fetch → verify state → update → audit → inngest). STRONGLY consider creating a shared helper `src/features/review/actions/helpers/executeUndoRedo.ts` (analogous to existing `executeReviewAction.ts`) to eliminate ~70% duplication. Each action file becomes a thin wrapper calling the shared helper with action-specific parameters.

### Server Action Pattern (follow `executeReviewAction.ts`)

```
1. Validate input (Zod schema)
2. Auth: getCurrentUser() → tenantId, userId
3. Fetch finding with withTenant() (Guardrail #1)
4. Verify expected state (conflict check) — skip if force=true
5. Transaction: UPDATE finding (status + updatedAt) + INSERT review_actions
   CRITICAL: always set updatedAt = new Date() — without this, Realtime merge guard
   in useFindingsSubscription silently drops the change as "stale"
6. Side effects: feedback_events (if undo-reject, use `action` column), audit log (best-effort, Guardrail #2)
7. Best-effort Inngest event (finding.changed)
8. Return ActionResult<T> with serverUpdatedAt for client timestamp sync
```

### Undo Entry Shape (SINGLE SOURCE OF TRUTH)

```typescript
type UndoEntry = {
  id: string                                    // crypto.randomUUID()
  type: 'single' | 'bulk'
  action: string                                // 'accept' | 'reject' | 'flag' | 'note' | 'source_issue' | 'severity_override' | 'add' | 'delete'
  findingId: string | null                      // populated for single, null for bulk
  batchId: string | null                        // populated for bulk, null for single
  previousStates: Map<string, FindingStatus>    // findingId → status before action
  newStates: Map<string, FindingStatus>         // findingId → status after action
  previousSeverity: { severity: FindingSeverity; originalSeverity: FindingSeverity | null } | null  // pre-override snapshot (for undo)
  newSeverity: FindingSeverity | null     // post-override severity (for redo — re-applies the override)
  findingSnapshot: FindingSnapshot | null       // for delete undo (full re-insert data)
  description: string                           // "Accept Finding #14" / "Bulk accept (8 findings)"
  timestamp: number
  staleFindings: Set<string>                    // findingIds modified by other users via Realtime
}

// For undo-delete: full snapshot needed to re-insert
// MUST match actual `findings` table columns (src/db/schema/findings.ts)
type FindingSnapshot = {
  id: string
  segmentId: string | null
  fileId: string
  projectId: string
  tenantId: string
  reviewSessionId: string | null
  status: FindingStatus
  severity: FindingSeverity
  originalSeverity: FindingSeverity | null
  category: string
  description: string
  detectedByLayer: DetectedByLayer
  aiModel: string | null
  aiConfidence: number | null           // NOT "confidence"
  suggestedFix: string | null           // NOT "suggestion"
  sourceTextExcerpt: string | null
  targetTextExcerpt: string | null
  scope: string
  relatedFileIds: string[] | null
  segmentCount: number
  createdAt: string                     // ISO timestamp
  updatedAt: string                     // ISO timestamp
}
```

### Critical Guardrails

1. **Guardrail #35**: Undo stack: Zustand, per-tab, max 20, clear on file switch. Bulk = 1 entry. Redo clears on new action. Server Action verifies `previous_state` match before revert — mismatch = conflict dialog. No localStorage, no server persistence
2. **Guardrail #1**: `withTenant()` on EVERY query in undo/redo actions
3. **Guardrail #2**: Audit log best-effort in error paths
4. **Guardrail #4**: Guard `rows[0]!` after SELECT/returning
5. **Guardrail #5**: `inArray(col, [])` guard before bulk queries
6. **Guardrail #11**: ConflictDialog must reset state on re-open
7. **Guardrail #28**: Ctrl+Z suppressed in input/textarea/select
8. **Guardrail #34**: Ctrl+Z in text inputs = native browser undo
9. **Guardrail #30**: ConflictDialog focus trap + restore
10. **Guardrail #33**: `aria-live="polite"` for undo/redo toasts, `aria-live="assertive"` for conflict dialog
11. **Guardrail #37**: prefers-reduced-motion for any undo/redo animations
12. **Guardrail #44**: Cross-file data flow — verify undo stack refs don't stale when findings update via Realtime

### Anti-Patterns to Avoid

- `void undoAction(...)` — swallows errors (Guardrail #13). Use `.catch()` or `await` with try-catch
- Selecting `undoStack` array in components — causes re-render on every push/pop. Use `selectCanUndo`/`selectCanRedo` selector functions instead
- `useEffect` + `.focus()` on mount for conflict dialog — only focus on dialog open (Guardrail #40)
- `process.env` direct access — use `@/lib/env`
- `export default` — named exports only
- Storing full `Finding` object in undo stack for status changes — only store `findingId + previousState + newState`. Exception: delete undo requires `FindingSnapshot`

### Previous Story Learnings (Story 4.4a)

1. **Infinite re-render from render-time setState** — use `useRef` for derived values, not `useState`
2. **Zustand store function ref causing re-register loop** — use `getState()` inside handlers, not selector
3. **Override badge not incrementing** — when extending existing action flow, verify all side effects propagate
4. **Optimistic rollback on partial success** — bulk actions can have partial skips; handle individually
5. **`inFlightRef` blocks rapid presses** — existing debounce pattern in `useReviewActions`; undo needs its own `inFlightRef`

### Project Structure Notes

New files to create:
```
src/features/review/
├── actions/
│   ├── undoAction.action.ts                # Single undo (status revert)
│   ├── undoAction.action.test.ts
│   ├── undoBulkAction.action.ts            # Bulk undo
│   ├── undoBulkAction.action.test.ts
│   ├── undoSeverityOverride.action.ts      # Severity override undo
│   ├── undoSeverityOverride.action.test.ts
│   ├── undoAddFinding.action.ts            # Undo manual add (= delete)
│   ├── undoAddFinding.action.test.ts
│   ├── undoDeleteFinding.action.ts         # Undo manual delete (= re-insert)
│   ├── undoDeleteFinding.action.test.ts
│   ├── redoAction.action.ts               # Single redo
│   ├── redoAction.action.test.ts
│   ├── redoBulkAction.action.ts            # Bulk redo
│   └── redoBulkAction.action.test.ts
├── components/
│   ├── ConflictDialog.tsx                  # Realtime conflict resolution dialog
│   └── ConflictDialog.test.tsx
├── hooks/
│   ├── use-undo-redo.ts                    # Undo/redo orchestration hook
│   └── use-undo-redo.test.ts
└── validation/
    └── undoAction.schema.ts                # Zod schemas for all undo/redo actions
```

Files to modify:
```
src/features/review/stores/review.store.ts          # Add UndoRedoSlice
src/features/review/hooks/use-review-actions.ts     # Push undo entries after actions (Task 11.1 FIRST)
src/features/review/hooks/use-keyboard-actions.ts   # Register Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y
src/features/review/hooks/use-findings-subscription.ts  # Stale + delete detection
src/features/review/components/ReviewPageClient.tsx  # Wire undo/redo + conflict dialog (Task 11.2 AFTER 11.1)
src/features/review/validation/reviewAction.schema.ts   # Add 'undo'/'redo' to actionType union
src/types/finding.ts (if ReviewActionType union exists)  # Add 'undo'/'redo'
```

### References

- [Source: epics/epic-4-review-decision-workflow.md#Story 4.4b]
- [Source: prd.md#FR76-FR80 Finding Lifecycle]
- [Source: ux-design-specification/ux-consistency-patterns.md#Action Reversibility]
- [Source: ux-design-specification/ux-consistency-patterns.md#Edge State: Concurrent Editing]
- [Source: architecture/core-architectural-decisions.md#State Management]
- [Source: CLAUDE.md#Guardrail #35 — Undo stack]
- [Source: CLAUDE.md#Guardrail #28 — Single-key hotkeys scoped]
- [Source: CLAUDE.md#Guardrail #30 — Modal focus trap]
- [Source: CLAUDE.md#Guardrail #44 — Cross-file data flow]
- [Source: 4-4a-bulk-operations-decision-override.md#Production Bugs]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
