import type { ReactNode } from 'react'

import { ProjectSubNav } from '@/features/project/components/ProjectSubNav'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  return (
    <div className="flex flex-col">
      <ProjectSubNav projectId={projectId} />
      {children}
    </div>
  )
}
