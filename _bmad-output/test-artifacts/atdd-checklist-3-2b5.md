---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-generation-mode', 'step-03-test-strategy', 'step-04-generate-tests', 'step-05-validate-and-complete']
lastStep: 'step-05-validate-and-complete'
lastSaved: '2026-03-02'
---

# ATDD Checklist - Epic 3, Story 3.2b5: Upload-to-Pipeline Wiring

**Date:** 2026-03-02
**Author:** Mona
**Primary Test Level:** Unit (Vitest/jsdom) + E2E Smoke (Playwright)

---

## Story Summary

Wire existing upload, parser, and pipeline components into a complete end-to-end flow — auto-parse SDLXLIFF/XLIFF files after upload and mount ProcessingModeDialog in the upload page.

**As a** QA Reviewer
**I want** SDLXLIFF/XLIFF files to be automatically parsed after upload and a processing mode dialog to appear
**So that** the upload-to-pipeline flow works end-to-end without manual steps

---

## Acceptance Criteria

1. **AC1:** Auto-parse SDLXLIFF/XLIFF after upload — `parseFile(fileId)` called automatically, toast feedback, tracked in state
2. **AC2:** ProcessingModeDialog mounted in upload page — "Start Processing" button appears after parse, opens dialog with correct props
3. **AC3:** Upload progress shows parse status — "Parsing..." / "Parsed (N segments)" / "Parse failed" in UploadProgressList
4. **AC4:** Unit tests — 10+ tests covering auto-parse, dialog mounting, error handling, boundary cases

---

## Test Strategy

### Test Matrix (20 tests: 18 Unit + 2 E2E)

| # | AC | Test Scenario | Level | Priority |
|---|-----|--------------|-------|----------|
| 1 | AC1 | Auto-parse triggers for SDLXLIFF after upload | Unit | P0 |
| 2 | AC1 | Auto-parse triggers for XLIFF after upload | Unit | P0 |
| 3 | AC1 | Auto-parse does NOT trigger for Excel file | Unit | P0 |
| 4 | AC1 | Auto-parse does NOT re-trigger for already-parsed file | Unit | P1 |
| 5 | AC1 | Parse success shows toast with segmentCount | Unit | P1 |
| 6 | AC1 | Parse failure shows error toast (no crash) | Unit | P1 |
| 7 | AC2 | "Start Processing" button appears after file parsed | Unit | P0 |
| 8 | AC2 | "Start Processing" button hidden when no files parsed | Unit | P0 |
| 9 | AC2 | Button disabled during upload/parsing | Unit | P1 |
| 10 | AC2 | ProcessingModeDialog opens with correct fileIds | Unit | P0 |
| 11 | AC2 | Dialog closes + toast after successful start | Unit | P1 |
| 12 | AC2 | Excel parsed via ColumnMappingDialog counted in parsedFiles | Unit | P1 |
| 13 | AC3 | Shows "Parsing..." while parse in progress | Unit | P1 |
| 14 | AC3 | Shows "Parsed (N segments)" after success | Unit | P1 |
| 15 | AC3 | Shows "Parse failed" with error styling | Unit | P1 |
| 16 | AC4 | Mixed: 1 SDLXLIFF + 1 Excel → correct routing | Unit | P2 |
| 17 | AC4 | Multiple SDLXLIFF files parse sequentially | Unit | P2 |
| 18 | AC4 | Zero parsed files → button not rendered | Unit | P0 |
| 19 | E2E | Upload SDLXLIFF → auto-parse → Start Processing → dialog | E2E | P1 |
| 20 | E2E | Pipeline findings appear after processing starts | E2E | P2 |

### Boundary Value Tests

| AC | Boundary | At | Below | Above | Zero/Empty |
|----|----------|----|-------|-------|------------|
| AC2 | `parsedFileIds.length > 0` (button visibility) | `=== 1` (show) | N/A | `=== 3` (show) | `=== 0` (hidden) |
| AC2 | Button disabled: `isUploading \|\| parsingFileIds.size > 0` | `parsing === 1` (disabled) | `parsing === 0 + !uploading` (enabled) | N/A | Both false (enabled) |
| AC1 | File type routing | `.sdlxliff` (auto-parse) | `.xliff` (auto-parse) | `.xlsx` (skip) | unknown ext (skip) |

---

## Failing Tests Created (RED Phase)

### Unit Tests (18 tests)

**File:** `src/features/upload/components/UploadPageClient.test.tsx` (826 lines)

**AC1: Auto-Parse (6 tests)**

- `it.skip` **Test #1:** should call parseFile automatically when SDLXLIFF file upload completes
  - **Status:** RED — parseFile auto-trigger not wired in UploadPageClient
  - **Priority:** P0 | **Verifies:** AC1 — auto-parse for .sdlxliff

- `it.skip` **Test #2:** should call parseFile automatically when XLIFF file upload completes
  - **Status:** RED — parseFile auto-trigger not wired in UploadPageClient
  - **Priority:** P0 | **Verifies:** AC1 — auto-parse for .xliff

- `it.skip` **Test #3:** should NOT call parseFile for Excel file (uses ColumnMappingDialog instead)
  - **Status:** RED — auto-parse routing logic not implemented
  - **Priority:** P0 | **Verifies:** AC1 — Excel exclusion from auto-parse

- `it.skip` **Test #4:** should NOT re-trigger parseFile for a file that was already parsed
  - **Status:** RED — idempotency guard (dismissedParseIds/parsedFiles) not implemented
  - **Priority:** P1 | **Verifies:** AC1 — no re-parse on re-render

- `it.skip` **Test #5:** should show success toast with segment count after parse completes
  - **Status:** RED — parse success handler not wired
  - **Priority:** P1 | **Verifies:** AC1 — toast feedback

- `it.skip` **Test #6:** should show error toast when parseFile fails (no crash)
  - **Status:** RED — parse error handler not wired
  - **Priority:** P1 | **Verifies:** AC1 — graceful error handling

**AC2: ProcessingModeDialog (6 tests)**

- `it.skip` **Test #7:** should show "Start Processing" button after file is parsed
  - **Status:** RED — Start Processing button not rendered in UploadPageClient
  - **Priority:** P0 | **Verifies:** AC2 — button visibility

- `it.skip` **Test #8:** should NOT show "Start Processing" button when no files are parsed
  - **Status:** RED — Start Processing button not implemented
  - **Priority:** P0 | **Verifies:** AC2 — button hidden when empty

- `it.skip` **Test #9:** should disable "Start Processing" button while uploading
  - **Status:** RED — Start Processing button not implemented
  - **Priority:** P1 | **Verifies:** AC2 — disabled state

- `it.skip` **Test #10:** should open ProcessingModeDialog with correct fileIds when button clicked
  - **Status:** RED — ProcessingModeDialog not mounted in UploadPageClient
  - **Priority:** P0 | **Verifies:** AC2 — dialog props

- `it.skip` **Test #11:** should close dialog and show toast after processing starts
  - **Status:** RED — onStartProcessing callback not wired
  - **Priority:** P1 | **Verifies:** AC2 — dialog lifecycle

- `it.skip` **Test #12:** should count Excel file in parsedFiles after ColumnMappingDialog confirms
  - **Status:** RED — handleColumnMappingSuccess does not add to parsedFiles map
  - **Priority:** P1 | **Verifies:** AC2 — Excel counted for Start Processing

**AC3: Parse Status UI (3 tests)**

- `it.skip` **Test #13:** should show "Parsing..." status while parse is in progress
  - **Status:** RED — parse status not displayed in UploadProgressList
  - **Priority:** P1 | **Verifies:** AC3 — parsing indicator

- `it.skip` **Test #14:** should show "Parsed (N segments)" after parse completes
  - **Status:** RED — parsed status not displayed in UploadProgressList
  - **Priority:** P1 | **Verifies:** AC3 — success status

- `it.skip` **Test #15:** should show "Parse failed" when parse fails
  - **Status:** RED — parse failed status not displayed in UploadProgressList
  - **Priority:** P1 | **Verifies:** AC3 — error status

**AC4: Boundary Tests (3 tests)**

- `it.skip` **Test #16:** should auto-parse SDLXLIFF and show ColumnMappingDialog for Excel in mixed upload
  - **Status:** RED — auto-parse routing for mixed file types not implemented
  - **Priority:** P2 | **Verifies:** AC4 — mixed file type routing

- `it.skip` **Test #17:** should parse multiple SDLXLIFF files sequentially
  - **Status:** RED — sequential auto-parse not implemented
  - **Priority:** P2 | **Verifies:** AC4 — sequential parse order

- `it.skip` **Test #18:** should not render "Start Processing" button when zero files are parsed
  - **Status:** RED — Start Processing button logic not implemented
  - **Priority:** P0 | **Verifies:** AC2+AC4 — zero boundary

### E2E Tests (2 tests)

**File:** `e2e/upload-segments.spec.ts` (166 lines)

- `test.skip` **Test #19:** [P1] upload SDLXLIFF → auto-parse → Start Processing button → dialog opens
  - **Status:** RED — auto-parse + ProcessingModeDialog not wired in upload page
  - **Verifies:** AC1+AC2+AC3 — full upload-to-dialog flow

- `test.skip` **Test #20:** [P2] pipeline findings appear after processing starts via dialog
  - **Status:** RED — full upload-to-pipeline flow not wired end-to-end
  - **Verifies:** AC1+AC2 → pipeline → findings + score

---

## Mock Requirements

### parseFile Action Mock

**Module:** `@/features/parser/actions/parseFile.action`

**Success Response:**
```typescript
{ success: true, data: { segmentCount: 42, fileId: 'sdlxliff-id' } }
```

**Failure Response:**
```typescript
{ success: false, error: 'Invalid XML structure' }
```

**Notes:** Called with `parseFile(fileId)` — no column mapping for SDLXLIFF/XLIFF. Mock is `mockParseFile` (vi.fn).

### ProcessingModeDialog Mock

**Module:** `@/features/pipeline/components/ProcessingModeDialog`

**Mock renders:**
- `data-testid="processing-mode-dialog"` when `open === true`
- `data-testid="dialog-file-count"` — shows `{fileIds.length} files`
- `data-testid="dialog-project-id"` — shows `{projectId}`
- Close button calls `onOpenChange(false)`
- Start button calls `onStartProcessing?.()`

---

## Required data-testid Attributes

### UploadPageClient (new attributes)

- `processing-mode-dialog` — wrapper div for ProcessingModeDialog (mock provides this)
- `dialog-file-count` — file count display inside dialog (mock provides this)
- `dialog-project-id` — project ID display inside dialog (mock provides this)

### UploadProgressList (existing + enhanced)

- `upload-row-{filename}` — per-file progress row (already exists in fileUpload.ts helpers)
- No new data-testids required — parse status uses text content matching (e.g., `/parsing/i`, `/parsed.*segments/i`, `/parse failed/i`)

---

## Implementation Checklist

### Test #1-#3: Auto-parse wiring (P0)

**File:** `src/features/upload/components/UploadPageClient.tsx`

**Tasks to make these tests pass:**

- [ ] Add `parsedFiles` state (`Map<string, number>`)
- [ ] Add `parsingFileIds` state (`Set<string>`)
- [ ] Add `dismissedParseIds` state (`Set<string>`)
- [ ] Add `parseFailedFileIds` state (`Set<string>`)
- [ ] Derive `pendingXmlFiles` at render-time (non-Excel uploaded files not yet parsed/dismissed)
- [ ] Add `useEffect` with stable `nextPendingFileId` dependency to call `parseFile(fileId)`
- [ ] Import `parseFile` from `@/features/parser/actions/parseFile.action`
- [ ] Run: `npx vitest run src/features/upload/components/UploadPageClient.test.tsx`
- [ ] Tests #1, #2, #3 pass (green)

### Test #4: Idempotency guard (P1)

**Tasks:**

- [ ] After parseFile resolves, add fileId to `parsedFiles` map (prevents re-derive)
- [ ] After parseFile rejects, add fileId to `dismissedParseIds` set
- [ ] Run: `npx vitest run src/features/upload/components/UploadPageClient.test.tsx`
- [ ] Test #4 passes (green)

### Test #5-#6: Parse toast feedback (P1)

**Tasks:**

- [ ] On parse success: `toast.success(`Parsed ${segmentCount} segments from ${fileName}`)`
- [ ] On parse failure: `toast.error(`Failed to parse ${fileName}: ${error}`)`
- [ ] Run tests — Tests #5, #6 pass (green)

### Test #7-#8, #18: Start Processing button (P0)

**File:** `src/features/upload/components/UploadPageClient.tsx`

**Tasks:**

- [ ] Derive `parsedFileIds` from `parsedFiles.keys()`
- [ ] Render "Start Processing ({n} files)" button when `parsedFileIds.length > 0`
- [ ] Hide button when no files parsed
- [ ] Run tests — Tests #7, #8, #18 pass (green)

### Test #9: Button disabled state (P1)

**Tasks:**

- [ ] Disable button when `isUploading || parsingFileIds.size > 0`
- [ ] Run test — Test #9 passes (green)

### Test #10: Mount ProcessingModeDialog (P0)

**Tasks:**

- [ ] Import `ProcessingModeDialog` from `@/features/pipeline/components/ProcessingModeDialog`
- [ ] Add `showProcessingDialog` state (`boolean`)
- [ ] Button onClick sets `showProcessingDialog = true`
- [ ] Render `<ProcessingModeDialog open={showProcessingDialog} fileIds={parsedFileIds} projectId={projectId} onOpenChange={setShowProcessingDialog} />`
- [ ] Run test — Test #10 passes (green)

### Test #11: Dialog lifecycle (P1)

**Tasks:**

- [ ] Add `onStartProcessing` callback: `toast.success('Processing started')`, reset state
- [ ] Run test — Test #11 passes (green)

### Test #12: Excel counted in parsedFiles (P1)

**Tasks:**

- [ ] Modify `handleColumnMappingSuccess(segmentCount)` to ALSO add `pendingExcelFile.fileId → segmentCount` to `parsedFiles` map
- [ ] Run test — Test #12 passes (green)

### Test #13-#15: Parse status in UploadProgressList (P1)

**File:** `src/features/upload/components/UploadProgressList.tsx`

**Tasks:**

- [ ] Add optional props: `parsingFileIds?: ReadonlySet<string>`, `parsedFiles?: ReadonlyMap<string, number>`, `parseFailedFileIds?: ReadonlySet<string>`
- [ ] In `status === 'uploaded'` branch, check parse state to show "Parsing..." / "Parsed (N segments)" / "Parse failed"
- [ ] Pass parse state props from `UploadPageClient` to `<UploadProgressList>`
- [ ] Run tests — Tests #13, #14, #15 pass (green)

### Test #16-#17: Boundary tests (P2)

**Tasks:**

- [ ] Verify mixed upload routing (SDLXLIFF auto-parse + Excel ColumnMappingDialog) — Test #16
- [ ] Verify sequential parse (one at a time via `nextPendingFileId`) — Test #17
- [ ] Run tests — Tests #16, #17 pass (green)

### Test #19-#20: E2E tests (P1/P2)

**File:** `e2e/upload-segments.spec.ts`

**Tasks:**

- [ ] Remove `test.skip` from Test #19 after all AC1+AC2+AC3 unit tests pass
- [ ] Remove `test.skip` from Test #20 after Test #19 passes
- [ ] Update `e2e/pipeline-findings.spec.ts` to use real upload flow (replace PostgREST bypass)
- [ ] Remove stale bypass comments from `e2e/pipeline-findings.spec.ts:22-23`
- [ ] Mark `TD-E2E-001` and `TD-E2E-002` as RESOLVED in tech-debt-tracker.md
- [ ] Run: `npm run test:e2e`
- [ ] Tests #19, #20 pass (green)

---

## Running Tests

```bash
# Run all unit tests for this story (8 existing + 18 new stubs)
npx vitest run src/features/upload/components/UploadPageClient.test.tsx

# Run in watch mode
npx vitest --project unit src/features/upload/components/UploadPageClient.test.tsx

# Run E2E tests
npx playwright test e2e/upload-segments.spec.ts

# Run E2E in headed mode
npx playwright test e2e/upload-segments.spec.ts --headed

# Run all E2E
npm run test:e2e
```

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

**TEA Agent Responsibilities:**

- All 20 tests written and skipped (18 unit + 2 E2E)
- Mock requirements documented (parseFile, ProcessingModeDialog)
- data-testid requirements listed
- Implementation checklist created with per-test tasks

**Verification:**

- Unit: `8 passed | 18 skipped` (26 total) — existing tests unaffected
- E2E: 2 tests with `test.skip` — will not run until implementation
- All tests designed to fail due to missing implementation, not test bugs

---

### GREEN Phase (DEV Team - Next Steps)

**DEV Agent Responsibilities:**

1. **Pick one failing test** from implementation checklist (start with P0: Tests #1-#3)
2. **Read the test** to understand expected behavior
3. **Implement minimal code** to make that specific test pass
4. **Run the test** to verify it now passes (green)
5. **Move to next test** and repeat

**Recommended order:** #1→#2→#3→#7→#8→#18→#10→#4→#5→#6→#9→#11→#12→#13→#14→#15→#16→#17→#19→#20

**Key Principles:**

- One test at a time (don't try to fix all at once)
- Minimal implementation (don't over-engineer)
- Run tests frequently (immediate feedback)

---

### REFACTOR Phase (After All Tests Pass)

1. Verify all 20 tests pass (green phase complete)
2. Review code quality — extract shared helpers if needed
3. Ensure tests still pass after each refactor
4. Update `e2e/pipeline-findings.spec.ts` to use real UI flow
5. Mark TD-E2E-001 and TD-E2E-002 as RESOLVED

---

## Test Execution Evidence

### Initial Test Run (RED Phase Verification)

**Command:** `npx vitest run src/features/upload/components/UploadPageClient.test.tsx`

**Results:**

```
 ✓ unit src/features/upload/components/UploadPageClient.test.tsx (26 tests | 18 skipped) 778ms

 Test Files  1 passed (1)
      Tests  8 passed | 18 skipped (26)
   Duration  4.20s
```

**Summary:**

- Total tests: 26 (8 existing + 18 new stubs)
- Passing: 8 (existing tests unaffected)
- Skipped: 18 (new ATDD stubs — RED phase)
- Status: RED phase verified

---

## Notes

- New mocks added at top of test file: `mockParseFile` (parseFile action), `ProcessingModeDialog` (mock component)
- `makeUploadedFile()` helper function added for creating `UploadFileResult` fixtures with overrides
- `mockParseFile` default return in `beforeEach`: `{ success: true, data: { segmentCount: 42, fileId: 'any' } }`
- E2E Test #19 setup test (auth + project) does NOT have `.skip` — it creates the test context
- TD-UX-003 (File Selection UI) deferred — all parsed files auto-selected, no per-file checkbox

---

**Generated by BMad TEA Agent (Murat)** - 2026-03-02
