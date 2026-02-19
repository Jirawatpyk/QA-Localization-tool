/**
 * RLS Tests: findings table — cross-tenant isolation
 *
 * Run with: `npm run test:rls`
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { admin, type TestTenant, cleanupTestTenant, setupTestTenant, tenantClient } from './helpers'

let tenantA: TestTenant & { projectId: string; fileId: string; segmentId: string }
let tenantB: TestTenant

beforeAll(async () => {
  const a = await setupTestTenant('rls-findings-a@test.local')
  const b = await setupTestTenant('rls-findings-b@test.local')

  // Create project → file → segment → finding for Tenant A
  const { data: project } = await admin
    .from('projects')
    .insert({
      tenant_id: a.id,
      name: 'Findings Test',
      source_lang: 'en',
      target_langs: ['th'],
      processing_mode: 'economy',
      status: 'draft',
    })
    .select('id')
    .single()

  const { data: file } = await admin
    .from('files')
    .insert({
      project_id: project!.id,
      tenant_id: a.id,
      file_name: 'test.xliff',
      file_type: 'xliff',
      file_size_bytes: 1024,
      storage_path: '/test.xliff',
      status: 'parsed',
    })
    .select('id')
    .single()

  const { data: segment } = await admin
    .from('segments')
    .insert({
      file_id: file!.id,
      project_id: project!.id,
      tenant_id: a.id,
      segment_number: 1,
      source_text: 'Hello',
      target_text: 'สวัสดี',
      source_lang: 'en',
      target_lang: 'th',
      word_count: 1,
    })
    .select('id')
    .single()

  await admin.from('findings').insert({
    segment_id: segment!.id,
    project_id: project!.id,
    tenant_id: a.id,
    status: 'pending',
    severity: 'major',
    category: 'Accuracy',
    description: 'Mistranslation detected',
    detected_by_layer: 'L1',
  })

  tenantA = { ...a, projectId: project!.id, fileId: file!.id, segmentId: segment!.id }
  tenantB = b
}, 30000)

afterAll(async () => {
  await cleanupTestTenant(tenantA)
  await cleanupTestTenant(tenantB)
})

describe('findings RLS', () => {
  it('should allow Tenant A to see their own findings', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('findings').select('description')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.description).toBe('Mistranslation detected')
  })

  it('should prevent Tenant B from seeing Tenant A findings', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { data } = await clientB.from('findings').select('*')

    expect(data).toHaveLength(0)
  })

  it('should prevent Tenant B from inserting findings into Tenant A project', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { error } = await clientB.from('findings').insert({
      segment_id: tenantA.segmentId,
      project_id: tenantA.projectId,
      tenant_id: tenantA.id,
      status: 'pending',
      severity: 'critical',
      category: 'Accuracy',
      description: 'Injected finding',
      detected_by_layer: 'L2',
    })

    expect(error).toBeTruthy()
  })
})
