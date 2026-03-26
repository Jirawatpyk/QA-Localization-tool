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
import { chunkSegments } from '@/features/pipeline/helpers/chunkSegments'
import { deriveLanguagePair } from '@/features/pipeline/helpers/deriveLanguagePair'
import { buildL3Prompt as buildL3PromptShared } from '@/features/pipeline/prompts/build-l3-prompt'
import type { SurroundingSegmentContext } from '@/features/pipeline/prompts/types'
import { l3OutputSchema } from '@/features/pipeline/schemas/l3-output'
import type { L3Finding, L3Output } from '@/features/pipeline/schemas/l3-output'
import { checkProjectBudget } from '@/lib/ai/budget'
import { getModelById } from '@/lib/ai/client'
import { aggregateUsage, estimateCost, logAIUsage } from '@/lib/ai/costs'
import { AIRateLimitExceededError, classifyAIError } from '@/lib/ai/errors'
import { callWithFallback } from '@/lib/ai/fallbackRunner'
import { getModelForLayerWithFallback } from '@/lib/ai/providers'
import type { AIUsageRecord, ChunkResult } from '@/lib/ai/types'
import { getConfigForModel } from '@/lib/ai/types'
import { logger } from '@/lib/logger'
import { aiL3ProjectLimiter } from '@/lib/ratelimit'
import type { DetectedByLayer, FindingSeverity } from '@/types/finding'
import type { TenantId } from '@/types/tenant'

// ── Types ──

type RunL3Input = {
  fileId: string
  projectId: string
  tenantId: TenantId
  userId?: string
  /** TD-AI-006: Segment IDs from failed L2 chunks — included as "unscreened" in L3 scope */
  l2FailedChunkSegmentIds?: string[]
}

export type { L3Finding }

export type L3Result = {
  findingCount: number
  droppedByInvalidSegmentId: number
  droppedByInvalidCategory: number
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
  l2FailedChunkSegmentIds = [],
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
    // Fail-open: if Redis is unreachable, log warning and proceed (infra issue ≠ file failure)
    try {
      const { success: rateLimitAllowed } = await aiL3ProjectLimiter.limit(projectId)
      if (!rateLimitAllowed) {
        throw new AIRateLimitExceededError('L3', projectId)
      }
    } catch (rateLimitErr) {
      if (rateLimitErr instanceof AIRateLimitExceededError) {
        throw rateLimitErr // genuine rate limit → let Inngest retry
      }
      // Redis/infra error → fail-open with warning
      logger.warn(
        { err: rateLimitErr, fileId, projectId },
        'L3 rate limiter unavailable — proceeding (fail-open)',
      )
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
    // SAFETY: WHERE limits by tenant+file+project. Drizzle infers varchar → string for severity/layer.
    // Cast is safe: only valid FindingSeverity and DetectedByLayer values exist in DB (enforced by insert)
    // L3 findings from previous runs are included but harmless — prompt builder filters to L1+L2 only
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
          eq(findings.projectId, projectId),
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

    // TD-AI-006: Include segments from failed L2 chunks as "unscreened".
    // If an L2 chunk failed (partial failure), segments in that chunk have 0 L2 findings —
    // but exclusion is because L2 failed, not because segment is clean.
    // These segments need L3 analysis to avoid silent coverage gaps.
    const l2UnscreenedSegmentIds = new Set(l2FailedChunkSegmentIds)
    if (l2UnscreenedSegmentIds.size > 0) {
      logger.info(
        { fileId, unscreenedCount: l2UnscreenedSegmentIds.size },
        'TD-AI-006: Including unscreened segments from failed L2 chunks in L3 scope',
      )
    }

    const filteredSegments = segmentRows.filter(
      (s) => l2FlaggedSegmentIds.has(s.id) || l2UnscreenedSegmentIds.has(s.id),
    )

    // Step 3e: Early return if zero segments flagged (Guardrail #5: no inArray([]))
    // CR-P1 fix: DELETE old L3 findings before early-return (idempotent re-run safety — Guardrail #6)
    // CR-M1 fix: add audit log for state change (architectural rule: every state change → audit)
    if (filteredSegments.length === 0) {
      logger.info({ fileId }, 'Zero segments flagged by L2 — skipping L3 AI processing')

      await db.transaction(async (tx) => {
        // Clear any stale L3 findings from prior runs (retry path safety)
        await tx
          .delete(findings)
          .where(
            and(
              withTenant(findings.tenantId, tenantId),
              eq(findings.fileId, fileId),
              eq(findings.detectedByLayer, 'L3'),
            ),
          )

        await tx
          .update(files)
          .set({ status: 'l3_completed', updatedAt: new Date() })
          .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))
      })

      // Audit log (non-fatal — state change already committed)
      try {
        await writeAuditLog({
          tenantId,
          ...(userId !== undefined ? { userId } : {}),
          entityType: 'file',
          entityId: fileId,
          action: 'file.l3_completed',
          newValue: {
            findingCount: 0,
            reason: 'no_segments_flagged_by_l2',
            duration: Math.round(performance.now() - startTime),
          },
        })
      } catch (auditErr) {
        logger.error({ err: auditErr, fileId }, 'L3 early-exit audit log failed (non-fatal)')
      }

      return {
        findingCount: 0,
        droppedByInvalidSegmentId: 0,
        droppedByInvalidCategory: 0,
        duration: Math.round(performance.now() - startTime),
        aiModel: modelId,
        chunksTotal: 0,
        chunksSucceeded: 0,
        chunksFailed: 0,
        partialFailure: false,
        fallbackUsed: false,
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

    // CR-M3: Guard projectRow — parity with L2 (Guardrail #4)
    if (!projectRow) {
      throw new NonRetriableError('Project not found')
    }

    // Step 5: Chunk FILTERED segments (Guardrail #21)
    const chunks = chunkSegments(filteredSegments)

    // Step 6: Process each chunk with AI (fallback chain support)
    const chunkResults: ChunkResult<L3ChunkResponse>[] = []
    const usageRecords: AIUsageRecord[] = []
    const config = getConfigForModel(modelId, 'L3')
    const chunkActualModel = new Map<number, string>()
    let anyFallbackUsed = false

    for (const chunk of chunks) {
      const chunkStart = performance.now()
      try {
        // Build prompt using shared builder
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
          project: {
            ...projectRow,
            processingMode: projectRow.processingMode as 'economy' | 'thorough',
          },
          surroundingContext: chunkSurroundingContext,
        })

        const fbResult = await callWithFallback({ primary: modelId, fallbacks }, async (mid) =>
          generateText({
            model: getModelById(mid),
            output: Output.object({ schema: l3OutputSchema }),
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
        const cost = estimateCost(actualModel, 'L3', result.usage)
        const record: AIUsageRecord = {
          tenantId,
          projectId,
          fileId,
          model: actualModel,
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
        if (error instanceof NonRetriableError) {
          throw error
        }

        // Use classifyAIError for consistent retriability detection
        const kind = classifyAIError(error)
        if (kind === 'rate_limit' || kind === 'timeout') {
          throw error
        }

        logger.error(
          { err: error, fileId, chunkIndex: chunk.chunkIndex },
          'L3 chunk failed (non-retriable — continuing with remaining chunks)',
        )

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
    const allFindings: (L3Finding & { actualModel: string })[] = []
    let droppedByInvalidSegmentId = 0
    let droppedByInvalidCategory = 0

    // Build valid category set from taxonomy (parity with L2 — TD-PIPE-005 fix)
    const validCategories =
      taxonomyRows.length > 0 ? new Set(taxonomyRows.map((t) => t.category.toLowerCase())) : null // null = no taxonomy → accept any category

    for (const cr of chunkResults) {
      if (!cr.success || !cr.data) continue
      const chunkModel = chunkActualModel.get(cr.chunkIndex) ?? modelId

      for (const f of cr.data.findings) {
        // Defensive strip: AI may return "[uuid]" (with brackets) instead of "uuid".
        // Prompt instructs UUID-only but strip defensively in case of AI non-compliance.
        const segmentId = f.segmentId.replace(/^\[|\]$/g, '')

        if (!segmentIdSet.has(segmentId)) {
          droppedByInvalidSegmentId++
          logger.warn(
            {
              fileId,
              segmentId: f.segmentId,
              normalizedSegmentId: segmentId,
              chunkIndex: cr.chunkIndex,
            },
            'Dropped L3 finding with invalid segmentId',
          )
          continue
        }

        // Validate category against taxonomy (parity with L2 — TD-PIPE-005 fix)
        if (validCategories && !validCategories.has(f.category.toLowerCase())) {
          droppedByInvalidCategory++
          logger.warn(
            {
              fileId,
              segmentId,
              category: f.category,
              chunkIndex: cr.chunkIndex,
            },
            'Dropped L3 finding with invalid category (not in taxonomy)',
          )
          continue
        }

        allFindings.push({
          segmentId,
          category: f.category,
          severity: f.severity,
          confidence: Math.min(100, Math.max(0, f.confidence)),
          description: f.description,
          suggestedFix: f.suggestedFix,
          rationale: f.rationale,
          actualModel: chunkModel,
        })
      }
    }

    // Guardrail #47: Fail loud if excessive findings dropped (> 30% = likely AI hallucination)
    const totalRawFindings =
      allFindings.length + droppedByInvalidSegmentId + droppedByInvalidCategory
    if (totalRawFindings > 0) {
      const dropRate = (droppedByInvalidSegmentId + droppedByInvalidCategory) / totalRawFindings
      if (dropRate > 0.3) {
        logger.error(
          {
            fileId,
            dropRate,
            droppedByInvalidSegmentId,
            droppedByInvalidCategory,
            totalRawFindings,
          },
          'L3 findings drop rate exceeds 30% — possible AI hallucination or prompt issue',
        )
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
        aiModel: f.actualModel,
        aiConfidence: f.confidence,
        reviewSessionId: null,
        status: 'pending' as const,
        segmentCount: 1,
      }
    })

    // Step 9+10+9b: Atomic DELETE + INSERT + status UPDATE + confirm/contradict in SINGLE transaction
    // TD-AI-005: findings INSERT and status UPDATE must be atomic (Guardrail #6)
    // TD-PIPE-002 fix: confirm/contradict L2 was previously a SEPARATE transaction — if crash
    // between the two, file is l3_completed but L2 findings never updated. CAS guard blocks retry
    // → permanent data inconsistency. Now everything is in one transaction.
    const l2Findings = priorFindings.filter((f) => f.detectedByLayer === 'L2')

    // Pre-compute contradict set outside transaction (pure logic, no DB)
    const contradictedSegmentIds = new Set(
      allFindings.filter((f) => f.category === 'false_positive_review').map((f) => f.segmentId),
    )

    await db.transaction(async (tx) => {
      // 1. DELETE old L3 findings
      await tx
        .delete(findings)
        .where(
          and(
            withTenant(findings.tenantId, tenantId),
            eq(findings.fileId, fileId),
            eq(findings.detectedByLayer, 'L3'),
          ),
        )

      // 2. INSERT new L3 findings with .returning() to get DB IDs (no separate query needed)
      const insertedL3Rows: { id: string; segmentId: string | null; category: string }[] = []
      for (let i = 0; i < findingInserts.length; i += FINDING_BATCH_SIZE) {
        const batch = findingInserts.slice(i, i + FINDING_BATCH_SIZE)
        const rows = await tx.insert(findings).values(batch).returning({
          id: findings.id,
          segmentId: findings.segmentId,
          category: findings.category,
        })
        insertedL3Rows.push(...rows)
      }

      // 3. Status update — atomic with findings
      await tx
        .update(files)
        .set({ status: 'l3_completed', updatedAt: new Date() })
        .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))

      // 4. L3 confirm/contradict L2 post-processing (AC4)
      // Contradict takes priority: if L3 issues both a regular finding AND false_positive_review
      // for the same segment, skip confirm to prevent inconsistent state.
      // CR-C1 fix: confirmedL2Ids prevents double-boost when allFindings has duplicate (segmentId, category)
      // CR-M4 fix: l3DuplicateIds declared inside transaction to prevent stale data on retry
      if (l2Findings.length > 0 && allFindings.length > 0) {
        const l3BySegCat = new Map(
          insertedL3Rows.map((f) => [`${f.segmentId}:${f.category.toLowerCase()}`, f.id]),
        )
        const confirmedL2Ids = new Set<string>()
        const txL3DuplicateIds: string[] = []

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
            // Skip if this segment also has a false_positive_review (contradict takes priority)
            if (contradictedSegmentIds.has(l3Finding.segmentId)) continue

            // Case-insensitive category match (L2 may use "Accuracy", L3 "accuracy")
            const matchedL2 = l2Findings.find(
              (l2) =>
                l2.segmentId === l3Finding.segmentId &&
                l2.category.toLowerCase() === l3Finding.category.toLowerCase(),
            )
            if (!matchedL2) continue

            // Idempotent: skip both confidence boost and marker append on re-run
            if (matchedL2.description.includes('[L3 Confirmed]')) continue
            // CR-C1: prevent double-boost when multiple L3 findings match same L2 finding
            if (confirmedL2Ids.has(matchedL2.id)) continue
            confirmedL2Ids.add(matchedL2.id)

            const currentConfidence = matchedL2.aiConfidence ?? 0
            const newConfidence = Math.min(100, Math.round(currentConfidence * 1.1))

            await tx
              .update(findings)
              .set({
                aiConfidence: newConfidence,
                description: `${matchedL2.description}\n\n[L3 Confirmed]`,
              })
              .where(and(withTenant(findings.tenantId, tenantId), eq(findings.id, matchedL2.id)))

            // Mark the duplicate L3 finding for deletion
            const l3Key = `${l3Finding.segmentId}:${l3Finding.category.toLowerCase()}`
            const l3DbId = l3BySegCat.get(l3Key)
            if (l3DbId) txL3DuplicateIds.push(l3DbId)
          }
        }

        // Delete L3 findings that confirmed L2 (dedup — AC6)
        if (txL3DuplicateIds.length > 0) {
          for (const dupId of txL3DuplicateIds) {
            await tx
              .delete(findings)
              .where(and(withTenant(findings.tenantId, tenantId), eq(findings.id, dupId)))
          }
          logger.info(
            { fileId, count: txL3DuplicateIds.length },
            'L3 dedup: removed confirmed-duplicate findings',
          )
        }
      }
    })

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
            layer: 'L3',
          },
        })
      } catch (auditErr) {
        logger.error({ err: auditErr, fileId }, 'L3 fallback audit log failed (non-fatal)')
      }
    }

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
          fallbackUsed: anyFallbackUsed,
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
      droppedByInvalidSegmentId,
      droppedByInvalidCategory,
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
