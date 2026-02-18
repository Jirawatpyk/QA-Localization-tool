import { eq, and } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { CompactLayout } from '@/components/layout/compact-layout'
import { PageHeader } from '@/components/layout/page-header'
import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { userRoles } from '@/db/schema/userRoles'
import { users } from '@/db/schema/users'
import { UserManagement } from '@/features/admin/components/UserManagement'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'User Management — QA Localization Tool',
}

export default async function AdminPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'admin') {
    redirect('/dashboard')
  }

  const userList = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      createdAt: users.createdAt,
      role: userRoles.role,
    })
    .from(users)
    .leftJoin(
      userRoles,
      and(eq(users.id, userRoles.userId), eq(userRoles.tenantId, currentUser.tenantId)),
    )
    .where(withTenant(users.tenantId, currentUser.tenantId))

  return (
    <>
      <PageHeader title="User Management" />
      <CompactLayout>
        <UserManagement users={userList} />
      </CompactLayout>
    </>
  )
}
