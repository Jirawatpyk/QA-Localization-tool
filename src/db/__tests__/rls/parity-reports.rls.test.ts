/**
 * RLS Tests: parity_reports table — cross-tenant isolation
 *
 * Run with: `npm run test:rls`
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { admin, type TestTenant, cleanupTestTenant, setupTestTenant, tenantClient } from './helpers'

let tenantA: TestTenant & { projectId: string }
let tenantB: TestTenant

beforeAll(async () => {
  const a = await setupTestTenant('rls-parity-a@test.local')
  const b = await setupTestTenant('rls-parity-b@test.local')

  const { data: project } = await admin
    .from('projects')
    .insert({
      tenant_id: a.id,
      name: 'Parity Test',
      source_lang: 'en',
      target_langs: ['th'],
      processing_mode: 'economy',
      status: 'draft',
    })
    .select('id')
    .single()

  await admin.from('parity_reports').insert({
    project_id: project!.id,
    tenant_id: a.id,
    tool_finding_count: 10,
    xbench_finding_count: 12,
    both_found_count: 8,
    tool_only_count: 2,
    xbench_only_count: 4,
    comparison_data: { toolOnly: [], bothFound: [], xbenchOnly: [] },
    xbench_report_storage_path: '/test/report.xlsx',
    generated_by: a.userId,
  })

  tenantA = { ...a, projectId: project!.id }
  tenantB = b
}, 30000)

afterAll(async () => {
  // Delete parity_reports first (generated_by FK is ON DELETE RESTRICT)
  if (tenantA?.id) {
    await admin.from('parity_reports').delete().eq('tenant_id', tenantA.id)
  }
  await cleanupTestTenant(tenantA)
  await cleanupTestTenant(tenantB)
})

describe('parity_reports RLS', () => {
  it('should allow Tenant A to see their own parity reports', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('parity_reports').select('tool_finding_count')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.tool_finding_count).toBe(10)
  })

  it('should prevent Tenant B from seeing Tenant A parity reports', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { data } = await clientB.from('parity_reports').select('*')

    expect(data).toHaveLength(0)
  })

  it('should prevent Tenant B from inserting parity reports into Tenant A project', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { error } = await clientB.from('parity_reports').insert({
      project_id: tenantA.projectId,
      tenant_id: tenantA.id,
      tool_finding_count: 0,
      xbench_finding_count: 0,
      both_found_count: 0,
      tool_only_count: 0,
      xbench_only_count: 0,
      comparison_data: {},
      xbench_report_storage_path: '/injected.xlsx',
      generated_by: tenantB.userId,
    })

    expect(error).toBeTruthy()
  })

  it('should allow Tenant A to insert into their own tenant', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { error } = await clientA.from('parity_reports').insert({
      project_id: tenantA.projectId,
      tenant_id: tenantA.id,
      tool_finding_count: 5,
      xbench_finding_count: 5,
      both_found_count: 5,
      tool_only_count: 0,
      xbench_only_count: 0,
      comparison_data: { toolOnly: [], bothFound: [], xbenchOnly: [] },
      xbench_report_storage_path: '/test/report2.xlsx',
      generated_by: tenantA.userId,
    })

    expect(error).toBeNull()
  })
})
