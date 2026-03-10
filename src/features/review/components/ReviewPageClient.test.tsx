/**
 * TA: Coverage Gap Tests — Story 3.2c
 * Gap #14: deriveScoreBadgeState branches (pure function inside ReviewPageClient)
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

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

// Mock Story 4.0 components — not under test in this suite
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

import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { ReviewPageClient } from '@/features/review/components/ReviewPageClient'
import { useReviewStore } from '@/features/review/stores/review.store'

// Setup matchMedia for useReducedMotion (ScoreBadge dependency)
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
    ...overrides,
  }
}

describe('ReviewPageClient — deriveScoreBadgeState', () => {
  beforeEach(() => {
    useReviewStore.getState().resetForFile('test')
  })

  it('[P1] should render ScoreBadge with "Rule-based" when layerCompleted=L1', () => {
    const data = buildInitialData({
      score: {
        mqmScore: 90,
        status: 'calculated',
        layerCompleted: 'L1',
        criticalCount: 0,
        majorCount: 0,
        minorCount: 1,
      },
    })

    render(<ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={data} />)

    expect(screen.getByTestId('score-badge')).toHaveTextContent('Rule-based')
  })

  it('[P1] should render ScoreBadge with "AI Screened" when layerCompleted=L1L2', () => {
    const data = buildInitialData({
      score: {
        mqmScore: 85,
        status: 'calculated',
        layerCompleted: 'L1L2',
        criticalCount: 0,
        majorCount: 1,
        minorCount: 0,
      },
    })

    render(<ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={data} />)

    expect(screen.getByTestId('score-badge')).toHaveTextContent('AI Screened')
  })

  it('[P1] should render ScoreBadge without state label when layerCompleted=null', () => {
    const data = buildInitialData({
      score: {
        mqmScore: null,
        status: 'na',
        layerCompleted: null,
        criticalCount: 0,
        majorCount: 0,
        minorCount: 0,
      },
    })

    render(<ReviewPageClient fileId="f1" projectId="p1" tenantId="t1" initialData={data} />)

    // layerCompleted=null → badgeState=undefined → no state label
    const badge = screen.getByTestId('score-badge')
    expect(badge).not.toHaveTextContent('Rule-based')
    expect(badge).not.toHaveTextContent('AI Screened')
    expect(badge).not.toHaveTextContent('Deep Analyzed')
    expect(badge).not.toHaveTextContent('Partial')
  })
})
