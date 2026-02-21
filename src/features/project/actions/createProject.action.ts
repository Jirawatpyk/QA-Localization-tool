'use server'

import 'server-only'

import { revalidatePath } from 'next/cache'

import { db } from '@/db/client'
import { projects } from '@/db/schema/projects'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { createProjectSchema } from '@/features/project/validation/projectSchemas'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

type ProjectResult = {
  id: string
  name: string
  sourceLang: string
  targetLangs: string[]
  processingMode: string
}

export async function createProject(input: unknown): Promise<ActionResult<ProjectResult>> {
  let currentUser
  try {
    currentUser = await requireRole('admin', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin access required' }
  }

  const parsed = createProjectSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  const { name, description, sourceLang, targetLangs, processingMode } = parsed.data

  const [project] = await db
    .insert(projects)
    .values({
      tenantId: currentUser.tenantId,
      name,
      description,
      sourceLang,
      targetLangs,
      processingMode,
    })
    .returning()

  if (!project) {
    return { success: false, code: 'CREATE_FAILED', error: 'Failed to create project' }
  }

  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'project',
    entityId: project.id,
    action: 'project.created',
    newValue: { name, sourceLang, targetLangs, processingMode },
  })

  revalidatePath('/projects')

  return {
    success: true,
    data: {
      id: project.id,
      name: project.name,
      sourceLang: project.sourceLang,
      targetLangs: project.targetLangs,
      processingMode: project.processingMode,
    },
  }
}
