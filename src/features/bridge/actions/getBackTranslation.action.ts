'use server'

import 'server-only'

import { generateText, Output } from 'ai'
import { and, asc, between, eq, ne } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { projects } from '@/db/schema/projects'
import { segments } from '@/db/schema/segments'
import {
  cacheBackTranslation,
  computeTargetTextHash,
  getCachedBackTranslation,
} from '@/features/bridge/helpers/btCache'
import { buildBTPrompt } from '@/features/bridge/helpers/buildBTPrompt'
import type { BackTranslationOutput } from '@/features/bridge/types'
import { backTranslationSchema } from '@/features/bridge/validation/btSchema'
import { checkProjectBudget } from '@/lib/ai/budget'
import { qaProvider } from '@/lib/ai/client'
import { estimateCost, logAIUsage } from '@/lib/ai/costs'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types'

// ── Input validation ──

const inputSchema = z.object({
  segmentId: z.string().uuid(),
  projectId: z.string().uuid(),
  skipCache: z.boolean().default(false),
})

// Model version for cache key
const BT_MODEL_VERSION = 'gpt-4o-mini-bt-v1'
const BT_FALLBACK_MODEL_VERSION = 'claude-sonnet-bt-v1'

/**
 * Get back-translation for a segment.
 *
 * Flow: auth → load segment → cache check → budget check → AI call → log → cache → return
 *
 * Guardrails: #1 (withTenant), #16 (generateText + Output.object), #19 (logAIUsage),
 * #22 (budget check), #51 (BT alias), #56 (low-confidence fallback)
 */
export async function getBackTranslation(
  input: z.input<typeof inputSchema>,
): Promise<ActionResult<BackTranslationOutput>> {
  const startTime = Date.now()

  try {
    // Auth
    // Story 5.2c: native_reviewer needs BT access for assigned findings
    const user = await requireRole('native_reviewer')
    const { tenantId } = user

    // Validate input
    const parsed = inputSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.message, code: 'VALIDATION_ERROR' }
    }
    const { segmentId, projectId, skipCache } = parsed.data

    // Load segment (Guardrail #1: withTenant, #14: projectId defense-in-depth)
    const [segment] = await db
      .select({
        id: segments.id,
        fileId: segments.fileId,
        segmentNumber: segments.segmentNumber,
        sourceText: segments.sourceText,
        targetText: segments.targetText,
        sourceLang: segments.sourceLang,
        targetLang: segments.targetLang,
      })
      .from(segments)
      .where(
        and(
          eq(segments.id, segmentId),
          eq(segments.projectId, projectId),
          withTenant(segments.tenantId, tenantId),
        ),
      )

    if (!segment) {
      return { success: false, error: 'Segment not found', code: 'NOT_FOUND' }
    }

    const languagePair = `${segment.sourceLang}→${segment.targetLang}`

    // Compute hash (Guardrail #57)
    const targetTextHash = await computeTargetTextHash(segment.targetText)

    // Cache check (skip if requested)
    if (!skipCache) {
      const cached = await getCachedBackTranslation(
        segmentId,
        languagePair,
        BT_MODEL_VERSION,
        tenantId,
        targetTextHash, // Guardrail #57: match exact target text version
      )
      if (cached) {
        return {
          success: true,
          data: {
            ...cached,
            cached: true,
            latencyMs: Date.now() - startTime,
          },
        }
      }

      // Fallback cache check — reuse prior claude-sonnet results (Guardrail #56)
      const fallbackCached = await getCachedBackTranslation(
        segmentId,
        languagePair,
        BT_FALLBACK_MODEL_VERSION,
        tenantId,
        targetTextHash,
      )
      if (fallbackCached) {
        return {
          success: true,
          data: {
            ...fallbackCached,
            cached: true,
            latencyMs: Date.now() - startTime,
          },
        }
      }
    }

    // Budget check (Guardrail #22)
    const budget = await checkProjectBudget(projectId, tenantId)
    if (!budget.hasQuota) {
      return { success: false, error: 'AI quota exhausted', code: 'BUDGET_EXHAUSTED' }
    }

    // Load project confidence threshold
    const [project] = await db
      .select({ btConfidenceThreshold: projects.btConfidenceThreshold })
      .from(projects)
      .where(and(eq(projects.id, projectId), withTenant(projects.tenantId, tenantId)))

    const confidenceThreshold = project?.btConfidenceThreshold ?? 0.6

    // Query adjacent segments for context (AC2 / TD-BT-001)
    // Guardrail #1: withTenant on every query
    const adjacentRows = await db
      .select({
        sourceText: segments.sourceText,
        targetText: segments.targetText,
        segmentNumber: segments.segmentNumber,
      })
      .from(segments)
      .where(
        and(
          withTenant(segments.tenantId, tenantId),
          eq(segments.fileId, segment.fileId),
          between(segments.segmentNumber, segment.segmentNumber - 2, segment.segmentNumber + 2),
          ne(segments.segmentNumber, segment.segmentNumber),
        ),
      )
      .orderBy(asc(segments.segmentNumber))

    const contextSegments = adjacentRows.map((r) => ({
      sourceText: r.sourceText,
      targetText: r.targetText,
      segmentNumber: r.segmentNumber,
    }))

    // Build prompt
    const { system, user: userPrompt } = buildBTPrompt({
      sourceText: segment.sourceText,
      targetText: segment.targetText,
      sourceLang: segment.sourceLang,
      targetLang: segment.targetLang,
      contextSegments,
    })

    // AI call — primary model (Guardrail #16, #51)
    const result = await generateText({
      model: qaProvider.languageModel('back-translation'),
      output: Output.object({ schema: backTranslationSchema }),
      system,
      prompt: userPrompt,
      maxOutputTokens: 4096, // Guardrail #16: maxOutputTokens, NOT maxTokens
    })

    // CR-R2 F6: Log usage AFTER output validation so status reflects reality
    const primaryCost = estimateCost('gpt-4o-mini', 'BT', result.usage)
    const primaryDurationMs = Date.now() - startTime

    // Access result via result.output (Guardrail #16: NOT result.object)
    // Guardrail #18: NoOutputGeneratedError = non-retriable (schema/content filter issue)
    // CR-R2 F5: assign output to local var once — getter may throw or have side effects
    let btResult: Awaited<typeof result.output>
    try {
      const output = result.output
      if (!output) {
        await logAIUsage({
          tenantId,
          projectId,
          fileId: segment.fileId,
          model: 'gpt-4o-mini',
          layer: 'BT',
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          estimatedCostUsd: primaryCost,
          chunkIndex: null,
          durationMs: primaryDurationMs,
          languagePair,
          status: 'error',
        })
        return { success: false, error: 'AI returned no structured output', code: 'AI_NO_OUTPUT' }
      }
      btResult = output
    } catch (outputErr) {
      logger.error(
        { err: outputErr, segmentId: input.segmentId, finishReason: result.finishReason },
        'getBackTranslation: AI output accessor threw — schema mismatch or content filter',
      )
      // CR-R2 F6: log as no_output when accessor throws
      await logAIUsage({
        tenantId,
        projectId,
        fileId: segment.fileId,
        model: 'gpt-4o-mini',
        layer: 'BT',
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        estimatedCostUsd: primaryCost,
        chunkIndex: null,
        durationMs: primaryDurationMs,
        languagePair,
        status: 'error',
      })
      return { success: false, error: 'AI failed to generate valid output', code: 'AI_NO_OUTPUT' }
    }

    // CR-R2 F6: Log primary usage after output validation confirmed success (Guardrail #19, #52)
    await logAIUsage({
      tenantId,
      projectId,
      fileId: segment.fileId,
      model: 'gpt-4o-mini',
      layer: 'BT',
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      estimatedCostUsd: primaryCost,
      chunkIndex: null,
      durationMs: primaryDurationMs,
      languagePair,
      status: 'success',
    })

    // Low-confidence fallback (Guardrail #56): retry with claude-sonnet if budget allows
    if (btResult.confidence < confidenceThreshold) {
      const fallbackBudget = await checkProjectBudget(projectId, tenantId)
      if (fallbackBudget.hasQuota) {
        const fallbackStart = Date.now()
        try {
          const fallbackResult = await generateText({
            model: qaProvider.languageModel('l3-analysis'),
            output: Output.object({ schema: backTranslationSchema }),
            system,
            prompt: userPrompt,
            maxOutputTokens: 8192,
          })

          const fallbackCost = estimateCost(
            'claude-sonnet-4-5-20250929',
            'BT',
            fallbackResult.usage,
          )
          const fallbackDurationMs = Date.now() - fallbackStart

          let fallbackOutput: typeof btResult | null = null
          try {
            if (fallbackResult.output) {
              fallbackOutput = fallbackResult.output
            } else {
              logger.warn({ segmentId }, 'BT fallback returned no output')
            }
          } catch (fallbackOutputErr) {
            logger.warn({ err: fallbackOutputErr, segmentId }, 'BT fallback output accessor threw')
          }

          // CR-R2 F6: Log fallback usage after output validation
          await logAIUsage({
            tenantId,
            projectId,
            fileId: segment.fileId,
            model: 'claude-sonnet-4-5-20250929',
            layer: 'BT',
            inputTokens: fallbackResult.usage.inputTokens ?? 0,
            outputTokens: fallbackResult.usage.outputTokens ?? 0,
            estimatedCostUsd: fallbackCost,
            chunkIndex: null,
            durationMs: fallbackDurationMs,
            languagePair,
            status: fallbackOutput ? 'success' : 'error',
          })

          // Use whichever has higher confidence
          if (fallbackOutput && fallbackOutput.confidence > btResult.confidence) {
            // Cache fallback result (non-fatal: FK violation if file/segment deleted during AI call)
            try {
              await cacheBackTranslation({
                segmentId,
                tenantId,
                languagePair,
                modelVersion: BT_FALLBACK_MODEL_VERSION,
                targetTextHash,
                result: fallbackOutput,
                inputTokens: fallbackResult.usage.inputTokens ?? 0,
                outputTokens: fallbackResult.usage.outputTokens ?? 0,
                estimatedCostUsd: fallbackCost,
              })
            } catch (cacheErr) {
              logger.error(
                { err: cacheErr, segmentId },
                'Failed to cache BT fallback result (non-fatal)',
              )
            }

            return {
              success: true,
              data: {
                ...fallbackOutput,
                cached: false,
                latencyMs: Date.now() - startTime,
              },
            }
          }
        } catch (err) {
          logger.warn(
            { err, segmentId },
            'BT fallback to claude-sonnet failed, using primary result',
          )
        }
      }
    }

    // Cache primary result (non-fatal: FK violation if file/segment deleted during AI call)
    try {
      await cacheBackTranslation({
        segmentId,
        tenantId,
        languagePair,
        modelVersion: BT_MODEL_VERSION,
        targetTextHash,
        result: btResult,
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        estimatedCostUsd: primaryCost,
      })
    } catch (cacheErr) {
      logger.error({ err: cacheErr, segmentId }, 'Failed to cache BT primary result (non-fatal)')
    }

    return {
      success: true,
      data: {
        ...btResult,
        cached: false,
        latencyMs: Date.now() - startTime,
      },
    }
  } catch (err) {
    logger.error({ err }, 'getBackTranslation failed')
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
    }
  }
}
