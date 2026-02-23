# Story 2.3: Excel Bilingual Parser

Status: done

<!-- Validated: 2026-02-23 — validate-create-story applied 18 improvements (8C + 7E + 3O) -->

## Story

As a QA Reviewer,
I want to upload Excel bilingual files with configurable column mapping,
so that I can QA translations delivered in spreadsheet format.

## Acceptance Criteria

1. **Given** a QA Reviewer uploads an Excel (.xlsx) file
   **When** the system detects it is an Excel file
   **Then** a column mapping dialog appears showing the first 5 rows as preview
   **And** the user can select which column is Source and which is Target (FR5)
   **And** optional columns can be mapped: Segment ID, Context/Notes, Language

2. **Given** the column mapping is confirmed
   **When** the parser processes the Excel file
   **Then** rows are extracted as segments with source_text and target_text
   **And** empty rows (both source AND target empty) are skipped
   **And** segments are stored in the same segments table as XLIFF-parsed segments

3. **Given** an Excel file with 5,000 rows
   **When** parsing runs
   **Then** it completes within 3 seconds (NFR1)

4. **Given** an Excel file with no clear source/target columns
   **When** the mapping dialog is shown
   **Then** the system attempts to auto-detect by looking for header keywords (Source, Target, Original, Translation)
   **And** if auto-detection fails, the user must manually map columns before proceeding

5. **Given** the parsing completes successfully
   **When** I inspect the database
   **Then** the segments table contains: id, file_id, project_id, tenant_id, segment_number, source_text, target_text, source_lang, target_lang, word_count, created_at
   **And** XLIFF-specific columns (confirmation_state, match_percentage, translator_comment, inline_tags) are NULL for Excel segments
   **And** word count for CJK/Thai uses Intl.Segmenter token count (not space-split)

6. **Given** a malformed Excel file (corrupted .xlsx, password-protected, or non-xlsx binary)
   **When** parsing is attempted
   **Then** the parser returns a clear error: "Invalid Excel file — could not read spreadsheet"
   **And** the file status is set to "failed" with the error details

7. **Given** a file larger than 15MB is being parsed
   **When** the size guard is triggered
   **Then** the file is rejected with error: "File too large for processing (max 15MB)"

## Tasks / Subtasks

- [x] Task 1: Excel Parser Types & Validation Schemas (AC: #1, #4)
  - [x] 1.1 Update `src/features/parser/types.ts` — add `'xlsx'` to `ParseResult.fileType`, add Excel-specific error codes (`INVALID_EXCEL`, `INVALID_COLUMNS`, `EMPTY_SHEET`) to `ParserError.code`
  - [x] 1.2 Create `src/features/parser/validation/excelMappingSchema.ts` — Zod schema for `ExcelColumnMapping`: `sourceColumn` (string, required), `targetColumn` (string, required), `hasHeader` (boolean, default true), `segmentIdColumn` (string, optional), `contextColumn` (string, optional), `languageColumn` (string, optional). Add `.refine()` to ensure `sourceColumn !== targetColumn`.
  - [x] 1.3 Update `src/features/parser/constants.ts` — add `EXCEL_PREVIEW_ROWS = 5`, `EXCEL_AUTO_DETECT_KEYWORDS` (source/target keyword lists including Thai equivalents: ต้นฉบับ, คำแปล)
  - [x] 1.4 Unit tests for schema validation + auto-detect keywords — **15 tests ✅**

- [x] Task 2: Excel Parser Core Function (AC: #2, #3, #5, #6, #7)
  - [x] 2.1 Create `src/features/parser/excelParser.ts` — `import 'server-only'` at top. Main function: `parseExcelBilingual(buffer: ArrayBuffer, mapping: ExcelColumnMapping, fileSizeBytes: number, sourceLang: string, targetLang: string): ParseOutcome`
  - [x] 2.2 15MB size guard (defense-in-depth, same as XLIFF parser)
  - [x] 2.3 Load Excel via `ExcelJS.Workbook.xlsx.load(Buffer.from(new Uint8Array(buffer)))` — follow glossary excelParser pattern
  - [x] 2.4 Column resolution: if `hasHeader=true` → scan row 1 headers (case-insensitive match); if `hasHeader=false` → use numeric column indices
  - [x] 2.5 Row iteration: start from row 2 (if header) or row 1 (if no header). Skip BOTH-empty rows, include empty-target rows, extract optional segmentId/context, count words via `countWords()`, build `ParsedSegment` with XLIFF-specific fields = null
  - [x] 2.6 Handle Excel cell types: string, number, date, null/undefined, rich text objects
  - [x] 2.7 Error handling: corrupted → `INVALID_EXCEL`; no worksheet → `EMPTY_SHEET`; columns not found → `INVALID_COLUMNS`
  - [x] 2.8 Unit tests — **41 tests ✅** (valid parse, column mapping by header/index, empty rows, cell types, error cases, 15MB guard, single row E5, Thai/CJK E4, password-protected E1, multi-sheet E2, merged cells E3, 5000-row performance E6 (<200ms ✅), C7 same-column rejection, C1 languageColumn override, + C2 EMPTY_SHEET, M1/M4/M5 assertion quality fixes)

- [x] Task 3: Excel Preview Server Action (AC: #1, #4)
  - [x] 3.1 Create `src/features/parser/actions/previewExcelColumns.action.ts`
  - [x] 3.2 Auth check (requireRole), tenant isolation (withTenant), file ownership verification
  - [x] 3.3 Auto-detect logic: scan header row for keywords matching `EXCEL_AUTO_DETECT_KEYWORDS`
  - [x] 3.4 Return type: `ActionResult<ExcelPreview>` where `ExcelPreview = { headers, previewRows, suggestedSourceColumn, suggestedTargetColumn, totalRows, columnCount }`
  - [x] 3.5 Unit tests — **15 tests ✅** (auth failure, NOT_FOUND, INVALID_INPUT, STORAGE_ERROR download, STORAGE_ERROR arrayBuffer E7, preview with real fixture, auto-detect Source/Target, auto-detect Original/Translation, null suggestions, PARSE_ERROR malformed, tenant isolation, + C3 UUID validation ×2, H1 no-worksheets, M2 exact previewRows count)

- [x] Task 4: Update parseFile Action for Excel Routing (AC: #2, #5)
  - [x] 4.1 Update `src/features/parser/actions/parseFile.action.ts` — accept optional `columnMapping?: ExcelColumnMapping` parameter
  - [x] 4.2 Add Excel branch: xlsx → validate columnMapping exists → read ArrayBuffer → call `parseExcelBilingual()`
  - [x] 4.3 Language sourcing: fetch project record; use `project.sourceLang` + `project.targetLangs[0]` as default
  - [x] 4.4 Existing XLIFF path unchanged
  - [x] 4.5 Unit tests — **48 tests ✅** (31 original + 10 Excel branch + 7 CR fixes — C3 UUID validation ×3, H2 project NOT_FOUND ×2, M3 per-row targetLang insert, L5 empty targetLangs fallback)

- [x] Task 5: Column Mapping Dialog Component (AC: #1, #4)
  - [x] 5.1 Create `src/features/upload/components/ColumnMappingDialog.tsx` — `"use client"` component using shadcn/ui Dialog + Select + Table + Checkbox
  - [x] 5.2–5.9 Preview table, required Source/Target selects, auto-detect pre-selection, "✓ auto" badge (O2), "Only the first sheet" info (E2), Confirm & Parse button, Cancel (no file delete)
  - [x] 5.10 Component tests — **15 tests ✅** (10 original + 5 CR fixes — H3 preview failure, H4 same-column guard, M7 isParsing state, M8/H6 hasHeader toggle reset, L1 cancel during parse)

- [x] Task 6: Upload Flow Integration (AC: #1)
  - [x] 6.1 Update `src/features/upload/components/UploadPageClient.tsx` — derive `pendingExcelFile` during render (React-recommended pattern, avoids setState-in-effect)
  - [x] 6.2 XLIFF/SDLXLIFF behavior unchanged
  - [x] 6.3 State: `dismissedFileIds` Set tracks confirmed/cancelled dialogs; `pendingExcelFile` derived via `uploadedFiles.find()`
  - [x] 6.4 Component tests — **8 tests ✅** (xlsx shows dialog 6.1, sdlxliff does not 6.2 + H5 dismissal after confirm/cancel ×2, M6 toast.success verification, + 3 original batch tests)

- [x] Task 7: Excel Test Fixtures (AC: all)
  - [x] 7.1–7.12 All 12 fixture files generated in `src/test/fixtures/excel/` and `e2e/fixtures/excel/`
  - [x] 7.13 Fixture generation script `scripts/generate-excel-fixtures.mjs` ✅

- [x] Task 8: Factory Updates
  - [x] 8.1 `buildExcelColumnMapping()` with explicit `ExcelColumnMapping` return type
  - [x] 8.2 `buildFile()` updated to support `fileType: 'xlsx'` with correct extension
  - [x] 8.3 `buildExcelPreview()` with explicit `ExcelPreview` return type

- [x] Task 9: Integration Testing & Regression Check
  - [x] 9.1 764 tests passed (0 regressions — CR Round 1 adds 20 new tests: C1-C3, H1-H7, M1-M8, L1, L5)
  - [x] 9.2 `npm run type-check` — 0 errors
  - [x] 9.3 `npm run lint` — 0 errors, 0 warnings
  - [x] 9.4 `fileType.test.ts` already exists with 9 tests covering all required cases ✅
  - [x] 9.5 **109 new tests total** (89 original + 20 CR Round 1 fixes) ✅

## Dev Notes

### Key Gotchas — Read Before Starting

1. **ExcelJS is ALREADY installed (v4.4.0)**: Do NOT add any new Excel library. ExcelJS is proven in this project via `src/features/glossary/parsers/excelParser.ts` — follow that pattern for buffer loading and row iteration.

2. **NO DB migration needed**: The `segments` table already has all required columns. Excel segments use NULL for XLIFF-specific columns (`confirmationState`, `matchPercentage`, `translatorComment`, `inlineTags`). These are all nullable. [Source: src/db/schema/segments.ts]

3. **File type detection ALREADY supports xlsx**: `src/features/upload/utils/fileType.ts` returns `'xlsx'` for `.xlsx` extension, and `src/features/upload/constants.ts` includes xlsx in `ALLOWED_FILE_TYPES`. No changes needed to upload infrastructure.

4. **Column mapping is a PARAMETER, not DB-persisted**: Pass `ExcelColumnMapping` as a parameter to `parseFile(fileId, columnMapping?)`. For XLIFF/SDLXLIFF files, this parameter is undefined/ignored. This avoids a new table and keeps the design simple. If re-mapping is needed, user calls preview + parse again (file stays in 'uploaded' status).

5. **Language comes from PROJECT, not from Excel file**: Excel files have no embedded language metadata. Source and target languages MUST be fetched from the project configuration. **IMPORTANT:** `projects.targetLangs` is a `jsonb string[]` (array), NOT a singular field. Use `project.sourceLang` for source, and `project.targetLangs[0]` for primary target (or allow user selection via optional Language column mapping if the project has multiple target languages). The `parseFile` action must query the project record for Excel files. **Alternatively**, if the user maps the optional "Language" column, use that per-row value instead of project config.

6. **Word counting REUSES existing utilities**: `src/features/parser/wordCounter.ts` (from Story 2.2) already handles CJK/Thai via `Intl.Segmenter`. Import and use `countWords(text, locale)` directly. Do NOT create a new word counter.

7. **NFKC normalization — same rules as Story 2.2**: Do NOT normalize before `Intl.Segmenter` word counting (breaks Thai sara am U+0E33). DO normalize before text comparison if needed. For Excel parsing: normalize cell values for display/storage but NOT before word counting.

8. **ExcelJS buffer loading pattern**: Use `Buffer.from(new Uint8Array(buffer)) as never` — the `as never` cast is needed because ExcelJS types expect `Buffer` but we pass from `ArrayBuffer`. This is an established pattern in `src/features/glossary/parsers/excelParser.ts`.

9. **ExcelJS cell value types**: Cell values can be: `string`, `number`, `Date`, `{ richText: [...] }`, `{ formula, result }`, `boolean`, `{ error }`, or `null`. Always convert via `String(cell.value ?? '')` and trim. Rich text objects need special handling: `cell.value.richText.map(r => r.text).join('')`.

10. **Dialog is a Client Component inside the upload flow**: The `ColumnMappingDialog` is a `"use client"` component. It receives preview data from a Server Action call and submits mapping back via another Server Action. This fits the existing RSC boundary pattern.

11. **Empty target = valid (empty string, NOT null)**: Same as XLIFF parser — when a row has source text but empty target, store `targetText = ""` (the column is `text NOT NULL`). This represents an untranslated segment.

12. **Auto-detect keywords should be flexible**: Include common keywords in EN + TH:
    - Source: `source`, `original`, `src`, `english`, `ต้นฉบับ`, `ภาษาต้นทาง`
    - Target: `target`, `translation`, `tgt`, `translated`, `คำแปล`, `ภาษาปลายทาง`
    - Match is case-insensitive substring (not exact match).

13. **Preview action reads ONLY first N rows**: The `previewExcelColumns` action downloads the full file from Storage but only reads `EXCEL_PREVIEW_ROWS` rows. This is acceptable for files up to 15MB (already guarded). For very large files, ExcelJS loads the full workbook — streaming reader is NOT needed at MVP scale.

14. **NO Inngest integration in Story 2.3**: Same as Story 2.2 — the parser is invoked via Server Action. Inngest pipeline wiring belongs to Story 2.6.

15. **Cancel on dialog does NOT delete the file**: If user cancels the column mapping dialog, the uploaded file stays in `status='uploaded'`. User can re-open the dialog later to map columns and parse. This is important for UX — don't force re-upload.

16. **Segment ID generation for Excel**: If the optional Segment ID column is mapped and has a value, use it as `segmentId`. If not mapped or cell is empty, generate `segmentId = String(rowNumber)` (e.g., "2", "3", "4" — row numbers from the Excel file). This preserves traceability back to the original spreadsheet. **IMPORTANT:** `segmentId` is used only in `ParsedSegment` but is NOT persisted to the DB — there is no `segment_id` column in the `segments` table. It is a transient identifier used during parsing for traceability/logging. `segmentNumber` (1-based sequence) IS persisted and is the permanent segment identifier.

17. **Password-protected Excel handling (E1)**: ExcelJS throws a specific error when trying to load a password-protected `.xlsx` file. Catch this and return `INVALID_EXCEL` with a user-friendly message: "Cannot read password-protected Excel files. Please remove the password and re-upload." Do NOT try to prompt for a password.

18. **Multi-sheet limitation (E2)**: ExcelJS supports multiple worksheets, but for MVP we parse **only the first worksheet** (`workbook.getWorksheet(1)`). If the workbook has multiple sheets, log a warning but proceed with sheet 1. Document this limitation in the dialog UI (tooltip or small text: "Only the first sheet will be parsed").

19. **Merged cells handling (E3)**: ExcelJS reports merged cells with the value only in the top-left cell — other cells in the merge range return `null`. The parser should treat these as empty strings. Do NOT attempt to "un-merge" or propagate values. If a merged cell spans the source/target column, the affected rows will have empty values (which is correct behavior — skip if both empty).

20. **`blob.arrayBuffer()` error handling (E7)**: Same pattern as Story 2.2 CR finding for `blob.text()` — wrap `blob.arrayBuffer()` in try/catch and call `markFileFailed()` on failure. This is defense-in-depth for Storage download edge cases.

21. **CAS race condition tests (C8)**: Story 2.2 CR Round 2 found a CAS race condition gap. For Story 2.3, include at least one test verifying that when `file.status !== 'uploaded'`, the Excel parse path returns CONFLICT. Also verify that the CAS `WHERE status='uploaded'` atomically prevents concurrent parse calls — same pattern as XLIFF, but test it explicitly for the Excel branch.

---

### Critical Architecture Patterns & Constraints

#### Excel Parser Function Signature

```typescript
// src/features/parser/excelParser.ts
import 'server-only'

import type { ExcelColumnMapping } from '@/features/parser/validation/excelMappingSchema'
import type { ParseOutcome } from '@/features/parser/types'

export async function parseExcelBilingual(
  buffer: ArrayBuffer,
  mapping: ExcelColumnMapping,
  fileSizeBytes: number,
  sourceLang: string,
  targetLang: string,
): Promise<ParseOutcome>
```

**Key difference from XLIFF parser**: This is `async` (ExcelJS `workbook.xlsx.load()` is async) while `parseXliff()` is synchronous.

#### Excel Column Mapping Schema

```typescript
// src/features/parser/validation/excelMappingSchema.ts
import { z } from 'zod'

export const excelColumnMappingSchema = z.object({
  sourceColumn: z.string().min(1, 'Source column is required'),
  targetColumn: z.string().min(1, 'Target column is required'),
  hasHeader: z.boolean().default(true),
  segmentIdColumn: z.string().optional(),
  contextColumn: z.string().optional(),
  languageColumn: z.string().optional(), // C1: optional Language column from Epic AC
}).refine(
  (data) => data.sourceColumn !== data.targetColumn,
  { message: 'Source and Target columns must be different', path: ['targetColumn'] },
) // C7: prevent same-column selection

export type ExcelColumnMapping = z.infer<typeof excelColumnMappingSchema>
```

#### Auto-Detect Logic

```typescript
const EXCEL_AUTO_DETECT_KEYWORDS = {
  source: ['source', 'original', 'src', 'english', 'ต้นฉบับ', 'ภาษาต้นทาง'],
  target: ['target', 'translation', 'tgt', 'translated', 'คำแปล', 'ภาษาปลายทาง'],
} as const

// Match: case-insensitive, trimmed, fuzzy substring match (O1)
// e.g., "Source Text" matches keyword "source", " TRANSLATION " matches keyword "translation"
function autoDetectColumns(headers: string[]): {
  suggestedSourceColumn: string | null
  suggestedTargetColumn: string | null
} {
  const normalized = headers.map(h => h.toLowerCase().trim())
  // For each keyword list, find first header that INCLUDES (substring) any keyword
  // Fuzzy: strip non-alphanumeric, compare normalized substrings
  // Return null if no match or if same column matches both (ambiguous)
  // Prefer exact match over substring match when multiple candidates found
}
```

#### Preview Action Return Type

```typescript
type ExcelPreview = {
  headers: string[]           // Column headers (row 1) or column letters if no header
  previewRows: string[][]     // First 5 data rows (after header if hasHeader=true)
  suggestedSourceColumn: string | null  // Auto-detected source column name/letter
  suggestedTargetColumn: string | null  // Auto-detected target column name/letter
  totalRows: number           // Total row count (excluding header)
  columnCount: number         // Number of columns with data
}
```

#### Updated parseFile Action Flow (with Excel branch)

```
parseFile(fileId, columnMapping?)
  ↓
1-3. [Unchanged: auth, tenant check, idempotency, CAS]
  ↓
4. Download file from Supabase Storage
  ↓
5. Branch by fileType:
   ├── 'sdlxliff' | 'xliff':
   │   - Read blob as text (xmlContent = await blob.text())
   │   - Call parseXliff(xmlContent, fileType, fileSizeBytes)
   │   - sourceLang/targetLang from parse result
   │
   └── 'xlsx':
       - Validate columnMapping exists (required) → if missing: INVALID_INPUT error
       - Read blob as ArrayBuffer (buffer = await blob.arrayBuffer()) — wrap in try/catch (E7)
       - Fetch project record for sourceLang + targetLangs (array!)
       - Resolve targetLang: if languageColumn mapped → use per-row value; else → targetLangs[0]
       - Call parseExcelBilingual(buffer, columnMapping, fileSizeBytes, sourceLang, targetLang)
       - sourceLang/targetLang from project config (or language column override)
  ↓
6. [Unchanged: batchInsertSegments, update status, audit log]
```

#### ColumnMappingDialog Component Structure

```
┌──────────────────────────────────────────────────────────┐
│  Column Mapping — {fileName}                         [X] │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ☑ First row is header                                   │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  #  │  Column A  │  Column B  │  Column C  │  ...  │  │
│  │─────│───────────│───────────│───────────│──────────│  │
│  │  1  │  Hello    │  สวัสดี    │  TU-001   │         │  │
│  │  2  │  Goodbye  │  ลาก่อน    │  TU-002   │         │  │
│  │  3  │  Thank you│  ขอบคุณ    │  TU-003   │         │  │
│  │  4  │  Yes      │  ใช่       │  TU-004   │         │  │
│  │  5  │  No       │  ไม่       │  TU-005   │         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Source Column *    [  Column A (Source)     ▾  ]  ✓ auto │
│  Target Column *    [  Column B (Translation) ▾ ]  ✓ auto │
│  Segment ID         [  Column C              ▾  ]  opt   │
│  Context/Notes      [  — None —              ▾  ]  opt   │
│  Language           [  — None —              ▾  ]  opt   │
│                                                          │
│  ℹ Only the first sheet will be parsed.                   │
│                                                          │
│               [ Cancel ]    [ Confirm & Parse ]          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**States:**
- **Loading**: Skeleton table while preview loads
- **Ready**: Table + selects populated, auto-detect applied
- **Parsing**: "Confirm & Parse" shows spinner, selects disabled
- **Error**: Toast via sonner if parse fails

#### Cell Value Extraction Helper

```typescript
function extractCellValue(cell: ExcelJS.Cell): string {
  const value = cell.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  // Rich text: { richText: [{ text: string }] }
  if (typeof value === 'object' && 'richText' in value) {
    return (value as { richText: Array<{ text: string }> }).richText
      .map(r => r.text)
      .join('')
  }
  // Formula: { formula, result }
  if (typeof value === 'object' && 'result' in value) {
    return String((value as { result: unknown }).result ?? '')
  }
  return String(value)
}
```

#### Testing Standards

- `vi.mock('server-only', () => ({}))` FIRST in every server-side test file
- `vi.mock('exceljs', ...)` — mock ExcelJS Workbook for unit tests. **ExcelJS mock pattern (E4):**
  ```typescript
  vi.mock('exceljs', () => {
    const mockWorksheet = {
      rowCount: 10,
      getRow: vi.fn((n: number) => ({
        getCell: vi.fn((col: number) => ({ value: `row${n}-col${col}` })),
        eachCell: vi.fn(),
      })),
      eachRow: vi.fn(),
    }
    const mockWorkbook = {
      xlsx: { load: vi.fn().mockResolvedValue(undefined) },
      getWorksheet: vi.fn().mockReturnValue(mockWorksheet),
    }
    return { default: { Workbook: vi.fn(() => mockWorkbook) } }
  })
  ```
- Create REAL `.xlsx` fixtures via `scripts/generate-excel-fixtures.mjs` using ExcelJS
- Use factory functions for all test data (`buildExcelColumnMapping()`, `buildExcelPreview()`)
- Test naming: `describe("excelParser")` → `it("should extract 10 segments from bilingual fixture")`
- **Boundary value tests (E5):** Include: 0 rows (empty sheet), 1 row (single segment), 5000 rows (NFR1 performance), max columns (256), single column file
- **Performance benchmark test (E6):** Add `it("should parse 5000-row Excel within 3 seconds")` — generate 5000-row fixture in `generate-excel-fixtures.mjs`, measure elapsed time with `performance.now()`
- **CAS race condition tests (C8):** At least 1 test: when `file.status !== 'uploaded'`, Excel parse path returns CONFLICT. Verify CAS atomicity for concurrent calls.
- **`blob.arrayBuffer()` error test (E7):** Test that `blob.arrayBuffer()` failure calls `markFileFailed()` and returns STORAGE_ERROR
- **Target: ~80-95 new tests total** for this story (increased from 70-85 to cover boundary/perf/race tests)

#### Security Checklist

| Check | Implementation |
|-------|---------------|
| Auth required | `requireRole('qa_reviewer', 'write')` at start of both actions |
| Tenant isolation | `withTenant()` on ALL queries (file lookup, project lookup, segment insert) |
| File size limit | 15MB guard before parse (defense-in-depth) |
| No content in logs | Only log metadata (fileName, fileId, segmentCount, error) |
| Audit trail | `writeAuditLog()` for every status transition |
| Cross-tenant file guard | Verify file.tenantId matches current user before parsing |
| Input validation | Zod validation on ExcelColumnMapping before processing |

#### Existing Patterns to Follow

| Pattern | Reference File | What to Copy |
|---------|---------------|-------------|
| Excel buffer loading | `src/features/glossary/parsers/excelParser.ts` | Workbook.xlsx.load(), eachRow, getCell |
| Parser types | `src/features/parser/types.ts` | ParsedSegment, ParseOutcome |
| Server Action with auth + audit | `src/features/parser/actions/parseFile.action.ts` | requireRole → validate → parse → batch insert → audit |
| Word counting | `src/features/parser/wordCounter.ts` | countWords(text, locale) |
| Zod validation schema | `src/features/glossary/validation/glossarySchemas.ts` | columnMappingSchema pattern |
| Dialog component | `src/features/upload/components/DuplicateDetectionDialog.tsx` | shadcn Dialog pattern in upload flow |
| withTenant helper | `src/db/helpers/withTenant.ts` | Apply to every query |
| Test factories | `src/test/factories.ts` | buildSegment(), buildFile() pattern |
| Audit log | `src/features/audit/actions/writeAuditLog.ts` | writeAuditLog({ entityType, action, ... }) |
| File type detection | `src/features/upload/utils/fileType.ts` | getFileType() — already handles xlsx |

### Project Structure Notes

**New files to create:**
```
src/features/parser/
  excelParser.ts                          # Main Excel bilingual parser
  excelParser.test.ts                     # Unit tests (25-30 tests)
  validation/
    excelMappingSchema.ts                 # Zod schema for ExcelColumnMapping
    excelMappingSchema.test.ts            # Schema validation tests
  actions/
    previewExcelColumns.action.ts         # Server Action: preview first 5 rows + auto-detect
    previewExcelColumns.action.test.ts    # Unit tests (10-12 tests)

src/features/upload/components/
  ColumnMappingDialog.tsx                 # Client Component: column selection UI
  ColumnMappingDialog.test.tsx            # Component tests (8-10 tests)

src/test/fixtures/excel/
  bilingual-with-headers.xlsx             # Standard fixture (10 rows, EN→TH)
  bilingual-no-headers.xlsx               # No header row
  bilingual-auto-detect.xlsx              # "Original" / "Translation" headers
  empty-rows.xlsx                         # Rows with gaps
  single-row.xlsx                         # Header + 1 data row
  cjk-thai-content.xlsx                   # Thai/CJK text for word count
  malformed.xlsx                          # Corrupted binary for error testing
  password-protected.xlsx                 # Password-protected file (E1)
  multiple-sheets.xlsx                    # Multi-sheet workbook (E2)
  merged-cells.xlsx                       # Merged cells in columns (E3)
  large-5000-rows.xlsx                    # 5000-row performance fixture (E6)

e2e/fixtures/excel/
  bilingual-sample.xlsx                   # E2E test fixture

scripts/
  generate-excel-fixtures.mjs            # Fixture generation script
```

**Files to modify:**
```
src/features/parser/types.ts              # Add 'xlsx' to ParseResult.fileType, add Excel error codes
src/features/parser/constants.ts          # Add EXCEL_PREVIEW_ROWS, EXCEL_AUTO_DETECT_KEYWORDS
src/features/parser/actions/parseFile.action.ts  # Add Excel routing + columnMapping parameter
src/features/parser/actions/parseFile.action.test.ts  # Add Excel-specific tests
src/features/upload/components/UploadPageClient.tsx   # Trigger ColumnMappingDialog for xlsx
src/features/upload/components/UploadPageClient.test.tsx  # Update tests
src/test/factories.ts                     # Add buildExcelColumnMapping(), buildExcelPreview()
src/features/upload/utils/fileType.ts     # Add unit tests (O3) — create fileType.test.ts
```

**No DB migrations needed.**

**Alignment:** All paths follow feature-based co-location pattern. Named exports only, `@/` alias, no barrel exports.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-2-file-processing-rule-based-qa-engine.md#Story 2.3]
- [Source: _bmad-output/planning-artifacts/prd.md#FR5 (Excel bilingual parsing with configurable column mapping)]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR1 (parse < 3s), NFR8 (15MB guard)]
- [Source: _bmad-output/planning-artifacts/architecture/core-architectural-decisions.md#Decision 1.6 (Parser Memory Strategy)]
- [Source: _bmad-output/project-context.md#CJK/Thai Language Edge Cases, Testing Rules]
- [Source: src/features/glossary/parsers/excelParser.ts — existing ExcelJS usage pattern]
- [Source: src/features/parser/types.ts — ParsedSegment, ParseOutcome types]
- [Source: src/features/parser/wordCounter.ts — countWords() reusable utility]
- [Source: src/features/parser/actions/parseFile.action.ts — Server Action pattern to extend]
- [Source: src/features/upload/utils/fileType.ts — already handles xlsx detection]
- [Source: src/features/upload/constants.ts — ALLOWED_FILE_TYPES includes xlsx]
- [Source: src/features/upload/components/DuplicateDetectionDialog.tsx — Dialog pattern in upload flow]
- [Source: src/db/schema/segments.ts — segments table (all columns exist, no migration needed)]
- [Source: src/db/schema/files.ts — fileType supports 'xlsx']
- [Source: _bmad-output/implementation-artifacts/2-2-sdlxliff-xliff-unified-parser.md — Previous story intelligence]
- [Source: _bmad-output/architecture-assumption-checklist.md — Pre-story validation]

### Previous Story Intelligence (Story 2.2)

Key learnings from Story 2.2 that directly apply:

1. **Parser is a PURE FUNCTION, NOT a Route Handler**: Same as Story 2.2 — the Excel parser is a server-side utility called by the `parseFile.action.ts` Server Action. No new API routes needed.

2. **Audit log error handling — established pattern**: Story 2.2 CR Round 2 finalized the rule: audit writes for primary status transitions MUST throw on failure. For error recovery paths, wrap in try/catch. The `markFileFailed()` helper in `parseFile.action.ts` already implements this correctly — reuse it for Excel errors.

3. **Idempotency guard**: `parseFile.action.ts` already has CAS (Compare-And-Swap) to prevent concurrent parse calls on the same file. This works unchanged for Excel files.

4. **Mock patterns**: Story 2.2 used `vi.hoisted()` pattern for mock refs. Story 2.2 CR found the `vi.fn(() => ...)` empty tuple issue — use `vi.fn((..._args: unknown[]) => ...)` for mocks whose `.calls` are accessed.

5. **Test count expectations**: Story 2.2 ended with 655 total tests. Story 2.3 should add ~80-95 new tests, targeting ~735-750 total.

6. **Word counter is proven**: `countWords()` from `wordCounter.ts` already handles CJK/Thai/English correctly with 20+ tests. Import and use directly — do NOT reimplement.

7. **ExcelJS mock pattern from glossary**: `src/features/glossary/parsers/excelParser.ts` shows the exact pattern for loading `.xlsx` buffers. Follow it for consistency.

8. **`Buffer.from(new Uint8Array(buffer)) as never` cast**: ExcelJS types are not perfectly aligned with ArrayBuffer — this established cast pattern works correctly in production. Don't try to fix the type mismatch differently.

### Git Intelligence Summary

Recent commits (Story 2.2) show:
- Conventional Commits: `feat(story-2.2):`, `fix(story-2.2):`
- For Story 2.3: use `feat(parser):` or `feat(story-2.3):` scope
- 2 CR rounds on Story 2.2 — anticipate similar rigor
- Sub-agent scanning (anti-pattern + tenant isolation) integrated into CR

### Architecture Assumption Checklist — Sign-off

```
Story: 2.3 — Excel Bilingual Parser
Date:  2026-02-23
Reviewed by: Bob (SM) + Mona (Project Lead)

Sections passed:  [x] 1  [x] 2  [x] 3  [x] 4  [x] 5  [x] 6  [x] 7  [x] 8
Issues found: None
AC revised: [ ] Yes  [x] No — AC LOCKED
```

**Section details:**
- S1 Routes: No new routes needed (dialog is component inside existing upload page)
- S2 DB Schema: No migration needed — segments table already supports Excel (nullable XLIFF fields)
- S3 Components: Dialog, Select, Table all installed in shadcn/ui. Client Component boundary correct.
- S4 API: Two Server Actions (previewExcelColumns + updated parseFile). ActionResult pattern used.
- S5 Libraries: ExcelJS v4.4.0 already installed, glossary parser shows pattern.
- S6 Dependencies: Story 2.1 (upload) = done, Story 2.2 (parser) = done. Story 2.4 depends on this.
- S7 Testing: Excel fixtures needed (Task 7). No RLS test changes (no schema change).
- S8 Scope: UI (ColumnMappingDialog) IS in scope per AC. No Inngest. No rule engine.

## Definition of Done — Verification

```bash
# 1. No DB migration needed — verify existing schema supports Excel
npm run type-check

# 2. Generate Excel test fixtures
node scripts/generate-excel-fixtures.mjs

# 3. Run parser feature tests (including new Excel tests)
npx vitest run src/features/parser

# 4. Run upload feature tests (including ColumnMappingDialog)
npx vitest run src/features/upload

# 5. Run full test suite (check for regressions)
npm run test:unit -- --pool=forks --maxWorkers=1

# 6. Lint check
npm run lint

# 7. Type check
npm run type-check

# 8. If all pass → story is done
```

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Session transcript: `.claude/projects/C--Users-Jiraw-OneDrive-Documents-qa-localization-tool/b82e671b-d371-4b43-af43-88604aa8e95b.jsonl`

### Completion Notes List

1. **Task ordering adjustment**: Task 7 (fixtures) was partially executed before Task 2 to unblock the E6 performance test — `generate-excel-fixtures.mjs` and `large-5000-rows.xlsx` were created first. All remaining fixtures generated as part of Task 7.

2. **Performance result**: E6 test clocked 200ms for 5000 rows (well under 3s NFR1).

3. **`as never` cast kept as-is**: ExcelJS's type system requires `Buffer.from(new Uint8Array(buffer)) as never` — documented in Dev Notes #8 as established project pattern. Anti-pattern scan flagged as MEDIUM but accepted given the documented rationale.

4. **UploadPageClient refactor**: Replaced `useEffect + setState` pattern with derived-state-during-render pattern (React Compiler compatible). Removed `useRef` handledFileIds and replaced with `dismissedFileIds: Set<string>` state. All 6 tests still pass.

5. **LOW violations from anti-pattern scan** (deferred to future CR):
   - `parseFile.action.ts` try-catch structure: acceptable for Server Action context (not Inngest step)
   - `markFileFailed()` error swallowing: acceptable defense-in-depth pattern from Story 2.2

6. **Tenant isolation scan**: PASS — both new Server Actions verified clean by tenant-isolation-checker agent.

### File List

**New files created:**
- `src/features/parser/excelParser.ts`
- `src/features/parser/excelParser.test.ts`
- `src/features/parser/validation/excelMappingSchema.ts`
- `src/features/parser/validation/excelMappingSchema.test.ts`
- `src/features/parser/actions/previewExcelColumns.action.ts`
- `src/features/parser/actions/previewExcelColumns.action.test.ts`
- `src/features/upload/components/ColumnMappingDialog.tsx`
- `src/features/upload/components/ColumnMappingDialog.test.tsx`
- `src/test/fixtures/excel/bilingual-with-headers.xlsx`
- `src/test/fixtures/excel/bilingual-no-headers.xlsx`
- `src/test/fixtures/excel/bilingual-auto-detect.xlsx`
- `src/test/fixtures/excel/empty-rows.xlsx`
- `src/test/fixtures/excel/single-row.xlsx`
- `src/test/fixtures/excel/cjk-thai-content.xlsx`
- `src/test/fixtures/excel/malformed.xlsx`
- `src/test/fixtures/excel/password-protected.xlsx`
- `src/test/fixtures/excel/multiple-sheets.xlsx`
- `src/test/fixtures/excel/merged-cells.xlsx`
- `src/test/fixtures/excel/large-5000-rows.xlsx`
- `e2e/fixtures/excel/bilingual-sample.xlsx`
- `scripts/generate-excel-fixtures.mjs`

**Modified files:**
- `src/features/parser/types.ts` — added 'xlsx' + 3 Excel error codes
- `src/features/parser/constants.ts` — added EXCEL_PREVIEW_ROWS, EXCEL_AUTO_DETECT_KEYWORDS
- `src/features/parser/actions/parseFile.action.ts` — Excel branch + columnMapping param + C1 fix (seg.targetLang) + C3 UUID validation + H7 transaction
- `src/features/parser/actions/parseFile.action.test.ts` — 48 tests (CR R1: +7)
- `src/features/parser/actions/previewExcelColumns.action.ts` — C3 UUID validation
- `src/features/parser/actions/previewExcelColumns.action.test.ts` — 15 tests (CR R1: +4)
- `src/features/parser/excelParser.test.ts` — 41 tests (CR R1: +2 C2 + M1/M4/M5 fixes)
- `src/features/upload/components/ColumnMappingDialog.tsx` — H6 hasHeader reset fix
- `src/features/upload/components/ColumnMappingDialog.test.tsx` — 15 tests (CR R1: +5)
- `src/features/upload/components/UploadPageClient.tsx` — derived-state dialog integration
- `src/features/upload/components/UploadPageClient.test.tsx` — 8 tests (CR R1: +2)
- `src/test/factories.ts` — buildExcelColumnMapping(), buildExcelPreview(), buildFile() xlsx support
- `src/test/fixtures/excel/empty-sheet.xlsx` — new fixture for C2/EMPTY_SHEET test
- `src/test/fixtures/excel/no-worksheets.xlsx` — new fixture for H1 test
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 2-3 → done

### Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-02-23 | 1.0.0 | Initial implementation — Tasks 1-9 complete, 744 tests passing, 0 lint errors | claude-sonnet-4-6 |
| 2026-02-23 | 1.1.0 | CR Round 1 — Fix All (C+H+M+L): C1 per-row targetLang bug, C2 EMPTY_SHEET test, C3 UUID validation, H1-H7, M1-M8, L1 L5 — 764 tests, 0 lint, 0 type errors | claude-sonnet-4-6 |
| 2026-02-24 | 1.2.0 | CR Round 2 — Fix All (2C·3H·6M·5L): C1 Zod validation in Server Action, C2 hasHeader=false broken (numeric indices), H1 duplicate header crash, H2 CAS mock count, H3 errorCode audit assertion, M1–M6, L1–L5 — 772 tests, 0 lint, 0 type errors | claude-sonnet-4-6 |
