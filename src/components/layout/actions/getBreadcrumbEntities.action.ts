'use server'
import 'server-only'

export type BreadcrumbEntities = {
  projectName?: string | undefined
  sessionName?: string | undefined
}

type BreadcrumbInput = {
  projectId?: string | undefined
  sessionId?: string | undefined
}

export async function getBreadcrumbEntities(input: BreadcrumbInput): Promise<BreadcrumbEntities> {
  const result: BreadcrumbEntities = {}

  // TODO: Implement DB queries with withTenant() when review routes are created (Epic 4)
  // For now, return raw IDs as display names — tests mock this entirely
  if (input.projectId) {
    result.projectName = input.projectId
  }
  if (input.sessionId) {
    result.sessionName = input.sessionId
  }

  return result
}
