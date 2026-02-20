import { redirect } from 'next/navigation'

import { CompactLayout } from '@/components/layout/compact-layout'
import { PageHeader } from '@/components/layout/page-header'
import { TaxonomyManager } from '@/features/taxonomy/components/TaxonomyManager'
import type { TaxonomyMapping } from '@/features/taxonomy/types'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { getCachedTaxonomyMappings } from '@/lib/cache/taxonomyCache'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Taxonomy Mapping — QA Localization Tool',
}

export default async function TaxonomyPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'admin') {
    redirect('/dashboard')
  }

  // getCachedTaxonomyMappings returns raw Drizzle rows (severity: string | null).
  // Cast to TaxonomyMapping[] — DB enforces valid severity values via insert/update actions.
  const mappings = (await getCachedTaxonomyMappings()) as TaxonomyMapping[]

  return (
    <>
      <PageHeader title="Taxonomy Mapping" />
      <CompactLayout>
        <TaxonomyManager initialMappings={mappings} />
      </CompactLayout>
    </>
  )
}
