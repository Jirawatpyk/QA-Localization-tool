import { notFound } from 'next/navigation'
import { connection } from 'next/server'

import { getFileAssignment } from '@/features/project/actions/getFileAssignment.action'
import { getFileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { EmptyFileContent } from '@/features/review/components/EmptyFileContent'
import { ReviewPageClient } from '@/features/review/components/ReviewPageClient'
import { SoftLockWrapper } from '@/features/review/components/SoftLockWrapper'
import { logger } from '@/lib/logger'
import { isUuid } from '@/lib/validation/uuid'

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ projectId: string; fileId: string }>
}) {
  await connection()
  const { projectId, fileId } = await params

  if (!isUuid(fileId)) {
    logger.warn({ param: 'fileId', value: fileId }, 'Invalid UUID in route param')
    notFound()
  }

  const [result, assignmentResult] = await Promise.all([
    getFileReviewData({ fileId, projectId }),
    getFileAssignment({ fileId, projectId }),
  ])

  if (!result.success) {
    // AC4: Dedicated empty-file UI for 0-segment files
    if (result.code === 'EMPTY_FILE') {
      return <EmptyFileContent projectId={projectId} />
    }

    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Review</h1>
        <p className="mt-4 text-destructive">{result.error}</p>
      </div>
    )
  }

  const assignment = assignmentResult.success ? assignmentResult.data.assignment : null
  const currentUserId = assignmentResult.success ? assignmentResult.data.currentUserId : null

  return (
    <div className="p-6">
      <SoftLockWrapper
        assignment={assignment}
        currentUserId={currentUserId}
        projectId={projectId}
        fileId={fileId}
      >
        <ReviewPageClient
          fileId={fileId}
          projectId={projectId}
          tenantId={result.data.tenantId}
          initialData={result.data}
        />
      </SoftLockWrapper>
    </div>
  )
}
