/**
 * Tests for WCAG contrast ratio utility.
 */
import { describe, it, expect } from 'vitest'

import {
  parseHex,
  relativeLuminance,
  getContrastRatio,
  blendWithOpacity,
  meetsAANormalText,
  meetsAALargeText,
  meetsNonTextContrast,
} from './a11y-helpers'

describe('a11y-helpers', () => {
  describe('parseHex', () => {
    it('should parse 6-digit hex', () => {
      expect(parseHex('#ff0000')).toEqual([255, 0, 0])
      expect(parseHex('#00ff00')).toEqual([0, 255, 0])
      expect(parseHex('#0000ff')).toEqual([0, 0, 255])
    })

    it('should parse 3-digit shorthand hex', () => {
      expect(parseHex('#f00')).toEqual([255, 0, 0])
      expect(parseHex('#fff')).toEqual([255, 255, 255])
    })

    it('should handle without # prefix', () => {
      expect(parseHex('ff0000')).toEqual([255, 0, 0])
    })

    it('should throw for invalid hex', () => {
      expect(() => parseHex('#gg')).toThrow('Invalid hex color')
    })
  })

  describe('relativeLuminance', () => {
    it('should return 1.0 for white', () => {
      expect(relativeLuminance('#ffffff')).toBeCloseTo(1.0, 4)
    })

    it('should return 0.0 for black', () => {
      expect(relativeLuminance('#000000')).toBeCloseTo(0.0, 4)
    })
  })

  describe('getContrastRatio', () => {
    it('should return 21:1 for black on white', () => {
      expect(getContrastRatio('#000000', '#ffffff')).toBeCloseTo(21.0, 0)
    })

    it('should return 1:1 for same color', () => {
      expect(getContrastRatio('#ff0000', '#ff0000')).toBeCloseTo(1.0, 1)
    })

    it('should be symmetric', () => {
      const r1 = getContrastRatio('#b45309', '#ffffff')
      const r2 = getContrastRatio('#ffffff', '#b45309')
      expect(r1).toBeCloseTo(r2, 5)
    })

    // Known ratio: #b45309 on white = ~5.7:1
    it('should compute known ratio for severity-major', () => {
      const ratio = getContrastRatio('#b45309', '#ffffff')
      expect(ratio).toBeGreaterThanOrEqual(4.5) // passes AA normal text
    })
  })

  describe('blendWithOpacity', () => {
    it('should return foreground at opacity 1.0', () => {
      expect(blendWithOpacity('#ff0000', '#ffffff', 1.0)).toBe('#ff0000')
    })

    it('should return background at opacity 0.0', () => {
      expect(blendWithOpacity('#ff0000', '#ffffff', 0.0)).toBe('#ffffff')
    })

    it('should blend 50% red over white', () => {
      const result = blendWithOpacity('#ff0000', '#ffffff', 0.5)
      const [r, g, b] = [
        parseInt(result.substring(1, 3), 16),
        parseInt(result.substring(3, 5), 16),
        parseInt(result.substring(5, 7), 16),
      ]
      // Should be ~128, ~128, ~128 or close
      expect(r).toBeGreaterThan(100)
      expect(g).toBeGreaterThan(100)
      expect(b).toBeGreaterThan(100)
    })
  })

  describe('threshold helpers', () => {
    it('meetsAANormalText should require >= 4.5:1', () => {
      expect(meetsAANormalText('#000000', '#ffffff')).toBe(true) // 21:1
      expect(meetsAANormalText('#767676', '#ffffff')).toBe(true) // exactly ~4.54:1 (WCAG boundary)
      expect(meetsAANormalText('#777777', '#ffffff')).toBe(false) // ~4.48:1 (just under)
    })

    it('meetsAALargeText should require >= 3:1', () => {
      expect(meetsAALargeText('#000000', '#ffffff')).toBe(true) // 21:1
    })

    it('meetsNonTextContrast should require >= 3:1', () => {
      expect(meetsNonTextContrast('#4f46e5', '#ffffff')).toBe(true) // indigo on white
    })
  })
})
