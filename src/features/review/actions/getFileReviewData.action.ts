'use server'

import 'server-only'

import { and, asc, count, eq, gt, inArray, ne, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { findingAssignments } from '@/db/schema/findingAssignments'
import { findings } from '@/db/schema/findings'
import { languagePairConfigs } from '@/db/schema/languagePairConfigs'
import { projects } from '@/db/schema/projects'
import { reviewActions } from '@/db/schema/reviewActions'
import { scores } from '@/db/schema/scores'
import { segments } from '@/db/schema/segments'
import { taxonomyDefinitions } from '@/db/schema/taxonomyDefinitions'
import { users } from '@/db/schema/users'
import { determineNonNative } from '@/lib/auth/determineNonNative'
import { requireRole } from '@/lib/auth/requireRole'
import { logger } from '@/lib/logger'
import { isUuid } from '@/lib/validation/uuid'
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
    updatedAt: string
    /** Story 5.2a: Whether this finding has any review_action with non_native=true */
    hasNonNativeAction: boolean
    /** Story 5.2c: Assignment fields (populated for flagged findings with assignments) */
    assignmentId?: string | undefined
    assignmentStatus?: 'pending' | 'in_review' | 'confirmed' | 'overridden' | undefined
    assignedToName?: string | undefined
    assignedByName?: string | undefined
    flaggerComment?: string | null | undefined
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
  /** Story 5.2c: Current user's role for role-based UI rendering */
  userRole: string
  /** Story 5.2c: Count of findings assigned to current native reviewer */
  assignedFindingCount: number
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
  if (!isUuid(fileId) || !isUuid(projectId)) {
    return { success: false, error: 'Invalid file or project ID', code: 'VALIDATION_ERROR' }
  }

  try {
    // Story 5.2c: native_reviewer needs access to review page (scoped view)
    const currentUser = await requireRole('native_reviewer')
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

    // Story 5.2c AC2: native_reviewer sees only assigned findings (scoped view)
    // Pre-query assigned finding IDs before Q2 so the main query returns scoped results.
    let assignedFindingIds: string[] | null = null
    let assignedFindingCount = 0
    if (currentUser.role === 'native_reviewer') {
      const myAssignments = await db
        .select({ findingId: findingAssignments.findingId })
        .from(findingAssignments)
        .where(
          and(
            eq(findingAssignments.fileId, fileId),
            eq(findingAssignments.assignedTo, currentUser.id),
            withTenant(findingAssignments.tenantId, tenantId),
          ),
        )
      assignedFindingIds = myAssignments.map((a) => a.findingId)
      // CF-2 fix: set count here (outside Q9 try-block) so Q9 failure doesn't zero it
      assignedFindingCount = assignedFindingIds.length
    }

    // Q2: Get findings for file — scoped for native_reviewer (Guardrail #5: empty array guard)
    const q2Where = and(
      withTenant(findings.tenantId, tenantId),
      eq(findings.fileId, fileId),
      eq(findings.projectId, projectId),
      ...(assignedFindingIds !== null && assignedFindingIds.length > 0
        ? [inArray(findings.id, assignedFindingIds)]
        : []),
    )
    // Native reviewer with 0 assignments → empty scoped view (Guardrail #5: inArray([]) guard)
    if (assignedFindingIds !== null && assignedFindingIds.length === 0) {
      // CR fix P6: conservative default — show LanguageBridge panel when targetLang unknown.
      // Matches line 330-332 pattern: `true` when targetLang unavailable at early-return.
      // Native reviewers may still be non-native for the file's target language.
      return {
        success: true,
        data: {
          tenantId,
          file: { fileId, fileName: file.fileName, status: file.status as DbFileStatus },
          findings: [],
          score: {
            mqmScore: null,
            status: 'pending' as ScoreStatus,
            layerCompleted: null,
            criticalCount: 0,
            majorCount: 0,
            minorCount: 0,
          },
          processingMode: 'economy' as ProcessingMode,
          l2ConfidenceMin: null,
          l3ConfidenceMin: null,
          autoPassRationale: null,
          sourceLang: '',
          targetLang: null,
          segments: [],
          categories: [],
          overrideCounts: {},
          siblingFiles: [],
          isNonNative: true,
          btConfidenceThreshold: 0.6,
          userRole: currentUser.role,
          assignedFindingCount: 0,
        },
      }
    }

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
        updatedAt: findings.updatedAt,
      })
      .from(findings)
      .where(q2Where)

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

    // Q4a: Get file's targetLang from its first segment (all segments in a file share the same targetLang)
    const targetLangRows = await db
      .select({ targetLang: segments.targetLang })
      .from(segments)
      .where(and(withTenant(segments.tenantId, tenantId), eq(segments.fileId, fileId)))
      .limit(1)

    // S-FIX-1 AC4: Early exit for 0-segment files — show dedicated empty-file UI
    if (targetLangRows.length === 0) {
      return {
        success: false,
        error: 'This file has no translatable content',
        code: 'EMPTY_FILE' as const,
      }
    }

    const fileTargetLang = targetLangRows[0]?.targetLang ?? null

    // Q4b: Get project processingMode + language pair confidence thresholds
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
          // D5 fix: when fileTargetLang is null (0 segments), prevent matching any
          // config row — LEFT JOIN returns NULLs → defaults used. Without this,
          // multi-target projects could match an arbitrary language pair config.
          ...(fileTargetLang ? [eq(languagePairConfigs.targetLang, fileTargetLang)] : [sql`false`]),
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
    const sortedFindings = sortFindings(findingRows as unknown as FileReviewData['findings'])

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

    // Q8: Story 5.2a — Get finding IDs that have non-native review actions (non-fatal)
    const nonNativeSet = new Set<string>()
    try {
      if (currentFindingIds.length > 0) {
        const nonNativeRows = await db
          .selectDistinct({ findingId: reviewActions.findingId })
          .from(reviewActions)
          .where(
            and(
              eq(reviewActions.fileId, fileId),
              eq(reviewActions.projectId, projectId),
              inArray(reviewActions.findingId, currentFindingIds),
              withTenant(reviewActions.tenantId, tenantId),
              sql`${reviewActions.metadata}->>'non_native' = 'true'`,
            ),
          )
        for (const row of nonNativeRows) {
          nonNativeSet.add(row.findingId)
        }
      }
    } catch (nonNativeErr) {
      logger.error(
        { err: nonNativeErr, fileId },
        'Q8 non-native query failed — non-native badges will not show',
      )
    }

    // Q9: Story 5.2c — Get assignments for current user's findings (non-fatal)
    // Maps findingId → assignment data for native reviewer scoped view
    const assignmentMap = new Map<
      string,
      {
        assignmentId: string
        assignmentStatus: 'pending' | 'in_review' | 'confirmed' | 'overridden'
        assignedToName: string
        assignedByName: string
        flaggerComment: string | null
      }
    >()
    try {
      if (currentFindingIds.length > 0) {
        // CF-3 fix: for native_reviewer, filter by their own userId to avoid multi-assignment overwrite
        const assignmentFilter =
          currentUser.role === 'native_reviewer'
            ? and(
                inArray(findingAssignments.findingId, currentFindingIds),
                eq(findingAssignments.assignedTo, currentUser.id),
                withTenant(findingAssignments.tenantId, tenantId),
              )
            : and(
                inArray(findingAssignments.findingId, currentFindingIds),
                withTenant(findingAssignments.tenantId, tenantId),
              )

        const assignmentRows = await db
          .select({
            findingId: findingAssignments.findingId,
            assignmentId: findingAssignments.id,
            assignmentStatus: findingAssignments.status,
            assignedToName: users.displayName,
            // CR-M2 fix: resolve assignedByName via subquery (avoid alias complexity)
            assignedByName:
              sql<string>`(SELECT u2.display_name FROM users u2 WHERE u2.id = ${findingAssignments.assignedBy} AND u2.tenant_id = ${findingAssignments.tenantId} LIMIT 1)`.as(
                'assigned_by_name',
              ),
            flaggerComment: findingAssignments.flaggerComment,
          })
          .from(findingAssignments)
          .innerJoin(
            users,
            and(eq(users.id, findingAssignments.assignedTo), withTenant(users.tenantId, tenantId)),
          )
          .where(assignmentFilter)

        for (const row of assignmentRows) {
          // For non-native roles with multiple assignments, last write wins (latest assignment)
          assignmentMap.set(row.findingId, {
            assignmentId: row.assignmentId,
            assignmentStatus: row.assignmentStatus as
              | 'pending'
              | 'in_review'
              | 'confirmed'
              | 'overridden',
            assignedToName: row.assignedToName,
            assignedByName: (row.assignedByName ?? '') as string,
            flaggerComment: row.flaggerComment,
          })
        }

        // assignedFindingCount already set at line ~176 (before Q9) — CF-2 fix
      }
    } catch (assignErr) {
      logger.error(
        { err: assignErr, fileId },
        'Q9 assignment query failed — assignment badges will not show',
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
        findings: sortedFindings.map((f) => {
          const assignment = assignmentMap.get(f.id)
          return {
            ...f,
            // CF-P0-1: Expose real updatedAt for Realtime merge guard (was missing → fallback to new Date())
            updatedAt:
              (f as unknown as { updatedAt: Date }).updatedAt instanceof Date
                ? (f as unknown as { updatedAt: Date }).updatedAt.toISOString()
                : String(f.updatedAt),
            hasNonNativeAction: nonNativeSet.has(f.id),
            // Story 5.2c: assignment fields for flagged findings
            ...(assignment
              ? {
                  assignmentId: assignment.assignmentId,
                  assignmentStatus: assignment.assignmentStatus,
                  assignedToName: assignment.assignedToName,
                  assignedByName: assignment.assignedByName,
                  flaggerComment: assignment.flaggerComment,
                }
              : {}),
          }
        }),
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
        userRole: currentUser.role,
        assignedFindingCount,
      },
    }
  } catch (err) {
    logger.error({ err, fileId, projectId }, 'getFileReviewData failed')
    return { success: false, error: 'Failed to fetch file review data', code: 'INTERNAL_ERROR' }
  }
}
