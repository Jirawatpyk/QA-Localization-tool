'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { scores } from '@/db/schema/scores'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { checkProjectBudget } from '@/lib/ai/budget'
import { requireRole } from '@/lib/auth/requireRole'
import { inngest } from '@/lib/inngest/client'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import type { LayerCompleted } from '@/types/finding'
import type { PipelineLayer, ProcessingMode } from '@/types/pipeline'

// ── Validation ──

const retryAiAnalysisSchema = z.object({
  fileId: z.string().uuid(),
  projectId: z.string().uuid(),
})

type RetryAiAnalysisData = {
  retriedLayers: PipelineLayer[]
}

// ── Helpers ──

/**
 * Derive which AI layers need to be retried based on what has already
 * completed and the project's processing mode.
 */
function deriveLayersToRetry(
  layerCompleted: LayerCompleted,
  mode: ProcessingMode,
): PipelineLayer[] {
  if (layerCompleted === 'L1' && mode === 'economy') return ['L2']
  if (layerCompleted === 'L1' && mode === 'thorough') return ['L2', 'L3']
  if (layerCompleted === 'L1L2' && mode === 'thorough') return ['L3']
  // L1L2 + economy or L1L2L3 = nothing to retry
  return []
}

// ── Action ──

/**
 * Retry AI analysis for a file that is in ai_partial status.
 *
 * Validates ownership, file status, budget, and role before
 * sending a retry event to Inngest. Does NOT reset file status
 * in the server action -- that is deferred to the Inngest step.
 */
export async function retryAiAnalysis(input: unknown): Promise<ActionResult<RetryAiAnalysisData>> {
  // ── Validation ──
  const parsed = retryAiAnalysisSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }
  const { fileId, projectId } = parsed.data

  // ── Auth ──
  let userId: string
  let tenantId: string
  try {
    const auth = await requireRole('qa_reviewer', 'write')
    userId = auth.id
    tenantId = auth.tenantId
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }

  // ── Query file (with tenant guard) ──
  const fileRows = await db
    .select({
      id: files.id,
      status: files.status,
      projectId: files.projectId,
    })
    .from(files)
    .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))

  if (fileRows.length === 0) {
    return { success: false, code: 'NOT_FOUND', error: 'File not found' }
  }

  const file = fileRows[0]!

  // ── Cross-validate projectId (prevent within-tenant cross-project contamination) ──
  if (file.projectId !== projectId) {
    return { success: false, code: 'NOT_FOUND', error: 'File not found' }
  }

  // ── Validate file status ──
  if (file.status === 'l2_processing' || file.status === 'l3_processing') {
    return {
      success: false,
      code: 'INVALID_STATUS',
      error: 'File is currently processing. Please wait for the current analysis to complete.',
    }
  }

  if (file.status !== 'ai_partial') {
    return {
      success: false,
      code: 'INVALID_STATUS',
      error: 'File is not eligible for retry. Only files with ai_partial status can be retried.',
    }
  }

  // ── Query score for layerCompleted ──
  const scoreRows = await db
    .select({
      layerCompleted: scores.layerCompleted,
    })
    .from(scores)
    .where(and(withTenant(scores.tenantId, tenantId), eq(scores.fileId, fileId)))

  if (scoreRows.length === 0) {
    return { success: false, code: 'NOT_FOUND', error: 'Score record not found for file' }
  }

  const score = scoreRows[0]!
  const layerCompleted = score.layerCompleted as LayerCompleted

  // ── Query project for processingMode ──
  const projectRows = await db
    .select({
      processingMode: projects.processingMode,
    })
    .from(projects)
    .where(and(withTenant(projects.tenantId, tenantId), eq(projects.id, projectId)))

  if (projectRows.length === 0) {
    return { success: false, code: 'NOT_FOUND', error: 'Project not found' }
  }

  const project = projectRows[0]!
  const mode = project.processingMode as ProcessingMode

  // ── Budget check (G22: before any state change) ──
  const budget = await checkProjectBudget(projectId, tenantId)
  if (!budget.hasQuota) {
    return {
      success: false,
      code: 'BUDGET_EXHAUSTED',
      error:
        'AI budget quota exhausted. Please increase the budget or wait for the next billing cycle.',
    }
  }

  // ── Derive layers to retry ──
  const layersToRetry = deriveLayersToRetry(layerCompleted, mode)

  // ── Send Inngest event (only if there are layers to retry) ──
  if (layersToRetry.length > 0) {
    await inngest.send({
      name: 'pipeline.retry-failed-layers',
      data: {
        fileId,
        projectId,
        tenantId,
        userId,
        layersToRetry,
        mode,
      },
    })
  }

  // ── Audit log (non-fatal — G2) ──
  const auditEntry = {
    tenantId,
    userId,
    entityType: 'file',
    entityId: fileId,
    action: 'retry_ai_analysis',
    newValue: { layersToRetry, mode, layerCompleted },
  }
  try {
    await writeAuditLog(auditEntry)
  } catch (auditError) {
    logger.error({ err: auditError, fileId, projectId }, 'Failed to write audit log for retry')
  }

  return { success: true, data: { retriedLayers: layersToRetry } }
}
