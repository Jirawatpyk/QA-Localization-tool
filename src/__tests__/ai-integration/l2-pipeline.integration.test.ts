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
import { estimateCost } from '@/lib/ai/costs'
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
      // AI SDK 6.0: result.output is a throwing getter — extract safely
      let output: typeof result.output
      try {
        output = result.output
      } catch {
        throw new Error(`No structured output generated. finishReason: ${result.finishReason}`)
      }

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
    // AI SDK 6.0: result.output is a throwing getter — extract safely
    let output: typeof result.output
    try {
      output = result.output
    } catch {
      throw new Error(`No structured output generated. finishReason: ${result.finishReason}`)
    }
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

      // AI SDK 6.0: result.output is a throwing getter — extract safely
      let output: typeof result.output
      try {
        output = result.output
      } catch {
        throw new Error(`No structured output generated. finishReason: ${result.finishReason}`)
      }

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

  it.skipIf(!HAS_OPENAI_KEY)(
    'should produce findings with DB-insertable structure (severity, confidence, nullable fields)',
    async () => {
      // Verifies that AI output can be mapped to the findings DB table without type errors.
      // Catches format mismatches between AI structured output and Drizzle insert schema.
      const prompt = buildL2Prompt({
        segments: L2_TEST_SEGMENTS,
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

      // AI SDK 6.0: result.output is a throwing getter — extract safely
      let output: typeof result.output
      try {
        output = result.output
      } catch {
        throw new Error(`No structured output generated. finishReason: ${result.finishReason}`)
      }
      expect(output.findings.length).toBeGreaterThan(0)

      const segmentMap = new Map(L2_TEST_SEGMENTS.map((s) => [s.id, s]))

      for (const finding of output.findings) {
        const normalizedId = finding.segmentId.replace(/^\[|\]$/g, '')
        const seg = segmentMap.get(normalizedId)

        // Simulate the DB insert mapping from runL2ForFile (Step 8)
        const dbInsert = {
          fileId: '00000000-0000-4000-8000-ffffffffffff',
          segmentId: normalizedId,
          projectId: '00000000-0000-4000-8000-ffffffffffff',
          tenantId: '00000000-0000-4000-8000-ffffffffffff',
          category: finding.category,
          severity: finding.severity,
          description: finding.description,
          suggestedFix: finding.suggestion, // L2 schema uses "suggestion" not "suggestedFix"
          sourceTextExcerpt: seg ? seg.sourceText.slice(0, 200) : null,
          targetTextExcerpt: seg ? seg.targetText.slice(0, 200) : null,
          detectedByLayer: 'L2' as const,
          aiModel: 'gpt-4o-mini',
          aiConfidence: Math.min(100, Math.max(0, finding.confidence)),
          reviewSessionId: null,
          status: 'pending' as const,
          segmentCount: 1,
        }

        // Validate all fields match DB expectations
        expect(typeof dbInsert.category).toBe('string')
        expect(dbInsert.category.length).toBeGreaterThan(0)
        expect(['critical', 'major', 'minor']).toContain(dbInsert.severity)
        expect(typeof dbInsert.description).toBe('string')
        expect(dbInsert.description.length).toBeGreaterThan(0)
        // suggestion is string | null (Guardrail: .nullable() only — no undefined)
        expect(dbInsert.suggestedFix === null || typeof dbInsert.suggestedFix === 'string').toBe(
          true,
        )
        expect(dbInsert.suggestedFix).not.toBeUndefined()
        expect(dbInsert.aiConfidence).toBeGreaterThanOrEqual(0)
        expect(dbInsert.aiConfidence).toBeLessThanOrEqual(100)
      }
    },
  )

  it.skipIf(!HAS_OPENAI_KEY)(
    'should log token usage for cost tracking (Guardrail #12)',
    async () => {
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

      // Token usage must be present and positive
      expect(result.usage).toBeDefined()
      expect(result.usage.inputTokens).toBeGreaterThan(0)
      expect(result.usage.outputTokens).toBeGreaterThan(0)

      // Verify cost can be computed (estimateCost requires non-null tokens)
      const cost = estimateCost('gpt-4o-mini', 'L2', result.usage)
      expect(cost).toBeGreaterThan(0)
      // gpt-4o-mini is cheap — single L2 call should be well under $0.01
      expect(cost).toBeLessThan(0.01)
    },
  )

  it.skipIf(!HAS_OPENAI_KEY)(
    'should produce findings with categories matching taxonomy when taxonomy is provided',
    async () => {
      const prompt = buildL2Prompt({
        segments: L2_TEST_SEGMENTS,
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

      // AI SDK 6.0: result.output is a throwing getter — extract safely
      let output: typeof result.output
      try {
        output = result.output
      } catch {
        throw new Error(`No structured output generated. finishReason: ${result.finishReason}`)
      }
      expect(output.findings.length).toBeGreaterThan(0)

      // Build valid category set (case-insensitive, matching runL2ForFile validation)
      const validCategories = new Set(TEST_TAXONOMY.map((t) => t.category.toLowerCase()))

      // Count how many findings use valid taxonomy categories
      let validCount = 0
      for (const finding of output.findings) {
        if (validCategories.has(finding.category.toLowerCase())) {
          validCount++
        }
      }

      // At least 70% of findings should use valid taxonomy categories
      // (AI may occasionally use sub-categories or variations — but majority should comply)
      const complianceRate = validCount / output.findings.length
      expect(complianceRate).toBeGreaterThanOrEqual(0.7)
    },
  )
})
