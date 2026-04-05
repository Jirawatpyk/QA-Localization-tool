import { and, asc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { CompactLayout } from '@/components/layout/compact-layout'
import { PageHeader } from '@/components/layout/page-header'
import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { languagePairConfigs } from '@/db/schema/languagePairConfigs'
import { userRoles } from '@/db/schema/userRoles'
import { users } from '@/db/schema/users'
import { UserManagement } from '@/features/admin/components/UserManagement'
import { canonicalizeLanguages } from '@/features/admin/validation/userSchemas'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'

export const metadata = {
  title: 'User Management — QA Localization Tool',
}

export default async function AdminPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'admin') {
    redirect('/dashboard')
  }

  const userListRaw = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      createdAt: users.createdAt,
      role: userRoles.role,
      nativeLanguages: users.nativeLanguages,
    })
    .from(users)
    .leftJoin(
      userRoles,
      and(eq(users.id, userRoles.userId), eq(userRoles.tenantId, currentUser.tenantId)),
    )
    .where(withTenant(users.tenantId, currentUser.tenantId))

  // R3-P1: canonicalize nativeLanguages on read too. New writes go through
  // `canonicalizeLanguages` in the action, but any legacy rows from before
  // this fix (or test seeds) might hold mixed-case/unsorted data. Normalizing
  // at the read boundary ensures the UI always sees canonical tags.
  // R4-P2: use the shared helper instead of inline normalization for DRY.
  const userList = userListRaw.map((u) => ({
    ...u,
    nativeLanguages: u.nativeLanguages
      ? canonicalizeLanguages(u.nativeLanguages)
      : u.nativeLanguages,
  }))

  // Distinct target languages configured for this tenant (for the language pair editor)
  const availableLanguagesRows = await db
    .selectDistinct({ targetLang: languagePairConfigs.targetLang })
    .from(languagePairConfigs)
    .where(withTenant(languagePairConfigs.tenantId, currentUser.tenantId))
    .orderBy(asc(languagePairConfigs.targetLang))

  // R3-P1: canonicalize to lowercase so chips match the canonical form that
  // `updateUserLanguages` stores. Without this, clicking a `th-TH` chip would
  // store `th-th` (canonical) but the chip `.includes('th-TH')` check would
  // read the un-canonicalized value and mark the chip unselected on re-render.
  // R4-P2: use `canonicalizeLanguages` helper (lowercase + dedupe + sort).
  const availableLanguages = canonicalizeLanguages(availableLanguagesRows.map((r) => r.targetLang))

  return (
    <>
      <PageHeader title="User Management" />
      <CompactLayout>
        <UserManagement users={userList} availableLanguages={availableLanguages} />
      </CompactLayout>
    </>
  )
}
