/**
 * Sanitize a file name to prevent path traversal attacks.
 * Strips null bytes, directory separators, and traversal sequences.
 */
function sanitizeFileName(fileName: string): string {
  return (
    fileName
      // remove null bytes
      .replace(/\0/g, '')
      // remove path traversal sequences
      .replace(/\.\./g, '')
      // remove directory separators (Unix and Windows)
      .replace(/[/\\]/g, '')
      // collapse any resulting blank/leading-dot artifacts
      .trim()
  )
}

/**
 * Build tenant-scoped storage path for a file.
 * Pattern: {tenantId}/{projectId}/{fileHash}/{sanitizedFileName}
 *
 * Example:
 * abc-123/proj-456/e3b0c44.../report.sdlxliff
 */
export function buildStoragePath(
  tenantId: string,
  projectId: string,
  fileHash: string,
  fileName: string,
): string {
  const safe = sanitizeFileName(fileName)
  return `${tenantId}/${projectId}/${fileHash}/${safe}`
}
