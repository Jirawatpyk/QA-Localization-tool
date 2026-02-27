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
import { aiL3ProjectLimiter } from '@/lib/ratelimit'

import { chunkSegments } from './chunkSegments'

// ── Types ──

type RunL3Input = {
  fileId: string
  projectId: string
  tenantId: string
  userId?: string
}

export type L3Finding = {
  segmentId: string
  category: string
  severity: 'critical' | 'major' | 'minor'
  confidence: number
  description: string
  suggestedFix: string | null
  rationale: string
}

export type L3Result = {
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

// ── AI Response Schema (Guardrail #17: .nullable() only) ──
// L3 adds 'rationale' for deep reasoning (not present in L2)

export const l3ChunkResponseSchema = z.object({
  findings: z.array(
    z.object({
      segmentId: z.string(),
      category: z.string(),
      severity: z.enum(['critical', 'major', 'minor']),
      confidence: z.number(),
      description: z.string(),
      suggestedFix: z.string().nullable(),
      rationale: z.string(),
    }),
  ),
  summary: z.string(),
})

export type L3ChunkResponse = z.infer<typeof l3ChunkResponseSchema>

// ── Internal Types ──

type SegmentRow = {
  id: string
  sourceText: string
  targetText: string
  segmentNumber: number
  sourceLang: string
  targetLang: string
}

type PriorFindingContext = {
  id: string
  segmentId: string | null
  category: string
  severity: string
  description: string
  detectedByLayer: string
}

// ── Main Function ──

/**
 * Run L3 deep AI analysis on a file (Thorough mode only).
 *
 * Mirrors runL2ForFile pattern with key differences:
 *   - Model: claude-sonnet-4-5-20250929 (deeper, more expensive)
 *   - CAS guard: l2_completed → l3_processing → l3_completed
 *   - Context: loads both L1 + L2 findings to avoid duplication
 *   - Schema: includes 'rationale' field for reasoning chain
 *
 * File status transitions: l2_completed → l3_processing → l3_completed | failed
 */
export async function runL3ForFile({
  fileId,
  projectId,
  tenantId,
  userId,
}: RunL3Input): Promise<L3Result> {
  // Step 1: CAS guard — l2_completed → l3_processing
  const [file] = await db
    .update(files)
    .set({ status: 'l3_processing', updatedAt: new Date() })
    .where(
      and(
        withTenant(files.tenantId, tenantId),
        eq(files.id, fileId),
        eq(files.status, 'l2_completed'),
      ),
    )
    .returning()

  if (!file) {
    throw new NonRetriableError('File not in l2_completed state or already being processed')
  }

  try {
    // Step 2a: Per-project L3 rate limit (retriable — Inngest retries with backoff)
    const { success: rateLimitAllowed } = await aiL3ProjectLimiter.limit(projectId)
    if (!rateLimitAllowed) {
      throw new Error('L3 deep analysis queue full. Resuming shortly.')
    }

    // Step 2b: Budget guard (Guardrail #22)
    const budget = await checkProjectBudget(projectId, tenantId)
    if (!budget.hasQuota) {
      throw new NonRetriableError('AI quota exhausted')
    }

    // Step 2c: Resolve model (pinned model from project config → fallback chain)
    const { primary: modelId, fallbacks } = await getModelForLayerWithFallback(
      'L3',
      projectId,
      tenantId,
    )
    if (fallbacks.length > 0) {
      logger.info({ fileId, modelId, fallbacks }, 'L3 fallback chain available (not yet consumed)')
    }

    // Step 3: Load segments
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

    // Step 4: Load L1 + L2 findings for context (L3 avoids duplicating both)
    const priorFindings: PriorFindingContext[] = await db
      .select({
        id: findings.id,
        segmentId: findings.segmentId,
        category: findings.category,
        severity: findings.severity,
        description: findings.description,
        detectedByLayer: findings.detectedByLayer,
      })
      .from(findings)
      .where(and(withTenant(findings.tenantId, tenantId), eq(findings.fileId, fileId)))

    // Step 5: Chunk segments (Guardrail #21)
    const chunks = chunkSegments(segmentRows)

    // Step 6: Process each chunk with AI
    const startTime = performance.now()
    const chunkResults: ChunkResult<L3ChunkResponse>[] = []
    const usageRecords: AIUsageRecord[] = []
    const config = getConfigForModel(modelId, 'L3')

    for (const chunk of chunks) {
      const chunkStart = performance.now()
      try {
        const result = await generateText({
          model: getModelById(modelId),
          output: Output.object({ schema: l3ChunkResponseSchema }),
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          prompt: buildL3Prompt(chunk.segments, priorFindings),
        })

        // Cost tracking (Guardrail #19)
        const cost = estimateCost(modelId, 'L3', result.usage)
        const record: AIUsageRecord = {
          tenantId,
          projectId,
          fileId,
          model: modelId,
          layer: 'L3',
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

        if (kind === 'rate_limit' || kind === 'timeout') {
          throw error
        }

        logger.error(
          { err: error, fileId, chunkIndex: chunk.chunkIndex, aiErrorKind: kind },
          'L3 chunk failed (non-retriable — continuing with remaining chunks)',
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

    // Step 7: Flatten + validate findings
    const segmentIdSet = new Set(segmentRows.map((s) => s.id))
    const allFindings: L3Finding[] = []

    for (const cr of chunkResults) {
      if (!cr.success || !cr.data) continue

      for (const f of cr.data.findings) {
        if (!segmentIdSet.has(f.segmentId)) {
          logger.warn(
            { fileId, segmentId: f.segmentId, chunkIndex: cr.chunkIndex },
            'Dropped L3 finding with invalid segmentId',
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
          rationale: f.rationale,
        })
      }
    }

    // Step 8: Map to DB inserts
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
        description: `${f.description}\n\nRationale: ${f.rationale}`,
        suggestedFix: f.suggestedFix,
        sourceTextExcerpt: seg ? seg.sourceText.slice(0, MAX_EXCERPT_LENGTH) : null,
        targetTextExcerpt: seg ? seg.targetText.slice(0, MAX_EXCERPT_LENGTH) : null,
        detectedByLayer: 'L3' as const,
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
            eq(findings.detectedByLayer, 'L3'),
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
      .set({ status: 'l3_completed', updatedAt: new Date() })
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
        action: 'file.l3_completed',
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
      logger.error({ err: auditErr, fileId }, 'L3 audit log write failed (non-fatal)')
    }

    // Step 12: Return result summary
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
    logger.error({ err, fileId }, 'L3 deep analysis failed')

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

function buildL3Prompt(segmentRows: SegmentRow[], priorFindings: PriorFindingContext[]): string {
  const segmentText = segmentRows
    .map(
      (s) =>
        `[${s.id}] (${s.sourceLang}→${s.targetLang})\nSource: ${s.sourceText}\nTarget: ${s.targetText}`,
    )
    .join('\n\n')

  const l1Findings = priorFindings.filter((f) => f.detectedByLayer === 'L1')
  const l2Findings = priorFindings.filter((f) => f.detectedByLayer === 'L2')

  const priorContext = [
    l1Findings.length > 0
      ? `L1 rule-based findings:\n${l1Findings
          .map((f) => `- [${f.segmentId}] ${f.category} (${f.severity}): ${f.description}`)
          .join('\n')}`
      : null,
    l2Findings.length > 0
      ? `L2 AI screening findings:\n${l2Findings
          .map((f) => `- [${f.segmentId}] ${f.category} (${f.severity}): ${f.description}`)
          .join('\n')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  const priorSection = priorContext
    ? `\n\nPrior findings from L1/L2 (do NOT duplicate — focus on NEW issues or re-evaluate severity):\n${priorContext}`
    : ''

  return `You are a senior localization QA specialist performing deep semantic analysis.

Your role is to find subtle issues that automated rules and fast AI screening might miss:
- Semantic accuracy: does the translation preserve the original meaning precisely?
- Cultural appropriateness: is the translation suitable for the target locale?
- Contextual fluency: does it read naturally in the target language?
- Terminology precision: are domain-specific terms translated correctly?
- Pragmatic equivalence: are speech acts, politeness levels, and register preserved?

For each issue, provide detailed reasoning (rationale) explaining WHY it is a problem.

Return findings with:
- segmentId: exact segment ID from input
- category: accuracy, fluency, terminology, style, locale, semantics
- severity: critical (meaning change), major (noticeable impact), minor (polish)
- confidence: 0-100
- description: clear explanation
- suggestedFix: suggested correction or null
- rationale: detailed reasoning for why this is an issue

Segments:
${segmentText}${priorSection}`
}

// Exported for testing
export { buildL3Prompt as _buildL3Prompt }
