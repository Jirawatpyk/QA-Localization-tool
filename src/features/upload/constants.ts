// Upload-specific constants only.
// MAX_FILE_SIZE_BYTES and DEFAULT_BATCH_SIZE come from @/lib/constants — do NOT duplicate.

export const LARGE_FILE_WARNING_BYTES = 10 * 1024 * 1024 // 10MB

export const ALLOWED_FILE_TYPES = ['sdlxliff', 'xliff', 'xlsx'] as const

export const ALLOWED_EXTENSIONS = ['.sdlxliff', '.xlf', '.xliff', '.xlsx'] as const

export const UPLOAD_RETRY_COUNT = 3

export const UPLOAD_RETRY_BACKOFF_MS = [1000, 2000, 4000] as const

export const UPLOAD_STORAGE_BUCKET = 'project-files'
