# Story 5.2a: Non-Native Auto-Tag

Status: review

## Story

As a PM,
I want review decisions by non-native reviewers automatically tagged with "Subject to native audit",
So that I can track which decisions need native verification and maintain audit trail integrity.

## Acceptance Criteria

### AC1: Auto-Tag on Every Review Action
**Given** a non-native reviewer (user whose `nativeLanguages` does NOT include file's `targetLang` primary subtag) makes any review decision (Accept/Reject/Flag/Note/Source Issue)
**When** the action is saved
**Then** the `review_actions.metadata` field includes `{ non_native: true }` (FR38)
**And** tag detection uses existing `determineNonNative()` from `@/lib/auth/determineNonNative.ts` (DO NOT reimplement)
**And** the tag applies to ALL actions by non-native reviewers — no exceptions
**And** native reviewer actions have `metadata: { non_native: false }` (explicit, not null — for query clarity)

### AC2: Auto-Tag on Bulk Actions
**Given** a non-native reviewer performs a bulk action (bulk accept/reject/flag)
**When** the bulk action is saved
**Then** every `review_actions` row in the batch includes `{ non_native: true }` in metadata
**And** the `non_native` flag is determined once per bulk call (not per finding — user's native status doesn't change mid-request)

### AC3: Write-Once Tag (Guardrail #66)
**Given** a review_action is created with `metadata: { non_native: true }`
**When** any subsequent process reads or queries this action
**Then** the `non_native` flag is NEVER cleared or modified
**And** if a native reviewer later confirms the finding (Story 5.2c), they add `native_verified: true` alongside (not in this story — but the data model must support it)

### AC4: Non-Native Badge in Finding Card
**Given** a finding that has ANY review_action with `metadata.non_native = true` (not yet `native_verified`)
**When** the finding is displayed in the FindingCard (and FindingCardCompact)
**Then** a "Subject to native audit" badge is shown (italic text + Eye icon `h-4 w-4` (16px min per Guardrail #36), `text-muted-foreground` — NOT severity color)
**And** the badge meets accessibility requirements: icon `aria-hidden="true"`, text is the accessible label, contrast >= 4.5:1 on both light and dark mode backgrounds (Guardrail #25)
**And** the badge does NOT affect score calculation (audit flag only)
**And** boundary: if a finding has mix of non-native + native actions, badge shows as long as ANY non-native action exists without `native_verified` (conservative — Story 5.2c will refine)

### AC5: Non-Native Badge in Override History
**Given** a review action in the Override History panel has `metadata.non_native = true`
**When** the override history is displayed
**Then** each non-native action shows "(non-native)" label next to the action type
**And** the label is italic + muted color for visual distinction

### AC6: Non-Native Tag in Audit Trail
**Given** a review action audit log entry
**When** the audit log is written via `writeAuditLog()`
**Then** the `newValue` field includes `non_native: true/false` (already logged since metadata is in the review_action — verify current audit log captures metadata)

## Complexity Assessment

**AC count: 6** (within <= 8 limit)

**Cross-AC interaction matrix:**

| AC | Interacts with | Count |
|----|---------------|-------|
| AC1 (Auto-tag single) | AC3 (write-once), AC4 (badge data source), AC6 (audit) | 3 |
| AC2 (Auto-tag bulk) | AC3 (write-once), AC4 (badge data source) | 2 |
| AC3 (Write-once) | AC1, AC2 (constrains behavior) | 2 |
| AC4 (Badge in card) | AC1, AC2 (data dependency) | 2 |
| AC5 (Badge in history) | AC1 (data dependency) | 1 |
| AC6 (Audit trail) | AC1 (data dependency) | 1 |

**Max cross-AC interactions: 3** (at limit, not over). Complexity is manageable.

## Tasks / Subtasks

### Task 1: Extend `executeReviewAction` to Include Non-Native Metadata (AC: #1, #3)
- [x]1.1 In `src/features/review/actions/helpers/executeReviewAction.ts`:
  - Extend `ExecuteReviewActionParams.user` type: add `nativeLanguages: string[]`
  - After fetching the finding (which already has `segmentId`), query segment's `targetLang`:
    ```
    if (finding.segmentId) → SELECT targetLang FROM segments WHERE id = segmentId AND withTenant(...)
    ```
  - Call `determineNonNative(user.nativeLanguages, targetLang ?? 'unknown')` — import from `@/lib/auth/determineNonNative`
  - Set `metadata: { non_native: isNonNative }` in review_actions INSERT (replace current `metadata: null`)
  - If `finding.segmentId` is null (cross-file finding), treat as non-native = true (conservative default — same as `determineNonNative([],...)`)
- [x]1.2 Update all 5 callers of `executeReviewAction()` to pass `nativeLanguages` in user object:
  - `acceptFinding.action.ts` → `user: { id: user.id, tenantId: user.tenantId, nativeLanguages: user.nativeLanguages }`
  - `rejectFinding.action.ts` → same
  - `flagFinding.action.ts` → same
  - `sourceIssueFinding.action.ts` → same
  - `noteFinding.action.ts` → same

### Task 1b: Extend Actions with Own review_actions INSERT (AC: #1, #3)
- [x]1b.1 In `addFinding.action.ts` (line ~125): currently sets `metadata: { isManual: true }` — **MERGE** non_native key: `metadata: { isManual: true, non_native: isNonNative }`. The action already calls `determineNonNative()` for feedback_events — reuse the same result
- [x]1b.2 In `overrideSeverity.action.ts` (line ~133): currently sets `metadata: { originalSeverity, newSeverity, isReset }` — **MERGE**: `{ ...existingKeys, non_native: isNonNative }`. Action already imports `determineNonNative()` — reuse
- [x]1b.3 In `undoDeleteFinding.action.ts` (line ~120): currently sets `metadata: { undoType: 'delete_restore' }` — **MERGE**: `{ undoType: 'delete_restore', non_native: isNonNative }`
- [x]1b.4 In `undoSeverityOverride.action.ts` (line ~101): currently sets `metadata: { undoType: 'severity_override', ... }` — **MERGE**: `{ ...existingKeys, non_native: isNonNative }`

### Task 2: Extend Bulk Action to Include Non-Native Metadata (AC: #2, #3)
- [x]2.1 In `src/features/review/actions/bulkAction.action.ts`:
  - After `requireRole()`, determine non-native status ONCE: query targetLang from first finding's segment → `determineNonNative(user.nativeLanguages, targetLang)`
  - In the review_actions INSERT (inside the transaction), set `metadata: { non_native: isNonNative }` for every row
  - The targetLang query: use the file's targetLang (already available in the segment query for feedback_events) — hoist it before the per-finding loop

### Task 3: Extend Undo/Redo Helpers (AC: #1, #3)
- [x]3.1 In `src/features/review/actions/helpers/executeUndoRedo.ts` (shared helper for undoAction + redoAction):
  - Extend `ExecuteUndoRedoParams.user` type: add `nativeLanguages: string[]`
  - The helper does NOT fetch `segmentId` (only fetches `id` + `status`). Need to also select `segmentId` from findings
  - Add segment targetLang lookup (same pattern as executeReviewAction Task 1)
  - Set `metadata: { non_native: isNonNative }` at line 103 (replace `metadata: null`)
  - Update audit log `newValue` to include `non_native`
- [x]3.2 In `undoAction.action.ts` — pass `nativeLanguages` in user param to `executeUndoRedo()`
- [x]3.3 In `redoAction.action.ts` — same
- [x]3.4 In `undoBulkAction.action.ts` (line 126, own INSERT — NOT using executeUndoRedo):
  - Determine non-native status ONCE before the per-finding loop (query targetLang from first segment)
  - Set `metadata: { non_native: isNonNative }` (replace `metadata: null`)
- [x]3.5 In `redoBulkAction.action.ts` (line 122, own INSERT — same pattern):
  - Same as 3.4

### Task 4: Surface Non-Native Status in FileReviewData (AC: #4)
- [x]4.1 In `getFileReviewData.action.ts`:
  - Add to `FileReviewData.findings[]` type: `hasNonNativeAction: boolean`
  - After the overrideCounts query (which already queries review_actions for the file), add a parallel query:
    ```sql
    SELECT DISTINCT finding_id FROM review_actions
    WHERE file_id = ? AND project_id = ?
      AND metadata->>'non_native' = 'true'
      AND finding_id IN (currentFindingIds)
      AND withTenant(...)
    ```
  - Build a `Set<string>` of findingIds with non-native actions
  - Map onto findings: `hasNonNativeAction: nonNativeSet.has(f.id)`
- [x]4.2 Extend `FindingForDisplay` type in `src/features/review/types.ts`: add `hasNonNativeAction: boolean`
- [x]4.3 Pass `hasNonNativeAction` through `ReviewPageClient` → `FindingList` → `FindingCard` (same prop-drilling pattern as other fields)

### Task 5: Create NonNativeBadge UI Component (AC: #4, #5)
- [x]5.1 Create `src/features/review/components/NonNativeBadge.tsx`:
  - Small badge: Eye icon (16px, `aria-hidden="true"`) + italic text "Subject to native audit"
  - Use `text-muted-foreground` for color (NOT severity color — this is an audit tag, not quality indicator)
  - Props: `className?: string` (no other props — badge is stateless, presence = non-native)
  - Accessibility: icon decorative, text is the accessible name, contrast >= 4.5:1 on all backgrounds
  - Compact variant: just icon + "Non-native" (for FindingCardCompact if needed)

### Task 6: Integrate NonNativeBadge into FindingCard (AC: #4)
- [x]6.1 In `FindingCard.tsx`:
  - Add `hasNonNativeAction?: boolean` to `FindingCardProps`
  - Conditionally render `<NonNativeBadge />` next to the LayerBadge/ConfidenceBadge row
  - Place AFTER existing badges (OverrideBadge, LayerBadge, ConfidenceBadge) — non-native is supplementary info
- [x]6.2 In `FindingCardCompact.tsx`:
  - Same treatment if the compact card shows badges

### Task 7: Integrate NonNativeBadge into Override History (AC: #5)
- [x]7.1 In `src/features/review/components/OverrideHistoryPanel.tsx` (or wherever override history renders):
  - When rendering each review_action entry, check if `metadata.non_native === true`
  - Show "(non-native)" italic label next to the action type text
  - This requires the override history query to include `metadata` in its SELECT — verify and add if missing

### Task 8: Verify Audit Trail Captures Metadata (AC: #6)
- [x]8.1 In `executeReviewAction.ts`: verify the existing `writeAuditLog()` call includes the metadata in `newValue`:
  - Current: `newValue: { status: newState }` — needs to include `non_native: isNonNative`
  - Update to: `newValue: { status: newState, non_native: isNonNative }`
- [x]8.2 Same for `bulkAction.action.ts` audit log calls

### Task 9: Tests (All ACs)

**9a: Update existing test mocks (CRITICAL — type change breaks 10+ test files)**
- [x]9a.1 Update ALL existing test files that mock `executeReviewAction` or `executeUndoRedo` user param to include `nativeLanguages: []`:
  - `executeReviewAction.ta.test.ts` (4 tests)
  - `acceptFinding.action.test.ts` (5 tests)
  - `flagFinding.action.test.ts` (5 tests)
  - `sourceIssueFinding.action.test.ts`
  - `noteFinding.action.test.ts` (4 tests)
  - `undoAction.action.test.ts` (5 tests)
  - `redoAction.action.test.ts` (4 tests)
  - `undoBulkAction.action.test.ts` (3 tests)
  - `redoBulkAction.action.test.ts` (4 tests)
  - Note: `rejectFinding.action.test.ts` and `bulkAction.action.test.ts` already have `nativeLanguages: []` — verify, no change needed

**9b: New unit tests**
- [x]9b.1 Unit: `executeReviewAction.ts` — test that non-native user gets `metadata: { non_native: true }`, native user gets `{ non_native: false }`
- [x]9b.2 Unit: `executeReviewAction.ts` — test cross-file finding (segmentId null) defaults to `non_native: true`
- [x]9b.3 Unit: `addFinding.action.ts` — verify metadata merge: `{ isManual: true, non_native: true }` (not overwritten)
- [x]9b.4 Unit: `bulkAction.action.ts` — verify all review_action rows get `non_native` metadata
- [x]9b.5 Unit: `NonNativeBadge.tsx` — renders icon (h-4 w-4) + text, correct `aria-hidden`, correct styling, contrast on dark bg
- [x]9b.6 Unit: `FindingCard.tsx` — shows NonNativeBadge when `hasNonNativeAction=true`, hidden when false
- [x]9b.7 Unit: `FindingCardCompact.tsx` — same badge behavior in compact variant
- [x]9b.8 Unit: OverrideHistoryPanel — shows "(non-native)" label for actions with `non_native: true` metadata
- [x]9b.9 Unit: `getFileReviewData.action.ts` — verify `hasNonNativeAction` computed correctly from review_actions metadata query (add 5th dbState return value)
- [x]9b.10 Boundary: mixed action history — finding with non-native accept then native reject → badge still shows (any non-native action exists)

**9c: E2E test (MANDATORY per CLAUDE.md)**
- [x]9c.1 Extend `e2e/review-actions.spec.ts` or create `e2e/non-native-auto-tag.spec.ts`:
  - Seed file with 1 finding for Thai language
  - Login as non-native reviewer (nativeLanguages does NOT include 'th')
  - Accept the finding
  - Verify NonNativeBadge visible in FindingCard ("Subject to native audit")
  - Open OverrideHistoryPanel → verify "(non-native)" label shown
  - If E2E requires PostgREST seeding for review_actions, document as TD entry

## Dev Notes

### Architecture Patterns & Constraints

**Central mutation point:** `executeReviewAction.ts` is the DRY helper for all single-finding actions. The non-native tag logic goes here ONCE — all 5 callers inherit it. Do NOT duplicate the segment lookup + determineNonNative call in each action file.

**Bulk action is separate:** `bulkAction.action.ts` has its own review_actions INSERT loop. The non-native detection must be added there too, but only computed ONCE per call (before the per-finding loop).

**Write-once pattern (Guardrail #66):** `metadata.non_native` is set at INSERT time and NEVER updated. Story 5.2c will add `native_verified: true` alongside — the current design MUST support adding more keys to metadata without overwriting `non_native`. The jsonb type naturally supports this.

**No score impact:** The non-native tag is purely informational. Do NOT modify `SCORE_IMPACT_MAP` or `mqmCalculator`. The badge is an audit/workflow flag, not a quality indicator.

**Metadata merge pattern (CRITICAL):** Several actions already set metadata with other keys:
- `addFinding`: `{ isManual: true }`
- `overrideSeverity`: `{ originalSeverity, newSeverity, isReset }`
- `undoDeleteFinding`: `{ undoType: 'delete_restore' }`
- `undoSeverityOverride`: `{ undoType: 'severity_override', ... }`

When adding `non_native`, you MUST **merge** — NOT replace:
```typescript
// WRONG — destroys existing keys
metadata: { non_native: isNonNative }

// CORRECT — preserves existing keys
metadata: { isManual: true, non_native: isNonNative }
// or for dynamic cases:
metadata: { ...existingMetadataObj, non_native: isNonNative }
```
For `executeReviewAction` and `executeUndoRedo` (which currently set `metadata: null`), simple `{ non_native: isNonNative }` is fine.

### Existing Code to Extend

| File | Change | Purpose |
|------|--------|---------|
| `src/features/review/actions/helpers/executeReviewAction.ts:49-53` | Add `nativeLanguages: string[]` to user type, add segment targetLang lookup, set metadata | Core auto-tag logic |
| `src/features/review/actions/acceptFinding.action.ts:40-44` | Pass `nativeLanguages` in user param | Propagate native languages |
| `src/features/review/actions/rejectFinding.action.ts:49-53` | Same | Same |
| `src/features/review/actions/flagFinding.action.ts:40-44` | Same | Same |
| `src/features/review/actions/sourceIssueFinding.action.ts` | Same | Same |
| `src/features/review/actions/noteFinding.action.ts` | Same | Same |
| `src/features/review/actions/addFinding.action.ts:125` | **MERGE** `non_native` into existing `{ isManual: true }` metadata | Manual finding auto-tag |
| `src/features/review/actions/overrideSeverity.action.ts:133` | **MERGE** `non_native` into existing `{ originalSeverity, newSeverity, isReset }` metadata | Severity override auto-tag |
| `src/features/review/actions/undoDeleteFinding.action.ts:120` | **MERGE** `non_native` into existing `{ undoType: 'delete_restore' }` metadata | Undo delete auto-tag |
| `src/features/review/actions/undoSeverityOverride.action.ts:101` | **MERGE** `non_native` into existing `{ undoType: 'severity_override', ... }` metadata | Undo override auto-tag |
| `src/features/review/actions/bulkAction.action.ts` | Add non-native detection + metadata on review_actions INSERT | Bulk auto-tag |
| `src/features/review/actions/helpers/executeUndoRedo.ts:23-32,103` | Add `nativeLanguages` to user type, add segmentId to SELECT, segment lookup, set metadata | Undo/redo auto-tag |
| `src/features/review/actions/undoAction.action.ts` | Pass `nativeLanguages` in user param | Propagate native languages |
| `src/features/review/actions/redoAction.action.ts` | Same | Same |
| `src/features/review/actions/undoBulkAction.action.ts:126` | Add non-native detection + metadata on review_actions INSERT (own INSERT, not shared helper) | Undo bulk auto-tag |
| `src/features/review/actions/redoBulkAction.action.ts:122` | Same | Redo bulk auto-tag |
| `src/features/review/actions/getFileReviewData.action.ts:30-80` | Add `hasNonNativeAction` to findings query + FileReviewData type | Surface tag to UI |
| `src/features/review/types.ts:4-18` | Add `hasNonNativeAction: boolean` to `FindingForDisplay` | UI type |
| `src/features/review/components/FindingCard.tsx:22-35` | Add `hasNonNativeAction` prop, render NonNativeBadge | Badge display |
| `src/features/review/components/FindingCardCompact.tsx` | Same (if badges are shown) | Badge display |
| `src/features/review/components/OverrideHistoryPanel.tsx` | Show "(non-native)" for review_actions with metadata.non_native | History display |

### Key Implementation Details

**Segment targetLang lookup in executeReviewAction:** The finding already has `segmentId`. Add a targeted query:
```typescript
let targetLang = 'unknown'
if (finding.segmentId) {
  const segRows = await db
    .select({ targetLang: segments.targetLang })
    .from(segments)
    .where(and(eq(segments.id, finding.segmentId), withTenant(segments.tenantId, tenantId)))
    .limit(1)
  if (segRows.length > 0) {
    targetLang = segRows[0]!.targetLang
  }
}
const isNonNative = determineNonNative(user.nativeLanguages, targetLang)
```
This is ONE extra query per review action. Performance is fine — review actions are user-driven (not batch AI), and the segments table has PK index on `id`.

**For bulk actions:** The targetLang query should use the file's language pair (all segments in a file have the same targetLang). Query once from the first segment, cache for the batch.

**getFileReviewData non-native query:** Uses jsonb operator `->>'non_native'` in Drizzle:
```typescript
import { sql } from 'drizzle-orm'
// After the overrideCounts query (same pattern: batch query on review_actions)
const nonNativeRows = await db
  .selectDistinct({ findingId: reviewActions.findingId })
  .from(reviewActions)
  .where(and(
    eq(reviewActions.fileId, fileId),
    eq(reviewActions.projectId, projectId),
    inArray(reviewActions.findingId, currentFindingIds),
    withTenant(reviewActions.tenantId, tenantId),
    sql`${reviewActions.metadata}->>'non_native' = 'true'`,
  ))
const nonNativeSet = new Set(nonNativeRows.map(r => r.findingId))
```

### Guardrail Summary (Story-Relevant)

| # | Rule | Application |
|---|------|------------|
| 1 | `withTenant()` on EVERY query | Segment lookup in executeReviewAction, nonNative query in getFileReviewData |
| 3 | No bare `string` for status | Use existing `ReviewAction` type from state-transitions |
| 4 | Guard `rows[0]!` | Segment lookup result |
| 5 | `inArray(col, [])` = invalid | Guard nonNative query with `if (currentFindingIds.length === 0)` |
| 25 | Color never sole info carrier | NonNativeBadge: icon + text + color |
| 66 | Non-native tag write-once, never clear | metadata.non_native set at INSERT, never UPDATE |

### Anti-Patterns to Avoid

- **Do NOT duplicate `determineNonNative()` logic** — import from `@/lib/auth/determineNonNative.ts`
- **Do NOT add non-native detection to each individual action** (accept, reject, flag, etc.) — it goes in `executeReviewAction` helper ONCE
- **Do NOT use color alone for the badge** — must have icon + text (Guardrail #25)
- **Do NOT modify score calculation** — this is an audit flag, not a quality modifier
- **Do NOT clear `non_native` flag ever** — write-once (Guardrail #66)
- **Do NOT use `metadata?.non_native` with optional chaining blindly** — the key is explicitly set to `true`/`false`, not absent. Query with `->>'non_native' = 'true'`
- **Do NOT add extra roundtrip in bulk actions** — determine non-native once, apply to all rows
- **Do NOT replace metadata object** — always merge `non_native` key alongside existing keys (isManual, undoType, etc.)

### Previous Story Intelligence (Story 5.1)

Story 5.1 established:
- `determineNonNative()` at `src/lib/auth/determineNonNative.ts` — already handles BCP-47, Chinese script subtag, empty native_languages
- `isNonNative` field in `FileReviewData` (for LanguageBridge panel) — can reuse same detection
- `getFileReviewData` already queries `review_actions` for `overrideCounts` — same pattern for non-native query
- `requireRole()` returns `{ id, tenantId, nativeLanguages }` — all callers have access

### Git Intelligence

Recent commits:
- Story 5.1 Language Bridge DONE (CR R1 + R2 complete)
- `determineNonNative()` used in: rejectFinding, addFinding, bulkAction, overrideSeverity, undoAction, undoBulkAction, createSuppressionRule — for `feedback_events.reviewerIsNative`
- Pattern already established: `!determineNonNative(user.nativeLanguages, targetLang)` = native
- `executeReviewAction.ts` is the central helper — currently sets `metadata: null`

### Project Structure Notes

- No new files needed for backend — all changes extend existing helpers/actions
- One new component: `src/features/review/components/NonNativeBadge.tsx`
- One new test: `src/features/review/components/NonNativeBadge.test.tsx`
- **~15 action files modified** (5 executeReviewAction callers + 4 own-INSERT actions + 2 helpers + 2 bulk undo/redo + getFileReviewData + types)
- **~12 existing test files updated** (add `nativeLanguages: []` to mock user in all caller tests)
- **2 UI component files modified** (FindingCard.tsx, FindingCardCompact.tsx)
- **1 E2E test added/extended** for non-native badge verification

### References

- [Source: Epic 5 — `_bmad-output/planning-artifacts/epics/epic-5-language-intelligence-non-native-support.md`]
- [Source: RLS Scoped Access Design — `_bmad-output/planning-artifacts/research/rls-scoped-access-design-2026-03-26.md`]
- [Source: Guardrails Epic 5 — `CLAUDE-guardrails-epic5.md` #66 (write-once tag)]
- [Source: Story 5.1 — `_bmad-output/implementation-artifacts/5-1-language-bridge-back-translation.md`]
- [Source: Architecture Patterns — `_bmad-output/planning-artifacts/architecture/implementation-patterns-consistency-rules.md`]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Task 1: Extended `executeReviewAction` user type with `nativeLanguages: string[]`, added segment targetLang lookup + `determineNonNative()` call, set `metadata: { non_native }` on review_actions INSERT. Updated all 5 callers (accept, reject, flag, note, sourceIssue).
- Task 1b: Merged `non_native` key into existing metadata objects in `addFinding` (alongside isManual), `overrideSeverity` (alongside originalSeverity/newSeverity/isReset), `undoDeleteFinding` (alongside undoType), `undoSeverityOverride` (alongside undoType/previousSeverity).
- Task 2: Extended `bulkAction` to determine non-native ONCE per call (first segment's targetLang), merged into review_actions batch INSERT metadata.
- Task 3: Extended `executeUndoRedo` with `nativeLanguages` in user type, added segmentId to finding SELECT, added segment targetLang lookup. Updated `undoAction`/`redoAction` callers. Added non-native detection to `undoBulkAction` and `redoBulkAction` (own INSERT paths).
- Task 4: Added Q8 non-native query in `getFileReviewData` using `metadata->>'non_native' = 'true'`, computed `hasNonNativeAction` per finding. Extended `FindingForDisplay` and `Finding` types.
- Task 5: Created `NonNativeBadge.tsx` component — Eye icon (h-4 w-4, aria-hidden) + italic text "Subject to native audit" / "Non-native" (compact). Uses text-muted-foreground.
- Task 6: Integrated NonNativeBadge into `FindingCard` and `FindingCardCompact` with `hasNonNativeAction` prop.
- Task 7: Integrated "(non-native)" italic label into `OverrideHistoryPanel` per review_action with `metadata.non_native === true`.
- Task 8: Updated audit log `newValue` in `executeReviewAction`, `executeUndoRedo`, and `bulkAction` to include `non_native`.
- Task 9: Updated 12 existing test files with `nativeLanguages: []` mock + extra segment return values. Unskipped + fixed all 22 ATDD tests. Fixed Zod v4 UUID validation issue.
- Pre-CR: 4 sub-agents launched (anti-pattern, tenant-isolation, code-quality, cross-file reviewer).

### File List

**Modified:**
- src/features/review/actions/helpers/executeReviewAction.ts
- src/features/review/actions/helpers/executeUndoRedo.ts
- src/features/review/actions/acceptFinding.action.ts
- src/features/review/actions/rejectFinding.action.ts
- src/features/review/actions/flagFinding.action.ts
- src/features/review/actions/sourceIssueFinding.action.ts
- src/features/review/actions/noteFinding.action.ts
- src/features/review/actions/addFinding.action.ts
- src/features/review/actions/overrideSeverity.action.ts
- src/features/review/actions/undoDeleteFinding.action.ts
- src/features/review/actions/undoSeverityOverride.action.ts
- src/features/review/actions/bulkAction.action.ts
- src/features/review/actions/undoBulkAction.action.ts
- src/features/review/actions/redoBulkAction.action.ts
- src/features/review/actions/undoAction.action.ts
- src/features/review/actions/redoAction.action.ts
- src/features/review/actions/getFileReviewData.action.ts
- src/features/review/types.ts
- src/features/review/components/FindingCard.tsx
- src/features/review/components/FindingCardCompact.tsx
- src/features/review/components/OverrideHistoryPanel.tsx
- src/features/review/hooks/use-review-actions.ts
- src/features/review/components/ReviewPageClient.tsx
- src/types/finding.ts
- src/test/factories.ts

**New:**
- src/features/review/components/NonNativeBadge.tsx

**Test files modified (mock updates):**
- src/features/review/actions/executeReviewAction.ta.test.ts
- src/features/review/actions/acceptFinding.action.test.ts
- src/features/review/actions/flagFinding.action.test.ts
- src/features/review/actions/noteFinding.action.test.ts
- src/features/review/actions/sourceIssueFinding.action.test.ts
- src/features/review/actions/rejectFinding.action.test.ts
- src/features/review/actions/undoAction.action.test.ts
- src/features/review/actions/redoAction.action.test.ts
- src/features/review/actions/undoSeverityOverride.action.test.ts
- src/features/review/actions/undoDeleteFinding.action.test.ts
- src/features/review/actions/undoBulkAction.boundary.ta.test.ts
- src/features/review/actions/bulkAction.action.test.ts
- src/features/review/actions/getFileReviewData.action.test.ts
- src/features/review/components/ReviewPageClient.test.tsx
- src/features/review/components/ReviewPageClient.responsive.test.tsx
- src/features/review/components/ReviewPageClient.story40.test.tsx
- src/features/review/components/AddToGlossaryDialog.test.tsx
- src/features/review/components/FindingDetailContent.test.tsx
- src/features/review/utils/pattern-detection.test.ts

**ATDD test files (unskipped):**
- src/features/review/actions/helpers/executeReviewAction.nonnative.test.ts
- src/features/review/actions/addFinding.nonnative.test.ts
- src/features/review/actions/bulkAction.nonnative.test.ts
- src/features/review/components/NonNativeBadge.test.tsx
- src/features/review/components/FindingCard.nonnative.test.tsx
- src/features/review/components/OverrideHistoryPanel.nonnative.test.tsx
- src/features/review/actions/getFileReviewData.nonnative.test.ts
- e2e/review-non-native-tag.spec.ts (E2E — not run in unit suite)
