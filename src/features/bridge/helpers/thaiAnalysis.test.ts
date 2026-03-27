/**
 * ATDD Story 5.1 — thaiAnalysis unit tests
 *
 * Tests Thai-specific BT quality analysis:
 *   - Tone marker counting (AC3)
 *   - Tone marker preservation rate >= 98% (AC3 boundary)
 *   - Compound word recognition >= 90% (AC3 boundary)
 */

import { describe, it, expect } from 'vitest'

import {
  countThaiToneMarkers,
  verifyToneMarkerPreservation,
  verifyCompoundWordRecognition,
} from './thaiAnalysis'

describe('thaiAnalysis', () => {
  // ── AC3 / Scenario 3.4 [P1]: Tone marker counting ─────────────────────
  describe('countThaiToneMarkers', () => {
    it('should count Thai tone markers in text', () => {
      // Thai has 4 tone marks: ่ (mai ek), ้ (mai tho), ๊ (mai tri), ๋ (mai chattawa)
      const text = 'ต้นไม้ใหญ่' // contains ้ (mai tho) and ่ (mai ek)
      const count = countThaiToneMarkers(text)

      expect(count).toBeGreaterThan(0)
    })

    it('should return 0 for text without tone markers', () => {
      const text = 'กขค' // consonants only, no tone marks
      const count = countThaiToneMarkers(text)

      expect(count).toBe(0)
    })

    it('should count all 4 Thai tone mark types', () => {
      // ่ (mai ek U+0E48), ้ (mai tho U+0E49), ๊ (mai tri U+0E4A), ๋ (mai chattawa U+0E4B)
      const text = 'ก่ ก้ ก๊ ก๋'
      const count = countThaiToneMarkers(text)

      expect(count).toBe(4)
    })
  })

  // ── AC3 / Scenario 3.4 [P1]: Tone marker preservation verification ────
  describe('verifyToneMarkerPreservation', () => {
    it('should verify tone markers in target are referenced in language notes', () => {
      const result = verifyToneMarkerPreservation('ต้นไม้ใหญ่มากครับ', [
        {
          noteType: 'tone_marker' as const,
          originalText: 'ต้น',
          explanation: 'Low tone on ต',
        },
        {
          noteType: 'tone_marker' as const,
          originalText: 'ไม้',
          explanation: 'High tone on ม',
        },
        {
          noteType: 'tone_marker' as const,
          originalText: 'ใหญ่',
          explanation: 'Low tone on ญ',
        },
      ])

      expect(result.rate).toBeGreaterThanOrEqual(0)
      expect(result.rate).toBeLessThanOrEqual(1)
    })

    // ── Boundary value tests: >= 98% threshold ──────────────────────────
    it('should return perfect rate when no tone markers exist', () => {
      const result = verifyToneMarkerPreservation('กขค', [])

      // No markers = 100% preservation (nothing to preserve)
      expect(result.rate).toBe(1.0)
      expect(result.totalMarkers).toBe(0)
    })

    it('should calculate rate based on markers in notes vs target text', () => {
      // Text with 2 tone markers
      const result = verifyToneMarkerPreservation(
        'ต้นไม้', // 2 tone marks: ้ and ้
        [
          {
            noteType: 'tone_marker' as const,
            originalText: 'ต้น', // references 1 tone mark
            explanation: 'Low tone',
          },
        ],
      )

      // 1 out of 2 referenced = 50%
      expect(result.rate).toBe(0.5)
      expect(result.totalMarkers).toBe(2)
      expect(result.referencedMarkers).toBe(1)
    })
  })

  // ── AC3 / Scenario 3.5 [P1]: Compound word recognition ────────────────
  describe('compound word recognition', () => {
    it('should recognize Thai compound words in text', () => {
      const result = verifyCompoundWordRecognition('ไปโรงพยาบาลและมหาวิทยาลัย', [
        {
          noteType: 'compound_word' as const,
          originalText: 'โรงพยาบาล',
          explanation: 'hospital — compound word',
        },
        {
          noteType: 'compound_word' as const,
          originalText: 'มหาวิทยาลัย',
          explanation: 'university — compound word',
        },
      ])

      expect(result.rate).toBe(1.0)
      expect(result.totalCompounds).toBe(2)
      expect(result.recognizedCompounds).toBe(2)
    })

    // ── Boundary: compound recognition at exactly 90% ────────────────
    it('should PASS when compound recognition rate is exactly 90%', () => {
      // 9 out of 10 compound words recognized → 90% → PASS
      // Build text with all 10 known compounds
      const text =
        'โรงพยาบาล มหาวิทยาลัย โรงเรียน สนามบิน ตำรวจ รัฐบาล ธนาคาร ไปรษณีย์ ห้องสมุด โทรศัพท์'
      const notes = [
        'โรงพยาบาล',
        'มหาวิทยาลัย',
        'โรงเรียน',
        'สนามบิน',
        'ตำรวจ',
        'รัฐบาล',
        'ธนาคาร',
        'ไปรษณีย์',
        'ห้องสมุด', // 9 out of 10
      ].map((w) => ({
        noteType: 'compound_word' as const,
        originalText: w,
        explanation: `compound: ${w}`,
      }))

      const result = verifyCompoundWordRecognition(text, notes)
      expect(result.rate).toBeGreaterThanOrEqual(0.9)
    })

    it('should FAIL when compound recognition rate is below 90%', () => {
      // 8 out of 10 = 80% → FAIL
      const text =
        'โรงพยาบาล มหาวิทยาลัย โรงเรียน สนามบิน ตำรวจ รัฐบาล ธนาคาร ไปรษณีย์ ห้องสมุด โทรศัพท์'
      const notes = [
        'โรงพยาบาล',
        'มหาวิทยาลัย',
        'โรงเรียน',
        'สนามบิน',
        'ตำรวจ',
        'รัฐบาล',
        'ธนาคาร',
        'ไปรษณีย์', // 8 out of 10
      ].map((w) => ({
        noteType: 'compound_word' as const,
        originalText: w,
        explanation: `compound: ${w}`,
      }))

      const result = verifyCompoundWordRecognition(text, notes)
      expect(result.rate).toBeLessThan(0.9)
    })
  })
})
