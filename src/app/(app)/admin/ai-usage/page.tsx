import { redirect } from 'next/navigation'

import { CompactLayout } from '@/components/layout/compact-layout'
import { PageHeader } from '@/components/layout/page-header'
import { getAiSpendByModel } from '@/features/dashboard/actions/getAiSpendByModel.action'
import { getAiSpendTrend } from '@/features/dashboard/actions/getAiSpendTrend.action'
import { getAiUsageByProject } from '@/features/dashboard/actions/getAiUsageByProject.action'
import { getAiUsageSummary } from '@/features/dashboard/actions/getAiUsageSummary.action'
import { AiUsageDashboard } from '@/features/dashboard/components/AiUsageDashboard'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'AI Usage — QA Localization Tool',
}

const VALID_DAYS = [7, 30, 90] as const
type ValidDays = (typeof VALID_DAYS)[number]

function parseDays(raw: string | undefined): ValidDays {
  const n = Number(raw)
  return (VALID_DAYS.includes(n as ValidDays) ? n : 30) as ValidDays
}

export default async function AiUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const currentUser = await getCurrentUser()
  if (!currentUser || currentUser.role !== 'admin') {
    redirect('/dashboard')
  }

  const { days: daysParam } = await searchParams
  const selectedDays = parseDays(daysParam)

  const [summaryResult, projectsResult, modelsResult, trendResult] = await Promise.all([
    getAiUsageSummary(),
    getAiUsageByProject(),
    getAiSpendByModel({ days: selectedDays }),
    getAiSpendTrend({ days: selectedDays }),
  ])

  if (!summaryResult.success) {
    logger.error({ code: summaryResult.code }, 'AI usage summary fetch failed')
    redirect('/admin')
  }
  if (!projectsResult.success) {
    logger.error({ code: projectsResult.code }, 'AI usage by project fetch failed')
    redirect('/admin')
  }
  if (!modelsResult.success) {
    logger.error({ code: modelsResult.code }, 'AI spend by model fetch failed')
    redirect('/admin')
  }
  if (!trendResult.success) {
    logger.error({ code: trendResult.code }, 'AI spend trend fetch failed')
    redirect('/admin')
  }

  return (
    <>
      <PageHeader title="AI Usage" />
      <CompactLayout>
        <AiUsageDashboard
          summary={summaryResult.data}
          projects={projectsResult.data}
          modelSpend={modelsResult.data}
          trend={trendResult.data}
          selectedDays={selectedDays}
        />
      </CompactLayout>
    </>
  )
}
