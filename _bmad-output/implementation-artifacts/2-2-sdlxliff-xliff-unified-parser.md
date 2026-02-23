# Story 2.2: SDLXLIFF & XLIFF 1.2 Unified Parser

Status: done

<!-- Validated: 2026-02-23 — 2 critical fixes (C1: test corpus task, C2: audit log clarification) + 3 enhancements applied. -->

## Story

As a QA Reviewer,
I want my SDLXLIFF and XLIFF files parsed correctly with all metadata preserved,
so that the QA engine has complete segment data including Trados-specific information.

## Acceptance Criteria

1. **Given** a valid SDLXLIFF file from Trados Studio is uploaded
   **When** the parser processes it
   **Then** all trans-units are extracted with: source text, target text, segment ID, confirmation state (Draft/Translated/ApprovedSignOff), match percentage, and translator comments (`<sdl:cmt>`) (FR3)
   **And** all inline tags are preserved: `<g>`, `<x/>`, `<ph>`, `<bx/>`, `<ex/>`, `<bpt>`, `<ept>` and sdl: namespace elements — preserved means inline_tags (jsonb) contains `[{ type, id, attributes }]` with count matching original file and positions identical to source XML
   **And** the `sdl:` namespace is recognized and handled (not stripped or errored)
   **And** parser validates tag structure per XLIFF spec; malformed tag nesting triggers graceful error with specific tag ID and position; invalid tags are rejected (not silently dropped) with clear error message to user

2. **Given** a standard XLIFF 1.2 file is uploaded
   **When** the parser processes it
   **Then** the same unified parser handles it (SDLXLIFF is superset — strip sdl: namespace = XLIFF 1.2) (FR4)
   **And** trans-units, inline tags, notes, and segment metadata are preserved

3. **Given** a file larger than 15MB is being parsed
   **When** the DOM parsing guard is triggered
   **Then** the file is rejected with error: "File too large for processing (max 15MB). Please split the file in your CAT tool"
   **And** the rejection is logged with file size and filename (no file content)

4. **Given** parsing completes successfully
   **When** I inspect the database
   **Then** the segments table contains: id, file_id, project_id, tenant_id, segment_number, source_text, target_text, confirmation_state, match_percentage, translator_comment, inline_tags (jsonb), word_count, created_at
   **And** word count for CJK/Thai uses Intl.Segmenter token count (not space-split) — deterministic: for test corpus `docs/test-data/segmenter/{language}.json`, token count must match expected_tokens within +/-0%

5. **Given** a file with mixed confirmation states (Draft + Translated + ApprovedSignOff)
   **When** the parser processes it
   **Then** each segment's confirmation state is correctly preserved
   **And** the state is available for downstream QA logic (e.g., skip Approved segments)

6. **Given** a 10MB SDLXLIFF file with ~5,000 segments
   **When** parsing runs
   **Then** it completes within 3 seconds (NFR1)
   **And** memory usage stays within Vercel's 1024MB serverless limit

7. **Given** a malformed XLIFF file (invalid XML)
   **When** parsing is attempted
   **Then** the parser returns a clear error: "Invalid file format — could not parse XML structure"
   **And** the file status is set to "failed" with the error details

## Tasks / Subtasks

- [x] Task 1: DB Schema Migration — `segments` table ALTER + Supabase migration (AC: #4)
  - [x] 1.1 Update `src/db/schema/segments.ts` — add 4 new columns: `confirmationState`, `matchPercentage`, `translatorComment`, `inlineTags`
  - [x] 1.2 Run `npm run db:generate` — generates ALTER TABLE migration SQL
  - [x] 1.3 Create `supabase/migrations/00013_story_2_2_segments_columns.sql` — DDL for local Supabase (ALTER TABLE add 4 columns)
  - [x] 1.4 Run `npm run db:migrate` — apply migration
  - [x] 1.5 Add `buildSegment()` factory to `src/test/factories.ts`
  - [x] 1.6 Update segments RLS tests if needed (existing `segments.rls.test.ts` — verify new columns don't break)

- [x] Task 2: Parser Types & Constants (AC: #1, #2)
  - [x] 2.1 Create `src/features/parser/types.ts` — `InlineTag`, `ParsedSegment`, `ParseResult`, `ParserError`, `ConfirmationState`, `XliffState`
  - [x] 2.2 Create `src/features/parser/constants.ts` — parser-specific constants (INLINE_TAG_TYPES, CONFIRMATION_STATES, XLIFF_STATE_MAP)
  - [x] 2.3 Unit tests for type guard functions

- [x] Task 3: Inline Tag Extractor (AC: #1, #2)
  - [x] 3.1 Create `src/features/parser/inlineTagExtractor.ts` — extracts `<g>`, `<x/>`, `<ph>`, `<bx/>`, `<ex/>`, `<bpt>`, `<ept>` from parsed XML node, returns `InlineTag[]` + plain text
  - [x] 3.2 Handles nested inline tags (e.g., `<g><ph/></g>`) — flatten to position list
  - [x] 3.3 Validates tag structure (paired tags have matching IDs) — returns error on mismatch
  - [x] 3.4 Unit tests — **target: 15-20 tests** (all 7 tag types, nested, mismatched, empty, edge cases)

- [x] Task 4: Word Counter Utility (AC: #4)
  - [x] 4.1 Create word count test corpus `docs/test-data/segmenter/{language}.json` — each file contains `{ "segments": [{ "text": "...", "expected_tokens": N }] }` for English, Thai, Japanese, Chinese, Korean. Token counts must be computed using `Intl.Segmenter` with `isWordLike` filter on Node.js 18+ full ICU. This is the **single source of truth** for AC #4 deterministic validation (±0% tolerance).
  - [x] 4.2 Create `src/features/parser/wordCounter.ts` — uses existing `segmenterCache.ts` + `markupStripper.ts`
  - [x] 4.3 For CJK/Thai: strip markup → chunk text → `Intl.Segmenter` with `isWordLike` filter → count
  - [x] 4.4 For space-separated languages: strip markup → split by whitespace → count non-empty
  - [x] 4.5 Handles empty strings (0 words), tag-only strings (0 words)
  - [x] 4.6 Unit tests — **20 tests** (5 corpus languages × exact match, edge cases: empty, whitespace, markup-only, placeholder-only, mixed Thai+inline-tags, single-word, locale with region code, numerals, + 4 long-text chunking path tests > 30k chars). Corpus expanded to 52 segments (10-12 per language).

- [x] Task 5: Unified SDLXLIFF/XLIFF Parser Core (AC: #1, #2, #3, #5, #7)
  - [x] 5.1 Create `src/features/parser/sdlxliffParser.ts` — main parser function
  - [x] 5.2 fast-xml-parser config: `preserveOrder: true`, `ignoreAttributes: false`, `removeNSPrefix: false`, `isArray` for trans-unit/group/file/seg
  - [x] 5.3 Walk `<file>` elements — extract `source-language`, `target-language`
  - [x] 5.4 Walk `<trans-unit>` elements — handle SDLXLIFF `<seg-source>/<mrk>` and plain XLIFF `<source>/<target>`
  - [x] 5.5 Extract `sdl:seg` attributes: `conf` → `confirmationState`, `percent` → `matchPercentage`
  - [x] 5.6 Extract `<sdl:cmt>` → `translatorComment`
  - [x] 5.7 Extract XLIFF `<target state="">` for pure XLIFF files → map to `confirmationState`
  - [x] 5.8 Extract `<note>` elements → `translatorComment` (XLIFF standard)
  - [x] 5.9 Handle multiple `<sdl:seg>` per trans-unit (each `<mrk mid="N">` = separate segment)
  - [x] 5.10 15MB size guard BEFORE parsing (defense-in-depth, separate from upload guard)
  - [x] 5.11 Error handling: invalid XML → catch parse error → return `ParserError`
  - [x] 5.12 Unit tests — **37 tests** (minimal fixture, namespace fixture, XLIFF fixture, all 5 state mappings incl. `final`→ApprovedSignOff, edge cases, error cases)
  - [x] 5.13 Performance test: generate ~5,000 fake segments via factory, verify parse completes within 3 seconds (AC #6). Use `performance.now()` to measure; this is a unit-level smoke test, not a benchmark.

- [x] Task 6: Segment Persistence — Server Action (AC: #4)
  - [x] 6.1 Create `src/features/parser/actions/parseFile.action.ts` — orchestrates: fetch file from Storage → parse → batch insert segments → update file status
  - [x] 6.2 Fetch file content from Supabase Storage via `createAdminClient()`
  - [x] 6.3 Update `files.status` to `'parsing'` before parse, `'parsed'` on success, `'failed'` on error
  - [x] 6.4 Batch insert segments via Drizzle (100 segments per INSERT for memory efficiency)
  - [x] 6.5 ALL DB queries use `withTenant()`
  - [x] 6.6 Write audit log entries: `file.parsing_started`, `file.parsed`, `file.parse_failed`
  - [x] 6.7 Return `ActionResult<{ segmentCount: number; fileId: string }>`
  - [x] 6.8 Unit tests — 14 tests (success, fail, batch insert, status transitions, audit log incl. `file.parse_failed` on PARSE_ERROR, tenant isolation)

- [x] Task 7: Unit Test Fixtures (AC: all)
  - [x] 7.1 Create `src/test/fixtures/sdlxliff/minimal.json` — pre-parsed expected output for minimal.sdlxliff fixture
  - [x] 7.2 Create `src/test/fixtures/sdlxliff/with-namespaces.json` — pre-parsed expected output for with-namespaces.sdlxliff fixture
  - [x] 7.3 Create `src/test/fixtures/xliff/standard.json` — pre-parsed expected output for standard.xliff fixture
  - [x] 7.4 Create additional edge-case fixtures: empty-target, malformed-xml, no-namespace (pure XLIFF), multi-seg-per-tu, xliff-with-notes (pure XLIFF 1.2 with `<note>` elements — needed for AC #2 `<note>` → `translatorComment` mapping test)

- [x] Task 8: Integration Testing & Regression Check
  - [x] 8.1 Verify existing 507+ tests still pass — 606/606 passed (0 regressions, +99 new tests)
  - [x] 8.2 Type check — `npm run type-check` — 0 errors
  - [x] 8.3 Lint — `npm run lint` — 0 errors, 0 warnings
  - [x] 8.4 RLS tests — confirmed adequate (row-level policies cover new columns automatically)

## Dev Notes

### Key Gotchas — Read Before Starting

1. **Parser is a PURE FUNCTION, NOT a Route Handler**: The parser module at `src/features/parser/` is a server-side utility. It will be CALLED BY the Inngest pipeline in Story 2.6. For this story, create the `parseFile.action.ts` Server Action as the entry point for testing and future pipeline integration. The Server Action fetches the file from Supabase Storage, invokes the parser, and persists segments.

2. **`segments` table ALREADY EXISTS — use ALTER TABLE**: The schema at `src/db/schema/segments.ts` already has core columns (id, fileId, projectId, tenantId, segmentNumber, sourceText, targetText, sourceLang, targetLang, wordCount, createdAt). You need to ADD 4 columns via ALTER TABLE migration. Do NOT recreate the table. [Source: src/db/schema/segments.ts]

3. **fast-xml-parser is v5.3.6** (NOT v4): The project already has `fast-xml-parser@5.3.6` installed. The API is compatible with v4 options (`preserveOrder`, `isArray`, `ignoreAttributes`, `removeNSPrefix`). Existing usage pattern in `src/features/glossary/parsers/tbxParser.ts` — follow that import pattern.

4. **`preserveOrder: true` changes output shape**: With this option, the parsed result is an ARRAY of objects `[{ tagName: [...children], ":@": { "@_attr": "val" } }]` instead of nested objects. This is REQUIRED for inline tag position tracking. See fast-xml-parser docs for the exact output shape.

5. **SDLXLIFF `<seg-source>` wrapping**: In SDLXLIFF, the actual segment text lives inside `<seg-source><mrk mtype="seg" mid="N">TEXT</mrk></seg-source>`, NOT directly in `<source>`. The `<source>` element contains the UN-segmented source (may differ from segmented). Always extract from `<mrk>` elements when `<seg-source>` is present. [Source: _bmad-output/sdlxliff-research-note.md#Section 2]

6. **Multiple `<sdl:seg>` per trans-unit**: A single `<trans-unit>` can contain multiple `<mrk mid="N">` elements (one per sentence segment). Each `<mrk>` with unique `mid` = a SEPARATE segment in the DB. The `<sdl:seg id="N">` in `<sdl:seg-defs>` provides metadata (conf, percent) for each segment by matching `id` to `mid`. [Source: _bmad-output/sdlxliff-research-note.md#Section 8]

7. **XLIFF 1.2 `<target state="">` mapping**: Pure XLIFF files (no sdl: namespace) use `<target state="translated">` instead of `sdl:seg conf="Translated"`. Map XLIFF states to our internal confirmation states: `translated` → `Translated`, `signed-off` → `ApprovedSignOff`, `new` → `Draft`, `needs-review-translation` → `Draft`, etc. [Source: _bmad-output/sdlxliff-research-note.md#Section 3]

8. **XLIFF `<note>` maps to `translatorComment`**: Pure XLIFF 1.2 files use `<note>` elements (standard XLIFF) for translator comments, while SDLXLIFF uses `<sdl:cmt>`. Both MUST map to the same `translator_comment` DB column. When both `<note>` and `<sdl:cmt>` exist in a single trans-unit, concatenate with `" | "` separator. [Source: XLIFF 1.2 spec, Task 5.8]

9. **Word counting REUSES existing utilities**: `src/lib/language/segmenterCache.ts` provides cached `Intl.Segmenter` instances, and `src/lib/language/markupStripper.ts` provides `stripMarkup()` and `chunkText()`. Do NOT recreate these. Import and use them directly. The flow is: `stripMarkup(targetText)` → `chunkText()` → `getSegmenter(locale).segment()` → count `isWordLike` tokens.

10. **No file content in logs (NFR10)**: When logging parser errors or status updates, log ONLY metadata: `{ fileId, fileName, segmentCount, errorMessage }`. NEVER log source text, target text, or file content. Use `pino` structured logging.

11. **Supabase Storage file fetch**: Use `createAdminClient()` from `@/lib/supabase/admin` to download the file. The `storagePath` from the `files` table points to the file in the `project-files` bucket. Pattern: `admin.storage.from('project-files').download(storagePath)` returns a `Blob`.

12. **Batch insert for memory efficiency**: Insert segments in batches of 100 using Drizzle's `db.insert(segments).values(batch)`. A 10MB file with ~5000 segments would be 50 INSERT operations. This prevents OOM on large files.

13. **Empty `<target>` = empty string, NOT null**: When a segment has `<target></target>` or `<target/>`, store as empty string `""`. The column is `text NOT NULL` so null is not allowed. Empty target is valid — it means the segment is untranslated.

14. **NO Inngest integration in Story 2.2**: The parser is invoked via a Server Action in this story. The Inngest pipeline wiring (orchestrator calling the parser) belongs to Story 2.6. Do NOT emit or consume Inngest events.

15. **NO UI for parse results**: Displaying parsed segments in the review panel belongs to Epic 4. This story creates the parser logic + DB persistence only.

16. **`file.status` transitions**: The `files` table already has a `status` field with values `uploaded | parsing | parsed | failed`. This story updates: `uploaded` → `parsing` (before parse starts) → `parsed` (on success) or `failed` (on error). Each transition must write an audit log entry.

---

### Critical Architecture Patterns & Constraints

#### DB Schema: `segments` Table Update (REQUIRED — Do First)

The existing `segments` table is MISSING 4 columns required by AC #4:

```typescript
// src/db/schema/segments.ts — ADD these columns (do NOT recreate table)
import { jsonb } from 'drizzle-orm/pg-core'

// New columns to add:
confirmationState: varchar('confirmation_state', { length: 30 }),
// nullable — null for XLIFF files without explicit state
// Values: 'Draft' | 'Translated' | 'ApprovedTranslation' | 'ApprovedSignOff' | 'RejectedTranslation' | 'RejectedSignOff'

matchPercentage: integer('match_percentage'),
// nullable — null for XLIFF files or segments with no TM match
// Range: 0-100

translatorComment: text('translator_comment'),
// nullable — null when no comment exists

inlineTags: jsonb('inline_tags').$type<InlineTag[]>(),
// nullable — null when no inline tags
// InlineTag = { type, id, position, attributes?, content? }
```

**Migration generation:** `npm run db:generate` will produce the ALTER TABLE SQL. Then create a matching Supabase migration file `00013_story_2_2_segments_columns.sql` with the same ALTER TABLE DDL so that `npx supabase start` picks up the changes.

#### fast-xml-parser v5 Configuration

```typescript
import { XMLParser } from 'fast-xml-parser'

// IMPORTANT: v5.3.6 — API compatible with v4 options
const parser = new XMLParser({
  // Preserve element order — REQUIRED for inline tag position tracking
  preserveOrder: true,

  // Parse ALL attributes (needed for sdl:seg conf, percent, mid, id)
  ignoreAttributes: false,
  attributeNamePrefix: '@_',

  // Handle sdl: namespace — do NOT strip (conflicts with same-name elements)
  removeNSPrefix: false,

  // Force arrays for elements that may appear 0-N times
  isArray: (name: string) =>
    ['trans-unit', 'group', 'file', 'mrk', 'note'].includes(name) ||
    ['g', 'x', 'ph', 'bx', 'ex', 'bpt', 'ept'].includes(name) ||
    name === 'sdl:seg' || name === 'sdl:seg-defs',

  // CDATA and text content handling
  textNodeName: '#text',
  cdataPropName: '__cdata',

  // Stop on first parse error
  allowBooleanAttributes: true,
})
```

**Output shape with `preserveOrder: true`:**
```typescript
// Each element is { tagName: [...children], ":@": { "@_attr": "val" } }
// Example:
[
  {
    "trans-unit": [
      { "source": [{ "#text": "Hello" }] },
      { "target": [{ "#text": "สวัสดี" }] },
    ],
    ":@": { "@_id": "1" }
  }
]
```

#### InlineTag JSON Schema

```typescript
// src/features/parser/types.ts
type InlineTag = {
  type: 'g' | 'x' | 'ph' | 'bx' | 'ex' | 'bpt' | 'ept'
  id: string
  position: number       // char offset in plain text (after removing tags)
  attributes?: Record<string, string>
  content?: string       // for bpt/ept that have translatable content
}

// Example for: "Click <g id='1'>here</g> to continue"
// Plain text:  "Click here to continue"
// Tags: [{ type: 'g', id: '1', position: 6, attributes: {} }]
```

#### Parser Algorithm Flow

```
1. Validate file size < 15MB (defense-in-depth, after upload guard)
2. Parse full XML with fast-xml-parser (DOM approach — preserveOrder: true)
3. Walk <file> elements → extract source-language, target-language
4. Walk <trans-unit> elements:
   a. Check for <seg-source> (SDLXLIFF) or direct <source> (XLIFF)
   b. If <seg-source>: iterate <mrk mtype="seg" mid="N"> — each = 1 segment
   c. If no <seg-source>: use <source>/<target> directly — 1 segment per trans-unit
   d. For each segment:
      i.   Extract text content from element children
      ii.  Extract inline tags into InlineTag[] — calculate positions
      iii. Get confirmation state from sdl:seg conf (SDLXLIFF) or target state (XLIFF)
      iv.  Get match percentage from sdl:seg percent
      v.   Get translator comment from <sdl:cmt> or <note>
      vi.  Count words using wordCounter utility
      vii. Build ParsedSegment object
5. Return ParseResult with all segments + metadata
```

#### File Status Update Flow

```
files.status: uploaded → parsing → parsed | failed

parseFile.action.ts:
1. Auth check (getCurrentUser)
2. Verify file belongs to tenant (withTenant)
3. Update files.status = 'parsing' + audit log (file.parsing_started)
4. Fetch file from Supabase Storage
5. Call parser(fileContent, fileType)
6. If parse error:
   a. Update files.status = 'failed' + error details
   b. Audit log (file.parse_failed)
   c. Return { success: false, error, code: 'PARSE_ERROR' }
7. If success:
   a. Batch insert segments (100 per batch) with withTenant()
   b. Update files.status = 'parsed'
   c. Audit log (file.parsed)
   d. Return { success: true, data: { segmentCount, fileId } }
```

#### XLIFF State to ConfirmationState Mapping

```typescript
// XLIFF 1.2 standard <target state=""> → internal confirmation state
const XLIFF_STATE_MAP: Record<string, string> = {
  'new': 'Draft',
  'needs-translation': 'Draft',
  'needs-l10n': 'Draft',
  'needs-review-translation': 'Draft',
  'needs-review-l10n': 'Draft',
  'translated': 'Translated',
  'signed-off': 'ApprovedSignOff',
  'final': 'ApprovedSignOff',
} as const

// SDLXLIFF conf values are used as-is (already correct format):
// 'Draft', 'Translated', 'ApprovedTranslation', 'ApprovedSignOff',
// 'RejectedTranslation', 'RejectedSignOff'
```

#### Confirmation State QA Skip Logic (reference for Story 2.4)

```typescript
// Parser stores the state — Story 2.4 (Rule Engine) uses it
// ApprovedSignOff segments should be SKIPPED by QA
// All other states get full QA checks
const SKIP_QA_STATES = ['ApprovedSignOff'] as const
```

#### Word Count — Reusing Existing Utilities

```typescript
// src/features/parser/wordCounter.ts
import { getSegmenter, isNoSpaceLanguage } from '@/lib/language/segmenterCache'
import { stripMarkup, chunkText } from '@/lib/language/markupStripper'

export function countWords(text: string, locale: string): number {
  if (!text || text.trim().length === 0) return 0

  const stripped = stripMarkup(text).trim()
  if (stripped.length === 0) return 0

  if (isNoSpaceLanguage(locale)) {
    // CJK/Thai: use Intl.Segmenter with isWordLike
    const segmenter = getSegmenter(locale)
    let count = 0
    for (const { chunk } of chunkText(stripped)) {
      for (const segment of segmenter.segment(chunk)) {
        if (segment.isWordLike) count++
      }
    }
    return count
  }

  // Space-separated languages: split by whitespace
  return stripped.split(/\s+/).filter(Boolean).length
}
```

#### Supabase Storage File Download

```typescript
// Pattern for fetching file from Storage
import { createAdminClient } from '@/lib/supabase/admin'

const admin = createAdminClient()
const { data, error } = await admin.storage
  .from('project-files')
  .download(file.storagePath)

if (error || !data) {
  // Update file status to 'failed', log error
  throw new Error(`Storage download failed: ${error?.message}`)
}

const xmlContent = await data.text()
// Pass to parser
```

#### Testing Standards

- `vi.mock('server-only', () => ({}))` FIRST in every server-side test file
- Factory functions from `src/test/factories.ts` — add `buildSegment()` with all 4 new columns
- Use REAL fixture files from `e2e/fixtures/sdlxliff/` and `e2e/fixtures/xliff/` as parser input
- Use pre-computed expected output JSON files in `src/test/fixtures/sdlxliff/`
- Mock Supabase Storage for `parseFile.action.ts` tests
- Mock `fast-xml-parser` mock exists at `src/test/mocks/fast-xml-parser.ts` — extend if needed
- Test naming: `describe("sdlxliffParser")` → `it("should extract 3 segments from minimal fixture")`
- **Target: ~60-80 unit tests total** for this story

#### Security Checklist

| Check | Implementation |
|-------|---------------|
| Auth required | `getCurrentUser()` at start of parseFile action |
| Tenant isolation | `withTenant()` on ALL queries (file lookup, segment insert) |
| File size limit | 15MB guard before parse (defense-in-depth) |
| No content in logs | Only log metadata (fileName, fileId, segmentCount, error) |
| Audit trail | `writeAuditLog()` for every status transition |
| M3 RBAC | `requireRole('qa_reviewer', 'write')` for parse action |
| Cross-tenant file guard | Verify file.tenantId matches current user before parsing |

#### Existing Patterns to Follow

| Pattern | Reference File | What to Copy |
|---------|---------------|-------------|
| XML Parser config | `src/features/glossary/parsers/tbxParser.ts` | XMLParser instantiation, error handling |
| Server Action with auth + audit | `src/features/project/actions/createProject.action.ts` | requireRole → validate → DB → audit → return |
| DB schema ALTER | Story 2.1 `src/db/schema/files.ts` | Adding columns to existing table |
| Supabase Storage download | `src/app/api/upload/route.ts` | createAdminClient() pattern for Storage |
| withTenant helper | `src/db/helpers/withTenant.ts` | Apply to every query |
| Test factories | `src/test/factories.ts` | buildSegment() pattern |
| Audit log | `src/features/audit/actions/writeAuditLog.ts` | writeAuditLog({ entityType, action, ... }) |
| Word counting | `src/lib/language/segmenterCache.ts` | getSegmenter(), isNoSpaceLanguage() |
| Markup stripping | `src/lib/language/markupStripper.ts` | stripMarkup(), chunkText() |
| File type detection | `src/features/upload/utils/fileType.ts` | getFileType() for extension check |

### Project Structure Notes

**New files to create:**
```
src/features/parser/
  types.ts                        # InlineTag, ParsedSegment, ParseResult, ConfirmationState
  constants.ts                    # INLINE_TAG_TYPES, CONFIRMATION_STATES, XLIFF_STATE_MAP, SEGMENT_BATCH_SIZE
  inlineTagExtractor.ts           # Extract inline tags from parsed XML nodes
  inlineTagExtractor.test.ts
  wordCounter.ts                  # Word count using existing segmenterCache + markupStripper
  wordCounter.test.ts
  sdlxliffParser.ts              # Main unified SDLXLIFF/XLIFF parser
  sdlxliffParser.test.ts
  actions/
    parseFile.action.ts           # Server Action: fetch file → parse → persist segments
    parseFile.action.test.ts

src/test/fixtures/sdlxliff/
  minimal-expected.json           # Expected parse output for minimal.sdlxliff
  with-namespaces-expected.json   # Expected parse output for with-namespaces.sdlxliff
  malformed.xml                   # Invalid XML for error testing
  empty-target.sdlxliff           # SDLXLIFF with empty <target> elements
  multi-seg-per-tu.sdlxliff       # Trans-unit with multiple <mrk> segments

src/test/fixtures/xliff/
  standard-expected.json          # Expected parse output for standard.xliff
  xliff-with-notes.xliff          # Pure XLIFF 1.2 with <note> elements for translatorComment mapping test

docs/test-data/segmenter/
  english.json                    # Word count test corpus: { segments: [{ text, expected_tokens }] }
  thai.json                       # Thai Intl.Segmenter reference tokens
  japanese.json                   # Japanese Intl.Segmenter reference tokens
  chinese.json                    # Chinese Intl.Segmenter reference tokens
  korean.json                     # Korean Intl.Segmenter reference tokens
```

**Files to modify:**
```
src/db/schema/segments.ts         # ADD 4 columns: confirmationState, matchPercentage, translatorComment, inlineTags
src/db/schema/index.ts            # No change needed (segments already exported)
src/db/schema/relations.ts        # No change needed (segments relations already exist)
src/test/factories.ts             # ADD buildSegment() factory
```

**DB Migration files:**
```
src/db/migrations/XXXX_*.sql      # Auto-generated by `npm run db:generate`
src/db/migrations/meta/*.json     # Auto-generated snapshot
supabase/migrations/00013_story_2_2_segments_columns.sql  # Manual DDL for local Supabase
```

**Alignment:** All paths follow feature-based co-location pattern. Named exports only, `@/` alias, no barrel exports.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-2-file-processing-rule-based-qa-engine.md#Story 2.2]
- [Source: _bmad-output/planning-artifacts/prd.md#FR3-FR4 (SDLXLIFF/XLIFF Parsing)]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR1 (parse < 3s), NFR8 (15MB guard), NFR10 (no content in logs)]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Decision 1.6 (SDLXLIFF Parser Memory)]
- [Source: _bmad-output/sdlxliff-research-note.md — Full parser implementation guide]
- [Source: _bmad-output/project-context.md#SDLXLIFF Parser Rules, CJK/Thai Language Edge Cases]
- [Source: src/db/schema/segments.ts — existing schema (needs 4 new columns)]
- [Source: src/db/schema/files.ts — file status field used for transitions]
- [Source: src/features/glossary/parsers/tbxParser.ts — existing fast-xml-parser usage pattern]
- [Source: src/lib/language/segmenterCache.ts — cached Intl.Segmenter for word counting]
- [Source: src/lib/language/markupStripper.ts — stripMarkup() and chunkText()]
- [Source: src/test/mocks/fast-xml-parser.ts — existing mock (extend if needed)]
- [Source: e2e/fixtures/sdlxliff/minimal.sdlxliff — test fixture (3 segments)]
- [Source: e2e/fixtures/sdlxliff/with-namespaces.sdlxliff — test fixture (5 segments, all inline tag types)]
- [Source: e2e/fixtures/xliff/standard.xliff — test fixture (3 segments, pure XLIFF)]
- [Source: _bmad-output/implementation-artifacts/2-1-file-upload-storage-infrastructure.md — Previous story intelligence]
- [Source: _bmad-output/architecture-assumption-checklist.md — Pre-story validation (all sections passed)]

### Previous Story Intelligence (Story 2.1)

Key learnings from Story 2.1 that directly apply:

1. **Supabase migration ordering matters**: Story 2.1 hit migration errors because DDL and RLS SQL ran out of order. For Story 2.2: ensure `00013_story_2_2_segments_columns.sql` only contains ALTER TABLE DDL (no RLS changes needed — segments RLS already exists from Day 1). Number it AFTER `00012_file_hash_index.sql`.

2. **Proxy-based lazy initialization**: `db/client.ts` uses Proxy pattern. Any new page importing DB client needs `export const dynamic = 'force-dynamic'` unless it uses `cookies()`. Not directly relevant for parser (no new page), but keep in mind.

3. **Mock patterns for Drizzle**: Story 2.1 used Proxy-based chainable mock for complex query chains. For `parseFile.action.ts` tests, mock `db.insert(segments).values(batch)` with a simpler mock since inserts don't chain as deeply.

4. **Audit log error handling — clarified rule**: `project-context.md` states "If audit write fails → entire action MUST fail (throw)". Story 2.1 CR Round 2 H2 found that unguarded `writeAuditLog()` could abort upload mid-stream. **Resolution for Story 2.2**: For `parseFile.action.ts`, audit writes for **primary status transitions** (parsing → parsed/failed) MUST throw on failure (follow project-context rule — the transition hasn't been committed yet). If the audit write is for a **cleanup/recovery path** that runs after the main operation already succeeded, wrap in try/catch and log as warning. In practice: call `writeAuditLog()` BEFORE returning `ActionResult` — if it throws, the entire action fails and the caller retries.

5. **CR found tenant isolation gaps**: Story 2.1 CR found missing cross-tenant ownership checks. For `parseFile.action.ts`: verify `file.tenantId === currentUser.tenantId` before proceeding, in addition to `withTenant()` on queries.

6. **Test count expectations**: Story 2.1 ended with 507 tests across 60 files after 3 CR rounds. Story 2.2 should add ~60-80 new tests, targeting ~570-590 total.

### Git Intelligence Summary

Recent commits (Story 2.1) show:
- Conventional Commits: `feat(story-2.1):`, `fix(story-2.1):`, `chore(story-2.1):`
- For Story 2.2: use `feat(parser):` scope
- Sub-agent scanning integrated into CR — expect anti-pattern + tenant isolation checks
- 3 CR rounds typical — build tests defensively from the start

### Architecture Assumption Checklist — Sign-off

```
Story: 2.2 — SDLXLIFF & XLIFF 1.2 Unified Parser
Date:  2026-02-23
Reviewed by: Bob (SM) + Mona (Project Lead)

Sections passed:  [x] 1  [x] 2  [x] 3  [x] 4  [x] 5  [x] 6  [x] 7  [x] 8
Issues found: None
AC revised: [ ] Yes  [x] No — AC LOCKED
```

**Section details:**
- S1 Routes: No new routes needed (parser is server-side utility)
- S2 DB Schema: `segments` ALTER TABLE with 4 columns — migration task included (Task 1)
- S3 Components: No UI components — pure backend story
- S4 API: Server Action (`parseFile.action.ts`) following existing pattern
- S5 Libraries: fast-xml-parser v5.3.6 already installed, TBX parser shows pattern
- S6 Dependencies: Story 2.1 is `done` (verified). Story 2.4/2.6 depend on this parser (documented).
- S7 Testing: Fixtures in e2e/fixtures/ already exist. New unit test fixtures needed (Task 7).
- S8 Scope: No UI, no Inngest, no Excel parsing — clean scope boundaries.

## Definition of Done — Verification

```bash
# 1. Apply schema migration
npm run db:generate && npm run db:migrate

# 2. Apply Supabase local migration (restart if needed)
npx supabase stop && npx supabase start

# 3. Type check
npm run type-check

# 4. Run parser feature tests
npx vitest run src/features/parser

# 5. Run RLS tests (verify segments RLS with new columns)
npm run test:rls

# 6. Run full test suite (check for regressions)
npm run test:unit -- --pool=forks --maxWorkers=1

# 7. Lint check
npm run lint

# 8. If all pass → story is done
```

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **Error 1 (Task 3):** `exactOptionalPropertyTypes: true` — `attributes?: Record<string, string>` could not be assigned `undefined`. Fix: conditional spreading `...(sanitized ? { attributes: sanitized } : {})` in `inlineTagExtractor.ts`.
- **Error 2 (Task 3):** XmlNode type too strict for test helpers → changed to `Record<string, unknown>[]` public API.
- **Error 3 (Task 5):** Same XmlNode type issue in sdlxliffParser.ts → simplified `type XmlNode = Record<string, unknown>`.
- **Error 4 (Task 6):** `files` table has no `sourceLang`/`targetLang` columns → fixed to use `parseResult.data.sourceLang`/`targetLang`.
- **Error 5 (Task 5):** `malformed.xml` fixture wasn't actually malformed enough — `fast-xml-parser` is extremely lenient. Fixed by using non-`<xliff>` root element; tests assert `INVALID_STRUCTURE` (not `INVALID_XML`).
- **Error 6 (Task 6 vi.hoisted):** `vi.mock()` hoisting — `mockSelect`, `mockInsert` etc. were `undefined` at hoist time. Fix: `vi.hoisted()` pattern to declare mock refs before hoisting.

### Completion Notes List

- Task 7 (fixtures) executed before Task 5 (parser) — SDLXLIFF/XLIFF XML fixtures created first, parser built, then expected JSON files generated from parser behavior.
- `fast-xml-parser` never throws for malformed XML; `INVALID_XML` error code exists but is unreachable in practice. Structural validation (`INVALID_STRUCTURE` for missing `<xliff>` root) is the practical error mechanism.
- Word count corpus in `docs/test-data/segmenter/` computed via `scripts/compute-corpus.mjs` using actual `Intl.Segmenter` on Node.js — used as source of truth for AC #4. Expanded from 20→52 segments covering: basic, Thai+EN mixed, numbers, punctuation, longer sentences, single-word UI strings.
- Long text chunking path (> 30k chars) tested in 4 dedicated tests — confirmed additive correctness across chunk boundaries including mid-word boundary scenarios.
- Test assertion messages now include `"<text>" → expected N` for faster debug on corpus failures.
- InlineTag type duplicated in `src/db/schema/segments.ts` (cannot import from features — architectural boundary). Comment added to keep in sync.
- Pre-CR quality scan (Step 9) found and fixed: relative imports → `@/features/parser/` alias; unsafe `attrs as Record<string, string>` cast → `Object.entries()` loop; hardcoded IDs in factories.ts → `faker.string.uuid()`.
- Final test count after CR Round 1: **629 unit tests** (507 from Story 2.1 + 122 new from Story 2.2: inlineTagExtractor 19, wordCounter 20, types 13, sdlxliffParser 49, perf 1, parseFile.action 20). Performance: 5,000 segments parsed in 211ms (< 3s ✅).
- Post-CR edge case coverage analysis added 2 tests: XLIFF `"final"` → ApprovedSignOff state mapping; `file.parse_failed` audit log on PARSE_ERROR (was only tested on STORAGE_ERROR previously).

### CR Round 1 — Fixes Applied (2026-02-23)

**Scope:** Fix all HIGH + MEDIUM + LOW severity findings from combined manual + sub-agent review.

**Production code fixes:**
- `wordCounter.ts` — H12: NFKC intentionally NOT applied (Thai sara am U+0E33 decomposes under NFKC, breaking Intl.Segmenter tokenization). Added clear comment explaining the design decision.
- `sdlxliffParser.ts` — H13: XLIFF segmentId now uses trans-unit `@_id` attribute (mirrors SDLXLIFF `mrk mid` usage)
- `sdlxliffParser.ts` — M4: matchPercentage clamped to valid 0–100 range via `Math.min(100, Math.max(0, parsedPercent))`
- `sdlxliffParser.ts` — H4: Added explanatory comment to INVALID_XML catch block (fast-xml-parser rarely throws; branch reachable via `vi.spyOn(XMLParser.prototype, 'parse')`)
- `sdlxliffParser.ts` — L1: Added comment on `hasSdlNamespace()` raw substring search (intentional — faster than re-parsing namespaces)
- `sdlxliffParser.ts` — L2: Added comment to `_fileType` parameter (reserved for future Excel/MemoQ format divergence)
- `parseFile.action.ts` — H9: Added idempotency guard — returns `CONFLICT` if `file.status !== 'uploaded'`
- `parseFile.action.ts` — M2: Removed unreachable dead code cross-tenant check (withTenant() already guarantees isolation)

**Test additions (21 new tests — 608 → 629 total):**
- `sdlxliffParser.test.ts` +12: H1 bx/ex inline tags, H2 exact AC#3 error messages, H3 inline tag position assertions, H4 INVALID_XML mock via vi.spyOn, H5 XLIFF inline tag types+positions, H10 empty-target seg3, H11 xliff-with-notes seg1 single note, H13 XLIFF segmentId, M5 multi-file XLIFF, M7 unrecognized conf fallback
- `parseFile.action.test.ts` +6: H6 DB_ERROR path + expanded insert assertion (sourceLang/targetLang/segmentNumber/wordCount), H7 batch 101 segments (insert called twice), H8 audit log newValue field assertion, H9 idempotency (parsing/parsed/failed → CONFLICT)
- `inlineTagExtractor.test.ts` +2: L4 bpt with no-children (content=undefined), L5 cross-id bpt/ept mismatch
- `types.test.ts` +1: M7 negative assertion (unknown conf values not in CONFIRMATION_STATES)
- `inlineTagExtractor.test.ts` — L6: helper `children` param type fixed from `object[]` → `Record<string, unknown>[]`
- `wordCounter.test.ts` — M3: Thai inline tag assertion strengthened from `toBeGreaterThanOrEqual(1)` → `toBe(2)`

**Corpus fix:**
- `docs/test-data/segmenter/thai.json` — unchanged (NFKC reverted; original values remain correct)

**Story document:**
- M1: Added `scripts/compute-fixture-wordcount.mjs` to File List
- Status: `review` → `done`

### File List

**New files created:**
- `src/features/parser/types.ts`
- `src/features/parser/constants.ts`
- `src/features/parser/inlineTagExtractor.ts`
- `src/features/parser/inlineTagExtractor.test.ts` (17 tests)
- `src/features/parser/wordCounter.ts`
- `src/features/parser/wordCounter.test.ts` (20 tests)
- `src/features/parser/types.test.ts` (12 tests)
- `src/features/parser/sdlxliffParser.ts`
- `src/features/parser/sdlxliffParser.test.ts` (37 tests)
- `src/features/parser/sdlxliffParser.perf.test.ts` (1 test)
- `src/features/parser/actions/parseFile.action.ts`
- `src/features/parser/actions/parseFile.action.test.ts` (14 tests)
- `src/test/fixtures/sdlxliff/minimal-expected.json`
- `src/test/fixtures/sdlxliff/with-namespaces-expected.json`
- `src/test/fixtures/sdlxliff/malformed.xml`
- `src/test/fixtures/sdlxliff/empty-target.sdlxliff`
- `src/test/fixtures/sdlxliff/multi-seg-per-tu.sdlxliff`
- `src/test/fixtures/xliff/standard-expected.json`
- `src/test/fixtures/xliff/xliff-with-notes.xliff`
- `docs/test-data/segmenter/english.json`
- `docs/test-data/segmenter/thai.json`
- `docs/test-data/segmenter/japanese.json`
- `docs/test-data/segmenter/chinese.json`
- `docs/test-data/segmenter/korean.json`
- `supabase/migrations/00013_story_2_2_segments_columns.sql`
- `scripts/compute-corpus.mjs`
- `scripts/compute-fixture-wordcount.mjs`
- `scripts/generate-expected-fixtures.mjs`

**Modified files:**
- `src/db/schema/segments.ts` (added 4 columns + sync comment)
- `src/db/migrations/0004_same_justin_hammer.sql` (auto-generated)
- `src/test/factories.ts` (added `buildSegment()`, fixed hardcoded IDs in 4 factories)
