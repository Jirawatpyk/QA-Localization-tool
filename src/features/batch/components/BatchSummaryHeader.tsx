'use client'

type BatchSummaryHeaderProps = {
  totalFiles: number
  passedCount: number
  needsReviewCount: number
  processingTimeMs?: number | null | undefined
}

export function BatchSummaryHeader({
  totalFiles,
  passedCount,
  needsReviewCount,
  processingTimeMs,
}: BatchSummaryHeaderProps) {
  const formattedTime =
    processingTimeMs !== null && processingTimeMs !== undefined
      ? `${Math.round(processingTimeMs / 1000)}s`
      : null

  return (
    <div className="flex flex-wrap gap-4" data-testid="batch-summary-header">
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Total Files</p>
        <p className="text-2xl font-bold" data-testid="total-files">
          {totalFiles}
        </p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Passed</p>
        <p className="text-2xl font-bold text-success" data-testid="passed-count">
          {passedCount}
        </p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">Needs Review</p>
        <p className="text-2xl font-bold text-warning" data-testid="needs-review-count">
          {needsReviewCount}
        </p>
      </div>
      {formattedTime && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Processing Time</p>
          <p className="text-2xl font-bold">{formattedTime}</p>
        </div>
      )}
    </div>
  )
}
