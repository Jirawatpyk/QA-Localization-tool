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
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { canonicalizeLanguages } from '@/lib/language/bcp47'

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

  // Post-migration 0025: all DB rows are canonical. Pass through directly.
  const userList = userListRaw

  // Distinct target languages configured for this tenant (for the language pair editor)
  const availableLanguagesRows = await db
    .selectDistinct({ targetLang: languagePairConfigs.targetLang })
    .from(languagePairConfigs)
    .where(withTenant(languagePairConfigs.tenantId, currentUser.tenantId))
    .orderBy(asc(languagePairConfigs.targetLang))

  // Post-migration 0025: `language_pair_configs.target_lang` is canonical.
  // Direct read, sorted. Kept `canonicalizeLanguages` for dedupe + sort
  // defence in case multiple projects have case-divergent configs pre-migration.
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
