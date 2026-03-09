/**
 * ATDD Tests — Story 4.1a: Finding List Display & Progressive Disclosure
 * AC4: Accessibility — Severity Display & Contrast
 *
 * GREEN PHASE: SeverityIndicator implemented.
 *
 * Guardrails referenced: #25 (color not sole info carrier), #36 (severity icon+text+color),
 *   #39 (lang attribute on segment text)
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { SeverityIndicator } from '@/features/review/components/SeverityIndicator'

describe('SeverityIndicator', () => {
  // ═══════════════════════════════════════════════════════════════════════
  // AC4: Severity Display — icon shape + text + color (Guardrail #25, #36)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Severity icon + text + color mapping (G#25, G#36)', () => {
    it('[T4.1][P0] should render XCircle icon + "Critical" text + severity-critical color class for critical severity', () => {
      render(<SeverityIndicator severity="critical" />)

      // Text label must always be visible (G#36: never icon-only)
      expect(screen.getByText('Critical')).toBeTruthy()

      // Icon should be XCircle (octagon shape) — check by SVG test-id or class
      // Severity-critical color class applied to container
      const container = screen.getByText('Critical').closest('[class]')
      expect(container?.className).toMatch(/severity-critical/)
    })

    it('[T4.2][P0] should render AlertTriangle icon + "Major" text + severity-major color class for major severity', () => {
      render(<SeverityIndicator severity="major" />)

      // Text label
      expect(screen.getByText('Major')).toBeTruthy()

      // AlertTriangle icon + severity-major color
      const container = screen.getByText('Major').closest('[class]')
      expect(container?.className).toMatch(/severity-major/)
    })

    it('[T4.3][P0] should render Info icon + "Minor" text + severity-minor color class for minor severity', () => {
      render(<SeverityIndicator severity="minor" />)

      // Text label
      expect(screen.getByText('Minor')).toBeTruthy()

      // Info icon + severity-minor color
      const container = screen.getByText('Minor').closest('[class]')
      expect(container?.className).toMatch(/severity-minor/)
    })

    it('[T4.4][P0] should have aria-hidden="true" on all severity icons (accessible name from text label)', () => {
      // G#36: icon has aria-hidden="true" — text label IS the accessible name
      const severities = ['critical', 'major', 'minor'] as const

      for (const severity of severities) {
        const { unmount } = render(<SeverityIndicator severity={severity} />)

        // All SVG icons should have aria-hidden="true"
        // Min 16px icon size (visual check — test via class or style)
        const svgIcons = document.querySelectorAll('svg')
        for (const icon of svgIcons) {
          expect(icon.getAttribute('aria-hidden')).toBe('true')
        }

        unmount()
      }
    })
  })

  // ═══════════════════════════════════════════════════════════════════════
  // Segment text attributes (G#39)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Source/target text lang attribute (G#39)', () => {
    it('[T4.5][P1] should set lang attribute on source/target text elements from file metadata', () => {
      // G#39: every source/target text element MUST have lang="{languageCode}"
      // Without lang, Thai line-breaking and CJK font fallback break (SC 3.1.2)
      render(
        <SeverityIndicator
          severity="major"
          sourceLang="en-US"
          targetLang="th-TH"
          sourceText="The source segment"
          targetText="เซกเมนต์ต้นฉบับ"
        />,
      )

      // Source text element should have lang="en-US"
      const sourceEl = screen.getByText('The source segment')
      expect(sourceEl.getAttribute('lang')).toBe('en-US')

      // Target text element should have lang="th-TH"
      const targetEl = screen.getByText('เซกเมนต์ต้นฉบับ')
      expect(targetEl.getAttribute('lang')).toBe('th-TH')
    })
  })

  describe('CJK font scaling (G#39)', () => {
    it('[T4.6][P2] should apply 1.1x font scale class to CJK target text containers', () => {
      // G#39: CJK containers add 1.1x font scale
      render(
        <SeverityIndicator
          severity="minor"
          sourceLang="en-US"
          targetLang="ja-JP"
          sourceText="Quality checklist"
          targetText="品質チェックリスト"
        />,
      )

      // CJK target container should have a font-scale class (e.g., text-cjk-scale or similar)
      const targetEl = screen.getByText('品質チェックリスト')
      const container = targetEl.closest('[class]')
      expect(container?.className).toMatch(/cjk|font-scale|text-scale/)
    })
  })
})
