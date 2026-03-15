/**
 * RED PHASE: Will pass after Story 4.1d implementation
 *
 * Tests — Story 4.1d: ReviewPageClient responsive layout
 * Test IDs: T1.1-T1.2, T4.7, WI-3
 *
 * Verifies 3-tier responsive behavior:
 * - Desktop (>=1440px): static <aside> detail panel
 * - Laptop (1024-1439px): Sheet (side panel) detail
 * - Mobile (<768px): Sheet drawer (bottom) detail
 *
 * Guardrails referenced: #38 (ARIA landmarks), #37 (reduced motion)
 */
import { render, screen, act, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

// ── Mock media query hooks — central control for breakpoint simulation ──

const mockUseIsDesktop = vi.fn(() => true)
const mockUseIsLaptop = vi.fn(() => false)
const mockUseIsMobile = vi.fn(() => false)

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
  useIsDesktop: () => mockUseIsDesktop(),
  useIsLaptop: () => mockUseIsLaptop(),
  useIsMobile: () => mockUseIsMobile(),
}))

// ── Mock Realtime subscription hooks ──

vi.mock('@/features/review/hooks/use-findings-subscription', () => ({
  useFindingsSubscription: vi.fn(),
}))
vi.mock('@/features/review/hooks/use-score-subscription', () => ({
  useScoreSubscription: vi.fn(),
}))
vi.mock('@/features/review/hooks/use-threshold-subscription', () => ({
  useThresholdSubscription: vi.fn(),
}))

// ── Mock child components not under test ──

const findingDetailSheetProps = vi.fn()
vi.mock('@/features/review/components/FindingDetailSheet', () => ({
  FindingDetailSheet: (props: Record<string, unknown>) => {
    findingDetailSheetProps(props)
    return (props.open as boolean) ? <div data-testid="mock-finding-detail-sheet" /> : null
  },
}))
vi.mock('@/features/review/components/FindingDetailContent', () => ({
  FindingDetailContent: () => <div data-testid="mock-finding-detail-content" />,
}))
vi.mock('@/features/review/components/FileNavigationDropdown', () => ({
  FileNavigationDropdown: () => <div data-testid="mock-file-nav-dropdown" />,
}))
vi.mock('@/features/review/components/KeyboardCheatSheet', () => ({
  KeyboardCheatSheet: () => null,
}))
vi.mock('@/features/review/components/ReviewActionBar', () => ({
  ReviewActionBar: () => null,
}))
vi.mock('@/features/review/utils/announce', () => ({
  mountAnnouncer: vi.fn(),
  unmountAnnouncer: vi.fn(),
}))
vi.mock('@/features/review/hooks/use-keyboard-actions', () => ({
  useReviewHotkeys: vi.fn(),
  useUndoRedoHotkeys: vi.fn(),
  useKeyboardActions: () => ({ register: vi.fn(() => vi.fn()) }),
}))
vi.mock('@/features/review/hooks/use-undo-redo', () => ({
  useUndoRedo: () => ({ performUndo: vi.fn(), performRedo: vi.fn(), forceUndo: vi.fn() }),
}))
vi.mock('@/features/review/hooks/use-focus-management', () => ({
  useFocusManagement: () => ({ pushEscapeLayer: vi.fn(), popEscapeLayer: vi.fn() }),
}))
vi.mock('@/features/pipeline/actions/retryAiAnalysis.action', () => ({
  retryAiAnalysis: vi.fn((..._args: unknown[]) =>
    Promise.resolve({ success: true, data: { retriedLayers: [] } }),
  ),
}))
vi.mock('@/features/review/actions/approveFile.action', () => ({
  approveFile: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: null })),
}))

// Mock useReducedMotion
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}))

// ── Imports (after mocks) ──

import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { ReviewPageClient } from '@/features/review/components/ReviewPageClient'
import { useReviewStore } from '@/features/review/stores/review.store'
import { buildFinding } from '@/test/factories'
import type { DbFileStatus } from '@/types/pipeline'

// ── matchMedia setup for jsdom ──

function setupMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// ── Test data builder ──

function buildInitialData(overrides?: Partial<FileReviewData>): FileReviewData {
  return {
    tenantId: 't1',
    file: { fileId: 'f1', fileName: 'test.sdlxliff', status: 'l2_completed' as DbFileStatus },
    findings: [],
    score: {
      mqmScore: 85,
      status: 'calculated',
      layerCompleted: 'L1L2',
      criticalCount: 0,
      majorCount: 1,
      minorCount: 2,
    },
    processingMode: 'economy',
    l2ConfidenceMin: 70,
    l3ConfidenceMin: null,
    autoPassRationale: null,
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    segments: [],
    categories: [],
    overrideCounts: {},
    ...overrides,
  }
}

describe('ReviewPageClient — Responsive Layout (Story 4.1d)', () => {
  beforeEach(() => {
    setupMatchMedia()
    useReviewStore.getState().resetForFile('test')
    findingDetailSheetProps.mockClear()
    vi.clearAllMocks()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Desktop: static aside (>=1440px)
  // ═══════════════════════════════════════════════════════════════════════

  it('[P0] desktop mode: should render static aside (not Sheet) when useIsDesktop=true', () => {
    // Arrange: desktop breakpoint
    mockUseIsDesktop.mockReturnValue(true)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    const finding = buildFinding({ id: 'find1', severity: 'major' })

    // Act
    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    // Select a finding to trigger detail panel
    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    // Assert: static aside should be rendered, NOT a Sheet
    const aside = screen.getByRole('complementary')
    expect(aside).toBeInTheDocument()
    expect(aside.tagName.toLowerCase()).toBe('aside')

    // Sheet should NOT be present in desktop mode
    expect(screen.queryByTestId('mock-finding-detail-sheet')).not.toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Laptop: Sheet side panel (1024-1439px)
  // ═══════════════════════════════════════════════════════════════════════

  it('[P0] laptop mode: should render Sheet (not aside) when useIsDesktop=false, useIsLaptop=true', () => {
    // Arrange: laptop breakpoint
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    const finding = buildFinding({ id: 'find1', severity: 'major' })

    // Act
    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    // Select finding to open detail
    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    // Assert: Sheet should be used for laptop, NOT static aside
    // The aside element should NOT be present as a direct layout element
    const asides = screen.queryAllByRole('complementary')
    const staticAside = asides.find((el) => el.tagName.toLowerCase() === 'aside')
    expect(staticAside).toBeUndefined()

    // Positive: Sheet IS rendered
    expect(screen.getByTestId('mock-finding-detail-sheet')).toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Mobile: Sheet drawer (bottom) (<768px)
  // ═══════════════════════════════════════════════════════════════════════

  it('[P1] mobile mode: should render Sheet drawer when useIsDesktop=false, useIsLaptop=false', () => {
    // Arrange: mobile breakpoint
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(false)
    mockUseIsMobile.mockReturnValue(true)

    const finding = buildFinding({ id: 'find1', severity: 'major' })

    // Act
    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    // Select finding — but mobileDrawerOpen is false by default, so Sheet open=false
    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    // Assert: no static aside in mobile — uses sheet/drawer
    const asides = screen.queryAllByRole('complementary')
    const staticAside = asides.find((el) => el.tagName.toLowerCase() === 'aside')
    expect(staticAside).toBeUndefined()

    // Sheet component is rendered but with open=false (mobileDrawerOpen not toggled yet)
    // Verify Sheet was called with open=false (mock returns null when open=false)
    expect(screen.queryByTestId('mock-finding-detail-sheet')).not.toBeInTheDocument()
    const lastCall = findingDetailSheetProps.mock.calls.at(-1)?.[0]
    expect(lastCall).toBeDefined()
    expect(lastCall.open).toBe(false)

    // Toggle the drawer via the toggle button
    const toggleButton = screen.getByTestId('detail-panel-toggle')
    fireEvent.click(toggleButton)

    // Now Sheet should be open
    expect(screen.getByTestId('mock-finding-detail-sheet')).toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Empty state on desktop
  // ═══════════════════════════════════════════════════════════════════════

  it('[P1] desktop mode: aside should show empty state when selectedId is null', () => {
    // Arrange: desktop with no finding selected
    mockUseIsDesktop.mockReturnValue(true)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    // Act
    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({
          findings: [buildFinding({ id: 'find1' })],
        })}
      />,
    )

    // Assert: aside is always visible on desktop with detail content (empty state rendered by FindingDetailContent)
    const aside = screen.getByRole('complementary')
    expect(aside).toBeInTheDocument()
    // FindingDetailContent is mocked — verify it renders inside the aside
    expect(screen.getByTestId('mock-finding-detail-content')).toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Layout mode attribute
  // ═══════════════════════════════════════════════════════════════════════

  it('[P1] data-layout-mode attribute should reflect current breakpoint', () => {
    // Arrange: desktop mode
    mockUseIsDesktop.mockReturnValue(true)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    // Act
    const { rerender } = render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData()}
      />,
    )

    // Assert: desktop mode
    const container = screen.getByTestId('review-3-zone')
    expect(container.getAttribute('data-layout-mode')).toBe('desktop')

    // Switch to laptop
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    rerender(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData()}
      />,
    )

    expect(container.getAttribute('data-layout-mode')).toBe('laptop')

    // Switch to mobile
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(false)
    mockUseIsMobile.mockReturnValue(true)

    rerender(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData()}
      />,
    )

    expect(container.getAttribute('data-layout-mode')).toBe('mobile')
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Edge case: simultaneous selection + breakpoint change
  // ═══════════════════════════════════════════════════════════════════════

  it('[P2] simultaneous selectedId + breakpoint change should render correct finding', () => {
    // Arrange: start in desktop mode
    mockUseIsDesktop.mockReturnValue(true)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    const finding = buildFinding({ id: 'find1', severity: 'major', description: 'Test issue' })

    const { rerender } = render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    // Switch to laptop AND select finding simultaneously
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    rerender(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    // Assert: finding detail should be visible (in Sheet, not aside)
    // The component should not crash or show stale data
    expect(screen.queryByTestId('review-3-zone')).toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // G5: Sidebar nav at desktop vs hidden
  // ═══════════════════════════════════════════════════════════════════════

  it('[TA-G5][P1] desktop mode: should render file-sidebar-nav; laptop and mobile should not', () => {
    // Arrange: desktop
    mockUseIsDesktop.mockReturnValue(true)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    const { rerender } = render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData()}
      />,
    )

    // Assert: sidebar nav exists at desktop
    expect(screen.getByTestId('file-sidebar-nav')).toBeInTheDocument()
    expect(screen.getByTestId('file-sidebar-nav').tagName.toLowerCase()).toBe('nav')

    // Switch to laptop
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    rerender(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData()}
      />,
    )

    // Assert: sidebar nav NOT present at laptop
    expect(screen.queryByTestId('file-sidebar-nav')).not.toBeInTheDocument()

    // Switch to mobile
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(false)
    mockUseIsMobile.mockReturnValue(true)

    rerender(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData()}
      />,
    )

    // Assert: sidebar nav NOT present at mobile
    expect(screen.queryByTestId('file-sidebar-nav')).not.toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // G6: FileNavigationDropdown at laptop only
  // ═══════════════════════════════════════════════════════════════════════

  it('[TA-G6][P1] FileNavigationDropdown should show only at laptop (not desktop, not mobile)', () => {
    // Arrange: desktop
    mockUseIsDesktop.mockReturnValue(true)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    const { rerender } = render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData()}
      />,
    )

    // Assert: dropdown NOT at desktop (uses sidebar instead)
    expect(screen.queryByTestId('mock-file-nav-dropdown')).not.toBeInTheDocument()

    // Switch to laptop
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    rerender(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData()}
      />,
    )

    // Assert: dropdown IS present at laptop
    expect(screen.getByTestId('mock-file-nav-dropdown')).toBeInTheDocument()

    // Switch to mobile
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(false)
    mockUseIsMobile.mockReturnValue(true)

    rerender(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData()}
      />,
    )

    // Assert: dropdown NOT at mobile
    expect(screen.queryByTestId('mock-file-nav-dropdown')).not.toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // G7: Mobile toggle button visibility
  // ═══════════════════════════════════════════════════════════════════════

  it('[TA-G7][P1] mobile toggle button shows when !isDesktop && !isLaptop && selectedId && !mobileDrawerOpen', () => {
    // Arrange: mobile breakpoint
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(false)
    mockUseIsMobile.mockReturnValue(true)

    const finding = buildFinding({ id: 'find1', severity: 'major' })

    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    // H3 revert: handleActiveFindingChange only calls setSelectedFinding on desktop.
    // In mobile mode, selectedId is NOT set by row click — only by autoAdvance or explicit action.
    // So toggle button is NOT visible until selectedId is explicitly set.
    expect(screen.queryByTestId('detail-panel-toggle')).not.toBeInTheDocument()

    // Explicitly set selectedId (simulates autoAdvance or explicit user action)
    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    expect(screen.getByTestId('detail-panel-toggle')).toBeInTheDocument()
    expect(screen.getByTestId('detail-panel-toggle')).toHaveAttribute(
      'aria-label',
      'Open finding detail',
    )

    // Click toggle to open drawer
    fireEvent.click(screen.getByTestId('detail-panel-toggle'))

    // Toggle button should HIDE now (mobileDrawerOpen=true)
    expect(screen.queryByTestId('detail-panel-toggle')).not.toBeInTheDocument()
  })

  it('[TA-G7][P1] mobile toggle button should NOT show when no findings (selectedId is null)', () => {
    // Arrange: mobile breakpoint with NO findings
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(false)
    mockUseIsMobile.mockReturnValue(true)

    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [] })}
      />,
    )

    // No findings → no auto-selection → selectedId is null → toggle NOT visible
    expect(screen.queryByTestId('detail-panel-toggle')).not.toBeInTheDocument()
  })

  it('[TA-G7][P1] toggle button should NOT show at desktop or laptop breakpoints', () => {
    const finding = buildFinding({ id: 'find1', severity: 'major' })

    // Desktop
    mockUseIsDesktop.mockReturnValue(true)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    const { rerender } = render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    expect(screen.queryByTestId('detail-panel-toggle')).not.toBeInTheDocument()

    // Laptop
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    rerender(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    expect(screen.queryByTestId('detail-panel-toggle')).not.toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // G8: Sheet open behavior — full sheetOpen truth table
  // ═══════════════════════════════════════════════════════════════════════

  it('[TA-G8][P2] Sheet open truth table: desktop=not rendered, laptop=auto-open on select, mobile=toggle-gated', () => {
    const finding = buildFinding({ id: 'find1', severity: 'major' })

    // ── Desktop: Sheet component is NOT rendered (aside is used instead) ──
    mockUseIsDesktop.mockReturnValue(true)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    findingDetailSheetProps.mockClear()
    const { unmount } = render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    // At desktop, FindingDetailSheet should NOT be called at all (it's the else branch)
    // The component renders aside, not Sheet
    const desktopCalls = findingDetailSheetProps.mock.calls
    // Filter calls that happened after selection (latest re-render)
    // At desktop the ternary picks aside, so Sheet is never mounted
    const desktopCallsWithOpenTrue = desktopCalls.filter(
      (call: Record<string, unknown>[]) => call[0]?.open === true,
    )
    expect(desktopCallsWithOpenTrue.length).toBe(0)

    unmount()
    useReviewStore.getState().resetForFile('test')

    // ── Laptop + selectedId: open=true ──
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    findingDetailSheetProps.mockClear()
    const { unmount: unmount2 } = render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    const laptopSelectedCall = findingDetailSheetProps.mock.calls.at(-1)?.[0]
    expect(laptopSelectedCall).toBeDefined()
    expect(laptopSelectedCall.open).toBe(true)
    expect(screen.getByTestId('mock-finding-detail-sheet')).toBeInTheDocument()

    // ── Laptop + no selection: open=false ──
    act(() => {
      useReviewStore.getState().setSelectedFinding(null)
    })

    const laptopNoSelectCall = findingDetailSheetProps.mock.calls.at(-1)?.[0]
    expect(laptopNoSelectCall.open).toBe(false)
    expect(screen.queryByTestId('mock-finding-detail-sheet')).not.toBeInTheDocument()

    unmount2()
    useReviewStore.getState().resetForFile('test')

    // ── Mobile + selectedId + mobileDrawerOpen=false: open=false ──
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(false)
    mockUseIsMobile.mockReturnValue(true)

    findingDetailSheetProps.mockClear()
    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    const mobileNoDrawerCall = findingDetailSheetProps.mock.calls.at(-1)?.[0]
    expect(mobileNoDrawerCall.open).toBe(false)
    expect(screen.queryByTestId('mock-finding-detail-sheet')).not.toBeInTheDocument()

    // ── Mobile + selectedId + after toggle: open=true ──
    const toggleButton = screen.getByTestId('detail-panel-toggle')
    fireEvent.click(toggleButton)

    const mobileAfterToggleCall = findingDetailSheetProps.mock.calls.at(-1)?.[0]
    expect(mobileAfterToggleCall.open).toBe(true)
    expect(screen.getByTestId('mock-finding-detail-sheet')).toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // G11: mobileDrawerOpen persists across breakpoint transition
  // ═══════════════════════════════════════════════════════════════════════

  it('[TA-G11][P2] mobileDrawerOpen should persist across breakpoint transition (mobile → desktop → mobile)', () => {
    const finding = buildFinding({ id: 'find1', severity: 'major' })
    // Use stable reference to prevent useEffect re-trigger on rerender
    const stableInitialData = buildInitialData({ findings: [finding] })

    // Start in mobile
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(false)
    mockUseIsMobile.mockReturnValue(true)

    const { rerender } = render(
      <ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={stableInitialData} />,
    )

    // Select finding
    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    // Toggle drawer open
    fireEvent.click(screen.getByTestId('detail-panel-toggle'))

    // Verify Sheet is open
    expect(screen.getByTestId('mock-finding-detail-sheet')).toBeInTheDocument()

    // Switch to desktop
    mockUseIsDesktop.mockReturnValue(true)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    rerender(
      <ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={stableInitialData} />,
    )

    // At desktop, aside is shown (not Sheet)
    expect(screen.getByRole('complementary')).toBeInTheDocument()

    // Switch back to mobile
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(false)
    mockUseIsMobile.mockReturnValue(true)

    findingDetailSheetProps.mockClear()
    rerender(
      <ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={stableInitialData} />,
    )

    // mobileDrawerOpen is useState — should persist across re-renders (not reset on breakpoint change)
    // Since selectedId is still set and mobileDrawerOpen persisted, Sheet should be open
    const lastCall = findingDetailSheetProps.mock.calls.at(-1)?.[0]
    expect(lastCall).toBeDefined()
    expect(lastCall.open).toBe(true)
    expect(screen.getByTestId('mock-finding-detail-sheet')).toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // G13: handleSheetChange close + no-op
  // ═══════════════════════════════════════════════════════════════════════

  it('[TA-G13][P2] onOpenChange(false) at laptop should clear selectedFinding', () => {
    const finding = buildFinding({ id: 'find1', severity: 'major' })

    // Laptop mode
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    // Select finding
    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    // Verify Sheet is open
    expect(screen.getByTestId('mock-finding-detail-sheet')).toBeInTheDocument()

    // Capture onOpenChange callback from the latest Sheet render
    const lastCall = findingDetailSheetProps.mock.calls.at(-1)?.[0]
    expect(lastCall.onOpenChange).toBeDefined()
    const onOpenChange = lastCall.onOpenChange as (open: boolean) => void

    // Call onOpenChange(false) — simulates user closing the Sheet
    act(() => {
      onOpenChange(false)
    })

    // selectedFinding should be cleared
    expect(useReviewStore.getState().selectedId).toBeNull()
    // Sheet should now be closed (open=false because selectedId=null)
    expect(screen.queryByTestId('mock-finding-detail-sheet')).not.toBeInTheDocument()
  })

  it('[TA-G13][P2] onOpenChange(false) at mobile should clear selectedFinding AND mobileDrawerOpen', () => {
    const finding = buildFinding({ id: 'find1', severity: 'major' })

    // Mobile mode
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(false)
    mockUseIsMobile.mockReturnValue(true)

    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    // Select finding and open drawer
    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })
    fireEvent.click(screen.getByTestId('detail-panel-toggle'))

    // Verify Sheet is open
    expect(screen.getByTestId('mock-finding-detail-sheet')).toBeInTheDocument()

    // Capture onOpenChange
    const lastCall = findingDetailSheetProps.mock.calls.at(-1)?.[0]
    const onOpenChange = lastCall.onOpenChange as (open: boolean) => void

    // Call onOpenChange(false)
    act(() => {
      onOpenChange(false)
    })

    // selectedFinding AND mobileDrawerOpen should be cleared
    expect(useReviewStore.getState().selectedId).toBeNull()
    // Sheet closed
    expect(screen.queryByTestId('mock-finding-detail-sheet')).not.toBeInTheDocument()
    // Toggle button also hidden (selectedId is null)
    expect(screen.queryByTestId('detail-panel-toggle')).not.toBeInTheDocument()
  })

  it('[TA-G13][P2] onOpenChange(true) should be a no-op (no state changes)', () => {
    const finding = buildFinding({ id: 'find1', severity: 'major' })

    // Laptop mode
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    // Select finding
    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    // Capture onOpenChange
    const lastCall = findingDetailSheetProps.mock.calls.at(-1)?.[0]
    const onOpenChange = lastCall.onOpenChange as (open: boolean) => void

    // Call onOpenChange(true) — should be no-op
    act(() => {
      onOpenChange(true)
    })

    // selectedFinding should remain
    expect(useReviewStore.getState().selectedId).toBe('find1')
    // Sheet still open
    expect(screen.getByTestId('mock-finding-detail-sheet')).toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // G14: selectedId persists across desktop↔laptop transition
  // ═══════════════════════════════════════════════════════════════════════

  it('[TA-G14][P2] selectedId should persist when switching from desktop to laptop', () => {
    const finding = buildFinding({ id: 'find1', severity: 'major' })
    // Use stable reference to prevent useEffect re-trigger on rerender
    const stableInitialData = buildInitialData({ findings: [finding] })

    // Start in desktop
    mockUseIsDesktop.mockReturnValue(true)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    const { rerender } = render(
      <ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={stableInitialData} />,
    )

    // Select finding in desktop mode
    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    // Verify aside is showing the content
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(useReviewStore.getState().selectedId).toBe('find1')

    // Switch to laptop
    mockUseIsDesktop.mockReturnValue(false)
    mockUseIsLaptop.mockReturnValue(true)
    mockUseIsMobile.mockReturnValue(false)

    findingDetailSheetProps.mockClear()
    rerender(
      <ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={stableInitialData} />,
    )

    // selectedId should persist in store
    expect(useReviewStore.getState().selectedId).toBe('find1')

    // Sheet should auto-open with the selected finding (laptop: sheetOpen = selectedId !== null)
    const lastCall = findingDetailSheetProps.mock.calls.at(-1)?.[0]
    expect(lastCall).toBeDefined()
    expect(lastCall.open).toBe(true)
    expect(screen.getByTestId('mock-finding-detail-sheet')).toBeInTheDocument()
  })
})
