/// <reference types="vitest/globals" />
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RecentFileRow } from '@/features/dashboard/types'

// Mock the ScoreBadge component so we can verify it is used (rather than raw <span>)
vi.mock('@/features/batch/components/ScoreBadge', () => ({
  ScoreBadge: ({ score }: { score: number | null }) => (
    <span data-testid="score-badge" data-score={score}>
      {score !== null ? score.toFixed(1) : 'N/A'}
    </span>
  ),
}))

describe('RecentFilesTable — ScoreBadge Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const MOCK_FILES: RecentFileRow[] = [
    {
      id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      fileName: 'test-file.sdlxliff',
      projectId: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
      projectName: 'Test Project',
      status: 'parsed',
      createdAt: '2026-03-01T10:00:00Z',
      mqmScore: 92.5,
      findingsCount: 5,
    },
    {
      id: 'c3d4e5f6-a7b8-4c3d-ae4f-5a6b7c8d9e0f',
      fileName: 'null-score.xliff',
      projectId: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
      projectName: 'Test Project',
      status: 'parsed',
      createdAt: '2026-03-01T09:00:00Z',
      mqmScore: null,
      findingsCount: 0,
    },
  ]

  // 7.1 [P1] Score column should use ScoreBadge component instead of raw <span>
  it('[P1] should render score column using ScoreBadge component', async () => {
    // WHAT: The score column in RecentFilesTable should render scores using the shared
    //   <ScoreBadge> component from @/features/batch/components/ScoreBadge instead of
    //   a raw <span className="font-mono text-sm">. This ensures visual consistency
    //   with the batch summary view (FileHistoryTable, FileStatusCard) which already
    //   use ScoreBadge for score display with color-coded variants.
    // WHY WILL FAIL: Current implementation at lines 59-65 renders a raw
    //   <span className="font-mono text-sm">{file.mqmScore.toFixed(1)}</span>
    //   instead of <ScoreBadge score={file.mqmScore} size="sm" />.
    //   The mock above replaces ScoreBadge with a test double that renders
    //   data-testid="score-badge", which will NOT be present in the current code.

    const { RecentFilesTable } = await import('./RecentFilesTable')
    const { container } = render(<RecentFilesTable files={MOCK_FILES} />)

    // ScoreBadge mock renders with data-testid="score-badge"
    const scoreBadges = screen.getAllByTestId('score-badge')
    expect(scoreBadges.length).toBeGreaterThanOrEqual(1)

    // The score "92.5" should be displayed via the ScoreBadge component
    const numericBadge = scoreBadges.find((el) => el.getAttribute('data-score') === '92.5')
    expect(numericBadge).toBeTruthy()
    expect(numericBadge?.textContent).toBe('92.5')

    // There should NOT be a raw font-mono span for score display (scoped to container)
    const rawSpans = container.querySelectorAll('.font-mono.text-sm')
    expect(rawSpans.length).toBe(0)
  })

  // 7.2 [P1] Null score should render via ScoreBadge with "N/A" text
  it('[P1] should render null score using ScoreBadge with score=null', async () => {
    // WHAT: When a file has no MQM score (mqmScore is null), the ScoreBadge component
    //   should be rendered with score={null}, which displays "N/A" text in a muted style.
    //   This replaces the current raw <span className="text-muted-foreground">&mdash;</span>
    //   (em dash character) with the standardized ScoreBadge null representation.
    // WHY WILL FAIL: Current implementation at lines 62-64 renders a raw
    //   <span className="text-muted-foreground">&mdash;</span> for null scores.
    //   After the fix, it should render <ScoreBadge score={null} size="sm" />,
    //   which our mock translates to data-testid="score-badge" with "N/A" text.

    const { RecentFilesTable } = await import('./RecentFilesTable')
    const { container } = render(<RecentFilesTable files={MOCK_FILES} />)

    // Find all ScoreBadge instances — should include one for the null score
    const scoreBadges = screen.getAllByTestId('score-badge')
    // React omits data-score attribute when value is null, so getAttribute returns null (not string "null")
    const nullBadge = scoreBadges.find((el) => el.getAttribute('data-score') === null)
    expect(nullBadge).toBeTruthy()
    expect(nullBadge?.textContent).toBe('N/A')

    // The raw em dash span should NOT be present (scoped to container)
    const mdashSpans = container.querySelectorAll('.text-muted-foreground')
    const hasMdash = Array.from(mdashSpans).some((el) => el.textContent === '\u2014')
    expect(hasMdash).toBe(false)
  })

  // 7.3 [P1] Failed status should render destructive badge variant
  it('[P1] should render failed status with destructive badge variant', async () => {
    const failedFile: RecentFileRow = {
      id: 'd4e5f6a7-b8c9-4d4e-bf5a-6b7c8d9e0f1a',
      fileName: 'failed-file.sdlxliff',
      projectId: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
      projectName: 'Test Project',
      status: 'failed',
      createdAt: '2026-03-01T08:00:00Z',
      mqmScore: null,
      findingsCount: 0,
    }

    const { RecentFilesTable } = await import('./RecentFilesTable')
    render(<RecentFilesTable files={[failedFile]} />)

    const badge = screen.getByText('failed')
    expect(badge).toBeTruthy()
    // Badge with destructive variant has data-variant="destructive" (shadcn convention)
    expect(badge.className).toMatch(/destructive/)
  })

  // 7.4 [P1] Processing statuses should render secondary badge variant
  it('[P1] should render processing statuses with secondary badge variant', async () => {
    const processingFile: RecentFileRow = {
      id: 'e5f6a7b8-c9d0-4e5f-ca6b-7c8d9e0f1a2b',
      fileName: 'processing-file.sdlxliff',
      projectId: 'b2c3d4e5-f6a7-4b2c-9d3e-4f5a6b7c8d9e',
      projectName: 'Test Project',
      status: 'l2_processing',
      createdAt: '2026-03-01T07:00:00Z',
      mqmScore: null,
      findingsCount: 0,
    }

    const { RecentFilesTable } = await import('./RecentFilesTable')
    render(<RecentFilesTable files={[processingFile]} />)

    const badge = screen.getByText('l2_processing')
    expect(badge).toBeTruthy()
    expect(badge.className).toMatch(/secondary/)
  })
})
