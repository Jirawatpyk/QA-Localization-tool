# Code Quality Analyzer Memory

## Recurring Patterns Found

### withTenant() Usage Inconsistency

- Story 1.7 dashboard/notification actions use raw `eq(table.tenantId, tenantId)` instead of `withTenant()` helper
- All glossary + project actions correctly use `withTenant()` from `@/db/helpers/withTenant`
- This is a recurring standards violation to flag in every review

### Supabase Realtime Payload Mismatch

- Realtime INSERT payload uses snake_case DB columns (e.g., `user_id`, `tenant_id`, `is_read`, `created_at`)
- Code casts directly to camelCase TypeScript interface `AppNotification` without mapping
- This causes runtime field mismatch — `isRead` will be undefined, `createdAt` will be undefined, etc.

### Inline Colors in Tailwind

- Project rule: no inline Tailwind colors, use tokens.css
- Violations found: `text-white`, `amber-200`, `amber-50`, `amber-900`, hardcoded `#1e293b` in driver.js config, `white` in onboarding.css
- Design tokens provide `--primary-foreground`, `--destructive` etc. for theming consistency

### Test Pattern: Chainable Drizzle Mock

- Proxy-based chainable mock pattern used across Story 1.7 tests
- Pattern: `createChainMock(resolvedValue)` with Proxy that makes any method call return itself, and `.then` resolves
- Works well but is duplicated across test files — could be extracted to shared test utility

### Type Safety in Types

- `RecentFileRow.status` typed as `string` with comment — should be a union type for compile-time safety
- `AppNotification.type` also typed as bare `string`
- `UploadFileResult.status` and `fileType` also bare `string` — recurring pattern across features

### Path Traversal in Storage Paths

- `buildStoragePath()` now has `sanitizeFileName()` — strips null bytes, `..`, `/`, `\`
- CR Round 2 found: empty fileName (e.g., `".."`) results in empty string after sanitize → trailing slash in path
- Edge case: `"..."` → `"."` after regex → valid but ambiguous filename
- Needs fallback: `if (!safe || safe === '.') return 'unnamed_file'`

### Cross-Tenant FK Injection

- Route handler `POST /api/upload` has proper cross-tenant guard for projectId + batchId (FIXED in Round 1)
- Server Action `createBatch` now also has cross-tenant guard (FIXED in Round 1)
- Always check: does every write action verify FK references belong to the same tenant?

### Batch Linkage — FIXED in Round 1

- `batchId` is now passed from UploadPageClient → startUpload → XHR FormData → route handler
- Pattern works correctly for multi-file uploads

### Storage Orphan Pattern — FIXED in Round 2

- Route handler now cleans up Storage on DB insert failure (route.ts L207-208)

### Partial Batch Failure (Round 2 — still open Round 3)

- Route handler processes files sequentially in a for loop
- If any step fails mid-batch, files already uploaded are committed
- Client receives 500 and may retry entire batch → duplicate DB entries (no unique constraint on tenant_id+project_id+file_hash)
- Need either: unique constraint + ON CONFLICT DO NOTHING, or idempotency key pattern

### Route Handler vs Server Action Validation Gap — FIXED in Round 2

- Route Handler now validates projectId/batchId as UUID via Zod schema (route.ts L64-70)

### Audit Log Inconsistency Across Actions (NEW — Round 3)

- route.ts: writeAuditLog wrapped in try-catch (non-fatal) — CORRECT
- createBatch.action.ts: writeAuditLog NOT wrapped — will throw unhandled if audit DB fails
- Pattern: EVERY writeAuditLog call in Server Actions MUST be non-fatal (try-catch + logger.error)
- This is a recurring oversight — check in every future action review

### Unhandled Promise Patterns in Hooks (NEW — Round 3)

- `void promise.then()` without `.catch()` → unhandled rejection if promise rejects
- Found in: useFileUpload.ts confirmRerun (L280)
- `onFilesSelected(files)` called without await in sync function → floating promise
- Found in: FileUploadZone.tsx handleFiles (L37)
- Pattern: always add `.catch()` to `void` promises, or `await` in async functions

### FormData Type Safety (NEW — Round 3)

- `formData.getAll('files') as File[]` is unsafe — entries can be strings
- Need `instanceof File` type guard to reject non-File entries
- This is a general pattern for all route handlers that accept file uploads

### Missing DB Indexes

- `files` table has no composite indexes despite frequent `(tenant_id, project_id)` and `(tenant_id, project_id, file_hash)` queries
- `00005_performance_indexes.sql` covers audit_logs, findings, segments, scores, user_roles but NOT files

### Story 2.2 Parser — TOCTOU Race Condition (CR Round 2)

- Round 1 added idempotency guard (status !== 'uploaded' check) BUT it's TOCTOU — not atomic
- SELECT-CHECK-UPDATE pattern allows 2 concurrent calls to both pass the check
- **Fix:** Use atomic `UPDATE ... WHERE status = 'uploaded'` with `.returning()` to check rowCount
- Still no unique constraint on `segments(file_id, segment_number)` — DB allows duplicates (C4)
- Batch inserts still NOT in a transaction — partial failure leaves orphaned segments (H1)
- **Pattern for all future stories:** Status-transition actions MUST use atomic CAS in WHERE clause

### Story 2.2 Parser — segmentId NOT persisted to DB (CR Round 2)

- `ParsedSegment.segmentId` (mrk mid / trans-unit @\_id) is extracted by parser but NOT stored
- `batchInsertSegments()` does not include segmentId in values, DB schema has no column for it
- Required for: finding→segment mapping, re-export/round-trip, incremental re-parse
- **Fix:** Add `segment_id varchar(100)` column + migration + include in insert values

### Story 2.2 Parser — NFKC Decision (RESOLVED)

- NFKC normalization intentionally NOT applied in wordCounter.ts
- Thai sara am (U+0E33) decomposes under NFKC, breaking Intl.Segmenter tokenization
- NFKC will be applied in text-comparison contexts (glossary matching, finding comparison)
- Well-documented in wordCounter.ts lines 15-20

### Story 2.2 Parser — Word Count Double-Strip

- `countWords()` calls `stripMarkup()` internally but receives already-plain text from `extractInlineTags()`
- Usually harmless, but literal `{0}`, `%s`, `<tag>` in actual content text will be incorrectly stripped
- Consider adding `isPlainText` parameter or separate `countWordsPlain()` function

### Audit Log Error Handling — RECURRING anti-pattern (Stories 2.1 + 2.2)

- `writeAuditLog` throws on failure (by design — "Layer 1 of 3-layer defense")
- BUT on error paths (markFileFailed, createBatch failure), throw masks the original error
- Story 2.1: createBatch.action.ts — NOT wrapped
- Story 2.2: markFileFailed() — NOT wrapped (confirmed CR Round 2)
- Happy-path audit logs (file.parsing_started, file.parsed) SHOULD throw — that's correct
- Error-path audit logs MUST be non-fatal (try-catch + logger.error)
- Count: 3+ occurrences across 2 stories — track in every future review

### Story 2.2 Parser — Dead Test Fixtures

- `*-expected.json` files in `src/test/fixtures/` are never imported or asserted in any test
- Generated by `scripts/generate-expected-fixtures.mjs` but serve as documentation only
- Tests use inline assertions instead of fixture comparison

### Story 2.3 Excel Parser — segmentId STILL not persisted (confirmed 3rd time)

- `batchInsertSegments()` still omits `segmentId` — now Excel segmentId (TU-001 etc.) also lost
- DB schema `segments` STILL has no `segment_id` column
- Flagged in Story 2.2 CR Round 2, still open in Story 2.3
- **MUST be fixed before Story 2.4 (findings need segment ID for mapping)**

### Story 2.3 Excel Parser — per-row targetLang: VERIFIED CORRECT

- `excelParser.ts` correctly stores per-row language in `seg.targetLang`
- `batchInsertSegments()` uses `seg.targetLang` (L303) — confirmed correct in adversarial review
- Previous concern was wrong: batch insert DOES use per-segment values, not function parameter

### Story 2.3 — markFileFailed pattern FIXED

- `markFileFailed()` in parseFile.action.ts now correctly wraps BOTH db.update AND writeAuditLog in try-catch
- This fixes the recurring anti-pattern from Stories 2.1/2.2
- Pattern to verify in future reviews: confirmed fixed for parseFile, check other actions

### Story 2.3 — Atomic CAS pattern CONFIRMED working

- parseFile.action.ts uses `UPDATE ... WHERE status='uploaded'` with `.returning()` for TOCTOU guard
- Tests verify: concurrent race returns CONFLICT, no audit log written on CAS failure
- Pattern established for all future status-transition actions

### Server Action fileId validation — FIXED in Story 2.3

- Both `previewExcelColumns` (L33) and `parseFile` (L41) now validate fileId as UUID via Zod
- Pattern: `z.string().uuid().safeParse(fileId)` before any DB access
- **BUT** `parseFile` still does NOT validate `columnMapping` with `excelColumnMappingSchema` (C1 in adversarial review)

### Story 2.3 Adversarial Review — New Findings

- **columnMapping not Zod-validated in parseFile** — TypeScript type only, no runtime validation
- **Duplicate headers crash ColumnMappingDialog** — SelectItem key/value collision on duplicate header names
- **markFileFailed swallows errors without logger** — no pino import in parser feature at all
- **No unique constraint on segments(file_id, segment_number)** — allows duplicate segments
- **Dialog column selections not reset on fileId change** — stale state from previous file

## File Structure Notes

- Dashboard feature: `src/features/dashboard/{actions,components,hooks,types}.ts`
- Onboarding feature: `src/features/onboarding/{actions,components,types,validation}`
- Upload feature: `src/features/upload/{actions,components,hooks,types,constants,validation,utils}`
- Parser feature: `src/features/parser/{types,constants,inlineTagExtractor,wordCounter,sdlxliffParser,excelParser}.ts` + `actions/` + `validation/`
- Test colocation: some tests in `__tests__/` subfolder, some colocated — inconsistent
- Excel test fixtures: `src/test/fixtures/excel/` (bilingual-with-headers, no-headers, malformed, etc.)
