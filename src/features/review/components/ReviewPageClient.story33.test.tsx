/** Story 3.3 ATDD — AC6: ReviewPageClient L1L2L3 State Mapping — RED PHASE (TDD) */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// eslint-disable-next-line import/order -- vi.mock hoisting splits internal imports
import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'

vi.mock('server-only', () => ({}))

// Mock dependencies before importing the component
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
  announce: vi.fn(),
  mountAnnouncer: vi.fn(),
  unmountAnnouncer: vi.fn(),
}))
vi.mock('@/features/review/hooks/use-keyboard-actions', () => ({
  useReviewHotkeys: vi.fn(),
  useKeyboardActions: () => ({ register: vi.fn(() => vi.fn()) }),
}))
vi.mock('@/features/review/hooks/use-focus-management', () => ({
  useFocusManagement: () => ({
    pushEscapeLayer: vi.fn(),
    popEscapeLayer: vi.fn(),
    autoAdvance: vi.fn(),
    focusActionBar: vi.fn(),
  }),
}))

vi.mock('@/features/pipeline/actions/retryAiAnalysis.action', () => ({
  retryAiAnalysis: vi.fn((..._args: unknown[]) =>
    Promise.resolve({ success: true, data: { retriedLayers: [] } }),
  ),
}))
vi.mock('@/features/review/actions/acceptFinding.action', () => ({
  acceptFinding: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: {} })),
}))
vi.mock('@/features/review/actions/rejectFinding.action', () => ({
  rejectFinding: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: {} })),
}))
vi.mock('@/features/review/actions/flagFinding.action', () => ({
  flagFinding: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: {} })),
}))
vi.mock('@/features/review/stores/review.store', () => {
  const mockResetForFile = vi.fn()
  const mockSetFinding = vi.fn()
  const mockUpdateScore = vi.fn()
  const storeState = {
    resetForFile: mockResetForFile,
    setFindings: mockSetFinding,
    setFinding: vi.fn(),
    findingsMap: new Map(),
    currentScore: null,
    layerCompleted: null,
    scoreStatus: null,
    updateScore: mockUpdateScore,
    l2ConfidenceMin: null,
    l3ConfidenceMin: null,
    selectedId: null,
    setSelectedFinding: vi.fn(),
  }
  return {
    useReviewStore: Object.assign(
      vi.fn((selector?: (state: Record<string, unknown>) => unknown) =>
        selector ? selector(storeState) : storeState,
      ),
      {
        getState: vi.fn(() => storeState),
      },
    ),
  }
})

import { ReviewPageClient } from '@/features/review/components/ReviewPageClient'
import type { LayerCompleted } from '@/types/finding'

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
    tenantId: 't1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
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
    l3ConfidenceMin: null,
    processingMode: 'thorough',
    autoPassRationale: null,
    sourceLang: 'en-US',
    targetLang: 'th-TH',
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
        tenantId="t1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d"
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

  it('[P1] U27: should show AI complete in ReviewProgress when l3_completed (thorough mode)', () => {
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
        tenantId="t1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d"
        initialData={initialData}
      />,
    )

    // Dual-track ReviewProgress: AI track should show complete status with checkmark
    const aiTrack = screen.getByTestId('ai-status-track')
    expect(aiTrack).toHaveTextContent(/AI: complete/i)
    expect(aiTrack).toHaveTextContent(/✓/)
  })
})
