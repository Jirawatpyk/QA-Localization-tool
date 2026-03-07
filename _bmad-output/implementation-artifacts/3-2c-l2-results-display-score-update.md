# Story 3.2c: L2 Results Display & Score Update

Status: done

## Story

As a QA Reviewer,
I want to see L2 AI findings appear in real-time with updated scores as screening completes,
So that I can begin reviewing AI findings immediately and track score progression per layer.

## Acceptance Criteria

1. **AC1 — Score badge layer transition:** When L2 completes, ScoreBadge `state` transitions from `'rule-only'` (blue, "Rule-based") to a new `'ai-screened'` state (purple, "AI Screened") driven by `scores.layer_completed` changing from `'L1'` to `'L1L2'` via Supabase Realtime.

2. **AC2 — Confidence badges on findings:** L2 findings display color-coded confidence indicators:
   - High: confidence >= 85 → green badge "High (XX%)"
   - Medium: confidence 70–84 → orange badge "Medium (XX%)"
   - Low: confidence < 70 → red badge "Low (XX%)"
   - Additionally, findings below the per-language-pair `l2ConfidenceMin` threshold (from `language_pair_configs` table) show a "Below threshold" warning icon with tooltip showing the threshold value.
   - L1 findings (rule-based) show no confidence badge (aiConfidence is null).
   - **Design decision:** Epic AC uses `>=85` for High (85.0 = High). UX spec says `>85` (85.0 = Medium). We follow **Epic AC** (`>=85`) as authoritative implementation spec.

3. **AC3 — Finding type extension:** The `Finding` TypeScript type aligns with ALL DB schema columns: remove phantom `source` field (no DB column), add `fileId`, `detectedByLayer`, `aiModel`, `aiConfidence`, `suggestedFix`, `sourceTextExcerpt`, `targetTextExcerpt`, `segmentCount`, `scope`, `reviewSessionId`, `relatedFileIds`.

4. **AC4 — Review page route:** A new file-level review page at `/projects/[projectId]/review/[fileId]` displays:
   - ScoreBadge (md size) with real-time score updates
   - ReviewProgress (layer completion checkmarks: L1, L2, L3)
   - Finding list sorted by severity (critical → major → minor) then by confidence desc
   - Finding count summary per severity

5. **AC5 — Server Action: getFileReviewData:** Loads ALL findings for a file (no `layerFilter` — all layers) with `withTenant()`, loads score, loads file metadata + project `processingMode`. Returns `ActionResult<FileReviewData>` with `{ file, findings, score, processingMode, l2ConfidenceMin }`. Sorted by severity priority then `aiConfidence` DESC NULLS LAST.

6. **AC6 — Real-time score subscription:** `useScoreSubscription` hook (already exists) extended to pass `layerCompleted` to `useReviewStore`. When `layerCompleted` transitions, ScoreBadge state updates automatically. Store's `updateScore` signature: `(score: number, status: ScoreStatus, layerCompleted: LayerCompleted | null) => void`.

7. **AC7 — Real-time findings subscription:** New `useFindingsSubscription(fileId)` hook subscribes to `findings` table Realtime changes filtered by `file_id=eq.${fileId}`. On INSERT event: adds finding to `useReviewStore.findingsMap` at correct severity position. New findings get 200ms fade-in animation (respects `prefers-reduced-motion`). Fallback: polling with same exponential backoff pattern as score subscription.

8. **AC8 — ReviewProgress component:** Shows pipeline layer completion status:
   - L1: "Rules" checkmark (always complete when page loads)
   - L2: "AI Screening" — checkmark when `layerCompleted` includes L2, spinner during `l2_processing`
   - L3: "Deep Analysis" — checkmark when `layerCompleted` includes L3, "N/A" badge for Economy mode
   - Text updates: "AI: L2 complete" when L2 finishes

9. **AC9 — Finding list item:** Each finding row shows: severity badge (color from tokens.css) | category | layer badge ("Rule" blue / "AI" purple) | description (truncated 100 chars) | confidence badge (AC2). Source/target excerpts shown in expandable detail area.

10. **AC10 — E2E test (critical flow):** Upload SDLXLIFF → auto-parse → Start Processing (Economy) → wait for pipeline completion → verify: (a) findings appear in review page, (b) L2 findings have confidence values, (c) ScoreBadge shows "AI Screened", (d) ReviewProgress shows L2 checkmark. Uses real upload flow from Story 3.2b5 — NO bypasses. AI responses handled via `INNGEST_DEV=1` local dev mode.

11. **AC11 — Boundary values:** Tests cover:
    - Confidence exactly at 85 → High, at 84.9 → Medium, at 70 → Medium, at 69.9 → Low
    - Confidence below `l2ConfidenceMin` → "Below threshold" warning
    - Score exactly at 70 → review (not fail), at 69.9 → fail, at 95 → pass (if 0 criticals)
    - Zero findings from L2 → score unchanged from L1, ReviewProgress still shows L2 checkmark
    - File with only L1 findings → ScoreBadge shows "Rule-based", no confidence badges

## Tasks / Subtasks

- [x] **Task 1: Extend Finding type + add LayerCompleted** (AC: #3)
  - [x] 1.1 Update `Finding` type in `src/types/finding.ts`:
    - **Remove** phantom `source: string` field (no DB column — detection origin is `detectedByLayer`)
    - **Add** DB-aligned fields:
      ```typescript
      fileId: string | null
      detectedByLayer: DetectedByLayer
      aiModel: string | null
      aiConfidence: number | null
      suggestedFix: string | null
      sourceTextExcerpt: string | null
      targetTextExcerpt: string | null
      segmentCount: number
      scope: 'per-file' | 'cross-file'
      reviewSessionId: string | null
      relatedFileIds: string[] | null
      ```
  - [x] 1.2 Add `LayerCompleted` type: `'L1' | 'L1L2' | 'L1L2L3'` — also use in `scoreFile.ts` to replace inline union
  - [x] 1.3 Add `'ai-screened'` to `ScoreBadgeState` union type
  - [x] 1.4 Fix all usages broken by removing `source` field — **critical:** `buildFinding()` in `src/test/factories.ts:38` uses `source: 'L1-rule'` (26+ test files depend on it). Replace with `detectedByLayer: 'L1'` and add other missing fields to factory

- [x] **Task 2: Design token + ScoreBadge 'ai-screened' state** (AC: #1)
  - [x] 2.1 Add design token to `src/styles/tokens.css`: `--color-status-ai-screened: #8b5cf6` (purple-500)
  - [x] 2.2 Add `'ai-screened'` to `STATE_LABELS` → "AI Screened" and `STATE_CLASSES` → `bg-status-ai-screened/10 text-status-ai-screened border-status-ai-screened/20`
  - [x] 2.3 ScoreBadge does NOT change `deriveState()` — keep it score-based only. The caller (`ReviewPageClient`) sets `state='ai-screened'` explicitly when `layerCompleted` includes L2. `deriveState()` remains the fallback when no explicit state passed
  - [x] 2.4 Unit tests: 'ai-screened' state rendering (color, label), backward compat (existing callers unchanged)

- [x] **Task 3: ConfidenceBadge component** (AC: #2)
  - [x] 3.1 Create `src/features/review/components/ConfidenceBadge.tsx`
  - [x] 3.2 Props: `confidence: number | null`, `l2ConfidenceMin?: number | null`
  - [x] 3.3 Visual: inline badge with color (High>=85 green, Medium 70-84 orange, Low<70 red) and text "XX%"
  - [x] 3.4 When `l2ConfidenceMin` provided and `confidence < l2ConfidenceMin` → show warning icon with tooltip "Below threshold (XX%)"
  - [x] 3.5 Null confidence renders nothing (L1 findings)
  - [x] 3.6 Unit tests: boundary values at 85, 84.9, 70, 69.9, null, l2ConfidenceMin threshold

- [x] **Task 4: LayerBadge component** (AC: #9)
  - [x] 4.1 Create `src/features/review/components/LayerBadge.tsx`
  - [x] 4.2 Props: `layer: DetectedByLayer` — 'L1' shows "Rule" (blue), 'L2'/'L3' shows "AI" (purple via `--color-status-ai-screened` token)
  - [x] 4.3 Unit tests: all 3 layer values

- [x] **Task 5: ReviewProgress component** (AC: #8)
  - [x] 5.1 Create `src/features/review/components/ReviewProgress.tsx`
  - [x] 5.2 Props: `layerCompleted: LayerCompleted | null`, `fileStatus: DbFileStatus`, `processingMode: ProcessingMode`
  - [x] 5.3 Note: `processingMode` comes from `projects` table (NOT `files` — files has no such column). Server Action loads it from project
  - [x] 5.4 Display 3 steps: L1 Rules (always check), L2 AI Screening (check/spinner/pending), L3 Deep Analysis (check/spinner/N-A for economy)
  - [x] 5.5 Text: "AI: L2 complete" after L2 finishes
  - [x] 5.6 Unit tests: all combinations of layerCompleted + fileStatus + processingMode

- [x] **Task 6: FindingListItem component** (AC: #9)
  - [x] 6.1 Create `src/features/review/components/FindingListItem.tsx`
  - [x] 6.2 Shows: severity badge | category | LayerBadge | description (truncated 100 chars) | ConfidenceBadge
  - [x] 6.3 Expandable detail area: source text excerpt, target text excerpt, suggested fix, full description
  - [x] 6.4 States: collapsed (default), expanded (click/Enter)
  - [x] 6.5 Newly inserted findings (via Realtime) get `data-new="true"` attr + 200ms fade-in animation (respects `prefers-reduced-motion`)
  - [x] 6.6 Accessibility: `role="row"` with `aria-expanded`
  - [x] 6.7 Unit tests: rendering, expand/collapse, truncation, fade-in animation class

- [x] **Task 7: Server Action — getFileReviewData** (AC: #5)
  - [x] 7.1 Create `src/features/review/actions/getFileReviewData.action.ts`
  - [x] 7.2 Load file metadata (name, status) from `files` table with `withTenant()`
  - [x] 7.3 Load `processingMode` from `projects` table with `withTenant()` (NOT from files — files has no such column)
  - [x] 7.4 Load ALL findings for file with `withTenant()` — do NOT use `layerFilter`, load L1+L2+L3 all layers. Sorted by severity priority (critical=1, major=2, minor=3) then by `aiConfidence` DESC NULLS LAST
  - [x] 7.5 Load score for file with `withTenant()`
  - [x] 7.6 Load `l2ConfidenceMin` from `language_pair_configs` using the file's language pair (join via `segments` → distinct `sourceLang`/`targetLang`)
  - [x] 7.7 Return `ActionResult<FileReviewData>` with `{ file, findings, score, processingMode, l2ConfidenceMin }`
  - [x] 7.8 Guard: `if (!file) return { success: false, error: 'File not found', code: 'NOT_FOUND' }`
  - [x] 7.9 Unit tests: happy path, file not found, empty findings, tenant isolation

- [x] **Task 8: Review page route** (AC: #4)
  - [x] 8.1 Create `src/app/(app)/projects/[projectId]/review/[fileId]/page.tsx` — RSC page, `export const dynamic = 'force-dynamic'`
  - [x] 8.2 Create `src/features/review/components/ReviewPageClient.tsx` — `'use client'` entry component
  - [x] 8.3 Server page calls `getFileReviewData()` with params, passes to client
  - [x] 8.4 Client component: ScoreBadge (md), ReviewProgress, finding count summary, FindingListItem list
  - [x] 8.5 Wire `useScoreSubscription(fileId)` for real-time score updates
  - [x] 8.6 Wire `useFindingsSubscription(fileId)` for real-time finding arrival (Task 9)
  - [x] 8.7 Wire `useReviewStore` — `resetForFile(fileId)` on mount, populate `findingsMap`
  - [x] 8.8 Map store's `layerCompleted` to ScoreBadge `state` prop: `'L1'` → `'rule-only'`, contains `'L2'` → `'ai-screened'`, no layer info → derive from score
  - [x] 8.9 Add Breadcrumb entries: Projects → [Project Name] → Review → [File Name]

- [x] **Task 9: Real-time subscriptions** (AC: #6, #7)
  - [x] 9.1 **FIX BUG in `useScoreSubscription`:** Change Realtime event from `'UPDATE'` to `'INSERT'` — `scoreFile()` does atomic DELETE+INSERT (not UPDATE), so `'UPDATE'` events never fire. This is a latent bug from Story 3.0 (masked because pipeline E2E uses `pollScoreLayer()` direct DB query, not Realtime). Also extract `layer_completed` from Realtime INSERT payload
  - [x] 9.2 **FIX polling fallback:** Change `.select('mqm_score, status')` to `.select('mqm_score, status, layer_completed')` — currently polling does NOT return `layer_completed`
  - [x] 9.3 Update `ScoreSlice.updateScore` signature: `(score: number, status: ScoreStatus, layerCompleted: LayerCompleted | null) => void`
  - [x] 9.4 Add `layerCompleted: LayerCompleted | null` field to `ScoreSlice`, reset to `null` in `resetForFile()`
  - [x] 9.5 Create `useFindingsSubscription(fileId)` hook in `src/features/review/hooks/use-findings-subscription.ts`:
    - Subscribe to `findings` table Realtime: `postgres_changes` → INSERT + DELETE, filter `file_id=eq.${fileId}`
    - On INSERT: add finding to `useReviewStore.findingsMap`
    - On DELETE: remove findings from store (handles idempotent re-process: `runL2ForFile` does DELETE old L2 findings + INSERT new ones)
    - **Burst handling:** `runL2ForFile` inserts N findings in one transaction → N Realtime INSERT events fire simultaneously. Batch state updates using `queueMicrotask` or collect-then-flush pattern to avoid N re-renders
    - Fallback: polling with exponential backoff (same pattern as score subscription)
    - Cleanup on unmount: `supabase.removeChannel(channel)`
  - [x] 9.6 Unit tests: store updates, Realtime INSERT handler, DELETE handler, burst batch handling, polling fallback

- [x] **Task 10: E2E test** (AC: #10)
  - [x] 10.1 Create `e2e/review-findings.spec.ts`
  - [x] 10.2 Setup: login → create project → upload SDLXLIFF → wait for auto-parse
  - [x] 10.3 Flow: click "Start Processing" → select Economy → confirm → wait for pipeline completion
  - [x] 10.4 Navigate to review page via FileStatusCard link
  - [x] 10.5 Assert: findings visible, L2 findings have confidence values, ScoreBadge shows score, ReviewProgress shows L2 checkmark
  - [x] 10.6 Boundary: file with 0 AI findings → still shows L2 complete
  - [x] 10.7 E2E AI strategy: uses `INNGEST_DEV=1` with local Inngest dev server — AI calls execute against real providers in dev mode. If flaky in CI, create TD entry for AI mock layer

- [x] **Task 11: Unit tests — boundary values** (AC: #11)
  - [x] 11.1 ConfidenceBadge boundaries: 85, 84.9, 70, 69.9, 0, 100, null, l2ConfidenceMin threshold
  - [x] 11.2 ScoreBadge with explicit state: 'ai-screened' (purple + "AI Screened" label), 'rule-only' unchanged
  - [x] 11.3 Score thresholds: 70, 69.9, 95 with 0 criticals, 95 with 1 critical

**Task dependency order:** Tasks 1 → 2 → 3,4,5 (parallel) → 6 → 7 → 8,9 (parallel) → 10,11

## Dev Notes

### Architecture Patterns & Constraints

**Route structure clarification:**
- Architecture spec shows `review/[sessionId]` but `FileStatusCard` already links to `/review/[fileId]`
- Story 3.2c creates **file-level** review page at `/projects/[projectId]/review/[fileId]`
- Review sessions (project-level reviewer assignment) are Epic 4 scope
- The `[fileId]` route serves as the primary findings display; Epic 4 may add `[sessionId]` wrapper

**ScoreBadge state approach:**
- Current `ScoreBadgeState`: `'pass' | 'review' | 'fail' | 'analyzing' | 'rule-only'`
- Add `'ai-screened'` as full state (purple, "AI Screened") — used when `layerCompleted` includes L2
- Future Story 3.5 will add `'deep-analyzed'` for L1L2L3 (gold, "Deep Analyzed")
- `deriveState()` stays score-based ONLY (no layerCompleted param). The caller explicitly passes `state='ai-screened'` based on store's `layerCompleted` value — separation of concerns

**Finding type alignment (CRITICAL):**
```typescript
// REMOVE phantom field (no DB column — replaced by detectedByLayer):
- source: string

// ADD all DB-aligned fields:
+ fileId: string | null
+ detectedByLayer: DetectedByLayer
+ aiModel: string | null
+ aiConfidence: number | null
+ suggestedFix: string | null
+ sourceTextExcerpt: string | null
+ targetTextExcerpt: string | null
+ segmentCount: number
+ scope: 'per-file' | 'cross-file'
+ reviewSessionId: string | null
+ relatedFileIds: string[] | null
```

**Real-time update flows:**

**CRITICAL BUG FIX (from Story 3.0):** `useScoreSubscription` subscribes to `event: 'UPDATE'` but `scoreFile()` does DELETE+INSERT (not UPDATE). Realtime UPDATE events never fire! Must change to listen for `'INSERT'` events. This bug was masked because pipeline E2E uses `pollScoreLayer()` (direct DB query), never testing the Realtime path.

```
Score updates (EXISTING — FIX event type + extend):
Pipeline processFile → step 4: scoreFile({ layerCompleted: 'L1L2' })
  → DB DELETE old score + INSERT new score (atomic transaction)
  → Supabase Realtime channel fires INSERT (NOT UPDATE!)
  → useScoreSubscription receives INSERT (was: UPDATE — BUG)
  → calls useReviewStore.updateScore(score, status, layerCompleted)
  → ScoreBadge re-renders: state='ai-screened'

Polling fallback also needs layer_completed:
  → .select('mqm_score, status, layer_completed')  // was: only mqm_score, status

Finding updates (NEW):
Pipeline runL2ForFile → DELETE old L2 findings + INSERT new findings (atomic)
  → Supabase Realtime fires: N DELETE events + N INSERT events
  → useFindingsSubscription:
    - On DELETE: remove from findingsMap (handles re-process idempotency)
    - On INSERT: batch collect via queueMicrotask → flush to findingsMap
    - FindingListItem renders with fade-in animation
```

**Finding display — NOT full review panel:**
- Story 3.2c = **read-only** display of findings with scores (display layer)
- Epic 4 = full review panel with accept/reject/flag actions, keyboard nav, bulk operations
- Component naming: use `FindingListItem` (not `FindingCard`) — Epic 4 will create the full `FindingCard` with action bar
- The `FindingListItem` created here should be composable — Epic 4 can wrap or extend it

**`processingMode` source:**
- `processingMode` lives on `projects` table, NOT `files` table
- Server Action must JOIN/query `projects` to get this value
- Pass to client as part of `FileReviewData` response

**`l2ConfidenceMin` per language pair:**
- `language_pair_configs` table has `l2ConfidenceMin` column (integer)
- Server Action derives language pair from file's segments (`sourceLang`/`targetLang`)
- Passes threshold to client for ConfidenceBadge "Below threshold" warning

### Source Tree Components to Touch

**New files:**
| File | Purpose |
|------|---------|
| `src/app/(app)/projects/[projectId]/review/[fileId]/page.tsx` | RSC review page |
| `src/features/review/components/ReviewPageClient.tsx` | Client entry component |
| `src/features/review/components/ConfidenceBadge.tsx` | Confidence indicator |
| `src/features/review/components/LayerBadge.tsx` | Rule vs AI indicator |
| `src/features/review/components/ReviewProgress.tsx` | Layer completion status |
| `src/features/review/components/FindingListItem.tsx` | Single finding row |
| `src/features/review/actions/getFileReviewData.action.ts` | Server Action |
| `src/features/review/hooks/use-findings-subscription.ts` | Realtime findings hook |
| `e2e/review-findings.spec.ts` | E2E test |

**Modified files:**
| File | Change |
|------|--------|
| `src/types/finding.ts` | Remove `source`, add DB-aligned fields, add `LayerCompleted`, add `'ai-screened'` to `ScoreBadgeState` |
| `src/styles/tokens.css` | Add `--color-status-ai-screened: #8b5cf6` design token |
| `src/features/batch/components/ScoreBadge.tsx` | Add 'ai-screened' state (label + classes using token) |
| `src/features/review/stores/review.store.ts` | Add `layerCompleted` to ScoreSlice, update `updateScore` signature, reset in `resetForFile` |
| `src/features/review/hooks/use-score-subscription.ts` | Pass `layer_completed` from Realtime payload to store |
| `src/features/scoring/helpers/scoreFile.ts` | Use shared `LayerCompleted` type instead of inline union |

### Testing Standards Summary

**Unit tests (Vitest):**
- All new components: rendering, props, states, boundary values
- Server Action: happy path, not found, empty results, tenant isolation (mock with `createDrizzleMock()`)
- Store updates: `layerCompleted` propagation, `updateScore` new signature
- Realtime hooks: subscription setup, INSERT handler, polling fallback
- Naming: `describe("ComponentName")` → `it("should {behavior} when {condition}")`

**E2E tests (Playwright):**
- Full critical flow: upload → parse → pipeline → review page → findings visible
- Use real upload flow from Story 3.2b5 (NO PostgREST seed, NO Inngest API bypass)
- `pollScoreLayer()` helper for waiting on score calculation
- Pipeline toast timeout: 60s+ for CI (pipeline can be slow)
- AI mock strategy: `INNGEST_DEV=1` with local dev server — if flaky, create TD for mock layer

**Boundary value tests (MANDATORY per Epic 2 Retro A2):**
- Confidence thresholds: 85, 84.9, 70, 69.9 (follows Epic AC: >=85 = High)
- l2ConfidenceMin threshold: above, at, below
- Score thresholds: 70, 69.9, 95 (with/without criticals)
- Zero L2 findings edge case

### Project Structure Notes

- Review route: `/projects/[projectId]/review/[fileId]` — new, matches `FileStatusCard` link
- Components live in `src/features/review/components/` (empty directory — no conflicts)
- Server Action: `src/features/review/actions/` (existing directory)
- Store and hooks: extending existing files in `src/features/review/`
- Design token: `src/styles/tokens.css` — add `--color-status-ai-screened`
- No new DB schema changes (all columns already exist)
- No new migrations required

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-3-ai-powered-quality-analysis.md` — Story 3.2c AC]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification/component-strategy.md` — FindingCard anatomy, ScoreBadge states, confidence badges]
- [Source: `_bmad-output/planning-artifacts/ux-design-specification/core-user-experience.md` — Finding information hierarchy, 3-second decision scan]
- [Source: `_bmad-output/planning-artifacts/architecture/index.md` — Pipeline architecture, score lifecycle, Realtime patterns]
- [Source: `src/types/finding.ts` — Current Finding type (has phantom `source` field, missing DB columns)]
- [Source: `src/db/schema/findings.ts` — Full DB schema with all columns]
- [Source: `src/db/schema/scores.ts` — Score table with layerCompleted column]
- [Source: `src/features/batch/components/ScoreBadge.tsx` — Current implementation with 5 states]
- [Source: `src/features/review/stores/review.store.ts` — Zustand store with 3 slices]
- [Source: `src/features/review/hooks/use-score-subscription.ts` — Realtime hook (scores only, needs layerCompleted extension)]
- [Source: `src/features/pipeline/inngest/processFile.ts` — Pipeline step 4 scores L1L2]
- [Source: `src/features/pipeline/helpers/runL2ForFile.ts` — L2 finding insertion with confidence]
- [Source: `src/features/batch/components/FileStatusCard.tsx:26` — Links to `/review/${file.fileId}`]
- [Source: `src/features/scoring/helpers/scoreFile.ts:28` — Inline layerCompleted union to replace with shared type]

### Previous Story Intelligence

**From Story 3.2b5 (Upload-Pipeline Wiring):**
- Auto-parse flow works end-to-end — E2E can rely on real upload flow
- Test data-testid additions: `file-input`, `upload-row-{filename}`, `upload-status-success`
- Pipeline E2E uses `pollScoreLayer()` helper to wait for score calculation

**From Story 3.2b (L2 Batch Processing):**
- L2 findings stored with `detectedByLayer='L2'`, `aiConfidence` (0-100 real), `status='pending'`
- Score updated with `layerCompleted: 'L1L2'` after L2 step completes
- `L2Result` includes `findingCount`, `chunksTotal`, `chunksSucceeded`, `partialFailure`
- Return value uses `number | null` (not optional) due to `exactOptionalPropertyTypes: true`

**From Story 3.0 (Score & Review Infrastructure):**
- `useReviewStore` Zustand store with findings/score/selection slices — ready to use
- `useScoreSubscription` hook: Supabase Realtime + exponential backoff polling fallback
- `recalculateScore` Inngest function: triggered by `finding.changed`, serial queue per project
- Debounce: 500ms `setTimeout` + clear (NOT React hook — utility function)

**From Story 3.0.5 (UX Foundation Gap Fix):**
- ScoreBadge: 3 sizes (sm/md/lg), 5 states + null muted, slide animation on change
- Severity badges: critical=red, major=orange, minor=blue (design tokens)
- Animation: `prefers-reduced-motion` guard, DOM ref-based class toggle

**From Story 3.2a (AI Provider Integration):**
- AI SDK v6 patterns established — Guardrails #16-20
- `logAIUsage()` fire-and-forget per chunk — already wired in `runL2ForFile`
- Budget guard + rate limiting — already wired before AI calls

### Git Intelligence

Recent commits focus on Story 3.2b7 (taxonomy reorder) CR fixes and pipeline E2E stability:
- `pollScoreLayer()` pattern for waiting on score calculation in E2E
- Keyboard-based drag-and-drop preferred over mouse in CI headless
- `INNGEST_DEV=1` required in `.env.local` for local Inngest
- Pipeline reorder UPDATEs + toast timeout increases for CI latency

### Key Guardrails Checklist (dev MUST verify before each file)

- [ ] `withTenant()` on EVERY DB query (Guardrail #1)
- [ ] Guard `rows[0]!` — check length before access (Guardrail #4)
- [ ] `ActionResult<T>` return type for Server Action (Guardrail #3)
- [ ] Optional filter: use `null`, not `''` (Guardrail #8) — relevant for server action optional params
- [ ] No `"use client"` on `page.tsx` — RSC boundary (CLAUDE.md rule)
- [ ] No `export default` except Next.js pages (CLAUDE.md rule)
- [ ] Named exports, `@/` alias, no barrel exports (CLAUDE.md rule)
- [ ] `export const dynamic = 'force-dynamic'` on pages importing `db/client`
- [ ] `useRef` not reset on prop change — if refs depend on `fileId` prop, reset in `useEffect` (Guardrail #12)
- [ ] Dialog state reset on re-open: `useEffect` watching `open` prop (Guardrail #11) — if any dialogs
- [ ] Audit log non-fatal in error path (Guardrail #2) — if any state-changing actions
- [ ] Boundary value tests for all numeric thresholds (Epic 2 Retro A2)

## Dev Agent Record

### Agent Model Used
- Claude Opus 4.6 (claude-opus-4-6) — implementation + pre-CR scan
- 2 sessions (context compaction after session 1 → continued in session 2)

### Debug Log References
- Session 1: Tasks 1–9 (type extension, store, hooks, components, action, page, E2E stubs, boundary stubs, pre-CR scan start)
- Session 2: Tasks 10–11 (E2E activation, boundary activation), pre-CR scan fixes, DoD gate

### Completion Notes List
- **Pre-CR scan (3 agents):** 0C, 0H after fixes. Key fixes: design tokens (inline colors → tokens), defense-in-depth projectId on Q1/Q2/Q3, withTenant on LEFT JOIN, Realtime publication migration, type safety (exported FileReviewData, eliminated duplicate types)
- **TaxonomyManager flaky test:** 1 intermittent failure in full suite run (passes in isolation) — pre-existing, not related to story changes
- **Realtime publication gap discovered:** scores + findings tables were NOT in `supabase_realtime` publication → created migration `00019_story_3_2c_realtime.sql`
- **CSS animation gap:** `animate-fade-in` referenced in FindingListItem but not defined → added to `animations.css`. `animate-spin-parent` on ReviewProgress was phantom class → removed (spinner is on child SVG via built-in `animate-spin`)
- **Score subscription bug fix (from Story 3.0 note):** `useScoreSubscription` listened for `UPDATE` but `scoreFile()` does DELETE+INSERT → changed to `INSERT` event
- **M6 languagePairConfigs targetLang:** JOIN matches `sourceLang` only — sufficient for `l2ConfidenceMin` lookup. Multi-target-lang matching is Epic 4+ scope
- **DoD gate:** 92/92 review tests pass (10 files), TypeScript clean, lint 0 errors, all P0+P1 ATDD tests green. CR R2: 0C/0H after fixes

### CR R1 Fix Summary (2026-03-03)
- **H2: Burst batching** — Implemented `queueMicrotask` + `InsertBuffer` pattern in `useFindingsSubscription`. N simultaneous INSERT events → 1 `setFindings()` call. Tests use `await act(async () => ...)` to flush microtasks
- **H3: Unsafe cast** — Replaced `as unknown as Finding` with explicit field mapping in `ReviewPageClient.tsx`. All missing fields (`tenantId`, `projectId`, `sessionId`, `createdAt`, `updatedAt`, `fileId`, `reviewSessionId`, `relatedFileIds`) now explicitly set
- **H4: Missing P0 tests** — Added T5.6 (processingMode assertion), T7.7 (INSERT+DELETE+INSERT re-process idempotency), T8.7 (L2 pending state), T9.7 (source/target excerpts in expanded state)
- **M2: Q4 JOIN targetLang** — Added `// TODO(TD-REVIEW-001)` comment, TD entry in tracker. Deferred to Epic 5
- **M3: Missing data-testids** — Added `finding-count-summary` and `finding-list` data-testids to ReviewPageClient
- **M5: withTenant verification** — Replaced callIndex check with `mockWithTenant.toHaveBeenCalledTimes(5)` + tenantId arg verification loop
- **M6: UPDATE handler** — Added UPDATE event subscription to `useFindingsSubscription` channel
- **L1: Missing P1 tests** — Added null threshold test (ConfidenceBadge), design token test (LayerBadge)
- **L2: useReducedMotion cache** — Changed to `useState` lazy initializer (no `window.matchMedia` call per render)
- **L3: E2E networkidle** — Removed all 6 `waitForLoadState('networkidle')` from review-findings.spec.ts
- **L4: Stale comments** — Removed "TDD RED PHASE" comments from 5 test files
- **Bonus:** Removed unused `scoreStatus` Zustand selector (lint warning fix + unnecessary re-render prevention)

### CR R2 Fix Summary (2026-03-03)
- **H1: Stale score subscription test** — Renamed `use-score-subscription.test.ts:52` from `'should subscribe to scores table filtered by fileId'` to `'should subscribe to INSERT (primary) and UPDATE (secondary) on scores table'`. Asserts both INSERT (primary, AC6 bug fix) and UPDATE (secondary safety net)
- **H2: Missing UPDATE handler test** — Added `[P0] should update finding in findingsMap on UPDATE event` test to `use-findings-subscription.test.ts`. Verifies accept/reject status sync via Realtime UPDATE
- **M1: FileReviewData status type** — Changed `findings[].status: string` → `FindingStatus` in `getFileReviewData.action.ts:32`. Added `FindingStatus` import. Removed redundant `as FindingStatus` cast in `ReviewPageClient.tsx`
- **M2: mapRowToFinding runtime validation** — Added `isValidSeverity()`, `isValidStatus()`, `isValidLayer()` validators using const Sets (consistent with `use-score-subscription.ts` `isValidScoreStatus()` pattern). Invalid Realtime payloads now rejected/defaulted instead of blindly cast
- **L1: Fragile DOM assertion** — Changed `innerHTML.toMatch(/animate-spin/)` → `querySelector('.animate-spin')` in `ReviewProgress.test.tsx`
- **L2: Two-component test** — Removed ConfidenceBadge render from ScoreBadge boundary test (already covered in `ConfidenceBadge.test.tsx`). Removed unused import
- **L3: useReducedMotion reactive** — Added `addEventListener('change', handler)` to respond to system preference changes (previously only checked at mount time)
- **L4: Batch spy assertion** — Added `setFindingSpy` (singular) negative assertion to burst batch test, proving INSERT events use batch `setFindings` (plural) not individual `setFinding` calls

### File List

**New files (created):**
- `src/app/(app)/projects/[projectId]/review/[fileId]/page.tsx` — RSC review page
- `src/features/review/components/ReviewPageClient.tsx` — Client entry component
- `src/features/review/components/ConfidenceBadge.tsx` — Confidence indicator (High/Medium/Low)
- `src/features/review/components/ConfidenceBadge.test.tsx` — 10 tests (9 + CR R1: null threshold)
- `src/features/review/components/LayerBadge.tsx` — Rule vs AI indicator
- `src/features/review/components/LayerBadge.test.tsx` — 4 tests (3 + CR R1: design token)
- `src/features/review/components/ReviewProgress.tsx` — Layer completion status (L1/L2/L3)
- `src/features/review/components/ReviewProgress.test.tsx` — 7 tests (6 + CR R1: L2 pending)
- `src/features/review/components/FindingListItem.tsx` — Single finding row (read-only)
- `src/features/review/components/FindingListItem.test.tsx` — 7 tests (6 + CR R1: source/target excerpts)
- `src/features/review/components/ScoreBadge.boundary.test.tsx` — 6 boundary tests (CR R2: removed ConfidenceBadge conflation from last test)
- `src/features/review/actions/getFileReviewData.action.ts` — Server Action (file + findings + score + config)
- `src/features/review/actions/getFileReviewData.action.test.ts` — 6 tests (5 + CR R1: processingMode)
- `src/features/review/hooks/use-findings-subscription.ts` — Realtime findings hook + polling fallback + runtime validators
- `src/features/review/hooks/use-findings-subscription.test.ts` — 8 tests (6 + CR R1: re-process idempotency + CR R2: UPDATE handler)
- `supabase/migrations/00019_story_3_2c_realtime.sql` — Enable Realtime for scores + findings tables
- `e2e/review-findings.spec.ts` — E2E critical flow (upload → pipeline → review page)

**Modified files:**
- `src/types/finding.ts` — Remove phantom `source`, add DB-aligned fields, add `LayerCompleted`, add `'ai-screened'` to `ScoreBadgeState`
- `src/features/review/stores/review.store.ts` — Add `findingsMap`, `layerCompleted`, extend `updateScore` signature
- `src/features/review/stores/review.store.test.ts` — Tests for new store shape
- `src/features/review/hooks/use-score-subscription.ts` — Pass `layerCompleted` from Realtime payload, remove `'use client'`
- `src/features/review/hooks/use-score-subscription.test.ts` — Updated tests for layerCompleted
- `src/features/batch/components/ScoreBadge.tsx` — Add `'ai-screened'` state (purple, "AI Screened")
- `src/features/batch/components/ScoreBadge.test.tsx` — Tests for ai-screened state
- `src/features/scoring/helpers/scoreFile.ts` — Use shared `LayerCompleted` type
- `src/styles/tokens.css` — Add `--color-status-ai-screened` design token
- `src/styles/animations.css` — Add `animate-fade-in` utility (200ms fade-in for new findings)
- `src/test/factories.ts` — Add `buildDbFinding` factory
