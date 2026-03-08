// Story 1.5: Glossary Matching Engine for No-space Languages

import { describe, expect, it } from 'vitest'

import { MAX_SEGMENTER_CHUNK, chunkText, stripMarkup, stripZeroWidth } from './markupStripper'

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

describe('chunkText — emoji at chunk boundary (TA expansion)', () => {
  it('should keep surrogate pair intact when emoji sits at chunk boundary', () => {
    // Build text where char at position MAX_SEGMENTER_CHUNK-1 is start of emoji surrogate pair "😀"
    const prefix = 'ก'.repeat(MAX_SEGMENTER_CHUNK - 1)
    const text = prefix + '😀' + 'ก'.repeat(3) // total = MAX_SEGMENTER_CHUNK - 1 + 2 (surrogate pair) + 3 = MAX_SEGMENTER_CHUNK + 4
    expect(text.length).toBe(MAX_SEGMENTER_CHUNK + 4) // "😀" is 2 JS chars (surrogate pair)

    const chunks = chunkText(text)
    const reconstructed = chunks.map((c) => c.chunk).join('')
    expect(reconstructed).toBe(text)
    expect(reconstructed).toContain('😀')

    // Verify no chunk contains a lone surrogate (surrogate pair stays intact)
    for (const { chunk } of chunks) {
      const lastCharCode = chunk.charCodeAt(chunk.length - 1)
      // Last char should NOT be a high surrogate (would mean pair was split)
      expect(lastCharCode >= 0xd800 && lastCharCode <= 0xdbff).toBe(false)
    }
  })
})

describe('stripZeroWidth', () => {
  it('should remove U+200B Zero-Width Space from Thai text', () => {
    expect(stripZeroWidth('โรง\u200Bพยาบาล')).toBe('โรงพยาบาล')
  })

  it('should remove U+200D Zero-Width Joiner', () => {
    expect(stripZeroWidth('โรง\u200Dพยาบาล')).toBe('โรงพยาบาล')
  })

  it('should remove U+200C Zero-Width Non-Joiner', () => {
    expect(stripZeroWidth('te\u200Cst')).toBe('test')
  })

  it('should remove U+FEFF BOM', () => {
    expect(stripZeroWidth('\uFEFFhello')).toBe('hello')
  })

  it('should remove multiple different zero-width chars in one string', () => {
    expect(stripZeroWidth('\uFEFFโรง\u200Bพยา\u200Dบาล\u200C')).toBe('โรงพยาบาล')
  })

  it('should return unchanged text when no zero-width chars present', () => {
    const text = 'โรงพยาบาล'
    expect(stripZeroWidth(text)).toBe(text)
  })

  it('should handle empty string', () => {
    expect(stripZeroWidth('')).toBe('')
  })

  it('should return empty string when text is entirely zero-width chars', () => {
    expect(stripZeroWidth('\u200B\u200C\u200D\uFEFF')).toBe('')
  })
})

describe('stripMarkup — markup-only input (TA expansion)', () => {
  it('should replace all-markup-and-placeholder text with spaces preserving length', () => {
    const input = '<b><i>{0}</i></b>'
    const stripped = stripMarkup(input)
    expect(stripped.length).toBe(input.length)
    expect(stripped).toBe(' '.repeat(input.length))
  })
})
