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
import { canonicalizeBcp47 } from '@/lib/language/bcp47'
import type { ActionResult } from '@/types/actionResult'

export type ReviewerOption = {
  userId: string
  displayName: string
  email: string
  role: string
  nativeLanguages: string[]
  workload: number
  isAutoSuggested: boolean
  isLanguageMatch: boolean
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

  const { targetLanguage: rawTargetLanguage, includeAll } = parsed.data
  const { tenantId } = currentUser

  // Security: includeAll reveals ALL tenant reviewers regardless of language match.
  // Only admins may use the fallback (prevents non-admin reviewer user enumeration).
  //
  // TD1: use `requireRole('admin', 'write')` to perform a FRESH DB check on the
  // user's role instead of trusting JWT claims. Per the M3 pattern
  // (CLAUDE.md Architecture > RBAC M3), reads may trust JWT for speed, but
  // `includeAll` is a privilege-escalation-adjacent fallback — a demoted admin
  // whose JWT has not yet refreshed would otherwise still enumerate reviewers.
  // Guardrail #62 — defence in depth: UI hides the CTA to non-admins, this
  // Server Action enforces against the current DB state.
  if (includeAll) {
    try {
      await requireRole('admin', 'write')
    } catch {
      return {
        success: false,
        code: 'FORBIDDEN',
        error: 'Admin access required for full reviewer list',
      }
    }
  }

  // R4-P1: canonicalize the lookup language. R3-P1 made `users.nativeLanguages`
  // store canonical lowercase form on write, but this read-side comparison was
  // left using the raw `targetLanguage` from project settings (commonly uppercase
  // like `th-TH`, `ja-JP`, `zh-Hant-TW`). JSONB `@>` and JS `.includes()` are
  // both case-sensitive, so without normalization every file with an uppercase
  // target tag matched ZERO reviewers — the feature was broken in production.
  const targetLanguage = canonicalizeBcp47(rawTargetLanguage)

  // LEFT JOIN file_assignments + COUNT FILTER for workload (Guardrail #83)
  // Language-pair match: canonicalized user.native_languages @> canonical target
  const targetLangJsonb = JSON.stringify([targetLanguage])

  // R2-D2: Only reviewer roles are eligible. Admins are not reviewers — they
  // shouldn't appear in matching OR fallback lists, even if they happen to
  // have nativeLanguages set (e.g., admin was previously a reviewer, or
  // self-update). The UX spec models nativeLanguages as a reviewer property.
  const REVIEWER_ROLES = ['qa_reviewer', 'native_reviewer'] as const

  // Post-migration 0025: all rows are canonical. Direct column reference
  // re-enables GIN index on `users.native_languages` (TD-LANG-001 resolved).
  const whereFilters = includeAll
    ? [withTenant(users.tenantId, tenantId)]
    : [
        withTenant(users.tenantId, tenantId),
        // Language-pair filter: reviewer's nativeLanguages (canonical) @> canonical target
        sql`${users.nativeLanguages} @> ${targetLangJsonb}::jsonb`,
      ]

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
      and(
        eq(userRoles.userId, users.id),
        withTenant(userRoles.tenantId, tenantId),
        // R2-D2: exclude admin role from both matching and includeAll paths.
        inArray(userRoles.role, [...REVIEWER_ROLES]),
      ),
    )
    .leftJoin(
      fileAssignments,
      and(
        eq(fileAssignments.assignedTo, users.id),
        withTenant(fileAssignments.tenantId, tenantId),
        inArray(fileAssignments.status, ['assigned', 'in_progress']),
      ),
    )
    .where(and(...whereFilters))
    .groupBy(users.id, users.displayName, users.email, userRoles.role, users.nativeLanguages)
    .orderBy(count(fileAssignments.id))

  // Auto-suggest: the reviewer with the lowest workload (first in sorted results)
  // Only auto-suggest language-matched reviewers (never an unmatched fallback reviewer)
  //
  // F3: canonicalize `r.nativeLanguages` on read for the `includeAll` fallback
  // path. Legacy rows written before RC-1 may hold mixed-case/unsorted values;
  // canonicalizing on read keeps the `.includes()` check case-insensitive
  // regardless of DB state. `targetLanguage` is already canonical (schema +
  // R4-P1 action-level normalization).
  const enriched = reviewers.map((r) => {
    const canonicalNativeLanguages = (r.nativeLanguages ?? []).map(canonicalizeBcp47)
    return {
      ...r,
      nativeLanguages: canonicalNativeLanguages,
      isLanguageMatch: includeAll ? canonicalNativeLanguages.includes(targetLanguage) : true,
    }
  })

  // Auto-suggest the first language-matched reviewer in workload order.
  // The SQL `ORDER BY workload` already resolves ties deterministically, so
  // simply picking the first match is correct — the previous strict `<`
  // comparison silently suppressed the star whenever the top two matched
  // reviewers had equal workload (D2).
  const firstMatchIndex = enriched.findIndex((r) => r.isLanguageMatch)

  const result: ReviewerOption[] = enriched.map((r, i) => {
    const isAutoSuggested = i === firstMatchIndex && r.isLanguageMatch
    return {
      userId: r.userId,
      displayName: r.displayName,
      email: r.email,
      role: r.role,
      nativeLanguages: r.nativeLanguages ?? [],
      workload: r.workload,
      isAutoSuggested,
      isLanguageMatch: r.isLanguageMatch,
    }
  })

  return { success: true, data: result }
}
