import { redirect } from 'next/navigation'

import { CompactLayout } from '@/components/layout/compact-layout'
import { PageHeader } from '@/components/layout/page-header'
import { getTaxonomyMappings } from '@/features/taxonomy/actions/getTaxonomyMappings.action'
import { TaxonomyManager } from '@/features/taxonomy/components/TaxonomyManager'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'

export const metadata = {
  title: 'Taxonomy Mapping — QA Localization Tool',
}

export default async function TaxonomyPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'admin') {
    redirect('/dashboard')
  }

  // Admin page: use getTaxonomyMappings() action which returns ALL active rows
  // (including internalName IS NULL). getCachedTaxonomyMappings filters those out
  // because it's designed for the QA engine, not admin management.
  const result = await getTaxonomyMappings()
  if (!result.success) redirect('/dashboard')
  const mappings = result.data

  return (
    <>
      <PageHeader title="Taxonomy Mapping" />
      <CompactLayout>
        <TaxonomyManager initialMappings={mappings} isAdmin={true} />
      </CompactLayout>
    </>
  )
}
