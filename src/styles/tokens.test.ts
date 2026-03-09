/**
 * TDD RED PHASE — Story 4.0: Review Infrastructure Setup
 * Design Token Contrast Verification
 * Pure logic tests — WCAG 2.1 luminance ratio calculations
 */
import { describe, it, expect } from 'vitest'

/**
 * Calculate relative luminance per WCAG 2.1 formula.
 * @see https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const [rL, gL, bL] = [r, g, b].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  )

  return 0.2126 * rL! + 0.7152 * gL! + 0.0722 * bL!
}

/**
 * Calculate contrast ratio per WCAG 2.1.
 * @returns ratio >= 1 (lighter / darker + 0.05)
 */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('Design Token Contrast — Story 4.0', () => {
  it('[P1] T1 boundary: --color-severity-major #b45309 should pass 4.5:1 contrast on white', () => {
    // tokens.css defines --color-severity-major for major severity labels
    // WCAG SC 1.4.3: normal text requires >= 4.5:1 contrast ratio
    const ratio = contrastRatio('#b45309', '#ffffff')
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('[P1] T2 boundary: all finding tinted backgrounds should pass 4.5:1 contrast with foreground text', () => {
    // Per Guardrail #26: 4.5:1 normal text contrast
    // Finding cards use tinted backgrounds with dark text (#1a1a1a / near-black)
    const darkText = '#1a1a1a'
    const tintedBackgrounds = [
      { name: 'accepted-green', bg: '#dcfce7' },
      { name: 'rejected-red', bg: '#fee2e2' },
      { name: 'flagged-yellow', bg: '#fef3c7' },
      { name: 'info-blue', bg: '#dbeafe' },
      { name: 'enhancement-purple', bg: '#ede9fe' },
    ]

    for (const { name, bg } of tintedBackgrounds) {
      const ratio = contrastRatio(bg, darkText)
      // Each tinted background must pass 4.5:1 with dark foreground text
      expect(ratio, `${name} (${bg}) vs dark text should pass 4.5:1`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
