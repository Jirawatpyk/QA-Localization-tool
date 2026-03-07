# Story 3.3 CR Round 1 — Test Scan Notes

**Date:** 2026-03-07
**Reviewer:** Testing QA Expert agent
**Files reviewed:** 8 test files (33 unit + 9 E2E stubs)

## Summary

0C · 1H · 5M · 5L

All 10 P0 tests: ACTIVE (not skipped) — PASS
All 22 P1 tests: ACTIVE (not skipped) — PASS (note: 3 extra P1s in build-l3-prompt.story33.test.ts beyond ATDD count)

---

## CRITICAL (0)

None.

---

## HIGH (1)

### H1: U30/U31 badge class assertions will always pass — `toMatch(/status-pass|text-green|bg-green/)` matches anything with Tailwind token classes

**File:** `src/features/review/components/FindingListItem.story33.test.tsx` lines 49, 66
**Tests:** U30, U31

The actual production badge classes from `FindingListItem.tsx`:

- Confirm badge: `bg-status-pass/10 text-status-pass border-status-pass/20`
- Disagree badge: `bg-warning/10 text-warning border-warning/20`

**U30 asserts:**

```ts
expect(confirmBadge.className).toMatch(/status-pass|text-green|bg-green/)
```

This regex WILL match `bg-status-pass/10 text-status-pass` — so the test passes for the right reason. However the `|text-green|bg-green` alternatives are dead branches that can never match the production output. More critically, `toMatch(/status-pass|text-green|bg-green/)` would also pass if the class were `text-status-pass-fake` or any other string containing `status-pass` as a substring.

**U31 asserts:**

```ts
expect(disagreeBadge.className).toMatch(/status-pending|text-amber|bg-amber|text-warning/)
```

Production class is `bg-warning/10 text-warning border-warning/20`. The `text-warning` alternative matches. But `status-pending`, `text-amber`, `bg-amber` are dead branches. If production changes from `text-warning` to `text-status-warning`, the test still passes (substring match on `warning`).

**Root cause:** Regex is too broad — captures multiple alternative spellings that don't correspond to actual production tokens. Should use `toHaveClass` with the actual CSS token, or at minimum tighten to the exact token string.

**Recommended fix:**

```ts
// U30
expect(confirmBadge.className).toContain('text-status-pass')
// U31
expect(disagreeBadge.className).toContain('text-warning')
```

---

## MEDIUM (5)

### M1: DB call sequence in `buildDbReturns` swaps priorFindings(2) and l2Stats(3)

**Files:** `runL3ForFile.story33.test.ts` line 159–187, `runL3ForFile.test.ts` line 150–183

Both test files document the sequence as:

```
// CAS(0), segments(1), priorFindings(2), l2Stats(3), langConfig(4), ...
```

But in `runL3ForFile.ts` the actual order is:

1. CAS (`.update(files).returning()`) — call 0
2. Segments (`db.select.from(segments)`) — call 1
3. **Prior findings** (`db.select.from(findings)`) — call 2
4. **l2Stats** (`db.select.from(findings).groupBy(segmentId)`) — call 3

This matches the `buildDbReturns` comment... BUT the comment says `l2Stats(3)` comes from the second `findings` query. The Drizzle mock's `createDrizzleMock()` likely sequences calls by `.then()` terminal count — not by `.groupBy()` — so both `SELECT FROM findings` queries share the same Proxy chain counter.

**The actual risk:** The mock returns `priorFindings` at callIndex 2 and `l2Stats` at callIndex 3. If the production code queries `l2Stats` (Step 3b) BEFORE `priorFindings` (Step 4), the mock returns wrong data silently. Currently in `runL3ForFile.ts`:

- Step 3: segments (call 1)
- Step 4: priorFindings (call 2) — correct
- Step 3b: l2Stats (call 3) — correct

Wait — Step 3b is labelled "3b" but appears AFTER Step 4 in the code (line 202–216 vs line 183–199). This means the sequence IS: segments→priorFindings→l2Stats in that order. The mock is correct. However the comment `// Step 3b` is misleading — in actual execution priorFindings loads first, then l2Stats. The mock is accidentally correct but the comment is confusing. **Low risk that this causes test failures, but the mislabeled step numbering (Step 3b appears after Step 4 in source code) makes the mock fragile to future reordering.**

**Severity downgraded to M from H** — the mock order is functionally correct today, but the mislabelled step number in production code creates a maintenance trap.

### M2: U14 (confidence boost) asserts `aiConfidence: 88` but production uses `Math.round(80 * 1.1)` = 88 — passes correctly, BUT U17 cap assertion is tautological for the confirm path

**File:** `runL3ForFile.story33.test.ts` lines 664–703, test U17

U17 sets `aiConfidence: 95` on the L2 finding and asserts `{ aiConfidence: 100 }`. Production: `Math.min(100, Math.round(95 * 1.1))` = `Math.min(100, Math.round(104.5))` = `Math.min(100, 105)` = 100. Test is correct.

However, U17 does NOT verify that a `description` update was also written (the confirm path ALSO appends `[L3 Confirmed]`). The `setCaptures` assertion only checks `{ aiConfidence: 100 }` — it does NOT assert that the L3 Confirmed marker was added. A regression where confidence is boosted but marker is omitted would be invisible.

**Missing assertion:** `expect(dbState.setCaptures).toContainEqual(expect.objectContaining({ description: expect.stringContaining('[L3 Confirmed]') }))`

### M3: U18 idempotency test only checks that marker count ≤ 1 — does NOT verify that confidence is NOT double-boosted on re-run

**File:** `runL3ForFile.story33.test.ts` lines 706–756, test U18

The test verifies `[L3 Confirmed]` not duplicated in description. But the confirm path also boosts `aiConfidence: 88 * 1.1 = ~97`. On a re-run where description already contains `[L3 Confirmed]`, production code correctly skips the description update:

```ts
const descriptionUpdate = matchedL2.description.includes('[L3 Confirmed]')
  ? matchedL2.description // no-op
  : `${matchedL2.description}\n\n[L3 Confirmed]`
```

But `aiConfidence` is ALWAYS updated regardless of the idempotent guard:

```ts
await tx.update(findings).set({ aiConfidence: newConfidence, description: descriptionUpdate })
```

The test does NOT assert `aiConfidence` on the re-run, so a bug where confidence is double-boosted (88 → 97 on second run) is undetected.

**Missing assertion:** verify `aiConfidence` is capped or stays at original boosted value, not 88*1.1*1.1.

### M4: U26/U27 ReviewPageClient tests — the Zustand store mock returns `layerCompleted: null` from the mock selector, not `'L1L2L3'` from `initialData`. The badge state is derived from `effectiveLayerCompleted = layerCompleted ?? initialData.score.layerCompleted`.

**File:** `src/features/review/components/ReviewPageClient.story33.test.tsx` lines 15–31

The store mock:

```ts
useReviewStore: vi.fn((selector) => selector({
  ...
  layerCompleted: null,   // <-- store starts null
  ...
}))
```

In `ReviewPageClient.tsx`:

```ts
const layerCompleted = useReviewStore((s) => s.layerCompleted) // → null from mock
const effectiveLayerCompleted = layerCompleted ?? initialData.score.layerCompleted // → 'L1L2L3'
const badgeState = deriveScoreBadgeState(effectiveLayerCompleted) // → 'deep-analyzed'
```

But `updateScore` is called in `useEffect` which triggers a re-render. The store mock's `updateScore` is `vi.fn()` which does NOT actually update `layerCompleted`. So after mount, `layerCompleted` stays `null`, the fallback `?? initialData.score.layerCompleted` kicks in, and `deep-analyzed` is shown correctly.

**The tests pass for the right reasons.** However, the `useEffect` calls `updateScore(88.5, 'calculated', 'L1L2L3')` which in production would update the store. With the mock, the store stays frozen at initial values. This means the test exercises the `initialData` fallback path only — NOT the "store updated from initialData via updateScore" path. The two code paths produce the same visible result, making the distinction invisible.

**This is a coverage gap, not a test correctness issue** — the store-hydration path is untested.

### M5: U25 ScoreBadge test — `toMatch(/deep-analyzed/)` on `container.className` only works if the CSS class literally contains the string "deep-analyzed". In production, `STATE_CLASSES['deep-analyzed']` = `'bg-status-deep-analyzed/10 text-status-deep-analyzed border-status-deep-analyzed/20'` — which does NOT contain the bare string "deep-analyzed".

**File:** `src/features/batch/components/ScoreBadge.story33.test.tsx` line 37

```ts
expect(container.className).toMatch(/deep-analyzed/)
```

The `<span data-testid="score-badge">` element receives className built from `STATE_CLASSES['deep-analyzed']` = `bg-status-deep-analyzed/10 text-status-deep-analyzed border-status-deep-analyzed/20`. This string DOES contain `deep-analyzed` as a substring (within `status-deep-analyzed`), so the regex match succeeds — for an accidental reason.

If the token were renamed to e.g. `status-gold`, the test would catch the regression. But the string `deep-analyzed` appearing in `status-deep-analyzed` means the assertion is effectively checking "the class contains the string `deep-analyzed` anywhere" — which is true because the token name happens to include it.

More critically: U26 in `ReviewPageClient.story33.test.tsx` line 96 has the same pattern:

```ts
expect(scoreBadge.className).toMatch(/deep-analyzed/)
expect(scoreBadge.className).not.toMatch(/ai-screened/)
```

The `.not.toMatch(/ai-screened/)` is useful. But again the positive assertion passes via substring coincidence.

**Not a false positive but fragile** — recommend asserting the actual token: `toContain('status-deep-analyzed')` or `toContain('text-status-deep-analyzed')`.

---

## LOW (5)

### L1: U05/U06 test intent mislabels AC1 — the test comment says "l3ConfidenceMin threshold: segment at exact threshold excluded" per ATDD U05, but the test body asserts `mockGenerateText.toHaveBeenCalledTimes(1)` (inclusion), not exclusion

**File:** `runL3ForFile.story33.test.ts` lines 323–347

The ATDD checklist U05 says: "l3ConfidenceMin threshold: segment at exact threshold excluded (confidence >= threshold)" — suggesting segments AT the threshold should be EXCLUDED (not sent to L3). But the implementation's filter is:

```ts
stat.findingCount > 0 || (stat.maxConfidence ?? 0) < l3ConfidenceMin
```

The first condition `findingCount > 0` makes ALL segments with ANY L2 finding go through regardless of confidence. The tests acknowledge this via the comment "first OR condition captures all." U05 and U06 both assert `mockGenerateText.toHaveBeenCalledTimes(1)` (AI IS called), which is correct for the current implementation.

However the ATDD item U05 says "excluded" which directly contradicts the test outcome. The test body is correct (matching production), but the ATDD description is stale/misleading. The test name `should query l3ConfidenceMin from language_pair_configs` (what the actual test name says after the red comment) is weaker than the ATDD description.

**Impact:** Future developers reading ATDD checklist will have incorrect expectation. No test correctness problem.

### L2: `buildL3Prompt.story33.test.ts` has 5 tests, but ATDD checklist says file should have 2 stubs covering U11 and U12+U13

**File:** `src/features/pipeline/prompts/__tests__/build-l3-prompt.story33.test.ts`

ATDD checklist Step 4 table: "2 | build-l3-prompt.story33.test.ts | 2 | AC3". The file has 5 tests (U11, U12+U13 combined, plus 3 extra boundary/edge tests). The extra tests cover boundary context formatting and no-context fallback. These are legitimate and good additions not in ATDD — but the AC Coverage Matrix (AC3 → U11-U13) does not include these extras. No problem functionally; just a discrepancy in count tracking.

### L3: `runL3ForFile.story33.test.ts` — `vi.clearAllMocks()` in `beforeEach` does NOT reset `mockBuildL3Prompt` because it is declared at module scope as `vi.fn()` but the `buildL3Prompt` mock is set up via `vi.mock('@/features/pipeline/prompts/build-l3-prompt', ...)` — the mock in the module system IS cleared by `vi.clearAllMocks()`. However `mockBuildL3Prompt.mockReturnValue('mock-l3-prompt')` is set in `beforeEach` correctly. No bug — just flagging that the pattern is correct.

### L4: E2E test `review-l3-findings.spec.ts` line 53–57 has a `test()` call with a boolean as first argument for conditional skip

```ts
test(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server...')
```

This is NOT a valid Playwright `test.skip()` call. `test(boolean, string)` is not the Playwright API. The correct form is `test.skip(!condition, 'reason')`. As written, this calls `test(false, 'Requires...')` or `test(true, 'Requires...')` — which in Playwright v1.x would create a test with title `'true'` or `'false'`, not a skip condition. This test will either fail (can't run a test with boolean title) or be silently ignored.

**Actual Playwright skip API:**

```ts
test.skip(!process.env.INNGEST_DEV_URL, 'Requires Inngest dev server')
```

**Severity: L** because the TD-E2E-008 comment indicates this was intentional to mark as skippable, and the serial suite handles absence of Inngest by timing out rather than test framework failure. But it is syntactically wrong.

### L5: E2E test — multiple `signupOrLogin(page, TEST_EMAIL)` calls (one per test in serial suite) are correct per E2E gotchas pattern ("Each Playwright test gets a fresh page — must re-authenticate"). However `[setup] signup, login and create project` calls `signupOrLogin()` at line 63, and `[setup] upload SDLXLIFF` calls it again at line 84. After both setup tests, each of the 7 P1 tests also calls `signupOrLogin()`. This is 9 total auth calls for a 9-test suite. This matches the documented pattern from Epic 3 CI notes — correct. However if the 2nd setup test times out during L3 pipeline (480s timeout), all subsequent tests still try to run (serial mode does not auto-skip on setup failure in Playwright < v1.44). No bug — operational risk noted.

---

## Skip Status Check

| Test                | Status | Priority |
| ------------------- | ------ | -------- |
| U01–U03 (AC1 P0)    | ACTIVE | P0       |
| U07 (AC2 P0)        | ACTIVE | P0       |
| U11 (AC3 P0)        | ACTIVE | P0       |
| U14–U15 (AC4 P0)    | ACTIVE | P0       |
| U20–U21 (AC5 P0)    | ACTIVE | P0       |
| U25 (AC6 P0)        | ACTIVE | P0       |
| U26 (AC6 P0)        | ACTIVE | P0       |
| All P1 tests        | ACTIVE | P1       |
| E01 setup (2 tests) | ACTIVE | —        |
| E01 P1 (7 tests)    | ACTIVE | P1       |

All P0 and P1 tests are active. DoD gate: PASS.

---

## AC Coverage Matrix Check

| AC   | Tests Present           | Gap                                       |
| ---- | ----------------------- | ----------------------------------------- |
| AC1  | U01–U06                 | None                                      |
| AC2  | U07–U10                 | None                                      |
| AC3  | U11, U12+U13, +3 extras | None                                      |
| AC4  | U14–U19                 | U17 missing [L3 Confirmed] assertion (M2) |
| AC5  | U20–U24b                | None                                      |
| AC6  | U25, U26, U27, E01      | Store hydration path not covered (M4)     |
| AC7  | U28, U29                | None                                      |
| AC8  | E01 timing              | None                                      |
| AC9  | U30–U33, E01            | Badge class assertions fragile (H1)       |
| AC10 | Existing tests          | None                                      |
| AC11 | Boundary tests embedded | None                                      |

---

## Boundary Value Coverage

| Boundary                         | Test       | Status   |
| -------------------------------- | ---------- | -------- |
| Confidence 0 (pass)              | U22        | COVERED  |
| Confidence 100 (pass)            | U22        | COVERED  |
| Confidence -1 (reject)           | U23        | COVERED  |
| Confidence 101 (reject)          | U23        | COVERED  |
| suggestedFix null                | U24        | COVERED  |
| suggestedFix string              | U24        | COVERED  |
| Zero flagged segments            | U03        | COVERED  |
| All flagged segments             | U04        | COVERED  |
| First segment (pos 0)            | U08        | COVERED  |
| Second segment (pos 1)           | U10        | COVERED  |
| Middle segment                   | U07        | COVERED  |
| Last segment (pos N)             | U09        | COVERED  |
| Confidence boost cap 95→100      | U17        | COVERED  |
| Zero confidence boost 0\*1.1=0   | NOT TESTED | GAP (P2) |
| 100\*1.1→100 (capped from start) | NOT TESTED | GAP (P2) |

Missing BV for confidence boost at `aiConfidence: 0` and `aiConfidence: 100` (both cap correctly but neither tested). Low priority since U17 covers the cap logic.
