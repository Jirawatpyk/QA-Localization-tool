'use server'

import 'server-only'

import { and, asc, count, eq, gt, inArray, ne, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { findings } from '@/db/schema/findings'
import { languagePairConfigs } from '@/db/schema/languagePairConfigs'
import { projects } from '@/db/schema/projects'
import { reviewActions } from '@/db/schema/reviewActions'
import { scores } from '@/db/schema/scores'
import { segments } from '@/db/schema/segments'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
import { determineNonNative } from '@/lib/auth/determineNonNative'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import type {
  DetectedByLayer,
  FindingSeverity,
  FindingStatus,
  LayerCompleted,
  ScoreStatus,
} from '@/types/finding'
import type { DbFileStatus, ProcessingMode } from '@/types/pipeline'

export type FileReviewData = {
  tenantId: string
  file: {
    fileId: string
    fileName: string
    status: DbFileStatus
  }
  findings: Array<{
    id: string
    segmentId: string | null
    severity: FindingSeverity
    originalSeverity: FindingSeverity | null
    category: string
    description: string
    status: FindingStatus
    detectedByLayer: DetectedByLayer
    aiConfidence: number | null
    aiModel: string | null
    suggestedFix: string | null
    sourceTextExcerpt: string | null
    targetTextExcerpt: string | null
    segmentCount: number
    scope: 'per-file' | 'cross-file'
  }>
  score: {
    mqmScore: number | null
    status: ScoreStatus
    layerCompleted: LayerCompleted | null
    criticalCount: number
    majorCount: number
    minorCount: number
  }
  processingMode: ProcessingMode
  l2ConfidenceMin: number | null
  l3ConfidenceMin: number | null
  autoPassRationale: string | null
  sourceLang: string
  targetLang: string | null
  /** Story 4.3: Segments for AddFindingDialog segment selector */
  segments: Array<{ id: string; segmentNumber: number; sourceText: string }>
  /** Story 4.3: Active taxonomy categories for AddFindingDialog category selector */
  categories: Array<{ category: string; parentCategory: string | null }>
  /** Story 4.4a: Override counts per finding (findingId → count of re-decisions) */
  overrideCounts: Record<string, number>
  /** Story 4.5: Sibling files in same project for file navigation + command palette */
  siblingFiles: Array<{ fileId: string; fileName: string }>
  /** Story 5.1: Whether the current user is non-native for the file's target language */
  isNonNative: boolean
  /** Story 5.1: Project-level BT confidence threshold for LanguageBridge panel */
  btConfidenceThreshold: number
}

const SEVERITY_PRIORITY: Record<string, number> = {
  critical: 1,
  major: 2,
  minor: 3,
}

function sortFindings(items: FileReviewData['findings']): FileReviewData['findings'] {
  return [...items].sort((a, b) => {
    const severityDiff =
      (SEVERITY_PRIORITY[a.severity] ?? 99) - (SEVERITY_PRIORITY[b.severity] ?? 99)
    if (severityDiff !== 0) return severityDiff

    // aiConfidence DESC NULLS LAST
    if (a.aiConfidence === null && b.aiConfidence === null) return 0
    if (a.aiConfidence === null) return 1
    if (b.aiConfidence === null) return -1
    return b.aiConfidence - a.aiConfidence
  })
}

type GetFileReviewDataInput = {
  fileId: string
  projectId: string
}

export async function getFileReviewData(
  input: GetFileReviewDataInput,
): Promise<ActionResult<FileReviewData>> {
  const { fileId, projectId } = input

  // Guard against invalid UUID params (e.g., URL with "undefined" string)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(fileId) || !UUID_RE.test(projectId)) {
    return { success: false, error: 'Invalid file or project ID', code: 'VALIDATION_ERROR' }
  }

  try {
    const currentUser = await requireRole('qa_reviewer')
    const tenantId = currentUser.tenantId

    // Q1: Get file metadata
    const fileRows = await db
      .select({
        fileId: files.id,
        fileName: files.fileName,
        status: files.status,
      })
      .from(files)
      .where(
        and(
          withTenant(files.tenantId, tenantId),
          eq(files.id, fileId),
          eq(files.projectId, projectId),
        ),
      )

    if (fileRows.length === 0) {
      return { success: false, error: 'File not found', code: 'NOT_FOUND' }
    }

    const file = fileRows[0]!

    // Q2: Get ALL findings for file (all layers)
    const findingRows = await db
      .select({
        id: findings.id,
        segmentId: findings.segmentId,
        severity: findings.severity,
        originalSeverity: findings.originalSeverity,
        category: findings.category,
        description: findings.description,
        status: findings.status,
        detectedByLayer: findings.detectedByLayer,
        aiConfidence: findings.aiConfidence,
        aiModel: findings.aiModel,
        suggestedFix: findings.suggestedFix,
        sourceTextExcerpt: findings.sourceTextExcerpt,
        targetTextExcerpt: findings.targetTextExcerpt,
        segmentCount: findings.segmentCount,
        scope: findings.scope,
      })
      .from(findings)
      .where(
        and(
          withTenant(findings.tenantId, tenantId),
          eq(findings.fileId, fileId),
          eq(findings.projectId, projectId),
        ),
      )

    // Q3: Get score for file
    const scoreRows = await db
      .select({
        mqmScore: scores.mqmScore,
        status: scores.status,
        layerCompleted: scores.layerCompleted,
        criticalCount: scores.criticalCount,
        majorCount: scores.majorCount,
        minorCount: scores.minorCount,
        autoPassRationale: scores.autoPassRationale,
      })
      .from(scores)
      .where(
        and(
          withTenant(scores.tenantId, tenantId),
          eq(scores.fileId, fileId),
          eq(scores.projectId, projectId),
        ),
      )

    const scoreRow = scoreRows[0]
    const score = scoreRow
      ? {
          mqmScore: scoreRow.mqmScore,
          status: scoreRow.status,
          layerCompleted: scoreRow.layerCompleted,
          criticalCount: scoreRow.criticalCount,
          majorCount: scoreRow.majorCount,
          minorCount: scoreRow.minorCount,
        }
      : {
          mqmScore: null,
          status: 'na' as ScoreStatus,
          layerCompleted: null,
          criticalCount: 0,
          majorCount: 0,
          minorCount: 0,
        }
    const autoPassRationale = scoreRow?.autoPassRationale ?? null

    // Q4: Get project processingMode + language pair l2ConfidenceMin
    // TODO(TD-REVIEW-001): JOIN matches sourceLang only — projects.targetLangs is a JSONB array,
    // so a proper match requires file-level target language metadata (not yet available).
    // For single-target-language projects this is correct; multi-target may return wrong config.
    const configRows = await db
      .select({
        processingMode: projects.processingMode,
        sourceLang: projects.sourceLang,
        l2ConfidenceMin: languagePairConfigs.l2ConfidenceMin,
        l3ConfidenceMin: languagePairConfigs.l3ConfidenceMin,
        targetLang: languagePairConfigs.targetLang,
        btConfidenceThreshold: projects.btConfidenceThreshold, // Story 5.1
      })
      .from(projects)
      .leftJoin(
        languagePairConfigs,
        and(
          withTenant(languagePairConfigs.tenantId, tenantId),
          eq(languagePairConfigs.sourceLang, projects.sourceLang),
        ),
      )
      .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))

    const config = configRows[0]
    const processingMode = (config?.processingMode ?? 'economy') as ProcessingMode
    const sourceLang = config?.sourceLang ?? ''
    const targetLang = config?.targetLang ?? null
    const l2ConfidenceMin = config?.l2ConfidenceMin ?? null
    const l3ConfidenceMin = config?.l3ConfidenceMin ?? null
    const btConfidenceThreshold = config?.btConfidenceThreshold ?? 0.6

    // Story 5.1: Compute isNonNative for LanguageBridge panel visibility
    const isNonNative = targetLang
      ? determineNonNative(currentUser.nativeLanguages, targetLang)
      : true // Conservative: show panel when targetLang unknown (no languagePairConfigs).
    // Budget is checked per-call in getBackTranslation action (Guardrail #22).

    // Sort findings: severity priority (critical→major→minor), then aiConfidence DESC NULLS LAST
    const sortedFindings = sortFindings(findingRows as FileReviewData['findings'])

    // Q5: Get segments for AddFindingDialog (Story 4.3 AC4) — non-fatal
    let segmentRows: Array<{ id: string; segmentNumber: number; sourceText: string }> = []
    try {
      segmentRows = await db
        .select({
          id: segments.id,
          segmentNumber: segments.segmentNumber,
          sourceText: segments.sourceText,
        })
        .from(segments)
        .where(and(withTenant(segments.tenantId, tenantId), eq(segments.fileId, fileId)))
        .orderBy(asc(segments.segmentNumber))
    } catch (segErr) {
      logger.error(
        { err: segErr, fileId },
        'Q5 segment query failed — AddFinding dialog will have empty segments',
      )
    }

    // Q6: Get active taxonomy categories for AddFindingDialog (Story 4.3 AC4) — non-fatal
    let categoryRows: Array<{ category: string; parentCategory: string | null }> = []
    try {
      categoryRows = await db
        .select({
          category: taxonomyDefinitions.category,
          parentCategory: taxonomyDefinitions.parentCategory,
        })
        .from(taxonomyDefinitions)
        .where(eq(taxonomyDefinitions.isActive, true))
        .orderBy(asc(taxonomyDefinitions.displayOrder))
    } catch (catErr) {
      logger.error(
        { err: catErr },
        'Q6 taxonomy query failed — AddFinding dialog will have empty categories',
      )
    }

    // Q7: Get override counts per finding (Story 4.4a AC4) — non-fatal
    // Filter by current findingIds to exclude orphaned review_actions from deleted findings
    const currentFindingIds = sortedFindings.map((f) => f.id)
    const overrideCounts: Record<string, number> = {}
    try {
      if (currentFindingIds.length === 0) {
        // Guardrail #5: skip inArray with empty array
      } else {
        const overrideRows = await db
          .select({
            findingId: reviewActions.findingId,
            actionCount: count(reviewActions.id),
          })
          .from(reviewActions)
          .where(
            and(
              eq(reviewActions.fileId, fileId),
              eq(reviewActions.projectId, projectId),
              inArray(reviewActions.findingId, currentFindingIds),
              withTenant(reviewActions.tenantId, tenantId),
            ),
          )
          .groupBy(reviewActions.findingId)
          .having(gt(count(reviewActions.id), sql`1`))

        for (const row of overrideRows) {
          overrideCounts[row.findingId] = Number(row.actionCount) - 1
        }
      }
    } catch (overrideErr) {
      logger.error(
        { err: overrideErr, fileId },
        'Q7 override counts query failed — override badges will not show',
      )
    }

    // Story 4.5: Query sibling files (same project, exclude current file)
    const siblingFileRows = await db
      .select({ fileId: files.id, fileName: files.fileName })
      .from(files)
      .where(
        and(
          eq(files.projectId, projectId),
          ne(files.id, fileId),
          withTenant(files.tenantId, tenantId),
        ),
      )
      .orderBy(asc(files.fileName))

    return {
      success: true,
      data: {
        tenantId,
        file: file as FileReviewData['file'],
        findings: sortedFindings,
        score: score as FileReviewData['score'],
        processingMode,
        l2ConfidenceMin,
        l3ConfidenceMin,
        autoPassRationale,
        sourceLang,
        targetLang,
        segments: segmentRows,
        categories: categoryRows,
        overrideCounts,
        siblingFiles: siblingFileRows,
        isNonNative,
        btConfidenceThreshold,
      },
    }
  } catch (err) {
    logger.error({ err, fileId, projectId }, 'getFileReviewData failed')
    return { success: false, error: 'Failed to fetch file review data', code: 'INTERNAL_ERROR' }
  }
}
