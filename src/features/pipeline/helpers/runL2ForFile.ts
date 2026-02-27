import { generateText, Output } from 'ai'
import { and, eq } from 'drizzle-orm'
import { NonRetriableError } from 'inngest'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { findings } from '@/db/schema/findings'
import { segments } from '@/db/schema/segments'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { FINDING_BATCH_SIZE, MAX_EXCERPT_LENGTH } from '@/features/pipeline/engine/constants'
import { checkProjectBudget } from '@/lib/ai/budget'
import { getModelById } from '@/lib/ai/client'
import { aggregateUsage, estimateCost, logAIUsage } from '@/lib/ai/costs'
import { classifyAIError } from '@/lib/ai/errors'
import { getModelForLayerWithFallback } from '@/lib/ai/providers'
import type { AIUsageRecord, ChunkResult } from '@/lib/ai/types'
import { getConfigForModel } from '@/lib/ai/types'
import { logger } from '@/lib/logger'
import { aiL2ProjectLimiter } from '@/lib/ratelimit'

import { chunkSegments } from './chunkSegments'

// ── Types ──

type RunL2Input = {
  fileId: string
  projectId: string
  tenantId: string
  userId?: string
}

export type L2Finding = {
  segmentId: string
  category: string
  severity: 'critical' | 'major' | 'minor'
  confidence: number
  description: string
  suggestedFix: string | null
}

export type L2Result = {
  findingCount: number
  duration: number
  aiModel: string
  chunksTotal: number
  chunksSucceeded: number
  chunksFailed: number
  partialFailure: boolean
  totalUsage: {
    inputTokens: number
    outputTokens: number
    estimatedCostUsd: number
  }
}

// ── AI Response Schema (Guardrail #17: .nullable() only, never .optional()) ──

export const l2ChunkResponseSchema = z.object({
  findings: z.array(
    z.object({
      segmentId: z.string(),
      category: z.string(),
      severity: z.enum(['critical', 'major', 'minor']),
      confidence: z.number(),
      description: z.string(),
      suggestedFix: z.string().nullable(),
    }),
  ),
  summary: z.string(),
})

export type L2ChunkResponse = z.infer<typeof l2ChunkResponseSchema>

// ── Internal Types ──

type SegmentRow = {
  id: string
  sourceText: string
  targetText: string
  segmentNumber: number
  sourceLang: string
  targetLang: string
}

type L1FindingContext = {
  id: string
  segmentId: string | null
  category: string
  severity: string
  description: string
}

// ── Main Function ──

/**
 * Run L2 AI screening on a file.
 *
 * Pattern mirrors runL1ForFile (same 12-step lifecycle) with additions:
 *   - Segment chunking at 30K chars (Guardrail #21)
 *   - AI calls per chunk with partial failure tolerance
 *   - Cost tracking per call (Guardrail #19)
 *   - Budget guard before AI calls (Guardrail #22)
 *
 * File status transitions: l1_completed → l2_processing → l2_completed | failed
 *
 * Partial failure: if some chunks fail (non-retriable), findings from successful
 * chunks are still persisted. partialFailure=true signals the caller.
 *
 * Retriable errors (rate_limit, timeout): re-thrown to let Inngest retry the step.
 */
export async function runL2ForFile({
  fileId,
  projectId,
  tenantId,
  userId,
}: RunL2Input): Promise<L2Result> {
  // Step 1: CAS guard — atomic status transition
  const [file] = await db
    .update(files)
    .set({ status: 'l2_processing', updatedAt: new Date() })
    .where(
      and(
        withTenant(files.tenantId, tenantId),
        eq(files.id, fileId),
        eq(files.status, 'l1_completed'),
      ),
    )
    .returning()

  if (!file) {
    throw new NonRetriableError('File not in l1_completed state or already being processed')
  }

  try {
    // Step 2a: Per-project L2 rate limit (retriable — Inngest retries with backoff)
    const { success: rateLimitAllowed } = await aiL2ProjectLimiter.limit(projectId)
    if (!rateLimitAllowed) {
      throw new Error('L2 analysis queue full for this project. Resuming shortly.')
    }

    // Step 2b: Budget guard (Guardrail #22)
    const budget = await checkProjectBudget(projectId, tenantId)
    if (!budget.hasQuota) {
      throw new NonRetriableError('AI quota exhausted')
    }

    // Step 2c: Resolve model (pinned model from project config → fallback chain)
    const { primary: modelId, fallbacks } = await getModelForLayerWithFallback(
      'L2',
      projectId,
      tenantId,
    )
    if (fallbacks.length > 0) {
      logger.info({ fileId, modelId, fallbacks }, 'L2 fallback chain available (not yet consumed)')
    }

    // Step 3: Load segments (withTenant on every query)
    const segmentRows: SegmentRow[] = await db
      .select({
        id: segments.id,
        sourceText: segments.sourceText,
        targetText: segments.targetText,
        segmentNumber: segments.segmentNumber,
        sourceLang: segments.sourceLang,
        targetLang: segments.targetLang,
      })
      .from(segments)
      .where(
        and(
          withTenant(segments.tenantId, tenantId),
          eq(segments.fileId, fileId),
          eq(segments.projectId, projectId),
        ),
      )
      .orderBy(segments.segmentNumber)

    // Step 4: Load L1 findings for context (L2 avoids duplicating L1 issues)
    const l1FindingRows: L1FindingContext[] = await db
      .select({
        id: findings.id,
        segmentId: findings.segmentId,
        category: findings.category,
        severity: findings.severity,
        description: findings.description,
      })
      .from(findings)
      .where(
        and(
          withTenant(findings.tenantId, tenantId),
          eq(findings.fileId, fileId),
          eq(findings.detectedByLayer, 'L1'),
        ),
      )

    // Step 5: Chunk segments (Guardrail #21)
    const chunks = chunkSegments(segmentRows)

    // Step 6: Process each chunk with AI (partial failure tolerance)
    const startTime = performance.now()
    const chunkResults: ChunkResult<L2ChunkResponse>[] = []
    const usageRecords: AIUsageRecord[] = []
    const config = getConfigForModel(modelId, 'L2')

    for (const chunk of chunks) {
      const chunkStart = performance.now()
      try {
        const result = await generateText({
          model: getModelById(modelId),
          output: Output.object({ schema: l2ChunkResponseSchema }),
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          prompt: buildL2Prompt(chunk.segments, l1FindingRows),
        })

        // Cost tracking (Guardrail #19)
        const cost = estimateCost(modelId, 'L2', result.usage)
        const record: AIUsageRecord = {
          tenantId,
          projectId,
          fileId,
          model: modelId,
          layer: 'L2',
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          estimatedCostUsd: cost,
          chunkIndex: chunk.chunkIndex,
          durationMs: Math.round(performance.now() - chunkStart),
        }
        logAIUsage(record).catch(() => {
          /* non-critical — DB failure already logged inside logAIUsage */
        })
        usageRecords.push(record)

        chunkResults.push({
          chunkIndex: chunk.chunkIndex,
          success: true,
          data: result.output,
          error: null,
          usage: result.usage,
        })
      } catch (error) {
        const kind = classifyAIError(error)

        // Retriable errors → re-throw (Inngest retries entire step)
        if (kind === 'rate_limit' || kind === 'timeout') {
          throw error
        }

        // Non-retriable for this chunk → log and continue with remaining chunks
        logger.error(
          { err: error, fileId, chunkIndex: chunk.chunkIndex, aiErrorKind: kind },
          'L2 chunk failed (non-retriable — continuing with remaining chunks)',
        )

        chunkResults.push({
          chunkIndex: chunk.chunkIndex,
          success: false,
          data: null,
          error: error instanceof Error ? error.message : String(error),
          usage: null,
        })
      }
    }

    const duration = Math.round(performance.now() - startTime)

    // Step 7: Flatten + validate findings from successful chunks
    const segmentIdSet = new Set(segmentRows.map((s) => s.id))
    const allFindings: L2Finding[] = []

    for (const cr of chunkResults) {
      if (!cr.success || !cr.data) continue

      for (const f of cr.data.findings) {
        // Validate segmentId exists in this file (open question #5 from spike guide)
        if (!segmentIdSet.has(f.segmentId)) {
          logger.warn(
            { fileId, segmentId: f.segmentId, chunkIndex: cr.chunkIndex },
            'Dropped L2 finding with invalid segmentId',
          )
          continue
        }

        allFindings.push({
          segmentId: f.segmentId,
          category: f.category,
          severity: f.severity,
          confidence: Math.min(100, Math.max(0, f.confidence)),
          description: f.description,
          suggestedFix: f.suggestedFix,
        })
      }
    }

    // Step 8: Map to DB inserts (enrich with excerpts from loaded segments)
    const segmentMap = new Map(segmentRows.map((s) => [s.id, s]))
    const findingInserts = allFindings.map((f) => {
      const seg = segmentMap.get(f.segmentId)
      return {
        fileId,
        segmentId: f.segmentId,
        projectId,
        tenantId,
        category: f.category,
        severity: f.severity,
        description: f.description,
        suggestedFix: f.suggestedFix,
        sourceTextExcerpt: seg ? seg.sourceText.slice(0, MAX_EXCERPT_LENGTH) : null,
        targetTextExcerpt: seg ? seg.targetText.slice(0, MAX_EXCERPT_LENGTH) : null,
        detectedByLayer: 'L2' as const,
        aiModel: modelId,
        aiConfidence: f.confidence,
        reviewSessionId: null,
        status: 'pending' as const,
        segmentCount: 1,
      }
    })

    // Step 9: Atomic DELETE + INSERT (idempotent re-run)
    await db.transaction(async (tx) => {
      await tx
        .delete(findings)
        .where(
          and(
            withTenant(findings.tenantId, tenantId),
            eq(findings.fileId, fileId),
            eq(findings.detectedByLayer, 'L2'),
          ),
        )

      for (let i = 0; i < findingInserts.length; i += FINDING_BATCH_SIZE) {
        const batch = findingInserts.slice(i, i + FINDING_BATCH_SIZE)
        await tx.insert(findings).values(batch)
      }
    })

    // Step 10: Update file status
    await db
      .update(files)
      .set({ status: 'l2_completed', updatedAt: new Date() })
      .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))

    // Step 11: Audit log (non-fatal)
    const chunksSucceeded = chunkResults.filter((c) => c.success).length
    const chunksFailed = chunkResults.filter((c) => !c.success).length

    try {
      await writeAuditLog({
        tenantId,
        ...(userId !== undefined ? { userId } : {}),
        entityType: 'file',
        entityId: fileId,
        action: 'file.l2_completed',
        newValue: {
          findingCount: allFindings.length,
          chunksTotal: chunks.length,
          chunksSucceeded,
          chunksFailed,
          partialFailure: chunksFailed > 0,
          aiModel: modelId,
          duration,
        },
      })
    } catch (auditErr) {
      logger.error({ err: auditErr, fileId }, 'L2 audit log write failed (non-fatal)')
    }

    // Step 12: Return result summary (findings already in DB)
    const totalUsage = aggregateUsage(usageRecords)

    return {
      findingCount: allFindings.length,
      duration,
      aiModel: modelId,
      chunksTotal: chunks.length,
      chunksSucceeded,
      chunksFailed,
      partialFailure: chunksFailed > 0,
      totalUsage,
    }
  } catch (err) {
    logger.error({ err, fileId }, 'L2 screening failed')

    // Best-effort rollback to 'failed' status
    try {
      await db
        .update(files)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr, fileId }, 'Failed to roll back file status to failed')
    }

    throw err
  }
}

// ── Prompt Builder ──
// Minimal template — Story 3.1 refines with full prompt engineering

function buildL2Prompt(segmentRows: SegmentRow[], l1Findings: L1FindingContext[]): string {
  const segmentText = segmentRows
    .map(
      (s) =>
        `[${s.id}] (${s.sourceLang}→${s.targetLang})\nSource: ${s.sourceText}\nTarget: ${s.targetText}`,
    )
    .join('\n\n')

  const l1Context =
    l1Findings.length > 0
      ? `\n\nExisting L1 rule-based findings (do NOT duplicate these):\n${l1Findings
          .map((f) => `- [${f.segmentId}] ${f.category} (${f.severity}): ${f.description}`)
          .join('\n')}`
      : ''

  return `You are a localization QA reviewer. Analyze these translation segments for quality issues.

Focus on semantic issues that rule-based checks cannot catch:
- Accuracy: mistranslation, omission, addition
- Fluency: unnatural phrasing, grammar errors
- Terminology: inconsistent term usage
- Style: register mismatch, locale convention violations

For each issue found, return:
- segmentId: the exact segment ID from the input
- category: issue category (accuracy, fluency, terminology, style, locale)
- severity: critical (meaning change), major (noticeable impact), minor (polish)
- confidence: 0-100 how certain you are
- description: clear explanation of the issue
- suggestedFix: suggested correction or null if unclear

Segments:
${segmentText}${l1Context}`
}

// Exported for testing
export { buildL2Prompt as _buildL2Prompt }
