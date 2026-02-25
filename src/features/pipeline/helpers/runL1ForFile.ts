import { and, eq } from 'drizzle-orm'
import { NonRetriableError } from 'inngest'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { findings } from '@/db/schema/findings'
import { segments } from '@/db/schema/segments'
import { suppressionRules } from '@/db/schema/suppressionRules'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { FINDING_BATCH_SIZE } from '@/features/pipeline/engine/constants'
import { processFile } from '@/features/pipeline/engine/ruleEngine'
import type { RuleCheckResult } from '@/features/pipeline/engine/types'
import { getGlossaryTerms } from '@/lib/cache/glossaryCache'
import { logger } from '@/lib/logger'

type RunL1Input = {
  fileId: string
  projectId: string
  tenantId: string
  userId?: string
}

export type L1Result = {
  findingCount: number
  duration: number
}

/**
 * Shared helper: Run L1 rule engine on a parsed file.
 *
 * NO 'use server' / import 'server-only' — importable from Inngest runtime.
 * NO requireRole — auth handled at event trigger boundary (Server Action or Inngest).
 *
 * File status transitions: parsed → l1_processing → l1_completed | failed
 * Throws NonRetriableError on CAS failure (file not in parsed state).
 * Throws on other errors (after best-effort rollback to failed status).
 */
export async function runL1ForFile({
  fileId,
  projectId,
  tenantId,
  userId,
}: RunL1Input): Promise<L1Result> {
  // CAS guard: atomically set status parsed → l1_processing
  const [file] = await db
    .update(files)
    .set({ status: 'l1_processing' })
    .where(
      and(withTenant(files.tenantId, tenantId), eq(files.id, fileId), eq(files.status, 'parsed')),
    )
    .returning()

  if (!file) {
    // NonRetriableError: retrying won't help — file state won't change
    throw new NonRetriableError('File not in parsed state or already being processed')
  }

  try {
    // Load segments
    const segmentRows = await db
      .select()
      .from(segments)
      .where(and(withTenant(segments.tenantId, tenantId), eq(segments.fileId, fileId)))
      .orderBy(segments.segmentNumber)

    // Load glossary terms (non-cached JOIN query — safe for Inngest runtime)
    const glossaryTerms = await getGlossaryTerms(projectId, tenantId)

    // Load suppression rules + custom rules
    const allRules = await db
      .select()
      .from(suppressionRules)
      .where(
        and(
          withTenant(suppressionRules.tenantId, tenantId),
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
      fileId,
      segmentId: r.segmentId,
      projectId: file.projectId,
      tenantId,
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

    // Delete existing L1 findings + batch-insert new findings (idempotent re-run)
    await db.transaction(async (tx) => {
      await tx
        .delete(findings)
        .where(
          and(
            withTenant(findings.tenantId, tenantId),
            eq(findings.fileId, fileId),
            eq(findings.detectedByLayer, 'L1'),
          ),
        )

      for (let i = 0; i < findingInserts.length; i += FINDING_BATCH_SIZE) {
        const batch = findingInserts.slice(i, i + FINDING_BATCH_SIZE)
        await tx.insert(findings).values(batch)
      }
    })

    // Severity counts for audit
    const criticalCount = results.filter((r) => r.severity === 'critical').length
    const majorCount = results.filter((r) => r.severity === 'major').length
    const minorCount = results.filter((r) => r.severity === 'minor').length

    // Update file status to l1_completed (before audit — audit failure must not revert findings)
    await db
      .update(files)
      .set({ status: 'l1_completed' })
      .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))

    // Write audit log (non-fatal — findings + status already committed)
    try {
      await writeAuditLog({
        tenantId,
        ...(userId !== undefined ? { userId } : {}),
        entityType: 'file',
        entityId: fileId,
        action: 'file.l1_completed',
        newValue: {
          findingCount: results.length,
          criticalCount,
          majorCount,
          minorCount,
          duration,
        },
      })
    } catch (auditErr) {
      logger.error({ err: auditErr, fileId }, 'Audit log write failed (non-fatal)')
    }

    return {
      findingCount: results.length,
      duration,
    }
  } catch (err) {
    logger.error({ err, fileId }, 'Rule engine failed')

    // Best-effort rollback to 'failed' status.
    // NOTE: This makes Inngest retries ineffective for post-CAS failures:
    //   after rollback, status='failed'; on retry, CAS guard checks status='parsed' →
    //   NonRetriableError → Inngest stops retrying. The retries:3 config primarily
    //   protects against transient errors before the CAS guard runs (e.g. DB connection).
    //   onFailureFn handles the final failed state after all retries are exhausted.
    try {
      await db
        .update(files)
        .set({ status: 'failed' })
        .where(and(withTenant(files.tenantId, tenantId), eq(files.id, fileId)))
    } catch (rollbackErr) {
      logger.error({ err: rollbackErr, fileId }, 'Failed to roll back file status to failed')
    }

    throw err
  }
}
