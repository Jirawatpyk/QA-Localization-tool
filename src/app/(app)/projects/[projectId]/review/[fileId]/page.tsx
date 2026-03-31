import { connection } from 'next/server'

import { getFileAssignment } from '@/features/project/actions/getFileAssignment.action'
import { getFileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { ReviewPageClient } from '@/features/review/components/ReviewPageClient'
import { SoftLockWrapper } from '@/features/review/components/SoftLockWrapper'

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ projectId: string; fileId: string }>
}) {
  await connection()
  const { projectId, fileId } = await params

  const [result, assignmentResult] = await Promise.all([
    getFileReviewData({ fileId, projectId }),
    getFileAssignment({ fileId, projectId }),
  ])

  if (!result.success) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Review</h1>
        <p className="mt-4 text-destructive">{result.error}</p>
      </div>
    )
  }

  const assignment = assignmentResult.success ? assignmentResult.data.assignment : null
  const currentUserId = assignmentResult.success ? assignmentResult.data.currentUserId : ''

  return (
    <div className="p-6">
      <SoftLockWrapper assignment={assignment} currentUserId={currentUserId} projectId={projectId}>
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
