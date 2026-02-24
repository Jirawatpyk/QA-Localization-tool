# Story 2.2 — Adversarial Test Coverage Review (CR Round 2)

# Date: 2026-02-23

# Reviewer: Testing QA Expert Agent

# After: CR Round 1 fixes applied (H1–H13, M3, M5, M7, L4–L6)

# Files reviewed: 6 test files, 6 source files

## Status: 6 HIGH · 12 MEDIUM · 7 LOW findings

---

## HIGH Findings (test can pass even when the production code has a real bug)

### H1 — parseFile.action.test.ts: blob.text() throw path untested

**File:** `src/features/parser/actions/parseFile.action.test.ts`
**Source:** `src/features/parser/actions/parseFile.action.ts` line 93

`const xmlContent = await blob.text()` can throw if the Blob is backed by
a corrupted buffer (e.g., Node.js ReadableStream error, encoding failure).
The test never makes `blob.text()` reject. There is no `try/catch` wrapping
this call in the action — an uncaught throw here would propagate as an
unhandled promise rejection and crash the serverless function without
writing a `file.parse_failed` audit log.

No test verifies:

- What the action returns when `blob.text()` throws
- Whether `markFileFailed()` is called in that case
- Whether the status stays `'parsing'` permanently

**To test:** replace `mockDownload.mockResolvedValue({ data: blob, error: null })` with
a blob whose `.text()` rejects: `{ data: { text: vi.fn().mockRejectedValue(new Error('decode error')) }, error: null }`.

---

### H2 — parseFile.action.test.ts: FILE_TOO_LARGE path from action not tested

**File:** `src/features/parser/actions/parseFile.action.test.ts`
**Source:** `src/features/parser/actions/parseFile.action.ts` line 99

The action passes `file.fileSizeBytes` (from `mockFile`) to `parseXliff()`.
`mockFile.fileSizeBytes = 1024` — always small. No test sets
`fileSizeBytes` > `MAX_PARSE_SIZE_BYTES`. If `parseXliff` returns a
`FILE_TOO_LARGE` error, the action wraps it in `code: 'PARSE_ERROR'`. No
test verifies this end-to-end path:

- That `FILE_TOO_LARGE` from the parser is surfaced correctly via the action
- That `markFileFailed()` is called with the correct `reason`
- That the audit log `newValue.reason` contains the file-size error message

---

### H3 — parseFile.action.test.ts: file.fileType='xliff' code path never exercised

**File:** `src/features/parser/actions/parseFile.action.test.ts`
**Source:** `src/features/parser/actions/parseFile.action.ts` line 96

```ts
const fileType = file.fileType === 'sdlxliff' ? 'sdlxliff' : 'xliff'
```

`mockFile.fileType = 'sdlxliff'` in every single test. The `'xliff'` branch
of this ternary is dead code in the test suite. If a developer accidentally
changes `'sdlxliff'` to another value, or changes the ternary condition,
all tests still pass.

No test creates `{ ...mockFile, fileType: 'xliff' }` and verifies the
correct `'xliff'` format is passed to `parseXliff`.

---

### H4 — parseFile.action.test.ts: audit log 'file.parse_failed' reason field not asserted

**File:** `src/features/parser/actions/parseFile.action.test.ts` lines 296–302, 347–350, 483–489
**Source:** `src/features/parser/actions/parseFile.action.ts` lines 83–85, 102–105, 126–128

`markFileFailed()` is called with `{ reason: ..., errorCode?: ... }`. All
three `file.parse_failed` audit log tests only assert:

- `action: 'file.parse_failed'`
- `newValue: expect.objectContaining({ fileName: 'test.sdlxliff' })`

None assert `newValue.reason`. The `reason` field carries the actual error
message (e.g., `'Bucket not found'`, the parse error message, `'Connection refused'`).
A developer could remove the `reason` field entirely from `markFileFailed()`
and all three tests would still pass.

**Specific gap:** storage error test (line 290 `{ message: 'Connection timeout' }`) does not
verify `newValue: expect.objectContaining({ reason: 'Connection timeout' })`.

---

### H5 — parseFile.action.test.ts: withTenant usage in action not asserted anywhere

**File:** `src/features/parser/actions/parseFile.action.test.ts`
**Source:** `src/features/parser/actions/parseFile.action.ts` lines 43, 64, 140, 208

`withTenant()` is called FOUR times in `parseFile`:

1. Line 43 — SELECT (file lookup)
2. Line 64 — UPDATE to 'parsing'
3. Line 140 — UPDATE to 'parsed'
4. Line 208 — UPDATE to 'failed' (in `markFileFailed`)

The test file has NO `vi.mock('@/db/helpers/withTenant', ...)` setup and no
assertions that `withTenant` was called with the correct `tenantId`. Unlike
Story 2.1 tests (createBatch + getUploadedFiles which added L7 withTenant
assertions in CR Round 2), this action has zero withTenant verification.

A developer could remove the `withTenant()` call from the SELECT on line 43
and the test would still pass (because `NOT_FOUND` test uses empty array
result regardless of the WHERE clause applied).

---

### H6 — sdlxliffParser.test.ts: MAX_PARSE_SIZE_BYTES exact boundary not tested

**File:** `src/features/parser/sdlxliffParser.test.ts` lines 414–431
**Source:** `src/features/parser/sdlxliffParser.ts` line 78

```ts
if (byteSize > MAX_PARSE_SIZE_BYTES) {
```

The operator is `>` (strictly greater than), meaning a file at exactly
15 _ 1024 _ 1024 bytes should SUCCEED. The test at line 416 uses
`fileSizeBytes = MAX_PARSE_SIZE_BYTES + 1` (correctly rejected), but
does NOT test `fileSizeBytes = MAX_PARSE_SIZE_BYTES` exactly (must succeed)
or `fileSizeBytes = MAX_PARSE_SIZE_BYTES - 1` (must succeed).

The exact boundary is untested. If the operator changes from `>` to `>=`,
all existing tests still pass.

---

## MEDIUM Findings (coverage gap for an explicitly specified behavior)

### M1 — sdlxliffParser.test.ts: <source> vs <seg-source> preference when BOTH present

**File:** `src/features/parser/sdlxliffParser.test.ts` (no test exists)
**Source:** `src/features/parser/sdlxliffParser.ts` lines 209–212

```ts
const segSourceEl = tuChildren.find((n) => getTagName(n) === 'seg-source')
if (segSourceEl) {
  // SDLXLIFF path: use seg-source/mrk content
} else {
  // XLIFF path: use <source>
}
```

The parser prefers `<seg-source>` when both elements are present. All
SDLXLIFF fixture files contain BOTH `<source>` and `<seg-source>`. No test
verifies this explicitly — there is no test that has different content in
`<source>` vs `<seg-source>` to confirm the correct element is chosen.

Example scenario: `<source>WRONG</source><seg-source><mrk mid="1">CORRECT</mrk></seg-source>`.
The test should assert `sourceText === 'CORRECT'` not `'WRONG'`.

---

### M2 — sdlxliffParser.test.ts: hasSdlNamespace() not directly tested via fileType output

**File:** `src/features/parser/sdlxliffParser.test.ts`
**Source:** `src/features/parser/sdlxliffParser.ts` lines 181, 467–469

`hasSdlNamespace()` does a raw substring search:

```ts
return xmlContent.includes('http://sdl.com/FileTypes/SdlXliff/1.0')
```

This is called with the **raw xmlContent string**, not the parsed tree.
Scenario not tested: an XLIFF file that contains the SDL namespace URI
as a string value inside a `<note>` element (false positive). Example:

```xml
<note>See http://sdl.com/FileTypes/SdlXliff/1.0 for reference</note>
```

This would cause `fileType` to be reported as `'sdlxliff'` even for a
pure XLIFF file. No test exercises this false-positive path.

Inverse: `fileType` parameter passed as `'sdlxliff'` but xmlContent has
no SDL namespace → `hasSdlNamespace()` returns false → `fileType` reported
as `'xliff'`. No test covers this mismatch between argument and content.

---

### M3 — sdlxliffParser.test.ts: sdl:cmt AND XLIFF <note> both present in one trans-unit

**File:** `src/features/parser/sdlxliffParser.test.ts` (no test)
**Source:** `src/features/parser/sdlxliffParser.ts` lines 241–243, 281

In SDLXLIFF, `translatorComment` comes from `sdlSegMeta.get(mid)?.comment` (i.e., `<sdl:cmt>`).
In XLIFF, it comes from `extractXliffNotes()` (i.e., `<note>` elements).
These two code paths are mutually exclusive — SDLXLIFF uses `if (segSourceEl)`
branch, XLIFF uses the `else` branch.

However: what if an SDLXLIFF file contains both `<note>` elements AND
`<sdl:cmt>` in the same trans-unit? The SDLXLIFF branch reads only `sdl:cmt`
and ignores `<note>`. No test verifies this "SDLXLIFF with note element"
scenario — confirming that `<note>` is silently ignored in SDLXLIFF context.

---

### M4 — sdlxliffParser.test.ts: matchPercentage clamping to 0-100 not tested

**File:** `src/features/parser/sdlxliffParser.test.ts` (no test)
**Source:** `src/features/parser/sdlxliffParser.ts` lines 333–337

```ts
const percent =
  parsedPercent !== null && !Number.isNaN(parsedPercent)
    ? Math.min(100, Math.max(0, parsedPercent))
    : null
```

The clamping logic for out-of-range percent values is present but never tested:

- `percent="-1"` → should clamp to 0
- `percent="150"` → should clamp to 100
- `percent="NaN"` or `percent="abc"` → `parseInt` returns NaN → should yield `null`
- `percent=""` or missing attr → should yield `null`

All fixture files use valid 0–100 values. This clamping was noted in the source
comment as "defense against malformed files" (M4 from original design) but no test
exercises any of the four out-of-range branches.

---

### M5 — sdlxliffParser.test.ts: multi-file XLIFF with different source-language per file

**File:** `src/features/parser/sdlxliffParser.test.ts` (no test)
**Source:** `src/features/parser/sdlxliffParser.ts` lines 145–146

```ts
if (!globalSourceLang) globalSourceLang = sourceLang
```

The parser uses the FIRST file element's source/target language as global.
If a multi-file XLIFF has `file[0].source-language="en-US"` and
`file[1].source-language="fr-FR"`, the segments from file[1] will have
`sourceLang="fr-FR"` (correct — from the loop variable) but `ParseResult.sourceLang`
will be `"en-US"` (only first file). No test exercises this inconsistency.

The existing M5 test (added in CR Round 1, line 519) uses SAME source/target
language for both files — the "first-file-wins" behavior is not observable.

---

### M6 — sdlxliffParser.test.ts: TAG_MISMATCH error propagation from extractInlineTags to parseXliff

**File:** `src/features/parser/sdlxliffParser.test.ts` (no test)
**Source:** `src/features/parser/sdlxliffParser.ts` lines 232–233, 237, 268–269, 272

```ts
const srcExtract = extractInlineTags(srcChildren)
if (!srcExtract.success) return srcExtract  // propagated as TransUnitResult failure
...
if (!tuSegments.success) return tuSegments  // propagated to parseXliff → ParseOutcome failure
```

The TAG_MISMATCH error from `extractInlineTags` is propagated all the way up
to become a `{ success: false, error: { code: 'TAG_MISMATCH' } }` from `parseXliff`.

No integration test verifies this propagation chain. Tests in `inlineTagExtractor.test.ts`
verify TAG_MISMATCH at the extractor level, and `sdlxliffParser.test.ts` has no test
with malformed inline tags (e.g., unclosed `<bx>`) inside an SDLXLIFF fixture.

**To test:** inline XML with `<bx id="1"/>` and no matching `<ex>` → `parseXliff` should
return `{ success: false, error: { code: 'TAG_MISMATCH' } }`.

---

### M7 — sdlxliffParser.test.ts: trans-unit with no <source> element (XLIFF path)

**File:** `src/features/parser/sdlxliffParser.test.ts` (no test)
**Source:** `src/features/parser/sdlxliffParser.ts` line 265

```ts
const sourceEl = tuChildren.find((n) => getTagName(n) === 'source')
if (!sourceEl) return { success: true, data: [] }
```

A `<trans-unit>` with no `<source>` element is silently skipped (returns empty array,
continues to next trans-unit). This is deliberate defensive code. No test verifies
that a file with one invalid trans-unit (no source) and two valid ones still produces
the 2 valid segments and does NOT produce an error.

---

### M8 — sdlxliffParser.test.ts: XLIFF trans-unit with no <target> element

**File:** `src/features/parser/sdlxliffParser.test.ts` (no test)
**Source:** `src/features/parser/sdlxliffParser.ts` lines 271–272

```ts
const tgtChildren = targetEl ? getChildren(targetEl, 'target') : []
```

If a `<trans-unit>` has no `<target>` element at all (common for untranslated
XLIFF files), `tgtChildren` is `[]` → `extractInlineTags([])` → `plainText = ''`.
No test verifies: XLIFF trans-unit with `<source>` but completely missing
`<target>` element results in `targetText = ''` (not null, not an error).

---

### M9 — wordCounter.test.ts: bare language code 'th' (not 'th-TH') not tested

**File:** `src/features/parser/wordCounter.test.ts`
**Source:** `src/features/parser/wordCounter.ts` line 24 → `segmenterCache.ts` line 30–32

```ts
export function isNoSpaceLanguage(lang: string): boolean {
  const primary = (lang.split('-')[0] ?? lang).toLowerCase()
  return NO_SPACE_LOCALES.has(primary)
}
```

`isNoSpaceLanguage('th')` → primary = 'th' → `true`. This is tested in
`segmenterCache.test.ts`. However, `countWords('สวัสดี', 'th')` (bare
language tag, no region) is never tested in `wordCounter.test.ts`.

The `getSegmenter('th')` cache uses the full locale string as key — so
`getSegmenter('th')` and `getSegmenter('th-TH')` are different cache entries.
Both must work correctly. The wordCounter corpus tests use 'th-TH'. No test
verifies `countWords(text, 'th')` returns the same count as `countWords(text, 'th-TH')`.

---

### M10 — wordCounter.test.ts: whitespace-only string AFTER stripping (not before)

**File:** `src/features/parser/wordCounter.test.ts` line 77
**Source:** `src/features/parser/wordCounter.ts` lines 13, 21–22

The test at line 77 tests `countWords('   ', 'en-US')` → 0. This hits the
FIRST guard: `text.trim().length === 0`.

The second guard at line 22 — `if (stripped.length === 0) return 0` — fires
when text is NOT blank but becomes blank AFTER stripping (e.g., a tag-only
string after `stripMarkup()`). The test at line 81 covers `'<g id="1"></g>'`
which strips to `'           '` (spaces) → trim → 0. But a string like
`'<x id="1"/>'` strips to `'          '` (spaces) — it hits the SECOND guard
(stripped.trim() → 0, but `stripped.length > 0` so first guard doesn't fire).

Wait — `stripped.length === 0` can NEVER be true because `stripMarkup`
replaces characters with SPACES, not empty string. The second guard on line 22
actually checks `stripped.length === 0` which is dead code when markup is
replaced with spaces. The real guard is `text.trim().length === 0` line 13.

Significance: the `stripped.length === 0` branch (line 22) is UNREACHABLE.
No test documents this dead code — it may have been intended as
`stripped.trim().length === 0` but is written incorrectly. This is a
potential source code defect, not just a test gap.

---

### M11 — inlineTagExtractor.test.ts: tag node with NO id attribute at all

**File:** `src/features/parser/inlineTagExtractor.test.ts`
**Source:** `src/features/parser/inlineTagExtractor.ts` line 81

```ts
const tagId = attrs['@_id'] ?? attrs['@_mid'] ?? String(tags.length)
```

When both `@_id` and `@_mid` are absent, the tag index (`tags.length`) is used
as the id. No test exercises a tag with no id attribute at all — every test
uses `selfClosingTag('x', '1')` or `tagNode('g', 'g1', ...)` which always
provide an id. The fallback `String(tags.length)` path is completely untested.

---

### M12 — inlineTagExtractor.test.ts: deeply nested g-inside-g-inside-g (3 levels)

**File:** `src/features/parser/inlineTagExtractor.test.ts`
**Source:** `src/features/parser/inlineTagExtractor.ts` lines 96–101

The existing nested test at line 179 covers exactly 2 levels:
`<g id="1"><g id="2">inner</g></g>`. No test covers 3+ levels of nesting.

The walkNodes function recurses via `walkNodes(children, ...)` for `<g>`, so
3 levels should work. But the position tracking logic is more complex at
3 levels — position is `text.length` at the point BEFORE recursion, and
after recursion `text` is replaced by `innerResult.plainText`. The 3-level
test would verify position accumulation across recursive calls.

---

## LOW Findings (specification compliance, edge cases, assertion quality)

### L1 — wordCounter.test.ts: 3 weak `toBeGreaterThan(0)` assertions

**File:** `src/features/parser/wordCounter.test.ts` lines 112, 124, 125

Three tests use `toBeGreaterThan(0)` instead of exact values:

```ts
// line 112
expect(result).toBeGreaterThan(0) // 'zh-TW' locale result

// line 124-125
expect(countWords('100', 'th-TH')).toBeGreaterThan(0)
expect(countWords('12345', 'zh-CN')).toBeGreaterThan(0)
```

For `'100'` and `'12345'`, these are pure numbers — Intl.Segmenter treats
them as 1 word-like token each. The correct assertion is `.toBe(1)` for both.
For `'你好世界'` with locale `'zh-TW'`, the correct count is derivable from
the Chinese corpus (`'你好'` + `'世界'` = 2 tokens). Using `toBeGreaterThan(0)`
is a weak assertion that would pass even if the count were 1,000.

---

### L2 — sdlxliffParser.test.ts: test description format violations

**File:** `src/features/parser/sdlxliffParser.test.ts` lines 392–411

The `describe` block title is:

```
describe('XLIFF state "final" mapping (AC #2)', ...)
```

...and contains an inline XML string test instead of a fixture file. This is
acceptable, but the test description does NOT follow the required naming convention:

```
it('should map XLIFF state "final" to ApprovedSignOff')
```

The required format is `it("should {behavior} when {condition}")`. Missing
the "when {condition}" portion. This applies to several tests in `sdlxliffParser.test.ts`
that omit the condition clause, e.g.:

- Line 103: `'should detect fileType as sdlxliff when sdl namespace present'` ✓ (has condition)
- Line 394: `'should map XLIFF state "final" to ApprovedSignOff'` ✗ (missing "when final state is set")

This is a style violation, not a correctness issue.

---

### L3 — parseFile.action.test.ts: second batch content (tenantId/projectId) not asserted

**File:** `src/features/parser/actions/parseFile.action.test.ts` lines 383–413 (H7 test)
**Source:** `src/features/parser/actions/parseFile.action.ts` lines 176–194

The H7 batch-split test verifies `insertChain.values` was called twice, but does NOT
assert that the SECOND batch (segment 101) contains the correct `tenantId`, `projectId`,
`sourceLang`, `targetLang`. Only `values.toHaveBeenCalledTimes(2)` is checked.

A regression where the second batch call is missing `tenantId` would not be caught.

---

### L4 — sdlxliffParser.test.ts: XLIFF with entirely missing <body> element

**File:** `src/features/parser/sdlxliffParser.test.ts` (no test)
**Source:** `src/features/parser/sdlxliffParser.ts` lines 150–152

```ts
const bodyEl = fileChildren.find((n) => getTagName(n) === 'body')
if (!bodyEl) continue // silently skip the file
```

A `<file>` with no `<body>` is silently skipped. A multi-file XLIFF where one
file has no body would silently produce fewer segments than expected. No test
covers this "missing body in one file" scenario.

---

### L5 — types.test.ts: XLIFF_STATE_MAP exhaustiveness only uses `toBeDefined()` not exact mapping

**File:** `src/features/parser/types.test.ts` lines 81–95
**Source:** `src/features/parser/constants.ts` lines 28–37

The exhaustiveness test at line 81 asserts `toBeDefined()` for all 8 XliffState
values. But `toBeDefined()` would pass even if `XLIFF_STATE_MAP['translated']`
were changed to `'Draft'` (wrong mapping). Each of the 8 individual mapping tests
(lines 49–79) does use `toBe(...)`, so this is partially covered. However, the
exhaustiveness test itself is a weak assertion that adds false confidence.

---

### L6 — sdlxliffParser.perf.test.ts: no assertion on segment content correctness

**File:** `src/features/parser/sdlxliffParser.perf.test.ts` lines 50–54

The performance test verifies `segments.toHaveLength(5000)` and `elapsed < 3000ms`.
It does not verify that segment 1 has the expected `sourceText`, `targetText`,
`confirmationState`, `matchPercentage`, `segmentNumber`. The performance test
could pass even if all segments have empty/null fields.

A minimal sanity check (e.g., `segments[0]?.sourceText === 'Source text for segment number 1 with some words here.'`)
would guard against a performance optimization that corrupts segment data.

---

### L7 — parseFile.action.test.ts: CONFLICT error message content not asserted for 'parsed' and 'failed'

**File:** `src/features/parser/actions/parseFile.action.test.ts` lines 428–446
**Source:** `src/features/parser/actions/parseFile.action.ts` lines 55–58

The test for `status='parsing'` (line 417) asserts:

```ts
expect(result.error).toContain('parsing')
```

But the tests for `status='parsed'` (line 428) and `status='failed'` (line 438)
only assert `result.code === 'CONFLICT'` — they do NOT assert that `result.error`
contains `'parsed'` or `'failed'` respectively. The error message format is:
`"File cannot be re-parsed: current status is 'parsed'"`. The status value in
the error message is untested for 2 of the 3 idempotency cases.

---

## Summary Table

| ID  | Severity | File                        | One-line description                                                 |
| --- | -------- | --------------------------- | -------------------------------------------------------------------- |
| H1  | HIGH     | parseFile.action.test.ts    | blob.text() throw path untested — action crashes silently            |
| H2  | HIGH     | parseFile.action.test.ts    | FILE_TOO_LARGE from parser not tested through action                 |
| H3  | HIGH     | parseFile.action.test.ts    | fileType='xliff' branch in action never exercised                    |
| H4  | HIGH     | parseFile.action.test.ts    | audit log 'reason' field not asserted in any failure test            |
| H5  | HIGH     | parseFile.action.test.ts    | withTenant never asserted in any of 4 call sites                     |
| H6  | HIGH     | sdlxliffParser.test.ts      | MAX_PARSE_SIZE_BYTES exact boundary (=) not tested                   |
| M1  | MEDIUM   | sdlxliffParser.test.ts      | seg-source preferred over source when both present — not verified    |
| M2  | MEDIUM   | sdlxliffParser.test.ts      | hasSdlNamespace false positive / mismatch scenario untested          |
| M3  | MEDIUM   | sdlxliffParser.test.ts      | SDLXLIFF with both note and sdl:cmt — which wins? untested           |
| M4  | MEDIUM   | sdlxliffParser.test.ts      | matchPercentage clamping (-1, 150, NaN) untested                     |
| M5  | MEDIUM   | sdlxliffParser.test.ts      | multi-file with different source-language — first-file-wins untested |
| M6  | MEDIUM   | sdlxliffParser.test.ts      | TAG_MISMATCH propagation from extractor through parser untested      |
| M7  | MEDIUM   | sdlxliffParser.test.ts      | XLIFF trans-unit with no source skipped silently — not tested        |
| M8  | MEDIUM   | sdlxliffParser.test.ts      | XLIFF trans-unit with no target → targetText='' not tested           |
| M9  | MEDIUM   | wordCounter.test.ts         | bare 'th' locale (no region) not tested through countWords           |
| M10 | MEDIUM   | wordCounter.test.ts         | stripped.length===0 guard is dead code (potential source defect)     |
| M11 | MEDIUM   | inlineTagExtractor.test.ts  | tag with no id attribute — fallback to tags.length untested          |
| M12 | MEDIUM   | inlineTagExtractor.test.ts  | 3-level nested g tags not tested (only 2-level covered)              |
| L1  | LOW      | wordCounter.test.ts         | toBeGreaterThan(0) used where exact values are knowable              |
| L2  | LOW      | sdlxliffParser.test.ts      | test description missing "when {condition}" clause                   |
| L3  | LOW      | parseFile.action.test.ts    | second batch tenantId/projectId not asserted in H7 test              |
| L4  | LOW      | sdlxliffParser.test.ts      | missing body element in file silently skipped — not tested           |
| L5  | LOW      | types.test.ts               | exhaustiveness test uses toBeDefined() not toBe()                    |
| L6  | LOW      | sdlxliffParser.perf.test.ts | perf test does not validate segment content correctness              |
| L7  | LOW      | parseFile.action.test.ts    | CONFLICT error message content only asserted for 'parsing' case      |

---

## Notable: M10 is a POTENTIAL SOURCE CODE DEFECT

In `wordCounter.ts` line 22:

```ts
const stripped = stripMarkup(text).trim()
if (stripped.length === 0) return 0
```

`stripMarkup()` replaces each tag character with a SPACE. Therefore
`stripped.length` can NEVER be 0 (unless the input was empty, already caught at
line 13). The condition `stripped.length === 0` is dead code. The intended guard
was probably `stripped.trim().length === 0`, but `.trim()` is already called
before the length check. This dead code guard should be investigated and either:
a) Removed if truly unreachable, or
b) Fixed to `stripped.trim().length === 0` before calling `trim()`.

Since there is no test for this path, the dead code exists silently.
