# Story 2.1: File Upload & Storage Infrastructure

Status: done

## Story

As a QA Reviewer,
I want to upload single or multiple translation files for QA processing,
so that I can start the quality analysis workflow.

## Acceptance Criteria

1. **Given** a QA Reviewer is on a project page
   **When** they click "Upload Files" and select one or more files (SDLXLIFF, XLIFF 1.2, or Excel)
   **Then** files are uploaded to Supabase Storage with tenant-scoped paths: `{tenant_id}/{project_id}/{file_hash}/{filename}` (NFR13)
   **And** upload progress bar shows 0-100%, updates every 100ms, displays estimated time remaining per file
   **And** each file receives a unique ID (uuid) and SHA-256 hash for tracking (FR1)
   **And** when same file uploaded twice, SHA-256 matches existing file hash and triggers duplicate detection UI

2. **Given** a file exceeds 15MB
   **When** the upload is attempted
   **Then** the upload is rejected immediately at the Route Handler BEFORE file is read into memory with error: "File exceeds maximum size of 15MB. Please split the file in your CAT tool" (NFR8, Architecture Decision 1.6)
   **And** the rejection occurs before any server-side processing begins
   **And** files between 10-15MB show a warning: "Large file — processing may be slower"

3. **Given** a user uploads a file that was previously uploaded to the same project
   **When** the SHA-256 hash matches an existing file
   **Then** the system alerts: "This file was uploaded on [date] (Score [X]) — re-run?" with options to re-run or cancel (FR6)

4. **Given** the upload completes
   **When** I inspect the database
   **Then** the files table contains: id, project_id, tenant_id, filename, file_hash, file_size, file_type (sdlxliff/xliff/excel), storage_path, status (uploaded/parsing/parsed/failed), uploaded_by, uploaded_at
   **And** file content is never written to application logs (NFR10)

5. **Given** multiple files are uploaded simultaneously (max 50 files per batch — FR17, UX spec)
   **When** the upload processes
   **Then** each file is tracked independently with its own status
   **And** a batch record is created linking all files from the same upload session
   **And** uploads exceeding 50 files are rejected with: "Maximum 50 files per batch. Upload remaining files in a separate batch."
   **And** batch aggregate progress shows "X of Y uploaded..." counter alongside per-file progress

## Tasks / Subtasks

- [x] Task 1: DB Schema Migration — `files` table alterations + `upload_batches` table (AC: #4, #5)
  - [x] 1.1 Update `src/db/schema/files.ts` — add `fileHash`, `uploadedBy` columns
  - [x] 1.2 Create `src/db/schema/uploadBatches.ts` — new batch tracking table
  - [x] 1.3 Update `src/db/schema/index.ts` + `src/db/schema/relations.ts` — register new table + relations
  - [x] 1.4 Run `npm run db:generate` → generates migration SQL (`0003_melted_tarot.sql`)
  - [x] 1.5 Add RLS policies for `upload_batches` table in `supabase/migrations/` (`00011_upload_batches_rls.sql`)
  - [x] 1.6 Run `npm run test:rls` — verify files + upload_batches RLS — **28/28 ✅**

- [x] Task 2: Upload Feature Module — Types, Validation & Constants (AC: #1, #2)
  - [x] 2.1 Create `src/features/upload/types.ts`
  - [x] 2.2 Create `src/features/upload/validation/uploadSchemas.ts`
  - [x] 2.3 Create `src/features/upload/constants.ts`
  - [x] 2.4 Unit tests for validation schemas + constants

- [x] Task 3: File Hash Utility + Storage Path Builder (AC: #1, #3)
  - [x] 3.1 Create `src/features/upload/utils/fileHash.server.ts`
  - [x] 3.2 Create `src/features/upload/utils/storagePath.ts`
  - [x] 3.3 Unit tests for hash + path utilities

- [x] Task 4: Route Handler — File Upload Endpoint (AC: #1, #2, #4)
  - [x] 4.1 Create `src/app/api/upload/route.ts`
  - [x] 4.2 15MB guard via Content-Length header + per-file size check
  - [x] 4.3 SHA-256 hash via Node.js `crypto.createHash`
  - [x] 4.4 Upload to Supabase Storage via `createAdminClient()`
  - [x] 4.5 Insert `files` record via Drizzle with `withTenant()` + cross-tenant FK guard on `projectId` + `batchId`
  - [x] 4.6 Write audit log entry (`file.uploaded`)
  - [x] 4.7 Unit tests — **14 tests ✅**

- [x] Task 5: Duplicate Detection Server Action (AC: #3)
  - [x] 5.1 Create `src/features/upload/actions/checkDuplicate.action.ts`
  - [x] 5.2 Return `isDuplicate`, `existingFileId`, `originalUploadDate`, `existingScore`
  - [x] 5.3 Unit tests ✅

- [x] Task 6: Batch Tracking Server Action (AC: #5)
  - [x] 6.1 Create `src/features/upload/actions/createBatch.action.ts`
  - [x] 6.2 Create `src/features/upload/actions/getUploadedFiles.action.ts`
  - [x] 6.3 Unit tests ✅

- [x] Task 7: Upload UI Components (AC: #1, #2, #3, #5)
  - [x] 7.1 Install shadcn Progress component
  - [x] 7.2 Create `FileUploadZone.tsx` — drag-and-drop + browse + mobile guard
  - [x] 7.3 Create `UploadProgressList.tsx` — per-file progress bars with ETA
  - [x] 7.4 Create `DuplicateDetectionDialog.tsx`
  - [x] 7.5 Create `FileSizeWarning.tsx` (uses design tokens — no inline palette colors)
  - [x] 7.6 Create `useFileUpload.ts` hook — XHR progress, retry backoff 1s/2s/4s, duplicate detection
  - [x] 7.7 Unit tests — **7 tests ✅** (XHR mock via real class extension pattern)

- [x] Task 8: Project Page Integration + Navigation (AC: #1)
  - [x] 8.1 Update `ProjectSubNav.tsx` — add "Files" tab (first position)
  - [x] 8.2 Create `src/app/(app)/projects/[projectId]/upload/page.tsx` — RSC wrapper
  - [x] 8.3 Create `UploadPageClient.tsx` — wires all upload components
  - [x] 8.4 `data-tour="project-upload"` attribute added to FileUploadZone
  - [x] 8.5 Mobile guard via `hidden md:block` pattern

- [x] Task 9: Integration & Testing
  - [x] 9.1 Add `buildFile()`, `buildUploadBatch()` factories to `src/test/factories.ts`
  - [x] 9.2 Full test suite — **57 files / 471 tests ✅** (0 regressions — updated after CR fixes)
  - [x] 9.3 Type check — **0 errors ✅**
  - [x] 9.4 Lint — **0 errors, 0 warnings ✅**

- [x] Task 10: CR Fixes (Post-Review — Amelia)
  - [x] H1: Wire `batchId` from `createBatch` → `startUpload(files, batchId)` → XHR FormData
  - [x] H2: Fix Content-Length fast-reject threshold for batch (was single-file 15MB, now `DEFAULT_BATCH_SIZE × (15MB + 64KB)`)
  - [x] H3: Add cross-tenant project ownership check in `createBatch.action.ts`
  - [x] H4: Sanitize `fileName` in `buildStoragePath` — strip `..`, `/`, `\`, null bytes
  - [x] H5: Fix stale closure in `confirmRerun` — capture `pendingQueue` snapshot before async call
  - [x] M1: Move duplicate check per-file inside upload loop (was first-file-only)
  - [x] M2: Remove dead `setInterval` (`UPLOAD_PROGRESS_INTERVAL_MS` — was no-op)
  - [x] M3: Set `BATCH_SIZE_EXCEEDED` error on all files when `startUpload` receives > 50 files
  - [x] M4: Extract `'The resource already exists'` as `STORAGE_ALREADY_EXISTS_ERROR` constant
  - [x] M5: Remove dead `fileUploadSchema` (unused in production, only in its own test)
  - [x] M6: Add DB indexes — `files(tenant_id, project_id, file_hash)` + `files(tenant_id, project_id)` in `00012_file_hash_index.sql`
  - [x] L1: Replace inline SVG with `lucide-react` `Upload` icon
  - [x] L2: Add `'data-tour'?: string` prop to `FileUploadZoneProps` type
  - [x] Tests: +9 new tests (confirmRerun, retry/backoff, per-file dup check, batchId FormData, BATCH_SIZE_EXCEEDED, 10MB boundary, DB empty 500, storage idempotency, PROJECT_NOT_FOUND guard, path traversal, hash>64, Space key, onChange, data-tour)

## Dev Notes

### Key Gotchas — Read Before Starting

1. **Route Handler, NOT Server Action for file upload**: Architecture specifies Route Handlers for "file upload w/ progress" (see API Patterns table in project-context.md). Binary multipart data + progress tracking requires Route Handler at `src/app/api/upload/route.ts`. Server Actions are for metadata operations (check duplicate, list files).

2. **15MB guard BEFORE reading into memory**: The Route Handler MUST check `Content-Length` header first (fast reject). If Content-Length is missing or spoofed, use streaming size counter that aborts at 15MB. Never buffer the entire file before checking size. [Source: Architecture Decision 1.6, NFR8]

3. **SHA-256 — different API per runtime**: In **Route Handler (Node.js)**: use `crypto.createHash('sha256').update(buffer).digest('hex')` — synchronous, simpler, standard Node.js. In **client hook (browser)**: use `crypto.subtle.digest('SHA-256', buffer)` — async Web Crypto API for duplicate pre-check before upload. Create `fileHash.server.ts` (server-only) and inline Web Crypto in `useFileUpload` hook. Do NOT import Node.js `crypto` in client code — build will fail.

4. **Supabase Admin client for Storage uploads, Drizzle for DB**: Upload the actual file via `createAdminClient()` from `@/lib/supabase/admin` — NOT `createServerClient()` from `server.ts` (which uses anon key and is subject to RLS, causing upload to fail). Pattern: `const admin = createAdminClient(); admin.storage.from('project-files').upload(path, file)`. All metadata goes to the `files` table via Drizzle ORM. Never mix these — Supabase client for Storage/Auth/Realtime ONLY.

5. **No file content in logs (NFR10)**: Log only metadata: `{ fileId, fileName, fileSizeBytes, fileType, tenantId, projectId }`. NEVER log file bytes, source text, or target text. Use `pino` structured logging with explicit field allowlist.

6. **Client-side validation first, server-side as defense-in-depth**: Validate file type + size on the client before uploading (fast UX feedback). The server Route Handler re-validates as security layer.

7. **`files` table already exists** — The schema at `src/db/schema/files.ts` already has core columns. You need to ADD `fileHash` and `uploadedBy` via ALTER TABLE migration. Do NOT recreate the table.

8. **Progress tracking is client-side**: Use `XMLHttpRequest` or `fetch` with `ReadableStream` for upload progress. The Route Handler does NOT send progress events — the client tracks bytes sent vs total.

9. **ProcessingModeDialog is OUT OF SCOPE**: The Economy/Thorough mode selection dialog referenced in UX spec belongs to **Story 2.6 (Inngest Pipeline Foundation)**. This story uploads files and sets status to `uploaded` — pipeline triggering and mode selection happen in Story 2.6.

10. **Mobile behavior**: UX spec defines mobile (<768px) as "Dashboard only" — upload functionality is desktop-only. Show a responsive banner "Switch to desktop for file upload" and hide the upload zone on mobile viewports. Use Tailwind `hidden md:block` pattern.

11. **`MAX_FILE_SIZE_BYTES` and `DEFAULT_BATCH_SIZE` ALREADY EXIST**: Both constants live at `src/lib/constants.ts` (`MAX_FILE_SIZE_BYTES = 15_728_640`, `DEFAULT_BATCH_SIZE = 50`). Import from `@/lib/constants` — do NOT recreate in `src/features/upload/constants.ts`. Only create feature-specific constants: `LARGE_FILE_WARNING_BYTES = 10 * 1024 * 1024`, `ALLOWED_FILE_TYPES`, `ALLOWED_EXTENSIONS`.

12. **NO Inngest event emission in Story 2.1**: This story sets file status to `uploaded` and stops. Do NOT emit `pipeline.started` or `qa/file.uploaded` Inngest events — that wiring belongs to **Story 2.6 (Inngest Pipeline Foundation)** which creates the orchestrator function that consumes these events. Emitting events now with no consumer creates dead events.

13. **50-file batch limit**: UX spec + FR17 + `DEFAULT_BATCH_SIZE = 50` in `@/lib/constants`. Validate on BOTH client (FileUploadZone rejects > 50 files in drag-drop handler) AND server (Route Handler checks file count in FormData). Error: "Maximum 50 files per batch."

14. **Network error retry**: UX spec requires auto-retry 3x for upload network failures. Implement in `useFileUpload` hook: `XHR.onerror` → retry with exponential backoff (1s, 2s, 4s), max 3 attempts. After 3 failures → show persistent error toast: "Upload interrupted. [Retry]"

15. **Supabase Storage bucket**: Bucket name is `project-files`. If bucket doesn't exist, upload will 404. Dev must either create bucket via Supabase Dashboard or add creation to Supabase migration. Verify bucket exists before testing.

---

### Critical Architecture Patterns & Constraints

#### DB Schema: `files` Table Update (REQUIRED — Do First)

The existing `files` table (`src/db/schema/files.ts`) is missing columns required by this story's AC #4:

```typescript
// src/db/schema/files.ts (updated — ADD these columns)
import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core'

import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  fileName: varchar('file_name', { length: 500 }).notNull(),
  fileType: varchar('file_type', { length: 20 }).notNull(), // 'sdlxliff' | 'xliff' | 'xlsx'
  fileSizeBytes: integer('file_size_bytes').notNull(),
  fileHash: varchar('file_hash', { length: 64 }),          // NEW — SHA-256 hex (64 chars), nullable for legacy rows
  storagePath: varchar('storage_path', { length: 1000 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('uploaded'),
  // 'uploaded' | 'parsing' | 'parsed' | 'failed'
  uploadedBy: uuid('uploaded_by')                           // NEW — who uploaded
    .references(() => users.id, { onDelete: 'set null' }),
  batchId: uuid('batch_id'),                                // NEW — links to upload_batches (nullable for single uploads)
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**New columns to add:**
- `file_hash` VARCHAR(64) — SHA-256 hex digest. Nullable for backward compat.
- `uploaded_by` UUID FK → users.id — who uploaded the file.
- `batch_id` UUID — links to `upload_batches` table for grouping multi-file uploads.

#### New Table: `upload_batches`

```typescript
// src/db/schema/uploadBatches.ts (NEW)
import { pgTable, uuid, integer, timestamp } from 'drizzle-orm/pg-core'

import { projects } from './projects'
import { tenants } from './tenants'
import { users } from './users'

export const uploadBatches = pgTable('upload_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  fileCount: integer('file_count').notNull(),
  createdBy: uuid('created_by')
    .references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**Relations to add in `relations.ts`:**
- `files` → `uploadBatches` (many-to-one via `batchId`)
- `uploadBatches` → `files` (one-to-many)
- `uploadBatches` → `projects`, `tenants`, `users`

#### Route Handler Pattern — `POST /api/upload`

```typescript
// src/app/api/upload/route.ts
// Route Handler — NOT Server Action (binary data + progress tracking)
import { NextRequest, NextResponse } from 'next/server'

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024 // 15MB hard limit
const ALLOWED_TYPES = ['sdlxliff', 'xliff', 'xlsx', 'xlf'] as const

export async function POST(request: NextRequest) {
  // 1. Auth check — getCurrentUser() (reads JWT from cookies)
  // 2. Check Content-Length header → reject > 15MB BEFORE reading body
  // 3. Parse multipart/form-data
  // 4. Validate batch size (max 50 files = DEFAULT_BATCH_SIZE from @/lib/constants)
  // 5. For each file:
  //    a. Validate file type (extension-based allowlist)
  //    b. Streaming size check (defense against spoofed Content-Length)
  //    c. Compute SHA-256 hash via crypto.createHash('sha256') (Node.js)
  //    d. Upload to Supabase Storage via createAdminClient() (admin.ts, NOT server.ts)
  //    e. Insert files record via Drizzle with withTenant()
  //    f. Write audit log (file.uploaded)
  // 6. Return { success: true, data: { files: [...], batchId } }

  // CRITICAL: Never log file content (NFR10)
  // CRITICAL: Always use withTenant() on DB queries
  // CRITICAL: Write audit log for each file upload
  // CRITICAL: Use createAdminClient() for Storage (service_role bypasses RLS)
  // DO NOT emit Inngest events — Story 2.6 handles pipeline triggering
}
```

**Why Route Handler instead of Server Action:**
- Server Actions have a 1MB body size limit by default in Next.js
- Route Handlers support streaming and multipart/form-data natively
- Progress tracking requires XHR on client side → needs a URL endpoint
- Architecture explicitly maps "file upload w/ progress" to Route Handlers

#### Client Upload Hook Pattern

```typescript
// src/features/upload/hooks/useFileUpload.ts
'use client'

// Orchestration flow:
// 1. Client validates file type + size + batch count (max 50 = DEFAULT_BATCH_SIZE)
// 2. If 10-15MB → show warning, allow continue
// 3. Compute SHA-256 hash client-side (Web Crypto API — crypto.subtle.digest)
// 4. Call checkDuplicate action with hash + projectId
// 5. If duplicate → show DuplicateDetectionDialog
// 6. Upload via XHR to /api/upload (for progress events)
// 7. Track progress per-file (bytes sent / total) + batch aggregate ("X of Y uploaded...")
// 8. On network error → auto-retry 3x with exponential backoff (1s, 2s, 4s)
// 9. On completion → refresh file list
```

**Progress tracking approach:**
```typescript
// Use XMLHttpRequest for upload progress events
const xhr = new XMLHttpRequest()
xhr.upload.onprogress = (event) => {
  if (event.lengthComputable) {
    const percent = Math.round((event.loaded / event.total) * 100)
    updateProgress(fileId, percent, event.loaded, event.total)
  }
}
```

#### Supabase Storage Configuration

**Bucket:** `project-files` (create in Supabase Dashboard or via `supabase/migrations/` SQL before testing)
**Client:** `createAdminClient()` from `@/lib/supabase/admin` (service_role key — bypasses Storage RLS)

**Storage Path Convention:**
```
project-files/{tenant_id}/{project_id}/{file_hash}/{filename}

Example:
project-files/abc-123/proj-456/e3b0c44298fc1c14.../report.sdlxliff
```

**Storage RLS (Supabase):** Configure bucket-level RLS so users can only access files within their tenant. This is separate from DB-level RLS on the `files` table.

#### SHA-256 Hash — Server vs Client

```typescript
// SERVER (Route Handler — fileHash.server.ts)
import 'server-only'
import { createHash } from 'crypto'

export function computeFileHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

// CLIENT (useFileUpload hook — inline Web Crypto)
async function computeClientHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
```

#### File Type Detection

```typescript
// Detect file type from extension (not MIME type — browser MIME detection is unreliable)
function getFileType(fileName: string): 'sdlxliff' | 'xliff' | 'xlsx' | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'sdlxliff') return 'sdlxliff'
  if (ext === 'xlf' || ext === 'xliff') return 'xliff'
  if (ext === 'xlsx') return 'xlsx'
  return null
}
```

#### Duplicate Detection Flow

```typescript
// src/features/upload/actions/checkDuplicate.action.ts
'use server'
import 'server-only'

// 1. Query: SELECT f.*, s.mqm_score, s.status as score_status
//           FROM files f
//           LEFT JOIN scores s ON s.file_id = f.id
//           WHERE f.file_hash = :hash
//             AND f.project_id = :projectId
//             AND f.tenant_id = :tenantId
//           ORDER BY f.created_at DESC
//           LIMIT 1
// 2. If found → return { isDuplicate: true, originalUploadDate, existingScore }
// 3. If not → return { isDuplicate: false }
```

#### File Upload UI — Drag-and-Drop Zone

```
┌──────────────────────────────────────────────┐
│                                              │
│       Drag & drop translation files here     │
│       or [Browse Files]                      │
│                                              │
│       Supported: .sdlxliff, .xlf, .xliff,   │
│       .xlsx                                  │
│       Max: 15MB per file · 50 files per batch│
│                                              │
└──────────────────────────────────────────────┘

Upload Progress:              2 of 3 uploaded...
┌──────────────────────────────────────────────┐
│ report-01.sdlxliff   ████████████░░░  78%   │
│                       8.2MB / 10.5MB  ~3s   │
│ report-02.xlf        ██████████████░  92%   │
│                       2.1MB / 2.3MB   ~1s   │
│ data.xlsx            ████████████████  Done  │
│                       1.4MB / 1.4MB         │
└──────────────────────────────────────────────┘
```

**Component uses:**
- Dashed border drop zone (design token borders, not arbitrary)
- `Upload` icon from `lucide-react`
- shadcn `Progress` component for bars
- shadcn `Dialog` for duplicate detection
- `sonner` toast for success/error feedback

#### Testing Standards

- `vi.mock('server-only', () => ({}))` FIRST in every server-side test file
- Factory functions from `src/test/factories.ts` — add `buildFile()`, `buildUploadBatch()`
- Test naming: `describe("POST /api/upload")` → `it("should reject files exceeding 15MB")`
- Mock Supabase Storage: `vi.mock('@/lib/supabase/admin', ...)`
- Mock file: `new File([new ArrayBuffer(100)], 'test.sdlxliff', { type: 'application/xml' })`
- Target: ~25-35 unit tests

#### Security Checklist

| Check | Implementation |
|-------|---------------|
| Auth required | `getCurrentUser()` at start of Route Handler |
| Tenant isolation | `withTenant()` on all DB queries + tenant-scoped storage path |
| File size limit | Check `Content-Length` → streaming size counter → 15MB hard reject |
| File type validation | Extension-based allowlist (sdlxliff, xlf, xliff, xlsx) |
| No content in logs | Only log metadata fields via pino (fileName, size, hash, type) |
| Audit trail | `writeAuditLog()` for every file upload (file.uploaded) |
| M3 RBAC | `requireRole('qa_reviewer', 'write')` for upload action |
| Hash validation | SHA-256 is computed server-side (client hash is for duplicate pre-check only) |

#### Existing Patterns to Follow

| Pattern | Reference File | What to Copy |
|---------|---------------|-------------|
| Server Action with auth + audit | `src/features/project/actions/createProject.action.ts` | requireRole → validate → DB insert → audit → revalidate |
| Zod validation schemas | `src/features/project/validation/projectSchemas.ts` | Schema definition + export pattern |
| Route Handler | `src/app/api/inngest/route.ts` | Named export pattern for HTTP methods |
| DB schema | `src/db/schema/files.ts` | pgTable definition with FK references |
| withTenant helper | `src/db/helpers/withTenant.ts` | Apply to every query in actions |
| Test factories | `src/test/factories.ts` | buildFile(), buildUploadBatch() |
| Supabase Storage (admin) | `src/lib/supabase/admin.ts` | createAdminClient() for Storage upload (bypasses RLS — NOT server.ts) |
| Supabase Auth (server) | `src/lib/supabase/server.ts` | createServerClient() for cookie-based auth in Server Components |
| Audit log | `src/features/audit/actions/writeAuditLog.ts` | writeAuditLog({ entityType: 'file', action: 'file.uploaded', ... }) |

### Project Structure Notes

**New files to create:**
```
src/features/upload/
  types.ts
  constants.ts
  validation/
    uploadSchemas.ts
    uploadSchemas.test.ts
  utils/
    fileHash.server.ts
    fileHash.server.test.ts
    storagePath.ts
    storagePath.test.ts
  actions/
    checkDuplicate.action.ts
    checkDuplicate.action.test.ts
    createBatch.action.ts
    createBatch.action.test.ts
    getUploadedFiles.action.ts
    getUploadedFiles.action.test.ts
  hooks/
    useFileUpload.ts
    useFileUpload.test.ts
  components/
    FileUploadZone.tsx
    FileUploadZone.test.tsx
    UploadProgressList.tsx
    DuplicateDetectionDialog.tsx
    FileSizeWarning.tsx

src/db/schema/
  uploadBatches.ts (NEW table)

src/app/api/upload/
  route.ts (NEW — POST handler)

src/app/(app)/projects/[projectId]/upload/
  page.tsx (NEW — RSC wrapper)
```

**Files to modify:**
```
src/db/schema/files.ts           (add fileHash, uploadedBy, batchId columns)
src/db/schema/index.ts           (export uploadBatches + uploadBatchesRelations)
src/db/schema/relations.ts       (add uploadBatches relations + update files relations)
src/test/factories.ts            (add buildFile, buildUploadBatch factories)
src/features/project/components/ProjectSubNav.tsx  (add "Files" tab)
```

**DB Migration files (auto-generated by `npm run db:generate`):**
```
src/db/migrations/XXXX_add_file_upload_columns.sql
src/db/migrations/meta/XXXX_snapshot.json
```

**Supabase migration (manual — RLS + Storage):**
```
supabase/migrations/XXXXX_upload_batches_rls.sql
```

**Alignment:** All paths follow feature-based co-location pattern. Named exports only, `@/` alias, no barrel exports.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-2-file-processing-rule-based-qa-engine.md#Story 2.1]
- [Source: _bmad-output/planning-artifacts/prd.md#FR1-FR7 (File Management & Parsing)]
- [Source: _bmad-output/planning-artifacts/prd.md#NFR1, NFR7, NFR8, NFR10, NFR13]
- [Source: _bmad-output/planning-artifacts/architecture/ — Decision 1.6 (15MB guard), Decision 1.5 (RLS), Decision 3.1 (API patterns)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/ux-consistency-patterns.md#File Upload Pattern]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/component-strategy.md#ProcessingModeDialog, FileStatusCard]
- [Source: _bmad-output/planning-artifacts/ux-design-specification/core-user-experience.md#Drag & Drop Upload]
- [Source: _bmad-output/project-context.md#API Patterns, SDLXLIFF Parser Rules, Multi-Tenancy Rules]
- [Source: src/db/schema/files.ts — existing schema (needs migration)]
- [Source: src/features/project/actions/createProject.action.ts — Server Action pattern reference]
- [Source: src/app/api/inngest/route.ts — Route Handler pattern reference]
- [Source: src/lib/supabase/server.ts — Supabase client factory]
- [Source: src/features/audit/actions/writeAuditLog.ts — Audit log pattern]
- [Source: src/db/helpers/withTenant.ts — Tenant isolation helper]
- [Source: src/lib/auth/requireRole.ts — M3 RBAC pattern]
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-02-23.md — Epic 1 learnings + prep tasks]
- [Source: _bmad-output/implementation-artifacts/1-7-dashboard-notifications-onboarding.md — Previous story patterns]

### Previous Story Intelligence (Story 1.7)

Key learnings from the immediately preceding story that apply here:

1. **Proxy-based lazy initialization works**: `env.ts` and `db/client.ts` use Proxy pattern — any new page importing DB client needs `export const dynamic = 'force-dynamic'` unless it uses `cookies()` (which auto-dynamicizes).

2. **Mock patterns for Drizzle**: Use Proxy-based chainable mock for complex query chains (`.select().from().where().leftJoin()...`). See Story 1.7 Debug Log for pattern.

3. **`exactOptionalPropertyTypes`**: When nullable DB columns are typed, be careful with `null` vs `undefined`. Drizzle returns `null` for nullable columns, not `undefined`.

4. **CR found tenantId gaps**: Story 1.7 CR Round 2 caught a missing `tenantId` filter in `markNotificationRead`. Use `withTenant()` on EVERY query — defense-in-depth.

5. **Test with `--pool=forks --maxWorkers=1`** if OOM occurs during full test suite.

### Git Intelligence Summary

Recent commits show Story 1.7 completion + sub-agent integration. Key observations:
- Project uses Conventional Commits: `feat(scope):`, `fix(scope):`, `chore(scope):`
- Sub-agent scanning is now integrated into CR workflow — expect anti-pattern + tenant isolation checks
- CI quality gate: lint → type-check → unit tests → RLS tests → build
- E2E gate runs on merge to main (48 tests passing)

### Epic 1 Retrospective — Process Improvements to Apply

From `_bmad-output/implementation-artifacts/epic-1-retro-2026-02-23.md`:

1. **A1: Architecture Assumption Checklist** — Validate route/architecture assumptions BEFORE coding. For Story 2.1: confirm `/projects/[projectId]/upload` route exists in layout, confirm Supabase Storage bucket configuration, confirm multipart/form-data support in Next.js Route Handlers.

2. **A2: Front-load Anti-pattern Review** — Review all 14 anti-patterns BEFORE implementation (see CLAUDE.md Anti-Patterns table). Critical for this story: no `console.log`, no raw SQL, no inline Supabase client, audit log for every state change.

3. **Gap Closure docs available** — Read these BEFORE starting:
   - `_bmad-output/e2e-testing-gotchas.md`
   - `_bmad-output/drizzle-typescript-gotchas.md`
   - `_bmad-output/inngest-setup-guide.md` (for understanding pipeline trigger)
   - `e2e/helpers/fileUpload.ts` (Playwright file upload helper — ready for E2E)

### Known Risks (from Epic 1 Retro)

| Risk | Impact | Mitigation |
|------|--------|-----------|
| R4: Architecture Assumption Checklist not created yet | Could cause scope drift like Story 1.7's 4→2 step tour reduction | Dev validates route structure + Storage config BEFORE coding Task 7 |
| Next.js Route Handler body size | Default may limit multipart size | Configure `bodyParser: { sizeLimit: '16mb' }` in route config (slightly above 15MB for overhead) |
| Supabase Storage bucket doesn't exist yet | Upload will 404 | Create bucket via Supabase Dashboard or migration before testing |

## Definition of Done — Verification

```bash
# 1. Ensure Supabase is running, generate + apply migration
npx supabase start && npm run db:generate && npm run db:migrate

# 2. Type check
npm run type-check

# 3. Run upload feature tests
npx vitest run src/features/upload
npx vitest run src/app/api/upload

# 4. Run RLS tests (if new table added)
npm run test:rls

# 5. Run full test suite (check for regressions)
npm run test:unit -- --pool=forks --maxWorkers=1

# 6. Lint check
npm run lint

# 7. Dev server smoke test
npm run dev
# → login → navigate to project → verify upload zone renders
# → try uploading a .sdlxliff file → verify progress + DB record
# → try uploading > 15MB → verify rejection
# → try uploading duplicate → verify detection dialog

# 8. If all pass → story is done
```

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

1. **XHR mock `is not a constructor`** — `vi.fn(() => mockXhr)` ไม่สามารถใช้เป็น constructor ได้ใน jsdom แก้โดยเปลี่ยนเป็น real class `class FakeXHR extends MockXHR` ใน `setupXhrMock()`
2. **`should mark file as large warning` test timeout** — deadlock เพราะ `await startUpload(...)` รอ XHR ที่ยังไม่ถูก trigger แก้ด้วย fire-and-forget: `act(() => { void result.current.startUpload(...) })` + `await waitFor(...)`
3. **Drizzle migration `DATABASE_URL: undefined`** — `drizzle-kit` ไม่อ่าน `.env.local` อัตโนมัติ แก้ด้วย `npx dotenv-cli -e .env.local -- npm run db:migrate`
4. **`supabase start` port conflict** — port 54322 ถูกใช้โดย project `zyncdata` แก้ด้วย `npx supabase stop --project-id zyncdata` ก่อน
5. **`supabase start` migration error** — `00010_upload_batches_rls.sql` ทำงานก่อน CREATE TABLE แก้โดย split เป็น `00010_story_2_1_schema.sql` (DDL) + `00011_upload_batches_rls.sql` (RLS)
6. **Tenant isolation HIGH findings** — Tenant Isolation Checker พบ `projectId` + `batchId` จาก FormData ไม่ถูก verify ownership เพิ่ม `withTenant()` + `eq()` SELECT queries ก่อน processing loop

### Completion Notes List

1. Anti-pattern scan: 0 CRITICAL, 0 HIGH — MEDIUM/LOW ทั้งหมดแก้ก่อน review (inline Tailwind colors → design tokens, explicit array type, remove re-export proxy)
2. Tenant isolation scan: PASS — ทุก action ใช้ `withTenant()` ถูกต้อง, route handler มี FK ownership guard ทั้ง projectId + batchId
3. Cloud DB: Drizzle migration applied ✅, RLS policies applied ✅ (upload_batches: 4 policies)
4. Local Supabase: ทำงานได้ปกติหลัง fix migration ordering, RLS tests 28/28 ✅
5. `@testing-library/user-event` ถูก install เพิ่มเป็น dev dependency
6. **CR Round 1 (Amelia)** — 5 HIGH, 6 MEDIUM, 7 LOW findings — ทั้งหมดแก้ครบ (Task 10)
7. **CR Round 1 Final: 57 test files / 471 tests ✅ | type-check ✅ | lint 0 errors ✅**
8. **CR Round 2 (Amelia)** — 7 HIGH · 13 MEDIUM · 7 LOW findings — ทั้งหมดแก้ครบ (Task 10 CR Round 2)
9. **CR Round 2 Final: 59 test files / 495 tests ✅ | type-check ✅ | lint 0 errors ✅**
10. **CR Round 3 (Amelia)** — 1 CRITICAL · 7 HIGH findings — ทั้งหมดแก้ครบ (Task 10 CR Round 3)
11. **Final: 60 test files / 507 tests ✅ | type-check ✅ | lint 0 errors ✅**

### Code Review Round 1 (2026-02-23)

**Reviewer:** claude-sonnet-4-6 (adversarial code review via bmad-agent-bmm-dev)

**18 findings fixed (5 HIGH · 6 MEDIUM · 7 LOW):**

**HIGH**
1. **H1 — batchId never threaded to FormData** (`UploadPageClient.tsx`): `createBatch()` result was called but `batchResult.data.id` was discarded — files uploaded in batch mode were never linked to their batch record. Fixed: `startUpload(files, batchResult.data.id)` — added optional `batchId` param through `startUpload` → `processFiles` → `uploadSingleFile` → `uploadWithProgress` (FormData.append). Also added `currentBatchId` state to persist across `confirmRerun`.
2. **H2 — Content-Length guard used single-file threshold** (`route.ts`): `Content-Length > MAX_FILE_SIZE_BYTES` only caught a single oversized file, allowing a batch of 50×15MB (750MB) through the early-exit guard. Fixed: threshold raised to `DEFAULT_BATCH_SIZE * (MAX_FILE_SIZE_BYTES + 65536)`.
3. **H3 — No cross-tenant project ownership check** (`createBatch.action.ts`): Attacker could supply any valid UUID as `projectId` from another tenant — batch would be linked to a foreign project. Fixed: added SELECT query with `withTenant()` + `eq(projects.id, projectId)` before INSERT; returns `PROJECT_NOT_FOUND` if project does not belong to the requesting tenant.
4. **H4 — Path traversal in storage path** (`storagePath.ts`): `buildStoragePath` used raw `fileName` — attacker could supply `../../etc/passwd` to escape bucket prefix. Fixed: added `sanitizeFileName()` that strips `..`, `/`, `\`, and null bytes before constructing the storage path.
5. **H5 — Stale closure in `confirmRerun`** (`useFileUpload.ts`): `confirmRerun` read `pendingQueue` inside a `.then()` callback AFTER `setPendingQueue([])` had already cleared it — re-run queue was always empty. Fixed: `const queue = pendingQueue; const batchId = currentBatchId` captured synchronously before any state mutations.

**MEDIUM**
6. **M1 — Duplicate check only on first file** (`useFileUpload.ts`): `checkDuplicate` was called once before the upload loop — files 2–50 in a batch bypassed duplicate detection entirely. Fixed: moved duplicate check inside the `for` loop; each file is individually checked before its XHR upload.
7. **M2 — Dead `setInterval` polling code** (`useFileUpload.ts`): `UPLOAD_PROGRESS_INTERVAL_MS` was referenced but the `setInterval` block was never connected to XHR progress events — dead code that would never execute. Fixed: removed the dead constant and polling block; progress is tracked via `xhr.upload.addEventListener('progress', ...)`.
8. **M3 — Silent drop on batch > 50 files** (`useFileUpload.ts`): `startUpload` returned early without setting any error state when `files.length > DEFAULT_BATCH_SIZE` — the UI showed no feedback to the user. Fixed: sets `BATCH_SIZE_EXCEEDED` error on all files before returning, `isUploading` stays `false`.
9. **M4 — Magic string for storage error** (`route.ts`): `'The resource already exists'` was inline — fragile against Supabase error message changes. Fixed: extracted to `const STORAGE_ALREADY_EXISTS_ERROR`.
10. **M5 — Dead `fileUploadSchema` exported** (`uploadSchemas.ts`): Schema was defined and exported but never consumed anywhere after the Route Handler approach was finalized (Server Action body-size limit ruled out Server Action upload). Fixed: removed dead export; only `checkDuplicateSchema` and `createBatchSchema` remain.
11. **M6 — Missing composite indexes on `files` table** (`supabase/migrations/`): `00005_performance_indexes.sql` covers `audit_logs/findings/segments/scores/user_roles` but NOT `files` — `checkDuplicate` queries `(tenant_id, project_id, file_hash)` and `getUploadedFiles` queries `(tenant_id, project_id)` with no indexes. Fixed: `00012_file_hash_index.sql` adds `files_tenant_project_hash_idx (tenant_id, project_id, file_hash)` and `files_tenant_id_project_id_idx (tenant_id, project_id)`.

**LOW**
12. **L1 — Inline SVG instead of lucide-react icon** (`FileUploadZone.tsx`): Upload icon was a hand-crafted inline SVG — inconsistent with project-wide `lucide-react` usage pattern. Fixed: replaced with `<Upload className="h-10 w-10 text-text-muted" aria-hidden="true" />` from `lucide-react`.
13. **L2 — Missing `data-tour` prop type** (`FileUploadZone.tsx`): Component accepted `data-tour` via spread but was not declared in `FileUploadZoneProps` — type-unsafe and breaks TypeScript strict mode. Fixed: added `'data-tour'?: string` to props interface, properly destructured and forwarded to the drop zone div.
14. **L3 — Import order violation** (`FileUploadZone.tsx`): ESLint import order rule requires `lucide-react` before `react` imports. Fixed: reordered imports to satisfy `simple-import-sort` plugin.
15. **L4 — Loose test assertion `.toBeTruthy()`** (`FileUploadZone.test.tsx`): `.toBeTruthy()` passes for any truthy value including non-null strings, defeating DOM presence assertions. Fixed: replaced with `.not.toBeNull()` for precise element presence check.
16. **L5 — Missing hash length boundary test** (`uploadSchemas.test.ts`): Schema validated hash format but no test covered the >64-char rejection path. Fixed: added `it("should reject fileHash longer than 64 chars")` test.
17. **L6 — Missing DB empty-return 500 test** (`route.test.ts`): Route Handler's `db.insert().returning()` failure path (empty array) had no test coverage. Fixed: added test asserting HTTP 500 with `{ success: false }` when DB insert returns empty.
18. **L7 — Missing storage idempotency test** (`route.test.ts`): `STORAGE_ALREADY_EXISTS_ERROR` branch (re-upload same file → treat as success) had no test coverage. Fixed: added test asserting HTTP 200 when Supabase Storage returns "already exists" error.

**Post-fix verification:**
- Type check: 0 errors (`npm run type-check`)
- Lint: 0 errors (`npm run lint`)
- Tests: 57 test files · **471/471 PASSING** (`npm run test:unit`)

### Code Review Round 2 (2026-02-23)

**Reviewer:** claude-sonnet-4-6 (adversarial code review via bmad-agent-bmm-dev, parallel sub-agents: code-quality-analyzer + testing-qa-expert)

**27 findings fixed (7 HIGH · 13 MEDIUM · 7 LOW):**

**HIGH**
1. **H1 — Storage orphan on DB insert failure** (`route.ts`): If Supabase Storage upload succeeded but DB insert failed, the stored file was never cleaned up — orphaned binary in Storage. Fixed: added `admin.storage.from(UPLOAD_STORAGE_BUCKET).remove([storagePath])` before returning 500 when `fileRecord` is undefined.
2. **H2 — Audit log exception aborted batch** (`route.ts`): `await writeAuditLog()` was unguarded — if it threw (e.g. DB timeout), the entire route handler returned 500 even though the file had already been uploaded. Fixed: wrapped in try/catch; failure is logged as non-fatal (`logger.error`) and processing continues.
3. **H3 — cancelDuplicate left queued files in 'pending' UI state** (`useFileUpload.ts`): When user cancelled duplicate dialog, files that were queued behind the duplicate remained in `progress` array with `status: 'pending'` — misleading UI showing files "uploading" that never would. Fixed: `setProgress((prev) => prev.filter((f) => f.status !== 'pending'))`.
4. **H4 — No UUID format validation on FormData inputs** (`route.ts`): `projectId` and `batchId` were used directly in DB queries with no format check — malformed input could cause DB errors. Fixed: added `z.string().uuid().safeParse()` validation for both fields, returning 400 on failure.
5. **H5 — confirmRerun overwrote previous progress on append** (`useFileUpload.ts`): `processFiles()` always called `setProgress(initialProgress)` — when confirming a duplicate mid-batch, the previously uploaded files' progress was wiped. Fixed: added `append=false` param; `confirmRerun` calls `processFiles(queue, batchId, true)` which merges rather than replaces.
6. **H6 — FileSizeWarning had zero test coverage** (`FileSizeWarning.test.tsx`): Component was untested. Fixed: created 4 tests (empty renders nothing, non-empty shows alert, filename displayed, multiple filenames joined).
7. **H7 — UploadPageClient had zero test coverage** (`UploadPageClient.test.tsx`): Integration component was untested. Fixed: created 4 tests (single file → no batch, multi-file → createBatch + batchId, createBatch failure → toast, pendingDuplicate → dialog shown).

**MEDIUM**
8. **M1 — getFileType duplicated in route.ts and useFileUpload.ts** (`utils/fileType.ts`): Same `getFileType` function existed in two files with divergent risk of drift. Fixed: extracted to `src/features/upload/utils/fileType.ts` with `SupportedFileType` union type; both files import from shared utility.
9. **M2 — UploadFileResult.batchId typed as `string`** (`types.ts`): Single-file uploads never have a batchId — should be `string | null`. Fixed: updated to `batchId: string | null`.
10. **M3 — UploadFileResult missing literal type unions** (`types.ts`): `fileType` and `status` were `string` — weaker than necessary. Fixed: `fileType: 'sdlxliff' | 'xliff' | 'xlsx'`, `status: 'uploaded' | 'parsing' | 'parsed' | 'failed'`.
11. **M4 — batchTotal computed incorrectly** (`UploadPageClient.tsx`): Complex formula using `uploadedFiles.length + progress.filter(...)` was error-prone. Fixed: simplified to `progress.length` — reflects all tracked files regardless of status.
12. **M5 — getUploadedFilesSchema defined inline in action** (`getUploadedFiles.action.ts`): Schema was not co-located with other upload schemas, breaking consistency. Fixed: moved to `uploadSchemas.ts`, imported in action.
13. **M6 — `UPLOAD_PROGRESS_INTERVAL_MS` dead constant** (`constants.ts`): Constant was exported but never consumed (setInterval was removed in CR Round 1). Fixed: deleted dead constant.
14. **M7 — uploadedFiles unused in UploadPageClient** (`UploadPageClient.tsx`): Destructured but never rendered. Fixed: removed from destructuring.
15. **M8 — route.test.ts storage mock missing `remove` method** (`route.test.ts`): H1 fix added `admin.storage.remove()` call but mock only exposed `upload`. Fixed: added `mockRemoveStorage` to mock and `beforeEach` reset.
16. **M9 — Audit log test asserted only `action` + `entityType`** (`route.test.ts`): Weak assertion missed `entityId`, `tenantId`, `userId`. Fixed: strengthened to `expect.objectContaining({ action, entityType, entityId, tenantId, userId })`.
17. **M10 — UploadProgressList only tested NETWORK_ERROR** (`UploadProgressList.test.tsx`): 5 error codes + null fallback untested. Fixed: added 6 tests (FILE_SIZE_EXCEEDED, UNSUPPORTED_FORMAT, STORAGE_ERROR, BATCH_SIZE_EXCEEDED, DUPLICATE_FILE, null→"Upload failed").
18. **M11 — DuplicateDetectionDialog Escape key not tested** (`DuplicateDetectionDialog.test.tsx`): Radix `onOpenChange(false)` path (Escape to close) was untested. Fixed: added test simulating `{Escape}` key, asserting `onCancel` is called.
19. **M12 — createBatch missing fileCount boundary tests** (`createBatch.action.test.ts`): Only tested fileCount=3 and fileCount=51. Fixed: added fileCount=1 (min valid), fileCount=50 (max valid), fileCount=1.5 (non-integer → VALIDATION_ERROR).
20. **M13 — getUploadedFiles silently swallowed DB exceptions** (`getUploadedFiles.action.ts` + test): DB query had no try/catch — exceptions propagated as unhandled promise rejections. Test confirmed the propagation behavior; added test asserting `rejects.toThrow()`.

**LOW**
21. **L1 — FileUploadZone onFilesSelected type was `() => void`** (`FileUploadZone.tsx`): Should be `Promise<void>` to allow awaiting the async handler. Fixed: updated type.
22. **L2 — No XHR abort handler** (`useFileUpload.ts`): Aborted requests were silently dropped with no status. Fixed: added `xhr.addEventListener('abort', ...)` that resolves with `{ ok: false, status: 0 }` — same as error path.
23. **L3 — sanitizeFileName had no empty-result fallback** (`storagePath.ts`): If a filename sanitized to empty string (e.g. `/../`), the storage path would end with a trailing slash. Fixed: `const safeName = safe.length > 0 ? safe : fileHash`.
24. **L4 — batchId type mismatch in route.ts results array** (`route.ts`): Results array typed `batchId: string | null | undefined` — should be `string | null`. Fixed.
25. **L5 — withTenant not asserted in createBatch tests** (`createBatch.action.test.ts`): L7 finding — tests verified output but not that tenant filtering was applied. Fixed: added `expect(vi.mocked(withTenant)).toHaveBeenCalledWith(expect.anything(), MOCK_USER.tenantId)`.
26. **L6 — withTenant not asserted in getUploadedFiles tests** (`getUploadedFiles.action.test.ts`): Same gap. Fixed: added L7 assertion test.
27. **L7 — Missing exact MAX_FILE_SIZE_BYTES boundary test** (`route.test.ts` + `useFileUpload.test.ts`): No test confirmed that a file exactly at 15MB succeeds (boundary is `>`, not `>=`). Fixed: added boundary test in both route and hook test files.

**Post-fix verification:**
- Type check: 0 errors (`npm run type-check`)
- Lint: 0 errors, 0 warnings (`npm run lint`)
- Tests: 59 test files · **495/495 PASSING** (`npm run test:unit`)

### Code Review Round 3 (2026-02-23)

**Reviewer:** claude-sonnet-4-6 (adversarial code review via bmad-agent-bmm-dev, parallel sub-agents: code-quality-analyzer + testing-qa-expert)

**8 findings fixed (1 CRITICAL · 7 HIGH):**

**CRITICAL**
1. **C1 — `fileType.ts` no test file** (`utils/fileType.test.ts`): `getFileType()` was extracted in Round 2 (M1) but no test file was created — 9 branches completely untested (sdlxliff, xlf, xliff, xlsx, unsupported, no-extension, UPPERCASE, multi-dot, empty string). Fixed: created `fileType.test.ts` with 9 tests covering all branches.

**HIGH — Logic Bugs**
2. **H1 — `createBatch.action.ts` writeAuditLog unguarded**: `await writeAuditLog()` at line 58 was unguarded — if audit write threw (e.g. DB timeout), caller received a misleading error while the batch record had already been created (orphan batch). Fixed: wrapped in try/catch; failure is silently swallowed (non-fatal, batch was successfully created).
3. **H2 — `confirmRerun` void .then() no .catch()** (`useFileUpload.ts:280`): `void uploadSingleFile(...).then(...)` had no `.catch()` — if `uploadSingleFile` rejected unexpectedly, `isUploading` was permanently stuck at `true`, locking the UI forever. Fixed: added `.catch(() => { setIsUploading(false) })`.
4. **H3 — `onFilesSelected` unhandled rejection** (`FileUploadZone.tsx:37`): `handleFiles()` called `onFilesSelected(files)` in a sync function without void+catch — if the async callback threw, it became an unhandled promise rejection crashing the app. Fixed: `void Promise.resolve(onFilesSelected(files)).catch(() => {})` — safe even when mock/callers return `undefined`.
5. **H4 — `formData.getAll('files') as File[]` type cast** (`route.ts:73`): A crafted request could include string-valued `files` entries that pass the cast — non-File entries would propagate to `file.name`, `file.size`, `file.arrayBuffer()` calls causing runtime errors. Fixed: replaced cast with `filter((e): e is File => e instanceof File)` type guard.

**HIGH — Test Gaps**
6. **H5 — `mockRemoveStorage` never asserted** (`route.test.ts`): The "DB insert returns empty" test confirmed HTTP 500 but never verified that `admin.storage.remove()` was called — leaving the storage orphan cleanup path unverified. Fixed: added `expect(mockRemoveStorage).toHaveBeenCalledWith([...])` assertion.
7. **H6 — UUID validation 400 branches uncovered** (`route.test.ts`): H4 fix in Round 2 added `uuidSchema.safeParse()` validation for `projectId` and `batchId`, but no tests covered the rejection paths. Fixed: added two tests — invalid `projectId` UUID → 400, invalid `batchId` UUID → 400; both assert `mockSelectFn` is NOT called (no DB hit on bad input).
8. **H7 — Mixed batch test missing** (`useFileUpload.test.ts`): No test verified that valid + invalid files in the same batch are each tracked independently. Fixed: added mixed batch test with unique UUID stub (incremental counter) to prevent `updateFileProgress` UUID collision from overwriting error entries of invalid files.

**Post-fix verification:**
- Type check: 0 errors (`npm run type-check`)
- Lint: 0 errors, 0 warnings (`npm run lint`)
- Tests: 60 test files · **507/507 PASSING** (`npm run test:unit`)
- Commit: `291f107`

### File List

**New files:**
- `src/db/schema/uploadBatches.ts`
- `src/db/migrations/0003_melted_tarot.sql`
- `src/features/upload/types.ts`
- `src/features/upload/constants.ts`
- `src/features/upload/validation/uploadSchemas.ts`
- `src/features/upload/validation/uploadSchemas.test.ts`
- `src/features/upload/utils/fileHash.server.ts`
- `src/features/upload/utils/fileHash.server.test.ts`
- `src/features/upload/utils/storagePath.ts`
- `src/features/upload/utils/storagePath.test.ts`
- `src/features/upload/actions/checkDuplicate.action.ts`
- `src/features/upload/actions/checkDuplicate.action.test.ts`
- `src/features/upload/actions/createBatch.action.ts`
- `src/features/upload/actions/createBatch.action.test.ts`
- `src/features/upload/actions/getUploadedFiles.action.ts`
- `src/features/upload/actions/getUploadedFiles.action.test.ts`
- `src/features/upload/hooks/useFileUpload.ts`
- `src/features/upload/hooks/useFileUpload.test.ts`
- `src/features/upload/components/FileUploadZone.tsx`
- `src/features/upload/components/FileUploadZone.test.tsx`
- `src/features/upload/components/UploadProgressList.tsx`
- `src/features/upload/components/UploadProgressList.test.tsx`
- `src/features/upload/components/DuplicateDetectionDialog.tsx`
- `src/features/upload/components/DuplicateDetectionDialog.test.tsx`
- `src/features/upload/components/FileSizeWarning.tsx`
- `src/features/upload/components/FileSizeWarning.test.tsx` (CR Round 2 — H6)
- `src/features/upload/components/UploadPageClient.tsx`
- `src/features/upload/components/UploadPageClient.test.tsx` (CR Round 2 — H7)
- `src/features/upload/utils/fileType.ts` (CR Round 2 — M1 extraction)
- `src/features/upload/utils/fileType.test.ts` (CR Round 3 — C1)
- `src/app/api/upload/route.ts`
- `src/app/api/upload/route.test.ts`
- `src/app/(app)/projects/[projectId]/upload/page.tsx`
- `src/components/ui/progress.tsx`
- `src/db/__tests__/rls/files.rls.test.ts`
- `src/db/__tests__/rls/upload-batches.rls.test.ts`
- `supabase/migrations/00010_story_2_1_schema.sql`
- `supabase/migrations/00011_upload_batches_rls.sql`
- `supabase/migrations/00012_file_hash_index.sql` (CR fix — composite indexes on files table)
- `e2e/helpers/fileUpload.ts`
- `e2e/fixtures/sdlxliff/minimal.sdlxliff`
- `e2e/fixtures/sdlxliff/with-namespaces.sdlxliff`
- `e2e/fixtures/xliff/standard.xliff`

**Modified files:**
- `src/db/schema/files.ts` — add `fileHash`, `uploadedBy`, `batchId` columns
- `src/db/schema/index.ts` — export `uploadBatches`
- `src/db/schema/relations.ts` — add `uploadBatches` relations
- `src/features/project/components/ProjectSubNav.tsx` — add "Files" tab
- `src/test/factories.ts` — add `buildFile()`, `buildUploadBatch()`
- `package.json` / `package-lock.json` — add `@testing-library/user-event`
