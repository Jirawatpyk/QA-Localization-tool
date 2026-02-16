import { CompactLayout } from '@/components/layout/compact-layout'
import { PageHeader } from '@/components/layout/page-header'

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <CompactLayout>
        <div className="rounded-lg border border-border bg-card p-6">
          <h3 className="text-sm font-medium text-text-secondary">Welcome to QA Localization Tool</h3>
          <p className="mt-1 text-sm text-text-muted">
            Upload files and start QA review to see your dashboard here.
          </p>
        </div>
      </CompactLayout>
    </>
  )
}
