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
