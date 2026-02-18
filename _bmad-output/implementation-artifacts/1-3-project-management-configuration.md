# Story 1.3: Project Management & Configuration

Status: review

<!-- Validation: PASSED — Create-story validation: 29 issues resolved. SM Review: 3 Critical + 3 High + 4 Medium + 2 Low found and resolved. -->

## Story

As an Admin,
I want to create and manage QA projects with associated settings,
so that my team has organized workspaces for each localization project.

## Acceptance Criteria

1. **AC1: Project List View**
   - **Given** an Admin is logged in
   - **When** they navigate to the Projects page
   - **Then** they see a list of all projects for their tenant with name, language pairs, creation date, and file count
   - **And** projects are ordered by most recently updated first

2. **AC2: Create Project**
   - **Given** an Admin is on the Projects page
   - **When** they click "Create Project"
   - **Then** a form appears to enter: project name, description, source language, target language(s), and processing mode default (Economy/Thorough)
   - **And** upon submission, a new project is created with `tenant_id` automatically set
   - **And** the project appears in the project list
   - **And** an audit trail entry is written for `project.created`

3. **AC3: Project Settings**
   - **Given** a project exists
   - **When** an Admin opens project settings
   - **Then** they can edit: project name, description, default processing mode, auto-pass threshold (default 95), and language pair configurations (FR53)
   - **And** changes are saved with audit trail entry for `project.updated`

4. **AC4: QA Reviewer Access**
   - **Given** a QA Reviewer is logged in
   - **When** they access the project list
   - **Then** they can view projects assigned to their tenant but cannot create or delete projects
   - **And** "Create Project" button is not visible to non-admin users

5. **AC5: Schema Verification** *(verification-only — no implementation task, schema already exists from Story 1.2)*
   - **Given** the projects table schema (already created in Story 1.2)
   - **When** I inspect the database
   - **Then** the projects table includes: id, tenant_id, name, description, source_lang, target_langs (jsonb array of BCP-47 codes), processing_mode, status, auto_pass_threshold, ai_budget_monthly_usd, created_at, updated_at
   - **And** `language_pair_configs` table exists with PROVISIONAL thresholds per language pair (EN→TH: 93, EN→JA: 93, EN→ZH: 94, default: 95) — these are provisional values requiring calibration during beta per Architecture Decision 3.6
   - **And** when a file is scored, system uses exact threshold from `language_pair_configs` for the file's language pair, or falls back to default 95 if config missing

## Tasks / Subtasks

### Task 1: Project Feature Module Structure (AC: #1-#5)

Set up the feature module directory and validation schemas.

- [x] 1.1 Create `src/features/project/validation/projectSchemas.ts` — Zod validation schemas for project forms
  ```typescript
  // 'use server' NOT needed — this is shared validation
  import { z } from 'zod'

  const bcp47Schema = z.string().regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/, 'Invalid BCP-47 language code')

  export const createProjectSchema = z.object({
    name: z.string().min(1, 'Project name is required').max(255, 'Project name too long'),
    description: z.string().max(1000).optional(),
    sourceLang: bcp47Schema,
    targetLangs: z.array(bcp47Schema).min(1, 'At least one target language required'),
    processingMode: z.enum(['economy', 'thorough']),
  })

  export const updateProjectSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).nullable().optional(), // nullable = explicitly clear (set to null), optional = don't change (omit field)
    processingMode: z.enum(['economy', 'thorough']).optional(),
    autoPassThreshold: z.number().int().min(0).max(100).optional(),
  })

  export const updateLanguagePairConfigSchema = z.object({
    projectId: z.string().uuid('Invalid project ID'),
    sourceLang: bcp47Schema,
    targetLang: bcp47Schema,
    autoPassThreshold: z.number().int().min(0).max(100).optional(),
    l2ConfidenceMin: z.number().int().min(0).max(100).optional(),
    l3ConfidenceMin: z.number().int().min(0).max(100).optional(),
    mutedCategories: z.array(z.string()).optional(),
    wordSegmenter: z.enum(['intl', 'space']).optional(),
  })

  export type CreateProjectInput = z.infer<typeof createProjectSchema>
  export type UpdateProjectInput = z.infer<typeof updateProjectSchema>
  export type UpdateLanguagePairConfigInput = z.infer<typeof updateLanguagePairConfigSchema>
  // NOTE: projectId + sourceLang + targetLang are REQUIRED (identify which config row)
  //       threshold/config fields are OPTIONAL (partial update)
  ```

- [x] 1.2 (Tests moved to Task 8.1 to avoid duplication)

### Task 2: Server Actions — Project CRUD (AC: #2, #3)

- [x] 2.1 Create `src/features/project/actions/createProject.action.ts`
  ```typescript
  'use server'
  import { requireRole } from '@/lib/auth/requireRole'
  import { db } from '@/db/client'
  import { projects } from '@/db/schema/projects'
  import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
  import { createProjectSchema } from '@/features/project/validation/projectSchemas'
  import { revalidatePath } from 'next/cache'
  import type { ActionResult } from '@/types/actionResult'

  // Signature: (input: unknown) — always unknown, validate with Zod
  // Pattern: follows createUser.action.ts
  //
  // Flow:
  //   1. requireRole('admin', 'write') — throws if unauthorized (M3 DB lookup)
  //      IMPORTANT: requireRole() THROWS on failure (does NOT return error)
  //      It throws { success: false, code, error } — catch and return if needed
  //   2. Validate input via createProjectSchema.safeParse(input)
  //   3. db.insert(projects).values({ ...validated, tenantId: currentUser.tenantId }).returning()
  //      NOTE: status defaults to 'draft' via DB schema default — do NOT set explicitly
  //   4. writeAuditLog({ entityType: 'project', entityId: project.id, action: 'created',
  //         newValue: { name, sourceLang, targetLangs, processingMode } })
  //      NOTE: omit oldValue for creates (do NOT pass null — exactOptionalPropertyTypes)
  //   5. revalidatePath('/projects')
  //   6. Return ActionResult<Project>
  ```

- [x] 2.2 Create `src/features/project/actions/updateProject.action.ts`
  ```typescript
  'use server'
  // Signature: (projectId: string, input: unknown) — projectId from route, input validated
  // Flow:
  //   1. requireRole('admin', 'write') — throws if unauthorized (M3 DB lookup)
  //   2. Validate input via updateProjectSchema.safeParse(input)
  //   3. Fetch existing project with withTenant() — verify ownership:
  //      const [existing] = await db.select().from(projects)
  //        .where(and(eq(projects.id, projectId), withTenant(projects.tenantId, currentUser.tenantId)))
  //      If not found → return { success: false, code: 'NOT_FOUND', error: 'Project not found' }
  //   4. db.update(projects).set({ ...validated, updatedAt: new Date() }).where(eq(projects.id, projectId)).returning()
  //   5. writeAuditLog({ entityType: 'project', entityId: projectId, action: 'updated',
  //        oldValue: { name: existing.name, processingMode: existing.processingMode, ... },
  //        newValue: { ...validated } })
  //   6. revalidatePath('/projects') — refresh project list
  //   7. revalidatePath(`/projects/${projectId}/settings`) — refresh settings page
  //   8. Return ActionResult<Project>
  ```

- [x] 2.3 Create `src/features/project/actions/updateLanguagePairConfig.action.ts`
  ```typescript
  'use server'
  // Signature: (input: unknown) — always unknown, validate with Zod
  // Flow:
  //   1. requireRole('admin', 'write') — throws if unauthorized (M3 DB lookup)
  //   2. Validate input via updateLanguagePairConfigSchema.safeParse(input)
  //   3. Manual find-then-insert/update (NO onConflictDoUpdate — no UNIQUE constraint exists):
  //      const [existing] = await db.select()
  //        .from(languagePairConfigs)
  //        .where(and(
  //          withTenant(languagePairConfigs.tenantId, currentUser.tenantId),
  //          eq(languagePairConfigs.sourceLang, sourceLang),
  //          eq(languagePairConfigs.targetLang, targetLang),
  //        ))
  //        .limit(1)
  //      if (existing) → db.update().set({...validated, updatedAt: new Date()}).where(eq(id, existing.id))
  //      else → db.insert().values({tenantId, sourceLang, targetLang, ...validated,
  //        autoPassThreshold: validated.autoPassThreshold ?? 95,
  //        l2ConfidenceMin: validated.l2ConfidenceMin ?? 70,
  //        l3ConfidenceMin: validated.l3ConfidenceMin ?? 70,
  //      })
  //      NOTE: autoPassThreshold, l2ConfidenceMin, l3ConfidenceMin are NOT NULL without DB defaults
  //            — MUST provide fallback values on insert
  //   4. writeAuditLog({ entityType: 'language_pair_config', entityId, action: existing ? 'updated' : 'created' })
  //   5. revalidatePath(`/projects/${projectId}/settings`)
  //   6. Return ActionResult<LanguagePairConfig>
  ```

- [x] 2.4 (Server Action tests moved to Task 8 to consolidate all tests)

### Task 3: Project List Page (AC: #1, #4)

- [x] 3.1 Create `src/app/(app)/projects/page.tsx` — Server Component
  ```typescript
  import { eq, and, desc, count } from 'drizzle-orm'
  import { redirect } from 'next/navigation'
  import { db } from '@/db/client'
  import { withTenant } from '@/db/helpers/withTenant'
  import { projects } from '@/db/schema/projects'
  import { files } from '@/db/schema/files'
  import { getCurrentUser } from '@/lib/auth/getCurrentUser'
  import { ProjectList } from '@/features/project/components/ProjectList'

  export const dynamic = 'force-dynamic'
  export const metadata = { title: 'Projects — QA Localization Tool' }

  // Pattern follows admin/page.tsx:
  // 1. getCurrentUser() — if not logged in, redirect to /login
  // 2. Fetch projects with file count via LEFT JOIN
  //    IMPORTANT: tenant filter on BOTH where clause AND join condition (defense-in-depth)
  //    db.select({ ...getTableColumns(projects), fileCount: count(files.id) })
  //      .from(projects)
  //      .leftJoin(files, and(
  //        eq(projects.id, files.projectId),
  //        eq(files.tenantId, currentUser.tenantId),  // ← tenant filter on JOIN
  //      ))
  //      .where(withTenant(projects.tenantId, currentUser.tenantId))
  //      .groupBy(projects.id)
  //      .orderBy(desc(projects.updatedAt))
  // 3. Pass to <ProjectList> client component with { projects, userRole: currentUser.role }
  ```

- [x] 3.2 Create `src/features/project/components/ProjectList.tsx` — Client Component
  ```typescript
  'use client'
  // Props: { projects: ProjectWithFileCount[], userRole: AppRole }
  // Renders:
  //   - PageHeader with title "Projects" and Create Project button (visible only for admin)
  //   - CompactLayout wrapper
  //   - If no projects: inline empty state with message "No projects yet. Create your first project."
  //     (Use a simple <div> with centered text + optional icon — no separate EmptyState component needed for MVP)
  //   - Project cards/rows: name, source_lang → target_langs, created_at (formatted via Intl.DateTimeFormat), file count
  //   - Each card has "Settings" link → /projects/{id}/settings (admin only)
  //   - Uses Sonner toast for action feedback
  //   - Create Project button opens <ProjectCreateDialog>
  ```

- [x] 3.3 Create `src/features/project/components/ProjectCard.tsx` — Client Component
  ```typescript
  'use client'
  // Props: { project: ProjectWithFileCount, userRole: AppRole }
  // Renders a card with:
  //   - Project name (heading)
  //   - Language badge: source_lang → target_langs (e.g., "EN → TH, JA, ZH")
  //   - Created date (relative: "2 days ago" or absolute based on age)
  //   - File count badge
  //   - Actions: Settings button (admin only) → link to /projects/{id}/settings
  // Uses shadcn Card component
  // Accessible: semantic heading, keyboard-navigable action buttons
  ```

### Task 4: Create Project Dialog (AC: #2)

- [x] 4.1 Create `src/features/project/components/ProjectCreateDialog.tsx` — Client Component
  ```typescript
  'use client'
  // Uses shadcn Dialog component
  // Form fields:
  //   - Name: Input (required, max 255)
  //   - Description: Textarea (optional, max 1000)
  //   - Source Language: Select dropdown with common BCP-47 codes
  //     Options: en (English), zh (Chinese), ja (Japanese), ko (Korean), th (Thai), etc.
  //   - Target Languages: Multi-select with checkboxes
  //     Show checkboxes for common languages, filter out source language
  //   - Processing Mode: Radio group — Economy (L1+L2) / Thorough (L1+L2+L3)
  //     With cost estimate text: "~$0.40 per 100K words" / "~$2.40 per 100K words"
  //
  // Form submission:
  //   - Client-side: validate via createProjectSchema.safeParse() for instant UX feedback
  //   - Call createProject server action with raw form data (action validates again server-side)
  //   - On success: toast.success('Project created'), close dialog, router.refresh()
  //   - On error: toast.error(result.error)
  //   - Use useTransition for pending state (see Client Component Forms pattern in Dev Notes)
  //
  // Accessibility:
  //   - Dialog has aria-label="Create new project"
  //   - Form fields have <Label htmlFor=...>
  //   - Required fields marked with asterisk (*)
  //   - Submit button disabled while isPending
  //   - Focus trapped inside dialog
  ```

- [x] 4.2 Add common language options constant: `src/features/project/validation/languages.ts`
  ```typescript
  // Common BCP-47 language codes for the application
  // Used in project creation form dropdowns
  export const COMMON_LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'th', label: 'Thai' },
    { code: 'ja', label: 'Japanese' },
    { code: 'ko', label: 'Korean' },
    { code: 'zh', label: 'Chinese (Simplified)' },
    { code: 'zh-Hant', label: 'Chinese (Traditional)' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'es', label: 'Spanish' },
    { code: 'pt', label: 'Portuguese' },
    { code: 'it', label: 'Italian' },
    { code: 'ar', label: 'Arabic' },
    { code: 'vi', label: 'Vietnamese' },
    { code: 'id', label: 'Indonesian' },
    { code: 'ms', label: 'Malay' },
  ] as const
  ```

### Task 5: Project Settings Page (AC: #3)

- [x] 5.1 Create `src/app/(app)/projects/[projectId]/settings/page.tsx` — Server Component
  ```typescript
  import { eq, and } from 'drizzle-orm'
  import { redirect, notFound } from 'next/navigation'
  import { db } from '@/db/client'
  import { withTenant } from '@/db/helpers/withTenant'
  import { projects } from '@/db/schema/projects'
  import { languagePairConfigs } from '@/db/schema/languagePairConfigs'
  import { getCurrentUser } from '@/lib/auth/getCurrentUser'
  import { ProjectSettings } from '@/features/project/components/ProjectSettings'

  export const dynamic = 'force-dynamic'

  // CRITICAL: Next.js 16 requires awaiting params in dynamic routes:
  //   const { projectId } = await params
  // Pattern: async function Page({ params }: { params: Promise<{ projectId: string }> })
  //
  // 1. getCurrentUser() — M3 read path (JWT claims, fast)
  //    NOT requireRole('admin', 'read') — read operations use getCurrentUser() per M3 pattern
  //    Manual role check: if (currentUser.role !== 'admin') redirect('/projects')
  // 2. Fetch project:
  //    const [project] = await db.select().from(projects)
  //      .where(and(eq(projects.id, projectId), withTenant(projects.tenantId, currentUser.tenantId)))
  //    If not found → notFound()
  // 3. Fetch language pair configs for this tenant:
  //    await db.select().from(languagePairConfigs)
  //      .where(withTenant(languagePairConfigs.tenantId, currentUser.tenantId))
  // 4. Render <ProjectSettings project={project} languagePairConfigs={configs} />
  ```

- [x] 5.2 Create `src/features/project/components/ProjectSettings.tsx` — Client Component
  ```typescript
  'use client'
  // Props: { project: Project, languagePairConfigs: LanguagePairConfig[] }
  // Layout: PageHeader with project name + "Settings"
  // Two sections (NOT tabs for MVP — simple stacked layout):
  //   1. General Settings form
  //   2. Language Pair Configuration table
  //
  // Section 1 — General Settings:
  //   - Name: Input (editable)
  //   - Description: Textarea (editable)
  //   - Processing Mode: Radio (Economy/Thorough)
  //   - Auto-Pass Threshold: Number input (0-100, default 95)
  //     Helper text: "Files scoring above this threshold auto-pass review"
  //   - Save button → calls updateProject server action
  //   - On success: toast.success('Project settings saved')
  //
  // Section 2 — Language Pair Configuration:
  //   - Table of language pair configs for the project's language pairs
  //   - Columns: Source → Target, Auto-Pass Threshold, L2 Min Confidence, L3 Min Confidence, Word Segmenter
  //   - Each row editable inline or via edit button
  //   - "Provisional" badge next to thresholds: "These thresholds are provisional — calibration in beta"
  //   - Save per row → calls updateLanguagePairConfig server action
  ```

- [x] 5.3 Create `src/features/project/components/LanguagePairConfigTable.tsx` — Client Component
  ```typescript
  'use client'
  // Props: { configs: LanguagePairConfig[], projectTargetLangs: string[], projectSourceLang: string }
  // Renders a table with editable threshold fields per language pair
  // Columns:
  //   - Language Pair: "{sourceLang} → {targetLang}" (display only)
  //   - Auto-Pass Threshold: Number input (0-100)
  //   - L2 Min Confidence: Number input (0-100)
  //   - L3 Min Confidence: Number input (0-100)
  //   - Word Segmenter: Select (intl/space)
  //     CJK/Thai pairs should show "intl" as default with warning if changed to "space"
  //   - Save button per row
  //
  // Shows provisional badge: "Provisional thresholds — calibration recommended after beta testing"
  //
  // For language pairs that don't have a config row yet:
  //   - Show defaults (auto_pass: 95, l2_confidence: 70, l3_confidence: 70, segmenter: intl)
  //     NOTE: DB default for word_segmenter is 'intl' (NOT 'space')
  //   - Save creates a new row via insert (with required NOT NULL fields — see Task 2.3)
  //
  // Accessibility:
  //   - Table with proper th/td structure
  //   - aria-label on number inputs
  //   - Keyboard navigable (Tab through inputs)
  ```

### Task 6: shadcn/ui Components Setup (AC: #1-#4)

Ensure required shadcn/ui components are installed.

- [x] 6.1 Install required shadcn/ui components (if not already present):
  ```bash
  npx shadcn@latest add dialog
  npx shadcn@latest add select
  npx shadcn@latest add table
  npx shadcn@latest add textarea
  npx shadcn@latest add badge
  npx shadcn@latest add checkbox
  npx shadcn@latest add radio-group
  npx shadcn@latest add separator
  ```
  Check existing components first at `src/components/ui/` — only install missing ones.

### Task 7: Navigation & Routing (AC: #1)

- [x] 7.1 Update sidebar navigation in `src/components/layout/app-sidebar.tsx`:
  - Ensure "Projects" nav item links to `/projects`
  - Verify active state styling for current route

- [x] 7.2 Create `src/app/(app)/projects/[projectId]/layout.tsx` — optional project-scoped layout
  ```typescript
  // Simple pass-through layout for now
  // Can be enhanced later with project-level tabs (files, review, settings)
  // For MVP: just renders children
  ```

### Task 8: Unit Tests (AC: #1-#5)

Mock setup pattern (all Server Action tests):
```typescript
// Follow existing patterns in src/features/admin/actions/*.test.ts
// Mock dependencies:
vi.mock('@/lib/auth/requireRole')
vi.mock('@/lib/auth/getCurrentUser')
vi.mock('@/db/client')
vi.mock('@/features/audit/actions/writeAuditLog')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
```

- [x] 8.1 Write validation schema tests: `src/features/project/validation/projectSchemas.test.ts`
  - createProjectSchema: valid input → passes
  - createProjectSchema: empty name → fails with "Project name is required"
  - createProjectSchema: invalid BCP-47 code → fails
  - createProjectSchema: empty targetLangs array → fails with "At least one target language"
  - updateProjectSchema: partial update (only name) → passes
  - updateProjectSchema: autoPassThreshold out of range (101) → fails
  - updateLanguagePairConfigSchema: valid config → passes
  - updateLanguagePairConfigSchema: invalid segmenter → fails

- [x] 8.2 Write Server Action tests: `src/features/project/actions/createProject.action.test.ts`
  - Admin creates project with `(input: unknown)` → success with correct data
  - QA Reviewer → FORBIDDEN (requireRole throws)
  - Invalid input (unknown type) → VALIDATION_ERROR with field details
  - Audit log written with correct entityType and action (oldValue omitted, not null)
  - tenant_id set from currentUser, not from input
  - revalidatePath('/projects') called after success

- [x] 8.3 Write Server Action tests: `src/features/project/actions/updateProject.action.test.ts`
  - Admin updates own project → success
  - Admin updates non-existent project → NOT_FOUND
  - QA Reviewer → FORBIDDEN (requireRole throws)
  - Partial update works (only name, rest unchanged)
  - Audit log captures old and new values (both as Record<string, unknown>)
  - revalidatePath called for both /projects and /projects/{id}/settings

- [x] 8.4 Write Server Action tests: `src/features/project/actions/updateLanguagePairConfig.action.test.ts`
  - Admin updates existing config → success (update path)
  - Admin creates new config for unseen language pair → success (insert path with defaults)
  - Insert provides fallback values for NOT NULL fields (autoPassThreshold: 95, l2/l3: 70)
  - QA Reviewer → FORBIDDEN (requireRole throws)
  - Invalid threshold → VALIDATION_ERROR

- [x] 8.5 Run `npm run type-check` — pass
- [x] 8.6 Run `npm run lint` — pass
- [x] 8.7 Run `npm run test:unit` — all pass (including existing 60+ tests from Story 1.2)
- [x] 8.8 Run `npm run build` — pass

## Dev Notes

### Architecture Patterns & Constraints

- **All DB schemas already exist** — Story 1.2 created all 27 tables including `projects` and `language_pair_configs`. This story does NOT create new tables. It creates Server Actions and UI to interact with them.
- **Drizzle schema is source of truth** — TypeScript schemas at `src/db/schema/` define columns. Query via Drizzle query builder only.
- **Feature-based co-location** — All project management code goes in `src/features/project/` with sub-folders: `actions/`, `components/`, `hooks/`, `stores/`, `validation/`.
- **Server Actions for mutations** — Create, update, delete operations use Server Actions returning `ActionResult<T>`.
- **RSC boundary** — Pages are Server Components that fetch data. Client Components handle interactive forms/lists.
- **No barrel exports** — Import directly from specific files, NOT `src/features/project/index.ts`.

### CRITICAL: Validation Schema Location

Two validation layers exist — do NOT confuse them:

```
src/db/validation/index.ts          ← DB-level validation (insert/select/update schemas from drizzle-zod)
                                       Already exists from Story 1.2
                                       Includes: projectInsertSchema, projectSelectSchema, projectUpdateSchema

src/features/project/validation/    ← Feature-level validation (form schemas with business rules)
                                       Created in this story
                                       Includes: createProjectSchema, updateProjectSchema, updateLanguagePairConfigSchema
```

Feature-level schemas ADD business rules (min/max length, specific field constraints) on top of the DB-level schemas. The Server Actions use FEATURE-level schemas for input validation.

### CRITICAL: drizzle-zod Import Path

```typescript
// ✅ CORRECT — use the drizzle-zod npm package (installed in Story 1.1)
import { createInsertSchema } from 'drizzle-zod'

// Story 1.2 already uses this pattern in src/db/validation/index.ts
// Do NOT change the import path
```

Per Story 1.2 Dev Notes: `drizzle-zod@0.8.3` is used (NOT `drizzle-orm/zod` which doesn't exist in Drizzle 0.45.1). The import works because `drizzle-zod` is a peer dependency.

### CRITICAL: withTenant() Signature

`withTenant()` takes TWO parameters: the **column reference** and the **tenant ID value**:

```typescript
import { withTenant } from '@/db/helpers/withTenant'

// Signature: withTenant(tenantIdColumn: PgColumn, tenantId: string) → SQL
// Returns: eq(column, tenantId)

// ✅ CORRECT — pass the COLUMN (projects.tenantId), not the TABLE
const projectList = await db
  .select()
  .from(projects)
  .where(withTenant(projects.tenantId, currentUser.tenantId))

// ❌ WRONG — passing table instead of column
.where(withTenant(projects, currentUser.tenantId))

// ✅ For compound conditions, use and()
import { and, eq } from 'drizzle-orm'
const project = await db.query.projects.findFirst({
  where: and(eq(projects.id, projectId), withTenant(projects.tenantId, currentUser.tenantId)),
})
```

### CRITICAL: Next.js 16 — await params in Dynamic Routes

Dynamic route parameters MUST be awaited in Next.js 16:

```typescript
// ✅ CORRECT — Next.js 16 async params
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  // ...
}

// ❌ WRONG — will fail in Next.js 16
export default async function SettingsPage({ params }: { params: { projectId: string } }) {
  const { projectId } = params  // TypeError: params is a Promise
}
```

### CRITICAL: Default Project Status

New projects get `status: 'draft'` automatically via DB schema default. Do NOT set it in the insert values — the DB default handles this:

```typescript
// ✅ CORRECT — omit status, DB default applies
await db.insert(projects).values({ name, sourceLang, targetLangs, processingMode, tenantId })

// ❌ UNNECESSARY — setting default explicitly
await db.insert(projects).values({ ..., status: 'draft' })
```

### CRITICAL: Proxy-Based Lazy Initialization

`db/client.ts` and `env.ts` use Proxy-based lazy initialization to avoid failing during `next build`. Pages that import `db/client` need:

```typescript
export const dynamic = 'force-dynamic'
```

Both `/projects/page.tsx` and `/projects/[projectId]/settings/page.tsx` MUST include this export.

### CRITICAL: requireRole() THROWS — Does NOT Return

`requireRole()` throws an ActionResult-compatible error object on failure.

**MANDATED PATTERN: Follow `createUser.action.ts` — NO try-catch around requireRole():**

```typescript
// requireRole throws: { success: false, code: 'UNAUTHORIZED'|'FORBIDDEN', error: string }
// Let it propagate — Next.js error boundary handles it
// This is the SAME pattern used in createUser.action.ts (the reference implementation)

export async function createProject(input: unknown): Promise<ActionResult<Project>> {
  const currentUser = await requireRole('admin', 'write')  // throws if unauthorized — NO try-catch

  const parsed = createProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  // ... DB operations, audit log, revalidatePath
  // Only VALIDATION and NOT_FOUND errors are returned as ActionResult
  // Auth errors (UNAUTHORIZED/FORBIDDEN) propagate as throws
}
```

**DO NOT** wrap `requireRole()` in try-catch. All 3 Server Actions in this story MUST use this pattern.

### CRITICAL: Server Action Signature — `(input: unknown)`

All Server Actions that accept user input MUST use `unknown` type, then validate with Zod:

```typescript
// ✅ CORRECT — follows createUser.action.ts pattern
export async function createProject(input: unknown): Promise<ActionResult<Project>> {
  const parsed = createProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }
  // use parsed.data
}

// ❌ WRONG — typed input bypasses validation
export async function createProject(input: CreateProjectInput): Promise<ActionResult<Project>> {
```

### CRITICAL: M3 RBAC Pattern for Server Actions

| Operation | Check | Trust Source |
|-----------|-------|-------------|
| View project list | `getCurrentUser()` | JWT claims (read — fast) |
| Create project | `requireRole('admin', 'write')` | DB lookup (write — secure) |
| Update project | `requireRole('admin', 'write')` | DB lookup (write — secure) |
| Update lang config | `requireRole('admin', 'write')` | DB lookup (write — secure) |
| View settings | `getCurrentUser()` + manual role check | JWT claims (read) |

### CRITICAL: Audit Trail — EVERY Mutation

Every Server Action that creates, updates, or deletes data MUST call `writeAuditLog()`:

```typescript
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'

// Required fields:
await writeAuditLog({
  tenantId: currentUser.tenantId,
  userId: currentUser.id,
  entityType: 'project',        // or 'language_pair_config'
  entityId: project.id,
  action: 'created',            // or 'updated', 'deleted'
  // oldValue is OPTIONAL (?: Record<string, unknown>)
  // For creates: OMIT the field entirely (do NOT pass null — exactOptionalPropertyTypes will fail)
  // For updates: pass oldValue: { ...existingFields }
  newValue: { name, sourceLang, targetLangs, processingMode },
})

// ⚠️ writeAuditLog is a utility function (import 'server-only'), NOT a Server Action.
// Alternatively, you can insert directly: db.insert(auditLogs).values({...})
// Both patterns exist in the codebase — prefer writeAuditLog for consistency.
```

If audit write fails → the entire action MUST fail (throw). Never silently skip audit.

### CRITICAL: ActionResult<T> Return Type

```typescript
// ✅ ALL Server Actions MUST return this exact type
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: string }

// Error codes used in this story:
// - UNAUTHORIZED: not logged in
// - FORBIDDEN: wrong role
// - VALIDATION_ERROR: input fails Zod schema
// - NOT_FOUND: project doesn't exist in tenant
// - CREATE_FAILED: DB insert error
// - UPDATE_FAILED: DB update error
```

### CRITICAL: Client Component Forms

Use `useTransition` or `useActionState` for form submission. Do NOT use raw `fetch()`:

```typescript
'use client'
import { useTransition } from 'react'
import { createProject } from '@/features/project/actions/createProject.action'
import { toast } from 'sonner'

function ProjectCreateForm() {
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await createProject({
        name: formData.get('name') as string,
        // ...
      })
      if (result.success) {
        toast.success('Project created')
      } else {
        toast.error(result.error)
      }
    })
  }
}
```

### Server Action File Pattern (follows createUser.action.ts)

```typescript
// src/features/project/actions/createProject.action.ts
'use server'

import { requireRole } from '@/lib/auth/requireRole'
import { db } from '@/db/client'
import { projects } from '@/db/schema/projects'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { createProjectSchema } from '@/features/project/validation/projectSchemas'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/types/actionResult'

// 1. 'use server' directive marks ALL exported async functions as Server Actions
// 2. Signature: (input: unknown) — always unknown for type safety
// 3. Can be called from Client Components directly
// 4. Returns Promise<ActionResult<T>> — NEVER throws to client
```

### Project Schema Reference (from Story 1.2)

```typescript
// src/db/schema/projects.ts — columns available:
{
  id: uuid PK,
  tenantId: uuid FK→tenants,
  name: varchar,
  description: text nullable,
  sourceLang: varchar,
  targetLangs: jsonb,         // array of BCP-47 strings
  processingMode: varchar,    // 'economy' | 'thorough'
  status: varchar,            // 'draft' | 'processing' | 'reviewed' | 'completed'
  autoPassThreshold: integer, // default 95
  aiBudgetMonthlyUsd: numeric nullable,
  createdAt: timestamptz,
  updatedAt: timestamptz,
}
```

### Language Pair Config Schema Reference (from Story 1.2)

```typescript
// src/db/schema/languagePairConfigs.ts — columns available:
{
  id: uuid PK,
  tenantId: uuid FK→tenants,
  sourceLang: varchar NOT NULL,
  targetLang: varchar NOT NULL,
  autoPassThreshold: integer NOT NULL,    // ⚠️ NO DB default — MUST provide on insert
  l2ConfidenceMin: integer NOT NULL,      // ⚠️ NO DB default — MUST provide on insert
  l3ConfidenceMin: integer NOT NULL,      // ⚠️ NO DB default — MUST provide on insert
  mutedCategories: jsonb,                 // nullable, array of MQM category strings
  wordSegmenter: varchar NOT NULL,        // 'intl' | 'space', default 'intl'
  createdAt: timestamptz,
  updatedAt: timestamptz,
}
// IMPORTANT: No UNIQUE constraint on (tenant_id, source_lang, target_lang)
// Cannot use onConflictDoUpdate — use manual find-then-insert/update pattern
```

### Default Language Pair Configs (PROVISIONAL — seeded in Story 1.2)

| Language Pair | Auto-Pass | L2 Min | L3 Min | Segmenter |
|:-------------|:---------:|:------:|:------:|:---------:|
| EN → TH | 93 | 70 | 80 | intl |
| EN → JA | 93 | 70 | 80 | intl |
| EN → KO | 94 | 70 | 80 | intl |
| EN → ZH-CN | 94 | 70 | 80 | intl |
| Default (no config row) | 95 | 70 | 70 | intl |

These values were seeded in Story 1.2 per-tenant during `setupNewUser.action.ts` and `supabase/migrations/00006_seed_reference_data.sql`. The `updateLanguagePairConfig` action in this story allows editing them.

### UX Design Patterns

**Project List:**
- Card-based layout (shadcn `Card`)
- Each card shows: project name, language pair (e.g., "EN → TH, JA"), creation date, file count
- Admin sees Settings button per card
- Non-admin sees view-only cards
- Inline empty state when no projects exist (centered text + icon, no separate component needed)

**Create Project Dialog:**
- Modal dialog (shadcn `Dialog`)
- Form validation on blur (not keystroke)
- Submit disabled until all required fields valid
- Success: toast + close dialog + refresh list
- Error: toast with error message

**Project Settings:**
- Simple stacked layout (NOT tabbed for MVP)
- Section 1: General settings (name, description, mode, threshold)
- Section 2: Language pair config table (editable thresholds)
- Save button per section

**Form Validation UX:**
- Inline errors below fields: `text-destructive` color, `border-destructive` border
- Required fields marked with asterisk (*)
- Button shows loading spinner during submission

### Scoping Notes — What is NOT in this Story

| Feature | Story | Rationale |
|---------|-------|-----------|
| AI Configuration tab (budget, model pinning) | Epic 3 | AI pipeline not built yet |
| Glossary management tab | Story 1.4 | Separate glossary story |
| Team management tab | Epic 6 | Team collaboration feature |
| File upload & dashboard metrics | Epic 2 | File processing not built yet |
| Project deletion | Future | Cascade implications need careful design; not in AC |
| Project archival | Future | Not in AC for Story 1.3 |

### Project Structure Notes

All new files follow the established feature-based co-location pattern:

```
src/features/project/
├── actions/
│   ├── createProject.action.ts           [NEW]
│   ├── createProject.action.test.ts      [NEW]
│   ├── updateProject.action.ts           [NEW]
│   ├── updateProject.action.test.ts      [NEW]
│   ├── updateLanguagePairConfig.action.ts [NEW]
│   └── updateLanguagePairConfig.action.test.ts [NEW]
├── components/
│   ├── ProjectList.tsx                    [NEW]
│   ├── ProjectCard.tsx                    [NEW]
│   ├── ProjectCreateDialog.tsx            [NEW]
│   ├── ProjectSettings.tsx                [NEW]
│   └── LanguagePairConfigTable.tsx        [NEW]
├── validation/
│   ├── projectSchemas.ts                  [NEW]
│   ├── projectSchemas.test.ts             [NEW]
│   └── languages.ts                       [NEW]
├── hooks/                                 (empty — no custom hooks needed for MVP)
└── stores/                                (empty — no Zustand store needed for MVP)

src/app/(app)/projects/
├── page.tsx                               [NEW] — Project list page
└── [projectId]/
    ├── layout.tsx                         [NEW] — Pass-through layout
    └── settings/
        └── page.tsx                       [NEW] — Project settings page
```

**Files MODIFIED (existing):**
- `src/components/layout/app-sidebar.tsx` — Verify Projects nav link

### Previous Story Intelligence

**From Story 1.1:**
- Vitest v4 (NOT v3) — use `vitest.config.ts` with `projects` array
- ESLint flat config at `eslint.config.mjs`
- `exactOptionalPropertyTypes: true` — be careful with optional properties (use `undefined` not `null`)
- proxy.ts (not middleware.ts) — runs on Node.js runtime
- All layout components exist: AppSidebar, AppHeader, CompactLayout, PageHeader, DetailPanel

**From Story 1.2:**
- 60 unit tests pass across 11+ files — do NOT break them
- `env.ts` uses Proxy-based lazy init — pages with DB access need `force-dynamic`
- `db/client.ts` also lazy-initialized via Proxy
- `drizzle-zod@0.8.3` is the correct package (NOT `drizzle-orm/zod`)
- `ActionResult.error` field (not `message`) per type definition
- `vi.advanceTimersByTimeAsync` (not sync) for timer-based tests
- `writeAuditLog` exists at `src/features/audit/actions/writeAuditLog.ts`
- Admin page uses `export const dynamic = 'force-dynamic'`
- Admin page query: LEFT JOIN with tenant filter — remember to add tenant filter on JOINs
- Race condition pattern: use try-catch with unique constraint handling

**From Code Review (Story 1.2):**
- Always add tenant filter on JOIN conditions (not just WHERE) — CR finding HI-2
- `requireRole` throws `{ error }` not `{ message }` — CR finding HI-3
- Rate limiting fails closed for auth endpoints (503) — CR finding ME-2

### Git Intelligence

Recent commits show:
1. `8b95444` — fix(auth): resolve 10 code review findings for Story 1.2
2. `baa00b8` — feat(schema+auth): implement Story 1.2 — database schema & authentication
3. `5a8abac` — docs(ux): resolve 3 gap specs, cross-doc consistency
4. `f63a93f` — feat(foundation): implement Story 1.1 — project initialization & design system

Pattern: Conventional Commits with scope (`feat(project): ...`). Story implementation in one commit, code review fixes in a follow-up commit.

### References

- [Source: epics/epic-1-project-foundation-configuration.md#Story 1.3] — Full acceptance criteria
- [Source: architecture/core-architectural-decisions.md#ERD 1.9] — Project + language_pair_configs schema
- [Source: architecture/implementation-patterns-consistency-rules.md] — Server Action patterns, naming conventions, RBAC
- [Source: architecture/project-structure-boundaries.md] — File locations, feature module structure
- [Source: ux-design-specification/component-strategy.md] — Project form wireframes, validation UX
- [Source: ux-design-specification/user-journey-flows.md] — Project creation flow (UJ1 Setup)
- [Source: ux-design-specification/core-user-experience.md] — Information architecture, admin vs reviewer views
- [Source: project-context.md] — 120 implementation rules, anti-patterns, testing conventions
- [Source: implementation-artifacts/1-1-project-initialization-design-system-setup.md] — Story 1.1 learnings
- [Source: implementation-artifacts/1-2-database-schema-authentication.md] — Story 1.2 learnings, schema details

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- `.next/dev/types/validator.ts` type error — stale generated types from running dev server; source code passes type-check cleanly; `npm run build` regenerates and passes

### Completion Notes List

- Task 1: Created Zod validation schemas (createProjectSchema, updateProjectSchema, updateLanguagePairConfigSchema) with BCP-47 regex, range constraints, and nullable/optional semantics
- Task 2: Implemented 3 Server Actions following createUser.action.ts reference pattern — requireRole('admin','write'), Zod validation, withTenant, writeAuditLog, revalidatePath
- Task 3: Created Projects list page (RSC) with LEFT JOIN file count + tenant filter on JOIN condition (defense-in-depth pattern from CR HI-2), ProjectList and ProjectCard client components
- Task 4: Created ProjectCreateDialog with Select (source lang), Checkbox multi-select (target langs), RadioGroup (processing mode), client-side pre-validation + server action call via useTransition
- Task 5: Created ProjectSettings page (RSC with Next.js 16 async params) + ProjectSettings form + LanguagePairConfigTable with per-row editable thresholds and CJK/Thai segmenter warning
- Task 6: Installed 7 shadcn/ui components (dialog, textarea, badge, checkbox, radio-group, separator, table), fixed auto-generated import order lint warnings
- Task 7: Verified sidebar nav "Projects" link already exists; created pass-through layout for [projectId] dynamic route
- Task 8: 40 new unit tests (19 schema + 7 createProject + 7 updateProject + 7 updateLanguagePairConfig) — total 102 tests all passing; lint 0 errors; build passes

### Change Log

- 2026-02-18: Implemented Story 1.3 — Project Management & Configuration (all 8 tasks, 40 new tests)
- 2026-02-18: Code Review fixes (8 findings resolved):
  - CR1 [CRITICAL]: Fixed test timeout in updateProject.action.test.ts (added 15s timeout for first test)
  - CR2 [HIGH]: Fixed LanguagePairConfigTable passing wrong projectId — added projectId prop, wired through from ProjectSettings
  - CR3 [HIGH]: All 3 server actions now catch requireRole() throws and return ActionResult (consistent with createUser.action.ts reference)
  - CR4 [HIGH]: Added withTenant() to UPDATE query in updateProject.action.ts (defense-in-depth)
  - CR5 [MEDIUM]: Added withTenant() to UPDATE query in updateLanguagePairConfig.action.ts (defense-in-depth)
  - CR6 [MEDIUM]: Added CompactLayout wrapper to ProjectSettings page for consistent layout
  - CR7 [MEDIUM]: Added aria-describedby linking error messages to form fields in ProjectCreateDialog
  - CR8 [LOW]: Simplified ProjectCard heading — removed nested h3 inside CardTitle

### File List

**New files:**
- src/features/project/validation/projectSchemas.ts
- src/features/project/validation/projectSchemas.test.ts
- src/features/project/validation/languages.ts
- src/features/project/actions/createProject.action.ts
- src/features/project/actions/createProject.action.test.ts
- src/features/project/actions/updateProject.action.ts
- src/features/project/actions/updateProject.action.test.ts
- src/features/project/actions/updateLanguagePairConfig.action.ts
- src/features/project/actions/updateLanguagePairConfig.action.test.ts
- src/features/project/components/ProjectList.tsx
- src/features/project/components/ProjectCard.tsx
- src/features/project/components/ProjectCreateDialog.tsx
- src/features/project/components/ProjectSettings.tsx
- src/features/project/components/LanguagePairConfigTable.tsx
- src/app/(app)/projects/page.tsx
- src/app/(app)/projects/[projectId]/layout.tsx
- src/app/(app)/projects/[projectId]/settings/page.tsx
- src/components/ui/dialog.tsx (shadcn install)
- src/components/ui/textarea.tsx (shadcn install)
- src/components/ui/badge.tsx (shadcn install)
- src/components/ui/checkbox.tsx (shadcn install)
- src/components/ui/radio-group.tsx (shadcn install)
- src/components/ui/separator.tsx (shadcn install)
- src/components/ui/table.tsx (shadcn install)

**Modified files:**
- _bmad-output/implementation-artifacts/sprint-status.yaml (status: in-progress → review)
- package.json, package-lock.json (shadcn dependencies added)
