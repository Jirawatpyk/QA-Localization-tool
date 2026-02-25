/// <reference types="vitest/globals" />

// xbenchCategoryMapper: Maps Xbench check type names to the tool's MQM category taxonomy.
// Must handle known check types, case-insensitive matching, and unknown fallback.

describe('xbenchCategoryMapper', () => {
  // ── P0: Known mappings ──

  it('[P0] should map all known Xbench check types to tool categories', async () => {
    const { mapXbenchCategory } = await import('./xbenchCategoryMapper')

    // Known Xbench check types and their expected tool categories
    const knownMappings: Array<[string, string]> = [
      ['Inconsistency in Source', 'consistency'],
      ['Inconsistency in Target', 'consistency'],
      ['Key Term Mismatch', 'terminology'],
      ['Untranslated', 'completeness'],
      ['Target same as Source', 'completeness'],
      ['Tag Mismatch', 'fluency'],
      ['Number Mismatch', 'accuracy'],
      ['Double Space', 'fluency'],
      ['Double Blank', 'fluency'],
      ['Repeated Words', 'fluency'],
      ['Spell Check', 'fluency'],
    ]

    for (const [xbenchType, expectedCategory] of knownMappings) {
      const result = mapXbenchCategory(xbenchType)
      expect(result).toBe(expectedCategory)
    }
  })

  // ── P1: Fuzzy matching and fallback ──

  it('[P1] should match category names case-insensitively', async () => {
    const { mapXbenchCategory } = await import('./xbenchCategoryMapper')

    // Xbench exports may vary in case
    expect(mapXbenchCategory('INCONSISTENCY IN SOURCE')).toBe('consistency')
    expect(mapXbenchCategory('inconsistency in source')).toBe('consistency')
    expect(mapXbenchCategory('Key term mismatch')).toBe('terminology')
    expect(mapXbenchCategory('NUMBER MISMATCH')).toBe('accuracy')
  })

  it('[P1] should return fallback for unknown check type', async () => {
    const { mapXbenchCategory } = await import('./xbenchCategoryMapper')

    // Unknown Xbench check type → should return a generic fallback category
    const result = mapXbenchCategory('Completely Unknown Check Type')
    expect(result).toBe('other')
  })
})

describe('mapXbenchToToolCategory', () => {
  // ── P0: Tool category mappings ──

  it('[P0] should map known Xbench check types to tool rule engine categories', async () => {
    const { mapXbenchToToolCategory } = await import('./xbenchCategoryMapper')

    const knownMappings: Array<[string, string]> = [
      ['Inconsistency in Source', 'consistency'],
      ['Inconsistency in Target', 'consistency'],
      ['Key Term Mismatch', 'key_term'],
      ['Untranslated', 'completeness'],
      ['Target same as Source', 'completeness'],
      ['Tag Mismatch', 'tag_integrity'],
      ['Number Mismatch', 'number_format'],
      ['Numeric Mismatch', 'number_format'],
      ['Double Space', 'spacing'],
      ['Double Blank', 'spacing'],
      ['Repeated Word', 'repeated_word'],
      ['Repeated Words', 'repeated_word'],
      ['Spell Check', 'fluency'],
    ]

    for (const [xbenchType, expectedCategory] of knownMappings) {
      expect(mapXbenchToToolCategory(xbenchType)).toBe(expectedCategory)
    }
  })

  it('[P1] should match case-insensitively', async () => {
    const { mapXbenchToToolCategory } = await import('./xbenchCategoryMapper')

    expect(mapXbenchToToolCategory('TAG MISMATCH')).toBe('tag_integrity')
    expect(mapXbenchToToolCategory('number mismatch')).toBe('number_format')
    expect(mapXbenchToToolCategory('Key Term Mismatch')).toBe('key_term')
  })

  it('[P1] should return other for unknown check type', async () => {
    const { mapXbenchToToolCategory } = await import('./xbenchCategoryMapper')

    expect(mapXbenchToToolCategory('Unknown Check')).toBe('other')
  })

  it('[P1] should differ from MQM mapping for categories like Tag Mismatch', async () => {
    const { mapXbenchCategory, mapXbenchToToolCategory } = await import('./xbenchCategoryMapper')

    // Tag Mismatch: MQM → fluency, Tool → tag_integrity
    expect(mapXbenchCategory('Tag Mismatch')).toBe('fluency')
    expect(mapXbenchToToolCategory('Tag Mismatch')).toBe('tag_integrity')

    // Number Mismatch: MQM → accuracy, Tool → number_format
    expect(mapXbenchCategory('Number Mismatch')).toBe('accuracy')
    expect(mapXbenchToToolCategory('Number Mismatch')).toBe('number_format')
  })
})
