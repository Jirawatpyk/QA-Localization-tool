# Story 2.2 Test Review — Adversarial Findings (2026-02-23)

## Summary: 101 tests across 6 files reviewed

Test counts per file:

- inlineTagExtractor.test.ts: 17 tests
- wordCounter.test.ts: 20 tests
- types.test.ts: 12 tests
- sdlxliffParser.test.ts: 37 tests
- sdlxliffParser.perf.test.ts: 1 test
- parseFile.action.test.ts: 14 tests

---

## CRITICAL Findings (AC not covered)

### C1 — AC#3 exact error message not asserted

- **File:** `sdlxliffParser.test.ts` lines 336-352
- **AC#3 requires exact string:** `"File too large for processing (max 15MB). Please split the file in your CAT tool"`
- **Test only asserts:** `expect(result.error.message).toContain('15MB')` — a substring match
- **Source truth:** `sdlxliffParser.ts` line 84 emits the exact string. The test would pass even
  if the message were changed to `"15MB limit"`. The `toContain` does not verify the full AC requirement.
- **Fix:** Change to `expect(result.error.message).toBe('File too large for processing (max 15MB). Please split the file in your CAT tool')`

### C2 — AC#7 exact error message not asserted

- **File:** `sdlxliffParser.test.ts` lines 354-381
- **AC#7 requires exact string:** `"Invalid file format — could not parse XML structure"`
- **Tests assert:** `expect(result.error.code).toBe('INVALID_STRUCTURE')` — code only, NOT message
- **Problem:** No test asserts the error MESSAGE, only the code. The human-readable message
  displayed to users could be changed to anything and no test would catch it.
- **Note also:** The INVALID_STRUCTURE and INVALID_XML codes have DIFFERENT messages in source:
  - `INVALID_XML`: "Invalid file format — could not parse XML structure" (the AC#7 message)
  - `INVALID_STRUCTURE`: "Invalid file format — missing <xliff> root element" (different)
  - fast-xml-parser is lenient (never throws on malformed XML), so `INVALID_XML` code path is
    essentially unreachable in practice — the code path tested (lines 354-381) ONLY hits
    INVALID_STRUCTURE, not INVALID_XML. The actual AC#7 error message is never validated in any test.
- **Fix:** Add a test for truly unparseable XML (force throw from parser) + assert exact message.

### C3 — AC#1 inline tag POSITION values never asserted in parser integration tests

- **File:** `sdlxliffParser.test.ts` (the entire with-namespaces section, lines 121-188)
- **AC#1 requires:** "positions identical" — meaning the char offset in plain text must be correct
- **Tests check:** tag TYPE (`'g'`, `'x'`, `'ph'`) and COUNT (`toHaveLength`) but NEVER the
  `position` field on any extracted tag from a real fixture parse.
- **Example gap:** seg2 (x tag, fixture line 41) — `<x id="1"/>` is at position 6 ("Line 1" = 6 chars).
  The expected-json says `"position 6"` but no test asserts `seg2.inlineTags![0]!.position === 6`.
- **Contrast:** `inlineTagExtractor.test.ts` DOES test positions (it is the right level for this).
  But the parser-level tests don't verify the integration path (parser → extractor → position).
- **Fix:** Add `expect(seg2.inlineTags![0]!.position).toBe(6)` for at least 2 fixture segments.

### C4 — AC#1 inline tag COUNT in source vs target never compared

- **File:** `sdlxliffParser.test.ts`
- **AC#1 requires:** "count matching original" — source and target tag counts must match
- **Tests check:** source `inlineTags` count but NEVER assert that target has same number of tags.
  The parser extracts source tags only (stored in DB). No test verifies the parser validates or
  detects mismatched tag counts between source and target (e.g. source has 2 tags, target has 1).
- **Note:** This may be intentional if the parser doesn't validate parity — but then AC#1's
  "count matching original" is unverifiable and no test can fail on tag count mismatch.
- **Fix:** Either test that source inlineTags count equals target tag count, OR explicitly document
  that AC#1 "count matching" is enforced by the rule engine (Story 2.4), not the parser.

### C5 — AC#4 DB column `source_lang` / `target_lang` never asserted in action test

- **File:** `parseFile.action.test.ts` line 248
- **AC#4 requires** segment DB row to contain `source_lang` and `target_lang`
- **Test asserts:** `tenantId`, `fileId`, `projectId` in the inserted batch values
- **Missing:** No assertion that `sourceLang` and `targetLang` are included in the values passed
  to `db.insert(segments).values(...)`. These fields are in `batchInsertSegments` (action line 173-174)
  but the test uses a broad `expect.arrayContaining([expect.objectContaining({...})])` that only
  checks 3 fields. If `sourceLang`/`targetLang` were accidentally removed, this test would still pass.
- **Fix:** Add `sourceLang: 'en-US', targetLang: 'th-TH'` to the `objectContaining` assertion.

---

## HIGH Findings (important scenario missing)

### H1 — AC#3 boundary value at exactly 15MB not tested

- **File:** `sdlxliffParser.test.ts` line 337-344
- **Test uses:** `MAX_PARSE_SIZE_BYTES + 1` (over) — but NEVER `MAX_PARSE_SIZE_BYTES` (at limit)
  and NEVER `MAX_PARSE_SIZE_BYTES - 1` (under limit, should succeed)
- **Source truth:** `sdlxliffParser.ts` line 78: `if (byteSize > MAX_PARSE_SIZE_BYTES)` — uses
  strict `>`, meaning a file of EXACTLY 15MB should be ALLOWED (not rejected).
- **Risk:** If operator changes from `>` to `>=`, no test would catch the regression.
- **Fix:** Add two tests: `fileSizeBytes: MAX_PARSE_SIZE_BYTES` → success, and
  `fileSizeBytes: MAX_PARSE_SIZE_BYTES - 1` → success.

### H2 — parseFile action: DB_ERROR path completely untested

- **File:** `parseFile.action.test.ts`
- **Source truth:** `parseFile.action.ts` lines 120-129: if `batchInsertSegments` throws,
  the action catches it, calls `markFileFailed`, and returns `{ success: false, code: 'DB_ERROR' }`.
- **Test gap:** There is no test that makes `mockInsert` (or `insertChain.values`) reject with an Error.
  The entire DB_ERROR catch block — including the audit log write — is completely uncovered.
- **Fix:** Add `insertChain.values.mockRejectedValue(new Error('deadlock detected'))` test that
  asserts: result.code === 'DB_ERROR', status set to 'failed', audit log written.

### H3 — parseFile action: cross-tenant access denial not tested

- **File:** `parseFile.action.test.ts`
- **Source truth:** `parseFile.action.ts` lines 51-53: explicit cross-tenant check
  `if (file.tenantId !== currentUser.tenantId)` → returns FORBIDDEN.
  This is a defense-in-depth check AFTER the withTenant DB filter.
- **Test gap:** No test passes a mockFile with `tenantId: 'different-tenant-uuid'` while keeping
  `mockUser.tenantId = TENANT_ID`. This defense-in-depth line is completely untested.
- **Fix:** Add test: `buildSelectChain([{ ...mockFile, tenantId: 'zzz-different-tenant' }])` →
  expects `result.code === 'FORBIDDEN'`.

### H4 — parseFile action: audit log for PARSE_ERROR does NOT assert error details

- **File:** `parseFile.action.test.ts` line 325-338
- **Test asserts:** `action: 'file.parse_failed'` (action name only)
- **Missing:** No assertion that the `newValue` includes `errorCode` or `reason` for PARSE_ERROR.
  The source at line 98-99 sets `reason: parseResult.error.message` and `errorCode: parseResult.error.code`.
  These audit trail fields are critical for debugging — but no test verifies them.
- **Fix:** Add `newValue: expect.objectContaining({ errorCode: 'INVALID_STRUCTURE' })` assertion.

### H5 — Batch insert boundary: exactly 100 segments and 101 segments not tested

- **File:** `parseFile.action.test.ts`
- **Source truth:** `SEGMENT_BATCH_SIZE = 100`. The loop: `for (let i = 0; i < segments.length; i += 100)`
- **Test gap:** Only tests 1 segment (far below batch size). No test generates exactly 100 or 101 segments.
  At exactly 100: should call `insert.values` once. At 101: must call `insert.values` twice.
- **The only batch test** (line 357) says "< SEGMENT_BATCH_SIZE" and uses 1 segment — it does not
  test the actual batch boundary.
- **Fix:** Use a generated XLIFF with 101 trans-units (reuse the perf-test pattern). Assert
  `insertChain.values` called exactly 2 times.

### H6 — empty-target fixture: segment 3 (self-closing `<target/>`) not tested

- **File:** `sdlxliffParser.test.ts` lines 277-294
- **Fixture has 3 segments:** seg1 (has target), seg2 (empty mrk), seg3 (self-closing `<target/>`)
- **Tests only cover:** seg2 targetText='' and seg2 sourceText='World'
- **Missing:** seg3 (`<target/>` with no mrk at all) — the parser falls back to
  `targetMrkMap.get(mid) ?? []` → empty array → `plainText = ''`. This is a different code path
  from seg2 (which has `<mrk mid="3"/>` present but empty). No test verifies seg3.targetText === ''.
- **Fix:** Add test asserting `result.data.segments[2]?.targetText === ''`.

### H7 — SDLXLIFF: unrecognised conf value falls back to null — not tested

- **File:** `sdlxliffParser.test.ts`
- **Source truth:** `extractSdlSegMeta` line 323: `const conf = isValidConfirmationState(confRaw) ? confRaw : null`
- **Test gap:** No test passes a `conf="SomeUnknownState"` in inline XML and verifies that
  `confirmationState` is `null` (not `'SomeUnknownState'`). This fallback guards against SDL
  adding new states in future file versions.
- **Fix:** Add inline SDLXLIFF with `conf="UnrecognisedState"` → `confirmationState === null`.

### H8 — standard.xliff: inline tags (g, ph) in segments 2 and 3 not asserted

- **File:** `sdlxliffParser.test.ts` lines 190-248
- **Fixture:** standard.xliff seg2 has `<g id="1">` and seg3 has `<ph id="1"/>` (per expected JSON)
- **Tests:** Cover seg1's translatorComment, all 3 segments' confirmationState, fileType, matchPercentage
- **Missing:** No test asserts that `seg2.inlineTags` is non-null with type 'g', nor that
  `seg3.inlineTags` is non-null with type 'ph'. The XLIFF inline tag extraction path (pure XLIFF,
  not SDLXLIFF) is untested at the parser integration level.
- **Fix:** Add: `expect(result.data.segments[1]?.inlineTags?.[0]?.type).toBe('g')` and
  `expect(result.data.segments[2]?.inlineTags?.[0]?.type).toBe('ph')`.

### H9 — wordCounter.test.ts: mixed Thai + inline tags assertion is weak

- **File:** `wordCounter.test.ts` line 103
- **Test:** `expect(result).toBeGreaterThanOrEqual(1)` — accepts ANY non-zero count
- **Problem:** The test cannot fail as long as countWords returns >= 1. It provides no regression
  protection. The Thai text `สวัสดีครับ` has exactly 2 words; the correct assertion should be
  `toBe(2)`. Even `toBeGreaterThan(0)` would be stronger than `toBeGreaterThanOrEqual(1)`.
- **Fix:** Use corpus data or assert exact count `toBe(2)` — `สวัสดี` = 1 word, `ครับ` = 1 word.

### H10 — xliff-with-notes: single-note segment (seg1) translatorComment not asserted

- **File:** `sdlxliffParser.test.ts` lines 250-275
- **Fixture seg1:** has single `<note>Translator note: formal register required</note>`
- **Tests cover:** seg3 (multi-note concatenation) and seg2 (null note)
- **Missing:** No test verifies seg1's single-note mapping: `translatorComment === 'Translator note: formal register required'`
- **Fix:** Add: `expect(result.data.segments[0]?.translatorComment).toBe('Translator note: formal register required')`

---

## MEDIUM Findings (quality issues)

### M1 — inlineTagExtractor: `bpt` content with empty string not tested

- **Source truth:** `inlineTagExtractor.ts` lines 108-113: `content = innerText || undefined` —
  if `innerText` is `''` (bpt with no text children), content becomes `undefined`.
- **Test gap:** The `bpt` test uses `textNode('bold')` which gives `content: 'bold'`. No test
  passes a `bpt` node with no text children to verify `content` is `undefined`.

### M2 — inlineTagExtractor: `bpt` opened by different id than `ept` closes — not tested

- **Source truth:** `inlineTagExtractor.ts` line 131: checks `openType !== 'bpt'` for ept
- **Test gap:** Tests verify ept without any bpt (unmatched). No test opens bpt with id='A'
  then closes ept with id='B' (cross-id mismatch). This is a different failure mode.

### M3 — inlineTagExtractor: non-inline tag with children does not contribute tags

- **Source truth:** `inlineTagExtractor.ts` lines 71-79: non-inline tags recurse into children
  to collect text, but the tag itself is not recorded. For example `<mrk>` containing text.
- **Test gap:** No test verifies that an unknown tag like `<mrk>` wrapping text passes through
  its text content correctly while not recording a tag entry.

### M4 — sdlxliffParser: SDLXLIFF with no `<body>` element — silent skip

- **Source truth:** `sdlxliffParser.ts` lines 145-147: `if (!bodyEl) continue`
- **Test gap:** No test verifies that a file with a `<file>` element but no `<body>` returns
  `{ success: true, data: { segments: [], ... } }` — a valid but empty parse.

### M5 — sdlxliffParser: multi-file XLIFF (2+ `<file>` elements) not tested

- **Source truth:** `sdlxliffParser.ts` lines 135-168: loops over `fileElements`
- **Test gap:** All fixtures have exactly 1 `<file>` element. No test verifies that 2 `<file>`
  elements are both processed and segments concatenated with correct sequential numbering.

### M6 — sdlxliffParser: `<group>` nested inside another `<group>` not tested

- **Source truth:** `collectTransUnits` line 396: recurses into group children
- **Test gap:** No test has nested groups (group → group → trans-unit). The recursive path
  in `collectTransUnits` is untested.

### M7 — sdlxliffParser: trans-unit with no `<source>` element returns empty silently

- **Source truth:** `sdlxliffParser.ts` line 260: `if (!sourceEl) return { success: true, data: [] }`
- **Test gap:** No test sends a plain XLIFF trans-unit with no `<source>` child and verifies
  it is silently skipped (not an error, just omitted from results).

### M8 — parseFile.action: `withTenant` usage not verified in DB queries

- **File:** `parseFile.action.test.ts`
- **Source truth:** `withTenant` is called 3 times in the action (lines 43, 59, 135)
- **Test gap:** Unlike Story 2.1 where `withTenant` assertion was explicitly added as L7, the
  Story 2.2 action test has NO assertion that `withTenant` is called with the correct tenant ID.
  The mock chain uses `.where(vi.fn().mockReturnThis())` which accepts any argument.
- **Fix:** Mock `withTenant` and assert it was called with `(files.tenantId, TENANT_ID)`.

### M9 — parseFile.action: `file.parsing_started` audit log details not fully asserted

- **File:** `parseFile.action.test.ts` lines 183-198
- **Test asserts:** `action: 'file.parsing_started'` and `entityId: FILE_ID`
- **Missing:** No assertion that `newValue` includes `{ fileName: 'test.sdlxliff', fileType: 'sdlxliff' }`
  (the fields set at action line 68-69). Also `tenantId` and `userId` are not verified for this log entry.

### M10 — sdlxliffParser.perf.test.ts: segment content not spot-checked

- **File:** `sdlxliffParser.perf.test.ts` lines 50-54
- **Test asserts:** `segments.toHaveLength(5000)` and `elapsed < 3000`
- **Missing:** No spot-check of segment content (e.g. check segment[0].sourceText or confirmationState).
  The perf test verifies quantity and speed but not correctness — a refactor that produces 5000 empty
  segments would pass the perf test.

### M11 — wordCounter.test.ts: `zh-TW` locale test assertion is weak

- **File:** `wordCounter.test.ts` line 113
- **Test:** `expect(result).toBeGreaterThan(0)` for `'你好世界'` with `zh-TW` locale
- **Problem:** `'你好世界'` should be 2–4 words depending on segmenter. `toBeGreaterThan(0)` is
  too permissive. Use corpus data or an exact assertion.

### M12 — types.test.ts: no negative tests — does NOT test invalid types are rejected

- **File:** `types.test.ts`
- **Problem:** All 12 tests are positive (checking valid values exist). No test verifies that
  an unknown state like `'PendingTranslation'` is NOT in `CONFIRMATION_STATES`, or that
  `XLIFF_STATE_MAP` does NOT contain a key like `'approved'`.
- **These are type-checking tests** that pass trivially. The real risk is accidental addition
  of a wrong value. Negative assertions would catch that.

---

## LOW Findings (style / naming / minor)

### L1 — Test naming inconsistency: `describe` with AC annotation in parentheses

- **Files:** `sdlxliffParser.test.ts` describes like `'minimal.sdlxliff — basic SDLXLIFF parsing (AC #1, #4, #5)'`
- **Project standard:** `describe("{Unit}")` — not `describe("{fixture} — {description} (AC #N)")`
- **Impact:** Minor style deviation, does not affect test behavior

### L2 — `sdlxliffParser.test.ts` line 337: `oversizedContent = 'a'.repeat(1024)` comment misleading

- The comment says `// small content` but it tests `fileSizeBytes` parameter, not actual content size.
  The variable name `oversizedContent` is also misleading — the content IS small, only the reported
  size is large. Rename to `anySmallContent` or add comment clarifying the parameter semantics.

### L3 — `parseFile.action.test.ts`: `mockFile.status: 'uploaded'` — no test verifies status guard

- `parseFile.action.ts` does NOT guard against re-parsing an already-parsed file. A file with
  `status: 'parsed'` can be re-parsed, creating duplicate segments. This is a product gap, but
  the absence of a test for it means the gap is invisible.

### L4 — `sdlxliffParser.test.ts` line 251: `describe('XLIFF with notes...')` uses segment indices

directly on `result.data.segments[2]!` — this is fragile. If a segment is added to the fixture,
index 2 silently points to the wrong segment. Should use `find` by segmentId or sourceText.

### L5 — `wordCounter.test.ts`: chunking tests do not verify chunk boundary split is harmless

for ENGLISH text. All chunking tests are Thai/Japanese only. `countWords(longEnglishText, 'en-US')`
with > 30k chars would use a different code path (space-split, no chunking) — the chunking path
is specific to CJK/Thai. Not a bug but worth noting that English does not exercise `chunkText`.

### L6 — `inlineTagExtractor.test.ts` line 14: `children: object[]` parameter type uses `object`

instead of `Record<string, unknown>[]` — should match the source type for strict consistency.

---

## Fixture Coverage Matrix

| Fixture                   | Tests   | Position asserted    | Tag count asserted | Comment asserted |
| ------------------------- | ------- | -------------------- | ------------------ | ---------------- |
| minimal.sdlxliff          | 9 tests | No                   | N/A (no tags)      | Yes (null)       |
| with-namespaces.sdlxliff  | 7 tests | **No (CRITICAL C3)** | Yes (count)        | Yes (value)      |
| standard.xliff            | 6 tests | No                   | **No (HIGH H8)**   | Yes (seg1)       |
| xliff-with-notes.xliff    | 3 tests | No                   | No                 | Partial (H10)    |
| empty-target.sdlxliff     | 2 tests | No                   | N/A                | No               |
| multi-seg-per-tu.sdlxliff | 2 tests | No                   | No                 | No               |
| malformed.xml             | 3 tests | No                   | N/A                | N/A              |

---

## AC Coverage Summary

| AC                                     | Status  | Key Gaps                                                 |
| -------------------------------------- | ------- | -------------------------------------------------------- |
| AC#1 — SDLXLIFF extraction + positions | Partial | C3 (positions not tested), C4 (count parity not tested)  |
| AC#2 — XLIFF 1.2 same parser           | Partial | H8 (XLIFF inline tags not asserted), H10 (single note)   |
| AC#3 — 15MB rejection + exact message  | Partial | C1 (substring not exact), H1 (boundary value)            |
| AC#4 — DB schema + CJK word count      | Partial | C5 (sourceLang/targetLang not in insert assertion)       |
| AC#5 — Mixed states per segment        | Covered | multi-seg fixture has 3 different states                 |
| AC#6 — 10MB/5000 segs < 3s             | Partial | M10 (correctness not spot-checked)                       |
| AC#7 — Malformed XLIFF error           | Partial | C2 (exact message not asserted, INVALID_XML unreachable) |
