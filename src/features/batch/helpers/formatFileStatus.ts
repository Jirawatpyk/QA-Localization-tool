/**
 * Shared formatter for file pipeline status values.
 * Used by FileHistoryTable and FileStatusCard.
 */
export function formatFileStatus(status: string): string {
  if (status === 'auto_passed') return 'Auto Passed'
  if (status === 'needs_review') return 'Needs Review'
  if (status === 'failed') return 'Failed'
  if (status === 'l1_completed') return 'L1 Completed'
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
