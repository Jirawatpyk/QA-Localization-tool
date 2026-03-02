'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { parseFile } from '@/features/parser/actions/parseFile.action'
import { ProcessingModeDialog } from '@/features/pipeline/components/ProcessingModeDialog'
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

  // Auto-parse state (Story 3.2b5 — AC1)
  const [parsedFiles, setParsedFiles] = useState<Map<string, number>>(new Map())
  const [parsingFileIds, setParsingFileIds] = useState<Set<string>>(new Set())
  const [parseFailedFileIds, setParseFailedFileIds] = useState<Set<string>>(new Set())
  const [dismissedParseIds, setDismissedParseIds] = useState<Set<string>>(new Set())

  // ProcessingModeDialog state (Story 3.2b5 — AC2)
  const [showProcessingDialog, setShowProcessingDialog] = useState(false)

  // Derive pending excel file during render — recommended React pattern, avoids setState-in-effect
  const pendingExcelFile =
    uploadedFiles.find(
      (f) => !dismissedFileIds.has(f.fileId) && getFileType(f.fileName) === 'xlsx',
    ) ?? null

  // Derive pending SDLXLIFF/XLIFF files for auto-parse (render-time derivation)
  const pendingXmlFiles = uploadedFiles.filter(
    (f) =>
      !dismissedParseIds.has(f.fileId) &&
      !parsingFileIds.has(f.fileId) &&
      !parsedFiles.has(f.fileId) &&
      getFileType(f.fileName) !== 'xlsx',
  )

  // Stable string dependency — NOT derived array (avoids infinite re-trigger)
  const nextPendingFileId = pendingXmlFiles[0]?.fileId ?? null

  // Sequential guard — wait for current parse to finish before starting next
  const isCurrentlyParsing = parsingFileIds.size > 0

  // Ref to prevent double-invocation in strict mode
  const parsingStartedRef = useRef<Set<string>>(new Set())

  // Auto-parse effect: triggers parseFile for first pending non-Excel file (sequential)
  useEffect(() => {
    if (!nextPendingFileId) return
    if (isCurrentlyParsing) return
    if (parsingStartedRef.current.has(nextPendingFileId)) return
    parsingStartedRef.current.add(nextPendingFileId)

    const file = uploadedFiles.find((f) => f.fileId === nextPendingFileId)
    if (!file) return

    // Wrap in microtask to avoid synchronous setState in effect body (react-hooks/set-state-in-effect)
    // parsingStartedRef guard above prevents double-invocation across renders
    const fileId = nextPendingFileId
    void Promise.resolve().then(() => {
      setParsingFileIds((prev) => new Set([...prev, fileId]))

      parseFile(fileId)
        .then((result) => {
          setParsingFileIds((prev) => {
            const next = new Set(prev)
            next.delete(fileId)
            return next
          })

          if (result.success) {
            setParsedFiles((prev) => new Map([...prev, [fileId, result.data.segmentCount]]))
            toast.success(`Parsed ${result.data.segmentCount} segments from ${file.fileName}`)
          } else {
            setDismissedParseIds((prev) => new Set([...prev, fileId]))
            setParseFailedFileIds((prev) => new Set([...prev, fileId]))
            toast.error(`Failed to parse ${file.fileName}: ${result.error}`)
          }
        })
        .catch(() => {
          // Guardrail #13: catch unexpected errors instead of void swallowing
          setParsingFileIds((prev) => {
            const next = new Set(prev)
            next.delete(fileId)
            return next
          })
          setDismissedParseIds((prev) => new Set([...prev, fileId]))
          setParseFailedFileIds((prev) => new Set([...prev, fileId]))
          toast.error(`Failed to parse ${file.fileName}`)
        })
    })
  }, [nextPendingFileId, isCurrentlyParsing, uploadedFiles])

  // Derive parsedFileIds from parsedFiles map keys (memoized — stable reference for ProcessingModeDialog)
  const parsedFileIds = useMemo(() => [...parsedFiles.keys()], [parsedFiles])

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
      // Add to parsedFiles so Excel counts in "Start Processing" button (Task 2.3)
      setParsedFiles((prev) => new Map([...prev, [pendingExcelFile.fileId, segmentCount]]))
    }
    toast.success(`Parsed ${segmentCount} segments successfully.`)
  }

  function handleColumnMappingCancel() {
    // Cancel does NOT delete the uploaded file — it stays in 'uploaded' status for retry
    if (pendingExcelFile) {
      setDismissedFileIds((prev) => new Set([...prev, pendingExcelFile.fileId]))
    }
  }

  function handleStartProcessing() {
    setShowProcessingDialog(false)
    // Reset parse state so "Start Processing" button disappears (prevents double-submit)
    setParsedFiles(new Map())
    setParsingFileIds(new Set())
    setParseFailedFileIds(new Set())
    setDismissedParseIds(new Set())
    parsingStartedRef.current = new Set()
    toast.success('Processing started')
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

      <UploadProgressList
        files={progress}
        batchTotal={progress.length}
        parsingFileIds={parsingFileIds}
        parsedFiles={parsedFiles}
        parseFailedFileIds={parseFailedFileIds}
      />

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

      {/* Start Processing button — visible when files parsed, disabled during upload/parsing */}
      {parsedFileIds.length > 0 && (
        <button
          type="button"
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isUploading || parsingFileIds.size > 0}
          onClick={() => setShowProcessingDialog(true)}
        >
          Start Processing ({parsedFileIds.length} files)
        </button>
      )}

      {/* ProcessingModeDialog — mounted always, controlled by showProcessingDialog */}
      <ProcessingModeDialog
        open={showProcessingDialog}
        onOpenChange={setShowProcessingDialog}
        fileIds={parsedFileIds}
        projectId={projectId}
        onStartProcessing={handleStartProcessing}
      />
    </div>
  )
}
