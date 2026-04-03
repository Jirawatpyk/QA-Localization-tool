import { notFound } from 'next/navigation'
import { connection } from 'next/server'

import { getBatchSummary } from '@/features/batch/actions/getBatchSummary.action'
import { BatchSummaryView } from '@/features/batch/components/BatchSummaryView'
import { logger } from '@/lib/logger'
import { isUuid } from '@/lib/validation/uuid'

export default async function BatchDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; batchId: string }>
}) {
  await connection()
  const { projectId, batchId } = await params

  if (!isUuid(batchId)) {
    logger.warn({ param: 'batchId', value: batchId }, 'Invalid UUID in route param')
    notFound()
  }

  const result = await getBatchSummary({ projectId, batchId })

  if (!result.success) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Batch Summary</h1>
        <p className="mt-4 text-destructive">{result.error}</p>
      </div>
    )
  }

  const { recommendedPass, needsReview, processingTimeMs, crossFileFindings } = result.data

  return (
    <div className="p-6">
      <BatchSummaryView
        projectId={projectId}
        passedFiles={recommendedPass.map((f) => ({
          fileId: f.fileId,
          fileName: f.fileName,
          status: f.status,
          mqmScore: f.mqmScore,
          criticalCount: f.criticalCount ?? 0,
          majorCount: f.majorCount ?? 0,
          minorCount: f.minorCount ?? 0,
        }))}
        reviewFiles={needsReview.map((f) => ({
          fileId: f.fileId,
          fileName: f.fileName,
          status: f.status,
          mqmScore: f.mqmScore,
          criticalCount: f.criticalCount ?? 0,
          majorCount: f.majorCount ?? 0,
          minorCount: f.minorCount ?? 0,
        }))}
        processingTimeMs={processingTimeMs}
        crossFileFindings={crossFileFindings}
      />
    </div>
  )
}
