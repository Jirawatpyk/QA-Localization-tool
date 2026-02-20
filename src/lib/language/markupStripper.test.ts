// Story 1.5: Glossary Matching Engine for No-space Languages

import { describe, expect, it } from 'vitest'

import { MAX_SEGMENTER_CHUNK, chunkText, stripMarkup } from './markupStripper'

describe('stripMarkup', () => {
  it('should replace HTML bold tags with equal-length spaces', () => {
    const input = '<b>ข้อความ</b>'
    const stripped = stripMarkup(input)
    expect(stripped.length).toBe(input.length)
    expect(stripped).not.toContain('<b>')
    expect(stripped).not.toContain('</b>')
  })

  it('should preserve character positions — tag chars replaced with spaces', () => {
    const input = '<x id="1"/>ข้อความ'
    const stripped = stripMarkup(input)
    expect(stripped.length).toBe(input.length)
    // ข้อความ must start at same offset as original
    const tagLen = '<x id="1"/>'.length
    expect(stripped.slice(tagLen)).toBe('ข้อความ')
  })

  it('should replace {0} placeholder with spaces', () => {
    const input = '{0} รายการ'
    const stripped = stripMarkup(input)
    expect(stripped.length).toBe(input.length)
    expect(stripped.slice(0, 3)).toBe('   ')
    expect(stripped.slice(3)).toBe(' รายการ')
  })

  it('should replace {name} placeholder with spaces', () => {
    const input = '{name} คือผู้ใช้'
    const stripped = stripMarkup(input)
    expect(stripped.length).toBe(input.length)
    expect(stripped.slice(0, 6)).toBe('      ')
  })

  it('should replace %s format string with spaces', () => {
    const input = '%s รายการ'
    const stripped = stripMarkup(input)
    expect(stripped.length).toBe(input.length)
    expect(stripped.slice(0, 2)).toBe('  ')
  })

  it('should replace %1$s format string with spaces', () => {
    const input = '%1$s รายการ'
    const stripped = stripMarkup(input)
    expect(stripped.length).toBe(input.length)
    expect(stripped.slice(0, 4)).toBe('    ')
  })

  it('should handle empty string without error', () => {
    expect(stripMarkup('')).toBe('')
  })

  it('should return unchanged text when no markup present', () => {
    const text = 'ข้อความภาษาไทยล้วน'
    expect(stripMarkup(text)).toBe(text)
  })

  it('should handle XLIFF g-tag wrapping', () => {
    const input = '<g id="1">คำสำคัญ</g>'
    const stripped = stripMarkup(input)
    expect(stripped.length).toBe(input.length)
    // "คำสำคัญ" is preserved inside
    expect(stripped).toContain('คำสำคัญ')
  })

  it('should handle multiple markup patterns in one string', () => {
    const input = '<b>{0}</b> รายการ'
    const stripped = stripMarkup(input)
    expect(stripped.length).toBe(input.length)
    expect(stripped).toContain('รายการ')
  })
})

describe('chunkText', () => {
  it('should return single chunk for text shorter than MAX_SEGMENTER_CHUNK', () => {
    const text = 'ก'.repeat(100)
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ chunk: text, offset: 0 })
  })

  it('should return single chunk for text exactly MAX_SEGMENTER_CHUNK chars', () => {
    const text = 'ก'.repeat(MAX_SEGMENTER_CHUNK)
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]?.offset).toBe(0)
    expect(chunks[0]?.chunk.length).toBe(MAX_SEGMENTER_CHUNK)
  })

  it('should return 2 chunks for text MAX_SEGMENTER_CHUNK + 1 chars', () => {
    const text = 'ก'.repeat(MAX_SEGMENTER_CHUNK + 1)
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.offset).toBe(0)
    expect(chunks[1]?.offset).toBe(MAX_SEGMENTER_CHUNK)
    expect(chunks[1]?.chunk.length).toBe(1)
  })

  it('should return 3 chunks for text of 2×MAX + 1 chars with correct offsets', () => {
    const text = 'ก'.repeat(MAX_SEGMENTER_CHUNK * 2 + 1)
    const chunks = chunkText(text)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]?.offset).toBe(0)
    expect(chunks[1]?.offset).toBe(MAX_SEGMENTER_CHUNK)
    expect(chunks[2]?.offset).toBe(MAX_SEGMENTER_CHUNK * 2)
  })

  it('should reconstruct original text by joining all chunks', () => {
    const text = 'กขค'.repeat(MAX_SEGMENTER_CHUNK + 100)
    const chunks = chunkText(text)
    const reconstructed = chunks.map((c) => c.chunk).join('')
    expect(reconstructed).toBe(text)
  })
})

describe('MAX_SEGMENTER_CHUNK', () => {
  it('should be 30000', () => {
    expect(MAX_SEGMENTER_CHUNK).toBe(30_000)
  })
})
