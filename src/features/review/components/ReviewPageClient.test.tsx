/**
 * TA: Coverage Gap Tests — Story 3.2c
 * Gap #14: deriveScoreBadgeState branches (pure function inside ReviewPageClient)
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

// ══════════════════════════════════════════════════════════════
// Story 4.5: File navigation — findings init on RSC streaming
// ══════════════════════════════════════════════════════════════

describe('ReviewPageClient — file navigation init (Story 4.5 AC3)', () => {
  beforeEach(() => {
    useReviewStore.setState({ currentFileId: null })
  })

  it('[P0] should populate findings when re-rendered with new fileId and new initialData', () => {
    // Simulate: render fileA with findings
    const dataA = buildInitialData({
      file: { fileId: 'fileA', fileName: 'a.sdlxliff', status: 'l2_completed' as never },
      findings: [
        {
          id: 'fa1',
          segmentId: null,
          severity: 'major',
          originalSeverity: null,
          category: 'accuracy',
          description: 'Finding A1',
          status: 'pending',
          detectedByLayer: 'L1',
          aiConfidence: null,
          sourceTextExcerpt: null,
          targetTextExcerpt: null,
          suggestedFix: null,
          aiModel: null,
          segmentCount: 1,
          scope: 'per-file' as const,
          hasNonNativeAction: false,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    const { rerender } = render(
      <ReviewPageClient fileId="fileA" projectId="p1" tenantId="t1" initialData={dataA} />,
    )

    // fileA findings should be populated
    expect(useReviewStore.getState().findingsMap.size).toBe(1)

    // Simulate: Link navigation to fileB — new fileId + new initialData
    const dataB = buildInitialData({
      file: { fileId: 'fileB', fileName: 'b.sdlxliff', status: 'l2_completed' as never },
      findings: [
        {
          id: 'fb1',
          segmentId: null,
          severity: 'critical',
          originalSeverity: null,
          category: 'terminology',
          description: 'Finding B1',
          status: 'pending',
          detectedByLayer: 'L2',
          aiConfidence: 85,
          sourceTextExcerpt: null,
          targetTextExcerpt: null,
          suggestedFix: null,
          aiModel: null,
          segmentCount: 1,
          scope: 'per-file' as const,
          hasNonNativeAction: false,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'fb2',
          segmentId: null,
          severity: 'minor',
          originalSeverity: null,
          category: 'style',
          description: 'Finding B2',
          status: 'pending',
          detectedByLayer: 'L1',
          aiConfidence: null,
          sourceTextExcerpt: null,
          targetTextExcerpt: null,
          suggestedFix: null,
          aiModel: null,
          segmentCount: 1,
          scope: 'per-file' as const,
          hasNonNativeAction: false,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    rerender(<ReviewPageClient fileId="fileB" projectId="p1" tenantId="t1" initialData={dataB} />)

    // fileB findings MUST be populated — this is the bug regression test
    expect(useReviewStore.getState().findingsMap.size).toBe(2)
    expect(useReviewStore.getState().findingsMap.has('fb1')).toBe(true)
    expect(useReviewStore.getState().findingsMap.has('fb2')).toBe(true)
    expect(useReviewStore.getState().currentFileId).toBe('fileB')
  })

  it('[P0] should populate findings when initialData arrives after fileId (RSC streaming)', () => {
    // Simulate: render fileA with findings
    const dataA = buildInitialData({
      file: { fileId: 'fileA', fileName: 'a.sdlxliff', status: 'l2_completed' as never },
      findings: [
        {
          id: 'fa1',
          segmentId: null,
          severity: 'major',
          originalSeverity: null,
          category: 'accuracy',
          description: 'Finding A1',
          status: 'pending',
          detectedByLayer: 'L1',
          aiConfidence: null,
          sourceTextExcerpt: null,
          targetTextExcerpt: null,
          suggestedFix: null,
          aiModel: null,
          segmentCount: 1,
          scope: 'per-file' as const,
          hasNonNativeAction: false,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    const { rerender } = render(
      <ReviewPageClient fileId="fileA" projectId="p1" tenantId="t1" initialData={dataA} />,
    )
    expect(useReviewStore.getState().findingsMap.size).toBe(1)

    // Phase 1: RSC streaming — fileId changes but initialData is EMPTY (stale/streaming)
    const dataBEmpty = buildInitialData({
      file: { fileId: 'fileB', fileName: 'b.sdlxliff', status: 'l2_completed' as never },
      findings: [], // empty — RSC stream not yet complete
    })

    rerender(
      <ReviewPageClient fileId="fileB" projectId="p1" tenantId="t1" initialData={dataBEmpty} />,
    )

    // Phase 2: RSC stream complete — same fileId, real initialData arrives
    const dataBFull = buildInitialData({
      file: { fileId: 'fileB', fileName: 'b.sdlxliff', status: 'l2_completed' as never },
      findings: [
        {
          id: 'fb1',
          segmentId: null,
          severity: 'critical',
          originalSeverity: null,
          category: 'terminology',
          description: 'Finding B1',
          status: 'pending',
          detectedByLayer: 'L2',
          aiConfidence: 85,
          sourceTextExcerpt: null,
          targetTextExcerpt: null,
          suggestedFix: null,
          aiModel: null,
          segmentCount: 1,
          scope: 'per-file' as const,
          hasNonNativeAction: false,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    rerender(
      <ReviewPageClient fileId="fileB" projectId="p1" tenantId="t1" initialData={dataBFull} />,
    )

    // Findings MUST be populated from the real data — not blocked by guard
    expect(useReviewStore.getState().findingsMap.size).toBe(1)
    expect(useReviewStore.getState().findingsMap.has('fb1')).toBe(true)
  })

  it('[P1] should NOT re-init when initialData ref changes but fileId stays same (optimistic protection)', () => {
    const dataA = buildInitialData({
      file: { fileId: 'fileA', fileName: 'a.sdlxliff', status: 'l2_completed' as never },
      findings: [
        {
          id: 'fa1',
          segmentId: null,
          severity: 'major',
          originalSeverity: null,
          category: 'accuracy',
          description: 'Finding A1',
          status: 'pending',
          detectedByLayer: 'L1',
          aiConfidence: null,
          sourceTextExcerpt: null,
          targetTextExcerpt: null,
          suggestedFix: null,
          aiModel: null,
          segmentCount: 1,
          scope: 'per-file' as const,
          hasNonNativeAction: false,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    const { rerender } = render(
      <ReviewPageClient fileId="fileA" projectId="p1" tenantId="t1" initialData={dataA} />,
    )

    // Simulate optimistic update
    const f = useReviewStore.getState().findingsMap.get('fa1')!
    useReviewStore.getState().setFinding('fa1', { ...f, status: 'accepted' })

    // Simulate RSC revalidation: same fileId, new initialData reference
    const dataA2 = buildInitialData({
      file: { fileId: 'fileA', fileName: 'a.sdlxliff', status: 'l2_completed' as never },
      findings: [
        {
          id: 'fa1',
          segmentId: null,
          severity: 'major',
          originalSeverity: null,
          category: 'accuracy',
          description: 'Finding A1',
          status: 'pending',
          detectedByLayer: 'L1',
          aiConfidence: null,
          sourceTextExcerpt: null,
          targetTextExcerpt: null,
          suggestedFix: null,
          aiModel: null,
          segmentCount: 1,
          scope: 'per-file' as const,
          hasNonNativeAction: false,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })

    rerender(<ReviewPageClient fileId="fileA" projectId="p1" tenantId="t1" initialData={dataA2} />)

    // Optimistic state MUST be preserved
    expect(useReviewStore.getState().findingsMap.get('fa1')?.status).toBe('accepted')
  })
})
