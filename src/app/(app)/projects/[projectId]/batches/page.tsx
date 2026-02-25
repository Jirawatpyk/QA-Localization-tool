import { and, desc, eq } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { uploadBatches } from '@/db/schema/uploadBatches'
import { requireRole } from '@/lib/auth/requireRole'

export const dynamic = 'force-dynamic'

export default async function BatchesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const user = await requireRole('qa_reviewer')

  const batches = await db
    .select()
    .from(uploadBatches)
    .where(
      and(
        withTenant(uploadBatches.tenantId, user.tenantId),
        eq(uploadBatches.projectId, projectId),
      ),
    )
    .orderBy(desc(uploadBatches.createdAt))

  if (batches.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">Batches</h1>
        <p className="mt-4 text-muted-foreground">No batches found for this project.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Batches</h1>
      <div className="mt-4 grid gap-3">
        {batches.map((batch) => (
          <Link
            key={batch.id}
            href={`/projects/${projectId}/batches/${batch.id}`}
            className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Batch {batch.id.slice(0, 8)}</p>
                <p className="text-sm text-muted-foreground">
                  {batch.fileCount} files &middot; {new Date(batch.createdAt).toLocaleDateString()}
                </p>
              </div>
              <span className="text-sm text-muted-foreground">{batch.fileCount} files</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
