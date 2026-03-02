/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaxonomyMapping } from '@/features/taxonomy/types'

describe('TaxonomyMappingTable — Severity Badge Colors', () => {
  const mockOnUpdate = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnAdd = vi.fn()

  const MOCK_MAPPINGS: TaxonomyMapping[] = [
    {
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c81',
      internalName: 'terminology',
      category: 'accuracy',
      parentCategory: null,
      severity: 'critical',
      description: 'Critical terminology error',
      isCustom: false,
      isActive: true,
      displayOrder: 0,
      createdAt: new Date('2026-03-01T00:00:00Z'),
      updatedAt: new Date('2026-03-01T00:00:00Z'),
    },
    {
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c82',
      internalName: 'mistranslation',
      category: 'accuracy',
      parentCategory: null,
      severity: 'major',
      description: 'Major mistranslation',
      isCustom: false,
      isActive: true,
      displayOrder: 1,
      createdAt: new Date('2026-03-01T00:00:00Z'),
      updatedAt: new Date('2026-03-01T00:00:00Z'),
    },
    {
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c83',
      internalName: 'style',
      category: 'fluency',
      parentCategory: null,
      severity: 'minor',
      description: 'Minor style issue',
      isCustom: false,
      isActive: true,
      displayOrder: 2,
      createdAt: new Date('2026-03-01T00:00:00Z'),
      updatedAt: new Date('2026-03-01T00:00:00Z'),
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 6.1 [P1] Major severity badge should use design token bg-severity-major (orange)
  it('[P1] should render major severity badge with bg-severity-major class (orange)', async () => {
    // WHAT: The "major" severity badge should use the design token class `bg-severity-major`
    //   (maps to --color-severity-major: #f59e0b in tokens.css) with white text for contrast.
    //   This ensures visual consistency with the design system's severity color scale.
    // WHY WILL FAIL: Current implementation uses Badge variant="default" for major severity,
    //   which renders as indigo (the shadcn/ui default variant color) instead of orange.
    //   The SEVERITY_BADGE map at line 51 needs to be replaced with className-based styling
    //   using the design token classes from tokens.css.

    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
      />,
    )

    // Find the badge displaying "major" text
    const majorBadge = screen.getByText('major')
    expect(majorBadge.className).toMatch(/bg-severity-major/)
    expect(majorBadge.className).toMatch(/text-white/)
    // Should NOT use the default variant (indigo) from shadcn Badge
    expect(majorBadge.className).not.toMatch(/bg-primary/)
  })

  // 6.2 [P1] Minor severity badge should use design token bg-severity-minor (blue)
  it('[P1] should render minor severity badge with bg-severity-minor class (blue)', async () => {
    // WHAT: The "minor" severity badge should use the design token class `bg-severity-minor`
    //   (maps to --color-severity-minor: #3b82f6 in tokens.css) with white text for contrast.
    // WHY WILL FAIL: Current implementation uses Badge variant="secondary" for minor severity,
    //   which renders as gray (the shadcn/ui secondary variant color) instead of blue.
    //   The SEVERITY_BADGE map maps minor → 'secondary' variant, which is incorrect per design.

    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
      />,
    )

    // Find the badge displaying "minor" text
    const minorBadge = screen.getByText('minor')
    expect(minorBadge.className).toMatch(/bg-severity-minor/)
    expect(minorBadge.className).toMatch(/text-white/)
    // Should NOT use the secondary variant (gray) from shadcn Badge
    expect(minorBadge.className).not.toMatch(/bg-secondary/)
  })

  // 6.3 [P1] Critical severity badge should use design token bg-severity-critical (red)
  it('[P1] should render critical severity badge with bg-severity-critical class (red)', async () => {
    // WHAT: The "critical" severity badge should use the design token class `bg-severity-critical`
    //   (maps to --color-severity-critical: #dc2626 in tokens.css) with white text for contrast.
    //   This aligns all three severity levels with the design system's token-based classes.
    // WHY WILL FAIL: Current implementation uses Badge variant="destructive" for critical severity.
    //   While "destructive" is also red, the test asserts for the token-based class `bg-severity-critical`
    //   to enforce consistency across all severity badges using the same design token pattern.
    //   The current `variant="destructive"` uses `bg-destructive`, not `bg-severity-critical`.

    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
      />,
    )

    // Find the badge displaying "critical" text
    const criticalBadge = screen.getByText('critical')
    expect(criticalBadge.className).toMatch(/bg-severity-critical/)
    expect(criticalBadge.className).toMatch(/text-white/)
  })
})

// ---------------------------------------------------------------------------
// Story 3.2b7 — Drag-and-Drop Reorder (ATDD RED stubs)
// ---------------------------------------------------------------------------
describe('TaxonomyMappingTable — Drag-and-Drop Reorder', () => {
  const mockOnUpdate = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnAdd = vi.fn()
  const mockOnReorder = vi.fn()

  const MOCK_MAPPINGS: TaxonomyMapping[] = [
    {
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c81',
      internalName: 'terminology',
      category: 'accuracy',
      parentCategory: null,
      severity: 'critical',
      description: 'Critical terminology error',
      isCustom: false,
      isActive: true,
      displayOrder: 0,
      createdAt: new Date('2026-03-01T00:00:00Z'),
      updatedAt: new Date('2026-03-01T00:00:00Z'),
    },
    {
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c82',
      internalName: 'mistranslation',
      category: 'accuracy',
      parentCategory: null,
      severity: 'major',
      description: 'Major mistranslation',
      isCustom: false,
      isActive: true,
      displayOrder: 1,
      createdAt: new Date('2026-03-01T00:00:00Z'),
      updatedAt: new Date('2026-03-01T00:00:00Z'),
    },
    {
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c83',
      internalName: 'style',
      category: 'fluency',
      parentCategory: null,
      severity: 'minor',
      description: 'Minor style issue',
      isCustom: false,
      isActive: true,
      displayOrder: 2,
      createdAt: new Date('2026-03-01T00:00:00Z'),
      updatedAt: new Date('2026-03-01T00:00:00Z'),
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. [P0] Drag handles visible when canReorder={true}
  it.skip('[P0] should render drag handles (GripVertical icons) when canReorder={true}', async () => {
    // WHAT: When canReorder prop is true and onReorder is provided, each table row
    //   should render a drag handle element (data-testid="drag-handle") with a GripVertical
    //   icon from lucide-react, enabling @dnd-kit sortable reorder.
    // WHY WILL FAIL: The TaxonomyMappingTable Props type does not include `canReorder` or
    //   `onReorder` props. Passing them will cause a TS error at compile time and the component
    //   does not render any drag handle elements or integrate @dnd-kit.

    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
        // @ts-expect-error -- canReorder prop does not exist yet (RED phase)
        canReorder={true}
        onReorder={mockOnReorder}
      />,
    )

    const dragHandles = screen.getAllByTestId('drag-handle')
    expect(dragHandles).toHaveLength(MOCK_MAPPINGS.length)
  })

  // 2. [P0] Drag handles hidden when canReorder={false}
  it.skip('[P0] should NOT render drag handles when canReorder={false}', async () => {
    // WHAT: When canReorder is false (or omitted), no drag handles should be rendered.
    //   This preserves the existing table layout for non-admin users who cannot reorder.
    // WHY WILL FAIL: The TaxonomyMappingTable Props type does not include `canReorder`.
    //   Even if it did, the component currently never renders drag handle elements.

    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
        // @ts-expect-error -- canReorder prop does not exist yet (RED phase)
        canReorder={false}
      />,
    )

    const dragHandles = screen.queryAllByTestId('drag-handle')
    expect(dragHandles).toHaveLength(0)
  })

  // 3. [P0] onReorder called with [{id, displayOrder}] after drag end
  it.skip('[P0] should call onReorder with [{id, displayOrder}] after drag end', async () => {
    // WHAT: After a @dnd-kit DragEnd event where user drags the first item to the third
    //   position, the onReorder callback should be called with an array of ALL mapping items
    //   with their new displayOrder values reflecting the reordered positions.
    // WHY WILL FAIL: TaxonomyMappingTable does not accept onReorder prop, does not wrap
    //   content in @dnd-kit DndContext, and has no onDragEnd handler. The DndContext import
    //   and useSortable hooks are not yet integrated.

    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')

    // We need to simulate @dnd-kit DragEnd. In the implementation, DndContext wraps the
    // table and fires onDragEnd. We'll import DndContext to fire events programmatically.
    // For RED phase, this import will also fail since the component doesn't use DndContext yet.
    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
        // @ts-expect-error -- canReorder prop does not exist yet (RED phase)
        canReorder={true}
        onReorder={mockOnReorder}
      />,
    )

    // Simulate drag: move first item (displayOrder=0) to third position (displayOrder=2)
    // In GREEN phase, this will use @dnd-kit test utilities or fire keyboard events
    // on the drag handle to pick up, move, and drop.
    // For now, we just assert the callback shape after the drag interaction.
    const dragHandles = screen.getAllByTestId('drag-handle')
    expect(dragHandles.length).toBeGreaterThan(0)

    // After drag end, onReorder should be called with the full reordered array
    // Expected new order: mistranslation(0), style(1), terminology(2)
    expect(mockOnReorder).toHaveBeenCalledWith([
      { id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c82', displayOrder: 0 },
      { id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c83', displayOrder: 1 },
      { id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c81', displayOrder: 2 },
    ])
  })

  // 4. [P1] Drag disabled during inline edit mode
  it.skip('[P1] should disable drag when editingId is set (inline edit mode)', async () => {
    // WHAT: When a row is in edit mode (user clicked Edit button), drag handles should be
    //   visually disabled and non-interactive to prevent conflicting interactions.
    //   This prevents accidental reorder while user is editing field values.
    // WHY WILL FAIL: No DnD integration exists in the component. The `useSortable` hook
    //   is not used, so there's no `disabled` prop to control. The component has no
    //   mechanism to communicate editingId state to @dnd-kit sensors.

    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    const { fireEvent } = await import('@testing-library/react')

    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
        // @ts-expect-error -- canReorder prop does not exist yet (RED phase)
        canReorder={true}
        onReorder={mockOnReorder}
      />,
    )

    // Click Edit on first row to enter edit mode
    const editButtons = screen.getAllByText('Edit')
    fireEvent.click(editButtons[0]!)

    // While editing, drag handles should be disabled (aria-disabled or pointer-events-none)
    const dragHandles = screen.getAllByTestId('drag-handle')
    for (const handle of dragHandles) {
      expect(handle).toHaveAttribute('aria-disabled', 'true')
    }
  })

  // 5. [P1] Keyboard reorder: Space to pick, Arrow to move, Space to drop
  it.skip('[P1] should support keyboard reorder: Space to pick, Arrow to move, Space to drop', async () => {
    // WHAT: @dnd-kit KeyboardSensor allows accessible reorder via keyboard:
    //   Space/Enter = pick up, ArrowDown/ArrowUp = move within list, Space/Enter = drop.
    //   After this keyboard sequence, onReorder should be called with the new order.
    // WHY WILL FAIL: No @dnd-kit KeyboardSensor is configured. The component does not
    //   wrap content in DndContext with sensors=[KeyboardSensor]. No drag handles exist
    //   that can receive keyboard focus and events.

    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    const { fireEvent } = await import('@testing-library/react')

    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
        // @ts-expect-error -- canReorder prop does not exist yet (RED phase)
        canReorder={true}
        onReorder={mockOnReorder}
      />,
    )

    const dragHandles = screen.getAllByTestId('drag-handle')
    const firstHandle = dragHandles[0]!

    // Focus the first drag handle
    firstHandle.focus()

    // Space = pick up
    fireEvent.keyDown(firstHandle, { key: ' ', code: 'Space' })
    // ArrowDown = move down one position
    fireEvent.keyDown(firstHandle, { key: 'ArrowDown', code: 'ArrowDown' })
    // Space = drop
    fireEvent.keyDown(firstHandle, { key: ' ', code: 'Space' })

    // onReorder should have been called after the drop
    expect(mockOnReorder).toHaveBeenCalledTimes(1)
    expect(mockOnReorder).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.any(String), displayOrder: expect.any(Number) }),
      ]),
    )
  })

  // 6. [P0] Empty state colSpan should be 7 when canReorder={true}
  it.skip('[P0] should update colSpan to 7 on empty state when canReorder={true}', async () => {
    // WHAT: When canReorder is true, a new "drag handle" column is added to the table header,
    //   increasing total columns from 6 to 7. The empty-state "No mappings found" cell must
    //   use colSpan={7} to span the full width correctly.
    // WHY WILL FAIL: The canReorder prop does not exist. The empty state cell at line 270
    //   of TaxonomyMappingTable.tsx has colSpan={6} hardcoded. No drag handle column exists.

    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={[]}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
        // @ts-expect-error -- canReorder prop does not exist yet (RED phase)
        canReorder={true}
        onReorder={mockOnReorder}
      />,
    )

    const emptyCell = screen.getByText('No mappings found. Add one to get started.')
    // The parent <td> should have colSpan=7 (6 original columns + 1 drag handle column)
    expect(emptyCell.closest('td')).toHaveAttribute('colspan', '7')
  })
})
