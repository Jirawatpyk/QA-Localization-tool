'use server'
import 'server-only'

import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { files } from '@/db/schema/files'
import { projects } from '@/db/schema/projects'
import { getCurrentUser } from '@/lib/auth/getCurrentUser'
import type { ActionResult } from '@/types/actionResult'

export type BreadcrumbEntities = {
  projectName?: string | undefined
  sessionName?: string | undefined
}

const breadcrumbInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  sessionId: z.string().uuid().nullable().optional(),
})

export async function getBreadcrumbEntities(
  input: z.input<typeof breadcrumbInputSchema>,
): Promise<ActionResult<BreadcrumbEntities>> {
  const parsed = breadcrumbInputSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Invalid input', code: 'INVALID_INPUT' }
  }

  const user = await getCurrentUser()
  if (!user) {
    return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }
  }

  const result: BreadcrumbEntities = {}

  // Fetch project name (with tenant isolation — Guardrail #1)
  if (parsed.data.projectId) {
    const rows = await db
      .select({ name: projects.name })
      .from(projects)
      .where(
        and(withTenant(projects.tenantId, user.tenantId), eq(projects.id, parsed.data.projectId)),
      )
      .limit(1)

    if (rows.length > 0) {
      result.projectName = rows[0]!.name
    }
  }

  // Fetch file name as session name (with tenant isolation — Guardrail #1)
  if (parsed.data.sessionId) {
    const rows = await db
      .select({ fileName: files.fileName })
      .from(files)
      .where(and(withTenant(files.tenantId, user.tenantId), eq(files.id, parsed.data.sessionId)))
      .limit(1)

    if (rows.length > 0) {
      result.sessionName = rows[0]!.fileName
    }
  }

  return { success: true, data: result }
}
