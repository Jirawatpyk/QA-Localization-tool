/**
 * RLS Tests: files table — tenant isolation
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
  tenantA = await setupTestTenant('rls-files-a@test.local')
  tenantB = await setupTestTenant('rls-files-b@test.local')

  const { data: projA } = await admin
    .from('projects')
    .insert({
      tenant_id: tenantA.id,
      name: 'File Project A',
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
      name: 'File Project B',
      source_lang: 'en',
      target_langs: ['ja'],
      processing_mode: 'economy',
      status: 'draft',
    })
    .select('id')
    .single()
  projectBId = projB!.id

  // Seed a file for each tenant
  await admin.from('files').insert({
    tenant_id: tenantA.id,
    project_id: projectAId,
    file_name: 'report-a.sdlxliff',
    file_type: 'sdlxliff',
    file_size_bytes: 1024,
    storage_path: `${tenantA.id}/${projectAId}/abc123/report-a.sdlxliff`,
    status: 'uploaded',
  })
  await admin.from('files').insert({
    tenant_id: tenantB.id,
    project_id: projectBId,
    file_name: 'report-b.sdlxliff',
    file_type: 'sdlxliff',
    file_size_bytes: 2048,
    storage_path: `${tenantB.id}/${projectBId}/def456/report-b.sdlxliff`,
    status: 'uploaded',
  })
}, 30000)

afterAll(async () => {
  await cleanupTestTenant(tenantA)
  await cleanupTestTenant(tenantB)
})

describe('files RLS', () => {
  it('should allow Tenant A to see only their own files', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('files').select('file_name')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.file_name).toBe('report-a.sdlxliff')
  })

  it('should allow Tenant B to see only their own files', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { data } = await clientB.from('files').select('file_name')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.file_name).toBe('report-b.sdlxliff')
  })

  it('should prevent Tenant A from inserting file into Tenant B', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { error } = await clientA.from('files').insert({
      tenant_id: tenantB.id,
      project_id: projectBId,
      file_name: 'hijacked.sdlxliff',
      file_type: 'sdlxliff',
      file_size_bytes: 512,
      storage_path: 'bad-path',
      status: 'uploaded',
    })

    expect(error).toBeTruthy()
  })

  it('should prevent Tenant A from updating Tenant B files', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA
      .from('files')
      .update({ status: 'failed' })
      .eq('tenant_id', tenantB.id)
      .select()

    expect(data).toHaveLength(0)
  })

  it('should prevent Tenant A from deleting Tenant B files', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('files').delete().eq('tenant_id', tenantB.id).select()

    expect(data).toHaveLength(0)
  })
})
