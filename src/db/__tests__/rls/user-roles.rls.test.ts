/**
 * RLS Tests: user_roles table — cross-tenant role isolation
 *
 * Run with: `npm run test:rls`
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type TestTenant, cleanupTestTenant, setupTestTenant, tenantClient } from './helpers'

let tenantA: TestTenant
let tenantB: TestTenant

beforeAll(async () => {
  tenantA = await setupTestTenant('rls-roles-a@test.local')
  tenantB = await setupTestTenant('rls-roles-b@test.local')
}, 30000)

afterAll(async () => {
  await cleanupTestTenant(tenantA)
  await cleanupTestTenant(tenantB)
})

describe('user_roles RLS', () => {
  it('should allow Tenant A to see only their own roles', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('user_roles').select('role, tenant_id')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.role).toBe('admin')
    expect(data?.[0]?.tenant_id).toBe(tenantA.id)
  })

  it('should prevent Tenant B from seeing Tenant A roles', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { data } = await clientB.from('user_roles').select('*').eq('tenant_id', tenantA.id)

    expect(data).toHaveLength(0)
  })

  it('should prevent Tenant A from inserting roles into Tenant B', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { error } = await clientA.from('user_roles').insert({
      user_id: tenantA.userId,
      tenant_id: tenantB.id,
      role: 'admin',
    })

    expect(error).toBeTruthy()
  })

  it('should prevent Tenant A from updating Tenant B roles', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA
      .from('user_roles')
      .update({ role: 'qa_reviewer' })
      .eq('tenant_id', tenantB.id)
      .select()

    expect(data).toHaveLength(0)
  })

  it('should prevent Tenant A from deleting Tenant B roles', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('user_roles').delete().eq('tenant_id', tenantB.id).select()

    expect(data).toHaveLength(0)
  })
})
