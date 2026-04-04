/** Story 3.4 ATDD — ReviewPageClient partial state + retry — RED PHASE */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { ReviewPageClient } from '@/features/review/components/ReviewPageClient'
import type { LayerCompleted, ScoreStatus } from '@/types/finding'

// ── Mocks — must be before component import ──

vi.mock('server-only', () => ({}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

// Mock responsive hooks — laptop mode
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
  useIsDesktop: vi.fn(() => false),
  useIsLaptop: vi.fn(() => true),
  useIsMobile: vi.fn(() => false),
  useIsXl: () => true,
}))

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

// Mock retryAiAnalysis server action (Story 3.4)
const mockRetryAiAnalysis = vi.fn((..._args: unknown[]) =>
  Promise.resolve({ success: true, data: { retriedLayers: ['L2'] } }),
)
vi.mock('@/features/pipeline/actions/retryAiAnalysis.action', () => ({
  retryAiAnalysis: (...args: unknown[]) => mockRetryAiAnalysis(...args),
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
  scoreStatus: null as ScoreStatus | null, // Story 3.4: new field
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

// ── Helpers ──

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
      fileId: 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      fileName: 'test-file.sdlxliff',
      status: 'l2_completed',
    },
    findings: [],
    score: {
      mqmScore: 85,
      status: 'calculated',
      layerCompleted: 'L1L2' as LayerCompleted,
      criticalCount: 0,
      majorCount: 0,
      minorCount: 0,
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

const VALID_FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 'c1d2e3f4-a5b6-4c3d-8e4f-5a6b7c8d9e0f'

// ── Suite ──

describe('ReviewPageClient — partial state & retry (Story 3.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReducedMotion(false)

    // Reset shared store state
    storeMockState.currentScore = null
    storeMockState.layerCompleted = null
    storeMockState.scoreStatus = null
    storeMockState.findingsMap = new Map()
  })

  describe('ScoreBadge state mapping', () => {
    // T31
    it('[P0] should show retry button when scoreStatus=partial', () => {
      const initialData = buildInitialData({
        file: { fileId: VALID_FILE_ID, fileName: 'test.sdlxliff', status: 'ai_partial' },
        score: {
          mqmScore: 85,
          status: 'partial',
          layerCompleted: 'L1' as LayerCompleted,
          criticalCount: 0,
          majorCount: 0,
          minorCount: 0,
        },
      })

      render(
        <ReviewPageClient
          fileId={VALID_FILE_ID}
          projectId={VALID_PROJECT_ID}
          tenantId={VALID_TENANT_ID}
          initialData={initialData}
        />,
      )

      // Retry button must appear when file is ai_partial
      const retryButton = screen.getByRole('button', { name: /retry/i })
      expect(retryButton).toBeTruthy()
    })

    // T32
    it('[P0] should NOT show retry button when score is calculated', () => {
      const initialData = buildInitialData({
        file: { fileId: VALID_FILE_ID, fileName: 'test.sdlxliff', status: 'l2_completed' },
        score: {
          mqmScore: 88,
          status: 'calculated',
          layerCompleted: 'L1L2' as LayerCompleted,
          criticalCount: 0,
          majorCount: 0,
          minorCount: 0,
        },
      })

      render(
        <ReviewPageClient
          fileId={VALID_FILE_ID}
          projectId={VALID_PROJECT_ID}
          tenantId={VALID_TENANT_ID}
          initialData={initialData}
        />,
      )

      // No retry button for successfully calculated scores
      expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
    })

    it('[P0] should derive partial badge state when scoreStatus=partial (overrides score)', () => {
      const initialData = buildInitialData({
        file: { fileId: VALID_FILE_ID, fileName: 'test.sdlxliff', status: 'ai_partial' },
        score: {
          mqmScore: 100, // score=100 would normally be 'pass'
          status: 'partial',
          layerCompleted: 'L1' as LayerCompleted,
          criticalCount: 0,
          majorCount: 0,
          minorCount: 0,
        },
      })

      render(
        <ReviewPageClient
          fileId={VALID_FILE_ID}
          projectId={VALID_PROJECT_ID}
          tenantId={VALID_TENANT_ID}
          initialData={initialData}
        />,
      )

      // Badge must show 'Partial', not 'Passed' — scoreStatus overrides score
      // ScoreBadge renders label as visible text at md size (not aria-label)
      expect(screen.getByText('Partial')).toBeTruthy()
      expect(screen.queryByText('Passed')).toBeNull()
    })
  })

  describe('retry button', () => {
    // T33
    it('[P1] should disable retry button during useTransition pending', async () => {
      const user = userEvent.setup()

      // Make retryAiAnalysis hang (never resolves during this test)
      mockRetryAiAnalysis.mockImplementation(
        () => new Promise(() => {}), // never resolves
      )

      const initialData = buildInitialData({
        file: { fileId: VALID_FILE_ID, fileName: 'test.sdlxliff', status: 'ai_partial' },
        score: {
          mqmScore: 75,
          status: 'partial',
          layerCompleted: 'L1' as LayerCompleted,
          criticalCount: 0,
          majorCount: 0,
          minorCount: 0,
        },
      })

      render(
        <ReviewPageClient
          fileId={VALID_FILE_ID}
          projectId={VALID_PROJECT_ID}
          tenantId={VALID_TENANT_ID}
          initialData={initialData}
        />,
      )

      const retryButton = screen.getByRole('button', { name: /retry/i })

      // Click to trigger useTransition
      await user.click(retryButton)

      // Button must be disabled while pending
      await waitFor(() => {
        expect(retryButton).toBeDisabled()
      })
    })

    // T43
    it('[P1] should hide retry button after successful retry', async () => {
      const user = userEvent.setup()

      mockRetryAiAnalysis.mockResolvedValue({
        success: true,
        data: { retriedLayers: ['L2'] },
      })

      const initialData = buildInitialData({
        file: { fileId: VALID_FILE_ID, fileName: 'test.sdlxliff', status: 'ai_partial' },
        score: {
          mqmScore: 75,
          status: 'partial',
          layerCompleted: 'L1' as LayerCompleted,
          criticalCount: 0,
          majorCount: 0,
          minorCount: 0,
        },
      })

      render(
        <ReviewPageClient
          fileId={VALID_FILE_ID}
          projectId={VALID_PROJECT_ID}
          tenantId={VALID_TENANT_ID}
          initialData={initialData}
        />,
      )

      const retryButton = screen.getByRole('button', { name: /retry/i })
      await user.click(retryButton)

      // After successful retry dispatch, button should disappear (or show success state)
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
      })
    })

    // T30
    it('[P1] should show warning text for L3 failure: "Deep analysis unavailable"', () => {
      const initialData = buildInitialData({
        file: { fileId: VALID_FILE_ID, fileName: 'test.sdlxliff', status: 'ai_partial' },
        score: {
          mqmScore: 85,
          status: 'partial',
          layerCompleted: 'L1L2' as LayerCompleted, // L1L2 done, L3 failed
          criticalCount: 0,
          majorCount: 0,
          minorCount: 0,
        },
        processingMode: 'thorough',
      })

      render(
        <ReviewPageClient
          fileId={VALID_FILE_ID}
          projectId={VALID_PROJECT_ID}
          tenantId={VALID_TENANT_ID}
          initialData={initialData}
        />,
      )

      // When L3 failed (layerCompleted=L1L2 + partial + thorough mode)
      expect(screen.getByText(/deep analysis unavailable/i)).toBeTruthy()
    })

    it('[P1] should show warning text for L2 failure: "AI analysis unavailable"', () => {
      const initialData = buildInitialData({
        file: { fileId: VALID_FILE_ID, fileName: 'test.sdlxliff', status: 'ai_partial' },
        score: {
          mqmScore: 72,
          status: 'partial',
          layerCompleted: 'L1' as LayerCompleted, // only L1 done — L2 failed
          criticalCount: 0,
          majorCount: 0,
          minorCount: 0,
        },
        processingMode: 'economy',
      })

      render(
        <ReviewPageClient
          fileId={VALID_FILE_ID}
          projectId={VALID_PROJECT_ID}
          tenantId={VALID_TENANT_ID}
          initialData={initialData}
        />,
      )

      // When L2 failed (layerCompleted=L1 + partial)
      expect(screen.getByText(/AI analysis unavailable/i)).toBeTruthy()
    })

    // F21 [P1]: retry failure → button stays visible
    it('[P1] should keep retry button visible when retryAiAnalysis returns failure', async () => {
      const user = userEvent.setup()

      mockRetryAiAnalysis.mockResolvedValue({
        success: false,
        error: 'Budget exhausted',
      } as unknown as { success: boolean; data: { retriedLayers: string[] } })

      const initialData = buildInitialData({
        file: { fileId: VALID_FILE_ID, fileName: 'test.sdlxliff', status: 'ai_partial' },
        score: {
          mqmScore: 75,
          status: 'partial',
          layerCompleted: 'L1' as LayerCompleted,
          criticalCount: 0,
          majorCount: 0,
          minorCount: 0,
        },
      })

      render(
        <ReviewPageClient
          fileId={VALID_FILE_ID}
          projectId={VALID_PROJECT_ID}
          tenantId={VALID_TENANT_ID}
          initialData={initialData}
        />,
      )

      const retryButton = screen.getByRole('button', { name: /retry/i })
      await user.click(retryButton)

      // Button should remain visible after failure (not hidden like on success)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /retry/i })).toBeTruthy()
      })
    })
  })

  // ── TA: BVA Gaps ──

  describe('deriveScoreBadgeState boundaries', () => {
    // B7 [P2]: null layerCompleted + partial scoreStatus
    it('[P2] should show Partial badge when layerCompleted=null but scoreStatus=partial', () => {
      const initialData = buildInitialData({
        file: { fileId: VALID_FILE_ID, fileName: 'test.sdlxliff', status: 'ai_partial' },
        score: {
          mqmScore: 80,
          status: 'partial',
          layerCompleted: null as unknown as LayerCompleted,
          criticalCount: 0,
          majorCount: 0,
          minorCount: 0,
        },
      })

      render(
        <ReviewPageClient
          fileId={VALID_FILE_ID}
          projectId={VALID_PROJECT_ID}
          tenantId={VALID_TENANT_ID}
          initialData={initialData}
        />,
      )

      // partial scoreStatus takes priority over null layerCompleted
      expect(screen.getByText('Partial')).toBeTruthy()
    })
  })
})
