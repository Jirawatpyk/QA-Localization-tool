'use server'

import 'server-only'

import { and, count, eq, inArray, sql } from 'drizzle-orm'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { fileAssignments } from '@/db/schema/fileAssignments'
import { userRoles } from '@/db/schema/userRoles'
import { users } from '@/db/schema/users'
import { getEligibleReviewersSchema } from '@/features/project/validation/fileAssignmentSchemas'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

export type ReviewerOption = {
  userId: string
  displayName: string
  email: string
  role: string
  nativeLanguages: string[]
  workload: number
  isAutoSuggested: boolean
}

export async function getEligibleReviewers(
  input: unknown,
): Promise<ActionResult<ReviewerOption[]>> {
  let currentUser
  try {
    currentUser = await requireRole('qa_reviewer', 'read')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin or QA reviewer access required' }
  }

  const parsed = getEligibleReviewersSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { targetLanguage } = parsed.data
  const { tenantId } = currentUser

  // LEFT JOIN file_assignments + COUNT FILTER for workload (Guardrail #83)
  // Language-pair match: user.native_languages @> target language JSONB array
  const targetLangJsonb = JSON.stringify([targetLanguage])

  const reviewers = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
      email: users.email,
      role: userRoles.role,
      nativeLanguages: users.nativeLanguages,
      workload: count(fileAssignments.id),
    })
    .from(users)
    .innerJoin(
      userRoles,
      and(eq(userRoles.userId, users.id), withTenant(userRoles.tenantId, tenantId)),
    )
    .leftJoin(
      fileAssignments,
      and(
        eq(fileAssignments.assignedTo, users.id),
        withTenant(fileAssignments.tenantId, tenantId),
        inArray(fileAssignments.status, ['assigned', 'in_progress']),
      ),
    )
    .where(
      and(
        withTenant(users.tenantId, tenantId),
        // Language-pair filter: reviewer's nativeLanguages contains the target language
        sql`${users.nativeLanguages} @> ${targetLangJsonb}::jsonb`,
      ),
    )
    .groupBy(users.id, users.displayName, users.email, userRoles.role, users.nativeLanguages)
    .orderBy(count(fileAssignments.id))

  // Auto-suggest: the reviewer with the lowest workload (first in sorted results)
  const result: ReviewerOption[] = reviewers.map((r, i) => ({
    userId: r.userId,
    displayName: r.displayName,
    email: r.email,
    role: r.role,
    nativeLanguages: r.nativeLanguages ?? [],
    workload: r.workload,
    isAutoSuggested: i === 0,
  }))

  return { success: true, data: result }
}
