# Testing QA Expert — Persistent Memory

## Project: qa-localization-tool

### Key Test File Locations

- Unit tests: co-located next to source (`*.test.ts` / `*.test.tsx`)
- RLS tests: `src/db/__tests__/rls/` (require `npx supabase start`)
- E2E tests: `e2e/`
- Shared factories/mocks: `src/test/factories.ts`
- RLS helpers: `src/db/__tests__/rls/helpers.ts`

### Story 2.1 Test Review Round 3 (2026-02-23) — 110 tests pass, 12 files

All Round 2 gaps were resolved. Current state and Round 3 new findings below.

#### RESOLVED from Round 2 (now have tests)

- confirmRerun() queue continuation branch: H5 test added (3-file scenario, mockCheckDuplicate x3)
- FileSizeWarning: 4 tests (null render, alert, single name, multiple names comma-joined)
- UploadPageClient: 4 tests (single file, multi-file batch, createBatch fail, dialog render)
- route.test.ts audit: now asserts entityId, tenantId, userId (strong assertion)
- UploadProgressList: all 6 error codes + null-error fallback now tested (M10)
- DuplicateDetectionDialog: Escape key → onCancel tested (M11)
- createBatch: boundary tests fileCount=1, fileCount=50, non-integer (M12)
- getUploadedFiles: DB exception propagates (M13)
- MAX_FILE_SIZE_BYTES boundary: L6 tests in both route.test.ts and useFileUpload.test.ts
- withTenant assertion: L7 tests in createBatch + getUploadedFiles (L7)

#### Round 3 Remaining Gaps (NEW — adversarial findings)

**CRITICAL — Missing test file:**

- `fileType.ts` has NO test file. getFileType() is tested only indirectly through route and hook.
  Five behaviors directly untestable through indirection:
  1. `.sdlxliff` → returns 'sdlxliff'
  2. `.xlf` → returns 'xliff' (note: extension xlf maps to TYPE xliff — subtle mapping)
  3. `.xliff` → returns 'xliff'
  4. `.xlsx` → returns 'xlsx'
  5. anything else (`.pdf`, `.docx`, empty string, no extension) → returns null
  6. UPPERCASE extension: `REPORT.SDLXLIFF` — uses `.toLowerCase()` so should return 'sdlxliff'
  7. multiple dots: `file.backup.sdlxliff` — uses `.pop()` so correct. Tested? No.
  8. filename with NO extension: `reportsdlxliff` → null. Tested? No.
  9. empty string: `''` → `split('.').pop()` returns `''` → null. Tested? No.

**HIGH — route.test.ts: storage orphan cleanup (H1) not verified:**

- route.ts line 208: when DB insert returns empty, calls `admin.storage.from().remove([storagePath])`
  before returning 500. The test at line 312 only checks status=500 + body.error. It does NOT assert
  that `mockRemoveStorage` was called with the correct storagePath. The cleanup could silently be
  removed from the code and the test would still pass.

**HIGH — route.test.ts: invalid projectId UUID format not tested:**

- route.ts lines 65-67: if projectId is not a valid UUID, returns 400 "Invalid project ID format".
  No test sends a non-UUID projectId string (e.g. `'not-a-uuid'`). Current tests all use VALID_UUID.
  The validation branch at line 65 is completely uncovered.

**HIGH — route.test.ts: invalid batchId UUID format not tested:**

- route.ts lines 68-70: if batchId is provided but not a valid UUID, returns 400 "Invalid batch ID
  format". No test sends a malformed batchId. The batchId UUID validation branch is uncovered.

**HIGH — route.test.ts: formData() parse failure not tested:**

- route.ts lines 51-55: if `request.formData()` throws, returns 400 "Invalid multipart form data".
  No test makes formData() reject. This catch block is completely uncovered.

**HIGH — route.test.ts: multi-file partial success not tested:**

- route.ts processes files in a loop. If file 1 succeeds and file 2 fails (e.g. unsupported format),
  the route returns 400 for file 2 while file 1 has already been stored. No test covers mixed
  valid+invalid in a single batch (e.g. ['report.sdlxliff', 'doc.pdf']).

**MEDIUM — useFileUpload.test.ts: cancelDuplicate progress filtering not tested:**

- useFileUpload.ts line 294: `cancelDuplicate()` calls `setProgress(prev => prev.filter(f => f.status !== 'pending'))`.
  The test at line 451 only asserts pendingDuplicate=null and isUploading=false. It does NOT verify
  that 'pending' entries are removed from progress while 'error' entries (the duplicate itself) are kept.
  Scenario: upload 3 files, file 2 is duplicate (progress: [uploaded, error:DUPLICATE, pending]).
  After cancelDuplicate(): should be [uploaded, error:DUPLICATE] — the pending entry for file 3 must be gone.

**MEDIUM — useFileUpload.test.ts: checkDuplicate action failure branch not tested:**

- useFileUpload.ts line 225: `if (dupResult.success && dupResult.data.isDuplicate)` — note the
  `success` guard. If checkDuplicate returns `{ success: false }` (network failure, auth error),
  the condition is false and the file proceeds to upload without treating it as a duplicate.
  No test exercises `mockCheckDuplicate.mockResolvedValue({ success: false, code: 'UNAUTHORIZED' })`.
  Whether this is intentional "fail-open" or a bug is untested.

**MEDIUM — useFileUpload.test.ts: XHR abort event not tested:**

- useFileUpload.ts lines 78-80: the `xhr.addEventListener('abort', ...)` handler treats abort
  as a network error (status=0, ok=false). This triggers retry logic. No test fires an abort event.
  An abort-specific XHR mock similar to setupXhrErrorMock() is needed.

**MEDIUM — useFileUpload.test.ts: upload progress percentage update not tested:**

- useFileUpload.ts lines 108-121: the `onProgress` callback updates `bytesUploaded`, `percent`,
  `etaSeconds`. The XHR mock never fires `upload.addEventListener('progress', ...)` events.
  The progress reporting path (percent calculation, ETA calculation) has zero unit test coverage.

**MEDIUM — UploadProgressList.test.tsx: formatBytes() helper not tested:**

- UploadProgressList.tsx lines 18-22: `formatBytes()` has 3 branches: < 1024 B, < 1MB KB,
  > = 1MB MB. Tests always use `fileSizeBytes: 1024` which hits the KB branch only. The B branch
  > (< 1024) and MB branch (>= 1MB) are never exercised in any test.

**MEDIUM — UploadProgressList.test.tsx: formatEta() edge cases not tested:**

- UploadProgressList.tsx lines 12-16: `formatEta()` has branches: null/<=0 → '', < 60s → ~Xs,
  > = 60s → ~Xm. The >= 60s branch (e.g. etaSeconds=90 → '~2m remaining') is never tested.
  > The <= 0 branch (etaSeconds=0) is also never tested.

**MEDIUM — UploadProgressList.test.tsx: batchTotal=1 should NOT show counter:**

- UploadProgressList.tsx line 31: `batchTotal > 1` condition. Tests cover batchTotal=2 (shows)
  and no batchTotal prop (undefined, doesn't show). But batchTotal=1 (edge case, doesn't show)
  is not explicitly tested.

**MEDIUM — UploadPageClient.test.tsx: confirmRerun and cancelDuplicate wiring not tested:**

- UploadPageClient.tsx lines 69-70: DuplicateDetectionDialog receives onRerun=confirmRerun and
  onCancel=cancelDuplicate. The test that renders the dialog (test 4) does NOT click Re-run QA or
  Cancel to verify the wiring. mockConfirmRerun and mockCancelDuplicate are never asserted.

**MEDIUM — FileUploadZone.test.tsx: dragLeave event not tested:**

- FileUploadZone.tsx line 45-48: `handleDragLeave` sets `isDragging` to false. While dragOver
  is tested (test line 57), there is no test that fires dragOver then dragLeave and verifies
  the visual state resets. The `isDragging` reset path is untested.

**MEDIUM — FileUploadZone.test.tsx: dragOver state assertion is weak:**

- The dragOver test at line 57 only asserts `expect(dropzone).not.toBeNull()` — this is a
  trivially-true assertion that proves nothing. It should assert isDragging=true manifests as
  a class change (e.g. `border-primary` class present) or aria attribute change.

**MEDIUM — storagePath.test.ts: empty-string fallback (L3) not tested:**

- storagePath.ts line 34: `const safeName = safe.length > 0 ? safe : fileHash` — if sanitization
  produces an empty string (e.g. fileName='..'), the fileHash is used as the filename segment.
  No test exercises this path. A fileName of `'..'` after sanitization becomes '' → should use hash.

**LOW — uploadSchemas.test.ts: getUploadedFilesSchema not tested:**

- uploadSchemas.ts defines 3 schemas: `checkDuplicateSchema`, `createBatchSchema`,
  `getUploadedFilesSchema`. The test file only covers the first two. `getUploadedFilesSchema`
  (which is `z.object({ projectId: z.string().uuid() })`) has zero schema-level unit tests.
  Valid UUID and invalid UUID cases missing.

**LOW — checkDuplicate.action.test.ts: withTenant assertion missing:**

- Unlike createBatch and getUploadedFiles (which have L7 withTenant tests), checkDuplicate
  action test does NOT assert that `withTenant` is called. It is called TWICE in the action
  (once for files.tenantId and once inside the leftJoin condition for scores.tenantId).
  Neither call is verified in the test.

**LOW — checkDuplicate.action.test.ts: DB exception path not tested:**

- Unlike getUploadedFiles (which has M13 DB exception test), checkDuplicate has no equivalent.
  If `mockLimitFn.mockRejectedValue(new Error('DB'))` the action would throw unhandled.

**LOW — route.test.ts: batchId threaded through to response not verified:**

- route.ts line 264: response includes `batchId: batchId ?? null`. No test with a valid batchId
  verifies that `body.data.batchId` in the response equals the provided batchId. The batchId
  passthrough is assumed, not asserted.

**LOW — route.test.ts: LARGE_FILE_WARNING_BYTES boundary operator inconsistency unverified:**

- route.ts line 151: uses `>=` (file at exactly 10MB triggers warning).
  hook line 186: uses `>` (file at exactly 10MB does NOT trigger warning).
  Operator inconsistency between route and hook. The route's `>=` boundary is not tested with
  a file at exactly 10 _ 1024 _ 1024 bytes — existing route test uses 11MB, not the boundary.

**INFO — Assertion quality issues found:**

- FileUploadZone test line 62: `expect(dropzone).not.toBeNull()` — proves nothing (element was
  just retrieved from `screen.getByRole('button')` which throws if not found).
- UploadProgressList test lines 30,37,38,42,44,49,57,59: uses `.toBeTruthy()` — masks null vs
  undefined vs string vs element ambiguity. Should use `.toBeInTheDocument()` consistently.
- DuplicateDetectionDialog test line 34,36: uses `.toBeTruthy()` — same weak assertion issue.

### Confirmed Working Patterns

- `vi.mock('server-only', () => ({}))` must be FIRST line in server action test files
- `vi.mock` hoisting: place all vi.mock() calls before imports in server action tests
- Drizzle chain mock: flat variable chain (mockSelectFn → mockFromFn → ...) works reliably
  for simple chains; Proxy needed only for deeply variable/optional chain shapes
- `async import()` within test body for server actions (avoids top-level import before mocks)
- `setupXhrMock()` pattern with class extension for XHR response simulation in jsdom
- RLS helpers use separate anonClient for sign-in to avoid polluting admin client session
- `vi.fn((..._args: unknown[]) => ...)` for mocks whose `.calls` will be accessed (TS2493 fix)

### Common Operator Gotchas

- LARGE*FILE_WARNING_BYTES boundary: route.ts uses `>=`, hook uses `>` — inconsistency
  should be caught by exact-boundary tests (file at exactly 10 * 1024 \_ 1024 bytes)
- Schema `z.string().length(N)` is exact-length, NOT max — test BOTH too-short AND too-long

### Story 2.2 Test Review (2026-02-23) — See detail file

Full findings in `story-2.2-test-review.md`. Summary:

- 5 CRITICAL, 10 HIGH, 12 MEDIUM, 6 LOW across 101 tests in 6 files
- C1/C2: AC#3 + AC#7 exact error messages not asserted (substring only)
- C3: Inline tag POSITION never asserted in parser integration tests
- C4: Source/target tag count parity (AC#1 "count matching") untested
- C5: sourceLang/targetLang missing from action insert assertion
- H1: AC#3 boundary value at exactly 15MB not tested (operator is `>` not `>=`)
- H2: DB_ERROR path (batchInsert throws) completely untested
- H3: Cross-tenant defense-in-depth check (line 51-53) untested
- H5: Batch boundary (100 vs 101 segments, 2 insert calls) not tested
- INVALID_XML code path is unreachable (fast-xml-parser never throws) — AC#7 only hits INVALID_STRUCTURE

### RLS Test Patterns That Work

- Always seed with admin client (service_role bypasses RLS)
- Test SELECT / INSERT / UPDATE / DELETE for each table — all four operations
- Use `cleanupTestTenant` in afterAll — never rely on DB auto-cleanup
- Verify data with `data?.length` not error presence for silent RLS filtering
