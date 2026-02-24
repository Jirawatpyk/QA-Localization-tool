# Testing QA Expert — Persistent Memory

## Project: qa-localization-tool

### Key Test File Locations

- Unit tests: co-located next to source (`*.test.ts` / `*.test.tsx`)
- RLS tests: `src/db/__tests__/rls/` (require `npx supabase start`)
- E2E tests: `e2e/`
- Shared factories/mocks: `src/test/factories.ts`
- RLS helpers: `src/db/__tests__/rls/helpers.ts`

### Story 2.1 Test Review — Round 3 Findings (2026-02-23)

Full details in `story-2.1-cr-round3.md`. Summary:

- CRITICAL: `fileType.ts` has NO test file (9 untested behaviors)
- HIGH: route.test.ts — storage cleanup, UUID validation, formData throw, partial success
- MEDIUM: useFileUpload cancel/abort/progress, formatBytes/Eta branches, drag/drop state reset
- INFO: weak assertions (.not.toBeNull(), .toBeTruthy()) in FileUploadZone + UploadProgressList

### Story 2.3 Test Review — CR Round 2 Findings (2026-02-23)

Full details in `story-2.3-cr-round2.md`. Summary: 2C · 3H · 6M · 4L. 142 tests passing.

- C1 (POSSIBLE SOURCE BUG): `segmentId` from ParsedSegment silently dropped — segments table has no
  segmentId column. Intentional design or data loss? No test verifies contract either way.
- C2 (SOURCE BUG): `ColumnMappingDialog` sends header TEXT values when hasHeader=false, but
  parseExcelBilingual expects NUMERIC strings (1-based). The hasHeader=false UI flow is broken.
- H2: CAS race condition test uses single updateChain mock — does not enforce that markFileFailed
  is NOT called on CAS failure path (vacuous mock).
- H3: Excel parse error in parseFile — markFileFailed `errorCode` field not asserted.
- M2: previewExcelColumns: header-only file (rowCount=1, totalRows=0) not tested.
- M6: ColumnMappingDialog escape-key / overlay-click `onOpenChange` path never tested.

### Story 2.2 Test Review — CR Round 2 Findings (2026-02-23)

Full details in `story-2.2-cr-round2.md`. Summary: 6 HIGH · 12 MEDIUM · 7 LOW.

Key findings:

- H1: blob.text() throw → no try/catch → status stuck 'parsing', no audit log written
- H2: FILE_TOO_LARGE from parser not tested end-to-end through action
- H3: file.fileType='xliff' branch NEVER exercised (all tests use 'sdlxliff')
- H4: audit log `reason` field not asserted in ANY of 3 file.parse_failed tests
- H5: withTenant called 4x in action, never mocked/asserted
- H6: MAX_PARSE_SIZE_BYTES exact boundary not tested (operator is `>` not `>=`)
- M4: matchPercentage clamping (-1, 150, NaN) untested
- M6: TAG_MISMATCH propagation from inlineTagExtractor through parseXliff untested
- M10 (POTENTIAL BUG): `stripped.length===0` in wordCounter.ts is dead code —
  stripMarkup replaces with spaces so length never 0. Should be `stripped.trim().length===0`
  but .trim() was already called. Investigate as possible source defect.

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

- LARGE_FILE_WARNING_BYTES: route.ts uses `>=`, hook uses `>` — inconsistency unverified
- Schema `z.string().length(N)` is exact-length, NOT max — test BOTH too-short AND too-long
- MAX_PARSE_SIZE_BYTES guard: operator is `>` (not `>=`) — boundary value must succeed

### RLS Test Patterns That Work

- Always seed with admin client (service_role bypasses RLS)
- Test SELECT / INSERT / UPDATE / DELETE for each table — all four operations
- Use `cleanupTestTenant` in afterAll — never rely on DB auto-cleanup
- Verify data with `data?.length` not error presence for silent RLS filtering
