'use client'

import type { CrossFileFindingSummary } from '@/features/batch/types'

import { BatchSummaryHeader } from './BatchSummaryHeader'
import { FileStatusCard } from './FileStatusCard'

type BatchFileItem = {
  fileId: string
  fileName: string
  status: string
  mqmScore: number | null
  criticalCount: number
  majorCount: number
  minorCount: number
}

type BatchSummaryViewProps = {
  projectId: string
  passedFiles: BatchFileItem[]
  reviewFiles: BatchFileItem[]
  processingTimeMs?: number | null
  crossFileFindings?: CrossFileFindingSummary[]
  compact?: boolean
}

export function BatchSummaryView({
  projectId,
  passedFiles,
  reviewFiles,
  processingTimeMs,
  crossFileFindings = [],
  compact = false,
}: BatchSummaryViewProps) {
  const totalFiles = passedFiles.length + reviewFiles.length

  if (compact) {
    return (
      <div className="space-y-4">
        <BatchSummaryHeader
          totalFiles={totalFiles}
          passedCount={passedFiles.length}
          needsReviewCount={reviewFiles.length}
          processingTimeMs={processingTimeMs}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <BatchSummaryHeader
        totalFiles={totalFiles}
        passedCount={passedFiles.length}
        needsReviewCount={reviewFiles.length}
        processingTimeMs={processingTimeMs}
      />

      <div className="hidden md:grid md:grid-cols-2 gap-6" data-testid="batch-summary-grid">
        <section>
          <h3 className="mb-3 text-lg font-semibold">Recommended Pass</h3>
          <p className="mb-2 text-sm text-muted-foreground">
            {passedFiles.length} {passedFiles.length === 1 ? 'file' : 'files'}
          </p>
          <div className="space-y-3">
            {passedFiles.map((file) => (
              <FileStatusCard key={file.fileId} file={file} projectId={projectId} />
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-lg font-semibold">Need Review</h3>
          <p className="mb-2 text-sm text-muted-foreground">
            {reviewFiles.length} {reviewFiles.length === 1 ? 'file' : 'files'}
          </p>
          <div className="space-y-3">
            {reviewFiles.map((file) => (
              <FileStatusCard key={file.fileId} file={file} projectId={projectId} />
            ))}
          </div>
        </section>
      </div>

      {/* AC#7: Cross-file Issues section */}
      {crossFileFindings.length > 0 && (
        <section data-testid="cross-file-issues">
          <h3 className="mb-3 text-lg font-semibold">Cross-file Issues</h3>
          <p className="mb-2 text-sm text-muted-foreground">
            {crossFileFindings.length}{' '}
            {crossFileFindings.length === 1 ? 'inconsistency' : 'inconsistencies'} found
          </p>
          <div className="space-y-2">
            {crossFileFindings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-lg border border-warning/20 bg-warning/5 p-3"
              >
                <p className="text-sm">{finding.description}</p>
                {finding.sourceTextExcerpt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Source: &ldquo;{finding.sourceTextExcerpt}&rdquo;
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  Affects {finding.relatedFileIds.length} files
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="md:hidden">
        <p className="text-sm text-muted-foreground">
          {passedFiles.length} passed, {reviewFiles.length} need review
          {crossFileFindings.length > 0 && `, ${crossFileFindings.length} cross-file issues`}
        </p>
      </div>
    </div>
  )
}
