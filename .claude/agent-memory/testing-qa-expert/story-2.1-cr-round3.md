# Story 2.1 — CR Round 3 Findings (2026-02-23)

# Status: delivered to dev. See MEMORY.md for summary.

## CRITICAL — fileType.ts has NO test file

getFileType() tested only indirectly. Direct unit tests needed:

1. `.sdlxliff` → 'sdlxliff'
2. `.xlf` → 'xliff' (extension xlf maps to TYPE xliff — subtle)
3. `.xliff` → 'xliff'
4. `.xlsx` → 'xlsx'
5. `.pdf`, `.docx`, no extension → null
6. `REPORT.SDLXLIFF` (uppercase) → 'sdlxliff' (uses .toLowerCase())
7. `file.backup.sdlxliff` (multiple dots) → 'sdlxliff' (uses .pop())
8. `reportsdlxliff` (no dot) → null
9. `''` (empty string) → null

## HIGH — route.test.ts gaps

- H1: storage orphan cleanup (`admin.storage.from().remove()`) not asserted
- H2: invalid projectId UUID format (non-UUID string) → 400 not tested
- H3: invalid batchId UUID format → 400 not tested
- H4: formData() throw → 400 not tested
- H5: multi-file partial success (file1 ok, file2 invalid) not tested

## MEDIUM — useFileUpload.test.ts gaps

- M1: cancelDuplicate() pending-filter behavior untested (3-file scenario)
- M2: checkDuplicate failure (success:false) → fail-open behavior untested
- M3: XHR abort event handler untested
- M4: upload progress % / ETA calculation untested (no progress events fired)

## MEDIUM — Component test gaps

- M5: formatBytes() B and MB branches untested (only KB)
- M6: formatEta() >= 60s branch and <=0 branch untested
- M7: batchTotal=1 should NOT show counter (boundary case)
- M8: UploadPageClient confirmRerun/cancelDuplicate wiring untested
- M9: FileUploadZone dragLeave state reset untested
- M10: dragOver assertion is trivially true (not.toBeNull on just-fetched element)
- M11: storagePath empty-string fallback (fileName='..') untested

## LOW

- L1: getUploadedFilesSchema has zero tests
- L2: checkDuplicate withTenant never asserted
- L3: checkDuplicate DB exception path untested
- L4: batchId passthrough to response not asserted
- L5: LARGE_FILE_WARNING_BYTES exact boundary (route uses >=, hook uses >) inconsistency

## INFO — weak assertions

- FileUploadZone dragOver: `expect(dropzone).not.toBeNull()` proves nothing
- UploadProgressList/DuplicateDetectionDialog: `.toBeTruthy()` → use `.toBeInTheDocument()`
