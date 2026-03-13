/**
 * RED PHASE: Will pass after Story 4.1d implementation
 *
 * Tests — Story 4.1d: FileNavigationDropdown (mobile/laptop file switcher)
 * Test IDs: T2.6, PM-10
 *
 * Replaces the static <nav> file list with a dropdown for non-desktop breakpoints.
 * Wrapped in a <nav> element with aria-label for accessibility (Guardrail #38).
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import { FileNavigationDropdown } from '@/features/review/components/FileNavigationDropdown'

// ── Default props ──

function defaultProps(overrides?: Record<string, unknown>) {
  return {
    currentFileName: 'test-translation.sdlxliff',
    files: [
      { fileId: 'f1', fileName: 'test-translation.sdlxliff', status: 'l2_completed' as const },
      { fileId: 'f2', fileName: 'glossary-check.xliff', status: 'l1_completed' as const },
      { fileId: 'f3', fileName: 'review-batch.xlsx', status: 'uploaded' as const },
    ],
    onFileSelect: vi.fn(),
    ...overrides,
  }
}

describe('FileNavigationDropdown', () => {
  it('[P1] should render current file name', () => {
    // Arrange & Act
    render(<FileNavigationDropdown {...defaultProps()} />)

    // Assert: current file name is visible in the trigger
    expect(screen.getByText('test-translation.sdlxliff')).toBeInTheDocument()
  })

  it('[P1] should wrap content in nav element with aria-label="File navigation"', () => {
    // Arrange & Act
    render(<FileNavigationDropdown {...defaultProps()} />)

    // Assert: nav landmark with correct aria-label (Guardrail #38)
    const nav = screen.getByRole('navigation', { name: /file navigation/i })
    expect(nav).toBeInTheDocument()
  })

  it('[P1] should show chevron icon', () => {
    // Arrange & Act
    render(<FileNavigationDropdown {...defaultProps()} />)

    // Assert: chevron icon is present (accessible via test id or svg role)
    expect(screen.getByTestId('file-nav-chevron')).toBeInTheDocument()
  })

  it('[P2] should have data-testid="file-navigation-dropdown"', () => {
    // Arrange & Act
    render(<FileNavigationDropdown {...defaultProps()} />)

    // Assert
    expect(screen.getByTestId('file-navigation-dropdown')).toBeInTheDocument()
  })
})
