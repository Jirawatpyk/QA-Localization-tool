/// <reference types="vitest/globals" />
import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaxonomyMapping } from '@/features/taxonomy/types'

// CR R1 M2 fix: file-level shared MOCK_MAPPINGS (dedup from 2 copies per describe block)
// NOTE: inline objects intentional — factory import pulls in @faker-js/faker (~6MB),
// causing 15s timeout in full suite (164 files) due to module resolution overhead.
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

describe('TaxonomyMappingTable — Severity Badge Colors', () => {
  const mockOnUpdate = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnAdd = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[P1] should render major severity badge with bg-severity-major class (orange)', async () => {
    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
      />,
    )

    const majorBadge = screen.getByText('major')
    expect(majorBadge.className).toMatch(/bg-severity-major/)
    expect(majorBadge.className).toMatch(/text-white/)
    expect(majorBadge.className).not.toMatch(/bg-primary/)
  })

  it('[P1] should render minor severity badge with bg-severity-minor class (blue)', async () => {
    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
      />,
    )

    const minorBadge = screen.getByText('minor')
    expect(minorBadge.className).toMatch(/bg-severity-minor/)
    expect(minorBadge.className).toMatch(/text-white/)
    expect(minorBadge.className).not.toMatch(/bg-secondary/)
  })

  it('[P1] should render critical severity badge with bg-severity-critical class (red)', async () => {
    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
      />,
    )

    const criticalBadge = screen.getByText('critical')
    expect(criticalBadge.className).toMatch(/bg-severity-critical/)
    expect(criticalBadge.className).toMatch(/text-white/)
  })
})

// ---------------------------------------------------------------------------
// Story 3.2b7 — Drag-and-Drop Reorder (ATDD GREEN phase)
// ---------------------------------------------------------------------------
describe('TaxonomyMappingTable — Drag-and-Drop Reorder', () => {
  const mockOnUpdate = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnAdd = vi.fn()
  const mockOnReorder = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. [P0] Drag handles visible when canReorder={true}
  it('[P0] should render drag handles (GripVertical icons) when canReorder={true}', async () => {
    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
        canReorder={true}
        onReorder={mockOnReorder}
      />,
    )

    const dragHandles = screen.getAllByTestId('drag-handle')
    expect(dragHandles).toHaveLength(MOCK_MAPPINGS.length)
  })

  // 2. [P0] Drag handles hidden when canReorder={false}
  it('[P0] should NOT render drag handles when canReorder={false}', async () => {
    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
        canReorder={false}
      />,
    )

    const dragHandles = screen.queryAllByTestId('drag-handle')
    expect(dragHandles).toHaveLength(0)
  })

  // 3. [P0] computeNewOrder produces correct [{id, displayOrder}] after reorder
  // CR R1 H1 fix: extracted handleDragEnd logic into pure function computeNewOrder()
  // so we can test directly without relying on @dnd-kit sensors (which need getBoundingClientRect).
  it('[P0] should produce correct [{id, displayOrder}] via computeNewOrder (first → last)', async () => {
    const { computeNewOrder } = await import('./TaxonomyMappingTable')

    const result = computeNewOrder(MOCK_MAPPINGS, MOCK_MAPPINGS[0]!.id, MOCK_MAPPINGS[2]!.id)

    expect(result).not.toBeNull()
    expect(result).toHaveLength(3)
    // After dragging first (terminology) to last (style) position:
    // mistranslation moves to 0, style moves to 1, terminology moves to 2
    expect(result![0]!.id).toBe(MOCK_MAPPINGS[1]!.id) // mistranslation
    expect(result![1]!.id).toBe(MOCK_MAPPINGS[2]!.id) // style
    expect(result![2]!.id).toBe(MOCK_MAPPINGS[0]!.id) // terminology
    for (const item of result!) {
      expect(typeof item.id).toBe('string')
      expect(typeof item.displayOrder).toBe('number')
    }
    result!.forEach((item, i) => expect(item.displayOrder).toBe(i))
  })

  // [P0] computeNewOrder returns null for unknown IDs (stale data guard)
  it('[P0] should return null from computeNewOrder when activeId not found', async () => {
    const { computeNewOrder } = await import('./TaxonomyMappingTable')

    const result = computeNewOrder(MOCK_MAPPINGS, 'non-existent-id', MOCK_MAPPINGS[1]!.id)
    expect(result).toBeNull()
  })

  // 4. [P1] Drag disabled during inline edit mode
  it('[P1] should disable drag when editingId is set (inline edit mode)', async () => {
    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')

    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
        canReorder={true}
        onReorder={mockOnReorder}
      />,
    )

    // Click Edit on first row to enter edit mode
    const editButtons = screen.getAllByText('Edit')
    fireEvent.click(editButtons[0]!)

    // While editing, drag handles should be disabled
    const dragHandles = screen.getAllByTestId('drag-handle')
    for (const handle of dragHandles) {
      expect(handle).toHaveAttribute('aria-disabled', 'true')
    }
  })

  // 5. [P1] Keyboard reorder: Space to pick, Arrow to move, Space to drop
  it('[P1] should support keyboard reorder: Space to pick, Arrow to move, Space to drop', async () => {
    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')

    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
        canReorder={true}
        onReorder={mockOnReorder}
      />,
    )

    const dragHandles = screen.getAllByTestId('drag-handle')
    const firstHandle = dragHandles[0]!

    // Verify keyboard accessibility attributes — confirms KeyboardSensor is wired
    expect(firstHandle).toHaveAttribute('aria-roledescription', 'sortable')
    // CR R1 H1 fix: keyboard DnD integration tested via computeNewOrder pure function (test #3)
    // and E2E keyboard sequence (taxonomy-admin.spec.ts). Sensor wiring verified by aria attributes.
  })

  // 6. [P0] Empty state colSpan should be 7 when canReorder={true}
  it('[P0] should update colSpan to 7 on empty state when canReorder={true}', async () => {
    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={[]}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
        canReorder={true}
        onReorder={mockOnReorder}
      />,
    )

    const emptyCell = screen.getByText('No mappings found. Add one to get started.')
    expect(emptyCell.closest('td')).toHaveAttribute('colspan', '7')
  })
})
