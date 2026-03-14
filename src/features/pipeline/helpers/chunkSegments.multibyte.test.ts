import { describe, expect, it } from 'vitest'

import { chunkSegments } from './chunkSegments'

/**
 * Build a segment with real multi-byte text for source and target.
 */
function buildMultibyteSeg(id: string, sourceText: string, targetText: string) {
  return { id, sourceText, targetText }
}

describe('chunkSegments — multi-byte text (R3-029)', () => {
  it('[P0] should keep Thai text with sara am (U+0E33) whole at chunk boundary', () => {
    // Thai: "ทำงาน" contains sara am (U+0E33) as part of "ทำ"
    // sara am U+0E33 is a single UTF-16 code unit (.length = 1 per char)
    const thaiText = 'ทำงานที่ดีมากสำหรับการทดสอบระบบ' // 16 chars
    const seg1 = buildMultibyteSeg('s1', thaiText, thaiText) // 32 chars total
    const seg2 = buildMultibyteSeg('s2', thaiText, thaiText) // 32 chars total

    // charLimit = 50: seg1 (32) fits, seg1+seg2 (64) exceeds → seg2 goes to chunk 2
    const chunks = chunkSegments([seg1, seg2], 50)

    expect(chunks).toHaveLength(2)
    expect(chunks[0]!.segments).toHaveLength(1)
    expect(chunks[0]!.segments[0]!.id).toBe('s1')
    // Verify segment text is intact — sara am not split
    expect(chunks[0]!.segments[0]!.sourceText).toBe(thaiText)
    expect(chunks[1]!.segments).toHaveLength(1)
    expect(chunks[1]!.segments[0]!.id).toBe('s2')
    expect(chunks[1]!.segments[0]!.sourceText).toBe(thaiText)
  })

  it('[P0] should keep CJK text (Japanese kanji) whole at chunk boundary', () => {
    // Japanese kanji — each char is a single UTF-16 code unit
    const japaneseSource = '品質管理ツールのテスト項目を確認する' // 17 chars
    const japaneseTarget = '品質管理ツールのテスト項目を検証する' // 17 chars
    const seg1 = buildMultibyteSeg('s1', japaneseSource, japaneseTarget) // 34 chars
    const seg2 = buildMultibyteSeg('s2', japaneseSource, japaneseTarget) // 34 chars
    const seg3 = buildMultibyteSeg('s3', japaneseSource, japaneseTarget) // 34 chars

    // charLimit = 60: seg1 (34) fits, seg1+seg2 (68) exceeds → flush after seg1
    const chunks = chunkSegments([seg1, seg2, seg3], 60)

    expect(chunks).toHaveLength(3)
    // Each segment in its own chunk since 34+34 > 60
    expect(chunks[0]!.segments.map((s) => s.id)).toEqual(['s1'])
    expect(chunks[1]!.segments.map((s) => s.id)).toEqual(['s2'])
    expect(chunks[2]!.segments.map((s) => s.id)).toEqual(['s3'])
    // Verify Japanese text integrity
    expect(chunks[0]!.segments[0]!.sourceText).toBe(japaneseSource)
    expect(chunks[1]!.segments[0]!.targetText).toBe(japaneseTarget)
  })

  it('[P0] should count Thai combining characters correctly by .length', () => {
    // Thai vowels/tone marks are combining characters (e.g., U+0E35 sara ii, U+0E49 mai chattawa)
    // "นี้" = น (U+0E19) + ◌ี (U+0E35) + ◌้ (U+0E49) = 3 UTF-16 code units
    // "ดำ" = ด (U+0E14) + ◌ำ (U+0E33) = 2 UTF-16 code units
    // Each combining mark is its own code unit, so .length includes them all
    const thaiWithCombining = 'นี้ดำเนินการทดสอบคุณภาพ' // base + combining marks
    const sourceLen = thaiWithCombining.length // 23 (combining marks each count as 1)
    const seg1 = buildMultibyteSeg('s1', thaiWithCombining, thaiWithCombining)
    const expectedChars = sourceLen * 2

    const chunks = chunkSegments([seg1], 1000)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.totalChars).toBe(expectedChars)
    // Verify that .length counts UTF-16 code units (combining chars count individually)
    expect(sourceLen).toBe(23)
    expect(expectedChars).toBe(46)
  })

  it('[P0] should split at segment boundary when mixed Thai+English hits exact charLimit', () => {
    // Mixed segment: Thai + English
    // 'ทดสอบ test QA' = 13 UTF-16 code units, 'Testing QA' = 10
    const mixedSource = 'ทดสอบ test QA'
    const mixedTarget = 'Testing QA'
    const seg1Total = mixedSource.length + mixedTarget.length // 23

    const seg1 = buildMultibyteSeg('s1', mixedSource, mixedTarget)

    // Next segment should go to new chunk when seg1 exactly fills the limit
    const seg2 = buildMultibyteSeg('s2', 'ข้อมูล', 'data') // 6 + 4 = 10 chars

    // charLimit = seg1Total: seg1 exactly fills it, adding seg2 exceeds → new chunk
    const chunks = chunkSegments([seg1, seg2], seg1Total)

    expect(chunks).toHaveLength(2)
    expect(chunks[0]!.segments.map((s) => s.id)).toEqual(['s1'])
    expect(chunks[0]!.totalChars).toBe(seg1Total)
    expect(chunks[1]!.segments.map((s) => s.id)).toEqual(['s2'])
    expect(chunks[1]!.totalChars).toBe(10)
  })

  it('[P0] should place single oversized Thai segment alone in its own chunk with correct totalChars', () => {
    // Build a large Thai text > 100 chars (our test charLimit)
    // Repeat a Thai phrase to exceed the limit
    const thaiPhrase = 'การทดสอบระบบการแปลภาษา' // 11 chars
    const repeats = 10
    const longThaiSource = thaiPhrase.repeat(repeats) // 110 chars
    const longThaiTarget = thaiPhrase.repeat(repeats) // 110 chars
    const expectedTotalChars = longThaiSource.length + longThaiTarget.length // 220

    const oversizedSeg = buildMultibyteSeg('oversized', longThaiSource, longThaiTarget)
    const normalSeg = buildMultibyteSeg('normal', 'สวัสดี', 'hello') // 6+5 = 11 chars

    // charLimit = 100: oversized (220) exceeds limit, placed alone
    const chunks = chunkSegments([normalSeg, oversizedSeg], 100)

    expect(chunks).toHaveLength(2)
    // normalSeg fits in first chunk (11 < 100)
    expect(chunks[0]!.segments.map((s) => s.id)).toEqual(['normal'])
    expect(chunks[0]!.totalChars).toBe(11)
    // oversizedSeg alone in second chunk
    expect(chunks[1]!.segments.map((s) => s.id)).toEqual(['oversized'])
    expect(chunks[1]!.totalChars).toBe(expectedTotalChars)
    expect(chunks[1]!.totalChars).toBeGreaterThan(100)
    // Verify text integrity of oversized segment
    expect(chunks[1]!.segments[0]!.sourceText).toBe(longThaiSource)
    expect(chunks[1]!.segments[0]!.targetText).toBe(longThaiTarget)
  })
})
