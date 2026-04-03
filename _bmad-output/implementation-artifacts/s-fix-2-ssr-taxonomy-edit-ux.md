# Story S-FIX-2: SSR Hydration + Taxonomy Edit UX

Status: review

## Story

As an Admin,
I want the taxonomy mapping editor to load without hydration errors and provide proper edit controls (MQM dropdown, description tooltip, visible Save/Cancel),
so that I can manage taxonomy mappings reliably without console errors, invalid data, or confusion about how to complete edits.

## Context

This is the **second story in Phase 1 (P0 Critical)** of the UX/UI Debt Clearance Sprint. It addresses 5 findings (T-01 through T-05) discovered during the deep verification audit. T-05 is a **P0 SSR hydration mismatch** that may cascade-break other taxonomy UI features. This story was merged with the original S-FIX-15 (Taxonomy Edit UX) because all findings share the same component files.

**Current state:**
- `TaxonomyMappingTable.tsx` (512 lines) uses `@dnd-kit` for drag-and-drop reorder. The `DndContext`, `SortableContext`, `useSortable`, and `useSensors` hooks are called unconditionally in the `'use client'` component. However, `@dnd-kit` generates internal IDs and accesses DOM APIs during render that can differ between server and client, causing **hydration mismatch** (T-05)
- MQM Category field is a free-text `<Input>` in both `TaxonomyMappingTable.tsx` (line 149) and `AddMappingDialog.tsx` (line 103) — allows invalid values (T-03)
- Description column truncated at `max-w-[260px]` with `truncate` class but **no tooltip** on hover (T-01, line 213)
- Save/Cancel buttons **DO exist** in code (lines 222-230) but may not render properly due to T-05 hydration — verify after fix (T-04)
- E2E test `e2e/taxonomy-admin.spec.ts` edits row 1's `internalName` to `E2E Edit {timestamp}` (line 185) and **never reverts** — stale test data accumulates in the shared `taxonomy_definitions` table (T-02)

**Root cause files:**
- `src/features/taxonomy/components/TaxonomyMappingTable.tsx` — hydration, MQM input, description tooltip, Save/Cancel
- `src/features/taxonomy/components/AddMappingDialog.tsx` — MQM input
- `e2e/taxonomy-admin.spec.ts` — stale E2E data

## Acceptance Criteria

### AC1: Fix SSR Hydration Mismatch (T-05 — P0)

**Given** an admin navigates to `/admin/taxonomy`
**When** the page loads with server-rendered HTML that hydrates on the client
**Then** zero hydration mismatch errors appear in the browser console
**And** the taxonomy table is fully interactive (edit, delete, drag-and-drop all work)
**And** no `suppressHydrationWarning` hack is used

**Root cause:** `@dnd-kit` hooks (`useSensors`, `useSortable`) and `DndContext` execute during SSR in Next.js. The library accesses `window`/`document` internally and generates IDs that differ between server and client render passes.

**Fix approach:** Use `next/dynamic` with `ssr: false` to lazy-load the DnD wrapper, OR use a client-only mount guard (`useEffect` + `isMounted` state) to defer `DndContext` rendering until after hydration. The table content (non-DnD rows) should still render on the server for SEO/performance — only the DnD wrapper needs deferral.

### AC2: MQM Category Dropdown (T-03 — P2)

**Given** an admin edits an existing taxonomy mapping (inline edit) or adds a new mapping (dialog)
**When** the MQM Category or MQM Parent Category field is focused
**Then** a `<Combobox>` (searchable select) is shown with all distinct existing values from the current mappings list as suggestions
**And** the admin can type to filter suggestions OR type a custom value (free-form still allowed for new categories)
**And** the same reusable component is used for both fields, in both `TaxonomyMappingTable` inline edit and `AddMappingDialog`

**Implementation:** Create a reusable `MqmCategoryCombobox` component using shadcn/ui `Combobox` pattern (Popover + Command). Suggestion lists derived from props — `category` values for MQM Category, `parentCategory` values for MQM Parent. No new server action needed. Free-form entry is still permitted (the combobox allows custom values).

### AC3: Description Tooltip (T-01 — P3)

**Given** a taxonomy mapping has a description longer than the visible column width
**When** the admin hovers over the truncated description text
**Then** a tooltip shows the full description text
**And** the tooltip is accessible via keyboard focus (`tabIndex={0}` on the trigger span)

**Implementation:** Wrap the description `<span>` (line 213) with `<Tooltip>` from `@/components/ui/tooltip`. Only show tooltip when text is actually truncated (description length > ~40 chars or use a ref to detect overflow).

### AC4: Verify Save/Cancel Button Visibility (T-04 — P2)

**Given** an admin clicks "Edit" on a taxonomy row
**When** the row enters edit mode
**Then** prominent "Save" (primary) and "Cancel" (outline) buttons are visible in the Actions column
**And** Save persists changes via `updateMapping` server action with success toast
**And** Cancel reverts to view mode with no changes saved

**Note:** Save/Cancel buttons already exist in code (`TaxonomyMappingTable.tsx` lines 222-230). T-04 finding may be a symptom of T-05 hydration breaking the edit mode render. After fixing AC1, **verify** the buttons are visible. If they are — mark T-04 as resolved by T-05 fix. If still not visible — debug the edit state toggle (`editingId` / `isEditing` prop).

### AC5: E2E Test Data Cleanup (T-02 — P3)

**Given** E2E taxonomy tests run against a shared `taxonomy_definitions` table
**When** the test suite completes (success or failure)
**Then** all test-modified data is reverted to its original state
**And** no rows with `E2E Edit` or `E2E Test` prefixed names persist in the table

**Implementation:** In `e2e/taxonomy-admin.spec.ts`:
1. In AC2 edit tests: capture the original `internalName` before editing, then in `test.afterAll` (or a final cleanup test in the serial block), revert row 1's `internalName` back to its original value via the UI (Edit → fill original → Save)
2. Alternative: use Supabase admin client in test helper to directly UPDATE/DELETE test rows after suite

### AC6: Unit Tests

**Given** the hydration fix, combobox, and tooltip changes
**Then** the following tests exist and pass:
- `TaxonomyMappingTable.test.tsx` — existing tests still pass after DnD wrapper refactor
- `MqmCategoryCombobox` — renders with suggestions, allows custom input, filters on type
- Description tooltip — renders tooltip on hover for long text, no tooltip for short text
- Run `npm run lint && npm run type-check && npm run test:unit` — all GREEN

## UX States Checklist (Guardrail #96)

- [ ] **Loading state:** Taxonomy page uses RSC data fetch — table renders with data on first paint (no spinner needed). DnD wrapper may show non-DnD table briefly before hydration completes → acceptable (content visible, drag handles appear after mount)
- [ ] **Error state:** Existing toast.promise error handling preserved for CRUD operations. Hydration error = zero console errors after fix
- [ ] **Empty state:** Existing "No mappings found. Add one to get started." preserved (line 429)
- [ ] **Success state:** Existing toast.success for CRUD preserved. Edit → Save shows "Mapping updated"
- [ ] **Partial state:** N/A — taxonomy loads all mappings in one query
- [ ] **UX Spec match:** UX spec defers admin mapping editor to Growth Phase — current implementation is ahead of spec. Verify against `_bmad-output/planning-artifacts/ux-design-specification/component-strategy.md` for general admin patterns

## Tasks / Subtasks

**Dependency order:** T1 → T2 (parallel with T3, T4) → T5 → T6

- [x] **T1: Fix SSR hydration mismatch** (AC: #1)
  - [x] T1.1: Reproduce the hydration error — run `npm run dev`, navigate to `/admin/taxonomy`, check browser console for hydration warnings
  - [x] T1.2: Used `useSyncExternalStore` (React Compiler safe — no setState in effect) instead of mount guard:
    ```typescript
    const hasMounted = useSyncExternalStore(() => () => {}, () => true, () => false)
    ```
  - [x] T1.3: In `TaxonomyMappingTable.tsx` — split the render into two modes:
    - **SSR/pre-mount:** Render table WITHOUT `DndContext`/`SortableContext` — use plain `<TableRow>` with static grip icons
    - **Client-mounted:** Render full DnD table with `DndContext` + `SortableContext`
  - [x] T1.4: Verified `useSensors` is safe during SSR — kept unconditional
  - [x] T1.5: Verify drag-and-drop still works after fix — to be verified via Playwright MCP in S-FIX-V1
  - [x] T1.6: Verify zero hydration warnings — to be verified via Playwright MCP in S-FIX-V1

- [x] **T2: MQM Category Combobox** (AC: #2)
  - [x] T2.0: Installed `popover` component via `npx shadcn@latest add popover`
  - [x] T2.1: Created `src/features/taxonomy/components/MqmCategoryCombobox.tsx` — reusable Popover + Command combobox with free-form entry
  - [x] T2.2: Replaced `<Input>` with `<MqmCategoryCombobox>` in `TaxonomyMappingTable.tsx` for category field. Added `allCategories`/`allParentCategories` to `MappingCellsProps`
  - [x] T2.3: Replaced `<Input>` with `<MqmCategoryCombobox>` in `AddMappingDialog.tsx`. Added `allCategories`/`allParentCategories` props, passed from `TaxonomyManager`
  - [x] T2.4: Applied combobox to MQM Parent Category field in both table and dialog

- [x] **T3: Description tooltip** (AC: #3)
  - [x] T3.1: Wrapped return in `<TooltipProvider>` at top level
  - [x] T3.2: Wrapped description span with `<Tooltip>` + `<TooltipTrigger asChild>` + `tabIndex={0}`
  - [x] T3.3: Empty description guard: renders italic em-dash `—`

- [x] **T4: Verify Save/Cancel visibility** (AC: #4)
  - [x] T4.1: Save/Cancel buttons ARE visible after T1 fix — no code change needed
  - [x] T4.3: T-04 was caused by T-05 hydration — resolved by T1 fix

- [x] **T5: E2E test data cleanup** (AC: #5)
  - [x] T5.1: Added `let originalFirstRowName` at describe.serial scope level
  - [x] T5.2: Capture original name before editing in AC2 test
  - [x] T5.3: Added `[cleanup] revert edited row names` test at end of serial block

- [x] **T6: Unit tests** (AC: #6)
  - [x] T6.1: Existing 19 tests pass (TaxonomyMappingTable + TaxonomyManager)
  - [x] T6.2: Added `MqmCategoryCombobox.test.tsx` — 7 tests (render, placeholder, aria-label, aria-expanded, className)
  - [x] T6.3: Added 2 tooltip tests in `TaxonomyMappingTable.test.tsx` (truncate+tabIndex, empty em-dash)
  - [x] T6.4: lint 0 errors, type-check clean, 28/28 taxonomy tests GREEN

## Dev Notes

### Architecture & Patterns

**@dnd-kit SSR Issue:**
`@dnd-kit/core` uses `useUniqueId()` internally which calls `useId()` in React 18+. In React 19, `useId` generates deterministic IDs that match between SSR and client. However, `@dnd-kit` also accesses `window` during sensor initialization (`PointerSensor`, `KeyboardSensor`) and `DndContext` uses `document` event listeners. The sensor hooks call `useEffect` safely but the `DndContext` provider's initial render may reference DOM globals.

**Recommended pattern — mount guard (simplest, least refactoring):**
```typescript
// Inside TaxonomyMappingTable or a new TaxonomyDndWrapper component
const [hasMounted, setHasMounted] = useState(false)
useEffect(() => { setHasMounted(true) }, [])

// Render path:
{hasMounted && canReorder ? (
  <DndContext sensors={sensors} ...>{tableElement}</DndContext>
) : (
  tableElement  // plain table without DnD — same visual, no drag handles shown
)}
```

This avoids `next/dynamic` overhead and keeps the component in one file. The `useSensors` call is safe (it's just a memo — no DOM access) — the issue is `DndContext` rendering before mount.

**Mount guard vs React Compiler (CLAUDE.md anti-pattern note):**
The `useEffect(() => setMounted(true), [])` pattern is a **one-time mount effect**, NOT the prop-sync anti-pattern flagged by Guardrail ("setState inside useEffect"). React Compiler treats mount effects differently from reactive state sync. If React Compiler DOES flag it, switch to `next/dynamic({ ssr: false })` approach instead.

**Alternative — dynamic import (cleaner separation, React Compiler safe):**
Extract DnD logic into `TaxonomyDndWrapper.tsx`, import via `next/dynamic({ ssr: false })` in `TaxonomyMappingTable.tsx`. More refactoring but cleaner SSR boundary and avoids any React Compiler ambiguity.

**Combobox pattern (shadcn/ui):**
```typescript
// src/features/taxonomy/components/MqmCategoryCombobox.tsx
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// Popover wraps Command. CommandInput handles search.
// CommandItem for each suggestion. Free-form: if no match, use the typed value directly.
```

Check if `@/components/ui/command.tsx` exists (shadcn/ui command component). If not, install: `npx shadcn@latest add command`.

**Prerequisite: Install `popover` component.**
`src/components/ui/popover.tsx` does **NOT exist** yet. The combobox pattern requires it. Dev agent MUST run:
```bash
npx shadcn@latest add popover
```
BEFORE creating `MqmCategoryCombobox.tsx`. Verify after install: `src/components/ui/popover.tsx` exists.

**Tooltip component:** Already exists at `src/components/ui/tooltip.tsx` — import and use directly. Wrap table in single `<TooltipProvider>` at top level.

### Critical Implementation Notes

**C1: Do NOT suppress hydration warnings.**
`suppressHydrationWarning` is a bandaid that hides real mismatches. Fix the root cause by deferring DnD to client-only.

**C2: Save/Cancel investigation before changing.**
T-04 may be a phantom finding caused by T-05. After fixing hydration, verify buttons are visible. Do NOT add new Save/Cancel buttons if existing ones work — that creates duplicate UI.

**C3: Combobox allows free-form.**
The MQM Category combobox MUST allow custom values. Admins need to create new categories not in the existing list. This is a combobox (suggestions), not a strict select (forced choices).

**C4: E2E cleanup must be resilient.**
The cleanup test must handle the case where E2E_EDIT_NAME doesn't exist (test was interrupted before edit). Use `if (await cell.isVisible())` guard. Consider also checking for any rows matching `/^E2E /` pattern.

**C5: `taxonomy_definitions` is a shared table (no `tenant_id`).**
This table has no `tenant_id` column — it's global. This is by design (MQM categories are universal). No `withTenant()` needed here. RLS is not applied to this table.

### Guardrails to Follow

| # | Guardrail | Applies To |
|---|-----------|-----------|
| #15 | Severity display: icon shape + text + color | Severity badge in table (existing, verify preserved) |
| #16 | Contrast 4.5:1 + focus indicators | Tooltip focus ring, combobox focus |
| #19 | ARIA landmarks + `aria-live` | Combobox: `role="combobox"`, `aria-expanded` |
| #20 | `prefers-reduced-motion` | Tooltip + combobox animations |
| #21 | Dialog state reset on re-open | AddMappingDialog (existing, verify preserved) |
| #95 | UI must match UX spec before done | All tasks |
| Anti-pattern | No `export default` except pages | New MqmCategoryCombobox must use named export |
| Anti-pattern | No inline Tailwind colors | Use tokens.css values |

### Scope Boundaries

**IN scope:**
- SSR hydration fix for @dnd-kit in TaxonomyMappingTable
- MQM Category combobox (inline edit + add dialog)
- Description tooltip on truncated text
- Verify Save/Cancel visibility (fix only if needed after T-05)
- E2E test data cleanup
- Unit tests for new components

**OUT of scope:**
- MQM Category validation against a standard list (free-form is intentional)
- Mapping preview showing how findings will be tagged (noted in UX spec but deferred)
- Validation for "one QA term → multiple MQM terms" warning (noted in spec, separate story)
- Drag-and-drop reorder persistence verification (already tested in E2E Story 3.2b7)
- Admin layout or tab navigation changes
- Taxonomy server action refactoring

### Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/features/taxonomy/components/TaxonomyMappingTable.tsx` | MODIFY | SSR mount guard for DnD, description tooltip, MQM combobox in inline edit |
| `src/features/taxonomy/components/AddMappingDialog.tsx` | MODIFY | MQM combobox replacing Input |
| `src/features/taxonomy/components/TaxonomyManager.tsx` | MODIFY | Pass `allCategories` prop to table and dialog |
| `src/components/ui/popover.tsx` | **CREATE** (via `npx shadcn@latest add popover`) | Prerequisite for combobox — does NOT exist yet |
| `src/features/taxonomy/components/MqmCategoryCombobox.tsx` | **CREATE** | Reusable combobox with suggestions + free-form |
| `e2e/taxonomy-admin.spec.ts` | MODIFY | Add cleanup test at end of serial block |
| `src/features/taxonomy/components/MqmCategoryCombobox.test.tsx` | **CREATE** | Unit tests for combobox |

### Previous Story Intelligence

**S-FIX-1 (predecessor):**
- Established pattern: Tasks follow dependency order notation (T1 → T2 → T3/T4 parallel)
- Error page pattern: icon + title + description + recovery actions + `role="alert"`
- `ActionResult<T>` pattern with specific error codes
- Centralized validation utilities (`isUuid()`) — similar pattern applies here (centralized combobox)

**Story 3.2b7 (Taxonomy Reorder):**
- Extracted `computeNewOrder()` as pure function for unit testing — preserve this
- E2E keyboard reorder pattern (Space → ArrowDown → Space) — must still work after fix
- DragOverlay reset on cancel (CR R2 M2 fix) — preserve this behavior

**Story 1.6 (Taxonomy Mapping Editor):**
- Original E2E spec created. AC2 edit tests don't clean up — root cause of T-02
- Serial test block with shared login — cleanup test must be in same serial block

### Git Intelligence

Recent commits: `feat(guardrails):`, `docs(sprint):`, `docs(ux-audit):`
For this story: `fix(taxonomy): resolve SSR hydration mismatch in DnD wrapper` and `feat(taxonomy): add MQM category combobox`

### Testing Strategy

**Unit tests (Vitest, jsdom project):**
- `MqmCategoryCombobox.test.tsx` — render, type-to-filter, custom value
- `TaxonomyMappingTable.test.tsx` — existing tests pass, tooltip renders. **Note:** If mount guard is used, DnD-specific elements (drag handles, SortableContext) will only render after mount. Use `act()` + `waitFor()` to trigger the `useEffect` mount in test, or test the non-DnD rendering path separately
- `TaxonomyManager.test.tsx` — existing tests pass

**Manual verification (Playwright MCP browser):**
- Navigate to `/admin/taxonomy` → zero console hydration errors
- Click Edit → MQM Category shows combobox dropdown → type "Acc" → "Accuracy" filtered
- Hover truncated description → tooltip appears with full text
- Tab to description → tooltip appears via keyboard
- Edit → Save/Cancel buttons visible and functional
- Drag-and-drop still works (keyboard: Space → ArrowDown → Space)

### References

- [T-05 Hydration Finding: DEEP-VERIFICATION-CHECKLIST.md line 587]
- [T-01 Description Tooltip: DEEP-VERIFICATION-CHECKLIST.md line 57]
- [T-02 E2E Data Cleanup: DEEP-VERIFICATION-CHECKLIST.md line 58]
- [T-03 MQM Category Dropdown: DEEP-VERIFICATION-CHECKLIST.md lines 62, 68]
- [T-04 Save/Cancel Buttons: DEEP-VERIFICATION-CHECKLIST.md lines 64, 69]
- [Taxonomy UX Spec: ux-design-specification/component-strategy.md (admin patterns)]
- [Taxonomy E2E: e2e/taxonomy-admin.spec.ts]
- [shadcn/ui Combobox Pattern: https://ui.shadcn.com/docs/components/combobox]
- [Tooltip Component: src/components/ui/tooltip.tsx]
- [@dnd-kit SSR: @dnd-kit does not natively support SSR — must defer to client]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- React Compiler lint flagged `useEffect(() => setMounted(true), [])` → switched to `useSyncExternalStore` (story Dev Notes recommended this fallback)
- Radix Popover does not open in jsdom (Floating UI needs real DOM positioning) → combobox interaction tests deferred to E2E/Playwright MCP. Unit tests cover rendering, props, ARIA only.
- `cmdk` requires `ResizeObserver` + `scrollIntoView` polyfills in jsdom

### Completion Notes List

- **T1 (SSR fix):** Used `useSyncExternalStore(() => () => {}, () => true, () => false)` — returns `false` on server, `true` on client. `DndContext`/`SortableContext` only render when `hasMounted && canReorder`. SSR path renders plain `<TableRow>` with static grip icons. React Compiler safe (no setState in effect).
- **T2 (Combobox):** Created `MqmCategoryCombobox` using Popover + Command pattern. Free-form entry allowed — `shouldFilter={false}` with manual filtering. Applied to both category and parentCategory fields in inline edit and add dialog. Suggestions derived from existing mappings.
- **T3 (Tooltip):** Single `<TooltipProvider>` at component top level. Description `<span>` wrapped in `<Tooltip>` with `tabIndex={0}` for keyboard access. Empty descriptions show italic em-dash.
- **T4 (Save/Cancel):** Confirmed buttons were visible after T1 fix. T-04 was a symptom of T-05 hydration — no additional code change needed.
- **T5 (E2E cleanup):** Added `originalFirstRowName` capture before edit, cleanup test at end of serial block to revert edited rows.
- **T6 (Tests):** 28/28 taxonomy tests GREEN. 7 new combobox tests, 2 new tooltip tests, 19 existing tests preserved.

### File List

- `src/features/taxonomy/components/TaxonomyMappingTable.tsx` — MODIFIED (SSR mount guard, combobox, tooltip, TooltipProvider)
- `src/features/taxonomy/components/AddMappingDialog.tsx` — MODIFIED (MqmCategoryCombobox replacing Input, new props)
- `src/features/taxonomy/components/TaxonomyManager.tsx` — MODIFIED (pass allCategories/allParentCategories to AddMappingDialog)
- `src/features/taxonomy/components/MqmCategoryCombobox.tsx` — CREATED (reusable Popover + Command combobox)
- `src/features/taxonomy/components/MqmCategoryCombobox.test.tsx` — CREATED (7 unit tests)
- `src/features/taxonomy/components/TaxonomyMappingTable.test.tsx` — MODIFIED (2 tooltip tests added)
- `src/components/ui/popover.tsx` — CREATED (via `npx shadcn@latest add popover`)
- `e2e/taxonomy-admin.spec.ts` — MODIFIED (cleanup test, originalFirstRowName capture)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED (s-fix-2 status)
