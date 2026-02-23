/**
 * RLS Tests: upload_batches table — tenant isolation
 *
 * Run with: `npm run test:rls`
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { admin, type TestTenant, cleanupTestTenant, setupTestTenant, tenantClient } from './helpers'

let tenantA: TestTenant
let tenantB: TestTenant
let projectAId: string
let projectBId: string

beforeAll(async () => {
  tenantA = await setupTestTenant('rls-batches-a@test.local')
  tenantB = await setupTestTenant('rls-batches-b@test.local')

  // Seed projects for each tenant
  const { data: projA } = await admin
    .from('projects')
    .insert({
      tenant_id: tenantA.id,
      name: 'Project A',
      source_lang: 'en',
      target_langs: ['th'],
      processing_mode: 'economy',
      status: 'draft',
    })
    .select('id')
    .single()
  projectAId = projA!.id

  const { data: projB } = await admin
    .from('projects')
    .insert({
      tenant_id: tenantB.id,
      name: 'Project B',
      source_lang: 'en',
      target_langs: ['ja'],
      processing_mode: 'economy',
      status: 'draft',
    })
    .select('id')
    .single()
  projectBId = projB!.id

  // Seed an upload_batch for each tenant
  await admin.from('upload_batches').insert({
    tenant_id: tenantA.id,
    project_id: projectAId,
    file_count: 3,
  })
  await admin.from('upload_batches').insert({
    tenant_id: tenantB.id,
    project_id: projectBId,
    file_count: 5,
  })
}, 30000)

afterAll(async () => {
  await cleanupTestTenant(tenantA)
  await cleanupTestTenant(tenantB)
})

describe('upload_batches RLS', () => {
  it('should allow Tenant A to see only their own batches', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('upload_batches').select('file_count')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.file_count).toBe(3)
  })

  it('should allow Tenant B to see only their own batches', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { data } = await clientB.from('upload_batches').select('file_count')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.file_count).toBe(5)
  })

  it('should prevent Tenant A from inserting batch into Tenant B', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { error } = await clientA.from('upload_batches').insert({
      tenant_id: tenantB.id,
      project_id: projectBId,
      file_count: 1,
    })

    expect(error).toBeTruthy()
  })

  it('should prevent Tenant A from updating Tenant B batches', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA
      .from('upload_batches')
      .update({ file_count: 99 })
      .eq('tenant_id', tenantB.id)
      .select()

    expect(data).toHaveLength(0)
  })

  it('should prevent Tenant A from deleting Tenant B batches', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA
      .from('upload_batches')
      .delete()
      .eq('tenant_id', tenantB.id)
      .select()

    expect(data).toHaveLength(0)
  })
})
