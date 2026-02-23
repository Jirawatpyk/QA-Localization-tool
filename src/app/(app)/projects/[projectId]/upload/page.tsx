import { redirect } from 'next/navigation'

import { CompactLayout } from '@/components/layout/compact-layout'
import { UploadPageClient } from '@/features/upload/components/UploadPageClient'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'

export const metadata = { title: 'Upload Files — QA Localization Tool' }

export default async function UploadPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    redirect('/login')
  }

  return (
    <CompactLayout>
      <UploadPageClient projectId={projectId} />
    </CompactLayout>
  )
}
