# Story 1.4: Glossary Import & Management

Status: done

<!-- Validated: Quality checklist passed — 5 critical fixes, 4 enhancements, 2 optimizations applied. -->

## Story

As an Admin,
I want to import glossaries in CSV, TBX, and Excel formats and manage per-project overrides,
so that the QA engine can check terminology compliance against our approved terms.

## Acceptance Criteria

1. **AC1: CSV Import**
   - **Given** an Admin is on the project glossary page
   - **When** they click "Import Glossary" and select a CSV file with source/target term columns
   - **Then** terms are parsed and imported into the project's glossary
   - **And** a summary shows: `{ imported: N, duplicates: M, errors: [{ line, reason, code }] }` with specific error codes (e.g., EMPTY_SOURCE, INVALID_PAIR, MISSING_TARGET, DUPLICATE_ENTRY)

2. **AC2: TBX Import**
   - **Given** an Admin uploads a TBX (TermBase eXchange) file
   - **When** the import processes
   - **Then** TBX XML is parsed correctly preserving language-specific terms
   - **And** terms are mapped to the project's language pairs (FR40)

3. **AC3: Excel Import with Column Mapping**
   - **Given** an Admin uploads an Excel glossary file
   - **When** the import processes
   - **Then** configurable column mapping allows selecting source/target columns
   - **And** terms are imported matching the configured mapping

4. **AC4: Glossary Management Page**
   - **Given** a project has an imported glossary
   - **When** an Admin views the glossary management page
   - **Then** they see all terms with source, target, language pair, and status
   - **And** they can add, edit, or delete individual terms
   - **And** they can configure per-project overrides for approved terminology (FR41)

5. **AC5: Schema Verification** *(verification-only — no new tables, schema already exists from Story 1.2)*
   - **Given** the glossary schema (already created in Story 1.2)
   - **When** I inspect the database
   - **Then** `glossaries` table exists: id, tenant_id, project_id (nullable), name, source_lang, target_lang, created_at
   - **And** `glossary_terms` table exists: id, glossary_id, source_term, target_term, case_sensitive (default false), created_at
   - **And** glossary terms are cached using Next.js `"use cache"` + `cacheTag` per project, invalidated on mutation

6. **AC6: Import Performance**
   - **Given** a glossary with 500+ terms is imported
   - **When** I measure import performance
   - **Then** the import completes within 10 seconds
   - **And** the glossary index is precomputed on import (not on-the-fly matching)

## Tasks / Subtasks

### Task 1: Glossary Feature Module Structure (AC: #1-#6)

Set up the feature module directory and validation schemas.

- [x] 1.1 Create `src/features/glossary/validation/glossarySchemas.ts` — Feature-level Zod validation schemas for glossary forms
  ```typescript
  // 'use server' NOT needed — this is shared validation
  import { z } from 'zod'

  export const importGlossarySchema = z.object({
    projectId: z.string().uuid('Invalid project ID'),
    name: z.string().min(1, 'Glossary name is required').max(255, 'Name too long'),
    format: z.enum(['csv', 'tbx', 'xlsx']),
  })

  // For CSV/Excel column mapping
  export const columnMappingSchema = z.object({
    sourceColumn: z.string().min(1, 'Source column required'),
    targetColumn: z.string().min(1, 'Target column required'),
    hasHeader: z.boolean().default(true),
    delimiter: z.enum([',', ';', '\t']).default(','), // CSV only
  })

  export const createTermSchema = z.object({
    glossaryId: z.string().uuid('Invalid glossary ID'),
    sourceTerm: z.string().min(1, 'Source term is required').max(500),
    targetTerm: z.string().min(1, 'Target term is required').max(500),
    caseSensitive: z.boolean().default(false),
  })

  export const updateTermSchema = z.object({
    sourceTerm: z.string().min(1).max(500).optional(),
    targetTerm: z.string().min(1).max(500).optional(),
    caseSensitive: z.boolean().optional(),
  })

  export type ImportGlossaryInput = z.infer<typeof importGlossarySchema>
  export type ColumnMappingInput = z.infer<typeof columnMappingSchema>
  export type CreateTermInput = z.infer<typeof createTermSchema>
  export type UpdateTermInput = z.infer<typeof updateTermSchema>
  ```

- [x] 1.2 Create `src/features/glossary/types.ts` — Type definitions for import results
  ```typescript
  export const IMPORT_ERROR_CODES = {
    EmptySource: 'EMPTY_SOURCE',
    EmptyTarget: 'MISSING_TARGET',
    InvalidPair: 'INVALID_PAIR',
    DuplicateEntry: 'DUPLICATE_ENTRY',
    ParseError: 'PARSE_ERROR',
    InvalidFormat: 'INVALID_FORMAT',
  } as const

  export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[keyof typeof IMPORT_ERROR_CODES]

  export type ImportError = {
    line: number
    reason: string
    code: ImportErrorCode
  }

  export type ImportResult = {
    imported: number
    duplicates: number
    errors: ImportError[]
    glossaryId: string
  }
  ```

### Task 2: Glossary Parsers — CSV, TBX, Excel (AC: #1, #2, #3)

- [x] 2.1 Create `src/features/glossary/parsers/csvParser.ts`
  ```typescript
  // Pure function: (csvText: string, mapping: ColumnMappingInput) => ParsedTerm[]
  // Steps:
  //   1. Split by newlines, handle \r\n and \n
  //   2. Split each line by delimiter (from mapping)
  //   3. If hasHeader: use first row to resolve column indices from mapping.sourceColumn/targetColumn
  //      If !hasHeader: use 0-indexed column numbers
  //   4. For each row: extract sourceTerm and targetTerm
  //   5. Normalize terms: term.trim().normalize('NFKC')  ← CRITICAL for Story 1.5 matching
  //   6. Return array of { sourceTerm, targetTerm, lineNumber }
  // Error cases: empty source (after normalize) → EMPTY_SOURCE, empty target → MISSING_TARGET
  ```

- [x] 2.2 Create `src/features/glossary/parsers/tbxParser.ts`
  ```typescript
  // Uses fast-xml-parser (already installed — v5.3.6)
  // TBX structure: <martif> → <body> → <termEntry> → <langSet xml:lang="en"> → <tig> → <term>
  // Steps:
  //   1. Parse XML with fast-xml-parser ({ ignoreAttributes: false }) to preserve xml:lang
  //   2. Walk termEntry elements
  //   3. For each termEntry:
  //      a. Extract all langSet elements, group by xml:lang attribute
  //      b. Find langSet matching glossary sourceLang → extract source term
  //      c. Find langSet matching glossary targetLang → extract target term
  //      d. If sourceLang not found in termEntry → skip, add error: INVALID_PAIR ("Source language not found in termEntry")
  //      e. If targetLang not found in termEntry → skip, add error: INVALID_PAIR ("Target language not found in termEntry")
  //      f. If both found → normalize: term.trim().normalize('NFKC')
  //   4. Return array of { sourceTerm, targetTerm, lineNumber }
  // Error cases: missing lang match → INVALID_PAIR, empty term → EMPTY_SOURCE/MISSING_TARGET
  //
  // NOTE: TBX files may contain many language pairs (en, th, ja, ko). Only extract the
  // source/target pair matching the glossary's sourceLang/targetLang. Skip non-matching termEntries.
  //
  // IMPORTANT: fast-xml-parser is already a dependency (installed in Story 1.1)
  // Import: import { XMLParser } from 'fast-xml-parser'
  ```

- [x] 2.3 Create `src/features/glossary/parsers/excelParser.ts` — Uses `exceljs` (already installed v4.4.0)
  ```typescript
  // DO NOT install xlsx/SheetJS — project already has exceljs@4.4.0
  // Import: import ExcelJS from 'exceljs'
  import 'server-only'
  //
  // Steps:
  //   1. Create workbook: const workbook = new ExcelJS.Workbook()
  //   2. Load from buffer: await workbook.xlsx.load(buffer)
  //   3. Get first worksheet: workbook.getWorksheet(1)
  //   4. If hasHeader: use first row to resolve column indices from mapping.sourceColumn/targetColumn
  //      If !hasHeader: use 1-indexed column numbers directly
  //   5. Iterate rows: worksheet.eachRow((row, rowNumber) => { ... })
  //   6. For each row: extract sourceTerm and targetTerm via column mapping
  //   7. Normalize terms: term.trim().normalize('NFKC')  ← CRITICAL for Story 1.5 matching
  //   8. Return array of { sourceTerm, targetTerm, lineNumber }
  // Error cases same as CSV
  //
  // NOTE: exceljs works in Node.js runtime (Server Actions). Not needed in browser.
  // NOTE: exceljs API differs from SheetJS — uses workbook.xlsx.load() not XLSX.read()
  ```

- [x] 2.4 Create `src/features/glossary/parsers/index.ts` — Parser dispatch
  ```typescript
  // Exception to no-barrel-export rule: this is a parser registry (like inngest function registry)
  // Export: parseGlossaryFile(format: 'csv' | 'tbx' | 'xlsx', buffer: ArrayBuffer, mapping: ColumnMappingInput) => ParsedTerm[]
  // Dispatches to the correct parser based on format
  ```

### Task 3: Server Actions — Glossary CRUD (AC: #1-#4)

- [x] 3.1 Create `src/features/glossary/actions/importGlossary.action.ts`
  ```typescript
  'use server'
  import 'server-only'

  import { requireRole } from '@/lib/auth/requireRole'
  import { db } from '@/db/client'
  import { glossaries } from '@/db/schema/glossaries'
  import { glossaryTerms } from '@/db/schema/glossaryTerms'
  import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
  import { importGlossarySchema, columnMappingSchema } from '@/features/glossary/validation/glossarySchemas'
  import { revalidatePath, revalidateTag } from 'next/cache'
  import type { ActionResult } from '@/types/actionResult'
  import type { ImportResult } from '@/features/glossary/types'

  // Signature: (formData: FormData) — using FormData because file upload
  // formData contains: file (File), name (string), projectId (string), format (string),
  //   sourceColumn (string), targetColumn (string), hasHeader (string), delimiter (string)
  //
  // Flow:
  //   1. Auth check (MUST use try-catch — requireRole THROWS on failure):
  //      let currentUser
  //      try { currentUser = await requireRole('admin', 'write') }
  //      catch { return { success: false, code: 'FORBIDDEN', error: 'Admin access required' } }
  //   2. Extract and validate fields from FormData
  //   3. Read file content as ArrayBuffer
  //   4. Detect format from file extension if not provided
  //   5. Parse file using appropriate parser (parsers already NFKC-normalize terms)
  //   6. Deduplicate parsed terms:
  //      a. Intra-file dedup: group by NFKC-normalized sourceTerm (case-insensitive toLowerCase())
  //         Keep first occurrence, count rest as duplicates
  //      b. Cross-DB dedup: query existing terms in same glossary
  //         SELECT source_term FROM glossary_terms WHERE glossary_id = ?
  //         Compare normalized sourceTerm — skip matches, count as duplicates
  //   7. Create glossary record: db.insert(glossaries).values({
  //        tenantId: currentUser.tenantId,
  //        projectId,
  //        name,
  //        sourceLang: project.sourceLang,    // from project
  //        targetLang: project.targetLangs[0], // primary target lang from project
  //      })
  //   8. Batch insert unique terms: db.insert(glossaryTerms).values(batch)
  //      IMPORTANT: Batch in chunks of 500 to avoid query parameter limits
  //   9. writeAuditLog({ tenantId, userId, entityType: 'glossary', entityId: glossary.id,
  //        action: 'glossary.created', newValue: { name, termCount: imported } })
  //   10. revalidateTag(`glossary-${projectId}`)
  //   11. revalidatePath(`/projects/${projectId}/glossary`)
  //   12. Return ActionResult<ImportResult> with { imported, duplicates, errors, glossaryId }
  //
  // Performance: 500+ terms must complete in <10 seconds
  // Batch insert (not one-by-one) is critical for performance
  ```

- [x] 3.2 Create `src/features/glossary/actions/createTerm.action.ts`
  ```typescript
  'use server'
  import 'server-only'
  // Signature: (input: unknown) — always unknown, validate with Zod
  // Flow:
  //   1. let currentUser
  //      try { currentUser = await requireRole('admin', 'write') }
  //      catch { return { success: false, code: 'FORBIDDEN', error: 'Admin access required' } }
  //   2. Validate via createTermSchema.safeParse(input)
  //   3. Verify glossary belongs to current tenant (JOIN glossaries + withTenant)
  //   4. NFKC-normalize sourceTerm before dedup check
  //   5. Check for duplicate (same normalized source_term in same glossary, case-insensitive)
  //      If duplicate → return { success: false, code: 'DUPLICATE_ENTRY', error: 'Term already exists' }
  //   6. db.insert(glossaryTerms).values({ glossaryId, sourceTerm, targetTerm, caseSensitive })
  //   7. writeAuditLog({ tenantId, userId, entityType: 'glossary_term', entityId: term.id, action: 'glossary_term.created' })
  //   8. Fetch project_id from glossary → revalidateTag(`glossary-${projectId}`)
  //   9. Return ActionResult<GlossaryTerm>
  ```

- [x] 3.3 Create `src/features/glossary/actions/updateTerm.action.ts`
  ```typescript
  'use server'
  import 'server-only'
  // Signature: (termId: string, input: unknown)
  // Flow:
  //   1. let currentUser
  //      try { currentUser = await requireRole('admin', 'write') }
  //      catch { return { success: false, code: 'FORBIDDEN', error: 'Admin access required' } }
  //   2. Validate via updateTermSchema.safeParse(input)
  //   3. Fetch existing term with JOIN on glossary → verify tenant ownership
  //      SELECT from glossary_terms JOIN glossaries WHERE glossary_terms.id = termId
  //        AND glossaries.tenant_id = currentUser.tenantId
  //      If not found → return { success: false, code: 'NOT_FOUND' }
  //   4. db.update(glossaryTerms).set({ ...validated }).where(eq(id, termId))
  //   5. writeAuditLog({ entityType: 'glossary_term', action: 'updated', oldValue, newValue })
  //   6. revalidateTag(`glossary-${projectId}`)
  //   7. Return ActionResult<GlossaryTerm>
  ```

- [x] 3.4 Create `src/features/glossary/actions/deleteTerm.action.ts`
  ```typescript
  'use server'
  import 'server-only'
  // Signature: (termId: string)
  // Flow:
  //   1. let currentUser
  //      try { currentUser = await requireRole('admin', 'write') }
  //      catch { return { success: false, code: 'FORBIDDEN', error: 'Admin access required' } }
  //   2. Fetch existing term with JOIN on glossary → verify tenant ownership
  //   3. db.delete(glossaryTerms).where(eq(id, termId))
  //   4. writeAuditLog({ entityType: 'glossary_term', action: 'deleted', oldValue })
  //   5. revalidateTag(`glossary-${projectId}`)
  //   6. Return ActionResult<{ id: string }>
  ```

- [x] 3.5 Create `src/features/glossary/actions/deleteGlossary.action.ts`
  ```typescript
  'use server'
  import 'server-only'
  // Signature: (glossaryId: string)
  // Flow:
  //   1. let currentUser
  //      try { currentUser = await requireRole('admin', 'write') }
  //      catch { return { success: false, code: 'FORBIDDEN', error: 'Admin access required' } }
  //   2. Fetch glossary with withTenant() → verify ownership
  //   3. db.delete(glossaries).where(eq(id, glossaryId))
  //      NOTE: cascade deletes all glossary_terms automatically (FK onDelete: cascade)
  //   4. writeAuditLog({ entityType: 'glossary', action: 'deleted', oldValue })
  //   5. revalidateTag(`glossary-${projectId}`)
  //   6. Return ActionResult<{ id: string }>
  ```

### Task 4: Glossary Cache Layer (AC: #5, #6)

NOTE: `src/lib/cache/` directory does NOT exist yet — this task creates it for the first time.

- [x] 4.1 Create `src/lib/cache/glossaryCache.ts`
  ```typescript
  "use cache"
  import { cacheTag, cacheLife } from "next/cache"
  import { db } from '@/db/client'
  import { glossaries } from '@/db/schema/glossaries'
  import { glossaryTerms } from '@/db/schema/glossaryTerms'
  import { eq, and } from 'drizzle-orm'
  import { withTenant } from '@/db/helpers/withTenant'

  // getCachedGlossaryTerms: loads all terms for a project's glossaries
  // Used by the matching engine (Story 1.5) and term display
  export async function getCachedGlossaryTerms(projectId: string, tenantId: string) {
    cacheTag(`glossary-${projectId}`)
    cacheLife("minutes") // 5 min default

    const projectGlossaries = await db.select()
      .from(glossaries)
      .where(and(
        eq(glossaries.projectId, projectId),
        withTenant(glossaries.tenantId, tenantId),
      ))

    if (projectGlossaries.length === 0) return []

    const glossaryIds = projectGlossaries.map(g => g.id)
    // Load all terms for all glossaries in one query
    const terms = await db.select()
      .from(glossaryTerms)
      .where(/* inArray(glossaryTerms.glossaryId, glossaryIds) */)

    return terms
  }

  // getCachedGlossaries: loads glossary metadata for a project
  export async function getCachedGlossaries(projectId: string, tenantId: string) {
    cacheTag(`glossary-${projectId}`)
    cacheLife("minutes")

    return await db.select()
      .from(glossaries)
      .where(and(
        eq(glossaries.projectId, projectId),
        withTenant(glossaries.tenantId, tenantId),
      ))
  }

  // IMPORTANT: Every mutation action MUST call revalidateTag(`glossary-${projectId}`)
  ```

### Task 5: Glossary Page — Route & Server Component (AC: #4)

- [x] 5.1 Create `src/app/(app)/projects/[projectId]/glossary/page.tsx` — Server Component
  ```typescript
  import { eq, and, count } from 'drizzle-orm'
  import { redirect, notFound } from 'next/navigation'
  import { db } from '@/db/client'
  import { withTenant } from '@/db/helpers/withTenant'
  import { projects } from '@/db/schema/projects'
  import { glossaries } from '@/db/schema/glossaries'
  import { glossaryTerms } from '@/db/schema/glossaryTerms'
  import { getCurrentUser } from '@/lib/auth/getCurrentUser'
  import { GlossaryManager } from '@/features/glossary/components/GlossaryManager'

  export const dynamic = 'force-dynamic'
  export const metadata = { title: 'Glossary — QA Localization Tool' }

  // Pattern follows projects/page.tsx:
  // 1. getCurrentUser() — if not logged in, redirect to /login
  // 2. Fetch project with withTenant() — verify ownership
  //    If not found → notFound()
  // 3. Fetch glossaries for this project with LEFT JOIN term count
  //    db.select({ ...getTableColumns(glossaries), termCount: count(glossaryTerms.id) })
  //      .from(glossaries)
  //      .leftJoin(glossaryTerms, eq(glossaries.id, glossaryTerms.glossaryId))
  //      .where(and(
  //        eq(glossaries.projectId, projectId),
  //        withTenant(glossaries.tenantId, currentUser.tenantId),
  //      ))
  //      .groupBy(glossaries.id)
  // 4. Pass to <GlossaryManager> client component with { project, glossaries, userRole }
  //
  // CRITICAL: Next.js 16 requires awaiting params:
  //   const { projectId } = await params
  ```

### Task 6: Glossary UI Components (AC: #1-#4)

- [x] 6.1 Create `src/features/glossary/components/GlossaryManager.tsx` — Client Component (entry point)
  ```typescript
  'use client'
  // Props: { project: Project, glossaries: GlossaryWithTermCount[], userRole: AppRole }
  // Layout:
  //   - PageHeader with "Glossary" title and Import button (admin only)
  //   - If no glossaries: inline empty state "No glossaries imported yet"
  //   - GlossaryList showing all glossaries for the project
  //   - Import button opens <GlossaryImportDialog>
  ```

- [x] 6.2 Create `src/features/glossary/components/GlossaryList.tsx` — Client Component
  ```typescript
  'use client'
  // Props: { glossaries: GlossaryWithTermCount[], projectId: string, userRole: AppRole }
  // Renders a list/table of glossaries:
  //   - Name, source_lang → target_lang, term count, created date
  //   - Click on glossary → expand to show GlossaryTermTable
  //   - Admin actions: Delete glossary button
  // Uses shadcn Table component
  ```

- [x] 6.3 Create `src/features/glossary/components/GlossaryTermTable.tsx` — Client Component
  ```typescript
  'use client'
  // Props: { glossaryId: string, projectId: string, userRole: AppRole }
  // Fetches and displays terms for a specific glossary
  // Features:
  //   - Search filter (client-side filtering for MVP)
  //   - Table columns: Source Term, Target Term, Case Sensitive, Actions
  //   - Admin actions per row: Edit (inline or dialog), Delete
  //   - Admin action: Add new term button
  //   - Pagination: show 50 terms per page (client-side)
  // Accessibility: table with proper th/td, keyboard navigable
  //
  // NOTE: Terms loaded via server action (not fetched client-side)
  // Use useEffect + server action call to load terms when glossary is expanded
  // Or pass terms as props from parent that fetches them server-side
  ```

- [x] 6.4 Create `src/features/glossary/components/GlossaryImportDialog.tsx` — Client Component
  ```typescript
  'use client'
  // Uses shadcn Dialog component
  // Steps:
  //   Step 1: File Selection
  //     - Drag & drop zone or file picker
  //     - Supported formats: .csv, .xlsx, .tbx
  //     - Max file size: 10MB
  //     - Glossary name input (auto-filled from filename)
  //
  //   Step 2: Column Mapping (CSV/Excel only, skipped for TBX)
  //     - Source column: Select dropdown (populated from file headers)
  //     - Target column: Select dropdown (populated from file headers)
  //     - Has header row: Checkbox (default: true)
  //     - Delimiter: Select (comma/semicolon/tab) — CSV only
  //     - Preview: show first 5 rows with selected mapping
  //
  //   Step 3: Import Progress & Results (one-shot: valid terms auto-imported, errors reported)
  //     - Progress indicator during import (useTransition isPending)
  //     - Import summary: { imported, duplicates, errors }
  //     - If errors > 0: show error details table with line, reason, code
  //     - Actions: [View Skipped] (toggle error table visibility) [Close]
  //     - NOTE: Import is one-shot — valid entries are imported immediately, errors are skipped.
  //       No two-phase "preview then import" flow. User sees results after completion.
  //
  // Form submission:
  //   - Build FormData with file + mapping config
  //   - Call importGlossary server action
  //   - On success: toast.success, close dialog, router.refresh()
  //   - On error: toast.error
  //   - Use useTransition for pending state
  //
  // Accessibility:
  //   - Dialog has aria-label="Import glossary"
  //   - Form fields have <Label htmlFor=...>
  //   - File input accessible via button
  ```

- [x] 6.5 Create `src/features/glossary/components/TermEditDialog.tsx` — Client Component
  ```typescript
  'use client'
  // Props: { mode: 'create' | 'edit', term?: GlossaryTerm, glossaryId: string, onClose: () => void }
  // Form fields:
  //   - Source term: Input (required, max 500)
  //   - Target term: Input (required, max 500)
  //   - Case sensitive: Checkbox (default: false)
  // Submit: calls createTerm or updateTerm server action
  // Uses shadcn Dialog + form pattern with useTransition
  ```

- [x] 6.6 Create `src/features/glossary/actions/getGlossaryTerms.action.ts` — Server Action for fetching terms
  ```typescript
  'use server'
  import 'server-only'
  // Signature: (glossaryId: string) — fetch terms for a specific glossary
  // Flow:
  //   1. getCurrentUser() — read path (JWT claims)
  //   2. Verify glossary belongs to current tenant (JOIN glossaries + withTenant)
  //   3. db.select().from(glossaryTerms).where(eq(glossaryId, glossaryId))
  //   4. Return ActionResult<GlossaryTerm[]>
  //
  // NOTE: This is a read action — uses getCurrentUser, not requireRole
  ```

### Task 7: Navigation & Routing (AC: #4)

- [x] 7.1 Create project sub-navigation in `src/app/(app)/projects/[projectId]/layout.tsx`
  - Current layout is a bare pass-through (`<>{children}</>`). Must be upgraded to include tab navigation.
  - Add tab links: **Settings** (`/projects/[projectId]/settings`) | **Glossary** (`/projects/[projectId]/glossary`)
  - Use `usePathname()` to highlight active tab
  - Keep layout as Server Component if possible, or extract navigation to a Client Component
  - Route: `/projects/[projectId]/glossary`

### Task 8: Unit Tests (AC: #1-#6)

Mock setup pattern (all Server Action tests — MUST match existing codebase patterns):
```typescript
// 1. ALWAYS mock server-only FIRST (required for all 'use server' files)
vi.mock('server-only', () => ({}))

// 2. Mock logger
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

// 3. Mock DB with query builder chain (match exact Drizzle chain pattern)
const mockReturning = vi.fn().mockResolvedValue([/* mock result */])
const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
const mockInsert = vi.fn().mockReturnValue({ values: mockValues })
vi.mock('@/db/client', () => ({
  db: {
    insert: (...args: unknown[]) => mockInsert(...args),
    select: () => ({ from: () => ({ where: () => ({ limit: () => /* mock */ }) }) }),
  },
}))

// 4. Mock schema tables
vi.mock('@/db/schema/glossaries', () => ({ glossaries: {} }))
vi.mock('@/db/schema/glossaryTerms', () => ({ glossaryTerms: {} }))

// 5. Mock requireRole (THROWS pattern — catch in action)
const mockRequireRole = vi.fn().mockResolvedValue(mockCurrentUser)
vi.mock('@/lib/auth/requireRole', () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}))

// 6. Mock audit + cache
const mockWriteAuditLog = vi.fn().mockResolvedValue(undefined)
vi.mock('@/features/audit/actions/writeAuditLog', () => ({
  writeAuditLog: (...args: unknown[]) => mockWriteAuditLog(...args),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

// 7. Use dynamic import in each test (required due to vi.mock hoisting)
// const { importGlossary } = await import('./importGlossary.action')
```

- [x] 8.1 Write parser tests: `src/features/glossary/parsers/csvParser.test.ts`
  - Valid CSV with headers → correct terms extracted
  - CSV without headers → uses column indices
  - Empty source term → EMPTY_SOURCE error
  - Empty target term → MISSING_TARGET error
  - Different delimiters (comma, semicolon, tab) → correct parsing
  - Empty file → returns empty array
  - Unicode terms (Thai, CJK) → correctly preserved
  - Quoted fields with commas → handled correctly

- [x] 8.2 Write parser tests: `src/features/glossary/parsers/tbxParser.test.ts`
  - Valid TBX with matching language → correct terms extracted
  - TBX with mismatched language pair → INVALID_PAIR error
  - Empty term text → EMPTY_SOURCE/MISSING_TARGET error
  - Multiple termEntries → all parsed
  - TBX with multiple languages → only matching source/target pair extracted
  - TBX with no matching language → INVALID_PAIR error for each non-matching termEntry

- [x] 8.3 Write parser tests: `src/features/glossary/parsers/excelParser.test.ts`
  - Valid Excel with headers → correct terms extracted
  - Column mapping selection → correct columns used
  - Empty cells → appropriate error codes
  - Large file (500+ rows) → completes in reasonable time

- [x] 8.4 Write validation schema tests: `src/features/glossary/validation/glossarySchemas.test.ts`
  - importGlossarySchema: valid input → passes
  - importGlossarySchema: invalid format → fails
  - createTermSchema: valid term → passes
  - createTermSchema: empty source → fails
  - updateTermSchema: partial update → passes
  - columnMappingSchema: valid mapping → passes

- [x] 8.5 Write Server Action tests: `src/features/glossary/actions/importGlossary.action.test.ts`
  - Admin imports CSV → success with correct import count
  - QA Reviewer → FORBIDDEN
  - Invalid file format → VALIDATION_ERROR
  - Duplicate terms → counted in duplicates, not imported twice
  - Audit log written with correct entityType and action
  - revalidateTag called with correct project tag

- [x] 8.6 Write Server Action tests: `src/features/glossary/actions/createTerm.action.test.ts`
  - Admin creates term → success
  - Duplicate source term in same glossary → DUPLICATE_ENTRY
  - QA Reviewer → FORBIDDEN
  - Audit log written

- [x] 8.7 Write Server Action tests: `src/features/glossary/actions/updateTerm.action.test.ts`
  - Admin updates term → success
  - Term not found → NOT_FOUND
  - Cross-tenant access → NOT_FOUND (tenant filter)
  - Audit log captures old and new values

- [x] 8.8 Write Server Action tests: `src/features/glossary/actions/deleteTerm.action.test.ts`
  - Admin deletes term → success
  - Term not found → NOT_FOUND
  - Audit log written

- [x] 8.9 Run `npm run type-check` — pass
- [x] 8.10 Run `npm run lint` — pass
- [x] 8.11 Run `npm run test:unit` — all pass (including existing 102+ tests from Stories 1.1-1.3)
- [x] 8.12 Run `npm run build` — pass

## Dev Notes

### Architecture Patterns & Constraints

- **All DB schemas already exist** — Story 1.2 created all 27 tables including `glossaries` and `glossary_terms`. This story does NOT create new tables. It creates Server Actions, parsers, cache layer, and UI to interact with them.
- **Feature-based co-location** — All glossary code goes in `src/features/glossary/` with sub-folders: `actions/`, `components/`, `parsers/`, `validation/`, `types.ts`.
- **Server Actions for mutations** — Import, create, update, delete operations use Server Actions returning `ActionResult<T>`.
- **RSC boundary** — Page is Server Component that fetches data. Client Components handle interactive forms/tables.
- **No barrel exports** — Import directly from specific files, NOT `src/features/glossary/index.ts` (exception: `parsers/index.ts` as parser registry).

### CRITICAL: Schema Discrepancy — Epic vs Actual DB

The epic AC mentions `format_source` on glossaries and `tenant_id`, `language_pair`, `notes` on glossary_terms. **The actual DB schema (created in Story 1.2) is different:**

```typescript
// ACTUAL glossaries schema (src/db/schema/glossaries.ts):
{
  id: uuid PK,
  tenantId: uuid FK→tenants (NOT NULL),
  projectId: uuid FK→projects (nullable, onDelete: set null),
  name: varchar(255) NOT NULL,
  sourceLang: varchar(35) NOT NULL,    // ← instead of format_source
  targetLang: varchar(35) NOT NULL,    // ← language pair is per-glossary
  createdAt: timestamptz,
}

// ACTUAL glossary_terms schema (src/db/schema/glossaryTerms.ts):
{
  id: uuid PK,
  glossaryId: uuid FK→glossaries (NOT NULL, onDelete: cascade),
  sourceTerm: varchar(500) NOT NULL,
  targetTerm: varchar(500) NOT NULL,
  caseSensitive: boolean NOT NULL default false,   // ← not in epic
  createdAt: timestamptz,
}
// NOTE: No tenant_id on glossary_terms — tenant isolation via glossary FK
// NOTE: No language_pair on glossary_terms — inherited from parent glossary
// NOTE: No notes field on glossary_terms
```

**The actual DB schema is the source of truth.** Do NOT attempt to modify the schema to match the epic text. The Architecture ERD (Decision 1.9) is authoritative.

### CRITICAL: Existing DB-Level Validation

Two validation layers exist — do NOT confuse them:

```
src/db/validation/index.ts              ← DB-level validation (from drizzle-zod)
                                           Already exists from Story 1.2
                                           Includes: glossaryInsertSchema, glossaryTermInsertSchema,
                                           glossarySelectSchema, glossaryTermSelectSchema,
                                           glossaryUpdateSchema, glossaryTermUpdateSchema

src/features/glossary/validation/       ← Feature-level validation (form schemas with business rules)
                                           Created in this story
                                           Includes: importGlossarySchema, createTermSchema,
                                           updateTermSchema, columnMappingSchema
```

Feature-level schemas ADD business rules on top of DB-level schemas. Server Actions use FEATURE-level schemas.

### CRITICAL: Glossary Cache Pattern

```typescript
// src/lib/cache/glossaryCache.ts
"use cache"
import { cacheTag, cacheLife } from "next/cache"

export async function getCachedGlossaryTerms(projectId: string, tenantId: string) {
  cacheTag(`glossary-${projectId}`)
  cacheLife("minutes") // 5 min default
  // ... DB query
}

// EVERY mutation action MUST invalidate cache:
import { revalidateTag } from 'next/cache'
revalidateTag(`glossary-${projectId}`)
```

Per Architecture Decision 1.3 — cache glossary data using `"use cache"` directive (stable in Next.js 16). Load cached data once per project run, reuse across all segments.

### CRITICAL: Precomputed Glossary Index

PRD mandates: "Glossary index architecture (precompute on import) — On-the-fly matching won't scale past 500 terms."

For Story 1.4, the "precomputed index" means:
1. On import: all terms are stored in DB with proper structure
2. On cache load: terms are loaded into memory as a flat array for fast iteration
3. The actual matching algorithm (substring + boundary validation) is Story 1.5

The import action should ensure terms are normalized (trimmed, NFKC, no empty strings) and deduplicated at insert time.

### CRITICAL: NFKC Normalization at Import Time

Architecture Decision 5.6 requires NFKC normalization before glossary matching. To ensure consistent data, normalize terms **at import time** (not at matching time):

```typescript
function normalizeTerm(term: string): string {
  return term.trim().normalize('NFKC')
}
```

Apply in ALL parsers (csvParser, tbxParser, excelParser) before returning terms. This ensures:
- Halfwidth katakana (ﾌﾟﾛｸﾞﾗﾐﾝｸﾞ) is stored as fullwidth (プログラミング)
- Thai/CJK text is consistently normalized in DB
- Story 1.5 matching engine can compare directly without re-normalizing

### CRITICAL: Duplicate Detection Algorithm

Deduplication happens at two levels during import:

1. **Intra-file dedup**: Within the imported file, group by `sourceTerm.normalize('NFKC').toLowerCase()`.
   Keep first occurrence, count rest as `duplicates` in ImportResult.
2. **Cross-DB dedup**: Query existing terms in the SAME glossary (`glossary_id`).
   Compare `existingTerm.sourceTerm` vs `newTerm.sourceTerm` (both NFKC-normalized, case-insensitive).
   Skip matches, count as `duplicates`.

The `caseSensitive` field on glossary_terms controls **matching behavior** (Story 1.5), NOT dedup behavior.
Dedup is always case-insensitive to prevent near-duplicate entries.

### CRITICAL: File Upload via FormData

Server Actions accepting file uploads MUST use `FormData` (not `unknown`):

```typescript
// ✅ CORRECT for file uploads
export async function importGlossary(formData: FormData): Promise<ActionResult<ImportResult>> {
  const file = formData.get('file') as File
  const name = formData.get('name') as string
  // ... validate fields manually or via Zod
}
```

This differs from regular Server Actions that accept `(input: unknown)`.

### CRITICAL: Batch Insert Performance

For 500+ terms, insert in batches of 500 to avoid PostgreSQL query parameter limits:

```typescript
const BATCH_SIZE = 500
for (let i = 0; i < terms.length; i += BATCH_SIZE) {
  const batch = terms.slice(i, i + BATCH_SIZE)
  await db.insert(glossaryTerms).values(batch)
}
```

Single-row inserts would be O(n) round trips — unacceptable for performance target.

### CRITICAL: TBX Parsing with fast-xml-parser

TBX (TermBase eXchange) is an XML standard for terminology exchange. Structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<martif type="TBX">
  <body>
    <termEntry id="entry1">
      <langSet xml:lang="en">
        <tig><term>cloud computing</term></tig>
      </langSet>
      <langSet xml:lang="th">
        <tig><term>คลาวด์คอมพิวติ้ง</term></tig>
      </langSet>
    </termEntry>
  </body>
</martif>
```

Use `fast-xml-parser` (already installed) with `{ ignoreAttributes: false }` to preserve `xml:lang` attributes.

### CRITICAL: Tenant Isolation for Glossary Terms

`glossary_terms` does NOT have `tenant_id`. Tenant isolation is achieved through the parent `glossaries` table:

```typescript
// To verify a term belongs to current tenant:
const [term] = await db.select()
  .from(glossaryTerms)
  .innerJoin(glossaries, eq(glossaryTerms.glossaryId, glossaries.id))
  .where(and(
    eq(glossaryTerms.id, termId),
    withTenant(glossaries.tenantId, currentUser.tenantId),
  ))
```

NEVER access glossary_terms without joining to glossaries for tenant verification.

### CRITICAL: All Patterns from Story 1.3

All patterns from Story 1.3 apply here:
- `withTenant(column, tenantId)` — TWO parameters (PgColumn, string)
- `requireRole('admin', 'write')` — **THROWS** on failure. Must wrap in **try-catch** and return `ActionResult` error:
  ```typescript
  let currentUser
  try { currentUser = await requireRole('admin', 'write') }
  catch { return { success: false, code: 'FORBIDDEN', error: 'Admin access required' } }
  ```
- `ActionResult<T>` = `{ success: true; data: T } | { success: false; error: string; code: string }`
- `import 'server-only'` — REQUIRED in every server action file (after `'use server'`)
- `writeAuditLog({ tenantId, userId, entityType, entityId, action, oldValue?, newValue? })` for EVERY mutation
- `export const dynamic = 'force-dynamic'` on pages with DB access
- `const { projectId } = await params` — Next.js 16 async params
- `getCurrentUser()` for read operations (not requireRole)

### UX Design Patterns

**Glossary Import Dialog:**
- Multi-step: File Selection → Column Mapping → Import Results
- Drag & drop or file picker for file selection
- Column mapping shows preview of first 5 rows
- TBX skips column mapping step (auto-detected from XML)

**Glossary Management Page:**
- Table of glossaries with term count
- Expand to view/edit terms
- Search/filter by term text (client-side for MVP)
- Admin-only actions: Import, Add Term, Edit, Delete
- QA Reviewer: view-only access

**Import Results Summary:**
- `✅ Imported: N terms`
- `⚠️ Duplicates: M (skipped)`
- `❌ Errors: E (failed to import)`
- Error details table: line, reason, code

**Error State Pattern:**
- Glossary import error: "Some glossary entries could not be imported" → [View Skipped] [Close]
- Import is one-shot: valid entries are auto-imported, errors are skipped and reported
- [View Skipped] toggles error details table visibility

### Future Notification Hook (FR45 — Story 1.7)

Story 1.7 will implement glossary change notifications (FR45). When implemented, mutation actions
(importGlossary, createTerm, updateTerm, deleteTerm, deleteGlossary) will need to emit notification events.
For now, no notification logic is needed — but the clean separation of mutation actions makes it easy to add later.

### Scoping Notes — What is NOT in this Story

| Feature | Story | Rationale |
|---------|-------|-----------|
| Glossary matching engine (FR43, FR44) | Story 1.5 | Separate story for matching algorithm |
| Add term from review interface (FR42) | Story 4.7 | Requires review UI (Epic 4) |
| Glossary change notifications (FR45) | Story 1.7 / Epic 6 | Requires notification system |
| Glossary hierarchy (Global → Project → Client) | Growth | Not MVP |
| Export glossary | Growth | Not in MVP scope |

### Project Structure Notes

All new files follow the established feature-based co-location pattern:

```
src/features/glossary/
├── actions/
│   ├── importGlossary.action.ts           [NEW]
│   ├── importGlossary.action.test.ts      [NEW]
│   ├── createTerm.action.ts               [NEW]
│   ├── createTerm.action.test.ts          [NEW]
│   ├── updateTerm.action.ts               [NEW]
│   ├── updateTerm.action.test.ts          [NEW]
│   ├── deleteTerm.action.ts               [NEW]
│   ├── deleteTerm.action.test.ts          [NEW]
│   ├── deleteGlossary.action.ts           [NEW]
│   └── getGlossaryTerms.action.ts         [NEW]
├── components/
│   ├── GlossaryManager.tsx                [NEW]
│   ├── GlossaryList.tsx                   [NEW]
│   ├── GlossaryTermTable.tsx              [NEW]
│   ├── GlossaryImportDialog.tsx           [NEW]
│   └── TermEditDialog.tsx                 [NEW]
├── parsers/
│   ├── csvParser.ts                       [NEW]
│   ├── csvParser.test.ts                  [NEW]
│   ├── tbxParser.ts                       [NEW]
│   ├── tbxParser.test.ts                  [NEW]
│   ├── excelParser.ts                     [NEW]
│   ├── excelParser.test.ts                [NEW]
│   └── index.ts                           [NEW] (parser registry)
├── validation/
│   ├── glossarySchemas.ts                 [NEW]
│   └── glossarySchemas.test.ts            [NEW]
└── types.ts                               [NEW]

src/lib/cache/
└── glossaryCache.ts                       [NEW]

src/app/(app)/projects/[projectId]/glossary/
└── page.tsx                               [NEW]
```

**Files MODIFIED (existing):**
- `src/app/(app)/projects/[projectId]/layout.tsx` — Create project sub-navigation (Settings + Glossary tabs)
- NO new npm dependencies needed — `exceljs@4.4.0` and `fast-xml-parser@5.3.6` already installed

### Previous Story Intelligence

**From Story 1.3:**
- 40 new unit tests — 102 total passing. Do NOT break them.
- Server Action pattern: `requireRole('admin', 'write')` → validate → DB op → writeAuditLog → revalidate → return
- `ProjectCreateDialog` uses FormData pattern with `useTransition` — follow same for `GlossaryImportDialog`
- Project settings page uses `const { projectId } = await params` — same pattern needed here
- `LanguagePairConfigTable` shows editable inline table — similar pattern for `GlossaryTermTable`

**From Story 1.2:**
- 60 unit tests established. Total now 102.
- `fast-xml-parser` already installed — use for TBX parsing
- `writeAuditLog` utility at `src/features/audit/actions/writeAuditLog.ts`
- DB-level validation schemas at `src/db/validation/index.ts` — glossary schemas already exist

**From Code Review (Story 1.2):**
- Always add tenant filter on JOIN conditions (defense-in-depth)
- `requireRole` throws `{ error }` not `{ message }`

### Git Intelligence

Recent commits:
1. `5f768a1` — fix(auth): CR3 security hardening
2. `d771e5e` — fix(auth): resolve 5 production bugs + 8 code review findings
3. `8b95444` — fix(auth): resolve 10 code review findings for Story 1.2
4. `baa00b8` — feat(schema+auth): implement Story 1.2
5. `5a8abac` — docs(ux): resolve 3 gap specs, cross-doc consistency

Pattern: Conventional Commits with scope. Expect: `feat(glossary): implement Story 1.4 — glossary import & management`

### References

- [Source: epics/epic-1-project-foundation-configuration.md#Story 1.4] — Full acceptance criteria
- [Source: architecture/core-architectural-decisions.md#Decision 1.3] — Caching strategy: "use cache" + cacheTag
- [Source: architecture/core-architectural-decisions.md#Decision 1.9] — ERD: glossaries + glossary_terms schema
- [Source: architecture/core-architectural-decisions.md#Decision 5.6] — Hybrid glossary matching (Story 1.5 scope)
- [Source: architecture/project-structure-boundaries.md] — Feature folder: src/features/glossary/
- [Source: architecture/implementation-patterns-consistency-rules.md] — Server Action patterns, ActionResult
- [Source: prd.md#Section 9.5] — FR40-FR45 Glossary Management requirements
- [Source: prd.md#Section 4.6] — Glossary capability mapping (MVP vs Growth)
- [Source: ux-design-specification/ux-consistency-patterns.md] — Import error handling UX
- [Source: ux-design-specification/core-user-experience.md] — Edge case: Glossary Is Wrong
- [Source: ux-design-specification/component-strategy.md] — Setup Tour Step 3: Import Glossary
- [Source: project-context.md] — 120 implementation rules, testing conventions
- [Source: implementation-artifacts/1-3-project-management-configuration.md] — Story 1.3 learnings

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- ExcelJS mock issue: `vi.fn().mockImplementation()` doesn't work as constructor → fixed with `class MockWorkbook`
- Zod UUID validation: test data used `'glossary-1'` strings but schema requires UUID → switched to valid UUIDs
- `mockResolvedValueOnce` queue not cleared by `vi.clearAllMocks()` → use `mockReset()` before re-setting queue
- `revalidateTag` in Next.js 16 requires 2 args `(tag, profile)` → added `'minutes'` as second arg
- `Buffer.from(buffer)` type incompatibility with exceljs → `Buffer.from(new Uint8Array(buffer)) as never`
- `sourceColIndex`/`targetColIndex` possibly undefined in callback → assigned to const before callback

### Completion Notes List

- All 70 glossary unit tests pass (12 test files) — includes 5 new from CR Round 3
- 190 total unit tests (29 files), 0 failing
- Integration tests: 12 tests (1 file, separate vitest project) — real data: Microsoft Terminology (6 languages) + Yaitron EN-TH
- E2E: 13 passed (6 glossary + 7 auth-tenant), 3 skipped (Epic 2-4 stubs)
- type-check: 0 errors
- lint: 0 errors, 0 warnings
- build: compiled successfully, glossary route registered
- No new npm dependencies required (exceljs@4.4.0 and fast-xml-parser@5.3.6 already installed)
- Code review: Round 1 — 11 findings (3 HIGH, 5 MEDIUM, 3 LOW) — ALL fixed
- Code review: Round 2 — 5 findings (2 HIGH, 1 MEDIUM, 2 LOW) — ALL fixed
- Code review: Round 3 — 7 findings (4 HIGH, 2 MEDIUM, 1 LOW) — ALL fixed
- E2E tests rewritten from TDD red phase to full working tests with real Supabase DB
- TBX parser hardened with real-world Microsoft Terminology (34K+ terms × 6 languages)

### Code Review Fixes Applied

CR performed by Claude Opus 4.6. 11 findings identified, all fixed.

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| CR1 | HIGH | GlossaryList.tsx — `<>` Fragment without key in `.map()` | Replaced with `<Fragment key={g.id}>` |
| CR2 | HIGH | Missing deleteGlossary.action.test.ts | Created 6-test file (admin delete, NOT_FOUND, cross-tenant, FORBIDDEN, audit, revalidateTag) |
| CR3 | HIGH | Missing getGlossaryTerms.action.test.ts | Created 4-test file (auth success, UNAUTHORIZED, cross-tenant, empty terms) |
| CR4 | MEDIUM | createTerm loads ALL terms for single dedup check (O(n) memory) | Replaced with SQL-level `lower()` comparison + `.limit(1)` |
| CR5 | MEDIUM | importGlossary cross-DB dedup queries always-empty new glossary (dead code) | Removed dead code block |
| CR6 | MEDIUM | updateTerm/deleteTerm termId not UUID-validated | Added UUID regex validation before requireRole |
| CR7 | MEDIUM | GlossaryList + GlossaryTermTable use `window.confirm()` | Replaced with shadcn AlertDialog component |
| CR8 | MEDIUM | vitest.config.ts modified but not in story File List | Documented in Modified files section |
| CR9 | LOW | GlossaryTermTable `projectId` prop unused (aliased as `_projectId`) | Removed prop from GlossaryTermTable, GlossaryList, and GlossaryManager |
| CR10 | LOW | glossaryCache.ts redundant file-level `'use cache'` + function-level `'use cache'` | Removed file-level directive (functions have their own) |
| CR11 | LOW | importGlossary no validation project has targetLangs | Added early return with VALIDATION_ERROR if targetLangs empty |

Test impact (Round 1): 181 tests passing (29 files), +12 new tests from CR2+CR3, +2 new tests from UUID validation in CR6.

### Code Review Round 2 Fixes Applied

CR Round 2 performed by Claude Opus 4.6. 5 findings identified, all fixed.

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| CR12 | HIGH | deleteGlossary.action.ts — No UUID validation for glossaryId param (inconsistent with CR6) | Added `isUuid()` check before requireRole |
| CR13 | HIGH | getGlossaryTerms.action.ts — No UUID validation for glossaryId param | Added `isUuid()` check before getCurrentUser |
| CR14 | MEDIUM | updateTerm.action.ts — No duplicate-source-term check on update (unlike createTerm) | Added SQL-level dedup with `lower()` + self-exclusion via `!= termId` |
| CR15 | LOW | importGlossary.action.ts — Orphaned `// Read file content` comment + dead `termsToInsert` alias from CR5 removal | Removed comment, inlined `uniqueTerms` |
| CR16 | LOW | updateTerm + deleteTerm — Duplicated UUID regex copy-pasted | Extracted `isUuid()` to `@/lib/validation/uuid.ts`, used in all 4 actions |

Test impact (Round 2): 185 unit tests passing (29 files), +4 new tests (UUID validation for deleteGlossary/getGlossaryTerms, dedup-on-update for updateTerm x2).

### Code Review Round 3 Fixes Applied

CR Round 3 triggered by real-world testing with Microsoft Terminology Collection (34K+ terms × 6 languages) and Yaitron EN-TH (124K entries). 7 findings identified, all fixed.

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| CR17 | HIGH | `extractTermText` doesn't handle numeric terms — fast-xml-parser returns `number` for `<term>404</term>` | Extracted `extractTermValue()` helper handling string, number, and object with `#text` |
| CR18 | HIGH | Integration tests run in both `unit` and `integration` vitest projects (pattern overlap) | Added `'src/__tests__/integration/**'` to unit project exclude |
| CR19 | HIGH | No unit test for `<martif><text><body>` structure (Microsoft TBX format) | Added unit test with `<text>` wrapper |
| CR20 | HIGH | No unit test for `<ntig><termGrp><term>` structure with attributes | Added unit test with `ntig` + `@_id` attribute |
| CR21 | MEDIUM | No unit tests for BCP47 prefix matching (`en` ↔ `en-US`) | Added 2 unit tests: prefix matching + exact-match preference |
| CR22 | MEDIUM | `matchLangTag` loop overwrites on multiple prefix matches (last wins) | Changed to prefer exact match; prefix match only sets if nothing found yet |
| CR23 | LOW | Story file not updated with CR3 changes | Updated completion notes, change log, file list |

Additional fix: Added `/// <reference types="vitest/globals" />` to integration test file for TypeScript type-check.

Test impact (Round 3): 190 unit tests (29 files) + 12 integration tests (1 file), 0 failing. Lint + type-check clean.

### E2E Tests

6 serial E2E tests covering full glossary user journey (signup → create project → import → CRUD → delete):

| Test | Description |
|------|-------------|
| [setup] | Signup, create EN→TH project, navigate to glossary page |
| Import CSV | Upload `glossary-sample.csv` (5 terms), verify import results |
| Add term | Add "Unit Test" → "การทดสอบหน่วย", verify in table |
| Edit term | Change target to "ยูนิตเทส", verify update |
| Delete term | Delete "Unit Test" row via AlertDialog, verify removed |
| Delete glossary | Delete "glossary-sample" glossary, verify empty state |

Accessible selectors used (getByRole, getByLabel, getByText) per Playwright best practices — no data-testid.

### Lint Fixes

Fixed import-order warnings (5 total) in 3 files:
- `src/components/ui/alert-dialog.tsx` — reordered radix-ui before react, button before utils
- `src/components/ui/button.tsx` — reordered radix-ui before react
- `src/db/__tests__/rls/setup.ts` — reordered path before dotenv, added empty line between groups

### Change Log

| File | Action | Description |
|------|--------|-------------|
| `src/features/glossary/types.ts` | NEW | Import error codes, ParsedTerm, ImportResult types |
| `src/features/glossary/validation/glossarySchemas.ts` | NEW | Zod schemas: importGlossary, columnMapping, createTerm, updateTerm |
| `src/features/glossary/validation/glossarySchemas.test.ts` | NEW | 12 schema validation tests |
| `src/features/glossary/parsers/csvParser.ts` | NEW | CSV parser with RFC 4180 quoted field handling, NFKC normalization |
| `src/features/glossary/parsers/csvParser.test.ts` | NEW | 10 CSV parser tests |
| `src/features/glossary/parsers/tbxParser.ts` | NEW | TBX parser using fast-xml-parser, supports tig + ntig structures |
| `src/features/glossary/parsers/tbxParser.test.ts` | NEW | 11 TBX parser tests (6 original + 5 CR3: text wrapper, ntig, BCP47, exact-match, numeric) |
| `src/features/glossary/parsers/excelParser.ts` | NEW | Excel parser using exceljs, header/index column mapping |
| `src/features/glossary/parsers/excelParser.test.ts` | NEW | 4 Excel parser tests with mock class |
| `src/features/glossary/parsers/index.ts` | NEW | Parser dispatch: parseGlossaryFile() routes to correct parser |
| `src/features/glossary/actions/importGlossary.action.ts` | NEW | Import glossary action: FormData, parse, dedup, batch insert, audit |
| `src/features/glossary/actions/importGlossary.action.test.ts` | NEW | 6 import action tests |
| `src/features/glossary/actions/createTerm.action.ts` | NEW | Create term action: validate, dedup check, insert, audit |
| `src/features/glossary/actions/createTerm.action.test.ts` | NEW | 4 create term tests |
| `src/features/glossary/actions/updateTerm.action.ts` | NEW | Update term action: innerJoin tenant verify, update, audit |
| `src/features/glossary/actions/updateTerm.action.test.ts` | NEW | 4 update term tests |
| `src/features/glossary/actions/deleteTerm.action.ts` | NEW | Delete term action: innerJoin tenant verify, delete, audit |
| `src/features/glossary/actions/deleteTerm.action.test.ts` | NEW | 3 delete term tests |
| `src/features/glossary/actions/deleteGlossary.action.ts` | NEW | Delete glossary action: cascade FK delete, audit |
| `src/features/glossary/actions/getGlossaryTerms.action.ts` | NEW | Read action: fetch terms by glossaryId with tenant verify |
| `src/features/glossary/components/GlossaryManager.tsx` | NEW | Client entry component: PageHeader, import button, GlossaryList |
| `src/features/glossary/components/GlossaryList.tsx` | NEW | Glossary table with expand/collapse term view, delete button |
| `src/features/glossary/components/GlossaryTermTable.tsx` | NEW | Term table with search, pagination (50/page), CRUD actions |
| `src/features/glossary/components/GlossaryImportDialog.tsx` | NEW | Multi-step dialog: file → mapping → results |
| `src/features/glossary/components/TermEditDialog.tsx` | NEW | Create/edit term dialog with source/target/caseSensitive |
| `src/lib/cache/glossaryCache.ts` | NEW | "use cache" functions: getCachedGlossaryTerms, getCachedGlossaries |
| `src/app/(app)/projects/[projectId]/glossary/page.tsx` | NEW | Server Component page: force-dynamic, LEFT JOIN term count |
| `src/app/(app)/projects/[projectId]/layout.tsx` | MODIFIED | Added ProjectSubNav with Settings + Glossary tabs |
| `src/features/project/components/ProjectSubNav.tsx` | NEW | Client tab navigation using usePathname() |

### File List

**New files (33):**
```
src/features/glossary/types.ts
src/features/glossary/validation/glossarySchemas.ts
src/features/glossary/validation/glossarySchemas.test.ts
src/features/glossary/parsers/csvParser.ts
src/features/glossary/parsers/csvParser.test.ts
src/features/glossary/parsers/tbxParser.ts
src/features/glossary/parsers/tbxParser.test.ts
src/features/glossary/parsers/excelParser.ts
src/features/glossary/parsers/excelParser.test.ts
src/features/glossary/parsers/index.ts
src/features/glossary/actions/importGlossary.action.ts
src/features/glossary/actions/importGlossary.action.test.ts
src/features/glossary/actions/createTerm.action.ts
src/features/glossary/actions/createTerm.action.test.ts
src/features/glossary/actions/updateTerm.action.ts
src/features/glossary/actions/updateTerm.action.test.ts
src/features/glossary/actions/deleteTerm.action.ts
src/features/glossary/actions/deleteTerm.action.test.ts
src/features/glossary/actions/deleteGlossary.action.ts
src/features/glossary/actions/deleteGlossary.action.test.ts
src/features/glossary/actions/getGlossaryTerms.action.ts
src/features/glossary/actions/getGlossaryTerms.action.test.ts
src/features/glossary/components/GlossaryManager.tsx
src/features/glossary/components/GlossaryList.tsx
src/features/glossary/components/GlossaryTermTable.tsx
src/features/glossary/components/GlossaryImportDialog.tsx
src/features/glossary/components/TermEditDialog.tsx
src/components/ui/alert-dialog.tsx
src/lib/validation/uuid.ts
src/lib/cache/glossaryCache.ts
src/app/(app)/projects/[projectId]/glossary/page.tsx
src/features/project/components/ProjectSubNav.tsx
```

**Integration test files (1):**
```
src/__tests__/integration/glossary-parsers-real-data.test.ts
```

**E2E test files (2):**
```
e2e/glossary-import.spec.ts
e2e/fixtures/glossary-sample.csv
```

**Modified files (5):**
```
src/app/(app)/projects/[projectId]/layout.tsx
src/components/ui/alert-dialog.tsx          (lint: import order fix)
src/components/ui/button.tsx                (lint: import order fix)
src/db/__tests__/rls/setup.ts              (lint: import order fix)
vitest.config.ts                            (added integration project, fixed unit exclude)
```
