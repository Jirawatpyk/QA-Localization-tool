import type { FindingStatus } from '@/types/finding'

/** State-based background color tokens (shared by FindingCard + FindingCardCompact) */
export const STATUS_BG: Partial<Record<FindingStatus, string>> = {
  accepted: 'bg-finding-accepted',
  re_accepted: 'bg-finding-accepted',
  rejected: 'bg-finding-rejected',
  flagged: 'bg-finding-flagged',
  noted: 'bg-finding-noted',
  source_issue: 'bg-finding-source-issue',
}
