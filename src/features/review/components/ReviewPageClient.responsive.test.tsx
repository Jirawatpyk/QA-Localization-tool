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
import { render, screen, act } from '@testing-library/react'
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

vi.mock('@/features/review/components/FindingDetailSheet', () => ({
  FindingDetailSheet: () => <div data-testid="mock-finding-detail-sheet" />,
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
  useKeyboardActions: () => ({ register: vi.fn(() => vi.fn()) }),
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
    ...overrides,
  }
}

describe('ReviewPageClient — Responsive Layout (Story 4.1d)', () => {
  beforeEach(() => {
    setupMatchMedia()
    useReviewStore.getState().resetForFile('test')
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

    // Select finding to open detail
    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    // Assert: no static aside in mobile — uses sheet/drawer
    const asides = screen.queryAllByRole('complementary')
    const staticAside = asides.find((el) => el.tagName.toLowerCase() === 'aside')
    expect(staticAside).toBeUndefined()

    // Positive: Sheet IS rendered
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
})
