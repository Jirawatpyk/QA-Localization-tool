/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TaxonomyMapping } from '@/features/taxonomy/types'

// ---------------------------------------------------------------------------
// Mocks — server actions + sonner
// ---------------------------------------------------------------------------
vi.mock('@/features/taxonomy/actions/createMapping.action', () => ({
  createMapping: vi.fn(),
}))
vi.mock('@/features/taxonomy/actions/deleteMapping.action', () => ({
  deleteMapping: vi.fn(),
}))
vi.mock('@/features/taxonomy/actions/updateMapping.action', () => ({
  updateMapping: vi.fn(),
}))
vi.mock('@/features/taxonomy/actions/reorderMappings.action', () => ({
  reorderMappings: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { promise: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Story 3.2b7 — TaxonomyManager Reorder (ATDD GREEN phase)
// ---------------------------------------------------------------------------
describe('TaxonomyManager — Reorder', () => {
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

  // [P0] Verifies isAdmin → canReorder wiring + initial order (unit level).
  // Optimistic revert on failure CANNOT be unit-tested in jsdom because:
  //  - @dnd-kit requires getBoundingClientRect() for pointer position (returns 0s in jsdom)
  //  - Triggering handleReorder requires a completed DnD drag-end event
  //  - toast.promise is mocked, so even if handleReorder ran, the success/error
  //    callbacks that call setMappings(previous) wouldn't execute synchronously
  // Full DnD + optimistic revert is tested via E2E: taxonomy-admin.spec.ts
  // "should reorder taxonomy mapping via drag-and-drop and persist after reload"
  it('[P0] should wire isAdmin to canReorder and render drag handles', async () => {
    const { TaxonomyManager } = await import('./TaxonomyManager')
    render(<TaxonomyManager initialMappings={MOCK_MAPPINGS} isAdmin={true} />)

    // Verify initial order: terminology (0), mistranslation (1), style (2)
    const rows = screen.getAllByRole('row')
    // Rows include header row, so data rows start at index 1
    expect(rows[1]).toHaveTextContent('terminology')
    expect(rows[2]).toHaveTextContent('mistranslation')
    expect(rows[3]).toHaveTextContent('style')

    // Drag handles present = canReorder wired through isAdmin prop
    const dragHandles = screen.getAllByTestId('drag-handle')
    expect(dragHandles).toHaveLength(3)

    // Verify mapping count text
    expect(screen.getByText('3 mappings')).toBeTruthy()
  })

  // [P0] Non-admin should NOT see drag handles
  it('[P0] should NOT render drag handles when isAdmin is false', async () => {
    const { TaxonomyManager } = await import('./TaxonomyManager')
    render(<TaxonomyManager initialMappings={MOCK_MAPPINGS} isAdmin={false} />)

    expect(screen.queryAllByTestId('drag-handle')).toHaveLength(0)

    // Table still renders data correctly
    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('terminology')
  })
})
