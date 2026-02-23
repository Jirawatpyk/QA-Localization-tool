'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { createBatch } from '@/features/upload/actions/createBatch.action'
import { useFileUpload } from '@/features/upload/hooks/useFileUpload'
import { getFileType } from '@/features/upload/utils/fileType'

import { ColumnMappingDialog } from './ColumnMappingDialog'
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
    uploadedFiles,
    startUpload,
    confirmRerun,
    cancelDuplicate,
  } = useFileUpload({ projectId })

  // Track fileIds where the column mapping dialog has been dismissed (confirmed or cancelled)
  const [dismissedFileIds, setDismissedFileIds] = useState<Set<string>>(new Set())

  // Derive pending excel file during render — recommended React pattern, avoids setState-in-effect
  const pendingExcelFile =
    uploadedFiles.find(
      (f) => !dismissedFileIds.has(f.fileId) && getFileType(f.fileName) === 'xlsx',
    ) ?? null

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

  function handleColumnMappingSuccess(segmentCount: number) {
    if (pendingExcelFile) {
      setDismissedFileIds((prev) => new Set([...prev, pendingExcelFile.fileId]))
    }
    toast.success(`Parsed ${segmentCount} segments successfully.`)
  }

  function handleColumnMappingCancel() {
    // Cancel does NOT delete the uploaded file — it stays in 'uploaded' status for retry
    if (pendingExcelFile) {
      setDismissedFileIds((prev) => new Set([...prev, pendingExcelFile.fileId]))
    }
  }

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

      {/* Column Mapping Dialog for Excel files (shown after upload completes) */}
      {pendingExcelFile && (
        <ColumnMappingDialog
          open={true}
          fileId={pendingExcelFile.fileId}
          fileName={pendingExcelFile.fileName}
          onSuccess={handleColumnMappingSuccess}
          onCancel={handleColumnMappingCancel}
        />
      )}
    </div>
  )
}
