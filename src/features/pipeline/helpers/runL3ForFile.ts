import { generateText, Output } from 'ai'
import { and, count, eq, max } from 'drizzle-orm'
import { NonRetriableError } from 'inngest'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { findings } from '@/db/schema/findings'
import { glossaries } from '@/db/schema/glossaries'
import { glossaryTerms } from '@/db/schema/glossaryTerms'
import { languagePairConfigs } from '@/db/schema/languagePairConfigs'
import { projects } from '@/db/schema/projects'
import { segments } from '@/db/schema/segments'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { FINDING_BATCH_SIZE, MAX_EXCERPT_LENGTH } from '@/features/pipeline/engine/constants'
import { buildL3Prompt as buildL3PromptShared } from '@/features/pipeline/prompts/build-l3-prompt'
import type { SurroundingSegmentContext } from '@/features/pipeline/prompts/types'
import { l3OutputSchema } from '@/features/pipeline/schemas/l3-output'
import type { L3Finding, L3Output } from '@/features/pipeline/schemas/l3-output'
import { checkProjectBudget } from '@/lib/ai/budget'
import { getModelById } from '@/lib/ai/client'
import { aggregateUsage, estimateCost, logAIUsage } from '@/lib/ai/costs'
import { classifyAIError } from '@/lib/ai/errors'
import { getModelForLayerWithFallback } from '@/lib/ai/providers'
import type { AIUsageRecord, ChunkResult } from '@/lib/ai/types'
import { getConfigForModel } from '@/lib/ai/types'
import { logger } from '@/lib/logger'
import { aiL3ProjectLimiter } from '@/lib/ratelimit'
import type { DetectedByLayer, FindingSeverity } from '@/types/finding'

import { chunkSegments } from './chunkSegments'

// ── Types ──

type RunL3Input = {
  fileId: string
  projectId: string
  tenantId: string
  userId?: string
}

export type { L3Finding }

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

// Re-export schema for backward compatibility
export { l3OutputSchema as l3ChunkResponseSchema }
export type L3ChunkResponse = L3Output

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
  severity: FindingSeverity
  description: string
  detectedByLayer: DetectedByLayer
  aiConfidence: number | null
}

// ── Helpers ──

/**
 * Derive language pair string from segment rows.
 * Returns "sourceLang→targetLang" (e.g. "en→th") or null if unavailable.
 */
function deriveLanguagePair(segmentRows: SegmentRow[]): string | null {
  if (segmentRows.length === 0) return null
  const first = segmentRows[0]!
  if (!first.sourceLang || !first.targetLang) return null
  return `${first.sourceLang}→${first.targetLang}`
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
  const startTime = performance.now()

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
    // SAFETY: WHERE limits to L1/L2 findings which have valid FindingSeverity and DetectedByLayer values
    // Drizzle infers varchar → string, cast is safe within this domain
    const priorFindings = (await db
      .select({
        id: findings.id,
        segmentId: findings.segmentId,
        category: findings.category,
        severity: findings.severity,
        description: findings.description,
        detectedByLayer: findings.detectedByLayer,
        aiConfidence: findings.aiConfidence,
      })
      .from(findings)
      .where(
        and(
          withTenant(findings.tenantId, tenantId),
          eq(findings.fileId, fileId),
          eq(findings.projectId, projectId),
        ),
      )) as PriorFindingContext[]

    // Step 3b: Query L2 findings grouped by segment to determine which segments need L3
    const l2SegmentStats = await db
      .select({
        segmentId: findings.segmentId,
        maxConfidence: max(findings.aiConfidence),
        findingCount: count(),
      })
      .from(findings)
      .where(
        and(
          withTenant(findings.tenantId, tenantId),
          eq(findings.fileId, fileId),
          eq(findings.detectedByLayer, 'L2'),
        ),
      )
      .groupBy(findings.segmentId)

    // Step 3c: Query l3ConfidenceMin threshold from language pair config
    const languagePair = deriveLanguagePair(segmentRows)
    let l3ConfidenceMin = 50 // sensible default
    if (languagePair) {
      const [sourceLang, targetLang] = languagePair.split('→')
      if (sourceLang && targetLang) {
        const [langConfig] = await db
          .select({ l3ConfidenceMin: languagePairConfigs.l3ConfidenceMin })
          .from(languagePairConfigs)
          .where(
            and(
              withTenant(languagePairConfigs.tenantId, tenantId),
              eq(languagePairConfigs.sourceLang, sourceLang),
              eq(languagePairConfigs.targetLang, targetLang),
            ),
          )
        if (langConfig) {
          l3ConfidenceMin = langConfig.l3ConfidenceMin
        }
      }
    }

    // Step 3d: Filter segments — only those with L2 findings go to L3
    // AC1: include if finding_count > 0 OR max_ai_confidence < l3ConfidenceMin
    // (first condition captures all; second is redundant safety net)
    const l2FlaggedSegmentIds = new Set(
      l2SegmentStats
        .filter(
          (stat) =>
            stat.segmentId !== null &&
            (stat.findingCount > 0 || (stat.maxConfidence ?? 0) < l3ConfidenceMin),
        )
        .map((stat) => stat.segmentId as string),
    )
    const filteredSegments = segmentRows.filter((s) => l2FlaggedSegmentIds.has(s.id))

    // Step 3e: Early return if zero segments flagged (Guardrail #5: no inArray([]))
    if (filteredSegments.length === 0) {
      logger.info({ fileId }, 'Zero segments flagged by L2 — skipping L3 AI processing')

      await db
        .update(files)
        .set({ status: 'l3_completed', updatedAt: new Date() })
        .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))

      return {
        findingCount: 0,
        duration: Math.round(performance.now() - startTime),
        aiModel: modelId,
        chunksTotal: 0,
        chunksSucceeded: 0,
        chunksFailed: 0,
        partialFailure: false,
        totalUsage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
      }
    }

    // Step 4b: Build surrounding context (±2 segments) for each filtered segment
    const surroundingContext: SurroundingSegmentContext[] = filteredSegments.map((seg) => {
      const idx = segmentRows.findIndex((s) => s.id === seg.id)
      const previous = segmentRows.slice(Math.max(0, idx - 2), idx)
      const next = segmentRows.slice(idx + 1, idx + 3)
      return { previous, current: seg, next }
    })

    // Step 4c: Load glossary terms for prompt context
    // glossaryTerms has no tenantId — JOIN through glossaries (established pattern from glossaryCache.ts)
    const glossaryRows = await db
      .select({
        sourceTerm: glossaryTerms.sourceTerm,
        targetTerm: glossaryTerms.targetTerm,
        caseSensitive: glossaryTerms.caseSensitive,
      })
      .from(glossaryTerms)
      .innerJoin(glossaries, eq(glossaryTerms.glossaryId, glossaries.id))
      .where(and(withTenant(glossaries.tenantId, tenantId), eq(glossaries.projectId, projectId)))

    // Step 4d: Load taxonomy categories
    // No withTenant() — taxonomyDefinitions is a global table with no tenant_id column (ERD 1.9)
    const taxonomyRows = await db
      .select({
        category: taxonomyDefinitions.category,
        parentCategory: taxonomyDefinitions.parentCategory,
        severity: taxonomyDefinitions.severity,
        description: taxonomyDefinitions.description,
      })
      .from(taxonomyDefinitions)
      .where(eq(taxonomyDefinitions.isActive, true))

    // Step 4e: Load project context (withTenant)
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

    // Step 5: Chunk FILTERED segments (Guardrail #21)
    const chunks = chunkSegments(filteredSegments)

    // Step 6: Process each chunk with AI
    const chunkResults: ChunkResult<L3ChunkResponse>[] = []
    const usageRecords: AIUsageRecord[] = []
    const config = getConfigForModel(modelId, 'L3')

    for (const chunk of chunks) {
      const chunkStart = performance.now()
      try {
        // Build prompt using shared builder (Task 5 — TD-PIPE-003)
        // Filter surrounding context to only segments in this chunk (H3: reduce token cost)
        const chunkSegmentIds = new Set(chunk.segments.map((s) => s.id))
        const chunkSurroundingContext = surroundingContext.filter((ctx) =>
          chunkSegmentIds.has(ctx.current.id),
        )

        const prompt = buildL3PromptShared({
          segments: chunk.segments,
          priorFindings: priorFindings.map((f) => ({
            ...f,
            severity: f.severity as FindingSeverity,
            detectedByLayer: f.detectedByLayer as DetectedByLayer,
          })),
          glossaryTerms: glossaryRows,
          taxonomyCategories: taxonomyRows.map((t) => ({
            ...t,
            severity: t.severity as FindingSeverity | null,
          })),
          project: projectRow
            ? {
                ...projectRow,
                processingMode: projectRow.processingMode as 'economy' | 'thorough',
              }
            : {
                name: 'Unknown',
                description: null,
                sourceLang: segmentRows[0]?.sourceLang ?? 'en',
                targetLangs: segmentRows[0]?.targetLang ? [segmentRows[0].targetLang] : [],
                processingMode: 'thorough',
              },
          surroundingContext: chunkSurroundingContext,
        })

        const result = await generateText({
          model: getModelById(modelId),
          output: Output.object({ schema: l3OutputSchema }),
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          prompt,
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
        const kind = classifyAIError(error)

        if (kind === 'rate_limit' || kind === 'timeout') {
          throw error
        }

        logger.error(
          { err: error, fileId, chunkIndex: chunk.chunkIndex, aiErrorKind: kind },
          'L3 chunk failed (non-retriable — continuing with remaining chunks)',
        )

        // H3 fix: Log failed chunk usage for cost tracking completeness (parity with runL2ForFile)
        const errorRecord: AIUsageRecord = {
          tenantId,
          projectId,
          fileId,
          model: modelId,
          layer: 'L3',
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

    // Step 9b: L3 confirm/contradict L2 post-processing (AC4)
    const l2Findings = priorFindings.filter((f) => f.detectedByLayer === 'L2')
    if (l2Findings.length > 0 && allFindings.length > 0) {
      await db.transaction(async (tx) => {
        for (const l3Finding of allFindings) {
          if (l3Finding.category === 'false_positive_review') {
            // Contradict: L3's false_positive_review targets L2 findings on same segment
            const matchedL2s = l2Findings.filter((l2) => l2.segmentId === l3Finding.segmentId)
            for (const matchedL2 of matchedL2s) {
              if (!matchedL2.description.includes('[L3 Disagrees]')) {
                await tx
                  .update(findings)
                  .set({
                    description: `${matchedL2.description}\n\n[L3 Disagrees]`,
                  })
                  .where(
                    and(withTenant(findings.tenantId, tenantId), eq(findings.id, matchedL2.id)),
                  )
              }
            }
          } else {
            // Confirm: L3 finds issue on same segment + same category as L2
            const matchedL2 = l2Findings.find(
              (l2) => l2.segmentId === l3Finding.segmentId && l2.category === l3Finding.category,
            )
            if (!matchedL2) continue

            const currentConfidence = matchedL2.aiConfidence ?? 0
            const newConfidence = Math.min(100, Math.round(currentConfidence * 1.1))
            const descriptionUpdate = matchedL2.description.includes('[L3 Confirmed]')
              ? matchedL2.description
              : `${matchedL2.description}\n\n[L3 Confirmed]`

            await tx
              .update(findings)
              .set({
                aiConfidence: newConfidence,
                description: descriptionUpdate,
              })
              .where(and(withTenant(findings.tenantId, tenantId), eq(findings.id, matchedL2.id)))
          }
        }
      })
    }

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
