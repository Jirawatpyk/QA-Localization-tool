export type UploadErrorCode =
  | 'FILE_SIZE_EXCEEDED'
  | 'UNSUPPORTED_FORMAT'
  | 'BATCH_SIZE_EXCEEDED'
  | 'DUPLICATE_FILE'
  | 'STORAGE_ERROR'
  | 'NETWORK_ERROR'

export type FileStatus = 'pending' | 'uploading' | 'uploaded' | 'error'

export type UploadProgress = {
  fileId: string
  fileName: string
  fileSizeBytes: number
  bytesUploaded: number
  percent: number
  etaSeconds: number | null
  status: FileStatus
  error: UploadErrorCode | null
}

export type DuplicateInfo = {
  isDuplicate: true
  originalUploadDate: string
  existingScore: number | null
  existingFileId: string
}

export type NoDuplicate = {
  isDuplicate: false
}

export type DuplicateCheckResult = DuplicateInfo | NoDuplicate

export type UploadFileResult = {
  fileId: string
  fileName: string
  fileSizeBytes: number
  fileType: string
  fileHash: string
  storagePath: string
  status: string
  batchId: string
}

export type BatchRecord = {
  id: string
  projectId: string
  tenantId: string
  fileCount: number
  createdAt: string
}
