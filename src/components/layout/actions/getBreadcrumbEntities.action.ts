'use server'
import 'server-only'

import { z } from 'zod'

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
): Promise<BreadcrumbEntities> {
  const parsed = breadcrumbInputSchema.safeParse(input)
  if (!parsed.success) return {}

  const result: BreadcrumbEntities = {}

  // TODO(TD-TODO-001): Implement DB queries with withTenant() when review routes are created (Epic 4)
  // For now, return raw IDs as display names — tests mock this entirely
  if (parsed.data.projectId) {
    result.projectName = parsed.data.projectId
  }
  if (parsed.data.sessionId) {
    result.sessionName = parsed.data.sessionId
  }

  return result
}
