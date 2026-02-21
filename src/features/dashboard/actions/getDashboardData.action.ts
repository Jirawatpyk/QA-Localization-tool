'use server'
import 'server-only'

import { desc, eq, and, sql, isNull, gte } from 'drizzle-orm'

import { db } from '@/db/client'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { reviewActions } from '@/db/schema/reviewActions'
import { scores } from '@/db/schema/scores'
import type { DashboardData, RecentFileRow } from '@/features/dashboard/types'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import type { ActionResult } from '@/types/actionResult'

export async function getDashboardData(): Promise<ActionResult<DashboardData>> {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    return { success: false, code: 'UNAUTHORIZED', error: 'Not authenticated' }
  }

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
    .innerJoin(projects, eq(files.projectId, projects.id))
    .leftJoin(scores, and(eq(scores.fileId, files.id), eq(scores.tenantId, tenantId)))
    .where(eq(files.tenantId, tenantId))
    .orderBy(desc(files.createdAt))
    .limit(10)

  const recentFiles: RecentFileRow[] = recentFilesRows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    projectId: row.projectId,
    projectName: row.projectName,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    mqmScore: row.mqmScore ?? null,
    findingsCount: 0, // populated in future stories when findings are queryable
  }))

  // Pending reviews: COUNT files WHERE status = 'parsed' AND no score record yet
  const pendingResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(files)
    .leftJoin(scores, eq(scores.fileId, files.id))
    .where(and(eq(files.tenantId, tenantId), eq(files.status, 'parsed'), isNull(scores.id)))

  const pendingReviewsCount = pendingResult[0]?.count ?? 0

  // Team activity: COUNT review_actions WHERE tenantId AND created_at > 7 days ago
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const activityResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reviewActions)
    .where(and(eq(reviewActions.tenantId, tenantId), gte(reviewActions.createdAt, sevenDaysAgo)))

  const teamActivityCount = activityResult[0]?.count ?? 0

  return {
    success: true,
    data: {
      recentFiles,
      pendingReviewsCount,
      teamActivityCount,
    },
  }
}
