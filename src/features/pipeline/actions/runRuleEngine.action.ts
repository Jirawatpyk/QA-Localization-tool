'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { findings } from '@/db/schema/findings'
import { segments } from '@/db/schema/segments'
import { suppressionRules } from '@/db/schema/suppressionRules'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { requireRole } from '@/lib/auth/requireRole'
import { getCachedGlossaryTerms } from '@/lib/cache/glossaryCache'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'

import { FINDING_BATCH_SIZE } from '../engine/constants'
import { processFile } from '../engine/ruleEngine'
import type { RuleCheckResult } from '../engine/types'

type RunRuleEngineResult = {
  findingCount: number
  fileId: string
  duration: number
}

/**
 * Server Action: Run L1 rule engine on a parsed file.
 *
 * File status transitions: parsed → l1_processing → l1_completed | failed
 * Uses CAS guard to prevent concurrent re-runs (duplicate findings).
 * Batch-inserts findings in transaction (100 per INSERT).
 */
export async function runRuleEngine(input: {
  fileId: string
}): Promise<ActionResult<RunRuleEngineResult>> {
  // Validate fileId format
  if (!z.string().uuid().safeParse(input.fileId).success) {
    return { success: false, code: 'INVALID_INPUT', error: 'Invalid file ID format' }
  }

  // Auth check (M3 pattern)
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Insufficient permissions' }
  }

  // CAS guard: atomically set status parsed → l1_processing
  const [file] = await db
    .update(files)
    .set({ status: 'l1_processing' })
    .where(
      and(
        withTenant(files.tenantId, currentUser.tenantId),
        eq(files.id, input.fileId),
        eq(files.status, 'parsed'),
      ),
    )
    .returning()

  if (!file) {
    return {
      success: false,
      code: 'CONFLICT',
      error: 'File not found, not in parsed state, or already being processed',
    }
  }

  try {
    // Load segments
    const segmentRows = await db
      .select()
      .from(segments)
      .where(
        and(withTenant(segments.tenantId, currentUser.tenantId), eq(segments.fileId, input.fileId)),
      )
      .orderBy(segments.segmentNumber)

    // Load glossary terms (cached)
    const glossaryTerms = await getCachedGlossaryTerms(file.projectId, currentUser.tenantId)

    // Load suppression rules + custom rules
    const allRules = await db
      .select()
      .from(suppressionRules)
      .where(
        and(
          withTenant(suppressionRules.tenantId, currentUser.tenantId),
          eq(suppressionRules.isActive, true),
          eq(suppressionRules.projectId, file.projectId),
        ),
      )

    const suppressedCategories = new Set(
      allRules.filter((r) => r.category !== 'custom_rule').map((r) => r.category),
    )
    const customRules = allRules.filter((r) => r.category === 'custom_rule')

    // Run rule engine
    const startTime = performance.now()
    const results = await processFile(segmentRows, glossaryTerms, suppressedCategories, customRules)
    const duration = Math.round(performance.now() - startTime)

    // Map results to DB finding inserts
    const findingInserts = results.map((r: RuleCheckResult) => ({
      fileId: input.fileId,
      segmentId: r.segmentId,
      projectId: file.projectId,
      tenantId: currentUser.tenantId,
      category: r.category,
      severity: r.severity,
      description: r.description,
      suggestedFix: r.suggestedFix,
      sourceTextExcerpt: r.sourceExcerpt,
      targetTextExcerpt: r.targetExcerpt,
      detectedByLayer: 'L1' as const,
      aiModel: null,
      aiConfidence: null,
      reviewSessionId: null,
      status: 'pending' as const,
      segmentCount: 1,
    }))

    // Batch-insert findings in transaction
    if (findingInserts.length > 0) {
      await db.transaction(async (tx) => {
        for (let i = 0; i < findingInserts.length; i += FINDING_BATCH_SIZE) {
          const batch = findingInserts.slice(i, i + FINDING_BATCH_SIZE)
          await tx.insert(findings).values(batch)
        }
      })
    }

    // Severity counts for audit
    const criticalCount = results.filter((r) => r.severity === 'critical').length
    const majorCount = results.filter((r) => r.severity === 'major').length
    const minorCount = results.filter((r) => r.severity === 'minor').length

    // Write audit log
    await writeAuditLog({
      tenantId: currentUser.tenantId,
      userId: currentUser.id,
      entityType: 'file',
      entityId: input.fileId,
      action: 'file.l1_completed',
      newValue: {
        findingCount: results.length,
        criticalCount,
        majorCount,
        minorCount,
        duration,
      },
    })

    // Update file status to l1_completed
    await db
      .update(files)
      .set({ status: 'l1_completed' })
      .where(and(withTenant(files.tenantId, currentUser.tenantId), eq(files.id, input.fileId)))

    return {
      success: true,
      data: {
        findingCount: results.length,
        fileId: input.fileId,
        duration,
      },
    }
  } catch (err) {
    logger.error({ err, fileId: input.fileId }, 'Rule engine failed')

    // Roll back to 'failed' status
    await db
      .update(files)
      .set({ status: 'failed' })
      .where(and(withTenant(files.tenantId, currentUser.tenantId), eq(files.id, input.fileId)))

    return {
      success: false,
      code: 'INTERNAL_ERROR',
      error: 'Rule engine processing failed',
    }
  }
}
