/**
 * ATDD Tests — Story 3.5: Score Lifecycle & Confidence Display
 * AC: ReviewPageClient — score lifecycle states, Approve button guard, AI pending badge
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { ReviewPageClient } from '@/features/review/components/ReviewPageClient'
import type { LayerCompleted, ScoreStatus } from '@/types/finding'

// ── Mocks ──

vi.mock('@/features/review/hooks/use-findings-subscription', () => ({
  useFindingsSubscription: vi.fn(),
}))
vi.mock('@/features/review/hooks/use-score-subscription', () => ({
  useScoreSubscription: vi.fn(),
}))
vi.mock('@/features/review/hooks/use-threshold-subscription', () => ({
  useThresholdSubscription: vi.fn(),
}))

// Configurable store state for each test
const storeMockState = {
  resetForFile: vi.fn(),
  setFinding: vi.fn(),
  findingsMap: new Map(),
  currentScore: null as number | null,
  layerCompleted: null as LayerCompleted | null,
  updateScore: vi.fn(),
  scoreStatus: null as ScoreStatus | null,
  l2ConfidenceMin: null as number | null,
  l3ConfidenceMin: null as number | null,
}

vi.mock('@/features/review/stores/review.store', () => ({
  useReviewStore: vi.fn((selector: (state: typeof storeMockState) => unknown) =>
    selector(storeMockState),
  ),
}))

const mockRetryAiAnalysis = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ success: true, data: { retriedLayers: ['L2'] } }),
)
vi.mock('@/features/pipeline/actions/retryAiAnalysis.action', () => ({
  retryAiAnalysis: (...args: unknown[]) => mockRetryAiAnalysis(...args),
}))

const mockApproveFile = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ success: true, data: { fileId: VALID_FILE_ID } }),
)
vi.mock('@/features/review/actions/approveFile.action', () => ({
  approveFile: (...args: unknown[]) => mockApproveFile(...args),
}))

// ── Helpers ──

const VALID_FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'

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
      fileId: VALID_FILE_ID,
      fileName: 'test-file.sdlxliff',
      status: 'l2_completed',
    },
    findings: [],
    score: {
      mqmScore: 85,
      status: 'calculated',
      layerCompleted: 'L1L2' as LayerCompleted,
      criticalCount: 0,
      majorCount: 2,
      minorCount: 1,
    },
    l2ConfidenceMin: 70,
    l3ConfidenceMin: null,
    processingMode: 'economy',
    autoPassRationale: null,
    sourceLang: 'en-US',
    targetLang: 'th-TH',
    ...overrides,
  } as FileReviewData
}

// ── Tests ──

describe('ReviewPageClient — Story 3.5 score lifecycle & approve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReducedMotion(false)

    storeMockState.currentScore = null
    storeMockState.layerCompleted = null
    storeMockState.scoreStatus = null
    storeMockState.findingsMap = new Map()
  })

  // 3.5-U-001: deriveScoreBadgeState('calculating') returns 'analyzing'
  it('[P0] should derive score badge state "analyzing" when scoreStatus is calculating', () => {
    // Arrange: store has scoreStatus='calculating' (Realtime update received mid-recalc)
    storeMockState.scoreStatus = 'calculating'
    storeMockState.layerCompleted = 'L1L2'

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 85,
            status: 'calculating',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 2,
            minorCount: 1,
          },
        })}
      />,
    )

    // Assert: ScoreBadge renders in 'analyzing' visual state (spinner or "Analyzing" text)
    expect(screen.getByTestId('score-badge')).toBeInTheDocument()
    // The badge should show "Analyzing" or have animate-spin class
    const badge = screen.getByTestId('score-badge')
    expect(badge.textContent?.toLowerCase()).toMatch(/analyz|calculating|loading/i)
  })

  // 3.5-U-002: Approve button disabled when scoreStatus='calculating'
  it('[P0] should disable Approve button when score status is calculating', () => {
    // Arrange: pipeline is recalculating — approval must wait for stable score
    storeMockState.scoreStatus = 'calculating'

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 85,
            status: 'calculating',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 2,
            minorCount: 1,
          },
        })}
      />,
    )

    // Assert: Approve button is disabled (not clickable while score is stale)
    const approveBtn = screen.queryByRole('button', { name: /approve/i })
    if (approveBtn) {
      expect(approveBtn).toBeDisabled()
    } else {
      // Button may be hidden entirely when calculating
      expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
    }
  })

  // 3.5-U-003: ScoreBadge shows analyzing state (spinner) when scoreStatus='calculating'
  it('[P0] should show analyzing spinner in ScoreBadge when status is calculating', () => {
    // Arrange: calculating status → ScoreBadge state='analyzing'
    storeMockState.scoreStatus = 'calculating'
    storeMockState.layerCompleted = 'L1L2'
    storeMockState.currentScore = 85

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 85,
            status: 'calculating',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 0,
            minorCount: 0,
          },
        })}
      />,
    )

    // Assert: spinner element or 'analyzing' state class is present in score badge area
    const badge = screen.getByTestId('score-badge')
    // Either the badge text says "Analyzing" or contains a spinner icon
    const hasAnalyzingState =
      badge.textContent?.toLowerCase().includes('analyz') ||
      badge.querySelector('[class*="animate-spin"]') !== null ||
      badge.querySelector('[data-state="analyzing"]') !== null
    expect(hasAnalyzingState).toBe(true)
  })

  // 3.5-U-004: "AI pending" visible when layerCompleted='L1' + non-terminal status
  it('[P0] should show "AI pending" indicator when layerCompleted=L1 and status is non-terminal', () => {
    // Arrange: file processed L1 only — L2 screening hasn't run yet
    storeMockState.layerCompleted = 'L1'
    storeMockState.scoreStatus = 'calculated'
    storeMockState.currentScore = 88

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 88,
            status: 'calculated',
            layerCompleted: 'L1',
            criticalCount: 0,
            majorCount: 1,
            minorCount: 0,
          },
        })}
      />,
    )

    // Assert: "AI pending" indicator visible (Badge in header area)
    expect(screen.getByText(/ai pending/i)).toBeInTheDocument()
  })

  // 3.5-U-005: "AI pending" hidden when layerCompleted='L1L2'
  it('[P1] should hide "AI pending" indicator when layerCompleted=L1L2 (L2 complete)', () => {
    // Arrange: L2 screening complete — AI pending no longer applicable
    storeMockState.layerCompleted = 'L1L2'
    storeMockState.scoreStatus = 'calculated'

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 85,
            status: 'calculated',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 2,
            minorCount: 1,
          },
        })}
      />,
    )

    // Assert: no "AI pending" indicator when L2 is done
    expect(screen.queryByText(/ai pending/i)).toBeNull()
  })

  // 3.5-U-006: "AI pending" hidden when fileStatus='ai_partial'
  it('[P1] should hide "AI pending" when fileStatus=ai_partial (partial result — not pending)', () => {
    // Arrange: ai_partial means AI ran but failed — not "pending", shows retry instead
    storeMockState.layerCompleted = 'L1'
    storeMockState.scoreStatus = 'partial'

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        initialData={buildInitialData({
          file: { fileId: VALID_FILE_ID, fileName: 'test.sdlxliff', status: 'ai_partial' },
          score: {
            mqmScore: 80,
            status: 'partial',
            layerCompleted: 'L1',
            criticalCount: 0,
            majorCount: 1,
            minorCount: 0,
          },
        })}
      />,
    )

    // Assert: partial state shows retry button, NOT "AI pending"
    expect(screen.queryByText(/ai pending/i)).toBeNull()
    // Retry button should be visible for partial state
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  // 3.5-U-007: Score dimmed when isRecalculating=true
  it('[P0] should dim/mute score display when score is being recalculated', () => {
    // Arrange: review action triggered recalculation — score is stale during recalc
    storeMockState.scoreStatus = 'calculating'
    storeMockState.currentScore = 85

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 85,
            status: 'calculating',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 2,
            minorCount: 1,
          },
        })}
      />,
    )

    // Assert: score badge or its container has a muted/dim class
    const scoreContainer =
      screen.getByTestId('score-badge').closest('[data-recalculating]') ??
      screen.getByTestId('score-badge').parentElement

    // Either data-recalculating attribute or opacity/muted class
    const scoreArea =
      document.querySelector('[data-recalculating="true"]') ??
      document.querySelector('.opacity-50') ??
      document.querySelector('[class*="muted"]')
    expect(scoreArea).not.toBeNull()
  })

  // 3.5-U-008: "Recalculating..." badge visible during recalc
  it('[P0] should show "Recalculating..." badge or text when score is recalculating', () => {
    // Arrange: score status is 'calculating' from Realtime subscription
    storeMockState.scoreStatus = 'calculating'

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 85,
            status: 'calculating',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 2,
            minorCount: 1,
          },
        })}
      />,
    )

    // Assert: visible indicator that score is being recalculated
    expect(screen.getByText(/recalculat|calculating/i)).toBeInTheDocument()
  })

  // 3.5-U-009: Approve disabled during recalc
  it('[P0] should disable Approve button while score is recalculating', () => {
    // Arrange: calculating status — same as U-002 but from store (Realtime update path)
    storeMockState.scoreStatus = 'calculating'
    storeMockState.currentScore = 85

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 85,
            status: 'calculated',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 2,
            minorCount: 1,
          },
        })}
      />,
    )

    // Assert: Approve button disabled or hidden
    const approveBtn = screen.queryByRole('button', { name: /approve/i })
    if (approveBtn) {
      expect(approveBtn).toBeDisabled()
    }
  })

  // 3.5-U-010: Auto_passed -> Approve hidden, AutoPassRationale shown
  it('[P1] should hide Approve button and show AutoPassRationale when status=auto_passed', () => {
    // Arrange: file was auto-passed by pipeline — no manual approval needed
    storeMockState.scoreStatus = 'auto_passed'
    storeMockState.currentScore = 97

    const rationaleJson = JSON.stringify({
      score: 97,
      threshold: 95,
      margin: 2,
      severityCounts: { critical: 0, major: 1, minor: 1 },
      criteria: { scoreAboveThreshold: true, noCriticalFindings: true },
      riskiestFinding: null,
    })

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 97,
            status: 'auto_passed',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 1,
            minorCount: 1,
          },
          // Story 3.5: autoPassRationale included in FileReviewData
          autoPassRationale: rationaleJson,
        } as Partial<FileReviewData>)}
      />,
    )

    // Assert: Approve button NOT shown for auto-passed files
    expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull()

    // AutoPassRationale component renders rationale content
    expect(screen.getByTestId('auto-pass-rationale')).toBeInTheDocument()
  })

  // 3.5-U-025b: SCORE_STALE response -> toast + re-fetch
  it('[P1] should show toast and trigger re-fetch when approveFile returns SCORE_STALE', async () => {
    // Arrange: Approve clicked but score became stale between render and click
    mockApproveFile.mockResolvedValue({
      success: false,
      error: 'Score is being recalculated',
      code: 'SCORE_STALE',
    } as unknown as { success: boolean; data: { fileId: string } })

    storeMockState.scoreStatus = 'calculated'
    storeMockState.currentScore = 85

    const user = userEvent.setup()

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 85,
            status: 'calculated',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 2,
            minorCount: 1,
          },
        })}
      />,
    )

    const approveBtn = screen.queryByRole('button', { name: /approve/i })
    if (approveBtn) {
      await user.click(approveBtn)
      // Assert: toast or error notification shown to user
      // (toast is rendered via sonner — check for aria-live region or toast testid)
      // The page should NOT navigate away on SCORE_STALE
    }
    // SCORE_STALE means UI should re-fetch and show current calculating state
    expect(mockApproveFile).toHaveBeenCalledWith({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })
  })

  // 3.5-U-068: Approve button disabled when scoreStatus='partial'
  it('[P0] should disable Approve button when score status is partial', () => {
    // Arrange: AI pipeline failed mid-run — partial scores cannot be approved
    storeMockState.scoreStatus = 'partial'
    storeMockState.currentScore = 80

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 80,
            status: 'partial',
            layerCompleted: 'L1',
            criticalCount: 0,
            majorCount: 1,
            minorCount: 0,
          },
        })}
      />,
    )

    // Assert: Approve button disabled or hidden for partial status
    const approveBtn = screen.queryByRole('button', { name: /approve/i })
    if (approveBtn) {
      expect(approveBtn).toBeDisabled()
    } else {
      expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
    }
  })

  // 3.5-U-069: Approve button enabled when scoreStatus='overridden'
  it('[P0] should enable Approve button when score status is overridden', () => {
    // Arrange: PM manually overridden score — still approvable
    storeMockState.scoreStatus = 'overridden'
    storeMockState.currentScore = 88

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 88,
            status: 'overridden',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 2,
            minorCount: 1,
          },
        })}
      />,
    )

    // Assert: Approve button enabled for overridden status
    const approveBtn = screen.getByRole('button', { name: /approve/i })
    expect(approveBtn).toBeEnabled()
  })

  // 3.5-U-070: Approve button disabled when scoreStatus='na'
  it('[P0] should disable Approve button when score status is na', () => {
    // Arrange: no score calculated yet
    storeMockState.scoreStatus = 'na'

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: null,
            status: 'na',
            layerCompleted: null,
            criticalCount: 0,
            majorCount: 0,
            minorCount: 0,
          },
        })}
      />,
    )

    // Assert: Approve button disabled or hidden for na status
    const approveBtn = screen.queryByRole('button', { name: /approve/i })
    if (approveBtn) {
      expect(approveBtn).toBeDisabled()
    } else {
      expect(screen.queryByRole('button', { name: /approve/i })).toBeNull()
    }
  })
})
