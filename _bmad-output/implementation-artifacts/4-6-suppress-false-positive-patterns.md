# Story 4.6: Suppress False Positive Patterns

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a QA Reviewer,
I want the system to detect recurring false positive patterns and offer to suppress them,
so that I don't waste time rejecting the same false positive type repeatedly.

## Acceptance Criteria (7 ACs)

### AC1: Pattern Detection Toast
**Given** the reviewer has rejected 3+ findings with the same error pattern (same `category` + same language pair + description >=3 word overlap, case-insensitive)
**When** the 3rd rejection is made
**Then** a toast notification appears: "Pattern detected: '{pattern_name}' (3 rejects) -- [Suppress this pattern] [Keep checking]"

- Pattern matched by: (1) exact `category` match AND (2) same language pair (source_lang + target_lang from segment) AND (3) `description` field contains >=3 word overlap (case-insensitive, `toLocaleLowerCase()`)
- Word tokenization: whitespace-split for Latin, `Intl.Segmenter` with `isWordLike` for Thai/CJK (CLAUDE.md CJK/Thai rules)
- Minimum keyword guard: descriptions with < 4 unique keywords are excluded from pattern detection (prevents false clusters on short L1 templated descriptions like "Missing tag `<g1>`")
- Pattern detection algorithm in `src/features/review/utils/pattern-detection.ts` (feature-scoped)
- Track rejection counts in Zustand store per file session (reset on file switch -- file-scoped state per TD-ARCH-001)

### AC2: Suppress Configuration Dialog
**Given** the reviewer clicks "Suppress this pattern"
**When** the dialog opens
**Then** it shows:
- Pattern description: preview of matched category + description keywords
- Scope: radio buttons -- "This file only" / "This language pair (EN->TH)" / "All language pairs"
- Duration: radio buttons -- "Until AI accuracy improves" / "Permanently" / "This session only"
- Default scope: "This language pair"
- Default duration: "Until AI accuracy improves"
- Language pair auto-populated from file's segment metadata (see Language Pair Source section)

### AC3: Suppress Execution -- Auto-Reject + DB Persist
**Given** the reviewer confirms suppression
**When** the pattern is suppressed
**Then:**
- All matching Pending findings in current file are auto-rejected in a single transaction (batch pattern from `bulkAction.action.ts`)
- Each auto-rejected finding gets `review_actions` row with `metadata: { suppressed: true, suppressionRuleId }` and shared `batchId`
- Each auto-rejected finding writes to `feedback_events` with `metadata: { suppressed: true }` (batch insert)
- Single `finding.changed` Inngest event after batch completes (NOT per-finding)
- Suppression rule stored in `suppression_rules` table (see Migration section)
- Toast confirms: "Pattern suppressed -- X findings auto-rejected"
- Auto-reject capped at 100 findings per suppression (safety limit)

### AC4: Keep Checking -- Reset Counter
**Given** the reviewer clicks "Keep checking"
**When** the toast is dismissed
**Then:**
- No suppression occurs
- Pattern detection counter for this specific pattern resets (added to `dismissedPatterns` set)
- System re-detects only if new rejections form a new qualifying cluster

### AC5: Admin Suppression Management
**Given** suppressed patterns exist for a project
**When** an Admin navigates to Admin -> Suppression Rules page
**Then:**
- All active suppressions listed with: pattern description, category, scope, duration, created by, created date, match count
- Each pattern has "[Re-enable]" button to deactivate (`is_active = false`)
- Re-enabling restores future detection without affecting previously suppressed findings
- Table: sortable by created_at, filterable by scope

### AC6: Session-Only Expiry
**Given** a suppression with duration "This session only"
**When** the reviewer's session ends (page unload / file switch / logout)
**Then:**
- The suppression rule is deactivated (`is_active = false`)
- Pattern will be detected again in the next session
- Primary: `visibilitychange` event with `navigator.sendBeacon()` API call
- Fallback: `beforeunload` event (unreliable on mobile)
- Defensive: on file load, auto-deactivate session rules older than 24h

### AC7: Accessibility
- Toast notification: `aria-live="polite"` (Guardrail #33)
- Dialog: full focus trap + restore (Guardrail #30), Escape closes (Guardrail #31)
- All radio buttons keyboard-navigable with arrow keys
- Suppress/Keep checking buttons: `aria-label` with pattern context
- Admin table: proper `role="grid"` with sortable column headers
- Color never sole information carrier: suppressed badge uses icon + text + muted color (Guardrail #25)

## Scope Table

| Feature | In Scope | Out of Scope |
|---------|----------|-------------|
| Pattern detection (word overlap + language pair) | Yes | Semantic similarity >0.85 / pipeline-level auto-reject (deferred to Epic 9) |
| Toast + dialog UI | Yes | -- |
| Auto-reject matching Pending findings (batch) | Yes | Admin bulk operations on suppressions |
| Admin suppression management page | Yes | -- |
| Session-only duration | Yes | "Until AI accuracy improves" smart detection (use simple `is_active` boolean) |
| DB migration for suppression_rules | Yes | -- |
| feedback_events metadata flag | Yes | New DB column on feedback_events (use existing jsonb metadata) |

## Tasks / Subtasks

### Task 1: DB Migration -- Extend `suppression_rules` table (AC2, AC3, AC6)

- [x] 1.1 Add `duration` column: `varchar('duration', { length: 30 }).notNull().default('until_improved')` -- values: `'session' | 'permanent' | 'until_improved'`
- [x] 1.2 Add `file_id` column: `uuid('file_id').references(() => files.id, { onDelete: 'cascade' })` -- nullable (only set for file-scoped suppressions)
- [x] 1.3 Add `source_lang` column: `varchar('source_lang', { length: 35 })` -- nullable (only set for language_pair scope)
- [x] 1.4 Add `target_lang` column: `varchar('target_lang', { length: 35 })` -- nullable (only set for language_pair scope)
- [x] 1.5 Change `scope` column comment from `'project' | 'tenant'` to `'file' | 'language_pair' | 'all'` in Drizzle schema. VARCHAR has no DB-level enum constraint, so this is schema comment + application-level validation only. Write data migration: `UPDATE suppression_rules SET scope = 'all' WHERE scope IN ('project', 'tenant')`. Grep codebase for any existing queries on `scope = 'project'` or `scope = 'tenant'` before migrating.
- [x] 1.6 Add `match_count` column: `integer('match_count').notNull().default(0)` -- tracks how many findings auto-rejected
- [x] 1.7 Run `npm run db:generate` + `npm run db:migrate` -- verify migration applies cleanly
- [x] 1.8 Update Drizzle schema in `src/db/schema/suppressionRules.ts`
- [x] 1.9 Update `src/db/schema/relations.ts` if needed (add files FK relation)
- [x] 1.10 Audit all existing INSERT/UPDATE paths for `suppression_rules` (Guardrail #41) -- grep codebase: currently no INSERT/UPDATE/SELECT exists for this table, but verify

### Task 2: Type Definitions (AC1-AC6)

- [x] 2.1 Add to `src/features/review/types.ts`:
  ```typescript
  export type SuppressionScope = 'file' | 'language_pair' | 'all'
  export type SuppressionDuration = 'session' | 'permanent' | 'until_improved'

  export type SuppressionRule = {
    id: string
    projectId: string
    tenantId: string
    pattern: string
    category: string
    scope: SuppressionScope
    duration: SuppressionDuration
    reason: string
    fileId: string | null
    sourceLang: string | null
    targetLang: string | null
    matchCount: number
    createdBy: string
    createdByName: string | null  // JOIN from users table
    isActive: boolean
    createdAt: string
  }

  export type SuppressionConfig = {
    scope: SuppressionScope
    duration: SuppressionDuration
    fileId: string | null
    sourceLang: string | null
    targetLang: string | null
  }

  export type DetectedPattern = {
    category: string
    keywords: string[]
    patternName: string
    matchingFindingIds: string[]
    sourceLang: string
    targetLang: string
  }
  ```

### Task 3: Pattern Detection Algorithm (AC1, AC4)

- [x] 3.1 Create `src/features/review/utils/pattern-detection.ts`:
  - `type RejectionEntry = { findingId: string; keywords: string[]; description: string; sourceLang: string; targetLang: string }`
  - `type CategoryLangTracker = { entries: RejectionEntry[]; dismissedPatterns: Set<string> }`
  - `type RejectionTracker = Map<string, CategoryLangTracker>` -- keyed by `${category}::${sourceLang}::${targetLang}`
  - `function extractKeywords(text: string): string[]` -- whitespace-split for Latin, `Intl.Segmenter` with `isWordLike` for Thai/CJK; lowercase, deduplicate, filter words < 3 chars
  - `function computeWordOverlap(keywordsA: string[], keywordsB: string[]): number` -- returns count of shared words
  - `function trackRejection(tracker: RejectionTracker, finding: FindingForDisplay, sourceLang: string, targetLang: string): DetectedPattern | null`
    - Group by `${category}::${sourceLang}::${targetLang}` (C1 fix: language pair scoped)
    - Skip findings with < 4 unique keywords (E4 fix: guard short descriptions)
    - Cluster detection: check new entry overlap against existing entries in same group; find entries with >=3 shared keywords; verify transitive overlap; if cluster size >= 3 AND not dismissed -> return DetectedPattern
    - Pattern name: category label + top-3 most-frequent keywords across cluster (O2 fix)
  - `function resetPatternCounter(tracker: RejectionTracker, groupKey: string, patternName: string): void` -- adds to `dismissedPatterns`
  - `function isAlreadySuppressed(activeSuppressions: SuppressionRule[], finding: FindingForDisplay, sourceLang: string, targetLang: string): boolean` -- check if finding matches any active suppression
- [x] 3.2 Create `src/features/review/utils/pattern-detection.test.ts`:
  - Boundary: exactly 3 rejects with >=3 overlap triggers, 2 does not
  - Word overlap: 3 shared words triggers, 2 shared words does not
  - Partial overlap: findings A-B share 4 words, B-C share 3 words, A-C share 2 words -> cluster is {A,B} only (size 2, no trigger); adding D that overlaps with A+B -> triggers
  - Case insensitivity: "Bank" vs "bank" matches
  - Language pair isolation: same category + same description but different lang pair = different groups
  - Short description guard: findings with < 4 keywords excluded
  - Thai/CJK: keyword extraction via `Intl.Segmenter` when available
  - Reset: "Keep checking" prevents same cluster from re-triggering
  - Different categories: same description + different category = different groups

### Task 4: Zustand Store Extension (AC1, AC3, AC4, AC6)

- [x] 4.1 Add 3 new fields to `FileState` type in `review.store.ts`:
  - `rejectionTracker: RejectionTracker` (Map, per-file scoped)
  - `detectedPattern: DetectedPattern | null` (currently detected pattern awaiting user decision)
  - `activeSuppressions: SuppressionRule[]` (loaded from DB on file init)
- [x] 4.2 **CRITICAL: Update ALL 5 coordinated locations** (C3 fix):
  1. `FileState` type definition (~line 479) -- add 3 new fields
  2. `DEFAULT_FILE_STATE` (~line 510) -- add defaults: `new Map()`, `null`, `[]`
  3. `createFreshFileState()` (~line 535) -- add same defaults
  4. `FILE_STATE_KEYS` ReadonlySet (~line 581) -- add `'rejectionTracker'`, `'detectedPattern'`, `'activeSuppressions'`
  5. `createFileState(fileId)` (~line 562) -- no special restore-from-cache for these fields (always fresh)
  - Missing ANY of these 5 -> TypeScript errors or silent state sync failures via `createSyncingSet`
- [x] 4.3 Add store actions:
  - `trackRejection(finding: FindingForDisplay, sourceLang: string, targetLang: string): void` -- called after successful reject
  - `clearDetectedPattern(): void`
  - `resetPatternCounter(groupKey: string, patternName: string): void`
  - `addSuppression(rule: SuppressionRule): void`
  - `removeSuppression(ruleId: string): void`
  - `setActiveSuppressions(rules: SuppressionRule[]): void`
- [x] 4.4 Wire `trackRejection` call into `use-review-actions.ts` after successful reject
- [x] 4.5 Note: `RejectionTracker` uses `Map` which is NOT JSON-serializable -- do NOT persist to sessionStorage (O1)

### Task 5: Suppress Dialog Component (AC2)

- [x] 5.1 Create `src/features/review/components/SuppressPatternDialog.tsx`:
  - Props: `open: boolean`, `pattern: DetectedPattern`, `onConfirm: (config: SuppressionConfig) => void`, `onCancel: () => void`
  - Pattern preview section: category badge + keyword list
  - Scope radios: file / language_pair / all (default: language_pair)
  - Duration radios: until_improved / permanent / session (default: until_improved)
  - Language pair display: "EN -> TH" from `pattern.sourceLang`/`pattern.targetLang`
  - Focus trap (Guardrail #30), Escape closes (Guardrail #31)
  - `useEffect(() => { if (open) resetForm() }, [open])` (Guardrail #11)
- [x] 5.2 Create Zod schema: `src/features/review/validation/suppressionRule.schema.ts`
  - `suppressionRuleSchema`: projectId, category, pattern, scope (SuppressionScope), duration (SuppressionDuration), fileId?, sourceLang?, targetLang?
- [x] 5.3 Unit test: `SuppressPatternDialog.test.tsx` -- render, radio defaults, keyboard nav, submit payload

### Task 6: Server Action -- Create Suppression Rule + Batch Auto-Reject (AC3)

- [x] 6.1 Create `src/features/review/actions/createSuppressionRule.action.ts`:
  - Auth: `requireRole('qa_reviewer')`
  - Zod validation with `suppressionRuleSchema`
  - Return `ActionResult<{ ruleId: string; autoRejectedCount: number }>`
- [x] 6.2 **Batch auto-reject** (C5 fix -- follow `bulkAction.action.ts` pattern):
  - Query matching Pending findings: `SELECT FROM findings WHERE file_id = ? AND status = 'pending' AND category = ? AND tenant_id = ?` with `withTenant`
  - Filter in-app by word overlap (>=3 keywords) using `computeWordOverlap`
  - Cap at 100 findings max (safety limit)
  - Single `db.transaction()`:
    - INSERT `suppression_rules` row
    - UPDATE all matching findings: `SET status = 'rejected', updated_at = now()`
    - INSERT `review_actions` rows (all with shared `batchId`, `isBulk: true`, `metadata: { suppressed: true, suppressionRuleId }`)
    - INSERT `feedback_events` rows (batch insert with `metadata: { suppressed: true }`)
    - UPDATE `suppression_rules` match_count
  - Single `finding.changed` Inngest event after transaction (NOT per-finding)
  - Audit log entry for suppression creation
- [x] 6.3 **`executeReviewAction` metadata gap** (E5 fix): do NOT use `executeReviewAction` for auto-reject. It hardcodes `metadata: null` (line 168) and sends individual Inngest events. Instead, write the UPDATE + INSERT logic directly in the transaction (same pattern as `bulkAction.action.ts` lines 138-180).
- [x] 6.4 Unit test: `createSuppressionRule.action.test.ts`

### Task 7: Server Action -- Manage Suppressions (AC5, AC6)

- [x] 7.1 Create `src/features/review/actions/getSuppressionRules.action.ts`:
  - Query `suppression_rules` for projectId with `withTenant` (Guardrail #1)
  - JOIN `users` for `created_by` display name
  - Return `ActionResult<SuppressionRule[]>` sorted by `created_at DESC`
- [x] 7.2 Create `src/features/review/actions/deactivateSuppressionRule.action.ts`:
  - Auth: `requireRole('admin')` (admin-only re-enable)
  - SET `is_active = false` with `withTenant` on UPDATE (Guardrail #1)
  - Audit log entry (Guardrail #2)
  - Return `ActionResult<{ ruleId: string }>`
- [x] 7.3 Create `src/features/review/actions/getActiveSuppressions.action.ts`:
  - Called on file load to populate store's `activeSuppressions`
  - Query: active rules matching project + (file scope OR language_pair scope OR all scope)
  - Used by pattern detection to skip already-suppressed patterns
- [x] 7.4 Unit tests for each action

### Task 8: Toast + Pattern Detection Integration (AC1, AC4)

- [x] 8.1 Wire pattern detection into reject flow in `use-review-actions.ts`:
  - After successful reject -> get finding's language pair from store's findingsMap + segment data
  - Call `trackRejection(finding, sourceLang, targetLang)`
  - If `DetectedPattern` returned -> set `detectedPattern` in store -> trigger toast
- [x] 8.2 Toast component: use existing `sonner` toast with custom render:
  - Message: "Pattern detected: '{category}: {top-3-keywords}' (N rejects)"
  - Actions: "Suppress this pattern" button -> opens SuppressPatternDialog
  - Actions: "Keep checking" button -> calls `resetPatternCounter`
  - `aria-live="polite"` (Guardrail #33)
  - Duration: persistent (no auto-dismiss) -- requires user decision
- [x] 8.3 On "Suppress" click: open `SuppressPatternDialog` -> on confirm -> call `createSuppressionRule` -> add to `activeSuppressions` in store -> confirmation toast
- [x] 8.4 On "Keep checking" click: call `resetPatternCounter(groupKey, patternName)` -> dismiss toast

### Task 9: Admin Suppression Management Page (AC5)

- [x] 9.1 Create `src/features/review/components/SuppressionRulesList.tsx`:
  - Data table (shadcn) with columns: pattern, category, scope, duration, created by, created date, match count, actions
  - "[Deactivate]" button per row -> calls `deactivateSuppressionRule`
  - Empty state: "No active suppression rules"
  - Accessible: `role="grid"`, sortable column headers
  - Use `React.lazy()` / `dynamic()` for bundle optimization (O3)
- [x] 9.2 Create new route: `src/app/(app)/admin/suppression-rules/page.tsx` (C4 fix):
  - Standalone admin page (NOT a tab on ai-usage -- that would require refactoring RSC page to client wrapper)
  - Server Component page -> `SuppressionRulesList` client component
  - Add navigation link in admin sidebar/nav if it exists, or in admin page.tsx grid
- [x] 9.3 Unit test: `SuppressionRulesList.test.tsx`

### Task 10: Auto-Reject on File Load + Session Cleanup (AC3, AC6)

- [x] 10.1 On file load (in `ReviewPageClient` after `getFileReviewData`):
  - Call `getActiveSuppressions` for this project/file/language pair
  - Check each Pending finding against active rules using `isAlreadySuppressed()`
  - Auto-reject matches via `createSuppressionRule`-style batch (or separate `autoRejectSuppressed.action.ts`)
  - Show summary toast: "X findings auto-suppressed by active rules"
- [x] 10.2 Guard: if no active suppressions, skip entirely (no unnecessary queries)
- [x] 10.3 Auto-deactivate stale session rules: on file load, query `duration = 'session'` rules with `created_at` > 24h ago -> set `is_active = false` (defensive fallback)
- [x] 10.4 Session-only cleanup (E1 fix):
  - Primary: `visibilitychange` event listener -> when `document.visibilityState === 'hidden'`, call `navigator.sendBeacon('/api/deactivate-session-rules', JSON.stringify({ ruleIds }))` (reliable even during tab close)
  - Fallback: `beforeunload` event listener (unreliable on mobile, but catches desktop)
  - Route handler: `src/app/api/deactivate-session-rules/route.ts` (thin wrapper around `deactivateSuppressionRule` logic)

### Task 11: E2E Test (AC1-AC7)

- [x] 11.1 Create `e2e/review-suppress-patterns.spec.ts`:
  - Seed: project + file + 5+ findings with same category + same language pair + similar descriptions (>=3 word overlap)
  - Test: reject 3 findings -> toast appears -> click "Suppress" -> dialog -> confirm -> remaining Pending auto-rejected
  - Test: reject 3 -> toast -> "Keep checking" -> counter resets -> reject 3 more -> toast again
  - Test: admin page `/admin/suppression-rules` shows rule -> deactivate -> rule deactivated
  - Accessibility: keyboard-only flow through dialog
- [x] 11.2 Follow E2E patterns from `e2e/review-search-filter.spec.ts` (Story 4.5 reference)

## Dev Notes

### Architecture Patterns (MUST Follow)

- **Server Actions** return `ActionResult<T>` -- never throw from action boundary
- **withTenant()** on EVERY query (Guardrail #1) -- including SELECT, UPDATE on suppression_rules
- **Audit log** for state-changing actions (Guardrail #2) -- suppress creation + deactivation
- **Named exports only** -- no `export default` (CLAUDE.md anti-patterns)
- **File-scoped Zustand** -- all new state lives in `FileState` type, resets on file switch (TD-ARCH-001)
- **`inArray` guard** -- if finding IDs array is empty, return early (Guardrail #5)
- **Dialog state reset** -- `useEffect(() => { if (open) resetForm() }, [open])` (Guardrail #11)
- **Batch auto-reject** -- follow `bulkAction.action.ts` transaction pattern, NOT per-finding `executeReviewAction`

### Existing Code to Extend (NOT Reinvent)

| What | Where | How to Extend |
|------|-------|---------------|
| Reject flow + feedback_events | `rejectFinding.action.ts` | Reference pattern for feedback_events INSERT fields |
| **Batch action pattern** | `bulkAction.action.ts` | **Follow for auto-reject**: single transaction, shared batchId, batch INSERT review_actions + feedback_events, single Inngest event |
| Shared review action helper | `helpers/executeReviewAction.ts` | Do NOT use for auto-reject (hardcodes `metadata: null` line 168, sends per-finding Inngest). Use direct transaction instead |
| State transitions | `utils/state-transitions.ts` | `getNewState('reject', 'pending')` returns `'rejected'` -- use for validation |
| Filter helpers | `utils/filter-helpers.ts` | `findingMatchesFilters()` -- reference for Pending finding queries |
| Toast pattern | `sonner` (already installed) | Custom render with action buttons |
| FindingForDisplay type | `types.ts` | Has `category` + `description` -- sufficient for pattern matching |
| Review action hook | `hooks/use-review-actions.ts` | Wire `trackRejection` call after reject handler |
| File review data loader | `actions/getFileReviewData.action.ts` | Returns segment data with `sourceLang`/`targetLang` -- use for language pair |

### DB Schema -- Current vs Required

**`suppression_rules` table -- CURRENT (10 columns in `src/db/schema/suppressionRules.ts`):**
```
id, project_id, tenant_id, pattern, category, scope('project'|'tenant'), reason, created_by, is_active, created_at
```

**REQUIRED additions (migration):**
```diff
+ duration: varchar('duration', { length: 30 }).notNull().default('until_improved')
+ file_id: uuid('file_id').references(() => files.id, { onDelete: 'cascade' })  -- nullable
+ source_lang: varchar('source_lang', { length: 35 })  -- nullable
+ target_lang: varchar('target_lang', { length: 35 })  -- nullable
+ match_count: integer('match_count').notNull().default(0)
~ scope: VARCHAR — no DB enum constraint. Update Drizzle comment to 'file'|'language_pair'|'all'. Data migration: UPDATE ... SET scope = 'all' WHERE scope IN ('project', 'tenant')
```

**`feedback_events` -- NO schema change needed:**
- Use existing `metadata` jsonb column: `{ suppressed: true, suppressionRuleId: '...' }`

### Language Pair Source

Language pair data lives on `segments` table (`source_lang`, `target_lang`), NOT on `files` table.

**For pattern detection (during review):** Use segment data returned by `getFileReviewData` action which loads segments for the current file. The review page already has this data -- pass `sourceLang`/`targetLang` to `trackRejection()`.

**For suppression rule scope:** Query: `SELECT DISTINCT source_lang, target_lang FROM segments WHERE file_id = ? AND tenant_id = ? LIMIT 1`

**Do NOT use** `use-segment-context.ts` -- it fetches context for the focused finding's segment (per-finding, debounced), not file-level language pair.

### FileState Update Checklist (5 coordinated locations)

When adding ANY field to `FileState`, update ALL of:
1. `FileState` type definition (~line 479)
2. `DEFAULT_FILE_STATE` frozen object (~line 510)
3. `createFreshFileState()` function (~line 535)
4. `FILE_STATE_KEYS` ReadonlySet (~line 581) -- enables auto-sync via `createSyncingSet`
5. `createFileState(fileId)` (~line 562) -- only if field needs restore-from-cache behavior

### Session-Only Suppression Strategy

For `duration: 'session'` suppressions:
- Still write to DB (enables admin visibility)
- Primary: `visibilitychange` event + `navigator.sendBeacon()` for reliable deactivation (works even during tab close on mobile)
- Fallback: `beforeunload` event (unreliable on mobile)
- Route handler: `POST /api/deactivate-session-rules` (accepts array of ruleIds, thin wrapper)
- Defensive: on file load, auto-deactivate session rules with `created_at` > 24h

### Previous Story Intelligence (Story 4.5)

**Key learnings:**
- `React.memo` on list items (FindingCardCompact) -- already wrapped, suppressed badge won't cause perf regression
- Cross-file data flow verification (Guardrail #44): rejection tracker -> store -> toast -> dialog -> server action -> store update chain
- H1: Props must be wired end-to-end (dead code detection) -- verify suppressed badge reaches FindingCardCompact
- H5: Defensive merge on cache load -- apply same pattern for rejection tracker
- H6: Extract shared functions -- pattern detection in single shared module

### Project Structure Notes

```
src/features/review/
├── actions/
│   ├── createSuppressionRule.action.ts     (NEW — includes batch auto-reject)
│   ├── getSuppressionRules.action.ts       (NEW)
│   ├── deactivateSuppressionRule.action.ts (NEW)
│   ├── getActiveSuppressions.action.ts     (NEW)
│   └── ... (existing actions unchanged)
├── components/
│   ├── SuppressPatternDialog.tsx           (NEW)
│   ├── SuppressPatternDialog.test.tsx      (NEW)
│   ├── SuppressionRulesList.tsx            (NEW)
│   ├── SuppressionRulesList.test.tsx       (NEW)
│   └── ... (existing components — minor modifications)
├── hooks/
│   └── use-review-actions.ts              (MODIFY — wire trackRejection after reject)
├── stores/
│   └── review.store.ts                    (MODIFY — add 3 fields to FileState + 5 coordinated locations)
├── utils/
│   ├── pattern-detection.ts               (NEW)
│   ├── pattern-detection.test.ts          (NEW)
│   └── ... (existing utils unchanged)
├── validation/
│   ├── suppressionRule.schema.ts          (NEW)
│   └── ... (existing schemas unchanged)
├── types.ts                               (MODIFY — add SuppressionRule, DetectedPattern, SuppressionConfig, SuppressionScope, SuppressionDuration)
src/db/schema/
│   └── suppressionRules.ts               (MODIFY — add 5 new columns + update scope comment)
src/app/(app)/admin/
│   └── suppression-rules/page.tsx         (NEW — standalone admin page)
src/app/api/
│   └── deactivate-session-rules/route.ts  (NEW — sendBeacon endpoint for session cleanup)
```

### Guardrails Checklist (Verify BEFORE Each File)

- [x] Guardrail #1: `withTenant()` on every SELECT/UPDATE/DELETE
- [x] Guardrail #2: Audit log for suppress creation + deactivation
- [x] Guardrail #3: No bare `string` for scope/duration -- use `SuppressionScope` / `SuppressionDuration` union types
- [x] Guardrail #4: Guard `rows[0]!` after SELECT
- [x] Guardrail #5: `inArray` empty array guard
- [x] Guardrail #6: Batch auto-reject in single `db.transaction()` (Guardrail #6)
- [x] Guardrail #8: Optional filter uses `null`, not `''`
- [x] Guardrail #11: Dialog state reset on re-open
- [x] Guardrail #25: Color never sole info carrier -- suppressed badge
- [x] Guardrail #28: Single-key hotkeys scoped (no conflict with suppress dialog)
- [x] Guardrail #30: Modal focus trap + restore
- [x] Guardrail #31: Escape hierarchy -- dialog closes first
- [x] Guardrail #33: `aria-live="polite"` for toast
- [x] Guardrail #37: `prefers-reduced-motion` for dialog animations
- [x] Guardrail #41: DB constraint added -> audit all INSERT/UPDATE paths
- [x] Guardrail #44: Cross-file data flow: reject -> tracker -> toast -> dialog -> action -> store

### Testing Requirements

- **Unit tests** co-located: `pattern-detection.test.ts`, `SuppressPatternDialog.test.tsx`, `SuppressionRulesList.test.tsx`, action tests
- **Boundary value tests (MANDATORY):** threshold at 3 (2=no, 3=yes), word overlap at 3 (2=no, 3=yes), keyword count at 4 (3=excluded, 4=included), match_count at 0/1/max, auto-reject cap at 100
- **E2E test:** `e2e/review-suppress-patterns.spec.ts` -- full flow from reject -> suppress -> verify
- **Naming:** `describe("PatternDetection")` -> `it("should detect pattern when 3 findings share category, language pair, and >=3 keyword overlap")`

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-4-review-decision-workflow.md` -- Story 4.6 AC, FR30]
- [Source: `src/db/schema/suppressionRules.ts` -- current schema (10 columns)]
- [Source: `src/db/schema/feedbackEvents.ts` -- metadata jsonb at line 40]
- [Source: `src/features/review/actions/rejectFinding.action.ts` -- reject + feedback_events pattern]
- [Source: `src/features/review/actions/bulkAction.action.ts` -- batch transaction pattern to follow]
- [Source: `src/features/review/actions/helpers/executeReviewAction.ts` -- shared helper (do NOT use for auto-reject)]
- [Source: `src/features/review/utils/state-transitions.ts` -- transition matrix]
- [Source: `src/features/review/stores/review.store.ts` -- FileState at line 479, DEFAULT_FILE_STATE at line 510, FILE_STATE_KEYS at line 581]
- [Source: `src/features/review/utils/filter-helpers.ts` -- findingMatchesFilters]
- [Source: `src/types/finding.ts` -- FindingSeverity, FindingStatus, DetectedByLayer]
- [Source: `src/app/(app)/admin/` -- existing: page.tsx, ai-usage/page.tsx, taxonomy/page.tsx]
- [Source: `_bmad-output/implementation-artifacts/4-5-search-filter-ai-layer-toggle.md` -- previous story patterns]

## Codebase Verification Report

| Claim | Status | Notes |
|-------|--------|-------|
| `suppression_rules` table exists | VERIFIED | `src/db/schema/suppressionRules.ts` -- 10 columns |
| `suppression_rules.scope` = 'project'/'tenant' | VERIFIED | Needs data migration to 'file'/'language_pair'/'all' (VARCHAR, no DB enum) |
| `suppression_rules.duration` column | MISSING | Needs migration (Task 1) |
| `suppression_rules.file_id` column | MISSING | Needs migration (Task 1) |
| `suppression_rules.source_lang`/`target_lang` | MISSING | Needs migration (Task 1) |
| `suppression_rules.match_count` column | MISSING | Needs migration (Task 1) |
| No existing queries on suppression_rules | VERIFIED | Grep found 0 SELECT/INSERT/UPDATE -- safe to migrate |
| `feedback_events.metadata` jsonb exists | VERIFIED | `src/db/schema/feedbackEvents.ts:40` |
| `segments.source_lang`/`target_lang` exist | VERIFIED | `src/db/schema/segments.ts:49-50` |
| `files` table has NO language pair columns | VERIFIED | Language pair from segments only |
| `rejectFinding.action.ts` writes feedback_events | VERIFIED | Lines 78-96, pattern to reference |
| `bulkAction.action.ts` batch transaction | VERIFIED | Lines 138-180, pattern to follow for auto-reject |
| `executeReviewAction` hardcodes metadata: null | VERIFIED | Line 168 -- do NOT use for auto-reject |
| `review.store.ts` FileState (20 fields) | VERIFIED | Lines 479-507, TD-ARCH-001 refactor |
| `FILE_STATE_KEYS` ReadonlySet | VERIFIED | Lines 581-602, MUST add new fields here |
| `DEFAULT_FILE_STATE` + `createFreshFileState` | VERIFIED | Lines 510-558, both MUST be updated |
| Admin routes: page.tsx, ai-usage/, taxonomy/ | VERIFIED | New route: `admin/suppression-rules/page.tsx` |
| `sonner` toast library installed | VERIFIED | Used across app |

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Pattern detection cluster algorithm: changed from pairwise strict to transitive overlap (connected component BFS)
- `vi.clearAllMocks()` in beforeEach clears mock implementations — must re-set `mockRequireRole` after clear
- `react-hooks/set-state-in-effect` lint rule for Guardrail #11 dialog reset

### Production Bugs Found During E2E (6 bugs, all fixed)

| ID | Root Cause | Severity | Fix |
|----|-----------|----------|-----|
| PB-1 | `createSuppressionRule` auto-reject queried project-wide (CF-H1 fix removed file filter for non-file scopes) → rejected findings across ALL files | **Critical** | Added `currentFileId` param — auto-reject always scoped to current file per AC3 |
| PB-2 | Client Zustand store not updated after server auto-reject → UI showed rejected findings as "pending" | **High** | Server returns `autoRejectedIds[]`, client updates store per-ID via `setFinding()` |
| PB-3 | `setActiveSuppressions` had `length > 0` guard → deactivated rules not cleared from store | **High** | Removed guard — `setActiveSuppressions(result.data)` always (may be `[]`) |
| PB-4 | `resetPatternCounter` only added to `dismissedPatterns` but kept old entries → old entries formed new clusters with 1 post-reset rejection | **High** | Added `group.entries = []` clear per AC4 "counter resets" |
| PB-5 | `data-category` attribute missing on FindingCard/FindingCardCompact → E2E selectors failed | **Medium** | Added `data-category={finding.category.toLowerCase()}` to both components |
| PB-6 | `fileId!` null crash in reviewActions INSERT for `language_pair` scope (NOT NULL column) | **Critical** | Used `f.findingFileId` from finding record instead of scope-derived `fileId` |

### Completion Notes List
- Task 1: DB migration — 5 columns added + scope data migration + FK relation
- Task 2: Types — SuppressionScope, SuppressionDuration, SuppressionRule, SuppressionConfig, DetectedPattern
- Task 3: Pattern detection — extractKeywords (Latin + Thai/CJK), computeWordOverlap, trackRejection (transitive BFS), resetPatternCounter, isAlreadySuppressed. 15 tests passing
- Task 4: Zustand store — 3 FileState fields + 6 actions across all 5 coordinated locations
- Task 5: SuppressPatternDialog — scope/duration radios, focus trap, Escape, a11y. 5 tests
- Task 6: createSuppressionRule — batch auto-reject in single transaction, feedback_events with metadata.suppressed, single Inngest event. 5 tests
- Task 7: getSuppressionRules (tenant-wide), deactivateSuppressionRule (admin), getActiveSuppressions
- Task 8: Toast + pattern detection wired into reject flow with isAlreadySuppressed guard
- Task 9: Admin page at /admin/suppression-rules with SuppressionRulesList. 4 tests
- Task 10: Active suppressions loaded on file load, session cleanup via beforeunload + sendBeacon
- Task 11: E2E tests unskipped
- Pre-CR: 5 agents (anti-pattern, tenant-isolation, code-quality, cross-file, rls-policy). Fixed 2C+5H findings

### Pre-CR Quality Scan Results
- **anti-pattern-detector**: 0C/0H/6M/4L — Fixed M1 (Record types), M6 (focus restore), L1 (duplicate import), L2 (grid role)
- **tenant-isolation-checker**: 0C/0H/0M/0L — PASS
- **code-quality-analyzer**: 1C/3H — Fixed CQ-C1 (sendBeacon Content-Type), CQ-H1 (session cleanup scope)
- **cross-file-reviewer**: 2C/3H — Fixed CF-C1 (stale tracker ref), CF-C2 (isAlreadySuppressed wired), CF-H1 (all-scope auto-reject), CF-H2 (pendingPattern ref)
- **rls-policy-reviewer**: 0C/0H/1M/1L — M1 (INSERT role check = defense-in-depth, deferred), L1 (no RLS test, deferred)
- **Conditional scans**: rls-policy-reviewer ran (schema changed). inngest-function-validator skipped (no pipeline changes)

### CR Results
- **CR R1:** 2C+8H+11M+5L → all fixed → `cf9a320`
- **CR R2 (full re-review):** 0C+1H+11M+9L → all fixed → `c2b23bd`
- **CR EXIT:** 0C + 0H — 2 rounds, target met

#### CR R1 Key Fixes
- C1: 24h stale session cleanup in getActiveSuppressions (AC6 Task 10.3)
- C2: 3 missing server action test files (19 tests added)
- H1: Immutable trackRejection/resetPatternCounter (new Map pattern for Zustand)
- H2: serverUpdatedAt returned from createSuppressionRule for client store
- H3: Admin nav tab added to layout.tsx
- H4-H6: isAlreadySuppressed tests (10) + reject→pattern integration tests (4)
- H7: UUID validation on deactivateSuppressionRule
- H8: Nullable findingFileId guard with fallback

#### CR R2 Key Fixes
- H1: Vacuous feedback_events test assertion (flatten captures + guard)
- M4: Runtime validation for scope/duration (SUPPRESSION_SCOPES/DURATIONS sets)
- M5: Error UI for admin page
- M11: Renamed trackRejectionInStore → setDetectedPattern (semantic accuracy)
- L4: Cached Intl.Segmenter per locale
- L8: File-switch guard for tracker writes post-await

### Change Log
- 2026-03-17: Story 4.6 implementation complete — all 11 tasks done, 320/320 unit test files pass (3747 tests), 0 lint errors, 0 TS errors
- 2026-03-17: E2E debugging — found + fixed 6 production bugs (PB-1 to PB-6). Root cause: auto-reject scope leaked across files, client store not synced. 8/8 E2E tests GREEN
- 2026-03-17: CR R1 — fixed 2C+8H+11M+5L. Key: immutable tracker, server timestamps, missing tests, admin nav
- 2026-03-17: CR R2 — fixed 0C+1H+11M+9L. Key: vacuous assertion, runtime validation, rename setDetectedPattern, Segmenter cache
- 2026-03-17: CR EXIT 0C+0H — Story marked done

### File List
**NEW:**
- src/features/review/utils/pattern-detection.ts
- src/features/review/validation/suppressionRule.schema.ts
- src/features/review/components/SuppressPatternDialog.tsx
- src/features/review/components/SuppressionRulesList.tsx
- src/features/review/actions/createSuppressionRule.action.ts
- src/features/review/actions/getSuppressionRules.action.ts
- src/features/review/actions/deactivateSuppressionRule.action.ts
- src/features/review/actions/getActiveSuppressions.action.ts
- src/app/(app)/admin/suppression-rules/page.tsx
- src/app/(app)/admin/suppression-rules/SuppressionRulesPageClient.tsx
- src/app/api/deactivate-session-rules/route.ts
- src/db/migrations/0013_flashy_blockbuster.sql
- src/db/migrations/meta/0013_snapshot.json
- e2e/review-suppress-patterns.spec.ts (unskipped)

**NEW (CR-C2 test files):**
- src/features/review/actions/deactivateSuppressionRule.action.test.ts
- src/features/review/actions/getSuppressionRules.action.test.ts
- src/features/review/actions/getActiveSuppressions.action.test.ts

**MODIFIED:**
- src/db/schema/suppressionRules.ts (5 new columns)
- src/db/schema/relations.ts (file FK relation)
- src/features/review/types.ts (5 new types + SUPPRESSION_SCOPES/DURATIONS validation sets)
- src/features/review/stores/review.store.ts (SuppressionSlice + FileState + rename setDetectedPattern)
- src/features/review/hooks/use-review-actions.ts (pattern detection + isAlreadySuppressed + file-switch guard)
- src/features/review/components/ReviewPageClient.tsx (toast, dialog, suppression load, session cleanup, server timestamp, ref sync)
- src/features/review/components/FindingCard.tsx (PB-5: data-category attribute)
- src/features/review/components/FindingCardCompact.tsx (PB-5: data-category attribute)
- src/features/review/components/SuppressionRulesList.tsx (role="table", scope="col")
- src/features/review/utils/pattern-detection.ts (immutable tracker, fileId guard, Segmenter cache)
- src/features/review/validation/suppressionRule.schema.ts (currentFileId, .max() bounds)
- src/features/review/actions/createSuppressionRule.action.ts (serverUpdatedAt, nullable guard)
- src/features/review/actions/getActiveSuppressions.action.ts (24h stale cleanup, UUID validation, runtime validation)
- src/features/review/actions/getSuppressionRules.action.ts (UUID validation, runtime validation)
- src/features/review/actions/deactivateSuppressionRule.action.ts (UUID validation)
- src/app/(app)/admin/layout.tsx (Suppression Rules nav tab)
- src/app/api/deactivate-session-rules/route.ts (audit log)
- src/features/pipeline/engine/checks/customRuleChecks.test.ts (new schema fields in factory)
- src/features/pipeline/engine/ruleEngine.test.ts (new schema fields in factory)
- e2e/review-search-filter.spec.ts (bulk selection assertion fix)
