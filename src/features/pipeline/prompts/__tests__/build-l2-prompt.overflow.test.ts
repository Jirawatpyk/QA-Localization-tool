import { describe, expect, it } from 'vitest'

import { buildL2Prompt } from '../build-l2-prompt'
import type { L2PromptInput, PriorFinding } from '../types'

// ── Test helpers ──

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

function createL1Finding(index: number): PriorFinding {
  return {
    id: `f-${String(index).padStart(4, '0')}`,
    segmentId: `seg-${String(index).padStart(4, '0')}`,
    category: 'tag_integrity',
    severity: 'minor',
    description: `L1 finding number ${index}`,
    detectedByLayer: 'L1',
  }
}

describe('buildL2Prompt — L1 findings overflow (P1-08, R3-035)', () => {
  it('[P1] should handle 500+ L1 findings without error', () => {
    const l1Findings = Array.from({ length: 500 }, (_, i) => createL1Finding(i + 1))

    const input: L2PromptInput = {
      ...baseInput,
      l1Findings,
    }

    const result = buildL2Prompt(input)

    // Should include L1 findings section
    expect(result).toContain('L1 Rule-based Findings Already Detected (500 findings)')
    expect(result).toContain('Do NOT duplicate these L1 findings')
    // Prompt should still be a non-empty string
    expect(result.length).toBeGreaterThan(0)
  })

  it('[P1] should omit L1 section entirely when 0 L1 findings', () => {
    const result = buildL2Prompt(baseInput)

    // No L1 section at all
    expect(result).not.toContain('L1 Rule-based Findings')
    expect(result).not.toContain('Do NOT duplicate')
    // Should still have core sections
    expect(result).toContain('localization QA reviewer')
    expect(result).toContain('Segments to Analyze')
  })

  it('[P1] should include all 10 L1 findings normally when count is small', () => {
    const l1Findings = Array.from({ length: 10 }, (_, i) => createL1Finding(i + 1))

    const input: L2PromptInput = {
      ...baseInput,
      l1Findings,
    }

    const result = buildL2Prompt(input)

    expect(result).toContain('L1 Rule-based Findings Already Detected (10 findings)')
    // Each finding should be present
    for (let i = 1; i <= 10; i++) {
      expect(result).toContain(`L1 finding number ${i}`)
    }
    expect(result).toContain('Do NOT duplicate these L1 findings')
  })
})
