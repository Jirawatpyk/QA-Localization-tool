# Story 3.3: AI Layer 3 Deep Contextual Analysis

Status: review

## Story

As a QA Reviewer,
I want AI-powered deep contextual analysis (Layer 3) on segments flagged by L2 screening,
So that I get the most thorough quality assessment with high-confidence findings on complex issues that L1 rules and L2 screening might miss.

## Acceptance Criteria

1. **AC1 — Selective segment filtering:** When Thorough mode L3 processing begins, ONLY segments flagged by L2 are sent to L3. The filter logic: query L2 findings grouped by `segment_id` → for each segment that HAS L2 findings, include it IF `(finding_count > 0)` OR `(max_ai_confidence < l3ConfidenceMin)`. Segments with ZERO L2 findings are EXCLUDED (they have no L2 confidence to compare). In practice, the first condition already captures all segments with any L2 findings, so the second condition serves as a redundant safety net. If zero segments are flagged, L3 is skipped entirely (file transitions directly to `l3_completed`, zero L3 findings, score still calculated with `layerCompleted: 'L1L2L3'`). **Note:** Only segments that appear in the L2 findings GROUP BY result are candidates — segments L2 found no issues with are NOT sent to L3.

2. **AC2 — Surrounding context (±2 segments):** Each segment sent to L3 includes surrounding context of ±2 segments in file order. Format: `{ previous: PromptSegment[], current: PromptSegment, next: PromptSegment[] }`. At file boundaries: first segment has 0 previous + 2 next; last segment has 2 previous + 0 next. Context is loaded per-segment from DB ordered by `segment_number`.

3. **AC3 — Shared prompt builder integration (TD-PIPE-003):** The inline `buildL3Prompt()` function in `runL3ForFile.ts` (lines 419-474) is replaced with the shared `buildL3Prompt()` from `src/features/pipeline/prompts/build-l3-prompt.ts`. This requires loading glossary terms, taxonomy categories, and project context (same queries as `runL2ForFile`). The shared prompt builder already includes: system role, domain context, taxonomy, glossary, language instructions (Thai/CJK), all 7 few-shot examples, confidence instructions (threshold >=30), cross-layer dedup instructions, output format with rationale, prior findings (L1+L2).

4. **AC4 — L3 confirm/contradict L2 post-processing:** After L3 findings are saved:
   - **Confirm:** If L3 finds an issue on the same segment AND same category as an L2 finding, UPDATE the L2 finding: `newConfidence = Math.min(100, existingConfidence * 1.1)` (multiply by 1.1, NOT add 10 points), append `\n\n[L3 Confirmed]` marker to description.
   - **Contradict:** If L3's `false_positive_review` category targets an L2 finding's segment (L3 found no issue where L2 did), UPDATE the L2 finding: append `\n\n[L3 Disagrees]` to description. L2 finding's confidence is NOT reduced (reviewer decides).
   - **Idempotent:** Before appending markers, check if marker already exists in description (re-run safety). If already present, skip the append.
   - **Realtime effect:** UPDATEs to L2 findings trigger Supabase Realtime UPDATE events → `useFindingsSubscription` UPDATE handler (added in Story 3.2c CR R1) updates `findingsMap` → UI auto-refreshes with badges.
   - Metadata stored via description-append pattern (no DB migration needed — see Task 6 design note).

5. **AC5 — L3 Zod output schema:** The L3 structured output schema uses `rationale` field (matching existing `l3ChunkResponseSchema` and `build-l3-prompt.ts` output format instructions). Schema: `{ findings: [{ segmentId, category, severity, confidence, description, suggestedFix (nullable), rationale }], summary }`. Extract to `src/features/pipeline/schemas/l3-output.ts` following L2 pattern.

6. **AC6 — Score update + ScoreBadge 'deep-analyzed' state:** When L3 completes:
   - `scores.layer_completed` = `'L1L2L3'` (already wired in processFile.ts step 6)
   - `scores.score_status` = `'calculated'` (final)
   - ScoreBadge adds new state `'deep-analyzed'`: gold color (`--color-status-deep-analyzed`), label "Deep Analyzed"
   - `ReviewPageClient` maps `layerCompleted === 'L1L2L3'` to `state='deep-analyzed'`
   - ReviewProgress shows L3 checkmark when `layerCompleted` includes L3

7. **AC7 — languagePair wiring:** All L3 `AIUsageRecord` entries set `languagePair` from segment data (e.g., `'en→th'`) instead of current `null`. Uses `deriveLanguagePair()` helper (same pattern as `runL2ForFile`).

8. **AC8 — Performance:** 100 flagged segments processed within 2 minutes (NFR4). Chunking at 30K chars is already implemented. Selective filtering reduces actual segment count (only L2-flagged segments go to L3).

9. **AC9 — L3 findings display:** L3 findings show in the review page (from Story 3.2c infrastructure):
   - LayerBadge shows "AI" (purple) for L3 findings (same as L2)
   - ConfidenceBadge with L3 confidence value
   - Description includes rationale section (embedded in description field: `${description}\n\nRationale: ${rationale}`)
   - L2 findings with `l3Confirmed` show "Confirmed by L3" indicator
   - L2 findings with `l3Disagrees` show "L3 disagrees" warning indicator

10. **AC10 — Auto-pass evaluation:** After L3 score is calculated (final score with all layers), auto-pass evaluation runs (FR22): score >= language pair `autoPassThreshold` AND 0 Critical findings AND 0 unresolved Major findings. This is already handled by `scoreFile()` — no new code needed, just verify via tests.

11. **AC11 — Boundary values:**
    - Zero segments flagged by L2 → L3 skips, `layerCompleted` still set to `'L1L2L3'`, ScoreBadge shows "Deep Analyzed"
    - All segments flagged → all sent to L3 (no performance regression test needed — NFR4 covers 100 segments)
    - Segment at file boundary (segment_number=1) → previous context = empty array, next = up to 2 segments
    - Segment at file end → next context = empty array, previous = up to 2 segments
    - L3 confidence boost: L2 finding at 90% + L3 confirms → boosted to min(100, 90 * 1.1) = 99
    - L3 confidence boost: L2 finding at 95% → boosted to min(100, 95 * 1.1) = 100 (capped)
    - L3 confirms L2 but different severity → confidence boosted, severity NOT changed (reviewer decides)
    - L3 contradicts L2 → `l3Disagrees` flag set, confidence NOT reduced

## Tasks / Subtasks

- [x] **Task 1: Extract L3 schema to separate file** (AC: #5)
  - [x]1.1 Create `src/features/pipeline/schemas/l3-output.ts` following `l2-output.ts` pattern
  - [x]1.2 Move `l3ChunkResponseSchema` from `runL3ForFile.ts:63-78` to new file. **FIX:** Add `.min(0).max(100)` to `confidence` field (matching L2 schema pattern in `l2-output.ts:27` — existing L3 schema lacks bounds validation)
  - [x]1.3 Export `l3FindingSchema`, `l3OutputSchema`, `L3Finding`, `L3Output` types
  - [x]1.4 Update `runL3ForFile.ts` to import from new schema file
  - [x]1.5 Add schema validation tests: valid findings, missing rationale, confidence 0 (pass), 100 (pass), -1 (Zod rejects), 101 (Zod rejects), nullable suggestedFix. **Note:** Zod schema REJECTS out-of-range values (parse error); the runtime code in Step 7 (Math.min/max clamp) is a defense-in-depth layer for values that somehow pass schema

- [x] **Task 2: Extend L3PromptInput with surrounding context** (AC: #2, #3)
  - [x]2.1 Add `surroundingContext` field to `L3PromptInput` type in `src/features/pipeline/prompts/types.ts`:
    ```typescript
    type SurroundingSegmentContext = {
      previous: PromptSegment[]
      current: PromptSegment
      next: PromptSegment[]
    }
    // Add to L3PromptInput:
    surroundingContext?: SurroundingSegmentContext[]
    ```
  - [x]2.2 Add `formatSurroundingContext()` helper to `src/features/pipeline/prompts/build-l3-prompt.ts`:
    - Format: "Segment [id] with context:\n  Previous: [prev segments]\n  Current: [source → target]\n  Next: [next segments]"
    - If no surrounding context provided, fall back to current `formatSegments()` behavior
  - [x]2.3 Update `buildL3Prompt()` to include surrounding context section when available
  - [x]2.4 Unit tests: surrounding context formatting, boundary segments (first/last), empty context fallback

- [x] **Task 3: Implement selective segment filtering in runL3ForFile** (AC: #1, #7)
  - [x]3.1 After loading segments (Step 3), query L2 findings grouped by segment:
    ```sql
    SELECT segment_id, MAX(ai_confidence) as max_confidence, COUNT(*) as finding_count
    FROM findings
    WHERE file_id = ? AND detected_by_layer = 'L2' AND tenant_id = ?
    GROUP BY segment_id
    ```
  - [x]3.2 Query `language_pair_configs` for `l3ConfidenceMin` threshold (derive language pair from segments, same pattern as `getFileReviewData.action.ts`). **Note:** Currently `l3ConfidenceMin` is redundant — all segments in the GROUP BY result already have `finding_count > 0` so they pass the first OR condition regardless of confidence. Query it anyway for future use (e.g., if we later want to EXCLUDE high-confidence L2 findings from L3 to save cost)
  - [x]3.3 Filter segments: include only those that appear in the GROUP BY result (i.e., have at least 1 L2 finding). The OR condition `(l2MaxConfidence < l3ConfidenceMin)` further flags low-confidence findings but all segments with findings are already included by the first condition. **Guardrail #5:** If `filteredSegmentIds` is empty, do NOT pass to `inArray()` — use early return (Task 3.4)
  - [x]3.4 If filteredSegments is empty → skip AI processing, set file status to `l3_completed`, return early with `findingCount: 0`
  - [x]3.5 Add `deriveLanguagePair()` helper — **COPY** the function from `runL2ForFile:90-95` (it's a private function, not exported). Signature: `(segmentRows: SegmentRow[]) => string | null`. Wire into all `AIUsageRecord` entries replacing `languagePair: null`. **Dev note:** If preferred, extract to shared `src/features/pipeline/helpers/deriveLanguagePair.ts` and import from both L2+L3 to eliminate duplication — either approach acceptable
  - [x]3.6 Unit tests: filtering logic (all flagged, none flagged, mixed), early return, threshold boundary at exact l3ConfidenceMin value

- [x] **Task 4: Add surrounding context loading to runL3ForFile** (AC: #2)
  - [x]4.1 For each filtered segment, query ±2 surrounding segments by `segment_number` order with `withTenant()`:
    ```typescript
    // Load ALL segments for file once (already loaded in Step 3), then slice per segment:
    const allSegments = segmentRows // already loaded, ordered by segmentNumber
    for (const seg of filteredSegments) {
      const idx = allSegments.findIndex(s => s.id === seg.id)
      const prev = allSegments.slice(Math.max(0, idx - 2), idx)
      const next = allSegments.slice(idx + 1, idx + 3)
      // Build SurroundingSegmentContext
    }
    ```
  - [x]4.2 **Important:** Use full segment list (not just filtered segments) for context — surrounding segments may NOT be in the filtered set
  - [x]4.3 Pass `surroundingContext` array into `buildL3Prompt()` input
  - [x]4.4 Unit tests: boundary segments (first/last), segments at positions 0,1 and N-1,N, middle segments

- [x] **Task 5: Migrate to shared buildL3Prompt (TD-PIPE-003)** (AC: #3)
  - [x]5.1 Add context loading queries to `runL3ForFile` (after Step 3, before chunking):
    - **Glossary terms:** query `glossaryTerms` table for project's glossary with `withTenant()` (same as `runL2ForFile` Step 4b)
    - **Taxonomy categories:** query `taxonomyDefinitions` table only (NO `taxonomy_mappings`) — `where(eq(taxonomyDefinitions.isActive, true))` — no tenant_id (global table). Same as `runL2ForFile` Step 4c (lines 215-224)
    - **Project context:** query `projects` table with `withTenant()` (same as `runL2ForFile` Step 4d)
    - **New imports needed:** `languagePairConfigs`, `glossaryTerms`, `projects`, `taxonomyDefinitions` from `@/db/schema/`, plus `buildL3Prompt` from `@/features/pipeline/prompts/build-l3-prompt`, plus `L3PromptInput` from `@/features/pipeline/prompts/types`
  - [x]5.2 Build `L3PromptInput` object with all context: segments, priorFindings, glossaryTerms, taxonomyCategories, project, surroundingContext
  - [x]5.3 Replace inline `buildL3Prompt(chunk.segments, priorFindings)` call with shared `buildL3Prompt(l3PromptInput)` from `@/features/pipeline/prompts/build-l3-prompt`. **Type note:** `SegmentRow` (internal type in runL3ForFile) is structurally compatible with `PromptSegment` (from prompts/types.ts) — same fields. `PriorFindingContext` is compatible with `PriorFinding`. Can pass directly without mapping
  - [x]5.4 Delete inline `buildL3Prompt` function (lines 419-474) and its test export `_buildL3Prompt`
  - [x]5.5 Update existing `runL3ForFile.test.ts` to mock shared `buildL3Prompt` instead of inline
  - [x]5.6 Mark TD-PIPE-003 as RESOLVED in tech-debt-tracker.md

- [x] **Task 6: L3 confirm/contradict L2 post-processing** (AC: #4)
  - [x]6.1 After L3 findings are inserted (Step 9), cross-reference with L2 findings:
    ```typescript
    // L2 findings already loaded in Step 4 (priorFindings filtered to L2)
    const l2Findings = priorFindings.filter(f => f.detectedByLayer === 'L2')
    // For each L3 finding: check if same segmentId + same category exists in L2
    ```
  - [x]6.2 **Confirm logic:** If L3 finding matches L2 finding (same segmentId + same category):
    - UPDATE L2 finding: `aiConfidence = min(100, existingConfidence * 1.1)` (10% boost)
    - Store metadata: approach decision — embed in `description` append: `\n\n[L3 Confirmed]` (no schema change needed, consistent with L3 rationale embedding pattern). Alternative: use `suggestedFix` field's nullable nature for metadata. **Chosen approach:** Add `\n\n[L3 Confirmed]` to L2 finding description (UI can parse this marker for badge display)
  - [x]6.3 **Contradict logic:** If L3 returns `false_positive_review` category for a segment with L2 finding:
    - UPDATE L2 finding: append `\n\n[L3 Disagrees]` to description
    - Do NOT reduce L2 confidence (reviewer decides)
  - [x]6.4 All UPDATEs in a single transaction with `withTenant()` (defense-in-depth)
  - [x]6.5 **Design note:** Using description-append approach avoids DB migration for metadata columns. The `[L3 Confirmed]` and `[L3 Disagrees]` markers can be parsed by UI for badge rendering. If a dedicated column is needed later, that's a separate schema change (Epic 9 scope for structured AI metadata)
  - [x]6.6 Unit tests: confirm match (boost), contradict match (disagree), no match (unchanged), confidence cap at 100, multiple L3 findings for same L2 segment, **re-run idempotent** (L3 runs twice on same file → markers NOT duplicated in description)

- [x] **Task 7: ScoreBadge 'deep-analyzed' state** (AC: #6)
  - [x]7.1 Add design token to `src/styles/tokens.css`: `--color-status-deep-analyzed: #d97706` (amber-600 / gold)
  - [x]7.2 Add `'deep-analyzed'` to `ScoreBadgeState` union type in `src/types/finding.ts`
  - [x]7.3 Add `'deep-analyzed'` to `STATE_LABELS` → "Deep Analyzed" and `STATE_CLASSES` → `bg-status-deep-analyzed/10 text-status-deep-analyzed border-status-deep-analyzed/20` in `ScoreBadge.tsx`
  - [x]7.4 Update `ReviewPageClient.tsx` state mapping: `layerCompleted === 'L1L2L3'` → `state='deep-analyzed'`. **WARNING:** Line 23 currently has `if (layerCompleted === 'L1L2' || layerCompleted === 'L1L2L3') return 'ai-screened'` — the `L1L2L3` case falls through to `'ai-screened'`. Must SPLIT into two separate conditions: `L1L2 → 'ai-screened'`, `L1L2L3 → 'deep-analyzed'`
  - [x]7.5 Update ReviewProgress: L3 step shows checkmark when `layerCompleted` includes 'L3'
  - [x]7.6 Unit tests: 'deep-analyzed' state rendering (gold color, label), ReviewPageClient mapping, ReviewProgress L3 checkmark

- [x] **Task 8: L3 confirm/contradict UI indicators** (AC: #9)
  - [x]8.1 Update `FindingListItem.tsx` to detect `[L3 Confirmed]` and `[L3 Disagrees]` markers in description:
    - Parse description: if contains `[L3 Confirmed]` → render green "Confirmed by L3" badge
    - Parse description: if contains `[L3 Disagrees]` → render amber "L3 disagrees" warning badge
    - Strip markers from displayed description text (show clean description)
  - [x]8.2 Confirmed badge: small green badge with checkmark icon, tooltip "L3 deep analysis confirmed this finding"
  - [x]8.3 Disagrees badge: small amber badge with alert icon, tooltip "L3 deep analysis did not find this issue — review recommended"
  - [x]8.4 Unit tests: marker parsing, badge rendering, clean description display, no markers → no badges

- [x] **Task 9: Unit tests — comprehensive** (AC: #11)
  - [x]9.1 `runL3ForFile.test.ts` — new test cases:
    - Selective filtering: segments without L2 findings excluded
    - Selective filtering: segments below l3ConfidenceMin threshold included
    - Zero flagged segments → early return, no AI call, findingCount=0
    - Surrounding context: correct ±2 segments passed to prompt
    - Boundary context: first segment (no previous), last segment (no next)
    - L3 confirm: L2 finding confidence boosted by 10%
    - L3 contradict: L2 finding gets `[L3 Disagrees]` marker
    - Confidence boost cap at 100
    - languagePair derived correctly
  - [x]9.2 `l3-output.test.ts` — schema validation:
    - Valid L3 finding with rationale
    - Missing rationale → parse error
    - Confidence 0, 100, -1 (clamped), 101 (clamped)
    - Nullable suggestedFix
  - [x]9.3 `__tests__/build-l3-prompt.test.ts` — new test cases (file is in `src/features/pipeline/prompts/__tests__/`):
    - Surrounding context section formatted correctly
    - Boundary segments (first/last) with partial context
    - Empty surrounding context → fallback behavior
  - [x]9.4 ScoreBadge boundary tests:
    - `'deep-analyzed'` state: gold color + "Deep Analyzed" label
    - LayerCompleted 'L1L2L3' → state mapping correct
  - [x]9.5 FindingListItem confirm/contradict badge tests:
    - `[L3 Confirmed]` marker → green badge
    - `[L3 Disagrees]` marker → amber badge
    - No marker → no badge
    - Markers stripped from visible description

- [x] **Task 10: E2E test — L3 Thorough mode** (AC: #8, #10)
  - [x]10.1 Extend `e2e/review-findings.spec.ts` or create `e2e/review-l3-findings.spec.ts`
  - [x]10.2 Setup: login → create project → upload SDLXLIFF → wait for auto-parse
  - [x]10.3 Flow: click "Start Processing" → select **Thorough** (not Economy) → confirm → wait for pipeline completion
  - [x]10.4 Wait for L3 completion: `pollScoreLayer()` with `layerCompleted: 'L1L2L3'` (extend helper if needed)
  - [x]10.5 Navigate to review page:
    - ScoreBadge shows "Deep Analyzed" (gold badge)
    - ReviewProgress shows L3 checkmark
    - L3 findings visible with confidence values
  - [x]10.6 **Thorough-mode specific assertion:** File has both L2 AND L3 findings visible
  - [x]10.7 E2E AI strategy: same as Story 3.2c — `INNGEST_DEV=1` with local Inngest dev server. If flaky in CI, create TD entry for AI mock layer
  - [x]10.8 Timeout: 120s+ for pipeline (L3 adds 30-120s processing time on top of L2)

**Task dependency order:** Task 1 → 2 → 3,4 (parallel) → 5 → 6 → 7 → 8 → 9 → 10

## Dev Notes

### Architecture Patterns & Constraints

**Per-segment vs per-file Inngest stepping (IMPORTANT):**
- Epic AC states: `step.run("segment-{id}-L3", ...)` per segment
- However, Architecture Decision from Prep P4 established: "one Inngest step per file, chunking inside" (same as L2)
- **Decision for Story 3.3:** Keep per-file stepping pattern (consistent with L2). Reasons:
  1. Per-segment steps create N Inngest steps per file — expensive, slow, counter to concurrency model
  2. L2 already uses per-file stepping with internal chunking — L3 should match
  3. Selective filtering already reduces segment count significantly
  4. `chunkSegments()` handles batching at 30K chars efficiently
- The selective filtering + surrounding context are the key L3 enhancements, not per-segment stepping

**Selective segment filtering implementation:**
```
All segments (from DB) ─┬─ Filter by L2 findings ──┬─ flagged segments → L3 AI
                        │                           │
                        │  Filter by L2 confidence  │
                        │  < l3ConfidenceMin        │
                        │                           │
                        └──────────────────────────-┘
```
- L2 findings grouped by `segment_id` + `MAX(ai_confidence)` to determine per-segment max confidence
- `l3ConfidenceMin` from `language_pair_configs` (same language pair derivation as Story 3.2c)
- Zero flagged → skip L3, still set `l3_completed` status

**Surrounding context approach:**
- All segments loaded in Step 3 (ordered by `segment_number`) — reuse this result
- For each filtered segment, find its index in the full segment list, then slice ±2
- Surrounding segments may NOT be in the filtered set (that's correct — context is contextual, not analytic)
- Performance: O(n*m) where n=filtered, m=all segments; acceptable since m is capped by file size

**L3 confirm/contradict storage strategy:**
- **No DB migration needed** — use description-append pattern: `\n\n[L3 Confirmed]` / `\n\n[L3 Disagrees]`
- Consistent with existing `runL3ForFile` rationale embedding: `${description}\n\nRationale: ${rationale}`
- UI parses these markers for badge rendering (strip from visible text)
- If structured metadata is needed later → Epic 9 (AI Learning) can add dedicated columns
- The `false_positive_review` category from `build-l3-prompt.ts` DEDUP_INSTRUCTIONS handles the "L3 disagrees" case

**Schema naming: rationale vs reasoning:**
- Epic AC uses `reasoning` but existing code + shared prompt builder use `rationale`
- `l3ChunkResponseSchema` uses `rationale` (since P4 prep)
- `build-l3-prompt.ts` OUTPUT_FORMAT_L3 instructs AI to output `rationale`
- **Decision:** Keep `rationale` (code consistency > AC naming). The concept is identical.

**ScoreBadge state transitions (complete picture):**
```
L1 only       → 'rule-only'    (blue,   "Rule-based")
L1 + L2       → 'ai-screened'  (purple, "AI Screened")     ← Story 3.2c
L1 + L2 + L3  → 'deep-analyzed'(gold,   "Deep Analyzed")   ← THIS STORY
```

### Existing Code to Extend (NOT Replace)

**`runL3ForFile.ts` — extend, not rewrite:**
The file already has 475 lines of working code with 12 tests. Changes are surgical:
1. Add segment filtering after Step 3 (new Steps 3b-3c)
2. Add context queries after Step 3c (new Steps 4b-4d, matching L2 pattern)
3. Add surrounding context building after Step 4d (new Step 4e)
4. Replace inline `buildL3Prompt()` call with shared module (Step 6)
5. Add confirm/contradict post-processing after Step 9 (new Step 9b)
6. Wire `languagePair` in usage records (Step 6 cost tracking)
7. Delete inline `buildL3Prompt` function at bottom

**`build-l3-prompt.ts` — small extension:**
- Add `formatSurroundingContext()` helper
- Add surrounding context section to prompt output (after segments, before prior findings)

### Source Tree Components to Touch

**New files:**
| File | Purpose |
|------|---------|
| `src/features/pipeline/schemas/l3-output.ts` | L3 Zod schema (extracted from runL3ForFile) |
| `src/features/pipeline/schemas/l3-output.test.ts` | Schema validation tests |

**Modified files:**
| File | Change |
|------|--------|
| `src/features/pipeline/helpers/runL3ForFile.ts` | Selective filtering, surrounding context, shared prompt, confirm/contradict, languagePair |
| `src/features/pipeline/helpers/runL3ForFile.test.ts` | New test cases for filtering, context, confirm/contradict |
| `src/features/pipeline/prompts/types.ts` | Add `SurroundingSegmentContext` type to `L3PromptInput` |
| `src/features/pipeline/prompts/build-l3-prompt.ts` | Add `formatSurroundingContext()`, integrate into prompt |
| `src/features/pipeline/prompts/__tests__/build-l3-prompt.test.ts` | New tests for surrounding context |
| `src/types/finding.ts` | Add `'deep-analyzed'` to `ScoreBadgeState` |
| `src/styles/tokens.css` | Add `--color-status-deep-analyzed: #d97706` |
| `src/features/batch/components/ScoreBadge.tsx` | Add 'deep-analyzed' state (label + classes) |
| `src/features/batch/components/ScoreBadge.test.tsx` | Test for deep-analyzed state |
| `src/features/review/components/ReviewPageClient.tsx` | Map L1L2L3 → 'deep-analyzed' |
| `src/features/review/components/ReviewProgress.tsx` | L3 checkmark rendering |
| `src/features/review/components/ReviewProgress.test.tsx` | L3 complete tests |
| `src/features/review/components/FindingListItem.tsx` | L3 confirm/contradict badge indicators |
| `src/features/review/components/FindingListItem.test.tsx` | Badge parsing tests |
| `_bmad-output/implementation-artifacts/tech-debt-tracker.md` | Mark TD-PIPE-003 RESOLVED |

### Testing Standards Summary

**Unit tests (Vitest):**
- `runL3ForFile.test.ts`: selective filtering, context loading, confirm/contradict logic, languagePair, early return
- `l3-output.test.ts`: schema validation with rationale field
- `build-l3-prompt.test.ts`: surrounding context formatting
- ScoreBadge: 'deep-analyzed' state
- FindingListItem: `[L3 Confirmed]` / `[L3 Disagrees]` marker parsing
- All use `createDrizzleMock()` from `src/test/drizzleMock.ts`
- Naming: `describe("Unit")` → `it("should {behavior} when {condition}")`

**E2E tests (Playwright):**
- Thorough mode pipeline: upload → parse → Start Processing (Thorough) → L3 complete
- `pollScoreLayer()` with `layerCompleted: 'L1L2L3'`
- ScoreBadge "Deep Analyzed" assertion
- Real AI calls via `INNGEST_DEV=1` (same as 3.2c strategy)
- Timeout: 120s+ (L3 processing takes 30-120s per file)

**Boundary value tests (MANDATORY per Epic 2 Retro A2):**
- Zero segments flagged → L3 skip, still 'deep-analyzed'
- All segments flagged → all processed
- First/last segment → correct ±2 context
- Confidence boost: 90% → 99%, 95% → 100% (cap)
- l3ConfidenceMin threshold: at, below, above

### Project Structure Notes

- No new routes — backend pipeline changes only + minor UI component updates
- No new DB migrations — all columns exist (`l3ConfidenceMin` in `language_pair_configs`, `detectedByLayer` supports 'L3', `layerCompleted` supports 'L1L2L3')
- L3 schema extraction: `src/features/pipeline/schemas/l3-output.ts` (new, matches L2 pattern)
- Design token: `--color-status-deep-analyzed` in `src/styles/tokens.css`

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-3-ai-powered-quality-analysis.md` — Story 3.3 AC]
- [Source: `src/features/pipeline/helpers/runL3ForFile.ts` — existing L3 implementation (475 lines)]
- [Source: `src/features/pipeline/helpers/runL2ForFile.ts` — L2 pattern reference (context loading, deriveLanguagePair)]
- [Source: `src/features/pipeline/prompts/build-l3-prompt.ts` — shared prompt builder (11 sections)]
- [Source: `src/features/pipeline/prompts/types.ts` — L3PromptInput (needs surroundingContext)]
- [Source: `src/features/pipeline/inngest/processFile.ts` — pipeline orchestration (L3 at steps 5-6)]
- [Source: `src/db/schema/languagePairConfigs.ts` — l3ConfidenceMin column exists]
- [Source: `src/db/schema/findings.ts` — findings table (detectedByLayer='L3')]
- [Source: `src/db/schema/scores.ts` — scores table (layerCompleted='L1L2L3')]
- [Source: `src/lib/ai/providers.ts` — LAYER_DEFAULTS.L3 = claude-sonnet-4-5-20250929]
- [Source: `src/lib/ai/types.ts` — L3 model config (temp 0.2, timeout 60s, maxOutputTokens 8192)]
- [Source: `_bmad-output/planning-artifacts/research/inngest-l2-l3-template-guide-2026-02-26.md` — P4 template patterns]
- [Source: `_bmad-output/implementation-artifacts/tech-debt-tracker.md` — TD-PIPE-003 (inline buildL3Prompt)]

### Previous Story Intelligence

**From Story 3.2c (L2 Results Display & Score Update) — MOST RECENT:**
- ScoreBadge: added `'ai-screened'` state → Story 3.3 adds `'deep-analyzed'` (same pattern)
- `ReviewPageClient`: maps `layerCompleted` to ScoreBadge state → extend for L1L2L3
- ReviewProgress: L3 step already renders conditionally (checkmark/spinner/"N/A")
- FindingListItem: expandable with excerpts → can add confirm/contradict badges
- `useFindingsSubscription`: works for L3 findings too (listens for INSERT on file_id)
- `useScoreSubscription`: works for L3 score updates (INSERT event)

**From Story 3.2b (L2 Batch Processing):**
- `runL2ForFile` pattern: context loading (glossary, taxonomy, project), deriveLanguagePair, chunkSegments
- L3 mirrors this pattern with additions: selective filtering + surrounding context
- Atomic DELETE+INSERT for idempotent re-runs — L3 already follows this

**From Story 3.2a (AI Provider Integration):**
- Vercel AI SDK v6: `generateText` + `Output.object()` — L3 already uses this
- `getModelForLayerWithFallback('L3', ...)` → primary claude-sonnet, fallback gpt-4o
- Cost tracking: `estimateCost` + `logAIUsage` — L3 already uses this (fix languagePair)
- Budget guard: `checkProjectBudget` — L3 already has this

### Git Intelligence

Recent commits focus on Story 3.2c CR fixes (R1 + R2) + CI stability:
```
7040bb8 fix(review): CI fixes — connection() build, coverage tests, linter changes (Story 3.2c)
9e099da fix(review): replace route segment config with connection() for Next.js 16
542abd2 fix(review): CR R2 fixes — runtime validation, UPDATE test, type safety (Story 3.2c)
27638f7 fix(review): CR R1 fixes — burst batching, type safety, missing tests (Story 3.2c)
1a1e318 feat(review): add L2 results display & score update (Story 3.2c)
```

Key patterns from 3.2c commits:
- Runtime validators (isValidSeverity, isValidLayer) for Realtime payloads
- `InsertBuffer` with `queueMicrotask` for burst batching Realtime events
- `connection()` from `next/server` for force-dynamic instead of route segment config
- ScoreBadge state testing: separate boundary test file

### Key Guardrails Checklist (dev MUST verify before each file)

- [x] `withTenant()` on EVERY DB query (Guardrail #1) — especially new filtering queries
- [x]Guard `rows[0]!` — check length before access (Guardrail #4) — language_pair_configs query
- [x]No bare `string` for status/severity — use union types (Guardrail #3)
- [x]`inArray(col, [])` = invalid SQL (Guardrail #5) — check before filtering by segment IDs
- [x]DELETE + INSERT = `db.transaction()` (Guardrail #6) — already in place for L3 findings
- [x]`generateText` + `Output.object()` — NOT `generateObject` (Guardrail #16)
- [x]`.nullable()` only for Zod schema (Guardrail #17) — L3 schema uses this
- [x]Error classification: rate_limit=retriable, auth/schema=NonRetriableError (Guardrail #18)
- [x]`logAIUsage()` on every AI call (Guardrail #19) — wire languagePair
- [x]Budget guard before AI calls (Guardrail #22) — already in place
- [x]Audit log non-fatal in error path (Guardrail #2) — already in place
- [x]Boundary value tests for all numeric thresholds (Epic 2 Retro A2)
- [x]TODO/FIXME must have TD ref (Guardrail format)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- All 10 tasks completed, 11 ACs covered
- 50 unit tests pass across 7 test files
- 1 E2E spec (conditional on Inngest dev server)
- Pre-CR scan: 1C+3H found and fixed (glossary tenant isolation, performance.now bug, projectId filter, chunk context filtering)
- M2-M4 pre-existing issues fixed (bare string types narrowed, Guardrail #3)
- TD-PIPE-003 resolved (inline buildL3Prompt → shared module)
- **CR R1 (2026-03-07):** 13 findings (0C/3H/6M/4L) — all fixed in-place
  - H1: Added missing `eq(findings.projectId, projectId)` to l2SegmentStats (Guardrail #14)
  - H2: Fixed `test()` → `test.skip()` in E2E Playwright annotation
  - H3: Changed `replace()` → `replaceAll()` in `stripL3Markers()`
  - M2 (production bug): Fixed idempotent confirm — skip both confidence boost AND marker on re-run
  - M5: Extracted `useReducedMotion` to `src/hooks/useReducedMotion.ts` (shared hook)
  - M1/M3/M4/L1/L2: Test assertion + comment improvements

### File List

**New:**
- `src/features/pipeline/schemas/l3-output.ts`
- `src/features/pipeline/schemas/l3-output.test.ts`
- `src/hooks/useReducedMotion.ts` (CR R1 — shared hook extraction)
- `src/features/batch/components/ScoreBadge.story33.test.tsx`
- `src/features/review/components/FindingListItem.story33.test.tsx`
- `src/features/review/components/ReviewPageClient.story33.test.tsx`
- `src/features/pipeline/helpers/runL3ForFile.story33.test.ts`
- `src/features/pipeline/prompts/__tests__/build-l3-prompt.story33.test.ts`
- `e2e/review-l3-findings.spec.ts`

**Modified:**
- `src/features/pipeline/helpers/runL3ForFile.ts`
- `src/features/pipeline/helpers/runL3ForFile.test.ts`
- `src/features/pipeline/helpers/runL2ForFile.ts`
- `src/features/pipeline/prompts/build-l3-prompt.ts`
- `src/features/pipeline/prompts/types.ts`
- `src/features/pipeline/prompts/__tests__/prompt-evaluation.test.ts`
- `src/features/batch/components/ScoreBadge.tsx`
- `src/features/review/components/FindingListItem.tsx`
- `src/features/review/components/ReviewPageClient.tsx`
- `src/types/finding.ts`
- `src/styles/tokens.css`
- `_bmad-output/implementation-artifacts/tech-debt-tracker.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
