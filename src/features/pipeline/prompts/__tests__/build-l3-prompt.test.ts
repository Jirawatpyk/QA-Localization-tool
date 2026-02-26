import { describe, expect, it } from 'vitest'

import { buildL3Prompt } from '../build-l3-prompt'
import type { L3PromptInput } from '../types'

describe('buildL3Prompt', () => {
  const baseInput: L3PromptInput = {
    segments: [
      {
        id: 'seg-001',
        sourceText: 'Your account has been suspended.',
        targetText: 'บัญชีของคุณถูกระงับแล้ว',
        segmentNumber: 1,
        sourceLang: 'en',
        targetLang: 'th',
      },
    ],
    priorFindings: [],
    glossaryTerms: [],
    taxonomyCategories: [],
    project: {
      name: 'Banking App',
      description: 'Mobile banking for Thai market',
      sourceLang: 'en',
      targetLangs: ['th'],
      processingMode: 'thorough',
    },
  }

  it('should include senior specialist system role for L3', () => {
    const result = buildL3Prompt(baseInput)

    expect(result).toContain('senior localization QA specialist')
    expect(result).toContain('Layer 3')
    expect(result).toContain('final quality gate')
  })

  it('should describe the 3-layer pipeline context', () => {
    const result = buildL3Prompt(baseInput)

    expect(result).toContain('Layer 1 (L1)')
    expect(result).toContain('Layer 2 (L2)')
    expect(result).toContain('BOTH L1 and L2 missed')
  })

  it('should include rationale requirement', () => {
    const result = buildL3Prompt(baseInput)

    expect(result).toContain('rationale')
    expect(result).toContain('step by step')
    expect(result).toContain('REQUIRED')
  })

  it('should include lower confidence threshold than L2', () => {
    const result = buildL3Prompt(baseInput)

    expect(result).toContain('>= 30')
    expect(result).toContain("lower than L2's threshold of 50")
  })

  it('should include cross-layer dedup instructions', () => {
    const result = buildL3Prompt(baseInput)

    expect(result).toContain('Cross-Layer Deduplication')
    expect(result).toContain('Do NOT duplicate')
    expect(result).toContain('Confirm or contradict L2')
    expect(result).toContain('false_positive_review')
  })

  it('should include all few-shot examples (7)', () => {
    const result = buildL3Prompt(baseInput)

    expect(result).toContain('### Example 1')
    expect(result).toContain('### Example 7')
  })

  it('should include domain context with thorough mode', () => {
    const result = buildL3Prompt(baseInput)

    expect(result).toContain('Banking App')
    expect(result).toContain('Thorough mode')
    expect(result).toContain('strict quality standards')
  })

  it('should separate L1 and L2 prior findings', () => {
    const input: L3PromptInput = {
      ...baseInput,
      priorFindings: [
        {
          id: 'f-001',
          segmentId: 'seg-001',
          category: 'tag_integrity',
          severity: 'critical',
          description: 'Missing tag',
          detectedByLayer: 'L1',
        },
        {
          id: 'f-002',
          segmentId: 'seg-001',
          category: 'accuracy',
          severity: 'major',
          description: 'Mistranslation detected',
          detectedByLayer: 'L2',
        },
      ],
    }

    const result = buildL3Prompt(input)

    expect(result).toContain('### L1 Rule-based Findings (1)')
    expect(result).toContain('### L2 AI Screening Findings (1)')
    expect(result).toContain('Prior Findings from L1 + L2 (2 total)')
  })

  it('should omit prior findings section when empty', () => {
    const result = buildL3Prompt(baseInput)

    expect(result).not.toContain('Prior Findings from L1')
  })

  it('should include glossary context', () => {
    const input: L3PromptInput = {
      ...baseInput,
      glossaryTerms: [
        { sourceTerm: 'account', targetTerm: 'บัญชี', caseSensitive: false },
        { sourceTerm: 'suspended', targetTerm: 'ระงับ', caseSensitive: false },
      ],
    }

    const result = buildL3Prompt(input)

    expect(result).toContain('## Approved Terminology (2 terms)')
    expect(result).toContain('"account" → "บัญชี"')
  })

  it('should include taxonomy categories', () => {
    const input: L3PromptInput = {
      ...baseInput,
      taxonomyCategories: [
        {
          category: 'accuracy',
          parentCategory: null,
          severity: 'major',
          description: 'Accuracy issues',
        },
        {
          category: 'mistranslation',
          parentCategory: 'accuracy',
          severity: 'critical',
          description: 'Wrong meaning',
        },
      ],
    }

    const result = buildL3Prompt(input)

    expect(result).toContain('## MQM Error Taxonomy')
    expect(result).toContain('mistranslation')
  })

  it('should include Thai language instructions', () => {
    const result = buildL3Prompt(baseInput)

    expect(result).toContain('Thai Language-Specific Instructions')
  })

  it('should assemble all sections in correct order', () => {
    const input: L3PromptInput = {
      ...baseInput,
      glossaryTerms: [{ sourceTerm: 'account', targetTerm: 'บัญชี', caseSensitive: false }],
      taxonomyCategories: [
        { category: 'accuracy', parentCategory: null, severity: 'major', description: 'Accuracy' },
      ],
      priorFindings: [
        {
          id: 'f-1',
          segmentId: 'seg-001',
          category: 'accuracy',
          severity: 'major',
          description: 'Test',
          detectedByLayer: 'L2',
        },
      ],
    }

    const result = buildL3Prompt(input)

    // Verify ordering: role → domain → taxonomy → glossary → lang → examples → confidence → dedup → format → segments → prior
    const roleIdx = result.indexOf('senior localization QA specialist')
    const domainIdx = result.indexOf('## Project Context')
    const taxonomyIdx = result.indexOf('## MQM Error Taxonomy')
    const glossaryIdx = result.indexOf('## Approved Terminology')
    const langIdx = result.indexOf('Thai Language-Specific')
    const examplesIdx = result.indexOf('## Calibration Examples')
    const confidenceIdx = result.indexOf('## Confidence Scoring')
    const dedupIdx = result.indexOf('## Cross-Layer Deduplication')
    const segmentsIdx = result.indexOf('## Segments to Analyze')
    const priorIdx = result.indexOf('## Prior Findings')

    expect(roleIdx).toBeLessThan(domainIdx)
    expect(domainIdx).toBeLessThan(taxonomyIdx)
    expect(taxonomyIdx).toBeLessThan(glossaryIdx)
    expect(glossaryIdx).toBeLessThan(langIdx)
    expect(langIdx).toBeLessThan(examplesIdx)
    expect(examplesIdx).toBeLessThan(confidenceIdx)
    expect(confidenceIdx).toBeLessThan(dedupIdx)
    expect(dedupIdx).toBeLessThan(segmentsIdx)
    expect(segmentsIdx).toBeLessThan(priorIdx)
  })
})
