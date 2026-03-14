/**
 * P2-13 (R3-036): L3 prompt should NOT anchor on L2 findings
 * L3 must independently verify — not always agree with L2.
 */
import { describe, it, expect } from 'vitest'

import { buildL3Prompt } from '../build-l3-prompt'
import type { L3PromptInput } from '../types'

const baseInput: L3PromptInput = {
  segments: [
    {
      id: 'seg-001',
      sourceText: 'Your order has been confirmed.',
      targetText: 'คำสั่งซื้อของคุณได้รับการยืนยันแล้ว',
      segmentNumber: 1,
      sourceLang: 'en',
      targetLang: 'th',
    },
  ],
  priorFindings: [
    {
      id: 'f-001',
      segmentId: 'seg-001',
      category: 'accuracy',
      severity: 'major',
      description: 'L2 found potential accuracy issue',
      detectedByLayer: 'L2',
    },
  ],
  glossaryTerms: [],
  taxonomyCategories: [],
  project: {
    name: 'Test Project',
    description: null,
    sourceLang: 'en',
    targetLangs: ['th'],
    processingMode: 'thorough',
  },
}

describe('buildL3Prompt — anti-anchoring (P2-13)', () => {
  it('[P2] should include instruction for independent verification or disagreement', () => {
    const prompt = buildL3Prompt(baseInput)

    // L3 prompt should contain language about independent analysis
    // Check for key phrases that indicate L3 should NOT blindly agree with L2
    const hasIndependentInstruction =
      prompt.includes('DISAGREE') ||
      prompt.includes('contradict') ||
      prompt.includes('re-evaluate') ||
      prompt.includes('independently') ||
      prompt.includes('false_positive_review')

    expect(hasIndependentInstruction).toBe(true)
  })

  it('[P2] should NOT include instruction to simply confirm L2 findings', () => {
    const prompt = buildL3Prompt(baseInput)

    // The prompt should NOT have phrasing that anchors L3 to always agree
    // These exact phrases would indicate anchoring bias
    expect(prompt).not.toContain('confirm L2 findings')
    expect(prompt).not.toContain('validate L2 results')
    expect(prompt).not.toContain('agree with L2')
    // But it SHOULD contain dedup instructions (not just "confirm everything")
    expect(prompt).toContain('Do NOT duplicate')
  })
})
