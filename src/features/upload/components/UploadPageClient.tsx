'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'

import { createBatch } from '../actions/createBatch.action'
import { useFileUpload } from '../hooks/useFileUpload'

import { DuplicateDetectionDialog } from './DuplicateDetectionDialog'
import { FileSizeWarning } from './FileSizeWarning'
import { FileUploadZone } from './FileUploadZone'
import { UploadProgressList } from './UploadProgressList'

type UploadPageClientProps = {
  projectId: string
}

export function UploadPageClient({ projectId }: UploadPageClientProps) {
  const {
    progress,
    largeFileWarnings,
    isUploading,
    pendingDuplicate,
    startUpload,
    confirmRerun,
    cancelDuplicate,
  } = useFileUpload({ projectId })

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (files.length > 1) {
        const batchResult = await createBatch({ projectId, fileCount: files.length })
        if (!batchResult.success) {
          toast.error('Failed to create upload batch.')
          return
        }
        await startUpload(files, batchResult.data.id)
      } else {
        await startUpload(files)
      }
    },
    [projectId, startUpload],
  )

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Upload Files</h2>
        <p className="mt-1 text-sm text-text-muted">
          Upload SDLXLIFF, XLIFF, or Excel files for QA processing.
        </p>
      </div>

      <FileUploadZone
        onFilesSelected={handleFilesSelected}
        isUploading={isUploading}
        data-tour="project-upload"
      />

      <FileSizeWarning fileNames={largeFileWarnings} />

      <UploadProgressList files={progress} batchTotal={progress.length} />

      {pendingDuplicate && (
        <DuplicateDetectionDialog
          open={true}
          fileName={pendingDuplicate.file.name}
          duplicateInfo={pendingDuplicate.duplicateInfo}
          onRerun={confirmRerun}
          onCancel={cancelDuplicate}
        />
      )}
    </div>
  )
}
