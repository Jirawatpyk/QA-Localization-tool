import 'server-only'

import { createHash } from 'crypto'

/**
 * Compute SHA-256 hash of a file buffer.
 * Server-side only — uses Node.js crypto module.
 * For client-side duplicate pre-check, use Web Crypto in useFileUpload hook.
 */
export function computeFileHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}
