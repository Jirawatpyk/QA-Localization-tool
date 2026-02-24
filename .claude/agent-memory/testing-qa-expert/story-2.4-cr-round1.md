# Story 2.4 Test Quality Analysis — CR Round 1 (2026-02-24)

## Summary: 0 CRITICAL · 4 HIGH · 8 MEDIUM · 6 LOW

All 243 tests pass. No snapshot tests, no `any` types, no `console.log`.

## File Coverage

| File                                        | Tests | Status        |
| ------------------------------------------- | ----- | ------------- |
| types.test.ts                               | 7     | Good          |
| ruleEngine.test.ts                          | 17    | HIGH issues   |
| contentChecks.test.ts                       | 15    | Good          |
| tagChecks.test.ts                           | 17    | Good          |
| numberChecks.test.ts                        | 14    | MEDIUM issues |
| placeholderChecks.test.ts                   | 15    | Good          |
| formattingChecks.test.ts                    | 35    | MEDIUM issues |
| consistencyChecks.test.ts                   | 24    | MEDIUM issues |
| glossaryChecks.test.ts                      | 8     | MEDIUM issues |
| customRuleChecks.test.ts                    | 10    | Good          |
| capitalizationChecks.test.ts                | 15    | MEDIUM issues |
| thaiRules.test.ts                           | 18    | Good          |
| cjkRules.test.ts                            | 12    | MEDIUM issues |
| runRuleEngine.action.test.ts                | 8     | HIGH issues   |
| (sdlxliffParser.test.ts scope is Story 2.2) | —     | —             |

## HIGH Issues

### H1: ruleEngine.test.ts — Performance test is meaningful but not deterministic

- Line 246: `processFile` with 5000 segments takes 942ms in CI — passes now but is environment-
  dependent and will not reliably catch regressions on slow CI machines (5s budget is very loose).
  More useful: assert result array is `Array`, not just timing. Recommend splitting into two:
  (1) correctness test for 100 segments, (2) keep timing test but with `test.setTimeout`.
  Not a correctness bug but a flakiness risk.

### H2: ruleEngine.test.ts — "should process single segment without errors" is a placeholder

- Line 218–229: The only assertion is `expect(Array.isArray(results)).toBe(true)`.
  This test passes even if `processFile` throws and returns nothing — the array check is vacuous.
  The comment says "may have minor findings like end punctuation" but doesn't assert any specific
  behavior. Rename and strengthen or remove.

### H3: runRuleEngine.action.test.ts — INTERNAL_ERROR path (catch block) NOT tested

- The catch block in `runRuleEngine.action.ts` (lines 174–188) sets status to `failed` and
  returns `{ success: false, code: 'INTERNAL_ERROR' }`. Zero tests cover this code path.
  This is a significant gap: if `processFile` throws, the audit log is skipped but we need to
  confirm status rolls back to `failed`.

### H4: runRuleEngine.action.test.ts — Batch insert (findings > 100) NOT tested

- `FINDING_BATCH_SIZE = 100` and the batch loop exists (action.ts lines 132–136), but no test
  verifies that `tx.insert` is called multiple times when findings > 100.
  The current test has at most 1 finding. A case with 101 findings would exercise the loop.

## MEDIUM Issues

### M1: numberChecks.test.ts — No test for `%f` format placeholder as number

- The `NUMBER_REGEX` extracts all numeric patterns. `%f` appears in `PLACEHOLDER_PATTERNS` but
  could interact with number extraction on "Price: %f". Not a critical gap but a boundary case.

### M2: numberChecks.test.ts — No test for source with 0 numbers but target with numbers

- When `sourceNumbers.length === 0` the function returns null (line 25 of numberChecks.ts).
  There is a test for "source has no numbers" but no test for "source has 0 numbers, target
  has numbers" — should also return null (asymmetric: we only check source→target direction).

### M3: formattingChecks.test.ts — `checkLeadingTrailingSpaces` description says "Leading" for trailing mismatch

- `tagChecks.test.ts` line 68: tests `sourceText: 'Hello '` → expects `description.toContain('Trailing')`.
  `formattingChecks.ts` line 46 description is "Leading whitespace mismatch" for leading
  and line 57 is "Trailing whitespace mismatch" for trailing. Tests at lines 55+68 verify this.
  This is fine — but the test at line 62 (target has leading, source does not) also correctly
  asserts 'Leading'. However the source has no leading — so the "description: Leading" matches
  the finding which says "Leading whitespace mismatch between source and target". OK.
  Actually: M3 is NOT a real bug after re-reading. Retract.

### M3 (REAL): formattingChecks.test.ts — `checkUnpairedBrackets` uses `.toBeGreaterThan(0)` not specific count

- Lines 118, 128: `expect(checkUnpairedBrackets(segment, ctx).length).toBeGreaterThan(0)` —
  weak assertion. Should assert `toHaveLength(1)` to prevent the check generating spurious extras.

### M4: formattingChecks.test.ts — Single-quote `'` unpaired bracket NOT tested

- `QUOTE_CHARS = ['"', "'"]` (constants.ts line 125). Tests at lines 147–155 only cover double
  quote `"`. No test for unpaired single quote `'Hello`. This is a valid check behavior gap.

### M5: consistencyChecks.test.ts — `checkSameSourceDiffTarget` only tests `th-TH` particle strip

- Tests at lines 75–101 cover Thai particles. But the particle strip path is also exercised
  in `checkSameTargetDiffSource`. The test at line 158 confirms this. However no test covers
  Korean/Chinese (non-Thai non-Latin) target in `checkSameSourceDiffTarget` — the `isThai` branch
  code path uses `startsWith('th')` so zh-CN/ja-JP correctly skip particle stripping. No test
  verifies this.

### M6: consistencyChecks.test.ts — `checkKeyTermConsistency` never tests `caseSensitive: true`

- The factory `makeGlossaryTerm` always sets `caseSensitive: false`. The source code does NOT
  use `caseSensitive` — it uses `.toLowerCase()` unconditionally. So `caseSensitive: true` is
  silently ignored. No test exposes this discrepancy between schema field and behavior.

### M7: glossaryChecks.test.ts — No test for `checkFn` throwing / rejecting

- `checkGlossaryComplianceRule` does `await checkFn(...)`. If `checkFn` rejects, the error
  propagates uncaught through the caller. No test verifies behavior when `checkFn` rejects.
  (The outer `processFile` wraps the glossary results in `Promise.all` with no catch.)

### M8: capitalizationChecks.test.ts — CamelCase regex misses `PascalCase` single hump

- `CAMELCASE_REGEX = /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g` — requires 2+ humps.
  So `React` (one uppercase + lowercase) is NOT matched. No test verifies that `React` is NOT
  flagged as CamelCase (it should pass through as a single proper-noun-like word). This is
  correct behavior but unspecified in tests.

## LOW Issues

### L1: types.test.ts — PLACEHOLDER_PATTERNS test uses hardcoded index [0]

- Line 93: `PLACEHOLDER_PATTERNS[0]` is hardcoded. If the array order ever changes, the test
  breaks with no useful error message. Better: test each pattern individually by name.

### L2: ruleEngine.test.ts — "should run all check types" uses `some()` not count

- Line 40: only asserts `some((r) => r.category === 'completeness')`. Doesn't verify the result
  shape (segmentId, severity, description, etc.). Use `expect.objectContaining`.

### L3: ruleEngine.test.ts — `makeCustomRule` creates inline object instead of using factory

- Lines 162–173: `SuppressionRuleRecord` built inline. Should use a factory function like
  `makeCustomRule()` from `customRuleChecks.test.ts`. Minor DRY issue.

### L4: glossaryChecks.test.ts — `id: 'term-1'` hardcoded (not UUID format)

- Line 184: glossary term id is `'term-1'` — not a valid UUID. Factories should use valid UUIDs.
  Not caught by Zod validation in tests but inconsistent with production data.

### L5: cjkRules.test.ts — Only 5 FULLWIDTH_PUNCTUATION_MAP entries tested; `:` and `;` missing

- `FULLWIDTH_PUNCTUATION_MAP` has 6 entries (。！？，：；). Tests cover only 4 (。！？，).
  Lines 10–29: ：(colon) and ；(semicolon) have NO tests for `normalizeFullwidthPunctuation`.

### L6: thaiRules.test.ts — Individual digit tests (10 tests for 10 digits) are repetitive

- Lines 5–57: 10 separate `it()` tests for each Thai numeral → Arabic. The `mixed text` test
  (line 46) already covers the map. The individual tests add noise without adding coverage value.
  Consolidate into one parametric test using `it.each`.

## AC Coverage Matrix

| AC                             | Description                        | Status                                                               |
| ------------------------------ | ---------------------------------- | -------------------------------------------------------------------- |
| AC#1: 17 check types           | 12 MVP + 5 Bonus                   | COVERED — all 12 MVP categories have dedicated test files            |
| AC#2: Thai rules               | numerals, particles, Buddhist year | COVERED — thaiRules.test.ts                                          |
| AC#3: CJK Chinese fullwidth    | NFKC, punctuation                  | COVERED — cjkRules.test.ts (but `:;` missing)                        |
| AC#4: Japanese mixed scripts   | NFKC katakana                      | COVERED — applyCjkNfkcNormalization tests                            |
| AC#5: Finding schema 3 columns | fileId, source/targetTextExcerpt   | COVERED — schema + migration exist; action test asserts findingCount |
| AC#6: Performance 5000 segs    | <5s                                | COVERED — ruleEngine.test.ts line 246                                |
| AC#7: Server Action            | CAS guard, batch insert, audit     | PARTIAL — INTERNAL_ERROR and batch>100 NOT tested                    |
| AC#8: Golden Corpus            | Deferred to Story 2.7              | N/A                                                                  |

## Specific Source Bugs Identified

### POSSIBLE SOURCE BUG: `checkKeyTermConsistency` ignores `caseSensitive` field

- `GlossaryTermRecord.caseSensitive` is always ignored — matching is always case-insensitive
  regardless of term configuration. No test documents this intentional or accidental behavior.

### POSSIBLE SOURCE BUG: `processFile` derives lang from `segments[0]` only

- ruleEngine.ts line 50–51: `sourceLang = segments[0]?.sourceLang ?? 'und'`
  If a file has mixed-language segments (unusual but possible), all checks use segment[0]'s lang.
  No test covers a multi-language segment file.
