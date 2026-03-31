import { and, eq } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { projects } from '@/db/schema/projects'
import { getFileHistory } from '@/features/batch/actions/getFileHistory.action'
import { FileHistoryPageClient } from '@/features/batch/components/FileHistoryPageClient'
import { requireRole } from '@/lib/auth/requireRole'

export default async function FileHistoryPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  let currentUser
  try {
    currentUser = await requireRole('native_reviewer')
  } catch {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">File History</h1>
        <p className="mt-4 text-destructive">Authentication required</p>
      </div>
    )
  }

  const [result, [project]] = await Promise.all([
    getFileHistory({ projectId, filter: 'all', page: 1 }),
    db
      .select({ targetLangs: projects.targetLangs })
      .from(projects)
      .where(and(eq(projects.id, projectId), withTenant(projects.tenantId, currentUser.tenantId))),
  ])

  const initialFiles = result.success
    ? result.data.files.map((f) => ({
        fileId: f.fileId,
        fileName: f.fileName,
        processedAt: new Date(f.createdAt).toISOString(),
        status: f.status,
        mqmScore: f.mqmScore,
        reviewerName: f.lastReviewerName,
        assigneeName: f.assigneeName,
        assignmentPriority: f.assignmentPriority,
      }))
    : []

  const initialTotalCount = result.success ? result.data.totalCount : 0
  // Use first target language for reviewer filtering (most common single-target-lang case)
  const targetLanguage = project?.targetLangs?.[0] ?? ''

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">File History</h1>
      <FileHistoryPageClient
        projectId={projectId}
        initialFiles={initialFiles}
        initialTotalCount={initialTotalCount}
        targetLanguage={targetLanguage}
      />
    </div>
  )
}
