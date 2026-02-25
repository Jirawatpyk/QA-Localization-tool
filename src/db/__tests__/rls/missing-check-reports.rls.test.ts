/**
 * RLS Tests: missing_check_reports table — cross-tenant isolation
 *
 * Run with: `npm run test:rls`
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { admin, type TestTenant, cleanupTestTenant, setupTestTenant, tenantClient } from './helpers'

let tenantA: TestTenant & { projectId: string }
let tenantB: TestTenant

beforeAll(async () => {
  // Clean up stale data from previous runs (tracking_reference UNIQUE constraint)
  await admin
    .from('missing_check_reports')
    .delete()
    .in('tracking_reference', ['MCR-20260225-TEST01', 'MCR-20260225-TEST02', 'MCR-20260225-INJECT'])

  const a = await setupTestTenant('rls-mcr-a@test.local')
  const b = await setupTestTenant('rls-mcr-b@test.local')

  const { data: project } = await admin
    .from('projects')
    .insert({
      tenant_id: a.id,
      name: 'MCR Test',
      source_lang: 'en',
      target_langs: ['th'],
      processing_mode: 'economy',
      status: 'draft',
    })
    .select('id')
    .single()

  await admin.from('missing_check_reports').insert({
    project_id: project!.id,
    tenant_id: a.id,
    file_reference: 'test-file.sdlxliff',
    segment_number: 42,
    expected_description: 'Missing number check',
    xbench_check_type: 'Numeric Mismatch',
    status: 'open',
    tracking_reference: 'MCR-20260225-TEST01',
    reported_by: a.userId,
  })

  tenantA = { ...a, projectId: project!.id }
  tenantB = b
}, 30000)

afterAll(async () => {
  // Delete missing_check_reports first (reported_by FK is ON DELETE RESTRICT)
  if (tenantA?.id) {
    await admin.from('missing_check_reports').delete().eq('tenant_id', tenantA.id)
  }
  await cleanupTestTenant(tenantA)
  await cleanupTestTenant(tenantB)
})

describe('missing_check_reports RLS', () => {
  it('should allow Tenant A to see their own reports', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('missing_check_reports').select('tracking_reference')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.tracking_reference).toBe('MCR-20260225-TEST01')
  })

  it('should prevent Tenant B from seeing Tenant A reports', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { data } = await clientB.from('missing_check_reports').select('*')

    expect(data).toHaveLength(0)
  })

  it('should prevent Tenant B from inserting reports into Tenant A project', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { error } = await clientB.from('missing_check_reports').insert({
      project_id: tenantA.projectId,
      tenant_id: tenantA.id,
      file_reference: 'injected.sdlxliff',
      segment_number: 1,
      expected_description: 'Injected report',
      xbench_check_type: 'Tag Mismatch',
      status: 'open',
      tracking_reference: 'MCR-20260225-INJECT',
      reported_by: tenantB.userId,
    })

    expect(error).toBeTruthy()
  })

  it('should allow Tenant A to insert into their own tenant', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { error } = await clientA.from('missing_check_reports').insert({
      project_id: tenantA.projectId,
      tenant_id: tenantA.id,
      file_reference: 'another-file.sdlxliff',
      segment_number: 10,
      expected_description: 'Missing consistency check',
      xbench_check_type: 'Consistency',
      status: 'open',
      tracking_reference: 'MCR-20260225-TEST02',
      reported_by: tenantA.userId,
    })

    expect(error).toBeNull()
  })
})
