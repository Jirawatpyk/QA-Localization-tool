import type { DbFileStatus } from '@/types/pipeline'

const STATUS_LABELS: Record<DbFileStatus, string> = {
  uploaded: 'Uploaded',
  parsing: 'Parsing',
  parsed: 'Parsed',
  l1_processing: 'L1 Processing',
  l1_completed: 'L1 Completed',
  l2_processing: 'L2 Processing',
  l2_completed: 'L2 Completed',
  l3_processing: 'L3 Processing',
  l3_completed: 'L3 Completed',
  ai_partial: 'AI Partial',
  failed: 'Failed',
}

/**
 * Shared formatter for file pipeline status values.
 * Used by FileHistoryTable and FileStatusCard.
 */
export function formatFileStatus(status: DbFileStatus): string {
  return STATUS_LABELS[status]
}
