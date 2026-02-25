import { ParityComparisonView } from '@/features/parity/components/ParityComparisonView'
import { requireRole } from '@/lib/auth/requireRole'

export default async function ParityPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requireRole('qa_reviewer')
  const { projectId } = await params

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-bold">Xbench Parity Comparison</h1>
      <ParityComparisonView projectId={projectId} />
    </div>
  )
}
