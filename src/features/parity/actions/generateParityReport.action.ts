// Stub: Story 2.7 — generateParityReport server action
// TODO: Replace with real implementation in Story 2.7 Task 7.4
import 'server-only'

import type { ActionResult } from '@/types/actionResult'

type ParityComparisonResult = {
  reportId: string
  bothFound: unknown[]
  toolOnly: unknown[]
  xbenchOnly: unknown[]
  toolFindingCount: number
  xbenchFindingCount: number
}

export async function generateParityReport(
  _input: unknown,
): Promise<ActionResult<ParityComparisonResult>> {
  return { success: false, error: 'Not implemented', code: 'NOT_IMPLEMENTED' }
}
