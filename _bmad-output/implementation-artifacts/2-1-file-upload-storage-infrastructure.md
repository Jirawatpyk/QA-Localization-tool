# Story 2.1: File Upload & Storage Infrastructure

Status: review

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
  - [x] 9.2 Full test suite — **57 files / 462 tests ✅** (0 regressions)
  - [x] 9.3 Type check — **0 errors ✅**
  - [x] 9.4 Lint — **0 errors, 0 warnings ✅**

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
- `src/features/upload/components/UploadPageClient.tsx`
- `src/app/api/upload/route.ts`
- `src/app/api/upload/route.test.ts`
- `src/app/(app)/projects/[projectId]/upload/page.tsx`
- `src/components/ui/progress.tsx`
- `src/db/__tests__/rls/files.rls.test.ts`
- `src/db/__tests__/rls/upload-batches.rls.test.ts`
- `supabase/migrations/00010_story_2_1_schema.sql`
- `supabase/migrations/00011_upload_batches_rls.sql`
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
