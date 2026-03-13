import type { FindingStatus } from '@/types/finding'

/** State-based background color tokens (shared by FindingCard + FindingCardCompact) */
export const STATUS_BG: Partial<Record<FindingStatus, string>> = {
  accepted: 'bg-[var(--color-finding-accepted)]',
  re_accepted: 'bg-[var(--color-finding-accepted)]',
  rejected: 'bg-[var(--color-finding-rejected)]',
  flagged: 'bg-[var(--color-finding-flagged)]',
  noted: 'bg-[var(--color-finding-noted)]',
  source_issue: 'bg-[var(--color-finding-source-issue)]',
}
