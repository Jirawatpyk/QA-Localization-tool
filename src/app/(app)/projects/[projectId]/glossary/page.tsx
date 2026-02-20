import { and, count, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'

import { CompactLayout } from '@/components/layout/compact-layout'
import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { glossaries } from '@/db/schema/glossaries'
import { glossaryTerms } from '@/db/schema/glossaryTerms'
import { projects } from '@/db/schema/projects'
import { GlossaryManager } from '@/features/glossary/components/GlossaryManager'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'

export const metadata = { title: 'Glossary — QA Localization Tool' }

export default async function GlossaryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    redirect('/login')
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), withTenant(projects.tenantId, currentUser.tenantId)))

  if (!project) {
    notFound()
  }

  const glossaryList = await db
    .select({
      id: glossaries.id,
      name: glossaries.name,
      sourceLang: glossaries.sourceLang,
      targetLang: glossaries.targetLang,
      createdAt: glossaries.createdAt,
      termCount: count(glossaryTerms.id),
    })
    .from(glossaries)
    .leftJoin(glossaryTerms, eq(glossaries.id, glossaryTerms.glossaryId))
    .where(
      and(
        eq(glossaries.projectId, projectId),
        withTenant(glossaries.tenantId, currentUser.tenantId),
      ),
    )
    .groupBy(glossaries.id)

  return (
    <CompactLayout>
      <GlossaryManager
        project={{
          id: project.id,
          name: project.name,
          sourceLang: project.sourceLang,
          targetLangs: project.targetLangs,
        }}
        glossaries={glossaryList}
        userRole={currentUser.role}
      />
    </CompactLayout>
  )
}
