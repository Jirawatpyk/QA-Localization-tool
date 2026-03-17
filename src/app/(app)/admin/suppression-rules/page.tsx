import { redirect } from 'next/navigation'

import { CompactLayout } from '@/components/layout/compact-layout'
import { PageHeader } from '@/components/layout/page-header'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'

import { SuppressionRulesPageClient } from './SuppressionRulesPageClient'

export const metadata = {
  title: 'Suppression Rules — QA Localization Tool',
}

export default async function SuppressionRulesPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'admin') {
    redirect('/dashboard')
  }

  return (
    <>
      <PageHeader title="Suppression Rules" />
      <CompactLayout>
        <SuppressionRulesPageClient />
      </CompactLayout>
    </>
  )
}
