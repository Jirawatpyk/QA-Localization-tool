/**
 * TDD GREEN PHASE — Story 4.0: Review Infrastructure Setup
 * Component: ReviewPageClient — ARIA Foundation, Layout, reduced-motion
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

// Mock Realtime subscription hooks to no-op
const mockUseFindingsSubscription = vi.fn()
const mockUseScoreSubscription = vi.fn()
const mockUseThresholdSubscription = vi.fn()

vi.mock('@/features/review/hooks/use-findings-subscription', () => ({
  useFindingsSubscription: (...args: unknown[]) => mockUseFindingsSubscription(...args),
}))
vi.mock('@/features/review/hooks/use-score-subscription', () => ({
  useScoreSubscription: (...args: unknown[]) => mockUseScoreSubscription(...args),
}))
vi.mock('@/features/review/hooks/use-threshold-subscription', () => ({
  useThresholdSubscription: (...args: unknown[]) => mockUseThresholdSubscription(...args),
}))
vi.mock('@/features/pipeline/actions/retryAiAnalysis.action', () => ({
  retryAiAnalysis: vi.fn((..._args: unknown[]) =>
    Promise.resolve({ success: true, data: { retriedLayers: [] } }),
  ),
}))
vi.mock('@/features/review/actions/approveFile.action', () => ({
  approveFile: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: null })),
}))

// Mock announce utility
const mockMountAnnouncer = vi.fn()
const mockAnnounce = vi.fn()
const mockUnmountAnnouncer = vi.fn()

vi.mock('@/features/review/utils/announce', () => ({
  mountAnnouncer: (...args: unknown[]) => mockMountAnnouncer(...args),
  announce: (...args: unknown[]) => mockAnnounce(...args),
  unmountAnnouncer: (...args: unknown[]) => mockUnmountAnnouncer(...args),
}))

import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { ReviewPageClient } from '@/features/review/components/ReviewPageClient'
import { useReviewStore } from '@/features/review/stores/review.store'
import { buildFinding } from '@/test/factories'
import type { DbFileStatus } from '@/types/pipeline'

// Setup matchMedia for useReducedMotion
function setupMatchMedia(prefersReducedMotion = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? prefersReducedMotion : false,
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

// ── ARIA Foundation Tests ──

describe('ReviewPageClient — Story 4.0 ARIA Foundation', () => {
  beforeEach(() => {
    setupMatchMedia(false)
    useReviewStore.getState().resetForFile('test')
  })

  it('[P0] A1: should have role=grid and aria-label on finding list container', () => {
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

    const grid = screen.getByRole('grid', { name: 'Finding list' })
    expect(grid).toBeDefined()
    expect(grid.getAttribute('aria-label')).toBe('Finding list')
  })

  it('[P0] A2: should mount aria-live container before injecting content', () => {
    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData()}
      />,
    )

    // mountAnnouncer is called on mount
    expect(mockMountAnnouncer).toHaveBeenCalled()

    // Score live region exists
    const scoreLiveRegion = screen.getByTestId('score-live-region')
    expect(scoreLiveRegion.getAttribute('aria-live')).toBe('polite')
  })

  it('[P1] A3: should toggle aria-expanded on finding compact row click', async () => {
    const user = userEvent.setup()
    const finding = buildFinding({
      id: 'find1',
      description:
        'A very long description that exceeds one hundred characters and needs truncation for proper display in the finding list item component view text',
      sourceTextExcerpt: 'Source text',
    })

    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    // FindingCardCompact row has aria-expanded on the row itself
    const row = screen.getByTestId('finding-compact-row')
    expect(row.getAttribute('aria-expanded')).toBe('false')

    await user.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
  })

  it('[P1] A4: should apply focus ring CSS with correct outline spec', () => {
    const finding = buildFinding({ id: 'find1' })

    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData({ findings: [finding] })}
      />,
    )

    // Finding row should have focus-visible classes
    const row = screen.getByRole('row')
    expect(row.className).toContain('focus-visible:outline-2')
    expect(row.className).toContain('focus-visible:outline-primary')
    expect(row.className).toContain('focus-visible:outline-offset-4')
  })

  it('[P2] A5: should debounce rapid announcements in announce utility', async () => {
    vi.useFakeTimers()

    // Import real module (bypassing mock) to test actual debounce behavior
    const actual = await vi.importActual<typeof import('@/features/review/utils/announce')>(
      '@/features/review/utils/announce',
    )

    actual.mountAnnouncer()

    // Fire 3 rapid polite announcements — only last should survive debounce
    actual.announce('Message 1', 'polite')
    actual.announce('Message 2', 'polite')
    actual.announce('Message 3', 'polite')

    // Advance past debounce (150ms) + requestAnimationFrame
    await vi.advanceTimersByTimeAsync(200)

    const politeEl = document.getElementById('sr-announcer')
    expect(politeEl).not.toBeNull()
    expect(politeEl!.textContent).toBe('Message 3')

    // Assertive bypasses debounce — immediate
    actual.announce('Error!', 'assertive')
    await vi.advanceTimersByTimeAsync(20) // rAF tick

    const assertiveEl = document.getElementById('sr-announcer-assertive')
    expect(assertiveEl).not.toBeNull()
    expect(assertiveEl!.textContent).toBe('Error!')

    actual.unmountAnnouncer()
    vi.useRealTimers()
  })
})

// ── Layout Tests ──

describe('ReviewPageClient — Story 4.0 Layout', () => {
  beforeEach(() => {
    setupMatchMedia(false)
    useReviewStore.getState().resetForFile('test')
  })

  it('[P0] L1: should open FindingDetailSheet when finding selected in store', async () => {
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

    // Sheet should not be open initially
    expect(screen.queryByTestId('finding-detail-sheet')).toBeNull()

    // Select a finding in store — triggers re-render via Zustand subscription
    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    // Sheet renders via Radix portal — wait for DOM update
    await waitFor(() => {
      expect(screen.getByTestId('finding-detail-sheet')).toBeDefined()
    })

    // Sheet should have role="complementary" (Guardrail #38)
    const sheet = screen.getByTestId('finding-detail-sheet')
    expect(sheet.getAttribute('role')).toBe('complementary')
  })

  it('[P1] L2: should not render global DetailPanel content on review page', () => {
    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData()}
      />,
    )

    // Global detail panel is rendered by (app)/layout.tsx, not by ReviewPageClient
    // Review page uses Sheet exclusively
    expect(screen.queryByTestId('global-detail-panel')).toBeNull()
  })

  it('[P0] L3: should render 3-zone layout with nav, finding list, and sheet zones', () => {
    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData()}
      />,
    )

    // Zone 1: nav
    const nav = screen.getByRole('navigation', { name: /file navigation/i })
    expect(nav).toBeDefined()

    // Zone 2: finding list (grid)
    const grid = screen.getByRole('grid', { name: /finding list/i })
    expect(grid).toBeDefined()

    // 3-zone container
    const container = screen.getByTestId('review-3-zone')
    expect(container).toBeDefined()
  })

  it('[P0] L4: should maintain Realtime subscriptions after layout refactor', () => {
    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData()}
      />,
    )

    expect(mockUseFindingsSubscription).toHaveBeenCalledWith('f1', 't1')
    expect(mockUseScoreSubscription).toHaveBeenCalledWith('f1', 't1')
    expect(mockUseThresholdSubscription).toHaveBeenCalledWith('en-US', 'th-TH', 't1')
  })

  it('[P1] L5: should not auto-focus any element on mount', () => {
    render(
      <ReviewPageClient
        fileId="f1"
        projectId="p1"
        tenantId="t1"
        initialData={buildInitialData()}
      />,
    )

    // No auto-focus — activeElement should be body (Guardrail #40)
    expect(document.activeElement).toBe(document.body)
  })
})

// ── Reduced Motion Tests ──

describe('ReviewPageClient — Story 4.0 reduced-motion', () => {
  beforeEach(() => {
    useReviewStore.getState().resetForFile('test')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('[P1] RM1: should render Sheet without slide transition when prefers-reduced-motion', async () => {
    setupMatchMedia(true)

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

    // Select a finding AFTER render (so resetForFile has already run)
    act(() => {
      useReviewStore.getState().setSelectedFinding('find1')
    })

    // Sheet renders via Radix portal — wait for DOM update
    await waitFor(() => {
      expect(screen.getByTestId('finding-detail-sheet')).toBeDefined()
    })

    // Sheet should have reduced-motion CSS classes (Guardrail #37)
    const sheet = screen.getByTestId('finding-detail-sheet')
    expect(sheet.className).toContain('duration-0')
    expect(sheet.className).toContain('animate-none')
  })
})
