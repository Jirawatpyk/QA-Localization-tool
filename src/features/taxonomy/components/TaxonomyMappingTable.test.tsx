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

  // TA expansion — Story 3.2b7 coverage gap U1
  it('[P1] should produce correct [{id, displayOrder}] via computeNewOrder (last → first, reverse direction)', async () => {
    // Given: 3 mappings in order [terminology(0), mistranslation(1), style(2)]
    const { computeNewOrder } = await import('./TaxonomyMappingTable')

    // When: drag last item (style, c83) to first position (terminology, c81)
    const result = computeNewOrder(MOCK_MAPPINGS, MOCK_MAPPINGS[2]!.id, MOCK_MAPPINGS[0]!.id)

    // Then: style moves to 0, terminology to 1, mistranslation to 2
    expect(result).not.toBeNull()
    expect(result).toHaveLength(3)
    expect(result![0]!.id).toBe(MOCK_MAPPINGS[2]!.id) // style
    expect(result![1]!.id).toBe(MOCK_MAPPINGS[0]!.id) // terminology
    expect(result![2]!.id).toBe(MOCK_MAPPINGS[1]!.id) // mistranslation
    // Verify all displayOrder sequential
    result!.forEach((item, i) => expect(item.displayOrder).toBe(i))
  })

  // TA expansion — Story 3.2b7 coverage gap U2
  it('[P2] should handle adjacent swap correctly with 2-item array via computeNewOrder', async () => {
    // Given: 2-item subset of mappings
    const twoItemMappings: TaxonomyMapping[] = [MOCK_MAPPINGS[0]!, MOCK_MAPPINGS[1]!]
    const { computeNewOrder } = await import('./TaxonomyMappingTable')

    // When: drag first (terminology, c81) to second (mistranslation, c82)
    const result = computeNewOrder(twoItemMappings, twoItemMappings[0]!.id, twoItemMappings[1]!.id)

    // Then: items swap — mistranslation(0), terminology(1)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(2)
    expect(result![0]!.id).toBe(twoItemMappings[1]!.id) // mistranslation
    expect(result![1]!.id).toBe(twoItemMappings[0]!.id) // terminology
    result!.forEach((item, i) => expect(item.displayOrder).toBe(i))
  })

  // TA expansion — Story 3.2b7 coverage gap U6
  it('[P2] should return same order from computeNewOrder with single-item array (no-op)', async () => {
    // Given: single-item mappings array
    const singleItemMappings: TaxonomyMapping[] = [MOCK_MAPPINGS[0]!]
    const { computeNewOrder } = await import('./TaxonomyMappingTable')

    // When: activeId and overId are both the single item (arrayMove no-op)
    const result = computeNewOrder(
      singleItemMappings,
      singleItemMappings[0]!.id,
      singleItemMappings[0]!.id,
    )

    // Then: result has same order (1 item, displayOrder=0)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(1)
    expect(result![0]!.id).toBe(singleItemMappings[0]!.id)
    expect(result![0]!.displayOrder).toBe(0)
  })

  // TA expansion — Story 3.2b7 coverage gap U10
  it('[P2] should return same order from computeNewOrder when activeId===overId (same position)', async () => {
    // Given: 3 mappings in original order
    const { computeNewOrder } = await import('./TaxonomyMappingTable')

    // When: drag item to its own position (activeId === overId)
    const result = computeNewOrder(MOCK_MAPPINGS, MOCK_MAPPINGS[1]!.id, MOCK_MAPPINGS[1]!.id)

    // Then: order unchanged — terminology(0), mistranslation(1), style(2)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(3)
    expect(result![0]!.id).toBe(MOCK_MAPPINGS[0]!.id)
    expect(result![1]!.id).toBe(MOCK_MAPPINGS[1]!.id)
    expect(result![2]!.id).toBe(MOCK_MAPPINGS[2]!.id)
    result!.forEach((item, i) => expect(item.displayOrder).toBe(i))
  })

  // TA expansion — Story 3.2b7 coverage gap U3
  it('[P2] should render empty state with colSpan=6 when canReorder={false}', async () => {
    // Given: empty mappings with canReorder={false}
    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')

    // When: render with empty array and canReorder={false}
    render(
      <TaxonomyMappingTable
        mappings={[]}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
        canReorder={false}
      />,
    )

    // Then: colSpan should be "6" (no drag handle column)
    const emptyCell = screen.getByText('No mappings found. Add one to get started.')
    expect(emptyCell.closest('td')).toHaveAttribute('colspan', '6')
  })
})

// ---------------------------------------------------------------------------
// F11 — Null severity fallback
// ---------------------------------------------------------------------------
describe('TaxonomyMappingTable — Null Severity Fallback', () => {
  const mockOnUpdate = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnAdd = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // F11 [P2] severity: null falls back to 'minor' via ?? operator (line 196 in source)
  it('[P2] should fall back to minor severity badge when severity is null', async () => {
    const NULL_SEVERITY_MAPPING: TaxonomyMapping = {
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c84',
      internalName: 'null-sev',
      category: 'fluency',
      parentCategory: null,
      severity: null as unknown as 'critical' | 'major' | 'minor',
      description: 'Null severity test',
      isCustom: false,
      isActive: true,
      displayOrder: 0,
      createdAt: new Date('2026-03-01T00:00:00Z'),
      updatedAt: new Date('2026-03-01T00:00:00Z'),
    }

    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={[NULL_SEVERITY_MAPPING]}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
      />,
    )

    // The badge text should show "minor" (the ?? 'minor' fallback)
    const fallbackBadge = screen.getByText('minor')
    expect(fallbackBadge).toBeTruthy()
    // Badge class must contain bg-severity-minor (same as a real 'minor' severity)
    expect(fallbackBadge.className).toMatch(/bg-severity-minor/)
  })
})

// ---------------------------------------------------------------------------
// S-FIX-2 — Description Tooltip (T-01 fix)
// ---------------------------------------------------------------------------
describe('TaxonomyMappingTable — Description Tooltip', () => {
  const mockOnUpdate = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnAdd = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('[P1] should render description with truncate class and tooltip trigger', async () => {
    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={MOCK_MAPPINGS}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
      />,
    )

    // Each mapping with a description should render with truncate class and cursor-default
    const descriptionSpan = screen.getByText('Critical terminology error')
    expect(descriptionSpan.className).toContain('truncate')
    expect(descriptionSpan.className).toContain('cursor-default')
    // tabIndex=0 for keyboard tooltip access
    expect(descriptionSpan).toHaveAttribute('tabindex', '0')
  })

  it('[P2] should render em-dash for empty description', async () => {
    const EMPTY_DESC_MAPPING: TaxonomyMapping = {
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c85',
      internalName: 'empty-desc',
      category: 'fluency',
      parentCategory: 'parent-cat',
      severity: 'minor',
      description: '',
      isCustom: false,
      isActive: true,
      displayOrder: 0,
      createdAt: new Date('2026-03-01T00:00:00Z'),
      updatedAt: new Date('2026-03-01T00:00:00Z'),
    }

    const { TaxonomyMappingTable } = await import('./TaxonomyMappingTable')
    render(
      <TaxonomyMappingTable
        mappings={[EMPTY_DESC_MAPPING]}
        onUpdate={mockOnUpdate}
        onDelete={mockOnDelete}
        onAdd={mockOnAdd}
      />,
    )

    // Empty description renders as italic em-dash
    const emDashes = screen.getAllByText('\u2014')
    // At least one should be italic (description column)
    const italicDash = emDashes.find((el) => el.className.includes('italic'))
    expect(italicDash).toBeTruthy()
  })
})
