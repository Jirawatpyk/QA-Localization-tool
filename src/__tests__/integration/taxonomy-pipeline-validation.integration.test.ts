/**
 * Taxonomy Pipeline Validation Tests
 *
 * Tests the taxonomy-based category filtering logic used by L2/L3 pipelines.
 * The pipeline loads active taxonomy categories and drops any AI-generated
 * findings whose category is not in the active taxonomy.
 *
 * These tests exercise the filtering logic in-memory (no DB needed).
 */

import { describe, expect, it } from 'vitest'

import { formatTaxonomyContext } from '@/features/pipeline/prompts/taxonomy-context'
import type { TaxonomyCategoryContext } from '@/features/pipeline/prompts/types'
import type { FindingSeverity } from '@/types/finding'

// ── Replicate the exact filtering logic from runL2ForFile / runL3ForFile ──

type TaxonomyRow = {
  category: string
  parentCategory: string | null
  severity: string | null
  description: string
}

type RawAIFinding = {
  segmentId: string
  category: string
  severity: FindingSeverity
  confidence: number
  description: string
  suggestion: string | null
}

type FilterResult = {
  kept: RawAIFinding[]
  droppedByInvalidCategory: number
}

/**
 * Extracted from runL2ForFile.ts lines 448-498 and runL3ForFile.ts lines 572-623.
 * Both L2 and L3 use identical logic:
 *   - Build validCategories Set from taxonomy rows (lowercased)
 *   - If taxonomyRows is empty → validCategories = null → accept all
 *   - Otherwise, drop findings whose category (lowercased) is not in the set
 */
function filterFindingsByTaxonomy(
  taxonomyRows: TaxonomyRow[],
  rawFindings: RawAIFinding[],
): FilterResult {
  const validCategories =
    taxonomyRows.length > 0 ? new Set(taxonomyRows.map((t) => t.category.toLowerCase())) : null

  const kept: RawAIFinding[] = []
  let droppedByInvalidCategory = 0

  for (const f of rawFindings) {
    if (validCategories && !validCategories.has(f.category.toLowerCase())) {
      droppedByInvalidCategory++
      continue
    }
    kept.push(f)
  }

  return { kept, droppedByInvalidCategory }
}

// ── Test Helpers ──

function makeTaxonomyRow(
  category: string,
  parentCategory: string | null = null,
  severity: string | null = 'minor',
  description = `${category} issues`,
): TaxonomyRow {
  return { category, parentCategory, severity, description }
}

function makeFinding(category: string, overrides: Partial<RawAIFinding> = {}): RawAIFinding {
  return {
    segmentId: 'seg-001',
    category,
    severity: 'minor',
    confidence: 80,
    description: `Found ${category} issue`,
    suggestion: null,
    ...overrides,
  }
}

// ── Tests ──

describe('Taxonomy Pipeline Category Validation', () => {
  const standardTaxonomy: TaxonomyRow[] = [
    makeTaxonomyRow('Accuracy', null, 'major', 'Translation accuracy issues'),
    makeTaxonomyRow('Fluency', null, 'minor', 'Target language fluency issues'),
    makeTaxonomyRow('Terminology', null, 'minor', 'Terminology consistency issues'),
  ]

  describe('filterFindingsByTaxonomy', () => {
    it('should keep findings with valid categories (T1)', () => {
      const findings = [makeFinding('Accuracy')]
      const result = filterFindingsByTaxonomy(standardTaxonomy, findings)

      expect(result.kept).toHaveLength(1)
      expect(result.kept[0]!.category).toBe('Accuracy')
      expect(result.droppedByInvalidCategory).toBe(0)
    })

    it('should drop findings with invalid categories (T2)', () => {
      const findings = [makeFinding('MadeUpCategory')]
      const result = filterFindingsByTaxonomy(standardTaxonomy, findings)

      expect(result.kept).toHaveLength(0)
      expect(result.droppedByInvalidCategory).toBe(1)
    })

    it('should correctly split mix of valid and invalid categories (T3)', () => {
      const findings = [
        makeFinding('Accuracy', { segmentId: 'seg-001' }),
        makeFinding('Fluency', { segmentId: 'seg-002' }),
        makeFinding('Terminology', { segmentId: 'seg-003' }),
        makeFinding('Hallucination', { segmentId: 'seg-004' }),
        makeFinding('StyleGuide', { segmentId: 'seg-005' }),
      ]
      const result = filterFindingsByTaxonomy(standardTaxonomy, findings)

      expect(result.kept).toHaveLength(3)
      expect(result.droppedByInvalidCategory).toBe(2)
      expect(result.kept.map((f) => f.category)).toEqual(['Accuracy', 'Fluency', 'Terminology'])
    })

    it('should match categories case-insensitively (T4)', () => {
      const findings = [makeFinding('accuracy'), makeFinding('FLUENCY'), makeFinding('terminoLOGY')]
      const result = filterFindingsByTaxonomy(standardTaxonomy, findings)

      expect(result.kept).toHaveLength(3)
      expect(result.droppedByInvalidCategory).toBe(0)
    })

    it('should accept all findings when taxonomy is empty (T5)', () => {
      const findings = [
        makeFinding('AnyCategory'),
        makeFinding('CompletelyMadeUp'),
        makeFinding('Whatever'),
      ]
      const result = filterFindingsByTaxonomy([], findings)

      expect(result.kept).toHaveLength(3)
      expect(result.droppedByInvalidCategory).toBe(0)
    })

    it('should handle empty findings array', () => {
      const result = filterFindingsByTaxonomy(standardTaxonomy, [])

      expect(result.kept).toHaveLength(0)
      expect(result.droppedByInvalidCategory).toBe(0)
    })

    it('should handle taxonomy with parent-child categories', () => {
      const taxonomyWithChildren: TaxonomyRow[] = [
        makeTaxonomyRow('Accuracy', null, 'major'),
        makeTaxonomyRow('Omission', 'Accuracy', 'major'),
        makeTaxonomyRow('Mistranslation', 'Accuracy', 'critical'),
        makeTaxonomyRow('Fluency', null, 'minor'),
      ]

      const findings = [
        makeFinding('Accuracy'),
        makeFinding('Omission'),
        makeFinding('Mistranslation'),
        makeFinding('Fluency'),
        makeFinding('Addition'), // not in taxonomy
      ]
      const result = filterFindingsByTaxonomy(taxonomyWithChildren, findings)

      expect(result.kept).toHaveLength(4)
      expect(result.droppedByInvalidCategory).toBe(1)
      expect(result.kept.map((f) => f.category)).toEqual([
        'Accuracy',
        'Omission',
        'Mistranslation',
        'Fluency',
      ])
    })

    it('should drop all findings when no categories match', () => {
      const findings = [
        makeFinding('NonExistent1'),
        makeFinding('NonExistent2'),
        makeFinding('NonExistent3'),
      ]
      const result = filterFindingsByTaxonomy(standardTaxonomy, findings)

      expect(result.kept).toHaveLength(0)
      expect(result.droppedByInvalidCategory).toBe(3)
    })
  })

  describe('formatTaxonomyContext', () => {
    it('should format taxonomy with all categories and hierarchy (T6)', () => {
      const categories: TaxonomyCategoryContext[] = [
        {
          category: 'Accuracy',
          parentCategory: null,
          severity: 'major',
          description: 'Translation accuracy',
        },
        {
          category: 'Fluency',
          parentCategory: null,
          severity: 'minor',
          description: 'Target fluency',
        },
        {
          category: 'Terminology',
          parentCategory: null,
          severity: 'minor',
          description: 'Term consistency',
        },
      ]
      const result = formatTaxonomyContext(categories)

      expect(result).toContain('## MQM Error Taxonomy')
      expect(result).toContain('**Accuracy**')
      expect(result).toContain('**Fluency**')
      expect(result).toContain('**Terminology**')
      expect(result).toContain('"Accuracy"')
      expect(result).toContain('"Fluency"')
      expect(result).toContain('"Terminology"')
      expect(result).toContain(
        'IMPORTANT: Your findings MUST use category names from this list EXACTLY',
      )
    })

    it('should format parent-child hierarchy correctly (T7)', () => {
      const categories: TaxonomyCategoryContext[] = [
        {
          category: 'Accuracy',
          parentCategory: null,
          severity: 'major',
          description: 'Translation accuracy',
        },
        {
          category: 'Omission',
          parentCategory: 'Accuracy',
          severity: 'major',
          description: 'Missing content',
        },
        {
          category: 'Mistranslation',
          parentCategory: 'Accuracy',
          severity: 'critical',
          description: 'Wrong meaning',
        },
      ]
      const result = formatTaxonomyContext(categories)

      expect(result).toContain('**Accuracy**')
      // Children should be indented under parent
      expect(result).toContain('  - Omission')
      expect(result).toContain('  - Mistranslation')
      // Valid names list should include all categories
      expect(result).toContain('"Accuracy"')
      expect(result).toContain('"Omission"')
      expect(result).toContain('"Mistranslation"')
    })

    it('should return empty string for empty taxonomy', () => {
      const result = formatTaxonomyContext([])
      expect(result).toBe('')
    })

    it('should handle orphan children whose parent is not in active categories', () => {
      const categories: TaxonomyCategoryContext[] = [
        {
          category: 'Omission',
          parentCategory: 'Accuracy',
          severity: 'major',
          description: 'Missing content',
        },
        {
          category: 'Mistranslation',
          parentCategory: 'Accuracy',
          severity: 'critical',
          description: 'Wrong meaning',
        },
      ]
      const result = formatTaxonomyContext(categories)

      // Orphan children should still appear with parent reference
      expect(result).toContain('Omission')
      expect(result).toContain('parent: Accuracy')
      expect(result).toContain('Mistranslation')
    })

    it('should use default severity "minor" when severity is null', () => {
      const categories: TaxonomyCategoryContext[] = [
        { category: 'Style', parentCategory: null, severity: null, description: 'Style issues' },
      ]
      const result = formatTaxonomyContext(categories)

      expect(result).toContain('minor')
    })
  })
})
