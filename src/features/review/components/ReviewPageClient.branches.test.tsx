/**
 * Branch coverage tests — ReviewPageClient
 * Covers: getLayoutMode, deriveScoreBadgeState partial/calculating,
 * partialWarningText, isAiPending, native reviewer banner, sheetOpen logic
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// Mock Realtime subscription hooks to no-op
vi.mock('@/features/review/hooks/use-findings-subscription', () => ({
  useFindingsSubscription: vi.fn(),
}))
vi.mock('@/features/review/hooks/use-score-subscription', () => ({
  useScoreSubscription: vi.fn(),
}))
vi.mock('@/features/review/hooks/use-threshold-subscription', () => ({
  useThresholdSubscription: vi.fn(),
}))

vi.mock('@/features/review/components/FindingDetailSheet', () => ({
  FindingDetailSheet: () => null,
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

// Dynamic responsive mock — override per test
const mockIsDesktop = vi.fn(() => false)
const mockIsLaptop = vi.fn(() => false)
const mockIsXl = vi.fn(() => false)
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
  useIsDesktop: (...args: unknown[]) => mockIsDesktop(...(args as [])),
  useIsLaptop: (...args: unknown[]) => mockIsLaptop(...(args as [])),
  useIsMobile: vi.fn(() => false),
  useIsXl: (...args: unknown[]) => mockIsXl(...(args as [])),
}))

import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { ReviewPageClient } from '@/features/review/components/ReviewPageClient'
import { useReviewStore } from '@/features/review/stores/review.store'

beforeEach(() => {
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
  mockIsDesktop.mockReturnValue(false)
  mockIsLaptop.mockReturnValue(false)
  mockIsXl.mockReturnValue(false)
  useReviewStore.getState().resetForFile('test')
})

function buildInitialData(overrides?: Partial<FileReviewData>): FileReviewData {
  return {
    tenantId: 't1',
    file: { fileId: 'f1', fileName: 'test.sdlxliff', status: 'l2_completed' as never },
    findings: [],
    score: {
      mqmScore: 85,
      status: 'calculated',
      layerCompleted: 'L1L2',
      criticalCount: 0,
      majorCount: 1,
      minorCount: 2,
    },
    processingMode: 'economy' as never,
    l2ConfidenceMin: 70,
    l3ConfidenceMin: null,
    autoPassRationale: null,
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    segments: [],
    categories: [],
    overrideCounts: {},
    siblingFiles: [],
    isNonNative: false,
    btConfidenceThreshold: 0.6,
    userRole: 'qa_reviewer',
    assignedFindingCount: 0,
    ...overrides,
  }
}

// ── getLayoutMode branches ──

describe('ReviewPageClient — layout mode branches', () => {
  it('should set data-layout-mode="mobile" when neither desktop nor laptop', () => {
    mockIsDesktop.mockReturnValue(false)
    mockIsLaptop.mockReturnValue(false)
    mockIsXl.mockReturnValue(false)
    const data = buildInitialData()

    render(<ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={data} />)

    // S-FIX-4: data-layout-mode is on the outer wrapper, not review-3-zone
    const el = document.querySelector('[data-layout-mode]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.getAttribute('data-layout-mode')).toBe('mobile')
  })

  it('should set data-layout-mode="laptop" when isLaptop but not desktop', () => {
    mockIsDesktop.mockReturnValue(false)
    mockIsLaptop.mockReturnValue(true)
    mockIsXl.mockReturnValue(true)
    const data = buildInitialData()

    render(<ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={data} />)

    const el = document.querySelector('[data-layout-mode]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.getAttribute('data-layout-mode')).toBe('laptop')
  })

  it('should set data-layout-mode="desktop" when isDesktop', () => {
    mockIsDesktop.mockReturnValue(true)
    mockIsLaptop.mockReturnValue(true) // both true = desktop wins
    mockIsXl.mockReturnValue(true)
    const data = buildInitialData()

    render(<ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={data} />)

    const el = document.querySelector('[data-layout-mode]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.getAttribute('data-layout-mode')).toBe('desktop')
  })
})

// ── deriveScoreBadgeState: calculating + partial branches ──

describe('ReviewPageClient — deriveScoreBadgeState branches', () => {
  it('should show "Analyzing" badge when scoreStatus=calculating', () => {
    const data = buildInitialData({
      score: {
        mqmScore: 85,
        status: 'calculating',
        layerCompleted: 'L1L2',
        criticalCount: 0,
        majorCount: 1,
        minorCount: 0,
      },
    })

    render(<ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={data} />)

    expect(screen.getByTestId('score-badge')).toHaveTextContent('Analyzing')
  })

  it('should show "Partial" badge when scoreStatus=partial (takes priority over layer)', () => {
    const data = buildInitialData({
      score: {
        mqmScore: 80,
        status: 'partial',
        layerCompleted: 'L1L2',
        criticalCount: 0,
        majorCount: 1,
        minorCount: 0,
      },
    })

    render(<ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={data} />)

    expect(screen.getByTestId('score-badge')).toHaveTextContent('Partial')
  })

  it('should show "Deep Analyzed" badge when layerCompleted=L1L2L3', () => {
    const data = buildInitialData({
      score: {
        mqmScore: 92,
        status: 'calculated',
        layerCompleted: 'L1L2L3',
        criticalCount: 0,
        majorCount: 0,
        minorCount: 1,
      },
    })

    render(<ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={data} />)

    expect(screen.getByTestId('score-badge')).toHaveTextContent('Deep Analyzed')
  })
})

// ── partialWarningText branches ──

describe('ReviewPageClient — partial warning text branches', () => {
  it('should show L3 unavailable warning when partial + L1L2 + thorough mode', () => {
    const data = buildInitialData({
      processingMode: 'thorough' as never,
      score: {
        mqmScore: 80,
        status: 'partial',
        layerCompleted: 'L1L2',
        criticalCount: 0,
        majorCount: 1,
        minorCount: 0,
      },
    })

    render(<ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={data} />)

    expect(screen.getByText('Deep analysis unavailable — showing screening results')).toBeTruthy()
  })

  it('should show AI unavailable warning when partial + L1 only', () => {
    const data = buildInitialData({
      score: {
        mqmScore: 90,
        status: 'partial',
        layerCompleted: 'L1',
        criticalCount: 0,
        majorCount: 0,
        minorCount: 1,
      },
    })

    render(<ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={data} />)

    expect(screen.getByText('AI analysis unavailable — showing rule-based results')).toBeTruthy()
  })
})

// ── Native reviewer banner ──

describe('ReviewPageClient — native reviewer branch', () => {
  it('should show native reviewer banner when userRole=native_reviewer and assignedFindingCount > 0', () => {
    const data = buildInitialData({
      userRole: 'native_reviewer',
      assignedFindingCount: 3,
    })

    render(<ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={data} />)

    expect(screen.getByText(/You have access to 3 flagged segments/)).toBeTruthy()
  })

  it('should NOT show native reviewer banner when assignedFindingCount=0', () => {
    const data = buildInitialData({
      userRole: 'native_reviewer',
      assignedFindingCount: 0,
    })

    render(<ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={data} />)

    expect(screen.queryByText(/You have access to/)).toBeNull()
  })
})
