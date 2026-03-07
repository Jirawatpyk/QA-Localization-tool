/** Story 3.3 ATDD — AC3: Shared Prompt Builder Integration — GREEN PHASE */
import { describe, expect, it } from 'vitest'

import { buildL3Prompt } from '../build-l3-prompt'
import type { L3PromptInput } from '../types'

describe('buildL3Prompt — Story 3.3: Shared Prompt Builder', () => {
  const seg0 = {
    id: 'seg-000',
    sourceText: 'Welcome to the app.',
    targetText: '\u0e22\u0e34\u0e19\u0e14\u0e35\u0e15\u0e49\u0e2d\u0e19\u0e23\u0e31\u0e1a',
    segmentNumber: 0,
    sourceLang: 'en',
    targetLang: 'th',
  }
  const seg1 = {
    id: 'seg-001',
    sourceText: 'Your account has been suspended.',
    targetText:
      '\u0e1a\u0e31\u0e0d\u0e0a\u0e35\u0e02\u0e2d\u0e07\u0e04\u0e38\u0e13\u0e16\u0e39\u0e01\u0e23\u0e30\u0e07\u0e31\u0e1a\u0e41\u0e25\u0e49\u0e27',
    segmentNumber: 1,
    sourceLang: 'en',
    targetLang: 'th',
  }
  const seg2 = {
    id: 'seg-002',
    sourceText: 'Please contact support.',
    targetText:
      '\u0e01\u0e23\u0e38\u0e13\u0e32\u0e15\u0e34\u0e14\u0e15\u0e48\u0e2d\u0e1d\u0e48\u0e32\u0e22\u0e2a\u0e19\u0e31\u0e1a\u0e2a\u0e19\u0e38\u0e19',
    segmentNumber: 2,
    sourceLang: 'en',
    targetLang: 'th',
  }

  const baseInput: L3PromptInput = {
    segments: [seg1],
    priorFindings: [
      {
        id: 'f-001',
        segmentId: 'seg-001',
        category: 'accuracy',
        severity: 'major',
        description: 'Mistranslation of key term',
        detectedByLayer: 'L2',
      },
    ],
    glossaryTerms: [
      { sourceTerm: 'account', targetTerm: '\u0e1a\u0e31\u0e0d\u0e0a\u0e35', caseSensitive: false },
      {
        sourceTerm: 'suspended',
        targetTerm: '\u0e23\u0e30\u0e07\u0e31\u0e1a',
        caseSensitive: false,
      },
    ],
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
    project: {
      name: 'Banking App',
      description: 'Mobile banking for Thai market',
      sourceLang: 'en',
      targetLangs: ['th'],
      processingMode: 'thorough',
    },
    surroundingContext: undefined,
  }

  it('[P0] U11: should call shared buildL3Prompt from prompts module (not inline prompt)', () => {
    const result = buildL3Prompt(baseInput)

    expect(result).toContain('senior localization QA specialist')
    expect(result).toContain('Layer 3')
    expect(result).toContain('rationale')
    expect(result).toContain('Mistranslation of key term')
  })

  it('[P1] U12+U13: should include glossary, taxonomy, project context, and surrounding context segments in prompt input', () => {
    const inputWithContext: L3PromptInput = {
      ...baseInput,
      segments: [seg1],
      surroundingContext: [
        {
          previous: [seg0],
          current: seg1,
          next: [seg2],
        },
      ],
    }

    const result = buildL3Prompt(inputWithContext)

    // U12: Should include glossary terms in prompt
    expect(result).toContain('account')
    expect(result).toContain('\u0e1a\u0e31\u0e0d\u0e0a\u0e35')

    // U12: Should include taxonomy categories in prompt
    expect(result).toContain('accuracy')
    expect(result).toContain('mistranslation')

    // U12: Should include project context
    expect(result).toContain('Banking App')

    // U13: Should include surrounding context segments
    expect(result).toContain('Surrounding Context')
    expect(result).toContain('Welcome to the app.')
    expect(result).toContain('Please contact support.')
    expect(result).toContain('Your account has been suspended.')
  })

  it('[P1] should format boundary segments correctly (first segment, no previous)', () => {
    const inputBoundary: L3PromptInput = {
      ...baseInput,
      surroundingContext: [
        {
          previous: [],
          current: seg0,
          next: [seg1, seg2],
        },
      ],
    }

    const result = buildL3Prompt(inputBoundary)

    expect(result).toContain('(none — start of file)')
    expect(result).toContain(seg1.sourceText)
    expect(result).toContain(seg2.sourceText)
  })

  it('[P1] should format boundary segments correctly (last segment, no next)', () => {
    const inputBoundary: L3PromptInput = {
      ...baseInput,
      surroundingContext: [
        {
          previous: [seg0, seg1],
          current: seg2,
          next: [],
        },
      ],
    }

    const result = buildL3Prompt(inputBoundary)

    expect(result).toContain('(none — end of file)')
    expect(result).toContain(seg0.sourceText)
    expect(result).toContain(seg1.sourceText)
  })

  it('[P1] should fall back to no surrounding context section when undefined', () => {
    const result = buildL3Prompt(baseInput)
    expect(result).not.toContain('Surrounding Context')
  })
})
