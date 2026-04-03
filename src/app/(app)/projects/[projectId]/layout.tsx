import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { ProjectTour } from '@/features/onboarding/components/ProjectTour'
import { ProjectSubNav } from '@/features/project/components/ProjectSubNav'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { logger } from '@/lib/logger'
import { isUuid } from '@/lib/validation/uuid'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  if (!isUuid(projectId)) {
    logger.warn({ param: 'projectId', value: projectId }, 'Invalid UUID in route param')
    notFound()
  }

  const currentUser = await getCurrentUser()

  return (
    <div className="flex flex-col">
      <ProjectSubNav projectId={projectId} />
      {currentUser && <ProjectTour userId={currentUser.id} userMetadata={currentUser.metadata} />}
      {children}
    </div>
  )
}
