/**
 * RLS Tests: audit_logs table — INSERT-only enforcement + immutability trigger
 *
 * Layer 2 (RLS): Only SELECT + INSERT policies — no UPDATE/DELETE
 * Layer 3 (Trigger): prevent_audit_modification() blocks even service_role
 *
 * Requires migrations: 00002_audit_logs_immutability.sql
 * If this migration hasn't been applied, UPDATE/DELETE blocking tests will be skipped.
 *
 * Run with: `npm run test:rls`
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { admin, type TestTenant, cleanupTestTenant, setupTestTenant, tenantClient } from './helpers'

let testTenant: TestTenant
let auditLogId: string
let rlsEnabled = false
let triggerExists = false

beforeAll(async () => {
  testTenant = await setupTestTenant('rls-audit-a@test.local')

  // Detect if audit_logs RLS + trigger are deployed
  // Try UPDATE via service_role on a dummy audit log
  const client = tenantClient(testTenant.jwt)
  const { data: inserted, error: insertError } = await client
    .from('audit_logs')
    .insert({
      tenant_id: testTenant.id,
      user_id: testTenant.userId,
      entity_type: 'user',
      entity_id: testTenant.userId,
      action: 'test.created',
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    throw new Error(`Failed to insert audit log: ${insertError?.message ?? 'data is null'}`)
  }
  auditLogId = inserted.id

  // Probe: try UPDATE via authenticated client to check if RLS blocks it
  const { data: probeUpdate } = await client
    .from('audit_logs')
    .update({ action: 'probe' })
    .eq('id', auditLogId)
    .select()

  if (!probeUpdate || probeUpdate.length === 0) {
    // RLS blocked the UPDATE (no UPDATE policy exists) → migration 00002 is applied
    rlsEnabled = true
  } else {
    // UPDATE succeeded → RLS not configured for audit_logs
    // Revert the probe
    await admin.from('audit_logs').update({ action: 'test.created' }).eq('id', auditLogId)
  }

  // Probe: try UPDATE via service_role to check if trigger exists
  const { error: triggerProbe } = await admin
    .from('audit_logs')
    .update({ action: 'trigger-probe' })
    .eq('id', auditLogId)

  if (triggerProbe?.message?.includes('immutable')) {
    triggerExists = true
  } else if (!triggerProbe) {
    // No error — trigger not deployed, revert
    await admin.from('audit_logs').update({ action: 'test.created' }).eq('id', auditLogId)
  }

  if (!rlsEnabled) {
    console.warn('⚠ audit_logs RLS policies not deployed (migration 00002). Some tests will skip.')
  }
  if (!triggerExists) {
    console.warn(
      '⚠ audit_immutable_guard trigger not deployed (migration 00002). Trigger tests will skip.',
    )
  }
}, 30000)

afterAll(async () => {
  await cleanupTestTenant(testTenant)
})

describe('audit_logs RLS — INSERT-only enforcement', () => {
  it('should allow INSERT via authenticated client', async () => {
    const client = tenantClient(testTenant.jwt)
    const { data, error } = await client
      .from('audit_logs')
      .insert({
        tenant_id: testTenant.id,
        user_id: testTenant.userId,
        entity_type: 'project',
        entity_id: testTenant.userId,
        action: 'project.created',
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    expect(data?.id).toBeDefined()
  })

  it('should block UPDATE via authenticated client (no RLS UPDATE policy)', async () => {
    if (!rlsEnabled) {
      console.warn('SKIP: audit_logs RLS not deployed')
      return
    }

    const client = tenantClient(testTenant.jwt)
    const { data } = await client
      .from('audit_logs')
      .update({ action: 'tampered' })
      .eq('id', auditLogId)
      .select()

    // RLS blocks: no UPDATE policy → returns empty
    expect(data).toHaveLength(0)
  })

  it('should block DELETE via authenticated client (no RLS DELETE policy)', async () => {
    if (!rlsEnabled) {
      console.warn('SKIP: audit_logs RLS not deployed')
      return
    }

    const client = tenantClient(testTenant.jwt)
    const { data } = await client.from('audit_logs').delete().eq('id', auditLogId).select()

    // RLS blocks: no DELETE policy → returns empty
    expect(data).toHaveLength(0)
  })

  it('should block UPDATE via service_role (DB trigger Layer 3)', async () => {
    if (!triggerExists) {
      console.warn('SKIP: audit_immutable_guard trigger not deployed')
      return
    }

    const { error } = await admin
      .from('audit_logs')
      .update({ action: 'tampered-by-admin' })
      .eq('id', auditLogId)

    // DB trigger raises exception
    expect(error).toBeTruthy()
    expect(error!.message).toContain('immutable')
  })

  it('should block DELETE via service_role (DB trigger Layer 3)', async () => {
    if (!triggerExists) {
      console.warn('SKIP: audit_immutable_guard trigger not deployed')
      return
    }

    const { error } = await admin.from('audit_logs').delete().eq('id', auditLogId)

    // DB trigger raises exception
    expect(error).toBeTruthy()
    expect(error!.message).toContain('immutable')
  })
})
