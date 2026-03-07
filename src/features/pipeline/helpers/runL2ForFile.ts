import { Output, generateText } from 'ai'
import { and, eq } from 'drizzle-orm'
import { NonRetriableError } from 'inngest'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { findings } from '@/db/schema/findings'
import { glossaries } from '@/db/schema/glossaries'
import { glossaryTerms } from '@/db/schema/glossaryTerms'
import { projects } from '@/db/schema/projects'
import { segments } from '@/db/schema/segments'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { FINDING_BATCH_SIZE, MAX_EXCERPT_LENGTH } from '@/features/pipeline/engine/constants'
import { chunkSegments } from '@/features/pipeline/helpers/chunkSegments'
import { deriveLanguagePair } from '@/features/pipeline/helpers/deriveLanguagePair'
import { buildL2Prompt } from '@/features/pipeline/prompts/build-l2-prompt'
import type { L2Output } from '@/features/pipeline/schemas/l2-output'
import { l2OutputSchema } from '@/features/pipeline/schemas/l2-output'
import { checkProjectBudget } from '@/lib/ai/budget'
import { getModelById } from '@/lib/ai/client'
import { aggregateUsage, estimateCost, logAIUsage } from '@/lib/ai/costs'
import { classifyAIError } from '@/lib/ai/errors'
import { callWithFallback } from '@/lib/ai/fallbackRunner'
import { getModelForLayerWithFallback } from '@/lib/ai/providers'
import type { AIUsageRecord, ChunkResult } from '@/lib/ai/types'
import { getConfigForModel } from '@/lib/ai/types'
import { logger } from '@/lib/logger'
import { aiL2ProjectLimiter } from '@/lib/ratelimit'
import type { DetectedByLayer, FindingSeverity } from '@/types/finding'

// ── Types ──

type RunL2Input = {
  fileId: string
  projectId: string
  tenantId: string
  userId?: string
}

export type L2MappedFinding = {
  segmentId: string
  category: string
  severity: FindingSeverity
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
  fallbackUsed: boolean
  totalUsage: {
    inputTokens: number
    outputTokens: number
    estimatedCostUsd: number
  }
}

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
  severity: FindingSeverity
  description: string
  detectedByLayer: DetectedByLayer
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
    // SAFETY: WHERE detectedByLayer='L1' guarantees valid FindingSeverity ('critical'|'major'|'minor')
    // and DetectedByLayer ('L1') — Drizzle infers varchar → string, cast is safe within this domain
    const l1FindingRows = (await db
      .select({
        id: findings.id,
        segmentId: findings.segmentId,
        category: findings.category,
        severity: findings.severity,
        description: findings.description,
        detectedByLayer: findings.detectedByLayer,
      })
      .from(findings)
      .where(
        and(
          withTenant(findings.tenantId, tenantId),
          eq(findings.fileId, fileId),
          eq(findings.detectedByLayer, 'L1'),
        ),
      )) as L1FindingContext[]

    // Step 4b: Load glossary terms via JOIN through glossaries table
    // glossary_terms has NO projectId/tenantId — must JOIN via glossaries
    const glossaryRows = await db
      .select({
        sourceTerm: glossaryTerms.sourceTerm,
        targetTerm: glossaryTerms.targetTerm,
        caseSensitive: glossaryTerms.caseSensitive,
      })
      .from(glossaryTerms)
      .innerJoin(glossaries, eq(glossaryTerms.glossaryId, glossaries.id))
      .where(and(withTenant(glossaries.tenantId, tenantId), eq(glossaries.projectId, projectId)))

    // Step 4c: Load taxonomy categories (shared global — NO withTenant)
    const taxonomyRows = await db
      .select({
        category: taxonomyDefinitions.category,
        parentCategory: taxonomyDefinitions.parentCategory,
        severity: taxonomyDefinitions.severity,
        description: taxonomyDefinitions.description,
      })
      .from(taxonomyDefinitions)
      .where(eq(taxonomyDefinitions.isActive, true))

    // Step 4d: Load project details for prompt context
    const [projectRow] = await db
      .select({
        name: projects.name,
        description: projects.description,
        sourceLang: projects.sourceLang,
        targetLangs: projects.targetLangs,
        processingMode: projects.processingMode,
      })
      .from(projects)
      .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))

    if (!projectRow) {
      throw new NonRetriableError('Project not found')
    }

    // Step 5: Chunk segments (Guardrail #21)
    const chunks = chunkSegments(segmentRows)

    // Step 6: Process each chunk with AI (partial failure tolerance + fallback chain)
    const startTime = performance.now()
    const chunkResults: ChunkResult<L2Output>[] = []
    const usageRecords: AIUsageRecord[] = []
    const config = getConfigForModel(modelId, 'L2')
    // M3 fix: cache outside loop — deriveLanguagePair is pure (same result every call)
    const languagePair = deriveLanguagePair(segmentRows)
    const chunkActualModel = new Map<number, string>()
    let anyFallbackUsed = false

    for (const chunk of chunks) {
      const chunkStart = performance.now()
      try {
        const prompt = buildL2Prompt({
          segments: chunk.segments,
          l1Findings: l1FindingRows,
          glossaryTerms: glossaryRows,
          taxonomyCategories: taxonomyRows.map((t) => ({
            ...t,
            severity: t.severity as FindingSeverity | null,
          })),
          project: {
            ...projectRow,
            processingMode: projectRow.processingMode as 'economy' | 'thorough',
          },
        })

        const fbResult = await callWithFallback({ primary: modelId, fallbacks }, async (mid) =>
          generateText({
            model: getModelById(mid),
            output: Output.object({ schema: l2OutputSchema }),
            temperature: config.temperature,
            maxOutputTokens: config.maxOutputTokens,
            prompt,
          }),
        )

        const result = fbResult.data
        const actualModel = fbResult.modelUsed
        chunkActualModel.set(chunk.chunkIndex, actualModel)
        if (fbResult.fallbackUsed) anyFallbackUsed = true

        // Cost tracking (Guardrail #19) — use actual model, not primary
        const cost = estimateCost(actualModel, 'L2', result.usage)
        const record: AIUsageRecord = {
          tenantId,
          projectId,
          fileId,
          model: actualModel,
          layer: 'L2',
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
          estimatedCostUsd: cost,
          chunkIndex: chunk.chunkIndex,
          durationMs: Math.round(performance.now() - chunkStart),
          languagePair,
          status: 'success',
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
        // After callWithFallback, errors here mean:
        // - rate_limit/timeout: all models exhausted → re-throw for Inngest retry
        // - NonRetriableError: all models failed with auth/schema → propagate
        // - unknown: re-thrown by callWithFallback → non-retriable per chunk
        if (error instanceof NonRetriableError) {
          throw error
        }

        // Use classifyAIError for consistent retriability detection
        const kind = classifyAIError(error)
        if (kind === 'rate_limit' || kind === 'timeout') {
          throw error
        }

        // Non-retriable for this chunk → log and continue with remaining chunks
        logger.error(
          { err: error, fileId, chunkIndex: chunk.chunkIndex },
          'L2 chunk failed (non-retriable — continuing with remaining chunks)',
        )

        // AC4: Log failed chunk with status 'error' for cost tracking completeness
        const errorRecord: AIUsageRecord = {
          tenantId,
          projectId,
          fileId,
          model: modelId,
          layer: 'L2',
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
          chunkIndex: chunk.chunkIndex,
          durationMs: Math.round(performance.now() - chunkStart),
          languagePair,
          status: 'error',
        }
        logAIUsage(errorRecord).catch(() => {
          /* non-critical — DB failure already logged inside logAIUsage */
        })

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
    const allFindings: (L2MappedFinding & { actualModel: string })[] = []

    for (const cr of chunkResults) {
      if (!cr.success || !cr.data) continue
      const chunkModel = chunkActualModel.get(cr.chunkIndex) ?? modelId

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
          suggestedFix: f.suggestion,
          actualModel: chunkModel,
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
        aiModel: f.actualModel,
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

    // Step 11a: Fallback audit log (AC10)
    if (anyFallbackUsed) {
      try {
        await writeAuditLog({
          tenantId,
          ...(userId !== undefined ? { userId } : {}),
          entityType: 'file',
          entityId: fileId,
          action: 'ai_fallback_activated',
          newValue: {
            originalModel: modelId,
            fallbackModels: [...new Set(chunkActualModel.values())].filter((m) => m !== modelId),
            layer: 'L2',
          },
        })
      } catch (auditErr) {
        logger.error({ err: auditErr, fileId }, 'L2 fallback audit log failed (non-fatal)')
      }
    }

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
          fallbackUsed: anyFallbackUsed,
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
      fallbackUsed: anyFallbackUsed,
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
