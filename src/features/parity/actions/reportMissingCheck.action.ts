// Stub: Story 2.7 — reportMissingCheck server action
// TODO: Replace with real implementation in Story 2.7 Task 7.5
import 'server-only'

import type { ActionResult } from '@/types/actionResult'

export async function reportMissingCheck(
  _input: unknown,
): Promise<ActionResult<{ trackingReference: string }>> {
  return { success: false, error: 'Not implemented', code: 'NOT_IMPLEMENTED' }
}
