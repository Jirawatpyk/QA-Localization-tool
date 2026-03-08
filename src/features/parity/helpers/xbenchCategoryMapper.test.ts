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
      ['Key Term Mismatch', 'glossary_compliance'],
      ['Untranslated', 'completeness'],
      ['Target same as Source', 'completeness'],
      ['Tag Mismatch', 'tag_integrity'],
      ['Number Mismatch', 'number_format'],
      ['Numeric Mismatch', 'number_format'],
      ['Double Space', 'spacing'],
      ['Double Blank', 'spacing'],
      ['Repeated Word', 'repeated_word'],
      ['Repeated Words', 'repeated_word'],
      ['Spell Check', 'spelling'],
    ]

    for (const [xbenchType, expectedCategory] of knownMappings) {
      expect(mapXbenchToToolCategory(xbenchType)).toBe(expectedCategory)
    }
  })

  it('[P1] should match case-insensitively', async () => {
    const { mapXbenchToToolCategory } = await import('./xbenchCategoryMapper')

    expect(mapXbenchToToolCategory('TAG MISMATCH')).toBe('tag_integrity')
    expect(mapXbenchToToolCategory('number mismatch')).toBe('number_format')
    expect(mapXbenchToToolCategory('Key Term Mismatch')).toBe('glossary_compliance')
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

    // Key Term Mismatch: MQM → terminology, Tool → glossary_compliance (G31 fix)
    expect(mapXbenchCategory('Key Term Mismatch')).toBe('terminology')
    expect(mapXbenchToToolCategory('Key Term Mismatch')).toBe('glossary_compliance')

    // Spell Check: MQM → fluency, Tool → spelling (G31 fix)
    expect(mapXbenchCategory('Spell Check')).toBe('fluency')
    expect(mapXbenchToToolCategory('Spell Check')).toBe('spelling')
  })

  // TA: Coverage Gap Tests — Story 2.7

  // TA: Coverage Gap Tests — Stories 2.7 & 3.5 (Advanced Elicitation)

  it('[P2] should throw on null/undefined input since no null guard exists (G4)', async () => {
    const { mapXbenchCategory, mapXbenchToToolCategory } = await import('./xbenchCategoryMapper')

    // G4: mapper calls .toLowerCase() directly — crashes on null/undefined
    // @ts-expect-error Testing runtime null safety
    expect(() => mapXbenchCategory(null)).toThrow()
    // @ts-expect-error Testing runtime null safety
    expect(() => mapXbenchToToolCategory(undefined)).toThrow()
  })

  it('[P1] should output only values that exist in engine RuleCategory or known aliases (G31)', async () => {
    const { mapXbenchToToolCategory } = await import('./xbenchCategoryMapper')

    // G31: Verify mapper tool outputs align with engine RuleCategory type
    const engineRuleCategories = new Set([
      'completeness',
      'tag_integrity',
      'number_format',
      'placeholder_integrity',
      'spacing',
      'punctuation',
      'url_integrity',
      'consistency',
      'glossary_compliance',
      'custom_rule',
      'capitalization',
      'repeated_word',
      'spelling',
    ])

    const allXbenchTypes = [
      'Inconsistency in Source',
      'Inconsistency in Target',
      'Key Term Mismatch',
      'Untranslated',
      'Target same as Source',
      'Tag Mismatch',
      'Number Mismatch',
      'Numeric Mismatch',
      'Double Space',
      'Double Blank',
      'Repeated Word',
      'Repeated Words',
      'Spell Check',
    ]

    const nonEngineOutputs: string[] = []
    for (const xbenchType of allXbenchTypes) {
      const output = mapXbenchToToolCategory(xbenchType)
      if (output !== 'other' && !engineRuleCategories.has(output)) {
        nonEngineOutputs.push(`${xbenchType} → ${output}`)
      }
    }

    // After G31 fix: all mapper outputs should now exist in RuleCategory
    // key_term → glossary_compliance, fluency → spelling
    if (nonEngineOutputs.length > 0) {
      process.stderr.write(
        `\n⚠️ G31: Mapper outputs not in RuleCategory: ${nonEngineOutputs.join(', ')}\n`,
      )
    }

    // Post-fix: zero divergences expected
    expect(nonEngineOutputs.length).toBe(0)
  })

  it('[P1] should map ALL known golden corpus Xbench categories to non-other values (U17)', async () => {
    const { mapXbenchToToolCategory, mapXbenchCategory } = await import('./xbenchCategoryMapper')

    // All known Xbench check types from the golden corpus and Xbench report format
    const goldenCorpusCategories = [
      'Inconsistency in Source',
      'Inconsistency in Target',
      'Key Term Mismatch',
      'Untranslated',
      'Target same as Source',
      'Tag Mismatch',
      'Number Mismatch',
      'Numeric Mismatch',
      'Double Space',
      'Double Blank',
      'Repeated Word',
      'Repeated Words',
      'Spell Check',
    ]

    // Every known category should map to a non-'other' tool category
    for (const category of goldenCorpusCategories) {
      const toolCategory = mapXbenchToToolCategory(category)
      expect(toolCategory).not.toBe('other')
    }

    // Every known category should also map to a non-'other' MQM category
    for (const category of goldenCorpusCategories) {
      const mqmCategory = mapXbenchCategory(category)
      expect(mqmCategory).not.toBe('other')
    }
  })
})
