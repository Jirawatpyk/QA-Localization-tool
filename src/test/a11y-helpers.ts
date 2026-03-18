/**
 * WCAG 2.1 contrast ratio utilities for accessibility testing.
 * Pure functions — no DOM access, suitable for unit tests.
 *
 * Implements: SC 1.4.3 (Contrast Minimum), SC 1.4.11 (Non-text Contrast)
 */

/**
 * Parse a hex color (#RGB or #RRGGBB) to [r, g, b] array (0-255).
 */
export function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  if (clean.length === 3) {
    return [
      parseInt(clean[0]! + clean[0]!, 16),
      parseInt(clean[1]! + clean[1]!, 16),
      parseInt(clean[2]! + clean[2]!, 16),
    ]
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.substring(0, 2), 16),
      parseInt(clean.substring(2, 4), 16),
      parseInt(clean.substring(4, 6), 16),
    ]
  }
  throw new Error(`Invalid hex color: ${hex}`)
}

/**
 * Compute WCAG 2.1 relative luminance.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex)
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  )
  return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!
}

/**
 * Compute WCAG contrast ratio between two hex colors.
 * Returns value >= 1.0 (always lighter / darker order).
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Blend a foreground color with opacity over a background color.
 * Returns the resulting hex color (opaque).
 */
export function blendWithOpacity(fg: string, bg: string, opacity: number): string {
  const [fr, fg2, fb] = parseHex(fg)
  const [br, bg2, bb] = parseHex(bg)
  const r = Math.round(fr * opacity + br * (1 - opacity))
  const g = Math.round(fg2 * opacity + bg2 * (1 - opacity))
  const b = Math.round(fb * opacity + bb * (1 - opacity))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Check if contrast ratio meets WCAG AA for normal text (>= 4.5:1).
 */
export function meetsAANormalText(hex1: string, hex2: string): boolean {
  return getContrastRatio(hex1, hex2) >= 4.5
}

/**
 * Check if contrast ratio meets WCAG AA for large text (>= 3:1).
 */
export function meetsAALargeText(hex1: string, hex2: string): boolean {
  return getContrastRatio(hex1, hex2) >= 3.0
}

/**
 * Check if contrast ratio meets WCAG AA for non-text UI (>= 3:1).
 * SC 1.4.11
 */
export function meetsNonTextContrast(hex1: string, hex2: string): boolean {
  return getContrastRatio(hex1, hex2) >= 3.0
}
