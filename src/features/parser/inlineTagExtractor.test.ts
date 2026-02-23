import { describe, expect, it } from 'vitest'

import { extractInlineTags } from './inlineTagExtractor'

// Helper to build a text node in fast-xml-parser preserveOrder format
function textNode(text: string) {
  return { '#text': text }
}

// Helper to build a tag node
function tagNode(
  name: string,
  id: string,
  children: Record<string, unknown>[] = [],
  extraAttrs: Record<string, string> = {},
) {
  return {
    [name]: children,
    ':@': { '@_id': id, ...extraAttrs },
  }
}

// Self-closing tag (no children needed, but array still used)
function selfClosingTag(name: string, id: string, extraAttrs: Record<string, string> = {}) {
  return tagNode(name, id, [], extraAttrs)
}

describe('extractInlineTags', () => {
  describe('plain text (no tags)', () => {
    it('should return empty tags array and plain text for tag-free content', () => {
      const result = extractInlineTags([textNode('Hello world')])
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.plainText).toBe('Hello world')
      expect(result.tags).toHaveLength(0)
    })

    it('should return empty string for empty nodes array', () => {
      const result = extractInlineTags([])
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.plainText).toBe('')
      expect(result.tags).toHaveLength(0)
    })
  })

  describe('<x/> self-closing tag', () => {
    it('should extract x tag with correct position and id', () => {
      // "Hello [x/] world" → "Hello  world"
      const result = extractInlineTags([
        textNode('Hello '),
        selfClosingTag('x', '1'),
        textNode(' world'),
      ])
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.plainText).toBe('Hello  world')
      expect(result.tags).toHaveLength(1)
      expect(result.tags[0]).toMatchObject({ type: 'x', id: '1', position: 6 })
    })
  })

  describe('<ph/> placeholder tag', () => {
    it('should extract ph tag at correct position', () => {
      const result = extractInlineTags([selfClosingTag('ph', '2'), textNode('Click here')])
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.plainText).toBe('Click here')
      expect(result.tags).toHaveLength(1)
      expect(result.tags[0]).toMatchObject({ type: 'ph', id: '2', position: 0 })
    })
  })

  describe('<g> wrapping tag', () => {
    it('should extract g tag and include child text in plain text', () => {
      // "Click <g>here</g> to continue"
      const result = extractInlineTags([
        textNode('Click '),
        tagNode('g', '1', [textNode('here')]),
        textNode(' to continue'),
      ])
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.plainText).toBe('Click here to continue')
      expect(result.tags).toHaveLength(1)
      expect(result.tags[0]).toMatchObject({ type: 'g', id: '1', position: 6 })
    })

    it('should handle g tag with no children', () => {
      const result = extractInlineTags([textNode('A'), tagNode('g', '5', []), textNode('B')])
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.plainText).toBe('AB')
      expect(result.tags[0]).toMatchObject({ type: 'g', id: '5', position: 1 })
    })
  })

  describe('<bpt>/<ept> paired tags', () => {
    it('should extract bpt and ept pair with matching ids', () => {
      const result = extractInlineTags([
        tagNode('bpt', '3', [textNode('bold')]),
        textNode('bold text'),
        selfClosingTag('ept', '3'),
      ])
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.plainText).toBe('bold text')
      expect(result.tags).toHaveLength(2)
      expect(result.tags[0]).toMatchObject({ type: 'bpt', id: '3', position: 0, content: 'bold' })
      expect(result.tags[1]).toMatchObject({ type: 'ept', id: '3', position: 9 })
    })

    it('should return error for unmatched ept tag', () => {
      const result = extractInlineTags([selfClosingTag('ept', '99')])
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.code).toBe('TAG_MISMATCH')
      expect(result.error.message).toContain('99')
    })

    it('should handle bpt with no text children — content field must be undefined (L4)', () => {
      const result = extractInlineTags([
        tagNode('bpt', '5', []),
        textNode('text'),
        selfClosingTag('ept', '5'),
      ])
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.tags[0]).toMatchObject({ type: 'bpt', id: '5', position: 0 })
      expect(result.tags[0]?.content).toBeUndefined()
    })

    it('should return TAG_MISMATCH for ept whose id does not match open bpt (L5)', () => {
      // bpt opened with id="1", ept closes with id="2" — no matching bpt for "2"
      const result = extractInlineTags([
        tagNode('bpt', '1', [textNode('open')]),
        selfClosingTag('ept', '2'),
      ])
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.code).toBe('TAG_MISMATCH')
    })
  })

  describe('<bx/>/<ex/> paired tags', () => {
    it('should extract bx and ex pair with matching ids', () => {
      const result = extractInlineTags([
        textNode('Start'),
        selfClosingTag('bx', '4'),
        textNode(' middle '),
        selfClosingTag('ex', '4'),
        textNode('End'),
      ])
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.plainText).toBe('Start middle End')
      expect(result.tags).toHaveLength(2)
      expect(result.tags[0]).toMatchObject({ type: 'bx', id: '4', position: 5 })
      expect(result.tags[1]).toMatchObject({ type: 'ex', id: '4', position: 13 })
    })

    it('should return error for unmatched ex tag', () => {
      const result = extractInlineTags([selfClosingTag('ex', '77')])
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.code).toBe('TAG_MISMATCH')
    })

    it('should return error for unclosed bx tag', () => {
      const result = extractInlineTags([selfClosingTag('bx', '10'), textNode('text')])
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.code).toBe('TAG_MISMATCH')
      expect(result.error.message).toContain('10')
    })
  })

  describe('nested inline tags', () => {
    it('should handle nested g tags and flatten to position list', () => {
      // <g id="1"><g id="2">inner</g></g>
      const result = extractInlineTags([
        tagNode('g', '1', [tagNode('g', '2', [textNode('inner')])]),
      ])
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.plainText).toBe('inner')
      expect(result.tags).toHaveLength(2)
      expect(result.tags[0]).toMatchObject({ type: 'g', id: '1', position: 0 })
      expect(result.tags[1]).toMatchObject({ type: 'g', id: '2', position: 0 })
    })
  })

  describe('all 7 tag types in one segment', () => {
    it('should extract all 7 inline tag types correctly', () => {
      const result = extractInlineTags([
        tagNode('g', 'g1', [textNode('wrapped')]),
        selfClosingTag('x', 'x1'),
        selfClosingTag('ph', 'ph1'),
        selfClosingTag('bx', 'bx1'),
        textNode('content'),
        selfClosingTag('ex', 'bx1'),
        tagNode('bpt', 'bpt1', [textNode('open')]),
        textNode('bold'),
        selfClosingTag('ept', 'bpt1'),
      ])
      expect(result.success).toBe(true)
      if (!result.success) return
      const types = result.tags.map((t) => t.type)
      expect(types).toContain('g')
      expect(types).toContain('x')
      expect(types).toContain('ph')
      expect(types).toContain('bx')
      expect(types).toContain('ex')
      expect(types).toContain('bpt')
      expect(types).toContain('ept')
    })
  })

  describe('multiple text nodes concatenation', () => {
    it('should concatenate multiple consecutive text nodes', () => {
      const result = extractInlineTags([textNode('Hello'), textNode(' '), textNode('world')])
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.plainText).toBe('Hello world')
    })
  })

  describe('numeric text content', () => {
    it('should convert numeric text node values to string', () => {
      const result = extractInlineTags([{ '#text': 42 }])
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.plainText).toBe('42')
    })
  })

  describe('attributes handling', () => {
    it('should store extra attributes without @_ prefix', () => {
      const result = extractInlineTags([{ x: [], ':@': { '@_id': '1', '@_ctype': 'bold' } }])
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.tags[0]?.attributes).toEqual({ ctype: 'bold' })
    })

    it('should return undefined attributes when no extra attrs', () => {
      const result = extractInlineTags([selfClosingTag('x', '1')])
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.tags[0]?.attributes).toBeUndefined()
    })
  })
})
