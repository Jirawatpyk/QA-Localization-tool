'use server'

import 'server-only'

import { executeReviewAction } from '@/features/review/actions/helpers/executeReviewAction'
import type {
  ReviewActionNoOp,
  ReviewActionResult,
} from '@/features/review/actions/helpers/executeReviewAction'
import { acceptFindingSchema } from '@/features/review/validation/reviewAction.schema'
import type { AcceptFindingInput } from '@/features/review/validation/reviewAction.schema'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

export async function acceptFinding(
  input: AcceptFindingInput,
): Promise<ActionResult<ReviewActionResult | ReviewActionNoOp>> {
  // Zod validation
  const parsed = acceptFindingSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      code: 'VALIDATION',
    }
  }

  // Auth — requireRole throws on failure
  let user: Awaited<ReturnType<typeof requireRole>>
  try {
    user = await requireRole('qa_reviewer')
  } catch {
    return {
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
    }
  }

  return executeReviewAction({
    input: parsed.data,
    action: 'accept',
    user: { id: user.id, tenantId: user.tenantId, nativeLanguages: user.nativeLanguages },
  })
}
