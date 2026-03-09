'use server'
import 'server-only'

import { desc, eq, and, sql, isNull, gte, inArray } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { findings } from '@/db/schema/findings'
import { projects } from '@/db/schema/projects'
import { reviewActions } from '@/db/schema/reviewActions'
import { scores } from '@/db/schema/scores'
import type { DashboardData, RecentFileRow } from '@/features/dashboard/types'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { logger } from '@/lib/logger'
import type { ActionResult } from '@/types/actionResult'
import type { DbFileStatus } from '@/types/pipeline'

export async function getDashboardData(): Promise<ActionResult<DashboardData>> {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return { success: false, code: 'UNAUTHORIZED', error: 'Not authenticated' }
  }

  try {
    const tenantId = currentUser.tenantId
    // Recent files: LEFT JOIN files → scores → projects, filter by tenantId, ORDER BY created_at DESC, LIMIT 10
    const recentFilesRows = await db
      .select({
        id: files.id,
        fileName: files.fileName,
        projectId: files.projectId,
        projectName: projects.name,
        status: files.status,
        createdAt: files.createdAt,
        mqmScore: scores.mqmScore,
      })
      .from(files)
      .innerJoin(
        projects,
        and(eq(files.projectId, projects.id), withTenant(projects.tenantId, tenantId)),
      )
      .leftJoin(scores, and(eq(scores.fileId, files.id), withTenant(scores.tenantId, tenantId)))
      .where(withTenant(files.tenantId, tenantId))
      .orderBy(desc(files.createdAt))
      .limit(10)

    // Count findings per file for recent files
    const fileIds = recentFilesRows.map((r) => r.id)
    const findingsCountMap = new Map<string, number>()
    if (fileIds.length > 0) {
      const countRows = await db
        .select({
          fileId: findings.fileId,
          count: sql<number>`count(*)::int`,
        })
        .from(findings)
        .where(and(withTenant(findings.tenantId, tenantId), inArray(findings.fileId, fileIds)))
        .groupBy(findings.fileId)

      for (const row of countRows) {
        if (row.fileId) findingsCountMap.set(row.fileId, row.count)
      }
    }

    // SAFETY: Drizzle infers varchar → string; DB CHECK constraint guarantees valid DbFileStatus
    const recentFiles: RecentFileRow[] = recentFilesRows.map((row) => ({
      id: row.id,
      fileName: row.fileName,
      projectId: row.projectId,
      projectName: row.projectName,
      status: row.status as DbFileStatus,
      createdAt: row.createdAt.toISOString(),
      mqmScore: row.mqmScore ?? null,
      findingsCount: findingsCountMap.get(row.id) ?? 0,
    }))

    // Pending reviews: COUNT files WHERE status = 'parsed' AND no score record yet
    const pendingResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(files)
      .leftJoin(scores, and(eq(scores.fileId, files.id), withTenant(scores.tenantId, tenantId)))
      .where(
        and(withTenant(files.tenantId, tenantId), eq(files.status, 'parsed'), isNull(scores.id)),
      )

    const pendingReviewsCount = pendingResult[0]?.count ?? 0

    // Team activity: COUNT review_actions WHERE tenantId AND created_at > 7 days ago
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const activityResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reviewActions)
      .where(
        and(
          withTenant(reviewActions.tenantId, tenantId),
          gte(reviewActions.createdAt, sevenDaysAgo),
        ),
      )

    const teamActivityCount = activityResult[0]?.count ?? 0

    return {
      success: true,
      data: {
        recentFiles,
        pendingReviewsCount,
        teamActivityCount,
      },
    }
  } catch (err) {
    logger.error({ err }, 'getDashboardData failed')
    return { success: false, code: 'INTERNAL_ERROR', error: 'Failed to load dashboard data' }
  }
}
