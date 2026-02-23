# Story 2.1 Test Review — Adversarial Analysis (2026-02-23)

Total test files: 13 | Total tests: 82 | All passing.

## Finding Index

| ID  | Severity | File                                  | Issue                                                        |
| --- | -------- | ------------------------------------- | ------------------------------------------------------------ |
| F1  | HIGH     | useFileUpload.test.ts                 | confirmRerun() completely untested                           |
| F2  | HIGH     | route.test.ts + useFileUpload.test.ts | LARGE_FILE_WARNING_BYTES boundary inconsistency not caught   |
| F3  | HIGH     | route.test.ts                         | DB insert empty-return 500 path not tested                   |
| F4  | MEDIUM   | route.test.ts                         | Storage idempotency branch untested                          |
| F5  | MEDIUM   | action tests (all 3)                  | withTenant() not asserted as called                          |
| F6  | MEDIUM   | uploadSchemas.test.ts                 | hash > 64 chars not tested                                   |
| F7  | MEDIUM   | useFileUpload.test.ts                 | XHR retry/backoff logic not tested                           |
| F8  | MEDIUM   | useFileUpload.test.ts                 | multi-file queue behaviour after duplicate not tested        |
| F9  | MEDIUM   | files.rls.test.ts                     | file_hash + uploaded_by columns not in seed → AC4 schema gap |
| F10 | LOW      | FileUploadZone.test.tsx               | toBeTruthy() instead of toBeInTheDocument()                  |
| F11 | LOW      | FileUploadZone.test.tsx               | Space key handler untested                                   |
| F12 | LOW      | FileUploadZone.test.tsx               | file input onChange path untested                            |
| F13 | LOW      | UploadProgressList.test.tsx           | 4 error codes never rendered in tests                        |
| F14 | LOW      | upload-batches.rls.test.ts            | created_by column not seeded or asserted                     |

## Detailed Findings

### F1 — HIGH: confirmRerun() is completely untested

**File:** `src/features/upload/hooks/useFileUpload.test.ts`
**Lines:** (no test exists)

`useFileUpload` exposes `confirmRerun()` — the function a user calls after seeing the
DuplicateDetectionDialog and choosing "Re-run QA". This function:

1. Clears `pendingDuplicate` state
2. Sets `isUploading = true`
3. Calls `uploadSingleFile()` on the blocked file
4. Then continues processing `pendingQueue` (the remaining files after the duplicate)

None of this is tested. The pending queue continuation path (`pendingQueue.length > 0`) in
`useFileUpload.ts:275-278` is completely dead from a test perspective.

**Bug Risk:** A regression in `confirmRerun` or the queue processing would pass all tests.
The path where a user uploads 3 files, file 1 is a duplicate, they click Re-run, and then
files 2+3 are processed — is entirely untested.

**AC Mapping:** AC3 — "re-run vs cancel" — only Cancel is tested; Re-run is missing.

---

### F2 — HIGH: LARGE_FILE_WARNING_BYTES boundary inconsistency not caught by any test

**Files:**

- `src/app/api/upload/route.ts:142` — uses `>=` (greater than or equal)
- `src/features/upload/hooks/useFileUpload.ts:199` — uses `>` (strictly greater than)

Both reference `LARGE_FILE_WARNING_BYTES = 10 * 1024 * 1024` (10,485,760 bytes).

A file at EXACTLY 10MB triggers the warning in `route.ts` (because `>=`) but does NOT
trigger it in `useFileUpload.ts` (because `>`). This is a real behavioral inconsistency:
the route and the hook disagree on whether the boundary value itself deserves a warning.

**No test in any file uses a file size of exactly `10 * 1024 * 1024` bytes.** All tests
use 11MB (above boundary) so the off-by-one boundary case is completely invisible.

**AC Mapping:** AC2 — "10-15MB warning" — the boundary point is untested.

---

### F3 — HIGH: DB insert returning empty array (500) is not tested in route handler

**File:** `src/app/api/upload/route.test.ts`
**Lines:** (no test exists for this path)

`route.ts:197-202` has:

```typescript
if (!fileRecord) {
  return NextResponse.json(
    { error: 'Failed to record file in database', fileName: file.name },
    { status: 500 },
  )
}
```

`route.test.ts` only tests the storage failure 500 (line 240-249). It never simulates
`mockReturningFn.mockResolvedValue([])` to test the DB-insert-failed path.

**Bug Risk:** Any regression in the DB-empty-return handler would be invisible.

---

### F4 — MEDIUM: Storage idempotency branch untested

**File:** `src/app/api/upload/route.test.ts`
**Lines:** (no test exists)

`route.ts:161`:

```typescript
if (storageError && storageError.message !== 'The resource already exists') {
```

The branch where storage returns an error with message `'The resource already exists'`
is deliberately treated as a success (idempotent re-upload of the same hash). This
intentional design decision has no test verifying:

- That a `'The resource already exists'` storage error does NOT produce a 500
- That processing continues normally when the file already exists in storage

**Bug Risk:** Someone could "fix" this branch by removing the string check, breaking
re-upload of duplicate files silently in production.

---

### F5 — MEDIUM: withTenant() is never asserted as called in action tests

**Files:**

- `src/features/upload/actions/checkDuplicate.action.test.ts:36-37`
- `src/features/upload/actions/getUploadedFiles.action.test.ts:35-37`

Both tests mock `withTenant` but never assert it was called with the user's tenantId.
Example — `checkDuplicate.action.test.ts` mocks `withTenant` but has zero assertions
like `expect(mockWithTenant).toHaveBeenCalledWith(...)`.

**Bug Risk:** If the developer accidentally removes the `withTenant()` call from a query,
all unit tests continue to pass. Only RLS integration tests would catch it — but those
run only when Supabase is running.

---

### F6 — MEDIUM: uploadSchemas.test.ts misses hash longer than 64 chars

**File:** `src/features/upload/validation/uploadSchemas.test.ts:101-107`

The schema uses `z.string().length(64)` which is an EXACT length constraint — it rejects
both too-short (< 64) AND too-long (> 64) strings. The test only verifies rejection for
too-short (`'abc123'`). A 65-character hash is never tested.

While unlikely in production (SHA-256 is always 64 hex chars), missing this test means
the schema constraint is only half-verified.

---

### F7 — MEDIUM: XHR retry/backoff logic is completely untested

**File:** `src/features/upload/hooks/useFileUpload.test.ts`
**Lines:** (no test exists)

`useFileUpload.ts:144-148` has:

```typescript
if (result.status === 0 && retryCount < UPLOAD_RETRY_COUNT) {
  const delay = UPLOAD_RETRY_BACKOFF_MS[retryCount] ?? 4000
  await sleep(delay)
  return uploadSingleFile(file, fileId, retryCount + 1)
}
```

`UPLOAD_RETRY_COUNT = 3` with backoffs `[1000, 2000, 4000]`. No test simulates a
network error (status 0) to verify:

- The hook retries up to 3 times
- After 3 failures, it correctly sets `status: 'error'` with `NETWORK_ERROR`
- The `STORAGE_ERROR` path (non-zero, non-200 status) is also untested

**AC Mapping:** AC1 — upload retry behavior is an implied reliability requirement.

---

### F8 — MEDIUM: Multi-file upload queue behaviour after duplicate not tested

**File:** `src/features/upload/hooks/useFileUpload.test.ts`

The hook only tests single-file duplicate detection. The scenario "3 files uploaded,
file 1 is a duplicate, queue holds files 2+3" is never exercised. `pendingQueue` state
is set at `useFileUpload.ts:237` but never read in any test.

---

### F9 — MEDIUM: files.rls.test.ts seed data missing file_hash and uploaded_by

**File:** `src/db/__tests__/rls/files.rls.test.ts:48-65`

The seed inserts do not include `file_hash` or `uploaded_by` columns:

```typescript
await admin.from('files').insert({
  tenant_id: tenantA.id,
  project_id: projectAId,
  file_name: 'report-a.sdlxliff',
  file_type: 'sdlxliff',
  file_size_bytes: 1024,
  storage_path: `${tenantA.id}/${projectAId}/abc123/report-a.sdlxliff`,
  status: 'uploaded',
})
```

Per AC4: "files table columns all present". The schema defines `file_hash varchar(64)`
and `uploaded_by uuid`. These columns are nullable, so the insert succeeds, but AC4 says
to verify the columns exist. The RLS test should also assert that `file_hash` is selectable
and that cross-tenant reads do not leak it.

---

### F10 — LOW: FileUploadZone.test.tsx uses weak toBeTruthy() assertions

**File:** `src/features/upload/components/FileUploadZone.test.tsx`
**Lines:** 24, 29, 41, 55, 64, 69, 79

All assertions use `.toBeTruthy()` instead of the semantically correct
`toBeInTheDocument()`. `toBeTruthy()` passes for any non-null/non-undefined value —
including elements that are in the document but also elements stored as references.
The project standard is `@testing-library/jest-dom` matchers.

**Example:**

```typescript
expect(screen.getByText('Switch to desktop for file upload')).toBeTruthy()
// Should be:
expect(screen.getByText('Switch to desktop for file upload')).toBeInTheDocument()
```

---

### F11 — LOW: Space key handler in FileUploadZone not tested

**File:** `src/features/upload/components/FileUploadZone.test.tsx`

`FileUploadZone.tsx:81-83` handles both Enter AND Space:

```typescript
onKeyDown={(e) => {
  if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
}}
```

Only Enter is tested (line 77-79). The Space key branch is untested.

---

### F12 — LOW: File input onChange path (handleInputChange) untested

**File:** `src/features/upload/components/FileUploadZone.test.tsx`

`FileUploadZone.tsx:50-55` has `handleInputChange` for when files are selected via the
native file picker (as opposed to drag-and-drop). No test simulates `fireEvent.change`
on the `input[type="file"]` element to verify the file-picker path calls `onFilesSelected`.

---

### F13 — LOW: UploadProgressList missing error code rendering tests

**File:** `src/features/upload/components/UploadProgressList.test.tsx`

The component renders different text for 6 distinct error codes. Only `NETWORK_ERROR`
is tested (line 45-50 — asserts "Upload failed"). These error codes are untested:

- `FILE_SIZE_EXCEEDED` → "File exceeds maximum size of 15MB."
- `UNSUPPORTED_FORMAT` → "Unsupported file format."
- `STORAGE_ERROR` → "Storage error. Please try again."
- `BATCH_SIZE_EXCEEDED` → "Batch limit exceeded."
- `DUPLICATE_FILE` → "Duplicate file detected."

Also missing: a test for `file.error = null` with `status = 'error'` (the `!file.error`
fallback path).

---

### F14 — LOW: upload-batches.rls.test.ts created_by column not seeded

**File:** `src/db/__tests__/rls/upload-batches.rls.test.ts:49-58`

Seed inserts omit `created_by` column:

```typescript
await admin.from('upload_batches').insert({
  tenant_id: tenantA.id,
  project_id: projectAId,
  file_count: 3,
})
```

The schema has `createdBy uuid references users`. While nullable, omitting it means the
RLS test never verifies the `created_by` FK works correctly under tenant isolation.
Low risk since RLS policy is on `tenant_id`, not `created_by`.

## AC Coverage Matrix

| AC  | Description                       | Covered?                                    | Gap                                                              |
| --- | --------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| AC1 | tenant-scoped storage paths       | YES (storagePath.test.ts)                   | retry/backoff untested                                           |
| AC1 | progress 0-100%                   | PARTIAL                                     | only static percent tested, not live XHR progression             |
| AC1 | SHA-256 hash                      | YES (fileHash.server.test.ts)               |                                                                  |
| AC1 | duplicate detection               | YES (checkDuplicate action)                 | confirmRerun untested                                            |
| AC2 | 15MB rejection BEFORE memory read | YES (Content-Length header test)            |                                                                  |
| AC2 | 10-15MB warning                   | PARTIAL                                     | boundary (exactly 10MB) not tested; operator inconsistency       |
| AC3 | duplicate alert with date + score | YES (DuplicateDetectionDialog)              |                                                                  |
| AC3 | re-run vs cancel                  | PARTIAL                                     | cancel tested; re-run tested in Dialog but hook confirmRerun not |
| AC4 | files table columns present       | PARTIAL                                     | file_hash/uploaded_by not in RLS seed                            |
| AC4 | no content in audit logs          | YES (route audit test checks metadata only) |                                                                  |
| AC5 | 50-file limit                     | YES (multiple layers)                       |                                                                  |
| AC5 | batch record                      | YES (createBatch.action.test.ts)            |                                                                  |
| AC5 | independent per-file tracking     | PARTIAL                                     | concurrent tracking not tested                                   |
