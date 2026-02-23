'use client'

import { useCallback, useState } from 'react'

import { MAX_FILE_SIZE_BYTES, DEFAULT_BATCH_SIZE } from '@/lib/constants'

import { checkDuplicate } from '../actions/checkDuplicate.action'
import { LARGE_FILE_WARNING_BYTES, UPLOAD_RETRY_COUNT, UPLOAD_RETRY_BACKOFF_MS } from '../constants'
import type { DuplicateInfo, UploadErrorCode, UploadFileResult, UploadProgress } from '../types'
import { getFileType } from '../utils/fileType'

type PendingDuplicate = {
  file: File
  fileId: string
  duplicateInfo: DuplicateInfo
}

type UseFileUploadOptions = {
  projectId: string
}

type UseFileUploadReturn = {
  progress: UploadProgress[]
  largeFileWarnings: string[]
  isUploading: boolean
  pendingDuplicate: PendingDuplicate | null
  uploadedFiles: UploadFileResult[]
  startUpload: (files: File[], batchId?: string) => Promise<void>
  confirmRerun: () => void
  cancelDuplicate: () => void
  reset: () => void
}

async function computeHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function uploadWithProgress(
  file: File,
  projectId: string,
  batchId: string | undefined,
  onProgress: (bytesUploaded: number) => void,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  return new Promise((resolve) => {
    const formData = new FormData()
    formData.append('projectId', projectId)
    if (batchId) formData.append('batchId', batchId)
    formData.append('files', file)

    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded)
    })

    xhr.addEventListener('load', () => {
      let data: unknown
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        data = null
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data })
    })

    xhr.addEventListener('error', () => {
      resolve({ ok: false, status: 0, data: null })
    })

    // L2: treat abort as a network error so retry logic applies
    xhr.addEventListener('abort', () => {
      resolve({ ok: false, status: 0, data: null })
    })

    xhr.open('POST', '/api/upload')
    xhr.send(formData)
  })
}

export function useFileUpload({ projectId }: UseFileUploadOptions): UseFileUploadReturn {
  const [progress, setProgress] = useState<UploadProgress[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [largeFileWarnings, setLargeFileWarnings] = useState<string[]>([])
  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicate | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadFileResult[]>([])
  const [pendingQueue, setPendingQueue] = useState<File[]>([])
  const [currentBatchId, setCurrentBatchId] = useState<string | undefined>(undefined)

  function updateFileProgress(fileId: string, patch: Partial<UploadProgress>) {
    setProgress((prev) => prev.map((f) => (f.fileId === fileId ? { ...f, ...patch } : f)))
  }

  async function uploadSingleFile(
    file: File,
    fileId: string,
    batchId: string | undefined,
    retryCount = 0,
  ): Promise<UploadFileResult | null> {
    const startTime = Date.now()

    const result = await uploadWithProgress(file, projectId, batchId, (bytesUploaded) => {
      const elapsed = (Date.now() - startTime) / 1000
      const speed = elapsed > 0 ? bytesUploaded / elapsed : 0
      const remaining = file.size - bytesUploaded
      const etaSeconds = speed > 0 ? remaining / speed : null
      const percent = Math.round((bytesUploaded / file.size) * 100)

      updateFileProgress(fileId, {
        bytesUploaded,
        percent,
        etaSeconds,
        status: 'uploading',
      })
    })

    if (result.ok) {
      const body = result.data as { success: boolean; data?: { files?: UploadFileResult[] } }
      const fileResult = body?.data?.files?.[0] ?? null
      updateFileProgress(fileId, { percent: 100, status: 'uploaded', etaSeconds: null })
      return fileResult
    }

    // network error — retry with exponential backoff
    if (result.status === 0 && retryCount < UPLOAD_RETRY_COUNT) {
      const delay = UPLOAD_RETRY_BACKOFF_MS[retryCount] ?? 4000
      await sleep(delay)
      return uploadSingleFile(file, fileId, batchId, retryCount + 1)
    }

    const errorCode: UploadErrorCode = result.status === 0 ? 'NETWORK_ERROR' : 'STORAGE_ERROR'
    updateFileProgress(fileId, { status: 'error', error: errorCode })
    return null
  }

  async function processFiles(files: File[], batchId?: string, append = false) {
    setIsUploading(true)

    // client-side validation
    const warnings: string[] = []
    const validFiles: Array<{ file: File; fileId: string }> = []

    const initialProgress: UploadProgress[] = []

    for (const file of files) {
      const fileId = crypto.randomUUID()
      const fileType = getFileType(file.name)

      // extension check
      if (!fileType) {
        initialProgress.push({
          fileId,
          fileName: file.name,
          fileSizeBytes: file.size,
          bytesUploaded: 0,
          percent: 0,
          etaSeconds: null,
          status: 'error',
          error: 'UNSUPPORTED_FORMAT',
        })
        continue
      }

      // size check
      if (file.size > MAX_FILE_SIZE_BYTES) {
        initialProgress.push({
          fileId,
          fileName: file.name,
          fileSizeBytes: file.size,
          bytesUploaded: 0,
          percent: 0,
          etaSeconds: null,
          status: 'error',
          error: 'FILE_SIZE_EXCEEDED',
        })
        continue
      }

      // large file warning (10-15MB)
      if (file.size > LARGE_FILE_WARNING_BYTES) {
        warnings.push(file.name)
      }

      initialProgress.push({
        fileId,
        fileName: file.name,
        fileSizeBytes: file.size,
        bytesUploaded: 0,
        percent: 0,
        etaSeconds: null,
        status: 'pending',
        error: null,
      })
      validFiles.push({ file, fileId })
    }

    // M3: append mode for confirmRerun continuation — preserve prior progress entries
    if (append) {
      setProgress((prev) => [...prev, ...initialProgress])
      setLargeFileWarnings((prev) => [...prev, ...warnings])
    } else {
      setProgress(initialProgress)
      setLargeFileWarnings(warnings)
    }

    if (validFiles.length === 0) {
      setIsUploading(false)
      return
    }

    // upload files sequentially — check duplicate before each file
    const results: UploadFileResult[] = []
    for (let i = 0; i < validFiles.length; i++) {
      const { file, fileId } = validFiles[i]!

      const hash = await computeHash(file)
      const dupResult = await checkDuplicate({ fileHash: hash, projectId })

      if (dupResult.success && dupResult.data.isDuplicate) {
        // pause queue — user must decide; remaining files go to queue
        setPendingDuplicate({ file, fileId, duplicateInfo: dupResult.data })
        setPendingQueue(validFiles.slice(i + 1).map((v) => v.file))
        updateFileProgress(fileId, { status: 'error', error: 'DUPLICATE_FILE' })
        setIsUploading(false)
        return
      }

      updateFileProgress(fileId, { status: 'uploading' })
      const result = await uploadSingleFile(file, fileId, batchId)
      if (result) results.push(result)
    }

    setUploadedFiles((prev) => [...prev, ...results])
    setIsUploading(false)
  }

  const startUpload = useCallback(
    async (files: File[], batchId?: string) => {
      if (files.length > DEFAULT_BATCH_SIZE) {
        // set error state for all files — do not silently ignore
        setProgress(
          files.map((file) => ({
            fileId: crypto.randomUUID(),
            fileName: file.name,
            fileSizeBytes: file.size,
            bytesUploaded: 0,
            percent: 0,
            etaSeconds: null,
            status: 'error' as const,
            error: 'BATCH_SIZE_EXCEEDED' as const,
          })),
        )
        return
      }
      setCurrentBatchId(batchId)
      await processFiles(files, batchId)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId],
  )

  function confirmRerun() {
    if (!pendingDuplicate) return
    const { file, fileId } = pendingDuplicate
    // capture queue snapshot before clearing state (stale closure guard)
    const queue = pendingQueue
    const batchId = currentBatchId

    setPendingDuplicate(null)
    setPendingQueue([])
    setIsUploading(true)
    updateFileProgress(fileId, { status: 'uploading', error: null })

    void uploadSingleFile(file, fileId, batchId)
      .then((result) => {
        if (result) setUploadedFiles((prev) => [...prev, result])
        // continue with remaining queued files
        if (queue.length > 0) {
          void processFiles(queue, batchId, true)
        } else {
          setIsUploading(false)
        }
      })
      .catch(() => {
        // H2: prevent isUploading stuck at true on unexpected rejection
        setIsUploading(false)
      })
  }

  function cancelDuplicate() {
    if (!pendingDuplicate) return
    // H3: remove queued 'pending' files from progress so UI is not misleading
    setProgress((prev) => prev.filter((f) => f.status !== 'pending'))
    setPendingDuplicate(null)
    setPendingQueue([])
    setIsUploading(false)
  }

  function reset() {
    setProgress([])
    setIsUploading(false)
    setLargeFileWarnings([])
    setPendingDuplicate(null)
    setPendingQueue([])
    setUploadedFiles([])
    setCurrentBatchId(undefined)
  }

  return {
    progress,
    largeFileWarnings,
    isUploading,
    pendingDuplicate,
    uploadedFiles,
    startUpload,
    confirmRerun,
    cancelDuplicate,
    reset,
  }
}
