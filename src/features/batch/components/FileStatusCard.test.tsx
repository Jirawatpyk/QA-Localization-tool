/// <reference types="vitest/globals" />
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock ScoreBadge to isolate FileStatusCard
vi.mock('./ScoreBadge', () => ({
  ScoreBadge: vi.fn(({ score }: { score: number | null }) => (
    <span data-testid="mock-score-badge">{score !== null ? score.toFixed(1) : 'N/A'}</span>
  )),
}))

// Mock next/link to render a plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: vi.fn(({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )),
}))

import { FileStatusCard } from './FileStatusCard'

// Type for file status card props (component not yet created)
type FileCardData = {
  fileId: string
  fileName: string
  status: 'auto_passed' | 'needs_review' | 'failed'
  mqmScore: number | null
  criticalCount: number
  majorCount: number
  minorCount: number
}

const PROJECT_ID = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

const defaultFile: FileCardData = {
  fileId: 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e',
  fileName: 'chapter1.sdlxliff',
  status: 'needs_review',
  mqmScore: 82.5,
  criticalCount: 1,
  majorCount: 3,
  minorCount: 7,
}

describe('FileStatusCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── P2: Core rendering ──

  it.skip('[P2] should display filename, ScoreBadge, status badge, and severity counts', () => {
    // EXPECTED: Card renders filename text, delegates score to ScoreBadge,
    // shows a status badge ("Needs Review"), and severity count breakdown
    render(<FileStatusCard file={defaultFile} projectId={PROJECT_ID} />)

    // Filename
    expect(screen.getByText('chapter1.sdlxliff')).toBeTruthy()

    // ScoreBadge rendered (mocked)
    expect(screen.getByTestId('mock-score-badge')).toBeTruthy()
    expect(screen.getByTestId('mock-score-badge').textContent).toBe('82.5')

    // Status badge
    expect(screen.getByText(/Needs Review/i)).toBeTruthy()

    // Severity counts visible
    expect(screen.getByText(/1/)).toBeTruthy() // critical
    expect(screen.getByText(/3/)).toBeTruthy() // major
    expect(screen.getByText(/7/)).toBeTruthy() // minor
  })

  it.skip('[P2] should render as link to /projects/[projectId]/review/[fileId]', () => {
    // EXPECTED: The card wraps content in a Next.js Link to the review page
    render(<FileStatusCard file={defaultFile} projectId={PROJECT_ID} />)

    const link = screen.getByRole('link')
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe(`/projects/${PROJECT_ID}/review/${defaultFile.fileId}`)
  })

  it.skip('[P2] should display critical, major, minor counts separately', () => {
    // EXPECTED: Three distinct count indicators with labels or aria-labels
    // Critical: 1, Major: 3, Minor: 7
    const fileWithCounts: FileCardData = {
      ...defaultFile,
      criticalCount: 2,
      majorCount: 5,
      minorCount: 12,
    }
    render(<FileStatusCard file={fileWithCounts} projectId={PROJECT_ID} />)

    // Each severity should be labeled and have its count
    const card = screen.getByRole('link')

    // Critical count
    const criticalEl =
      within(card)
        .getByText(/critical/i)
        .closest('[data-severity]') ?? within(card).getByLabelText(/critical/i)
    expect(criticalEl?.textContent).toContain('2')

    // Major count
    const majorEl =
      within(card).getByText(/major/i).closest('[data-severity]') ??
      within(card).getByLabelText(/major/i)
    expect(majorEl?.textContent).toContain('5')

    // Minor count
    const minorEl =
      within(card).getByText(/minor/i).closest('[data-severity]') ??
      within(card).getByLabelText(/minor/i)
    expect(minorEl?.textContent).toContain('12')
  })

  // ── P3: Navigation ──

  it.skip('[P3] should navigate on click via href', () => {
    // EXPECTED: The card is a link, so clicking navigates via the href attribute.
    // No onClick handler needed — standard anchor behavior.
    render(<FileStatusCard file={defaultFile} projectId={PROJECT_ID} />)

    const link = screen.getByRole('link')
    // Verify the link has the correct href (navigation is handled by the browser/Next.js router)
    expect(link.getAttribute('href')).toBe(`/projects/${PROJECT_ID}/review/${defaultFile.fileId}`)
    // Link should be focusable for keyboard nav
    expect(link.getAttribute('tabindex')).not.toBe('-1')
  })
})
