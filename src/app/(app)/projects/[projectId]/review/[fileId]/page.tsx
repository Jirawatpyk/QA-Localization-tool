import { FileQuestion } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'

import { AutoFocusHeading } from '@/components/ui/auto-focus-heading'
import { getFileAssignment } from '@/features/project/actions/getFileAssignment.action'
import { getFileReviewData } from '@/features/review/actions/getFileReviewData.action'
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
      return (
        <div className="flex flex-1 items-center justify-center p-8" role="alert">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <FileQuestion size={48} className="text-text-muted" />
            <AutoFocusHeading className="text-lg font-semibold text-text-primary outline-none">
              No translatable content
            </AutoFocusHeading>
            <p className="text-sm text-text-secondary">This file has no segments to review.</p>
            <div className="flex flex-col items-center gap-2">
              <Link
                href={`/projects/${projectId}/files`}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                Back to files
              </Link>
              <Link
                href={`/projects/${projectId}/upload`}
                className="text-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                Upload a different file
              </Link>
            </div>
          </div>
        </div>
      )
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
