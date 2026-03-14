/**
 * P2-06 (R3-026): Orphan file detection — files stuck in "processing" with no Inngest activity
 * Source file does not exist yet — concept test with test.skip and TODO ref.
 */
import { describe, it, expect } from 'vitest'

// TODO(story-5.1): orphanFileDetector.ts will be implemented in Epic 5 monitoring

type FileStatus = 'l2_processing' | 'l2_completed' | 'l3_processing' | 'l3_completed' | 'failed'

type FileRecord = {
  id: string
  status: FileStatus
  updatedAt: Date
}

type OrphanCheckResult = {
  isOrphan: boolean
  reason: string | null
}

/**
 * Concept implementation for orphan detection.
 * A file is orphan if status is "*_processing" and updatedAt is > 1 hour ago.
 */
function checkOrphan(file: FileRecord, now: Date): OrphanCheckResult {
  const ONE_HOUR_MS = 60 * 60 * 1000
  const isProcessing = file.status === 'l2_processing' || file.status === 'l3_processing'
  const elapsed = now.getTime() - file.updatedAt.getTime()

  if (isProcessing && elapsed > ONE_HOUR_MS) {
    return {
      isOrphan: true,
      reason: `File ${file.id} stuck in ${file.status} for ${Math.round(elapsed / 60000)} minutes`,
    }
  }

  return { isOrphan: false, reason: null }
}

describe('orphanFileDetector (P2-06)', () => {
  it('[P2] should flag file as orphan when status is l2_processing for >1 hour', () => {
    const now = new Date('2026-03-14T12:00:00Z')
    const file: FileRecord = {
      id: 'file-abc',
      status: 'l2_processing',
      updatedAt: new Date('2026-03-14T10:30:00Z'), // 1.5 hours ago
    }

    const result = checkOrphan(file, now)

    expect(result.isOrphan).toBe(true)
    expect(result.reason).toContain('l2_processing')
    expect(result.reason).toContain('90 minutes')
  })

  it('[P2] should NOT flag file as orphan when status is l2_completed', () => {
    const now = new Date('2026-03-14T12:00:00Z')
    const file: FileRecord = {
      id: 'file-abc',
      status: 'l2_completed',
      updatedAt: new Date('2026-03-14T10:00:00Z'), // 2 hours ago, but completed
    }

    const result = checkOrphan(file, now)

    expect(result.isOrphan).toBe(false)
    expect(result.reason).toBeNull()
  })
})
