/**
 * ATDD GREEN PHASE — Story 4.1c: Detail Panel & Segment Context
 * Component: FindingDetailSheet (update existing shell)
 *
 * Guardrails referenced: #36 (severity icons), #38 (ARIA landmarks), #37 (reduced motion)
 */
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only for AddToGlossaryDialog's server action imports
vi.mock('server-only', () => ({}))
vi.mock('@/features/review/actions/addToGlossary.action', () => ({
  addToGlossary: vi.fn(),
}))
vi.mock('@/features/review/actions/updateGlossaryTerm.action', () => ({
  updateGlossaryTerm: vi.fn(),
}))

import { FindingDetailSheet } from '@/features/review/components/FindingDetailSheet'
import { buildFindingForUI } from '@/test/factories'

// Mock useReducedMotion — controllable per-test for G2
const mockUseReducedMotion = vi.fn((..._args: unknown[]) => false)
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: (...args: unknown[]) => mockUseReducedMotion(...args),
}))

// S-FIX-4: Sheet only renders at < 1024px — useIsLaptop no longer imported
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsXl: () => true,
}))

// Mock useSegmentContext to isolate FindingDetailSheet from server action
const mockUseSegmentContext = vi.fn((..._args: unknown[]) => ({
  data: null,
  isLoading: false,
  error: null,
  retry: vi.fn(),
}))

vi.mock('@/features/review/hooks/use-segment-context', () => ({
  useSegmentContext: (...args: unknown[]) => mockUseSegmentContext(...args),
}))

// Mock Radix Sheet to render inline (no portal issues in jsdom)
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="sheet-root">{children}</div> : null,
  SheetContent: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <div
      role={props.role as string}
      aria-label={props['aria-label'] as string}
      data-testid={props['data-testid'] as string}
      className={props.className as string | undefined}
    >
      {children}
    </div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}))

// ── Default props helper ──

function defaultProps(overrides?: Record<string, unknown>) {
  return {
    open: true,
    onOpenChange: vi.fn(),
    finding: buildFindingForUI({
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      severity: 'major',
      category: 'accuracy',
      description: 'Mistranslation of key term',
      detectedByLayer: 'L2',
      aiConfidence: 85,
      status: 'pending',
      aiModel: 'gpt-4o-mini',
      suggestedFix: null,
    }),
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    fileId: 'b2c3d4e5-f6a1-4b1c-9d2e-4f5a6b7c8d9e',
    ...overrides,
  }
}

describe('FindingDetailSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSegmentContext.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
      retry: vi.fn(),
    })
    mockUseReducedMotion.mockReturnValue(false)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC1: Detail Panel Content Sync — Finding Metadata
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C3.1][P0] should render finding metadata (severity, category, layer, status)', () => {
    render(<FindingDetailSheet {...defaultProps()} />)

    // Severity (Guardrail #36: AlertTriangle for major + text)
    expect(screen.getByText(/Major/)).toBeInTheDocument()
    // Category — inside metadata section (not aria-live)
    const metadata = screen.getByTestId('finding-metadata')
    expect(within(metadata).getByText(/accuracy/i)).toBeInTheDocument()
    // Layer badge — L2 = "AI"
    expect(screen.getByText(/AI/)).toBeInTheDocument()
    // Status
    expect(screen.getByText(/Pending/i)).toBeInTheDocument()
    // Description
    expect(screen.getByText('Mistranslation of key term')).toBeInTheDocument()
  })

  it('[T-C3.2][P1] should show AI confidence + model for L2/L3 findings', () => {
    render(
      <FindingDetailSheet
        {...defaultProps({
          finding: buildFindingForUI({
            detectedByLayer: 'L2',
            aiConfidence: 85,
            aiModel: 'gpt-4o-mini',
          }),
        })}
      />,
    )

    expect(screen.getByText(/85%/)).toBeInTheDocument()
    expect(screen.getByText(/gpt-4o-mini/)).toBeInTheDocument()
  })

  it('[T-C3.3][P1] should show suggestion section when available', () => {
    render(
      <FindingDetailSheet
        {...defaultProps({
          finding: buildFindingForUI({
            suggestedFix: 'Use "ระบบ" instead of "system"',
          }),
        })}
      />,
    )

    expect(screen.getByText(/Use "ระบบ" instead of "system"/)).toBeInTheDocument()
    expect(screen.getByText(/Suggestion/i)).toBeInTheDocument()
  })

  it('[T-C3.4][P1] should hide confidence for L1 findings', () => {
    render(
      <FindingDetailSheet
        {...defaultProps({
          finding: buildFindingForUI({
            detectedByLayer: 'L1',
            aiConfidence: null,
            aiModel: null,
          }),
        })}
      />,
    )

    // Layer badge should say "Rule" (L1)
    expect(screen.getByText(/Rule/)).toBeInTheDocument()
    // No confidence percentage displayed
    expect(screen.queryByTestId('confidence-badge')).not.toBeInTheDocument()
    // No model name
    expect(screen.queryByText(/gpt|claude/i)).not.toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC1: Empty State
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C3.5][P0] should show empty state "Select a finding to view details"', () => {
    render(
      <FindingDetailSheet
        {...defaultProps({
          finding: null,
        })}
      />,
    )

    // Empty state text appears in body content area
    const matches = screen.getAllByText(/Select a finding to view details/)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC1: Action Buttons (disabled placeholder — wired in Story 4.2)
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C3.6][P1] should render enabled action buttons (Accept, Reject, Flag) for non-manual findings (Story 4.2)', () => {
    render(<FindingDetailSheet {...defaultProps()} />)

    // S-FIX-4: FindingDetailContent now uses ReviewActionBar with [A]/[R]/[F] hotkey labels
    const acceptBtn = screen.getByRole('button', { name: /Accept/i })
    const rejectBtn = screen.getByRole('button', { name: /Reject/i })
    const flagBtn = screen.getByRole('button', { name: /Flag/i })

    expect(acceptBtn).toBeEnabled()
    expect(rejectBtn).toBeEnabled()
    expect(flagBtn).toBeEnabled()

    // S-FIX-4: Buttons now show keyboard shortcut hints via ReviewActionBar
    expect(acceptBtn.textContent).toMatch(/\[A\]/)
    expect(rejectBtn.textContent).toMatch(/\[R\]/)
    expect(flagBtn.textContent).toMatch(/\[F\]/)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC1: ARIA Roles & Accessibility
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C3.7][P1] should have ARIA roles: complementary, toolbar', () => {
    render(<FindingDetailSheet {...defaultProps()} />)

    // Sheet content has role="complementary" (Guardrail #38)
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    // Action bar has role="toolbar"
    expect(screen.getByRole('toolbar', { name: /Review actions/i })).toBeInTheDocument()
  })

  it('[T-C3.8][P1] should announce finding change via aria-live', () => {
    const { rerender } = render(<FindingDetailSheet {...defaultProps()} />)

    const liveRegion = screen.getByRole('status')
    expect(liveRegion).toBeInTheDocument()

    // Change finding
    rerender(
      <FindingDetailSheet
        {...defaultProps({
          finding: buildFindingForUI({
            id: 'new-id',
            severity: 'critical',
            category: 'completeness',
          }),
        })}
      />,
    )

    expect(liveRegion.textContent).toMatch(/critical/i)
    expect(liveRegion.textContent).toMatch(/completeness/i)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC1: Lifecycle & Edge Cases
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C3.9][P1] should show correct state on sheet reopen cycle', () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(<FindingDetailSheet {...defaultProps({ onOpenChange })} />)

    // Sheet is open — finding visible
    expect(screen.getByText('Mistranslation of key term')).toBeInTheDocument()

    // Close sheet
    rerender(<FindingDetailSheet {...defaultProps({ open: false, onOpenChange })} />)

    // Reopen sheet — data should still be correct
    rerender(<FindingDetailSheet {...defaultProps({ open: true, onOpenChange })} />)
    expect(screen.getByText('Mistranslation of key term')).toBeInTheDocument()
  })

  it('[T-C3.10][P1] should show empty state when finding becomes null during loading', () => {
    const { rerender } = render(<FindingDetailSheet {...defaultProps()} />)

    // Finding is visible
    expect(screen.getByText('Mistranslation of key term')).toBeInTheDocument()

    // Finding becomes null (deleted via realtime)
    rerender(<FindingDetailSheet {...defaultProps({ finding: null })} />)

    const matches = screen.getAllByText(/Select a finding to view details/)
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC6: Language Edge Cases
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C3.11][P2] should handle empty sourceLang gracefully (omit or default lang attr)', () => {
    render(<FindingDetailSheet {...defaultProps({ sourceLang: '' })} />)

    // Should not crash
    expect(screen.getByTestId('finding-detail-sheet')).toBeInTheDocument()
    // Lang attr should not be empty string
    const langElements = document.querySelectorAll('[lang=""]')
    expect(langElements.length).toBe(0)
  })

  it('[T-C3.12][P1] should show distinct model name for L3 finding vs L2', () => {
    render(
      <FindingDetailSheet
        {...defaultProps({
          finding: buildFindingForUI({
            detectedByLayer: 'L3',
            aiConfidence: 92,
            aiModel: 'claude-sonnet-4-5-20250929',
          }),
        })}
      />,
    )

    expect(screen.getByText(/claude-sonnet/)).toBeInTheDocument()
    expect(screen.queryByText(/gpt-4o-mini/)).not.toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Coverage gap: fileId=null → empty sheet body (Story 4.1c G4)
  // ═══════════════════════════════════════════════════════════════════════

  it('[TA-G4][P1] should render sheet shell without FindingDetailContent when fileId is null', () => {
    render(<FindingDetailSheet {...defaultProps({ fileId: null })} />)

    // Sheet is open (shell renders)
    expect(screen.getByTestId('finding-detail-sheet')).toBeInTheDocument()
    // But no FindingDetailContent or finding metadata
    expect(screen.queryByTestId('finding-detail-content')).not.toBeInTheDocument()
    expect(screen.queryByTestId('finding-metadata')).not.toBeInTheDocument()
  })

  // ═══ TA Coverage: Story 4.1d gaps ═══

  it('[TA-G1][P1] should always apply tablet/mobile width class (Sheet only renders at < 1024px after S-FIX-4)', () => {
    render(<FindingDetailSheet {...defaultProps()} />)

    const sheet = screen.getByTestId('finding-detail-sheet')
    // S-FIX-4: Sheet only renders at mobile — always uses tablet/mobile token
    expect(sheet.className).toContain('max-w-[var(--detail-panel-width-tablet)]')
    expect(sheet.className).not.toContain('max-w-[var(--detail-panel-width-laptop)]')
  })

  it('[TA-G2][P1] should apply reduced-motion classes when useReducedMotion returns true', () => {
    mockUseReducedMotion.mockReturnValue(true)

    render(<FindingDetailSheet {...defaultProps()} />)

    const sheet = screen.getByTestId('finding-detail-sheet')
    expect(sheet.className).toContain('[&[data-state]]:duration-0')
    expect(sheet.className).toContain('[&[data-state]]:animate-none')
  })

  it('[TA-G2][P1] should not apply reduced-motion classes when useReducedMotion returns false', () => {
    mockUseReducedMotion.mockReturnValue(false)

    render(<FindingDetailSheet {...defaultProps()} />)

    const sheet = screen.getByTestId('finding-detail-sheet')
    expect(sheet.className).not.toContain('duration-0')
    expect(sheet.className).not.toContain('animate-none')
  })
})
