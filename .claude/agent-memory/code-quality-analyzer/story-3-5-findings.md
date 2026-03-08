# Story 3.5 Score Lifecycle & Confidence Display — CR R1-R2

**R1 Date:** 2026-03-08
**R1 Result:** 0C / 3H / 7M / 5L
**R2 Date:** 2026-03-08
**R2 Result:** 0C / 1H / 3M / 5L

## R1 HIGH Findings — Status After R2

### H1: approveFile action has NO UPDATE mutation (read-only)

- **STATUS: CLOSED (by design)** — Task 2.8 explicitly states gate-only design, Epic 4 extends
- File: `src/features/review/actions/approveFile.action.ts`
- Design decision documented in story spec — not a bug

### H2: useThresholdSubscription Realtime filter missing targetLang

- **STATUS: FIXED** — R2 code adds `if (row.target_lang !== targetLang) return` in callback (L77)
- Also added early return for empty sourceLang/targetLang (L68)
- Realtime filter still only supports single column (Supabase limitation) but callback defense-in-depth now correct

### H3: AutoPassRationale Badge shows "+{margin}" for negative values

- **STATUS: FIXED** — R2 code: `{margin >= 0 ? '+' : ''}{margin.toFixed(1)}` (L50)

## R1 MEDIUM Findings — Status After R2

- M1 (requireRole read vs write): STILL OPEN — by design per Task 2.8
- M2 (empty string targetLang): FIXED — early return `if (!sourceLang || !targetLang) return` (L68)
- M3 (Q4 LEFT JOIN multi-target): STILL OPEN — TD-REVIEW-001 documented
- M4 (ContributingFinding cast): STILL OPEN — SAFETY comment present, borderline acceptable
- M5 (JSON.parse `as T`): STILL OPEN — no Zod validation
- M6 (E2E seed missing segment_id): STILL OPEN
- M7 (scoreFile return inline union): STILL OPEN

## R2 NEW Findings

### H-R2-1: Polling mock chain broken (2x `.eq()` not supported)

- File: `src/features/review/hooks/use-threshold-subscription.test.ts` L30
- Source code calls `.eq('source_lang').eq('target_lang').single()` — 2 chained `.eq()` calls
- Mock: `mockEq.mockReturnValue({ single: mockSingle })` — first `.eq()` returns `{ single }`, second `.eq()` = undefined → TypeError
- Poll error swallowed by `.catch(() => {})` so test passes but doesn't verify `updateThresholds` is called
- Test 3.5-U-051 only asserts `mockFrom`+`mockSelect` called — not that polling actually works

### M-R2-1: scoreFile buildFindingsSummary has no unit test for CONTRIBUTING_STATUSES filter

- `buildFindingsSummary` is a private function, but the critical R1 fix (filtering by CONTRIBUTING_STATUSES)
  has no explicit test verifying rejected/flagged findings are excluded from severity counts
- The existing `scoreFile.test.ts` mocks `checkAutoPass` entirely — never exercises buildFindingsSummary

### M-R2-2: effectiveScoreStatus unnecessary `as ScoreStatus | null` cast (L115)

- Both `scoreStatus: ScoreStatus` (store) and `initialData.score.status: ScoreStatus` are already typed
- `effectiveScoreStatus` is always `ScoreStatus` (never null) — cast widens type unnecessarily
- No runtime impact but misleading for readers

### M-R2-3: APPROVABLE_STATUSES duplicated between approveFile.action.ts (L34) and ReviewPageClient.tsx (L48)

- Same constant in 2 files — drift risk (add status to one, forget the other)
- R1 M2 flagged this — still not extracted to shared location

## R2 LOW Findings

- L-R2-1: ReviewPageClient initialization uses `setFinding` O(n^2) — R1 L4 still open
- L-R2-2: AutoPassRationaleData.riskiestFinding.severity = bare `string` — R1 L1 still open
- L-R2-3: SEVERITY_PRIORITY duplicated 3 places — R1 L2 still open
- L-R2-4: ConfidenceBadge magic numbers 85/70 — R1 L3 still open
- L-R2-5: `createBrowserClient()` called inside every poll cycle — minor perf (should cache in ref)

## Positive Highlights

- R1 H2 fix is thorough: both callback defense-in-depth (L77) + early return (L68)
- R1 H3 fix is correct and matches the conditional prefix pattern
- scoreFile buildFindingsSummary correctly uses CONTRIBUTING_STATUSES filter
- TD-REVIEW-002 properly documented with specific Epic 4 target
- TODO comment format follows project convention: `TODO(TD-REVIEW-002)`
- Test naming conventions followed for new tests
- Realtime channel name includes both langs: `thresholds:${sourceLang}:${targetLang}` (unique per pair)
