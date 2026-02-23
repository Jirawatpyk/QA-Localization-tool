/**
 * Build tenant-scoped storage path for a file.
 * Pattern: {tenantId}/{projectId}/{fileHash}/{fileName}
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
  return `${tenantId}/${projectId}/${fileHash}/${fileName}`
}
