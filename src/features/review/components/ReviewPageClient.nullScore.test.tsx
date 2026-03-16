/**
 * Epic 3 P1 Tests — ScoreBadge with null/undefined score (P1-13, R3-039)
 * Tests: ScoreBadge shows spinner not NaN when score is null + calculating,
 * and correctly shows "0" when score is 0 (a valid score).
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { FileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { ReviewPageClient } from '@/features/review/components/ReviewPageClient'
import type { LayerCompleted, ScoreStatus } from '@/types/finding'

vi.mock('server-only', () => ({}))

// Mock responsive hooks — laptop mode
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

// Configurable store state
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
    ...overrides,
  } as FileReviewData
}

// ── Tests ──

describe('ReviewPageClient — nullScore (P1-13)', () => {
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

  it('[P1] should not show NaN when mqmScore is null and status is calculating', () => {
    // Arrange: No score calculated yet, pipeline is still running
    storeMockState.scoreStatus = 'calculating'
    storeMockState.currentScore = null

    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: null,
            status: 'calculating',
            layerCompleted: null,
            criticalCount: 0,
            majorCount: 0,
            minorCount: 0,
          },
        })}
      />,
    )

    // Assert: ScoreBadge is rendered
    const badge = screen.getByTestId('score-badge')
    expect(badge).toBeInTheDocument()

    // Assert: No "NaN" text anywhere in the badge
    expect(badge.textContent).not.toContain('NaN')

    // Assert: ScoreBadge should show "N/A" for null score (per ScoreBadge implementation)
    // and state='analyzing' should show "Analyzing..." label
    const hasAnalyzingOrNA =
      badge.textContent?.includes('N/A') || badge.textContent?.toLowerCase().includes('analyz')
    expect(hasAnalyzingOrNA).toBe(true)

    // Assert: "Recalculating..." badge should be visible
    expect(screen.getByText(/recalculat/i)).toBeInTheDocument()
  })

  it('[P1] should show "0.0" when mqmScore is 0 with calculated status (0 is valid score)', () => {
    // Arrange: Score is exactly 0 — all findings have max penalty
    storeMockState.scoreStatus = 'calculated'
    storeMockState.currentScore = 0
    storeMockState.layerCompleted = 'L1L2'

    render(
      <ReviewPageClient
        fileId={VALID_FILE_ID}
        projectId={VALID_PROJECT_ID}
        tenantId={VALID_TENANT_ID}
        initialData={buildInitialData({
          score: {
            mqmScore: 0,
            status: 'calculated',
            layerCompleted: 'L1L2',
            criticalCount: 5,
            majorCount: 10,
            minorCount: 3,
          },
        })}
      />,
    )

    // Assert: ScoreBadge shows "0.0" not spinner, not "N/A"
    const badge = screen.getByTestId('score-badge')
    expect(badge.textContent).toContain('0.0')
    expect(badge.textContent).not.toContain('N/A')
    expect(badge.textContent).not.toContain('NaN')

    // No "Recalculating..." badge since status is 'calculated'
    expect(screen.queryByText(/recalculat/i)).toBeNull()
  })
})
