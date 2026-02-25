import type { ReactNode } from 'react'

import { ProjectTour } from '@/features/onboarding/components/ProjectTour'
import { ProjectSubNav } from '@/features/project/components/ProjectSubNav'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params
  const currentUser = await getCurrentUser()

  return (
    <div className="flex flex-col">
      <ProjectSubNav projectId={projectId} />
      {currentUser && <ProjectTour userId={currentUser.id} userMetadata={currentUser.metadata} />}
      {children}
    </div>
  )
}
