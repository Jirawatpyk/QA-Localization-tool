'use server'

import 'server-only'

import { and, eq } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'

import { db } from '@/db/client'
import { withTenant } from '@/db/helpers/withTenant'
import { glossaries } from '@/db/schema/glossaries'
import { glossaryTerms } from '@/db/schema/glossaryTerms'
import { projects } from '@/db/schema/projects'
import { writeAuditLog } from '@/features/audit/actions/writeAuditLog'
import { parseGlossaryFile } from '@/features/glossary/parsers'
import type { ImportResult } from '@/features/glossary/types'
import {
  columnMappingSchema,
  importGlossarySchema,
} from '@/features/glossary/validation/glossarySchemas'
import { requireRole } from '@/lib/auth/requireRole'
import type { ActionResult } from '@/types/actionResult'

const BATCH_SIZE = 500

export async function importGlossary(formData: FormData): Promise<ActionResult<ImportResult>> {
  let currentUser
  try {
    currentUser = await requireRole('admin', 'write')
  } catch {
    return { success: false, code: 'FORBIDDEN', error: 'Admin access required' }
  }

  // Extract fields from FormData
  const file = formData.get('file') as File | null
  const name = formData.get('name') as string | null
  const projectId = formData.get('projectId') as string | null
  const format = formData.get('format') as string | null

  if (!file || !name || !projectId || !format) {
    return { success: false, code: 'VALIDATION_ERROR', error: 'Missing required fields' }
  }

  // Validate core fields
  const parsed = importGlossarySchema.safeParse({ projectId, name, format })
  if (!parsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: parsed.error.message }
  }

  // Validate column mapping
  const mappingInput = {
    sourceColumn: (formData.get('sourceColumn') as string) ?? '',
    targetColumn: (formData.get('targetColumn') as string) ?? '',
    hasHeader: formData.get('hasHeader') !== 'false',
    delimiter: (formData.get('delimiter') as string) ?? ',',
  }
  const mappingParsed = columnMappingSchema.safeParse(mappingInput)
  if (!mappingParsed.success) {
    return { success: false, code: 'VALIDATION_ERROR', error: mappingParsed.error.message }
  }

  // Verify project exists and belongs to tenant
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, parsed.data.projectId),
        withTenant(projects.tenantId, currentUser.tenantId),
      ),
    )

  if (!project) {
    return { success: false, code: 'NOT_FOUND', error: 'Project not found' }
  }

  // Validate project has target languages configured
  const targetLang = project.targetLangs?.[0]
  if (!targetLang) {
    return {
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Project has no target languages configured',
    }
  }

  const buffer = await file.arrayBuffer()

  // Parse file using appropriate parser
  const parseResult = await parseGlossaryFile({
    format: parsed.data.format,
    buffer,
    mapping: mappingParsed.data,
    sourceLang: project.sourceLang,
    targetLang,
  })

  // Intra-file dedup: group by normalized source term (case-insensitive)
  const seen = new Map<string, boolean>()
  let duplicates = 0
  const uniqueTerms = parseResult.terms.filter((term) => {
    const key = term.sourceTerm.normalize('NFKC').toLowerCase()
    if (seen.has(key)) {
      duplicates++
      return false
    }
    seen.set(key, true)
    return true
  })

  // Create glossary record
  const [glossary] = await db
    .insert(glossaries)
    .values({
      tenantId: currentUser.tenantId,
      projectId: parsed.data.projectId,
      name: parsed.data.name,
      sourceLang: project.sourceLang,
      targetLang,
    })
    .returning()

  if (!glossary) {
    return { success: false, code: 'CREATE_FAILED', error: 'Failed to create glossary' }
  }

  // Batch insert terms
  for (let i = 0; i < uniqueTerms.length; i += BATCH_SIZE) {
    const batch = uniqueTerms.slice(i, i + BATCH_SIZE).map((term) => ({
      glossaryId: glossary.id,
      sourceTerm: term.sourceTerm,
      targetTerm: term.targetTerm,
    }))
    await db.insert(glossaryTerms).values(batch)
  }

  // Audit log
  await writeAuditLog({
    tenantId: currentUser.tenantId,
    userId: currentUser.id,
    entityType: 'glossary',
    entityId: glossary.id,
    action: 'glossary.created',
    newValue: { name: parsed.data.name, termCount: uniqueTerms.length },
  })

  // Cache invalidation
  revalidateTag(`glossary-${parsed.data.projectId}`, 'minutes')
  revalidatePath(`/projects/${parsed.data.projectId}/glossary`)

  return {
    success: true,
    data: {
      imported: uniqueTerms.length,
      duplicates,
      errors: parseResult.errors,
      glossaryId: glossary.id,
    },
  }
}
