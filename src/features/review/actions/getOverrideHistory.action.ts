'use server'

// Note: 'server-only' omitted — this file uses 'use server' directive which is sufficient.
// Adding 'server-only' would block client-side imports needed for Server Action references
// (ReviewPageClient passes this action as prop to FindingDetailContent → OverrideHistoryPanel)

import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { reviewActions } from '@/db/schema/reviewActions'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

const getOverrideHistorySchema = z.object({
  findingId: z.string().uuid(),
  projectId: z.string().uuid(),
})

type GetOverrideHistoryInput = z.infer<typeof getOverrideHistorySchema>

export type OverrideHistoryEntry = {
  id: string
  findingId: string
  actionType: string
  previousState: string
  newState: string
  userId: string
  createdAt: string
  metadata: Record<string, unknown> | null
}

export async function getOverrideHistory(
  input: GetOverrideHistoryInput,
): Promise<ActionResult<OverrideHistoryEntry[]>> {
  // Zod validation
  const parsed = getOverrideHistorySchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid input',
      code: 'VALIDATION_ERROR',
    }
  }

  const { findingId, projectId } = parsed.data

  // Auth
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

  const { tenantId } = user

  // Query review_actions for this finding, ordered newest-first (Guardrail #1)
  const rows = await db
    .select({
      id: reviewActions.id,
      findingId: reviewActions.findingId,
      actionType: reviewActions.actionType,
      previousState: reviewActions.previousState,
      newState: reviewActions.newState,
      userId: reviewActions.userId,
      createdAt: reviewActions.createdAt,
      metadata: reviewActions.metadata,
    })
    .from(reviewActions)
    .where(
      and(
        eq(reviewActions.findingId, findingId),
        eq(reviewActions.projectId, projectId),
        withTenant(reviewActions.tenantId, tenantId),
      ),
    )
    .orderBy(desc(reviewActions.createdAt))

  const entries: OverrideHistoryEntry[] = rows.map((row) => ({
    id: row.id,
    findingId: row.findingId,
    actionType: row.actionType,
    previousState: row.previousState,
    newState: row.newState,
    userId: row.userId,
    createdAt:
      typeof row.createdAt === 'string' ? row.createdAt : (row.createdAt as Date).toISOString(),
    metadata: row.metadata ?? null,
  }))

  return {
    success: true,
    data: entries,
  }
}
