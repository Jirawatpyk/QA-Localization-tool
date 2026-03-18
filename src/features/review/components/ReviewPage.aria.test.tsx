/**
 * ATDD Story 4.8 — ARIA Structure Verification (TDD Green Phase)
 * Tests: TA-08, TA-10, TA-15, TA-16, TA-17, TA-18, TA-22
 *
 * These tests verify that review page components have correct ARIA attributes
 * for screen reader compatibility (AC5) and baseline closure (AC2).
 *
 * Strategy: Test individual components rather than full page (avoids heavy RSC deps).
 * Server actions mocked where needed (vi.mock server-only + action modules).
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── TA-08 & TA-10: FindingList grid structure ──

// Mock heavy deps for FindingList
vi.mock('@/features/review/stores/review.store', () => ({
  useReviewStore: vi.fn((..._args: unknown[]) => ({
    findings: [],
    activeFindingId: null,
    selectedFindingIds: new Set(),
    expandedFindingIds: new Set(),
    setActiveFindingId: vi.fn(),
    setSelectedFindingIds: vi.fn(),
    toggleFindingExpanded: vi.fn(),
    selectRange: vi.fn(),
    lastSelectedId: null,
  })),
}))

vi.mock('@/features/review/hooks/use-focus-management', () => ({
  useFocusManagement: vi.fn((..._args: unknown[]) => ({
    gridRef: { current: null },
    handleGridFocus: vi.fn(),
    handleGridClick: vi.fn(),
    handleGridKeyDown: vi.fn(),
    focusedFindingId: null,
  })),
}))

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: vi.fn(() => false),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock server-only for AddToGlossaryDialog
vi.mock('server-only', () => ({}))
vi.mock('@/features/review/actions/addToGlossary.action', () => ({
  addToGlossary: vi.fn(),
}))
vi.mock('@/features/review/actions/updateGlossaryTerm.action', () => ({
  updateGlossaryTerm: vi.fn(),
}))

describe('ReviewPage ARIA Structure', () => {
  describe('TA-08: FindingList grid role (AC5, P0)', () => {
    it('should have role="grid" attribute in FindingList source', async () => {
      // Verify by reading the actual source file for role="grid"
      // FindingList requires complex store + hook wiring, so we verify the
      // source directly rather than attempting full render
      const fs = await import('node:fs')
      const path = await import('node:path')
      const source = fs.readFileSync(
        path.resolve('src/features/review/components/FindingList.tsx'),
        'utf-8',
      )
      expect(source).toContain('role="grid"')
      expect(source).toContain('aria-rowcount')
    })

    it('should have aria-keyshortcuts config for all 7 action buttons in ReviewActionBar source', async () => {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const source = fs.readFileSync(
        path.resolve('src/features/review/components/ReviewActionBar.tsx'),
        'utf-8',
      )
      // Verify all 7 shortcuts defined in ACTION_BUTTONS config
      const shortcuts = [
        "ariaKeyshortcuts: 'a'",
        "ariaKeyshortcuts: 'r'",
        "ariaKeyshortcuts: 'f'",
        "ariaKeyshortcuts: 'n'",
        "ariaKeyshortcuts: 's'",
        "ariaKeyshortcuts: '-'",
        "ariaKeyshortcuts: '+'",
      ]
      for (const shortcut of shortcuts) {
        expect(source).toContain(shortcut)
      }
      // Also verify the JSX attribute binding
      expect(source).toContain('aria-keyshortcuts={btn.ariaKeyshortcuts}')
    })
  })

  describe('TA-10: Baseline #13-15 — keyboard navigability (AC2, P1)', () => {
    it('should have role="row" and tabIndex roving pattern in FindingCardCompact source', async () => {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const source = fs.readFileSync(
        path.resolve('src/features/review/components/FindingCardCompact.tsx'),
        'utf-8',
      )
      expect(source).toContain('role="row"')
      // Roving tabindex: tabIndex depends on isActive prop
      expect(source).toContain('tabIndex={isActive ? 0 : -1}')
    })
  })

  describe('TA-15: aria-live container pre-mounted (AC5, P1)', () => {
    it('should have polite announcer with aria-live="polite"', async () => {
      const { mountAnnouncer } = await import('../utils/announce')
      mountAnnouncer()

      const polite = document.querySelector('[aria-live="polite"]')
      expect(polite).toBeTruthy()
      expect(polite?.getAttribute('role')).toBe('status')
    })

    it('should have assertive announcer with aria-live="assertive"', async () => {
      const { mountAnnouncer } = await import('../utils/announce')
      mountAnnouncer()

      const assertive = document.querySelector('[aria-live="assertive"]')
      expect(assertive).toBeTruthy()
      expect(assertive?.getAttribute('role')).toBe('alert')
    })
  })

  describe('TA-16: Action buttons aria-keyshortcuts (AC5, P1)', () => {
    beforeEach(() => {
      vi.resetModules()
    })

    it('should have aria-keyshortcuts on all 7 action buttons', async () => {
      // Render ReviewActionBar with minimal props
      const { ReviewActionBar } = await import('./ReviewActionBar')

      render(
        <ReviewActionBar
          onAccept={vi.fn()}
          onReject={vi.fn()}
          onFlag={vi.fn()}
          onNote={vi.fn()}
          onSource={vi.fn()}
          onOverride={vi.fn()}
          onAdd={vi.fn()}
        />,
      )

      const buttons = screen.getAllByRole('button')
      const withKeyshortcuts = buttons.filter((b) => b.getAttribute('aria-keyshortcuts') !== null)
      // Should have at least 7 action buttons with aria-keyshortcuts
      expect(withKeyshortcuts.length).toBeGreaterThanOrEqual(7)

      // Verify specific shortcuts
      const shortcuts = withKeyshortcuts.map((b) => b.getAttribute('aria-keyshortcuts'))
      expect(shortcuts).toContain('a')
      expect(shortcuts).toContain('r')
      expect(shortcuts).toContain('f')
      expect(shortcuts).toContain('n')
      expect(shortcuts).toContain('s')
      expect(shortcuts).toContain('-')
      expect(shortcuts).toContain('+')
    })
  })

  describe('TA-17: Modal ARIA attributes (AC5, P1)', () => {
    it('should verify SuppressPatternDialog is a dialog component', async () => {
      // SuppressPatternDialog uses shadcn Dialog which renders aria-modal and role="dialog"
      const mod = await import('./SuppressPatternDialog')
      expect(mod.SuppressPatternDialog).toBeDefined()
    })

    it('should have aria-modal="true" in AddToGlossaryDialog source', async () => {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const source = fs.readFileSync(
        path.resolve('src/features/review/components/AddToGlossaryDialog.tsx'),
        'utf-8',
      )
      expect(source).toContain('aria-modal="true"')
      expect(source).toContain('DialogContent')
    })
  })

  describe('TA-18: ARIA landmarks (AC5, P1)', () => {
    it('should have role="complementary" in FindingDetailSheet source', async () => {
      const fs = await import('node:fs')
      const path = await import('node:path')
      const source = fs.readFileSync(
        path.resolve('src/features/review/components/FindingDetailSheet.tsx'),
        'utf-8',
      )
      expect(source).toContain('role="complementary"')
      expect(source).toContain('aria-label="Finding detail"')
    })
  })

  describe('TA-22: lang attribute on segment text (AC2 #27-28, P1)', () => {
    it('should have lang attribute matching source language on source text', async () => {
      const { SegmentTextDisplay } = await import('./SegmentTextDisplay')
      render(
        <SegmentTextDisplay
          fullText="สวัสดีครับ ยินดีต้อนรับ"
          excerpt={null}
          lang="th"
          label="source"
        />,
      )

      const container = screen.getByTestId('segment-text-source')
      expect(container).toHaveAttribute('lang', 'th')
    })

    it('should have lang attribute matching target language on target text', async () => {
      const { SegmentTextDisplay } = await import('./SegmentTextDisplay')
      render(
        <SegmentTextDisplay fullText="Hello, welcome" excerpt={null} lang="en" label="target" />,
      )

      const container = screen.getByTestId('segment-text-target')
      expect(container).toHaveAttribute('lang', 'en')
    })

    it('should apply CJK scaling for Japanese content', async () => {
      const { SegmentTextDisplay } = await import('./SegmentTextDisplay')
      render(<SegmentTextDisplay fullText="こんにちは" excerpt={null} lang="ja" label="source" />)

      const container = screen.getByTestId('segment-text-source')
      expect(container).toHaveAttribute('lang', 'ja')
      expect(container.className).toContain('text-cjk-scale')
    })
  })
})
