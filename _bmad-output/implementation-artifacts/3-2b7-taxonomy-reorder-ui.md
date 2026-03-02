# Story 3.2b7: Taxonomy Mapping Reorder UI

Status: ready-for-dev

## Story

As an Admin,
I want to drag-and-drop taxonomy mappings to reorder their display priority,
so that the most important QA categories appear first in review panels and reports.

## Background

Story 1.6 created `reorderMappings.action.ts` with full backend logic (validate, batch UPDATE `display_order`, audit log, cache revalidation). DB schema has `display_order` column. However, `TaxonomyMappingTable` has no reorder UI — only Edit/Delete per row.

Orphan scan (Party Mode 2026-03-02) identified this as an action with zero consumers.

## Acceptance Criteria

### AC1: Drag-and-Drop Reorder in TaxonomyMappingTable

**Given** an Admin views the taxonomy mapping table at `/admin/taxonomy`
**When** they drag a row to a new position
**Then** the row visually moves to the new position during drag (drag preview)
**And** on drop, `reorderMappings` action is called with the new order `[{ id, displayOrder }]`
**And** on success: table reflects new order, toast shows "Mappings reordered"
**And** on error: table reverts to previous order, toast.error shows error message
**And** the drag handle is a grip icon on the left side of each row

### AC2: Keyboard Accessible Reorder

**Given** an Admin focuses a row's drag handle
**When** they press Space to pick up, Arrow Up/Down to move, Space to drop
**Then** the row moves accordingly (accessible alternative to mouse drag)
**And** Escape cancels the drag operation

### AC3: Non-Admin Cannot Reorder

**Given** a QA Reviewer views the taxonomy mapping table
**When** they see the table
**Then** no drag handles are visible
**And** rows cannot be dragged

### AC4: Unit Tests

- Drag handle renders for Admin role
- Drag handle hidden for non-Admin role
- `reorderMappings` called with correct `[{ id, displayOrder }]` after drop
- Revert on action failure
- Keyboard reorder: Space to pick, Arrow to move, Space to drop

## Tasks / Subtasks

- [ ] **Task 1: Add drag-and-drop library** (AC: #1, #2)
  - [ ] 1.1 Install `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
  - [ ] 1.2 Verify bundle size impact and browser compat

- [ ] **Task 2: Add drag-and-drop to TaxonomyMappingTable** (AC: #1, #2, #3)
  - [ ] 2.1 Wrap table in `DndContext` + `SortableContext`
  - [ ] 2.2 Make each `TableRow` a `useSortable` item
  - [ ] 2.3 Add grip icon drag handle (left column)
  - [ ] 2.4 Implement `onDragEnd` → compute new order → call `reorderMappings`
  - [ ] 2.5 Optimistic update (move row immediately) + revert on error
  - [ ] 2.6 Gate drag handles behind `canReorder` prop (Admin only)
  - [ ] 2.7 Keyboard support (Space/Arrow/Escape) via @dnd-kit built-in

- [ ] **Task 3: Wire props from parent** (AC: #3)
  - [ ] 3.1 `TaxonomyManager` passes `canReorder` prop to table
  - [ ] 3.2 Derive `canReorder` from user role (Admin = true, others = false)

- [ ] **Task 4: Unit tests** (AC: #4)
  - [ ] 4.1 Drag handle visibility tests (Admin vs non-Admin)
  - [ ] 4.2 `reorderMappings` call verification after drop
  - [ ] 4.3 Optimistic revert on error
  - [ ] 4.4 Keyboard accessibility tests

- [ ] **Task 5: Full E2E — Taxonomy flow** (MANDATORY — critical flow per CLAUDE.md)
  - [ ] 5.1 Create `e2e/taxonomy-management.spec.ts`
  - [ ] 5.2 Test: navigate to /admin/taxonomy → see mapping table → add mapping → verify in table
  - [ ] 5.3 Test: edit mapping → change severity → save → verify updated
  - [ ] 5.4 Test: reorder mappings via drag-and-drop → verify new order persists after reload
  - [ ] 5.5 Test: delete mapping → confirm dialog → verify removed
  - [ ] 5.6 Test: non-Admin → no drag handles, no add button
  - [ ] 5.7 Verify `npm run test:e2e` passes

## Dev Notes

### What Already Exists

| Component | Path | Change |
|-----------|------|--------|
| `TaxonomyMappingTable` | `src/features/taxonomy/components/TaxonomyMappingTable.tsx` | Modify — add DnD |
| `TaxonomyManager` | `src/features/taxonomy/components/TaxonomyManager.tsx` | Modify — pass `canReorder` |
| `reorderMappings` | `src/features/taxonomy/actions/reorderMappings.action.ts` | Read-only (action ready) |
| `reorderMappingsSchema` | `src/features/taxonomy/validation/taxonomySchemas.ts` | Read-only (Zod schema ready) |

### @dnd-kit Pattern

```typescript
import { DndContext, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// Each row:
function SortableRow({ mapping, ... }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: mapping.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return <TableRow ref={setNodeRef} style={style} {...attributes}>
    <TableCell><GripVertical {...listeners} /></TableCell>
    ...
  </TableRow>
}
```

### Scope Boundaries

| In Scope | Out of Scope |
|----------|-------------|
| Drag-and-drop reorder rows | Drag between tables/sections |
| @dnd-kit integration | Custom drag library |
| Keyboard accessible | Touch gesture (mobile) — @dnd-kit handles natively |
| Admin-only gate | RBAC changes |

### Guardrails

| # | Guardrail | Notes |
|---|-----------|-------|
| 3 | No bare `string` for role | Use role check from `requireRole` or prop |
| 11 | Dialog state reset | N/A — no dialog |

## Dependencies

- **Depends on:** Story 1.6 (taxonomy table + reorder action) — done
- **Blocks:** Nothing critical
- **New dependency:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

## References

- `src/features/taxonomy/components/TaxonomyMappingTable.tsx`
- `src/features/taxonomy/actions/reorderMappings.action.ts`
- `src/features/taxonomy/validation/taxonomySchemas.ts` (reorderMappingsSchema)
- @dnd-kit docs: https://dndkit.com
