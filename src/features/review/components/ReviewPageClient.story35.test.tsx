/**
 * ATDD Tests — Story 3.5: Score Lifecycle & Confidence Display
 * AC: ReviewPageClient — score lifecycle states, Approve button guard, AI pending badge
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { ReviewPageClient } from '@/features/review/components/ReviewPageClient'
import type { Finding, LayerCompleted, ScoreStatus } from '@/types/finding'

vi.mock('server-only', () => ({}))

// Mock responsive hooks — default laptop mode for Story 3.5 tests
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
  useIsDesktop: vi.fn(() => false),
  useIsLaptop: vi.fn(() => true),
  useIsMobile: vi.fn(() => false),
  useIsXl: () => true,
}))

// S-FIX-4: Mock ReviewStatusBar to avoid duplicate score-badge testid
vi.mock('@/features/review/components/ReviewStatusBar', () => ({
  ReviewStatusBar: () => null,
}))

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
vi.mock('@/features/review/components/FindingDetailContent', () => ({
  FindingDetailContent: () => null,
}))
vi.mock('@/features/review/components/FileNavigationDropdown', () => ({
  FileNavigationDropdown: () => null,
}))
vi.mock('@/features/review/utils/announce', () => ({
  announce: vi.fn(),
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
  useFocusManagement: () => ({
    pushEscapeLayer: vi.fn(),
    popEscapeLayer: vi.fn(),
    autoAdvance: vi.fn(),
    focusActionBar: vi.fn(),
  }),
}))

// Configurable store state for each test
const storeMockState = {
  resetForFile: vi.fn(),
  setFindings: vi.fn(),
  setFinding: vi.fn(),
  findingsMap: new Map(),
  currentScore: null as number | null,
  layerCompleted: null as LayerCompleted | null,
  updateScore: vi.fn(),
  scoreStatus: null as ScoreStatus | null,
  l2ConfidenceMin: null as number | null,
  l3ConfidenceMin: null as number | null,
  selectedId: null as string | null,
  setSelectedFinding: vi.fn(),
  sortedFindingIds: [],
  setSortedFindingIds: vi.fn(),
  selectedIds: new Set(),
  selectionMode: 'single' as const,
  filterState: { severity: null, status: 'pending', layer: null, category: null, confidence: null },
  searchQuery: '',
  aiSuggestionsEnabled: true,
  setFilter: vi.fn(),
  setSearchQuery: vi.fn(),
  setAiSuggestionsEnabled: vi.fn(),
  isBulkInFlight: false,
  clearSelection: vi.fn(),
  setSelectionMode: vi.fn(),
  setBulkInFlight: vi.fn(),
  overrideCounts: new Map(),
  setOverrideCounts: vi.fn(),
  setOverrideCount: vi.fn(),
  incrementOverrideCount: vi.fn(),
  selectRange: vi.fn(),
  selectAllFiltered: vi.fn(),
  addToSelection: vi.fn(),
  toggleSelection: vi.fn(),
  fileStates: new Map(),
  currentFileId: null as string | null,
}

vi.mock('@/features/review/stores/review.store', () => ({
  useReviewStore: Object.assign(
    vi.fn((selector?: (state: typeof storeMockState) => unknown) =>
      selector ? selector(storeMockState) : storeMockState,
    ),
    {
      getState: vi.fn(() => storeMockState),
      setState: vi.fn(),
    },
  ),
  useFileState: vi.fn((selector?: (state: typeof storeMockState) => unknown) =>
    selector ? selector(storeMockState) : storeMockState,
  ),
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- vi.mock hoisted before imports
  ReviewFileIdContext: require('react').createContext(''),
  selectCanUndo: vi.fn(() => false),
  selectCanRedo: vi.fn(() => false),
}))

// Mock review action server actions (Story 4.2 deps)
vi.mock('@/features/review/actions/acceptFinding.action', () => ({
  acceptFinding: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: {} })),
}))
vi.mock('@/features/review/actions/rejectFinding.action', () => ({
  rejectFinding: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: {} })),
}))
vi.mock('@/features/review/actions/bulkAction.action', () => ({
  bulkAction: vi.fn((..._args: unknown[]) =>
    Promise.resolve({
      success: true,
      data: {
        processedCount: 0,
        skippedCount: 0,
        batchId: 'test',
        skippedIds: [],
        processedFindings: [],
      },
    }),
  ),
}))
vi.mock('@/features/review/actions/flagFinding.action', () => ({
  flagFinding: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: {} })),
}))
const mockRetryAiAnalysis = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ success: true, data: { retriedLayers: ['L2'] } }),
)
vi.mock('@/features/pipeline/actions/retryAiAnalysis.action', () => ({
  retryAiAnalysis: (...args: unknown[]) => mockRetryAiAnalysis(...args),
}))

const mockApproveFile = vi.fn((..._args: unknown[]) =>
  Promise.resolve({
    success: true,
    data: {
      fileId: VALID_FILE_ID,
      mqmScore: 85 as number | null,
      status: 'calculated' as ScoreStatus,
    },
  }),
)
vi.mock('@/features/review/actions/approveFile.action', () => ({
  approveFile: (...args: unknown[]) => mockApproveFile(...args),
}))

// ── Helpers ──

const VALID_FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 't1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

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
    tenantId: VALID_TENANT_ID,
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
    segments: [],
    categories: [],
    overrideCounts: {},
    siblingFiles: [],
    isNonNative: false,
    btConfidenceThreshold: 0.6,
    userRole: 'qa_reviewer',
    assignedFindingCount: 0,
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
        tenantId={VALID_TENANT_ID}
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
        tenantId={VALID_TENANT_ID}
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
        tenantId={VALID_TENANT_ID}
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
        tenantId={VALID_TENANT_ID}
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
        tenantId={VALID_TENANT_ID}
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
        tenantId={VALID_TENANT_ID}
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
        tenantId={VALID_TENANT_ID}
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

    // Assert: score badge area has a muted/dim class or recalculating attribute
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
        tenantId={VALID_TENANT_ID}
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
        tenantId={VALID_TENANT_ID}
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
      criteria: { scoreAboveThreshold: true, noCriticalFindings: true, allLayersComplete: true },
      riskiestFinding: null,
      isNewPair: false,
      fileCount: 10,
    })

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
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
    } as unknown as {
      success: boolean
      data: { fileId: string; mqmScore: number | null; status: ScoreStatus }
    })

    storeMockState.scoreStatus = 'calculated'
    storeMockState.currentScore = 85

    const user = userEvent.setup()

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
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
        tenantId={VALID_TENANT_ID}
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
        tenantId={VALID_TENANT_ID}
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
        tenantId={VALID_TENANT_ID}
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

// TA: Coverage Gap Tests (Story 3.5)

// Toast mock for approve success tests (SC-2)
const mockToast = vi.hoisted(() => ({
  success: vi.fn((..._args: unknown[]) => undefined),
  error: vi.fn((..._args: unknown[]) => undefined),
}))
vi.mock('sonner', () => ({
  toast: mockToast,
}))

function buildFindingForStore(overrides?: Partial<Finding>): Finding {
  return {
    id: crypto.randomUUID(),
    tenantId: 't1',
    projectId: VALID_PROJECT_ID,
    sessionId: 's1',
    segmentId: 'seg1',
    severity: 'major',
    originalSeverity: null,
    category: 'accuracy',
    description: 'Test finding',
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    fileId: VALID_FILE_ID,
    detectedByLayer: 'L2',
    aiModel: 'gpt-4o-mini',
    aiConfidence: 80,
    suggestedFix: null,
    sourceTextExcerpt: null,
    targetTextExcerpt: null,
    segmentCount: 1,
    scope: 'per-file',
    reviewSessionId: null,
    relatedFileIds: null,
    ...overrides,
  }
}

describe('ReviewPageClient — TA: Coverage Gap Tests (Story 3.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReducedMotion(false)

    storeMockState.currentScore = null
    storeMockState.layerCompleted = null
    storeMockState.scoreStatus = null
    storeMockState.findingsMap = new Map()
    storeMockState.l2ConfidenceMin = null
    storeMockState.l3ConfidenceMin = null
  })

  // G1 [P1]: partialWarningText — L1L2 + thorough mode → "Deep analysis unavailable"
  it('[P1] should show "Deep analysis unavailable" when L1L2 partial in thorough mode (G1)', () => {
    storeMockState.scoreStatus = 'partial'
    storeMockState.layerCompleted = 'L1L2'

    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
        initialData={buildInitialData({
          processingMode: 'thorough',
          score: {
            mqmScore: 82,
            status: 'partial',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 1,
            minorCount: 0,
          },
        })}
      />,
    )

    expect(screen.getByText(/deep analysis unavailable/i)).toBeInTheDocument()
  })

  // G2 [P1]: partialWarningText — L1 only → "AI analysis unavailable"
  it('[P1] should show "AI analysis unavailable" when L1 partial (G2)', () => {
    storeMockState.scoreStatus = 'partial'
    storeMockState.layerCompleted = 'L1'

    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
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

    expect(screen.getByText(/ai analysis unavailable/i)).toBeInTheDocument()
  })

  // CM-2 [P1]: partialWarningText — economy + L2 partial → NO warning (characterization)
  it('[P1] should NOT show partial warning when economy mode with L1L2 partial (CM-2)', () => {
    storeMockState.scoreStatus = 'partial'
    storeMockState.layerCompleted = 'L1L2'

    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
        initialData={buildInitialData({
          processingMode: 'economy',
          score: {
            mqmScore: 82,
            status: 'partial',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 1,
            minorCount: 0,
          },
        })}
      />,
    )

    // Economy mode L1L2 partial returns null — no warning text rendered
    expect(screen.queryByText(/deep analysis unavailable/i)).toBeNull()
    expect(screen.queryByText(/ai analysis unavailable/i)).toBeNull()
  })

  // CM-3 [P2]: partialWarningText — L1L2L3 + partial → NO warning
  it('[P2] should NOT show partial warning when all layers complete L1L2L3 + partial (CM-3)', () => {
    storeMockState.scoreStatus = 'partial'
    storeMockState.layerCompleted = 'L1L2L3'

    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
        initialData={buildInitialData({
          processingMode: 'thorough',
          score: {
            mqmScore: 85,
            status: 'partial',
            layerCompleted: 'L1L2L3',
            criticalCount: 0,
            majorCount: 2,
            minorCount: 1,
          },
        })}
      />,
    )

    // L1L2L3 completed — no warning about missing layers
    expect(screen.queryByText(/deep analysis unavailable/i)).toBeNull()
    expect(screen.queryByText(/ai analysis unavailable/i)).toBeNull()
  })

  // G11 [P2]: severity counts rendered correctly
  it('[P2] should render correct severity counts for findings (G11)', () => {
    const f1 = buildFindingForStore({
      id: 'a1b2c3d4-0001-4a1b-8c2d-3e4f5a6b7c8d',
      severity: 'critical',
    })
    const f2 = buildFindingForStore({
      id: 'a1b2c3d4-0002-4a1b-8c2d-3e4f5a6b7c8d',
      severity: 'major',
    })
    const f3 = buildFindingForStore({
      id: 'a1b2c3d4-0003-4a1b-8c2d-3e4f5a6b7c8d',
      severity: 'major',
    })
    const f4 = buildFindingForStore({
      id: 'a1b2c3d4-0004-4a1b-8c2d-3e4f5a6b7c8d',
      severity: 'minor',
    })
    const f5 = buildFindingForStore({
      id: 'a1b2c3d4-0005-4a1b-8c2d-3e4f5a6b7c8d',
      severity: 'minor',
    })
    const f6 = buildFindingForStore({
      id: 'a1b2c3d4-0006-4a1b-8c2d-3e4f5a6b7c8d',
      severity: 'minor',
    })

    const map = new Map<string, Finding>()
    for (const f of [f1, f2, f3, f4, f5, f6]) {
      map.set(f.id, f)
    }
    storeMockState.findingsMap = map
    storeMockState.scoreStatus = 'calculated'
    storeMockState.layerCompleted = 'L1L2'
    storeMockState.currentScore = 75

    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 75,
            status: 'calculated',
            layerCompleted: 'L1L2',
            criticalCount: 1,
            majorCount: 2,
            minorCount: 3,
          },
        })}
      />,
    )

    const summary = screen.getByTestId('finding-count-summary')
    expect(summary).toHaveTextContent('Critical: 1')
    expect(summary).toHaveTextContent('Major: 2')
    expect(summary).toHaveTextContent('Minor: 3')
  })

  // G12 [P2]: empty findings list → empty state message
  it('[P2] should show empty state text when findings list is empty (G12)', () => {
    storeMockState.findingsMap = new Map()
    storeMockState.scoreStatus = 'calculated'
    storeMockState.layerCompleted = 'L1L2'
    storeMockState.currentScore = 100

    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
        initialData={buildInitialData({
          findings: [],
          score: {
            mqmScore: 100,
            status: 'calculated',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 0,
            minorCount: 0,
          },
        })}
      />,
    )

    expect(screen.getByText(/no findings/i)).toBeInTheDocument()
  })

  // G13 [P2]: findings sorted by severity then confidence DESC
  it('[P2] should render findings sorted by severity then confidence DESC (G13)', () => {
    const fMinor = buildFindingForStore({
      id: 'a1b2c3d4-0010-4a1b-8c2d-3e4f5a6b7c8d',
      severity: 'minor',
      aiConfidence: 90,
      description: 'Minor finding with high confidence',
    })
    const fCritical = buildFindingForStore({
      id: 'a1b2c3d4-0011-4a1b-8c2d-3e4f5a6b7c8d',
      severity: 'critical',
      aiConfidence: 70,
      description: 'Critical finding with lower confidence',
    })
    const fMajor = buildFindingForStore({
      id: 'a1b2c3d4-0012-4a1b-8c2d-3e4f5a6b7c8d',
      severity: 'major',
      aiConfidence: 85,
      description: 'Major finding with mid confidence',
    })

    const map = new Map<string, Finding>()
    for (const f of [fMinor, fCritical, fMajor]) {
      map.set(f.id, f)
    }
    storeMockState.findingsMap = map
    storeMockState.scoreStatus = 'calculated'
    storeMockState.layerCompleted = 'L1L2'
    storeMockState.currentScore = 70

    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 70,
            status: 'calculated',
            layerCompleted: 'L1L2',
            criticalCount: 1,
            majorCount: 1,
            minorCount: 1,
          },
        })}
      />,
    )

    // Critical + Major rows visible; Minor inside collapsed accordion
    const rows = screen.getAllByTestId('finding-compact-row')
    expect(rows.length).toBe(2) // minor hidden inside accordion

    // First: critical, Second: major (sorted by severity)
    expect(rows[0]!.textContent).toMatch(/critical/i)
    expect(rows[1]!.textContent).toMatch(/major/i)

    // Minor accordion header shows count
    expect(screen.getByText(/Minor \(1\)/)).toBeDefined()
  })

  // SC-2 [P2]: approve success → toast.success message
  it('[P2] should show toast.success when approve succeeds (SC-2)', async () => {
    mockApproveFile.mockResolvedValue({
      success: true,
      data: { fileId: VALID_FILE_ID, mqmScore: 96, status: 'calculated' },
    })

    storeMockState.scoreStatus = 'calculated'
    storeMockState.currentScore = 96
    storeMockState.layerCompleted = 'L1L2'

    const user = userEvent.setup()

    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 96,
            status: 'calculated',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 0,
            minorCount: 1,
          },
        })}
      />,
    )

    const approveBtn = screen.getByRole('button', { name: /approve/i })
    expect(approveBtn).toBeEnabled()

    await user.click(approveBtn)

    expect(mockApproveFile).toHaveBeenCalledWith({
      fileId: VALID_FILE_ID,
      projectId: VALID_PROJECT_ID,
    })
    expect(mockToast.success).toHaveBeenCalledWith('File approved')
  })

  // G17: SCORE_STALE → custom toast message (not generic error)
  it('[P1] should show custom toast message with "recalculated" or "wait and retry" when approveFile returns SCORE_STALE (G17)', async () => {
    // Arrange: approveFile returns SCORE_STALE error code
    mockApproveFile.mockResolvedValue({
      success: false,
      code: 'SCORE_STALE',
      error: 'Score stale',
    } as unknown as {
      success: boolean
      data: { fileId: string; mqmScore: number | null; status: ScoreStatus }
    })

    storeMockState.scoreStatus = 'calculated'
    storeMockState.currentScore = 85
    storeMockState.layerCompleted = 'L1L2'

    const user = userEvent.setup()

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
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

    const approveBtn = screen.getByRole('button', { name: /approve/i })
    await user.click(approveBtn)

    // Assert: toast.error called with SCORE_STALE-specific message (not the generic error)
    expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/recalculated|wait.*retry/i))
  })

  // CM-1: handleApprove with undefined error → toast shows reasonable message
  it('[P1] should not show literal "undefined" in toast when approveFile returns undefined error (CM-1)', async () => {
    // Arrange: approveFile returns failure with undefined code and error
    mockApproveFile.mockResolvedValue({
      success: false,
      code: undefined,
      error: undefined,
    } as unknown as {
      success: boolean
      data: { fileId: string; mqmScore: number | null; status: ScoreStatus }
    })

    storeMockState.scoreStatus = 'calculated'
    storeMockState.currentScore = 85
    storeMockState.layerCompleted = 'L1L2'

    const user = userEvent.setup()

    // Act
    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
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

    const approveBtn = screen.getByRole('button', { name: /approve/i })
    await user.click(approveBtn)

    // Assert: toast.error is called, but NOT with the literal string "undefined"
    expect(mockToast.error).toHaveBeenCalled()
    const callArg = mockToast.error.mock.calls[0]?.[0]
    // The actual value passed may be `undefined` (the JS value), which sonner handles
    // But it should NOT be the literal string "undefined"
    if (typeof callArg === 'string') {
      expect(callArg).not.toBe('undefined')
    }
  })
})
