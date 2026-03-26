/**
 * L2 Pipeline Real AI Integration Test
 *
 * Calls OpenAI gpt-4o-mini with real API key — NO mocking.
 * Verifies the full flow: buildL2Prompt → generateText → l2OutputSchema parse → findings > 0
 *
 * WHY: TD-AI-004 showed mock-only tests hid a bracket bug for 17 days.
 * This test catches prompt↔schema format mismatches that mocks cannot detect.
 *
 * COST: ~$0.001-0.005 per run (gpt-4o-mini is cheap).
 * SPEED: ~3-10 seconds per test.
 *
 * @see _bmad-output/implementation-artifacts/tech-debt-tracker.md TD-AI-004
 */

import { Output, generateText } from 'ai'
import { describe, expect, it } from 'vitest'

import { buildL2Prompt } from '@/features/pipeline/prompts/build-l2-prompt'
import { l2OutputSchema } from '@/features/pipeline/schemas/l2-output'
import { getModelById } from '@/lib/ai/client'
import { getConfigForModel } from '@/lib/ai/types'

import { L2_TEST_SEGMENTS, TEST_PROJECT, TEST_TAXONOMY } from './fixtures'

// eslint-disable-next-line no-restricted-syntax -- integration test needs raw env check before app init
const HAS_OPENAI_KEY = Boolean(process.env['OPENAI_API_KEY'])

describe('L2 Pipeline — Real AI Integration', () => {
  it.skipIf(!HAS_OPENAI_KEY)(
    'should produce findings from segments with known translation errors',
    async () => {
      // Arrange: build prompt with segments that have OBVIOUS errors
      const prompt = buildL2Prompt({
        segments: L2_TEST_SEGMENTS,
        l1Findings: [],
        glossaryTerms: [],
        taxonomyCategories: TEST_TAXONOMY,
        project: TEST_PROJECT,
      })

      // Act: call real OpenAI API
      const config = getConfigForModel('gpt-4o-mini', 'L2')
      const result = await generateText({
        model: getModelById('gpt-4o-mini'),
        output: Output.object({ schema: l2OutputSchema }),
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        prompt,
      })

      // Assert: structured output parsed successfully
      expect(result.output).toBeDefined()
      const output = result.output!

      // Assert: findings array exists and has items
      expect(output.findings).toBeDefined()
      expect(Array.isArray(output.findings)).toBe(true)
      expect(output.findings.length).toBeGreaterThan(0)

      // Assert: at least 2 findings (we have 3 segments with errors, 1 clean)
      // Allow some tolerance — AI may not catch all, but should catch at least 2
      expect(output.findings.length).toBeGreaterThanOrEqual(2)

      // Assert: every finding matches the Zod schema (no silent drops)
      for (const finding of output.findings) {
        expect(finding.segmentId).toBeTruthy()
        expect(finding.category).toBeTruthy()
        expect(['critical', 'major', 'minor']).toContain(finding.severity)
        expect(finding.confidence).toBeGreaterThanOrEqual(0)
        expect(finding.confidence).toBeLessThanOrEqual(100)
        expect(finding.description).toBeTruthy()
      }

      // Assert: segmentIds reference our test segments (no hallucinated IDs)
      const validSegmentIds = new Set(L2_TEST_SEGMENTS.map((s) => s.id))
      for (const finding of output.findings) {
        // Strip brackets defensively (the bug TD-AI-004 fixed)
        const normalizedId = finding.segmentId.replace(/^\[|\]$/g, '')
        expect(validSegmentIds.has(normalizedId)).toBe(true)
      }

      // Assert: the "Save→Delete" mistranslation should be caught (highest confidence error)
      const segment1Findings = output.findings.filter((f) => {
        const id = f.segmentId.replace(/^\[|\]$/g, '')
        return id === '00000000-0000-4000-8000-000000000001'
      })
      expect(segment1Findings.length).toBeGreaterThanOrEqual(1)

      // Assert: token usage is tracked (Guardrail #19)
      expect(result.usage).toBeDefined()
      expect(result.usage.inputTokens).toBeGreaterThan(0)
      expect(result.usage.outputTokens).toBeGreaterThan(0)

      // Assert: summary exists
      expect(output.summary).toBeTruthy()
    },
  )

  it.skipIf(!HAS_OPENAI_KEY)('should return empty findings for clean segments', async () => {
    // Arrange: only the clean segment (no errors)
    const cleanSegments = L2_TEST_SEGMENTS.filter(
      (s) => s.id === '00000000-0000-4000-8000-000000000003',
    )

    const prompt = buildL2Prompt({
      segments: cleanSegments,
      l1Findings: [],
      glossaryTerms: [],
      taxonomyCategories: TEST_TAXONOMY,
      project: TEST_PROJECT,
    })

    // Act
    const config = getConfigForModel('gpt-4o-mini', 'L2')
    const result = await generateText({
      model: getModelById('gpt-4o-mini'),
      output: Output.object({ schema: l2OutputSchema }),
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      prompt,
    })

    // Assert: output parses, findings should be empty or near-empty
    expect(result.output).toBeDefined()
    const output = result.output!
    expect(output.findings).toBeDefined()
    // Clean segment — AI should find 0 issues (allow max 1 for false positive tolerance)
    expect(output.findings.length).toBeLessThanOrEqual(1)
  })

  it.skipIf(!HAS_OPENAI_KEY)(
    'should produce segmentIds WITHOUT brackets (TD-AI-004 regression)',
    async () => {
      // This test specifically guards against the bracket bug that hid for 17 days.
      // The prompt says "return UUID WITHOUT brackets" — verify AI complies.
      const prompt = buildL2Prompt({
        segments: L2_TEST_SEGMENTS.slice(0, 2),
        l1Findings: [],
        glossaryTerms: [],
        taxonomyCategories: TEST_TAXONOMY,
        project: TEST_PROJECT,
      })

      const config = getConfigForModel('gpt-4o-mini', 'L2')
      const result = await generateText({
        model: getModelById('gpt-4o-mini'),
        output: Output.object({ schema: l2OutputSchema }),
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        prompt,
      })

      expect(result.output).toBeDefined()
      const output = result.output!

      for (const finding of output.findings) {
        // Raw segmentId should NOT have brackets
        expect(finding.segmentId).not.toMatch(/^\[/)
        expect(finding.segmentId).not.toMatch(/\]$/)
        // Should be a valid UUID format
        expect(finding.segmentId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        )
      }
    },
  )
})
