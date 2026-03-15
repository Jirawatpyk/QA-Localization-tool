import type { FindingStatus } from '@/types/finding'

/** State-based background color tokens (shared by FindingCard + FindingCardCompact) */
export const STATUS_BG: Partial<Record<FindingStatus, string>> = {
  accepted: 'bg-finding-accepted',
  re_accepted: 'bg-finding-accepted',
  rejected: 'bg-finding-rejected',
  flagged: 'bg-finding-flagged',
  noted: 'bg-finding-noted',
  source_issue: 'bg-finding-source-issue',
  manual: 'bg-muted/50',
}

/** Status labels with icons for accessible display (Guardrail #25: icon + text + color) */
export const STATUS_LABELS: Partial<Record<FindingStatus, string>> = {
  pending: 'Pending',
  accepted: 'Accepted',
  re_accepted: 'Re-accepted',
  rejected: 'Rejected',
  flagged: 'Flagged',
  noted: 'Noted',
  source_issue: 'Source Issue',
  manual: 'Manual',
}
