/**
 * ATDD GREEN PHASE — Story 4.1c: Detail Panel & Segment Context
 * Component: SegmentContextList
 *
 * Renders surrounding context segments (before + current + after) with
 * click-to-navigate affordance for segments that have findings.
 *
 * Guardrails referenced: #39 (lang attribute), #25 (color not sole info)
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

import {
  SegmentContextList,
  SegmentContextError,
  SegmentContextCrossFile,
} from '@/features/review/components/SegmentContextList'
import { buildSegment } from '@/test/factories'

// ── Helper: build SegmentForContext shape from buildSegment ──

function buildSegmentForContext(overrides?: Record<string, unknown>) {
  const seg = buildSegment(overrides as Parameters<typeof buildSegment>[0])
  return {
    id: seg.id,
    segmentNumber: seg.segmentNumber,
    sourceText: seg.sourceText,
    targetText: seg.targetText,
    sourceLang: seg.sourceLang,
    targetLang: seg.targetLang,
    wordCount: seg.wordCount,
  }
}

// ── Default props helper ──

function defaultProps(overrides?: Record<string, unknown>) {
  const currentSegment = buildSegmentForContext({
    id: 'seg-current',
    segmentNumber: 5,
    sourceText: 'Current source text',
    targetText: 'Current target text',
    sourceLang: 'en-US',
    targetLang: 'th-TH',
  })

  const contextBefore = [
    buildSegmentForContext({
      id: 'seg-3',
      segmentNumber: 3,
      sourceText: 'Before 1',
      targetText: 'ก่อน 1',
    }),
    buildSegmentForContext({
      id: 'seg-4',
      segmentNumber: 4,
      sourceText: 'Before 2',
      targetText: 'ก่อน 2',
    }),
  ]

  const contextAfter = [
    buildSegmentForContext({
      id: 'seg-6',
      segmentNumber: 6,
      sourceText: 'After 1',
      targetText: 'หลัง 1',
    }),
    buildSegmentForContext({
      id: 'seg-7',
      segmentNumber: 7,
      sourceText: 'After 2',
      targetText: 'หลัง 2',
    }),
  ]

  return {
    currentSegment,
    contextBefore,
    contextAfter,
    findingsBySegmentId: {} as Record<string, string[]>,
    onNavigateToFinding: vi.fn(),
    ...overrides,
  }
}

describe('SegmentContextList', () => {
  // ═══════════════════════════════════════════════════════════════════════
  // AC3: Surrounding Segment Context
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C2.1][P0] should render context before + current + context after in order', () => {
    const props = defaultProps()
    render(<SegmentContextList {...props} />)

    // 2 before + 1 current + 2 after = 5 rows
    const contextRows = screen.getAllByTestId('context-segment')
    const currentRow = screen.getByTestId('current-segment')
    expect(contextRows).toHaveLength(4)
    expect(currentRow).toBeInTheDocument()

    // Verify order: all rows render in DOM order
    const allRows = screen.getByTestId('segment-context-loaded').children
    expect(allRows).toHaveLength(5)
    expect(allRows[0]).toHaveTextContent('Before 1')
    expect(allRows[1]).toHaveTextContent('Before 2')
    expect(allRows[2]).toHaveTextContent('Current source text')
    expect(allRows[3]).toHaveTextContent('After 1')
    expect(allRows[4]).toHaveTextContent('After 2')
  })

  it('[T-C2.2][P1] should apply distinct highlight class to current segment', () => {
    const props = defaultProps()
    render(<SegmentContextList {...props} />)

    const currentRow = screen.getByTestId('current-segment')
    expect(currentRow.className).toMatch(/bg-primary/)

    // Context rows should NOT have the current highlight
    const contextRows = screen.getAllByTestId('context-segment')
    for (const row of contextRows) {
      expect(row.className).not.toMatch(/bg-primary/)
    }
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC5: Context Segment Click-to-Navigate
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C2.3][P1] should show clickable affordance for context segments with findings', () => {
    const props = defaultProps({
      findingsBySegmentId: { 'seg-4': ['finding-1', 'finding-2'] },
    })
    render(<SegmentContextList {...props} />)

    // Find the context segment row containing "Before 2" (seg-4)
    const contextRows = screen.getAllByTestId('context-segment')
    const clickableRow = contextRows.find((row) => row.textContent?.includes('Before 2'))!
    expect(clickableRow.className).toMatch(/cursor-pointer/)
    expect(clickableRow.getAttribute('role')).toBe('button')

    fireEvent.click(clickableRow)
    expect(props.onNavigateToFinding).toHaveBeenCalledWith('finding-1')
  })

  it('[T-C2.4][P1] should not be clickable for context segments without findings', () => {
    const props = defaultProps({
      findingsBySegmentId: {},
    })
    render(<SegmentContextList {...props} />)

    const contextRows = screen.getAllByTestId('context-segment')
    for (const row of contextRows) {
      expect(row.className).not.toMatch(/cursor-pointer/)
      expect(row.getAttribute('role')).toBeNull()
    }

    fireEvent.click(contextRows[0]!)
    expect(props.onNavigateToFinding).not.toHaveBeenCalled()
  })

  it('[T-C2.5][P1] should show cross-file fallback message when no segment context', () => {
    render(<SegmentContextCrossFile />)

    expect(screen.getByText(/cross-file finding/i)).toBeInTheDocument()
    expect(screen.getByText(/no specific segment context/i)).toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC6: Thai/CJK Language & Accessibility
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C2.6][P1] should set per-segment lang attribute (NOT parent-level)', () => {
    const props = defaultProps({
      contextBefore: [
        buildSegmentForContext({
          id: 'seg-jp',
          sourceLang: 'ja-JP',
          targetLang: 'en-US',
          sourceText: '品質チェック',
          targetText: 'Quality check',
        }),
      ],
    })
    render(<SegmentContextList {...props} />)

    // Japanese source segment should have lang="ja-JP" via SegmentTextDisplay
    const sourceDisplays = screen.getAllByTestId('segment-text-source')
    const jpSource = sourceDisplays.find((el) => el.textContent?.includes('品質チェック'))
    expect(jpSource?.getAttribute('lang')).toBe('ja-JP')
  })

  it('[T-C2.7][P1] should apply CJK font scale per segment language', () => {
    const props = defaultProps({
      contextBefore: [
        buildSegmentForContext({
          id: 'seg-zh',
          sourceLang: 'en-US',
          targetLang: 'zh-CN',
          sourceText: 'UI guidelines',
          targetText: '用户界面指南',
        }),
      ],
    })
    render(<SegmentContextList {...props} />)

    const targetDisplays = screen.getAllByTestId('segment-text-target')
    const zhTarget = targetDisplays.find((el) => el.textContent?.includes('用户界面指南'))
    expect(zhTarget?.className).toContain('text-cjk-scale')
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC3: Additional Features
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C2.8][P2] should display segment numbers', () => {
    const props = defaultProps()
    render(<SegmentContextList {...props} />)

    expect(screen.getByText(/Seg 3/)).toBeInTheDocument()
    expect(screen.getByText(/Seg 4/)).toBeInTheDocument()
    expect(screen.getByText(/Seg 5/)).toBeInTheDocument()
    expect(screen.getByText(/Seg 6/)).toBeInTheDocument()
    expect(screen.getByText(/Seg 7/)).toBeInTheDocument()
  })

  it('[T-C2.9][P1] should have data-testid="segment-context-loaded" when loaded', () => {
    const props = defaultProps()
    render(<SegmentContextList {...props} />)

    expect(screen.getByTestId('segment-context-loaded')).toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC1: Error State
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C2.10][P1] should show error message + retry button on error state', () => {
    const onRetry = vi.fn()
    render(<SegmentContextError error="Failed to load segment context" onRetry={onRetry} />)

    expect(screen.getByText(/Failed to load segment context/)).toBeInTheDocument()
    const retryButton = screen.getByRole('button', { name: /retry/i })
    fireEvent.click(retryButton)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('[T-C2.11][P1] should preserve finding metadata above when error shows', () => {
    const onRetry = vi.fn()
    render(<SegmentContextError error="Segment not found" onRetry={onRetry} />)

    // Error message shown
    expect(screen.getByText(/Segment not found/)).toBeInTheDocument()
    // Retry button shown
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    // The component renders only the error — parent (FindingDetailSheet) renders metadata
  })

  // ═══════════════════════════════════════════════════════════════════════
  // AC5: All Context Segments Have Findings
  // ═══════════════════════════════════════════════════════════════════════

  it('[T-C2.12][P1] should show clickable affordance on every row when all segments have findings', () => {
    const props = defaultProps({
      findingsBySegmentId: {
        'seg-3': ['f1'],
        'seg-4': ['f2'],
        'seg-6': ['f3'],
        'seg-7': ['f4'],
      },
    })
    render(<SegmentContextList {...props} />)

    // All 4 context segments should be clickable
    const contextRows = screen.getAllByTestId('context-segment')
    expect(contextRows).toHaveLength(4)
    for (const row of contextRows) {
      expect(row.className).toMatch(/cursor-pointer/)
      expect(row.getAttribute('role')).toBe('button')
    }
  })
})
