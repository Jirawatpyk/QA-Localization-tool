import { describe, expect, it } from 'vitest'

import { formatTaxonomyContext, getValidCategoryNames } from '../taxonomy-context'
import type { TaxonomyCategoryContext } from '../types'

describe('formatTaxonomyContext', () => {
  it('should return empty string when no categories', () => {
    expect(formatTaxonomyContext([])).toBe('')
  })

  it('should format root categories correctly', () => {
    const categories: TaxonomyCategoryContext[] = [
      {
        category: 'accuracy',
        parentCategory: null,
        severity: 'major',
        description: 'Translation accuracy issues',
      },
      {
        category: 'fluency',
        parentCategory: null,
        severity: 'minor',
        description: 'Target language fluency issues',
      },
    ]

    const result = formatTaxonomyContext(categories)

    expect(result).toContain('## MQM Error Taxonomy')
    expect(result).toContain('**accuracy** (default severity: major)')
    expect(result).toContain('**fluency** (default severity: minor)')
    expect(result).toContain('MUST use category names from this list EXACTLY')
  })

  it('should display hierarchical parent-child relationships', () => {
    const categories: TaxonomyCategoryContext[] = [
      {
        category: 'accuracy',
        parentCategory: null,
        severity: 'major',
        description: 'Translation accuracy issues',
      },
      {
        category: 'mistranslation',
        parentCategory: 'accuracy',
        severity: 'critical',
        description: 'Incorrect meaning conveyed',
      },
      {
        category: 'omission',
        parentCategory: 'accuracy',
        severity: 'major',
        description: 'Content missing from translation',
      },
    ]

    const result = formatTaxonomyContext(categories)

    expect(result).toContain('**accuracy**')
    expect(result).toContain('  - mistranslation (critical)')
    expect(result).toContain('  - omission (major)')
  })

  it('should handle categories with null severity as minor', () => {
    const categories: TaxonomyCategoryContext[] = [
      {
        category: 'style',
        parentCategory: null,
        severity: null,
        description: 'Style issues',
      },
    ]

    const result = formatTaxonomyContext(categories)

    expect(result).toContain('default severity: minor')
  })

  it('should list all valid category names in constraint line', () => {
    const categories: TaxonomyCategoryContext[] = [
      { category: 'accuracy', parentCategory: null, severity: 'major', description: 'Accuracy' },
      { category: 'fluency', parentCategory: null, severity: 'minor', description: 'Fluency' },
    ]

    const result = formatTaxonomyContext(categories)

    expect(result).toContain('"accuracy", "fluency"')
    expect(result).toContain('Do NOT invent new categories')
  })
})

describe('getValidCategoryNames', () => {
  it('should return array of category names', () => {
    const categories: TaxonomyCategoryContext[] = [
      { category: 'accuracy', parentCategory: null, severity: 'major', description: 'Accuracy' },
      { category: 'fluency', parentCategory: null, severity: 'minor', description: 'Fluency' },
    ]

    expect(getValidCategoryNames(categories)).toEqual(['accuracy', 'fluency'])
  })

  it('should return empty array for no categories', () => {
    expect(getValidCategoryNames([])).toEqual([])
  })
})
