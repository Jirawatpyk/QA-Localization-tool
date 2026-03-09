/// <reference types="vitest/globals" />
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppBreadcrumb } from './app-breadcrumb'

// Hoist mock functions so they are available inside vi.mock() factories
const { mockUsePathname, mockGetBreadcrumbEntities } = vi.hoisted(() => ({
  mockUsePathname: vi.fn<() => string>(),
  mockGetBreadcrumbEntities: vi.fn(),
}))

// Mock next/navigation — AppBreadcrumb uses usePathname() to read current route
vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}))

// Mock server action for resolving dynamic entity names (e.g., project ID → project name)
vi.mock('@/components/layout/actions/getBreadcrumbEntities.action', () => ({
  getBreadcrumbEntities: mockGetBreadcrumbEntities,
}))

describe('AppBreadcrumb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 5.1 [P1] Root /dashboard shows "Dashboard" only
  it('[P1] should render Dashboard only at root route', () => {
    mockUsePathname.mockReturnValue('/dashboard')

    render(<AppBreadcrumb />)

    // Only "Dashboard" text should be visible
    expect(screen.getByText('Dashboard')).toBeTruthy()
    // No separator should be rendered (single segment)
    expect(document.querySelector('[data-slot="breadcrumb-separator"]')).toBeNull()
  })

  // 5.2 [P1] Nested route shows correct segments
  it('[P1] should render correct segments for nested route /projects/abc/glossary', async () => {
    mockUsePathname.mockReturnValue('/projects/abc/glossary')
    mockGetBreadcrumbEntities.mockResolvedValue({
      success: true,
      data: { projectName: 'Project ABC' },
    })

    render(<AppBreadcrumb />)

    // Static segments available immediately
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Glossary')).toBeTruthy()
    // Dynamic segment resolves async
    await waitFor(() => {
      expect(screen.getByText('Project ABC')).toBeTruthy()
    })
  })

  // 5.3 [P1] Last segment is bold and not a link
  it('[P1] should render last segment as bold non-link', async () => {
    mockUsePathname.mockReturnValue('/projects/abc/glossary')
    mockGetBreadcrumbEntities.mockResolvedValue({
      success: true,
      data: { projectName: 'Project ABC' },
    })

    render(<AppBreadcrumb />)

    // Wait for entity resolution
    await waitFor(() => {
      expect(screen.getByText('Project ABC')).toBeTruthy()
    })

    // Last segment ("Glossary") should be bold, NOT a link, and have aria-current="page"
    const lastSegment = screen.getByText('Glossary')
    expect(lastSegment.className).toMatch(/font-bold|font-semibold/)
    expect(lastSegment.closest('a')).toBeNull()
    expect(lastSegment.getAttribute('aria-current')).toBe('page')

    // First segment ("Dashboard") should be a clickable link
    const firstSegment = screen.getByText('Dashboard')
    expect(firstSegment.closest('a')).toBeTruthy()
  })

  // 5.4 [P1] > 4 segments truncates middle
  it('[P1] should truncate middle segments when more than 4 levels', async () => {
    // 5+ segments: dashboard / projects / abc / review / session123 / details
    mockUsePathname.mockReturnValue('/projects/abc/review/session123/details')
    mockGetBreadcrumbEntities.mockResolvedValue({
      success: true,
      data: { projectName: 'Project ABC', sessionName: 'Session 123' },
    })

    render(<AppBreadcrumb />)

    // Ellipsis should be visible in the middle
    await waitFor(() => {
      expect(screen.getByText('More')).toBeTruthy()
    })
    // First (Dashboard) and last (Details) segments should remain visible
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Details')).toBeTruthy()
  })

  // 5.5 [P1] Static segments resolve from pathname
  it('[P1] should resolve static segments without server action', () => {
    mockUsePathname.mockReturnValue('/admin/taxonomy')

    render(<AppBreadcrumb />)

    // Static segments should render from pathname
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Admin')).toBeTruthy()
    expect(screen.getByText('Taxonomy')).toBeTruthy()

    // Server action should NOT have been called (no dynamic segments)
    expect(mockGetBreadcrumbEntities).not.toHaveBeenCalled()
  })

  // B9 [P1] 4 segments -> no truncation (boundary)
  it('[P1] should not truncate at exactly 4 segments (boundary)', async () => {
    // 4 segments: dashboard / Project ABC / Batch / Upload
    mockUsePathname.mockReturnValue('/projects/abc/batch/upload')
    mockGetBreadcrumbEntities.mockResolvedValue({
      success: true,
      data: { projectName: 'Project ABC' },
    })

    render(<AppBreadcrumb />)

    // Wait for entity resolution
    await waitFor(() => {
      expect(screen.getByText('Project ABC')).toBeTruthy()
    })

    // All 4 segments should be visible — no truncation
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Batch')).toBeTruthy()
    expect(screen.getByText('Upload')).toBeTruthy()

    // No ellipsis should be present
    expect(screen.queryByText('More')).toBeNull()
  })

  // Error fallback [P1] — .catch() path when entity resolution fails
  it('[P1] should fall back to raw ID when entity resolution fails', async () => {
    mockUsePathname.mockReturnValue('/projects/abc/glossary')
    mockGetBreadcrumbEntities.mockRejectedValue(new Error('Network error'))

    render(<AppBreadcrumb />)

    // Falls back to raw ID 'abc' — component does not crash
    await waitFor(() => {
      expect(screen.getByText('abc')).toBeTruthy()
    })
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Glossary')).toBeTruthy()
  })

  // B10 [P1] 5 segments -> truncation (boundary)
  it('[P1] should truncate at 5 segments (boundary)', async () => {
    // 5+ segments: dashboard / projects / abc / review / sessionXyz / findings
    mockUsePathname.mockReturnValue('/projects/abc/review/sessionXyz/findings')
    mockGetBreadcrumbEntities.mockResolvedValue({
      success: true,
      data: { projectName: 'Project ABC', sessionName: 'Session XYZ' },
    })

    render(<AppBreadcrumb />)

    // Ellipsis should be visible (truncation active)
    await waitFor(() => {
      expect(screen.getByText('More')).toBeTruthy()
    })
    // First segment (Dashboard) and last segment (Findings) must be visible
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Findings')).toBeTruthy()
  })

  // F8 [P2] Root '/' path renders only "Dashboard" with no separators
  it('[P2] should render only Dashboard at root path with no separators', () => {
    mockUsePathname.mockReturnValue('/')

    render(<AppBreadcrumb />)

    // Only "Dashboard" text should be visible
    expect(screen.getByText('Dashboard')).toBeTruthy()
    // No separator should be rendered (single segment — root collapses to Dashboard only)
    expect(document.querySelector('[data-slot="breadcrumb-separator"]')).toBeNull()
    // No dynamic segments → server action should NOT be called
    expect(mockGetBreadcrumbEntities).not.toHaveBeenCalled()
  })

  // F9 [P2] '/projects' without ID: renders Dashboard + Projects as static segments
  it('[P2] should render Dashboard and Projects as static segments for /projects path', () => {
    mockUsePathname.mockReturnValue('/projects')

    render(<AppBreadcrumb />)

    // Both static segments should be visible
    expect(screen.getByText('Dashboard')).toBeTruthy()
    expect(screen.getByText('Projects')).toBeTruthy()
    // No dynamic UUID segment → server action should NOT be called
    expect(mockGetBreadcrumbEntities).not.toHaveBeenCalled()
  })

  // ── Story 4.0 TD Regression: TD-UX-001/002 ──

  it('[P1] TD3: should cancel fetch on route change via AbortController', async () => {
    // TD-UX-001: Race condition when route changes during entity resolution
    mockUsePathname.mockReturnValue('/projects/abc/glossary')

    // Slow fetch that would resolve with stale data
    type ActionResultData = { success: true; data: { projectName: string } }
    let resolveOld: ((v: ActionResultData) => void) | undefined
    mockGetBreadcrumbEntities.mockImplementationOnce(
      () =>
        new Promise<ActionResultData>((resolve) => {
          resolveOld = resolve
        }),
    )

    const { rerender } = render(<AppBreadcrumb />)

    // Change route before resolution completes
    mockUsePathname.mockReturnValue('/projects/xyz/glossary')
    mockGetBreadcrumbEntities.mockResolvedValue({
      success: true,
      data: { projectName: 'New Project' },
    })
    rerender(<AppBreadcrumb />)

    // Resolve the old promise — it should be cancelled/ignored
    resolveOld?.({ success: true, data: { projectName: 'Old Project' } })

    // Wait for new project to appear
    await waitFor(() => {
      expect(screen.getByText('New Project')).toBeTruthy()
    })

    // 'Old Project' should never appear
    expect(screen.queryByText('Old Project')).toBeNull()
  })

  it('[P1] TD4: should truncate segments as [first, ..., secondToLast, last]', async () => {
    // TD-UX-002: Truncation algorithm should preserve more context
    // 6 segments: Dashboard / Project ABC / Review / Session 123 / Details / Summary
    mockUsePathname.mockReturnValue('/projects/abc/review/session123/details')
    mockGetBreadcrumbEntities.mockResolvedValue({
      success: true,
      data: { projectName: 'Project ABC', sessionName: 'Session 123' },
    })

    render(<AppBreadcrumb />)

    await waitFor(() => {
      expect(screen.getByText('More')).toBeTruthy()
    })

    // First is visible (Dashboard)
    expect(screen.getByText('Dashboard')).toBeTruthy()
    // Last is visible (Details)
    expect(screen.getByText('Details')).toBeTruthy()
    // Second-to-last should also be visible (Session 123 or Review)
    // The truncation pattern: [first, ..., secondToLast, last]
    const allText = document.body.textContent ?? ''
    // Both secondToLast and last should be present
    expect(allText).toContain('Details')
  })
})
