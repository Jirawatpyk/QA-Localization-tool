import { describe, expect, it } from 'vitest'

import { buildL2Prompt } from '../build-l2-prompt'
import type { L2PromptInput } from '../types'

describe('buildL2Prompt', () => {
  const baseInput: L2PromptInput = {
    segments: [
      {
        id: 'seg-001',
        sourceText: 'Click Save',
        targetText: 'คลิกบันทึก',
        segmentNumber: 1,
        sourceLang: 'en',
        targetLang: 'th',
      },
      {
        id: 'seg-002',
        sourceText: 'Cancel',
        targetText: 'ยกเลิก',
        segmentNumber: 2,
        sourceLang: 'en',
        targetLang: 'th',
      },
    ],
    l1Findings: [],
    glossaryTerms: [],
    taxonomyCategories: [],
    project: {
      name: 'Test App',
      description: 'Test application',
      sourceLang: 'en',
      targetLangs: ['th'],
      processingMode: 'economy',
    },
  }

  it('should include system role for L2 screening', () => {
    const result = buildL2Prompt(baseInput)

    expect(result).toContain('localization QA reviewer')
    expect(result).toContain('Layer 2')
    expect(result).toContain('SEMANTIC quality issues')
  })

  it('should include all segments with IDs and segment numbers', () => {
    const result = buildL2Prompt(baseInput)

    expect(result).toContain('[seg-001] (#1, en→th)')
    expect(result).toContain('Source: Click Save')
    expect(result).toContain('Target: คลิกบันทึก')
    expect(result).toContain('[seg-002] (#2, en→th)')
    expect(result).toContain('(2 segments)')
  })

  it('should include domain context', () => {
    const result = buildL2Prompt(baseInput)

    expect(result).toContain('## Project Context')
    expect(result).toContain('Test App')
    expect(result).toContain('en → th')
  })

  it('should include confidence scoring instructions', () => {
    const result = buildL2Prompt(baseInput)

    expect(result).toContain('Confidence Scoring')
    expect(result).toContain('90-100')
    expect(result).toContain('>= 50')
  })

  it('should include output format instructions', () => {
    const result = buildL2Prompt(baseInput)

    expect(result).toContain('segmentId')
    expect(result).toContain('category')
    expect(result).toContain('severity')
    expect(result).toContain('suggestedFix')
  })

  it('should include few-shot examples', () => {
    const result = buildL2Prompt(baseInput)

    expect(result).toContain('## Calibration Examples')
    expect(result).toContain('### Example 1')
  })

  it('should include Thai language instructions when target is th', () => {
    const result = buildL2Prompt(baseInput)

    expect(result).toContain('Thai Language-Specific Instructions')
    expect(result).toContain('Thai numeral')
  })

  it('should include glossary context when terms provided', () => {
    const input: L2PromptInput = {
      ...baseInput,
      glossaryTerms: [{ sourceTerm: 'Save', targetTerm: 'บันทึก', caseSensitive: false }],
    }

    const result = buildL2Prompt(input)

    expect(result).toContain('## Approved Terminology')
    expect(result).toContain('"Save" → "บันทึก"')
  })

  it('should omit glossary section when no terms', () => {
    const result = buildL2Prompt(baseInput)

    expect(result).not.toContain('## Approved Terminology')
  })

  it('should include taxonomy when categories provided', () => {
    const input: L2PromptInput = {
      ...baseInput,
      taxonomyCategories: [
        {
          category: 'accuracy',
          parentCategory: null,
          severity: 'major',
          description: 'Accuracy issues',
        },
      ],
    }

    const result = buildL2Prompt(input)

    expect(result).toContain('## MQM Error Taxonomy')
    expect(result).toContain('accuracy')
  })

  it('should include L1 findings when present', () => {
    const input: L2PromptInput = {
      ...baseInput,
      l1Findings: [
        {
          id: 'f-001',
          segmentId: 'seg-001',
          category: 'tag_integrity',
          severity: 'critical',
          description: 'Missing closing tag </b>',
          detectedByLayer: 'L1',
        },
      ],
    }

    const result = buildL2Prompt(input)

    expect(result).toContain('L1 Rule-based Findings Already Detected (1 findings)')
    expect(result).toContain('[seg-001] tag_integrity (critical)')
    expect(result).toContain('Do NOT duplicate these L1 findings')
  })

  it('should omit L1 section when no findings', () => {
    const result = buildL2Prompt(baseInput)

    expect(result).not.toContain('L1 Rule-based Findings')
  })

  it('should use Japanese instructions when target is ja', () => {
    const input: L2PromptInput = {
      ...baseInput,
      segments: [{ ...baseInput.segments[0]!, targetLang: 'ja' }],
    }

    const result = buildL2Prompt(input)

    expect(result).toContain('Japanese')
    expect(result).not.toContain('Thai')
  })

  it('should assemble all sections in correct order', () => {
    const input: L2PromptInput = {
      ...baseInput,
      glossaryTerms: [{ sourceTerm: 'Save', targetTerm: 'บันทึก', caseSensitive: false }],
      taxonomyCategories: [
        { category: 'accuracy', parentCategory: null, severity: 'major', description: 'Accuracy' },
      ],
      l1Findings: [
        {
          id: 'f-1',
          segmentId: 'seg-001',
          category: 'tag_integrity',
          severity: 'critical',
          description: 'Test',
          detectedByLayer: 'L1',
        },
      ],
    }

    const result = buildL2Prompt(input)

    // Verify ordering: system role → domain → taxonomy → glossary → language → examples → confidence → format → segments → L1
    const roleIdx = result.indexOf('localization QA reviewer')
    const domainIdx = result.indexOf('## Project Context')
    const taxonomyIdx = result.indexOf('## MQM Error Taxonomy')
    const glossaryIdx = result.indexOf('## Approved Terminology')
    const langIdx = result.indexOf('Thai Language-Specific')
    const examplesIdx = result.indexOf('## Calibration Examples')
    const confidenceIdx = result.indexOf('## Confidence Scoring')
    const segmentsIdx = result.indexOf('## Segments to Analyze')
    const l1Idx = result.indexOf('## L1 Rule-based Findings')

    expect(roleIdx).toBeLessThan(domainIdx)
    expect(domainIdx).toBeLessThan(taxonomyIdx)
    expect(taxonomyIdx).toBeLessThan(glossaryIdx)
    expect(glossaryIdx).toBeLessThan(langIdx)
    expect(langIdx).toBeLessThan(examplesIdx)
    expect(examplesIdx).toBeLessThan(confidenceIdx)
    expect(confidenceIdx).toBeLessThan(segmentsIdx)
    expect(segmentsIdx).toBeLessThan(l1Idx)
  })
})
