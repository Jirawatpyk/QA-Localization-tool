'use client'

import { Progress } from '@/components/ui/progress'
import type { UploadProgress } from '@/features/upload/types'

type UploadProgressListProps = {
  files: UploadProgress[]
  batchTotal?: number
  // Optional parse state props (Story 3.2b5 — AC3)
  parsingFileIds?: ReadonlySet<string>
  parsedFiles?: ReadonlyMap<string, number>
  parseFailedFileIds?: ReadonlySet<string>
}

function formatEta(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return ''
  if (seconds < 60) return `~${Math.ceil(seconds)}s remaining`
  return `~${Math.ceil(seconds / 60)}m remaining`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getParseStatus(
  fileId: string,
  parsingFileIds: ReadonlySet<string> | undefined,
  parsedFiles: ReadonlyMap<string, number> | undefined,
  parseFailedFileIds: ReadonlySet<string> | undefined,
): { label: string; className: string } | null {
  if (parseFailedFileIds?.has(fileId)) {
    return { label: 'Parse failed', className: 'text-xs text-destructive font-medium' }
  }
  if (parsedFiles?.has(fileId)) {
    const count = parsedFiles.get(fileId)!
    return {
      label: `Parsed (${count} segments)`,
      className: 'text-xs text-success font-medium',
    }
  }
  if (parsingFileIds?.has(fileId)) {
    return { label: 'Parsing...', className: 'text-xs text-warning font-medium' }
  }
  return null
}

export function UploadProgressList({
  files,
  batchTotal,
  parsingFileIds,
  parsedFiles,
  parseFailedFileIds,
}: UploadProgressListProps) {
  if (files.length === 0) return null

  const uploadedCount = files.filter((f) => f.status === 'uploaded').length

  return (
    <div className="mt-4 space-y-3" aria-label="Upload progress">
      {batchTotal !== undefined && batchTotal > 1 && (
        <p className="text-sm text-text-muted" aria-live="polite">
          {uploadedCount} of {batchTotal} uploaded…
        </p>
      )}

      {files.map((file) => {
        const parseStatus =
          file.status === 'uploaded'
            ? getParseStatus(file.fileId, parsingFileIds, parsedFiles, parseFailedFileIds)
            : null

        return (
          <div
            key={file.fileId}
            data-testid={`upload-row-${file.fileName}`}
            className="rounded-md border border-border bg-card p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="truncate text-sm font-medium text-text-primary max-w-[60%]"
                title={file.fileName}
              >
                {file.fileName}
              </span>
              <span className="shrink-0 text-xs text-text-muted">
                {formatBytes(file.fileSizeBytes)}
              </span>
            </div>

            {file.status === 'uploading' && (
              <>
                <Progress
                  value={file.percent}
                  aria-label={`Upload progress for ${file.fileName}`}
                />
                <div
                  className="flex items-center justify-between text-xs text-text-muted"
                  aria-live="polite"
                >
                  <span>{file.percent}%</span>
                  <span>{formatEta(file.etaSeconds)}</span>
                </div>
              </>
            )}

            {file.status === 'uploaded' && parseStatus && (
              <p
                className={parseStatus.className}
                aria-live="polite"
                data-testid={parsedFiles?.has(file.fileId) ? 'upload-status-success' : undefined}
              >
                {parseStatus.label}
              </p>
            )}

            {file.status === 'uploaded' && !parseStatus && (
              <p
                className="text-xs text-success font-medium"
                aria-live="polite"
                data-testid="upload-status-success"
              >
                Uploaded
              </p>
            )}

            {file.status === 'error' && (
              <p className="text-xs text-destructive" role="alert">
                {file.error === 'FILE_SIZE_EXCEEDED' && 'File exceeds maximum size of 15MB.'}
                {file.error === 'UNSUPPORTED_FORMAT' && 'Unsupported file format.'}
                {file.error === 'NETWORK_ERROR' && 'Upload failed. Please retry.'}
                {file.error === 'STORAGE_ERROR' && 'Storage error. Please try again.'}
                {file.error === 'BATCH_SIZE_EXCEEDED' && 'Batch limit exceeded.'}
                {file.error === 'DUPLICATE_FILE' && 'Duplicate file detected.'}
                {!file.error && 'Upload failed.'}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
