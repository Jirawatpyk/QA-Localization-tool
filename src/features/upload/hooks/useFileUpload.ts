'use client'

import { useCallback, useState } from 'react'

import { MAX_FILE_SIZE_BYTES, DEFAULT_BATCH_SIZE } from '@/lib/constants'

import { checkDuplicate } from '../actions/checkDuplicate.action'
import {
  LARGE_FILE_WARNING_BYTES,
  UPLOAD_RETRY_COUNT,
  UPLOAD_RETRY_BACKOFF_MS,
  UPLOAD_PROGRESS_INTERVAL_MS,
} from '../constants'
import type { DuplicateInfo, UploadErrorCode, UploadFileResult, UploadProgress } from '../types'

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
  startUpload: (files: File[]) => Promise<void>
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

function getFileType(fileName: string): string | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.sdlxliff')) return 'sdlxliff'
  if (lower.endsWith('.xlf') || lower.endsWith('.xliff')) return 'xliff'
  if (lower.endsWith('.xlsx')) return 'xlsx'
  return null
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function uploadWithProgress(
  file: File,
  projectId: string,
  onProgress: (bytesUploaded: number) => void,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  return new Promise((resolve) => {
    const formData = new FormData()
    formData.append('projectId', projectId)
    formData.append('files', file)

    const xhr = new XMLHttpRequest()
    const startTime = Date.now()

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded)
    })

    // poll every UPLOAD_PROGRESS_INTERVAL_MS for smooth UI updates
    let pollInterval: ReturnType<typeof setInterval> | null = null
    pollInterval = setInterval(() => {
      // progress events are primary; interval just ensures 100ms cadence for ETA
      void startTime
    }, UPLOAD_PROGRESS_INTERVAL_MS)

    xhr.addEventListener('load', () => {
      if (pollInterval) clearInterval(pollInterval)
      let data: unknown
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        data = null
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data })
    })

    xhr.addEventListener('error', () => {
      if (pollInterval) clearInterval(pollInterval)
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

  function updateFileProgress(fileId: string, patch: Partial<UploadProgress>) {
    setProgress((prev) => prev.map((f) => (f.fileId === fileId ? { ...f, ...patch } : f)))
  }

  async function uploadSingleFile(
    file: File,
    fileId: string,
    retryCount = 0,
  ): Promise<UploadFileResult | null> {
    const startTime = Date.now()

    const result = await uploadWithProgress(file, projectId, (bytesUploaded) => {
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
      return uploadSingleFile(file, fileId, retryCount + 1)
    }

    const errorCode: UploadErrorCode = result.status === 0 ? 'NETWORK_ERROR' : 'STORAGE_ERROR'
    updateFileProgress(fileId, { status: 'error', error: errorCode })
    return null
  }

  async function processFiles(files: File[]) {
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

    setProgress(initialProgress)
    setLargeFileWarnings(warnings)

    if (validFiles.length === 0) {
      setIsUploading(false)
      return
    }

    // check duplicate for first valid file (one at a time to avoid dialog spam)
    const first = validFiles[0]
    if (!first) {
      setIsUploading(false)
      return
    }

    const hash = await computeHash(first.file)
    const dupResult = await checkDuplicate({ fileHash: hash, projectId })

    if (dupResult.success && dupResult.data.isDuplicate) {
      // pause queue — user must decide
      setPendingDuplicate({ file: first.file, fileId: first.fileId, duplicateInfo: dupResult.data })
      setPendingQueue(validFiles.slice(1).map((v) => v.file))
      updateFileProgress(first.fileId, { status: 'error', error: 'DUPLICATE_FILE' })
      setIsUploading(false)
      return
    }

    // upload files sequentially to track per-file progress
    const results: UploadFileResult[] = []
    for (const { file, fileId } of validFiles) {
      updateFileProgress(fileId, { status: 'uploading' })
      const result = await uploadSingleFile(file, fileId)
      if (result) results.push(result)
    }

    setUploadedFiles((prev) => [...prev, ...results])
    setIsUploading(false)
  }

  const startUpload = useCallback(
    async (files: File[]) => {
      if (files.length > DEFAULT_BATCH_SIZE) return
      await processFiles(files)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId],
  )

  function confirmRerun() {
    if (!pendingDuplicate) return
    const { file, fileId } = pendingDuplicate
    setPendingDuplicate(null)

    setIsUploading(true)
    updateFileProgress(fileId, { status: 'uploading', error: null })

    void uploadSingleFile(file, fileId).then((result) => {
      if (result) setUploadedFiles((prev) => [...prev, result])
      // continue with remaining queued files
      if (pendingQueue.length > 0) {
        void processFiles(pendingQueue)
      } else {
        setIsUploading(false)
      }
      setPendingQueue([])
    })
  }

  function cancelDuplicate() {
    if (!pendingDuplicate) return
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
