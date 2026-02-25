import { getFileHistory } from '@/features/batch/actions/getFileHistory.action'
import { FileHistoryPageClient } from '@/features/batch/components/FileHistoryPageClient'

export default async function FileHistoryPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  const result = await getFileHistory({ projectId, filter: 'all' })

  const initialFiles = result.success
    ? result.data.files.map((f) => ({
        fileId: f.fileId,
        fileName: f.fileName,
        processedAt: new Date(f.createdAt).toISOString(),
        status: f.status,
        mqmScore: f.mqmScore,
        reviewerName: f.lastReviewerName,
      }))
    : []

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">File History</h1>
      <FileHistoryPageClient projectId={projectId} initialFiles={initialFiles} />
    </div>
  )
}
