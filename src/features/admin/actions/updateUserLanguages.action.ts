'use server'

import 'server-only'

import { and, eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { users } from '@/db/schema/users'
import { updateUserLanguagesSchema } from '@/features/admin/validation/userSchemas'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { requireRole } from '@/lib/auth/requireRole'
// F6: single source of truth for language canonicalization + set compare.
// The RC refactor centralized these in `@/lib/language/bcp47`; a local copy
// drifted here during earlier rounds and is now deleted.
import { languageSetsEqual } from '@/lib/language/bcp47'
import type { ActionResult } from '@/types/actionResult'

type UpdateUserLanguagesResult = {
  userId: string
  nativeLanguages: string[]
}

/**
 * Updates a user's native languages (BCP-47 array).
 * Admin-only operation. Self-update is allowed (unlike role changes).
 */
export async function updateUserLanguages(
  input: unknown,
): Promise<ActionResult<UpdateUserLanguagesResult>> {
  let currentUser
  try {
    currentUser = await requireRole('admin', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin access required' }
  }

  const parsed = updateUserLanguagesSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  // RC-2: schema `.transform()` already canonicalized `nativeLanguages` and
  // `previousLanguages` at the validation boundary — they arrive here in
  // canonical form (lowercased, deduped, sorted). No explicit canonicalization
  // needed in the action; defence in depth is now enforced by Zod.
  const { userId, nativeLanguages, previousLanguages: clientPrevious } = parsed.data

  // Fetch current value BEFORE update for audit oldValue (pattern: updateUserRole.action.ts:46-56)
  const [current] = await db
    .select({ nativeLanguages: users.nativeLanguages })
    .from(users)
    .where(and(eq(users.id, userId), withTenant(users.tenantId, currentUser.tenantId)))
    .limit(1)

  if (!current) {
    return { success: false, code: 'NOT_FOUND', error: 'User not found' }
  }

  // Post-migration 0025: DB values are canonical. Read directly — no
  // read-side canonicalization needed (was `canonicalizeLanguages(...)` before
  // the backfill). `?? []` unifies null with empty.
  const previousLanguages = current.nativeLanguages ?? []

  // Optimistic-lock snapshot compare (R2-P1 + R3-P1): both sides are now
  // canonicalized, so set equality reduces to positional equality. Kept as
  // set compare for defence in depth + early-out before the SQL round-trip.
  if (clientPrevious !== undefined && !languageSetsEqual(clientPrevious, previousLanguages)) {
    // R2-P6: revalidate so the client's next render has fresh server data.
    // Without this the admin would loop on the same stale snapshot forever.
    revalidatePath('/admin')
    return {
      success: false,
      code: 'CONFLICT',
      error:
        "Another admin updated this user's languages while you were editing. Refresh and try again.",
    }
  }

  // Atomic conditional UPDATE (R2-P3 + R3-P1 + F2): merge "check previous"
  // and "write new" into one statement so two fresh clients with identical
  // valid snapshots cannot both race past the lock. Three layers of fix:
  //
  // 1. `COALESCE(users.nativeLanguages, '[]'::jsonb)` — in Postgres,
  //    `NULL IS NOT DISTINCT FROM '[]'::jsonb` is FALSE, so without COALESCE
  //    a user with `nativeLanguages = NULL` could never save their first edit.
  //
  // 2. The predicate value `previousLanguages` is canonicalized in JS above.
  //
  // 3. **F2 (legacy data)**: the stored DB value may be legacy non-canonical
  //    (written before RC-1). Canonicalize the DB side inside the SQL via
  //    `jsonb_agg(lower(value) ORDER BY lower(value))` so positional JSONB
  //    compare matches the JS canonical form for BOTH fresh and legacy rows.
  //    Wrapped in a CTE-like subquery so the array element conversion runs
  //    once per row.
  // Post-migration 0025: all rows are canonical (lowercase + sorted). The
  // SQL-side `jsonb_agg(lower(value))` subquery that R3-P1→F2→TD7 built up
  // is no longer needed — direct column reference re-enables GIN index usage
  // and eliminates the per-row subquery overhead (TD-LANG-001 resolved).
  // COALESCE still needed for NULL → '[]' unification.
  const updateWhere =
    clientPrevious !== undefined
      ? and(
          eq(users.id, userId),
          withTenant(users.tenantId, currentUser.tenantId),
          sql`COALESCE(${users.nativeLanguages}, '[]'::jsonb) IS NOT DISTINCT FROM ${JSON.stringify(previousLanguages)}::jsonb`,
        )
      : and(eq(users.id, userId), withTenant(users.tenantId, currentUser.tenantId))

  const updated = await db
    .update(users)
    .set({ nativeLanguages })
    .where(updateWhere)
    .returning({ id: users.id })

  if (updated.length === 0) {
    // TOCTOU lost race — another writer landed between our SELECT and UPDATE.
    revalidatePath('/admin')
    return {
      success: false,
      code: 'CONFLICT',
      error:
        "Another admin updated this user's languages while you were editing. Refresh and try again.",
    }
  }

  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'user',
    entityId: userId,
    action: 'user.languages.updated',
    oldValue: { nativeLanguages: previousLanguages },
    newValue: { nativeLanguages },
  })

  revalidatePath('/admin')

  return { success: true, data: { userId, nativeLanguages } }
}
