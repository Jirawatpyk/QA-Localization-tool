/// <reference types="vitest/globals" />

// xbenchCategoryMapper: Maps Xbench check type names to the tool's MQM category taxonomy.
// Must handle known check types, case-insensitive matching, and unknown fallback.

describe('xbenchCategoryMapper', () => {
  // ── P0: Known mappings ──

  it.skip('[P0] should map all known Xbench check types to tool categories', async () => {
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

  it.skip('[P1] should match category names case-insensitively', async () => {
    const { mapXbenchCategory } = await import('./xbenchCategoryMapper')

    // Xbench exports may vary in case
    expect(mapXbenchCategory('INCONSISTENCY IN SOURCE')).toBe('consistency')
    expect(mapXbenchCategory('inconsistency in source')).toBe('consistency')
    expect(mapXbenchCategory('Key term mismatch')).toBe('terminology')
    expect(mapXbenchCategory('NUMBER MISMATCH')).toBe('accuracy')
  })

  it.skip('[P1] should return fallback for unknown check type', async () => {
    const { mapXbenchCategory } = await import('./xbenchCategoryMapper')

    // Unknown Xbench check type → should return a generic fallback category
    const result = mapXbenchCategory('Completely Unknown Check Type')
    expect(result).toBe('other')
  })
})
