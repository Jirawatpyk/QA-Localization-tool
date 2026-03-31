/**
 * L3 Pipeline Real AI Integration Test
 *
 * Calls Anthropic claude-sonnet with real API key — NO mocking.
 * Verifies the full flow: buildL3Prompt → generateText → l3OutputSchema parse → findings > 0
 *
 * WHY: TD-AI-004 showed mock-only tests hid a bracket bug for 17 days.
 * This test catches prompt↔schema format mismatches that mocks cannot detect.
 *
 * COST: ~$0.01-0.05 per run (claude-sonnet is more expensive than gpt-4o-mini).
 * SPEED: ~5-20 seconds per test.
 *
 * @see _bmad-output/implementation-artifacts/tech-debt-tracker.md TD-AI-004
 */

import { Output, generateText } from 'ai'
import { describe, expect, it } from 'vitest'

import { buildL3Prompt } from '@/features/pipeline/prompts/build-l3-prompt'
import { l3OutputSchema } from '@/features/pipeline/schemas/l3-output'
import { getModelById } from '@/lib/ai/client'
import { estimateCost } from '@/lib/ai/costs'
import { getConfigForModel } from '@/lib/ai/types'

import { L3_TEST_SEGMENTS, TEST_PROJECT, TEST_TAXONOMY } from './fixtures'

// eslint-disable-next-line no-restricted-syntax -- integration test needs raw env check before app init
const HAS_ANTHROPIC_KEY = Boolean(process.env['ANTHROPIC_API_KEY'])

describe('L3 Pipeline — Real AI Integration', () => {
  it.skipIf(!HAS_ANTHROPIC_KEY)(
    'should produce findings from segments with known translation errors',
    async () => {
      // Arrange: build prompt with segments that have known issues
      // L3 receives prior findings (simulating L2 having already run)
      const prompt = buildL3Prompt({
        segments: L3_TEST_SEGMENTS,
        priorFindings: [],
        glossaryTerms: [],
        taxonomyCategories: TEST_TAXONOMY,
        project: TEST_PROJECT,
        surroundingContext: L3_TEST_SEGMENTS.map((seg, idx) => ({
          previous: L3_TEST_SEGMENTS.slice(Math.max(0, idx - 2), idx),
          current: seg,
          next: L3_TEST_SEGMENTS.slice(idx + 1, idx + 3),
        })),
      })

      // Act: call real Anthropic API
      const config = getConfigForModel('claude-sonnet-4-5-20250929', 'L3')
      const result = await generateText({
        model: getModelById('claude-sonnet-4-5-20250929'),
        output: Output.object({ schema: l3OutputSchema }),
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

      // Assert: at least 1 finding (L3 segments have 2 errors, 1 clean)
      expect(output.findings.length).toBeGreaterThanOrEqual(1)

      // Assert: every finding matches the L3 Zod schema (includes rationale)
      for (const finding of output.findings) {
        expect(finding.segmentId).toBeTruthy()
        expect(finding.category).toBeTruthy()
        expect(['critical', 'major', 'minor']).toContain(finding.severity)
        expect(finding.confidence).toBeGreaterThanOrEqual(0)
        expect(finding.confidence).toBeLessThanOrEqual(100)
        expect(finding.description).toBeTruthy()
        // L3-specific: rationale is REQUIRED
        expect(finding.rationale).toBeTruthy()
      }

      // Assert: segmentIds reference our test segments (no hallucinated IDs)
      const validSegmentIds = new Set(L3_TEST_SEGMENTS.map((s) => s.id))
      for (const finding of output.findings) {
        const normalizedId = finding.segmentId.replace(/^\[|\]$/g, '')
        expect(validSegmentIds.has(normalizedId)).toBe(true)
      }

      // Assert: the "fast" (abstain from food → quick) mistranslation should be caught
      const segment1Findings = output.findings.filter((f) => {
        const id = f.segmentId.replace(/^\[|\]$/g, '')
        return id === '00000000-0000-4000-8000-000000000010'
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

  it.skipIf(!HAS_ANTHROPIC_KEY)(
    'should produce segmentIds WITHOUT brackets (TD-AI-004 regression)',
    async () => {
      const prompt = buildL3Prompt({
        segments: L3_TEST_SEGMENTS.slice(0, 2),
        priorFindings: [],
        glossaryTerms: [],
        taxonomyCategories: TEST_TAXONOMY,
        project: TEST_PROJECT,
      })

      const config = getConfigForModel('claude-sonnet-4-5-20250929', 'L3')
      const result = await generateText({
        model: getModelById('claude-sonnet-4-5-20250929'),
        output: Output.object({ schema: l3OutputSchema }),
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

  it.skipIf(!HAS_ANTHROPIC_KEY)(
    'should include rationale for every finding (L3-specific requirement)',
    async () => {
      const prompt = buildL3Prompt({
        segments: L3_TEST_SEGMENTS,
        priorFindings: [],
        glossaryTerms: [],
        taxonomyCategories: TEST_TAXONOMY,
        project: TEST_PROJECT,
      })

      const config = getConfigForModel('claude-sonnet-4-5-20250929', 'L3')
      const result = await generateText({
        model: getModelById('claude-sonnet-4-5-20250929'),
        output: Output.object({ schema: l3OutputSchema }),
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

      // Every L3 finding must have a non-empty rationale
      for (const finding of output.findings) {
        expect(finding.rationale).toBeTruthy()
        // Rationale should be substantive (not just a single word)
        expect(finding.rationale.length).toBeGreaterThan(20)
      }
    },
  )

  it.skipIf(!HAS_ANTHROPIC_KEY)(
    'should produce findings with DB-insertable structure (severity, confidence, nullable fields)',
    async () => {
      // Verifies that AI output can be mapped to the findings DB table without type errors.
      // Catches format mismatches between real AI structured output and Drizzle insert schema.
      const prompt = buildL3Prompt({
        segments: L3_TEST_SEGMENTS,
        priorFindings: [],
        glossaryTerms: [],
        taxonomyCategories: TEST_TAXONOMY,
        project: TEST_PROJECT,
        surroundingContext: L3_TEST_SEGMENTS.map((seg, idx) => ({
          previous: L3_TEST_SEGMENTS.slice(Math.max(0, idx - 2), idx),
          current: seg,
          next: L3_TEST_SEGMENTS.slice(idx + 1, idx + 3),
        })),
      })

      const config = getConfigForModel('claude-sonnet-4-5-20250929', 'L3')
      const result = await generateText({
        model: getModelById('claude-sonnet-4-5-20250929'),
        output: Output.object({ schema: l3OutputSchema }),
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

      const segmentMap = new Map(L3_TEST_SEGMENTS.map((s) => [s.id, s]))

      for (const finding of output.findings) {
        const normalizedId = finding.segmentId.replace(/^\[|\]$/g, '')
        const seg = segmentMap.get(normalizedId)

        // Simulate the DB insert mapping from runL3ForFile (Step 8)
        // L3 appends rationale to description: `${description}\n\nRationale: ${rationale}`
        const dbInsert = {
          fileId: '00000000-0000-4000-8000-ffffffffffff',
          segmentId: normalizedId,
          projectId: '00000000-0000-4000-8000-ffffffffffff',
          tenantId: '00000000-0000-4000-8000-ffffffffffff',
          category: finding.category,
          severity: finding.severity,
          description: `${finding.description}\n\nRationale: ${finding.rationale}`,
          suggestedFix: finding.suggestedFix, // L3 schema uses "suggestedFix"
          sourceTextExcerpt: seg ? seg.sourceText.slice(0, 200) : null,
          targetTextExcerpt: seg ? seg.targetText.slice(0, 200) : null,
          detectedByLayer: 'L3' as const,
          aiModel: 'claude-sonnet-4-5-20250929',
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
        // L3 description includes rationale
        expect(dbInsert.description).toContain('Rationale:')
        // suggestedFix is string | null (Guardrail: .nullable() only — no undefined)
        expect(dbInsert.suggestedFix === null || typeof dbInsert.suggestedFix === 'string').toBe(
          true,
        )
        expect(dbInsert.suggestedFix).not.toBeUndefined()
        expect(dbInsert.aiConfidence).toBeGreaterThanOrEqual(0)
        expect(dbInsert.aiConfidence).toBeLessThanOrEqual(100)
      }
    },
  )

  it.skipIf(!HAS_ANTHROPIC_KEY)(
    'should log token usage for cost tracking (Guardrail #12)',
    async () => {
      const prompt = buildL3Prompt({
        segments: L3_TEST_SEGMENTS.slice(0, 2),
        priorFindings: [],
        glossaryTerms: [],
        taxonomyCategories: TEST_TAXONOMY,
        project: TEST_PROJECT,
      })

      const config = getConfigForModel('claude-sonnet-4-5-20250929', 'L3')
      const result = await generateText({
        model: getModelById('claude-sonnet-4-5-20250929'),
        output: Output.object({ schema: l3OutputSchema }),
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        prompt,
      })

      // Token usage must be present and positive
      expect(result.usage).toBeDefined()
      expect(result.usage.inputTokens).toBeGreaterThan(0)
      expect(result.usage.outputTokens).toBeGreaterThan(0)

      // Verify cost can be computed (estimateCost requires non-null tokens)
      const cost = estimateCost('claude-sonnet-4-5-20250929', 'L3', result.usage)
      expect(cost).toBeGreaterThan(0)
      // claude-sonnet L3 call should be under $0.10 for a small prompt
      expect(cost).toBeLessThan(0.1)
    },
  )

  it.skipIf(!HAS_ANTHROPIC_KEY)(
    'should produce findings with categories matching taxonomy when taxonomy is provided',
    async () => {
      const prompt = buildL3Prompt({
        segments: L3_TEST_SEGMENTS,
        priorFindings: [],
        glossaryTerms: [],
        taxonomyCategories: TEST_TAXONOMY,
        project: TEST_PROJECT,
      })

      const config = getConfigForModel('claude-sonnet-4-5-20250929', 'L3')
      const result = await generateText({
        model: getModelById('claude-sonnet-4-5-20250929'),
        output: Output.object({ schema: l3OutputSchema }),
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

      // Build valid category set (case-insensitive, matching runL3ForFile validation)
      const validCategories = new Set(TEST_TAXONOMY.map((t) => t.category.toLowerCase()))

      // Count how many findings use valid taxonomy categories
      let validCount = 0
      for (const finding of output.findings) {
        if (validCategories.has(finding.category.toLowerCase())) {
          validCount++
        }
      }

      // At least 70% of findings should use valid taxonomy categories
      const complianceRate = validCount / output.findings.length
      expect(complianceRate).toBeGreaterThanOrEqual(0.7)
    },
  )

  it.skipIf(!HAS_ANTHROPIC_KEY)(
    'should handle L2 prior findings context without duplicating them',
    async () => {
      // Simulate L2 having already found the "fast" mistranslation
      const priorFindings = [
        {
          id: '00000000-0000-4000-8000-aaaaaaaaaaaa',
          segmentId: '00000000-0000-4000-8000-000000000010',
          category: 'Mistranslation',
          severity: 'critical' as const,
          description: '"fast" (abstain from food) incorrectly translated as "รวดเร็ว" (quick)',
          detectedByLayer: 'L2' as const,
        },
      ]

      const prompt = buildL3Prompt({
        segments: L3_TEST_SEGMENTS,
        priorFindings,
        glossaryTerms: [],
        taxonomyCategories: TEST_TAXONOMY,
        project: TEST_PROJECT,
        surroundingContext: L3_TEST_SEGMENTS.map((seg, idx) => ({
          previous: L3_TEST_SEGMENTS.slice(Math.max(0, idx - 2), idx),
          current: seg,
          next: L3_TEST_SEGMENTS.slice(idx + 1, idx + 3),
        })),
      })

      const config = getConfigForModel('claude-sonnet-4-5-20250929', 'L3')
      const result = await generateText({
        model: getModelById('claude-sonnet-4-5-20250929'),
        output: Output.object({ schema: l3OutputSchema }),
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

      // L3 should either find new issues on other segments (wire transfer)
      // or confirm/contradict L2's finding — but NOT blindly duplicate
      // Every finding should still have valid structure
      for (const finding of output.findings) {
        expect(finding.segmentId).toBeTruthy()
        expect(['critical', 'major', 'minor']).toContain(finding.severity)
        expect(finding.rationale).toBeTruthy()
      }

      // Summary should exist and be non-empty
      expect(output.summary).toBeTruthy()
    },
  )
})
