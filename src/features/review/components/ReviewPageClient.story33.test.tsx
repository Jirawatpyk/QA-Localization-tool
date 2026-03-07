/** Story 3.3 ATDD — AC6: ReviewPageClient L1L2L3 State Mapping — RED PHASE (TDD) */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { ScoreBadgeState, LayerCompleted } from '@/types/finding'
import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'

// Mock dependencies before importing the component
vi.mock('@/features/review/hooks/use-findings-subscription', () => ({
  useFindingsSubscription: vi.fn(),
}))
vi.mock('@/features/review/hooks/use-score-subscription', () => ({
  useScoreSubscription: vi.fn(),
}))
vi.mock('@/features/review/stores/review.store', () => {
  const mockResetForFile = vi.fn()
  const mockSetFinding = vi.fn()
  const mockUpdateScore = vi.fn()
  return {
    useReviewStore: vi.fn((selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        resetForFile: mockResetForFile,
        setFinding: mockSetFinding,
        findingsMap: new Map(),
        currentScore: null,
        layerCompleted: null,
        updateScore: mockUpdateScore,
      }),
    ),
  }
})

import { ReviewPageClient } from '@/features/review/components/ReviewPageClient'

// Helper to mock prefers-reduced-motion (required by ScoreBadge)
function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
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
    file: {
      fileId: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      fileName: 'test-file.sdlxliff',
      status: 'l3_completed',
    },
    findings: [],
    score: {
      mqmScore: 88.5,
      status: 'calculated',
      layerCompleted: 'L1L2L3' as LayerCompleted,
    },
    l2ConfidenceMin: 70,
    processingMode: 'thorough',
    ...overrides,
  } as FileReviewData
}

describe('ReviewPageClient — Story 3.3: L1L2L3 State Mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReducedMotion(false)
  })

  it('[P0] U26: should map layerCompleted=L1L2L3 to ScoreBadge state=deep-analyzed (NOT ai-screened)', () => {
    const initialData = buildInitialData({
      score: {
        mqmScore: 88.5,
        status: 'calculated',
        layerCompleted: 'L1L2L3',
      },
    } as Partial<FileReviewData>)

    render(
      <ReviewPageClient
        fileId="f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d"
        projectId="p1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d"
        initialData={initialData}
      />,
    )

    // The ScoreBadge should show 'Deep Analyzed' not 'AI Screened'
    const scoreBadge = screen.getByTestId('score-badge')
    expect(scoreBadge.className).toMatch(/deep-analyzed/)
    expect(scoreBadge.className).not.toMatch(/ai-screened/)
    // Label should say "Deep Analyzed"
    expect(screen.getByText('Deep Analyzed')).toBeTruthy()
    expect(screen.queryByText('AI Screened')).toBeNull()
  })

  it('[P1] U27: should show L3 checkmark in ReviewProgress when layerCompleted includes L3', () => {
    const initialData = buildInitialData({
      file: {
        fileId: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
        fileName: 'test-file.sdlxliff',
        status: 'l3_completed',
      },
      score: {
        mqmScore: 90.0,
        status: 'calculated',
        layerCompleted: 'L1L2L3',
      },
      processingMode: 'thorough',
    } as Partial<FileReviewData>)

    render(
      <ReviewPageClient
        fileId="f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d"
        projectId="p1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d"
        initialData={initialData}
      />,
    )

    // ReviewProgress should show L3 step as complete
    const l3Status = screen.getByTestId('layer-status-L3')
    // L3 should show checkmark (complete status) with data-completed="true"
    expect(l3Status.getAttribute('data-completed')).toBe('true')
    expect(l3Status).toHaveTextContent(/complete|check/i)
  })
})
