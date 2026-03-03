import { connection } from 'next/server'

import { getFileReviewData } from '@/features/review/actions/getFileReviewData.action'
import { ReviewPageClient } from '@/features/review/components/ReviewPageClient'

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ projectId: string; fileId: string }>
}) {
  await connection()
  const { projectId, fileId } = await params

  const result = await getFileReviewData({ fileId, projectId })

  if (!result.success) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Review</h1>
        <p className="mt-4 text-destructive">{result.error}</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <ReviewPageClient fileId={fileId} projectId={projectId} initialData={result.data} />
    </div>
  )
}
