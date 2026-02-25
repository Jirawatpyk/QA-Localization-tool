# Story 2.8: Project-level Onboarding Tour

Status: review

## Story

As a QA Reviewer,
I want a guided tour when I enter a project for the first time,
so that I know where to import glossaries and upload files for QA.

## Acceptance Criteria

### AC 1: First-Time Project Tour Activation

**Given** a QA Reviewer enters a project page (`/projects/[projectId]`)
**When** `user.metadata.project_tour_completed` is null
**Then** a 2-step Project Tour activates via `driver.js` overlay:

1. **Import Glossary** — highlights glossary tab in ProjectSubNav, explains CSV/XLSX/TBX import
2. **Upload Files** — highlights Files tab in ProjectSubNav, "Try with a file you already QA'd in Xbench — compare results side-by-side"

**And** each step highlights the relevant UI area with a spotlight overlay
**And** users can navigate: Next, Previous, Dismiss (pauses at current step), or Skip All (permanently completes)
**And** on completion or Skip All, `user.metadata.project_tour_completed` is set to current timestamp (ISO 8601)

### AC 2: Resume After Dismiss

**Given** a returning user who dismissed the Project Tour mid-way
**When** they return to any project page
**Then** the tour resumes at the step they left (`user.metadata.dismissed_at_step.project`), clamped to `LAST_STEP_INDEX`

### AC 3: Mobile Suppression

**Given** the Project Tour on mobile (<768px)
**When** the page loads
**Then** the tour is suppressed (same as Setup Tour)

## Tasks / Subtasks

- [x] Task 1: Fix `tourCompletedKey` type bug in `updateTourState.action.ts` (AC: #1)
  - [x] 1.1 Add `'project_tour_completed'` to `keyof Pick<UserMetadata, ...>` on line 29-32
  - [x] 1.2 Add unit test: `updateTourState({ action: 'complete', tourId: 'project' })` sets correct key
  - [x] 1.3 Add unit test: `updateTourState({ action: 'dismiss', tourId: 'project', dismissedAtStep: 1 })`
  - [x] 1.4 Add unit test: `updateTourState({ action: 'restart', tourId: 'project' })`
- [x] Task 2: Add `data-tour` attributes to ProjectSubNav tabs (AC: #1)
  - [x] 2.1 Add `dataTour` field (required, `string | undefined`) to each TABS entry
  - [x] 2.2 Set `dataTour: 'project-glossary'` on Glossary tab
  - [x] 2.3 Set `dataTour: 'project-files'` on Files tab
  - [x] 2.4 Set `dataTour: undefined` on all other tabs
  - [x] 2.5 Add `data-tour={tab.dataTour}` to `<Link>` element in render
- [x] Task 3: Create `ProjectTour.tsx` client component (AC: #1, #2, #3)
  - [x] 3.1 Clone `OnboardingTour.tsx` pattern with `tourId: 'project'`
  - [x] 3.2 Define 2-step `PROJECT_TOUR_STEPS` targeting ProjectSubNav tabs
  - [x] 3.3 Implement resume logic: `dismissed_at_step.project` (1-based storage → 0-based driver.js)
  - [x] 3.4 Implement mobile guard (< 768px)
  - [x] 3.5 Implement cleanup (driver.js DOM removal)
- [x] Task 4: Integrate `ProjectTour` in project layout (AC: #1)
  - [x] 4.1 Import `getCurrentUser` in project layout
  - [x] 4.2 Render `<ProjectTour>` inside layout, pass `userId` + `userMetadata`
- [x] Task 5: Update HelpMenu with "Restart Project Tour" (AC: #1)
  - [x] 5.1 Add `usePathname` import from `next/navigation`
  - [x] 5.2 Add `handleRestartProjectTour` handler calling `updateTourState({ action: 'restart', tourId: 'project' })`
  - [x] 5.3 Conditionally render "Restart Project Tour" when `pathname.startsWith('/projects/')`
  - [x] 5.4 Add test: menu item shown only on project routes
  - [x] 5.5 Add test: menu item NOT shown on `/dashboard`
  - [x] 5.6 Add test: click calls `updateTourState` with `tourId: 'project'`
- [x] Task 6: Unit tests for ProjectTour (AC: #1, #2, #3)
  - [x] 6.1 Clone `OnboardingTour.test.tsx` mock pattern (NO `vi.mock('server-only')` — client component)
  - [x] 6.2 Test: skip if `project_tour_completed` set
  - [x] 6.3 Test: skip on mobile (< 768px)
  - [x] 6.4 Test: start from step 0 for first-time user
  - [x] 6.5 Test: resume at correct step for returning user
  - [x] 6.6 Test: clamp resumeStep to LAST_STEP_INDEX
  - [x] 6.7 Test: set 2 tour steps
  - [x] 6.8 Test: dismiss fires `updateTourState` with tourId `'project'`
  - [x] 6.9 Test: complete fires on natural finish (last step)
  - [x] 6.10 Test: dismiss on last step does NOT fire complete
  - [x] 6.11 Test: no re-init after dismiss
  - [x] 6.12 Test: destroy on unmount
  - [x] 6.13 Test: no complete on cleanup unmount
- [x] Task 7: Update existing test for updateTourState action
  - [x] 7.1 Add test case for `tourId: 'project'` complete/dismiss/restart

## Dev Notes

### Bug Fix Required (Task 1) — CRITICAL

`src/features/onboarding/actions/updateTourState.action.ts` line 29-32 has a type bug:

```typescript
// CURRENT (broken for tourId 'project'):
const tourCompletedKey = `${tourId}_tour_completed` as keyof Pick<
  UserMetadata,
  'setup_tour_completed' | 'review_tour_completed'
>

// FIX: add 'project_tour_completed' to the Pick
const tourCompletedKey = `${tourId}_tour_completed` as keyof Pick<
  UserMetadata,
  'setup_tour_completed' | 'review_tour_completed' | 'project_tour_completed'
>
```

Runtime logic works fine (dynamic key construction), but TypeScript types won't allow `project_tour_completed` assignment without this fix.

### Existing Infrastructure (DO NOT recreate)

| Component | File | Status |
|-----------|------|--------|
| `TourId` type | `src/features/onboarding/types.ts:12` | `'project'` already included |
| `UserMetadata` type | `src/features/onboarding/types.ts:1-10` | `project_tour_completed` + `dismissed_at_step.project` already included |
| `tourIdSchema` | `src/features/onboarding/validation/onboardingSchemas.ts:3` | `'project'` already in enum |
| `updateTourState` action | `src/features/onboarding/actions/updateTourState.action.ts` | Works for any TourId (needs type fix only) |
| `driver.js` CSS custom | `src/styles/onboarding.css` | Already imported globally via `src/app/globals.css` |
| `data-tour="project-upload"` | `src/features/upload/components/UploadPageClient.tsx` | Exists but on child page only — NOT usable as tour target from layout |

**DO NOT import `onboarding.css` in `ProjectTour.tsx`** — it is already imported globally via `globals.css`. Only import `driver.js/dist/driver.css` at module level (same as `OnboardingTour.tsx`).

**DO NOT use `TourStep` interface** for step definitions. The `TourStep` type in `types.ts` has a flat shape (`element`, `title`, `description`) that does NOT match driver.js's nested `{ element, popover: { title, description, side } }` structure. Define steps as `as const` literal arrays matching driver.js API directly (same as `OnboardingTour.tsx` does).

### Tour Steps — Target ProjectSubNav Tabs (Always in DOM)

Both tour steps target `<Link>` elements in `ProjectSubNav` which renders in the project layout — guaranteeing the elements are ALWAYS present regardless of which child page the user is on.

**DO NOT target `data-tour="project-upload"` on `UploadPageClient.tsx`** — that element only exists on the `/upload` page. If a user enters via `/glossary` or `/settings`, the selector finds nothing and driver.js shows a degraded popover without spotlight.

```typescript
const PROJECT_TOUR_STEPS = [
  {
    element: '[data-tour="project-glossary"]',
    popover: {
      title: 'Import Glossary',
      description:
        'Import your terminology files (CSV, XLSX, or TBX) so the QA engine can check glossary compliance.',
      side: 'bottom' as const,
    },
  },
  {
    element: '[data-tour="project-files"]',
    popover: {
      title: 'Upload Files',
      description:
        "Click Files to upload your first translation file. Try one you already QA'd in Xbench — compare results side-by-side.",
      side: 'bottom' as const,
    },
  },
] as const
```

### Clone Source: OnboardingTour Pattern

| Aspect | OnboardingTour | ProjectTour |
|--------|---------------|-------------|
| File | `src/features/onboarding/components/OnboardingTour.tsx` | `src/features/onboarding/components/ProjectTour.tsx` |
| Guard key | `setup_tour_completed` | `project_tour_completed` |
| Resume key | `dismissed_at_step?.setup` | `dismissed_at_step?.project` |
| Tour ID | `'setup'` | `'project'` |
| Steps | Welcome + Create Project | Glossary tab + Files tab |
| Mount | Dashboard page | Project layout |

### Index Gotcha: 1-based Storage vs 0-based driver.js

- `dismissedAtStep` in server action input is **1-based** (validated by `z.number().int().min(1)`)
- driver.js `getActiveIndex()` returns **0-based**
- In `onCloseClick`: use `currentIndex + 1` to convert 0-based → 1-based for storage
- In resume: use `dismissed_at_step.project - 1` to convert 1-based → 0-based, then `Math.min(rawResume, LAST_STEP_INDEX)` to clamp

### ProjectSubNav Modification

`src/features/project/components/ProjectSubNav.tsx` — add `dataTour` to TABS:

```typescript
const TABS = [
  { label: 'Files', href: (id: string) => `/projects/${id}/upload`, dataTour: 'project-files' as const },
  { label: 'Batches', href: (id: string) => `/projects/${id}/batches`, dataTour: undefined },
  { label: 'History', href: (id: string) => `/projects/${id}/files`, dataTour: undefined },
  { label: 'Parity', href: (id: string) => `/projects/${id}/parity`, dataTour: undefined },
  { label: 'Settings', href: (id: string) => `/projects/${id}/settings`, dataTour: undefined },
  { label: 'Glossary', href: (id: string) => `/projects/${id}/glossary`, dataTour: 'project-glossary' as const },
] as const

// In render:
<Link ... data-tour={tab.dataTour}>
```

Use `dataTour: undefined` (required property, value undefined) — NOT `dataTour?: undefined` (optional). With `exactOptionalPropertyTypes: true`, these are NOT interchangeable.

### Project Layout Integration

`src/app/(app)/projects/[projectId]/layout.tsx` — add `getCurrentUser` and render `ProjectTour`:

```typescript
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { ProjectTour } from '@/features/onboarding/components/ProjectTour'

export default async function ProjectLayout({ children, params }) {
  const { projectId } = await params
  const currentUser = await getCurrentUser()

  return (
    <div className="flex flex-col">
      <ProjectSubNav projectId={projectId} />
      {currentUser && (
        <ProjectTour
          userId={currentUser.id}
          userMetadata={currentUser.metadata}
        />
      )}
      {children}
    </div>
  )
}
```

`getCurrentUser` uses React's `cache()` — if called elsewhere in the RSC tree, the call is deduplicated. No performance concern.

### HelpMenu Update

Add "Restart Project Tour" to `src/features/onboarding/components/HelpMenu.tsx`:

- Add `usePathname` import from `next/navigation` (NOT already imported — only `useRouter` is)
- Add `const pathname = usePathname()`
- Add conditional menu item: show "Restart Project Tour" when `pathname.startsWith('/projects/')`
- Handler: `updateTourState({ action: 'restart', tourId: 'project' })` + `router.refresh()`

### No Audit Log Required

Tour state is user preference, not business state. Per Story 1.7 precedent and the existing `updateTourState.action.ts` comment (line 63), no audit log is needed. This is an accepted exception to the "EVERY state-changing Server Action MUST write audit log" rule in project-context.md.

### Project Structure Notes

```
src/features/onboarding/
├── components/
│   ├── OnboardingTour.tsx          # Existing (Setup Tour)
│   ├── OnboardingTour.test.tsx     # Existing
│   ├── ProjectTour.tsx             # NEW
│   ├── ProjectTour.test.tsx        # NEW
│   ├── HelpMenu.tsx                # MODIFY — add project restart
│   └── HelpMenu.test.tsx           # MODIFY — add 3 tests
├── actions/
│   ├── updateTourState.action.ts   # MODIFY — fix type bug (line 29-32)
│   └── __tests__/
│       └── updateTourState.action.test.ts  # MODIFY — add 3 project tests
├── validation/
│   └── onboardingSchemas.ts        # NO CHANGE
└── types.ts                        # NO CHANGE
```

Other modules:
- `src/features/project/components/ProjectSubNav.tsx` — MODIFY (add dataTour)
- `src/app/(app)/projects/[projectId]/layout.tsx` — MODIFY (render ProjectTour)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- HelpMenu Radix UI dropdown: `fireEvent.click` insufficient — requires `fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })` + `waitFor` for async Radix portal rendering
- HelpMenu test mock: `(...args: unknown[]) => mockFn(...args)` causes TS2556 spread error — simplified to `() => mockFn()`

### Completion Notes List

- Task 1: Fixed `tourCompletedKey` type assertion — added `'project_tour_completed'` to Pick union. 3 ATDD tests activated (1 P0, 2 P1), all pass.
- Task 2: Added `dataTour` field to TABS const in ProjectSubNav — `'project-glossary'`, `'project-files'`, `undefined` for others. Rendered via `data-tour={tab.dataTour}`.
- Task 3: Created `ProjectTour.tsx` — cloned OnboardingTour pattern with `tourId: 'project'`, 2 steps targeting ProjectSubNav tabs, resume logic (1-based→0-based + clamp), mobile guard, cleanup. 13 ATDD tests activated (2 P0, 8 P1, 3 P2), all pass.
- Task 4: Integrated `ProjectTour` in project layout — `getCurrentUser()` + conditional render. Uses React `cache()` for deduplication.
- Task 5: Updated HelpMenu — added `usePathname`, `handleRestartProjectTour`, conditional "Restart Project Tour" on project routes. 3 ATDD tests activated (3 P1), all pass.
- Task 6: All 13 ProjectTour component tests pass (covered by Task 3 ATDD activation).
- Task 7: All 3 updateTourState project tests pass (covered by Task 1 ATDD activation).
- Pre-CR scan: pending (next step)
- ATDD Compliance: P0 3/3 ✅ | P1 19/19 ✅ | P2 3/6 (3 activated, 3 E2E skipped) | E2E: deferred (10 tests in project-tour.spec.ts)

### Pre-CR Scan Results

- anti-pattern-detector: ✅ (1M: inline hex color fallback — cloned from OnboardingTour, accepted pattern)
- tenant-isolation-checker: ✅ (0 findings — withTenant correct)
- code-quality-analyzer: ✅ (6M, 5L — 0C/0H; fixed Y3 duplicate handler, Y6 stale comments; remaining M items are tech debt/accepted patterns)

### Conditional Scans

- rls-policy-reviewer: SKIPPED — no schema/migration files changed
- inngest-function-validator: SKIPPED — no pipeline/inngest files changed

### File List

**New files:**
- `src/features/onboarding/components/ProjectTour.tsx`
- `src/features/onboarding/components/ProjectTour.test.tsx` (ATDD-generated, activated)
- `e2e/project-tour.spec.ts` (ATDD-generated, E2E — all skip, deferred)

**Modified files:**
- `src/features/onboarding/actions/updateTourState.action.ts` (type fix line 29-32)
- `src/features/onboarding/actions/__tests__/updateTourState.action.test.ts` (+3 tests activated)
- `src/features/onboarding/components/HelpMenu.tsx` (+usePathname, +project tour restart)
- `src/features/onboarding/components/HelpMenu.test.tsx` (+3 tests activated, mock fix)
- `src/features/project/components/ProjectSubNav.tsx` (+dataTour to TABS)
- `src/app/(app)/projects/[projectId]/layout.tsx` (+getCurrentUser, +ProjectTour render)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status → in-progress → review)
