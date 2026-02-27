import { and, eq } from 'drizzle-orm'
import { notFound, redirect } from 'next/navigation'

import { CompactLayout } from '@/components/layout/compact-layout'
import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { languagePairConfigs } from '@/db/schema/languagePairConfigs'
import { projects } from '@/db/schema/projects'
import { getProjectAiBudget } from '@/features/pipeline/actions/getProjectAiBudget.action'
import { ProjectSettings } from '@/features/project/components/ProjectSettings'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  const currentUser = await getCurrentUser()
  if (!currentUser) {
    redirect('/login')
  }
  if (currentUser.role !== 'admin') {
    redirect('/projects')
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), withTenant(projects.tenantId, currentUser.tenantId)))

  if (!project) {
    notFound()
  }

  const configs = await db
    .select()
    .from(languagePairConfigs)
    .where(withTenant(languagePairConfigs.tenantId, currentUser.tenantId))

  const budgetResult = await getProjectAiBudget({ projectId })
  const budgetData = budgetResult.success
    ? budgetResult.data
    : {
        usedBudgetUsd: 0,
        monthlyBudgetUsd: null,
        budgetAlertThresholdPct: 80,
        remainingBudgetUsd: Infinity,
      }

  return (
    <CompactLayout>
      <ProjectSettings
        project={project}
        languagePairConfigs={configs}
        isAdmin={currentUser.role === 'admin'}
        budgetData={budgetData}
      />
    </CompactLayout>
  )
}
