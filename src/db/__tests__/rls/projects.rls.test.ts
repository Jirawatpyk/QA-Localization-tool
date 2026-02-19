/**
 * RLS Tests: projects table — tenant isolation
 *
 * Run with: `npm run test:rls`
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { admin, type TestTenant, cleanupTestTenant, setupTestTenant, tenantClient } from './helpers'

let tenantA: TestTenant
let tenantB: TestTenant

beforeAll(async () => {
  tenantA = await setupTestTenant('rls-projects-a@test.local')
  tenantB = await setupTestTenant('rls-projects-b@test.local')

  // Seed a project for each tenant (via admin to bypass RLS)
  await admin.from('projects').insert({
    tenant_id: tenantA.id,
    name: 'Project A',
    source_lang: 'en',
    target_langs: ['th'],
    processing_mode: 'economy',
    status: 'draft',
  })
  await admin.from('projects').insert({
    tenant_id: tenantB.id,
    name: 'Project B',
    source_lang: 'en',
    target_langs: ['ja'],
    processing_mode: 'thorough',
    status: 'draft',
  })
}, 30000)

afterAll(async () => {
  await cleanupTestTenant(tenantA)
  await cleanupTestTenant(tenantB)
})

describe('projects RLS', () => {
  it('should allow Tenant A to see only their own projects', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('projects').select('name')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.name).toBe('Project A')
  })

  it('should allow Tenant B to see only their own projects', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { data } = await clientB.from('projects').select('name')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.name).toBe('Project B')
  })

  it('should prevent Tenant A from inserting into Tenant B', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { error } = await clientA.from('projects').insert({
      tenant_id: tenantB.id,
      name: 'Hijacked Project',
      source_lang: 'en',
      target_langs: ['ko'],
      processing_mode: 'economy',
      status: 'draft',
    })

    expect(error).toBeTruthy()
  })

  it('should prevent Tenant A from updating Tenant B projects', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA
      .from('projects')
      .update({ name: 'Hijacked Name' })
      .eq('tenant_id', tenantB.id)
      .select()

    // RLS silently returns 0 rows (no match in USING clause)
    expect(data).toHaveLength(0)
  })

  it('should prevent Tenant A from deleting Tenant B projects', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('projects').delete().eq('tenant_id', tenantB.id).select()

    expect(data).toHaveLength(0)
  })
})
