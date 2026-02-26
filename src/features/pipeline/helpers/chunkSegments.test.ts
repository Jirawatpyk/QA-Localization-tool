import { describe, expect, it } from 'vitest'

import { AI_CHUNK_CHAR_LIMIT, chunkSegments } from './chunkSegments'

function buildSeg(id: string, sourceLen: number, targetLen: number) {
  return {
    id,
    sourceText: 'a'.repeat(sourceLen),
    targetText: 'b'.repeat(targetLen),
  }
}

describe('chunkSegments', () => {
  it('should return empty array for empty segments', () => {
    expect(chunkSegments([])).toEqual([])
  })

  it('should put all segments in one chunk when within limit', () => {
    const segments = [buildSeg('s1', 100, 100), buildSeg('s2', 100, 100)]
    const chunks = chunkSegments(segments, 1000)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.chunkIndex).toBe(0)
    expect(chunks[0]!.segments).toHaveLength(2)
    expect(chunks[0]!.totalChars).toBe(400)
  })

  it('should split into multiple chunks when exceeding limit', () => {
    const segments = [
      buildSeg('s1', 300, 300), // 600 chars
      buildSeg('s2', 300, 300), // 600 chars — 600+600=1200 > 1000, flush s1
      buildSeg('s3', 300, 300), // 600 chars — 600+600=1200 > 1000, flush s2
    ]
    const chunks = chunkSegments(segments, 1000)

    // Each 600-char segment exceeds limit when paired, so each gets its own chunk
    expect(chunks).toHaveLength(3)
    expect(chunks[0]!.segments).toHaveLength(1)
    expect(chunks[1]!.segments).toHaveLength(1)
    expect(chunks[2]!.segments).toHaveLength(1)
  })

  it('should place oversized segment in its own chunk', () => {
    const segments = [
      buildSeg('s1', 100, 100), // 200
      buildSeg('s2', 600, 600), // 1200 (exceeds 1000 limit alone)
      buildSeg('s3', 100, 100), // 200
    ]
    const chunks = chunkSegments(segments, 1000)

    expect(chunks).toHaveLength(3)
    expect(chunks[0]!.segments.map((s) => s.id)).toEqual(['s1'])
    expect(chunks[1]!.segments.map((s) => s.id)).toEqual(['s2'])
    expect(chunks[2]!.segments.map((s) => s.id)).toEqual(['s3'])
  })

  it('should assign sequential chunkIndex values', () => {
    const segments = [buildSeg('s1', 400, 400), buildSeg('s2', 400, 400), buildSeg('s3', 400, 400)]
    const chunks = chunkSegments(segments, 500)

    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2])
  })

  it('should calculate totalChars correctly', () => {
    const segments = [
      buildSeg('s1', 150, 250), // 400
      buildSeg('s2', 100, 200), // 300
    ]
    const chunks = chunkSegments(segments, 10000)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.totalChars).toBe(700)
  })

  it('should use AI_CHUNK_CHAR_LIMIT as default', () => {
    expect(AI_CHUNK_CHAR_LIMIT).toBe(30_000)

    // Single segment well under default limit → one chunk
    const segments = [buildSeg('s1', 100, 100)]
    const chunks = chunkSegments(segments)

    expect(chunks).toHaveLength(1)
  })

  it('should preserve extra fields via generic type', () => {
    const segments = [
      { id: 's1', sourceText: 'hello', targetText: 'สวัสดี', segmentNumber: 1, lang: 'th' },
    ]
    const chunks = chunkSegments(segments, 10000)

    expect(chunks[0]!.segments[0]!.segmentNumber).toBe(1)
    expect(chunks[0]!.segments[0]!.lang).toBe('th')
  })

  it('should handle single segment exactly at limit', () => {
    const segments = [buildSeg('s1', 500, 500)] // 1000 = exact limit
    const chunks = chunkSegments(segments, 1000)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.totalChars).toBe(1000)
  })

  it('should handle many small segments efficiently', () => {
    const segments = Array.from({ length: 100 }, (_, i) => buildSeg(`s${i}`, 50, 50)) // 100 chars each, 10000 total
    const chunks = chunkSegments(segments, 1000)

    // 100 chars per segment, 1000 char limit → ~10 per chunk
    expect(chunks.length).toBeGreaterThanOrEqual(10)
    expect(chunks.every((c) => c.totalChars <= 1000)).toBe(true)
  })
})
