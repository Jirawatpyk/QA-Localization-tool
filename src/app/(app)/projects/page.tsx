import { and, count, desc, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { CompactLayout } from '@/components/layout/compact-layout'
import { PageHeader } from '@/components/layout/page-header'
import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { ProjectList } from '@/features/project/components/ProjectList'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Projects — QA Localization Tool',
}

export default async function ProjectsPage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) {
    redirect('/login')
  }

  const projectList = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      sourceLang: projects.sourceLang,
      targetLangs: projects.targetLangs,
      processingMode: projects.processingMode,
      status: projects.status,
      autoPassThreshold: projects.autoPassThreshold,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      fileCount: count(files.id),
    })
    .from(projects)
    .leftJoin(
      files,
      and(eq(projects.id, files.projectId), eq(files.tenantId, currentUser.tenantId)),
    )
    .where(withTenant(projects.tenantId, currentUser.tenantId))
    .groupBy(projects.id)
    .orderBy(desc(projects.updatedAt))

  return (
    <>
      <PageHeader title="Projects" />
      <CompactLayout>
        <ProjectList projects={projectList} userRole={currentUser.role} />
      </CompactLayout>
    </>
  )
}
