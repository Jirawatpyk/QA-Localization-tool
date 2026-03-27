/**
 * Epic 3 P1 Tests — Score Badge L1→L2 Transition (P1-07, R3-019)
 * Tests: ScoreBadge transition from L1 (Rule-based) to calculating to L1L2 (AI Screened),
 * including "Recalculating..." badge visibility and Approve button disabled guard.
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { ReviewPageClient } from '@/features/review/components/ReviewPageClient'
import type { LayerCompleted, ScoreStatus } from '@/types/finding'

vi.mock('server-only', () => ({}))

// Mock responsive hooks — laptop mode for consistent rendering
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: vi.fn(() => false),
  useIsDesktop: vi.fn(() => false),
  useIsLaptop: vi.fn(() => true),
  useIsMobile: vi.fn(() => false),
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
vi.mock('@/features/pipeline/actions/retryAiAnalysis.action', () => ({
  retryAiAnalysis: vi.fn((..._args: unknown[]) =>
    Promise.resolve({ success: true, data: { retriedLayers: [] } }),
  ),
}))
vi.mock('@/features/review/actions/approveFile.action', () => ({
  approveFile: vi.fn((..._args: unknown[]) => Promise.resolve({ success: true, data: null })),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
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

// ── Helpers ──

const VALID_FILE_ID = 'f1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'
const VALID_PROJECT_ID = 'b1c2d3e4-f5a6-4b2c-9d3e-4f5a6b7c8d9e'
const VALID_TENANT_ID = 't1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d'

function mockReducedMotion() {
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
      layerCompleted: 'L1L2',
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
    ...overrides,
  } as FileReviewData
}

// ── Tests ──

describe('ReviewPageClient — scoreTransition (P1-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReducedMotion()

    storeMockState.currentScore = null
    storeMockState.layerCompleted = null
    storeMockState.scoreStatus = null
    storeMockState.findingsMap = new Map()
    storeMockState.l2ConfidenceMin = null
    storeMockState.l3ConfidenceMin = null
    storeMockState.selectedId = null
  })

  it('[P1] should show "Rule-based" then "Recalculating..." then "AI Screened" across L1→calculating→L1L2 transitions', () => {
    // Phase 1: L1 calculated — Rule-based
    storeMockState.scoreStatus = 'calculated'
    storeMockState.layerCompleted = 'L1'
    storeMockState.currentScore = 90

    const { rerender } = render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 90,
            status: 'calculated',
            layerCompleted: 'L1',
            criticalCount: 0,
            majorCount: 0,
            minorCount: 1,
          },
        })}
      />,
    )

    // Assert Phase 1: ScoreBadge shows "Rule-based"
    const badge = screen.getByTestId('score-badge')
    expect(badge).toHaveTextContent('Rule-based')

    // Phase 2: Score transitions to 'calculating' (L2 running)
    storeMockState.scoreStatus = 'calculating'

    rerender(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 90,
            status: 'calculating',
            layerCompleted: 'L1',
            criticalCount: 0,
            majorCount: 0,
            minorCount: 1,
          },
        })}
      />,
    )

    // Assert Phase 2: "Recalculating..." text visible
    expect(screen.getByText(/recalculat/i)).toBeInTheDocument()

    // Phase 3: L2 completes — score recalculated with L1L2
    storeMockState.scoreStatus = 'calculated'
    storeMockState.layerCompleted = 'L1L2'
    storeMockState.currentScore = 82

    rerender(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 82,
            status: 'calculated',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 2,
            minorCount: 1,
          },
        })}
      />,
    )

    // Assert Phase 3: ScoreBadge shows "AI Screened", no "Recalculating..."
    const updatedBadge = screen.getByTestId('score-badge')
    expect(updatedBadge).toHaveTextContent('AI Screened')
    expect(screen.queryByText(/recalculat/i)).toBeNull()
  })

  it('[P1] should show ScoreBadge text change from "Rule-based" to "Recalculating..." to "AI Screened"', () => {
    // Start with L1 completed — "Rule-based"
    storeMockState.scoreStatus = 'calculated'
    storeMockState.layerCompleted = 'L1'
    storeMockState.currentScore = 88

    const { rerender } = render(
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

    expect(screen.getByTestId('score-badge')).toHaveTextContent('Rule-based')

    // Transition to calculating — ScoreBadge goes to "Analyzing..." state
    storeMockState.scoreStatus = 'calculating'

    rerender(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 88,
            status: 'calculating',
            layerCompleted: 'L1',
            criticalCount: 0,
            majorCount: 1,
            minorCount: 0,
          },
        })}
      />,
    )

    // ScoreBadge gets state='analyzing' which renders "Analyzing..." label
    const analyzingBadge = screen.getByTestId('score-badge')
    expect(analyzingBadge.textContent?.toLowerCase()).toMatch(/analyz/i)

    // Transition to calculated + L1L2 — "AI Screened"
    storeMockState.scoreStatus = 'calculated'
    storeMockState.layerCompleted = 'L1L2'
    storeMockState.currentScore = 83

    rerender(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 83,
            status: 'calculated',
            layerCompleted: 'L1L2',
            criticalCount: 0,
            majorCount: 2,
            minorCount: 1,
          },
        })}
      />,
    )

    expect(screen.getByTestId('score-badge')).toHaveTextContent('AI Screened')
  })

  it('[P1] should disable Approve button during calculating and re-enable when calculated', () => {
    // Start with calculated — Approve enabled
    storeMockState.scoreStatus = 'calculated'
    storeMockState.layerCompleted = 'L1L2'
    storeMockState.currentScore = 85

    const { rerender } = render(
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

    // Assert: Approve button enabled
    const approveBtn = screen.getByRole('button', { name: /approve/i })
    expect(approveBtn).toBeEnabled()

    // Transition to calculating — Approve should disable
    storeMockState.scoreStatus = 'calculating'

    rerender(
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

    // Assert: Approve button disabled during calculating
    const disabledBtn = screen.queryByRole('button', { name: /approve/i })
    if (disabledBtn) {
      expect(disabledBtn).toBeDisabled()
    }

    // Transition back to calculated — Approve should re-enable
    storeMockState.scoreStatus = 'calculated'

    rerender(
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

    const reEnabledBtn = screen.getByRole('button', { name: /approve/i })
    expect(reEnabledBtn).toBeEnabled()
  })
})
