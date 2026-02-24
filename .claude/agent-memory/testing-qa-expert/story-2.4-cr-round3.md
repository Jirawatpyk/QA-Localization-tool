# Story 2.4 — CR Round 3 Detailed Notes

Date: 2026-02-24
Previous rounds: Round 1 (18 findings fixed), Round 2 (20 findings fixed)
This round: 15 findings found (2C · 4H · 6M · 3L)

## Critical

### R3-C1: `checkUnpairedBrackets` early-break silently drops findings

File: `src/features/pipeline/engine/checks/formattingChecks.test.ts`

Source line 88: `if (depth < 0) break` — when depth goes negative (extra closer found),
the loop stops and remaining characters are NOT processed. For input `"a) (b"`:

- Encounters `)` → depth = -1 → break immediately
- The subsequent `(b` is never processed
- Returns 1 finding ("Add opening (") — but the unclosed `(` is silently dropped
  No test exercises this interleaved-mismatch case.

### R3-C2: Rollback-to-`failed` DB call never asserted

File: `src/features/pipeline/actions/runRuleEngine.action.test.ts` lines 232-238

The "NOT called" assertion on writeAuditLog is vacuous — vi.clearAllMocks() already
resets call history before the test. More critically: the catch-block rollback
(db.update(files).set({ status: 'failed' })) is never asserted. The dbState.callIndex
is not verified to advance past the rollback slot. This is a safety-critical behavior:
a file stuck in l1_processing state is permanently unprocessable.

Fix approach: set dbState.returnValues for the rollback slot AND assert callIndex
advanced to that slot after runRuleEngine returns INTERNAL_ERROR.

## High

### R3-H1: `checkDoubleSpaces` regex contract not pinned

File: `src/features/pipeline/engine/checks/formattingChecks.test.ts` lines 21-44

Source regex: `/ {2,}/` — matches only ASCII space (U+0020), NOT:

- `\t` (tab): "Hello\t\tworld" → not flagged
- `\u00A0` (NBSP): "Hello\u00A0\u00A0world" → not flagged
  No test pins that tabs/NBSP are NOT flagged. Changing to `/\s{2,}/` would break
  Thai text using NBSP as a classifier separator, and existing tests would still pass.

### R3-H2: Missing orchestrator-level negative test for punctuation alphanumeric-skip

File: `src/features/pipeline/engine/ruleEngine.test.ts`

`checkEndPunctuation` has a "skip if both end with alphanumeric" path (formattingChecks.ts:169).
Unit tests cover it, but no processFile integration test verifies that a segment ending with
a digit in both source AND target produces no punctuation finding.

### R3-H3: `checkSameSourceDiffTarget` description field never asserted

File: `src/features/pipeline/engine/checks/consistencyChecks.test.ts`

Source (consistencyChecks.ts:49):
description: `Inconsistent translation: same source text "${seg.sourceText.slice(0, 50)}" ...`

Zero tests assert the description content. The 50-char slice is an independent truncation
from MAX_EXCERPT_LENGTH (500) — these two can get out of sync. No test covers sourceText
exactly 50 chars vs 51 chars in a consistency finding description.

### R3-H4: Number normalization edge cases untested

File: `src/features/pipeline/engine/checks/numberChecks.test.ts`

1. `+100` in source → normalizeNumber strips `+` → normalizes to `100`. Target `100` matches.
   Is this intentional? No test pins this. Source with `+100`, target with `100` → should it
   be null (match) or a finding (sign difference)?

2. Three-group European numbers: `1.234.567` → normalizeNumber regex detects European format
   by `/^\d{1,3}(\.\d{3})+(,\d+)?$/`. `1.234.567` passes this regex. But 3 groups might not
   match depending on digit counts. The test only covers `1.000,50` (one decimal part).

## Medium

### R3-M1: `checkLeadingTrailingSpaces` suggestedFix branches not asserted

File: `src/features/pipeline/engine/checks/formattingChecks.test.ts` lines 50-87

4 distinct suggestedFix strings (source lines 46-50, 57-60):

- "Add leading whitespace to match source"
- "Remove leading whitespace from target"
- "Add trailing whitespace to match source"
- "Remove trailing whitespace from target"
  All 4 are unasserted.

### R3-M2: `checkUppercaseWords` and `checkCamelCaseWords` suggestedFix never asserted

File: `src/features/pipeline/engine/checks/capitalizationChecks.test.ts`

Also: `segment.targetText.includes(word)` is a substring check, NOT word-boundary.
So "APIFY" includes "API" → no finding even though the word is different.
This substring false-negative behavior is undocumented and untested.

### R3-M3: Multi-category suppression correctness unverified

File: `src/features/pipeline/engine/ruleEngine.test.ts` lines 67-78

Current suppression test only has one category ('completeness') suppressed and one
potential finding type. No test verifies: "suppress completeness but NOT placeholder_integrity
when both would fire on the same segment".

### R3-M4: Multi-word glossary term pre-filter behavior untested

File: `src/features/pipeline/engine/checks/glossaryChecks.test.ts`

Pre-filter uses `includes()` substring match. Multi-word term "source control" requires
exact phrase in source text. Hyphenated variant "source-control" would not pass pre-filter.
No test for multi-word terms.

### R3-M5: Float Buddhist year false-positive (POSSIBLE SOURCE BUG)

File: `src/features/pipeline/engine/language/thaiRules.test.ts` lines 100-120

`isBuddhistYearEquivalent(2026.5, 2569.5)` returns TRUE because 2569.5 - 2026.5 = 543.0
exactly. Fiscal-year notation like "FY2026.5" → "ปี 2569.5" would be incorrectly exempted
from number checking. Source lacks `Number.isInteger()` guard. No test with float inputs.

NaN input: `Math.abs(NaN - 2569) === 543` → false. Safe. But untested.

### R3-M6: `segmentId` propagation verified in 3 of 12 check functions only

Files: all check test files

Checks WITH segmentId assertions:

- checkTagIntegrity (tagChecks.test.ts line 250)
- checkCustomRules (customRuleChecks.test.ts line 101)
- checkGlossaryComplianceRule (via calledCtx, glossaryChecks.test.ts line 139)

Checks WITHOUT segmentId assertions (9 functions):

- checkUntranslated, checkTargetIdenticalToSource (contentChecks)
- checkNumberConsistency (numberChecks)
- checkPlaceholderConsistency (placeholderChecks)
- checkDoubleSpaces, checkLeadingTrailingSpaces, checkUnpairedBrackets,
  checkUrlMismatches, checkEndPunctuation (formattingChecks)
- checkUppercaseWords, checkCamelCaseWords (capitalizationChecks)
- checkSameSourceDiffTarget, checkSameTargetDiffSource, checkKeyTermConsistency (consistency)

## Low

### R3-L1: `PLACEHOLDER_PATTERNS[0]` index-access tests array order not behavior

File: `src/features/pipeline/engine/types.test.ts` lines 87-96

`PLACEHOLDER_PATTERNS[0]!.source` ties the test to position 0. Reordering constants
breaks the test even if behavior is unchanged.

### R3-L2: `suggestedFix` never asserted for quote findings; apostrophe-contraction undocumented

File: `src/features/pipeline/engine/checks/formattingChecks.test.ts` lines 164-185

`"it's here"` has 1 apostrophe → flagged as unpaired. This is a high-false-positive design.
The test does not document this as intentional. `suggestedFix` for quote findings is unasserted.

### R3-L3: Performance test has no CI guard, no failure message, tests clean-segment path only

File: `src/features/pipeline/engine/ruleEngine.test.ts` lines 246-261

5-second budget for 5000 clean segments. Could flap on slow CI. Tests only the no-findings
path. Does not test 5000 segments all with findings (consistency checks build full Map over
all segments — N^2 in worst case).
