/**
 * RLS Tests: back_translation_cache table — cross-tenant isolation
 *
 * Guardrail #71: RLS test mandatory for every new Epic 5 table.
 * Run with: `npm run test:rls`
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { admin, type TestTenant, cleanupTestTenant, setupTestTenant, tenantClient } from './helpers'

let tenantA: TestTenant & { projectId: string; fileId: string; segmentId: string }
let tenantB: TestTenant

beforeAll(async () => {
  const a = await setupTestTenant('rls-btcache-a@test.local')
  const b = await setupTestTenant('rls-btcache-b@test.local')

  // Create project → file → segment for Tenant A
  const { data: project } = await admin
    .from('projects')
    .insert({
      tenant_id: a.id,
      name: 'BT Cache Test',
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
      storage_path: '/test-bt.xliff',
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

  // Insert a back-translation cache entry for Tenant A
  await admin.from('back_translation_cache').insert({
    segment_id: segment!.id,
    tenant_id: a.id,
    language_pair: 'en→th',
    model_version: 'gpt-4o-mini-bt-v1',
    target_text_hash: 'a'.repeat(64),
    back_translation: 'Hello',
    contextual_explanation: 'A greeting',
    confidence: 0.9,
    language_notes: [],
    input_tokens: 100,
    output_tokens: 50,
    estimated_cost_usd: 0.0001,
  })

  tenantA = { ...a, projectId: project!.id, fileId: file!.id, segmentId: segment!.id }
  tenantB = b
}, 30000)

afterAll(async () => {
  // Clean cache entries first (FK restrict on tenants)
  await admin.from('back_translation_cache').delete().eq('tenant_id', tenantA.id)
  await cleanupTestTenant(tenantA)
  await cleanupTestTenant(tenantB)
}, 30_000)

describe('back_translation_cache RLS', () => {
  it('should allow Tenant A to see their own cache entries', async () => {
    const clientA = tenantClient(tenantA.jwt)
    const { data } = await clientA.from('back_translation_cache').select('back_translation')

    expect(data).toHaveLength(1)
    expect(data?.[0]?.back_translation).toBe('Hello')
  })

  it('should prevent Tenant B from seeing Tenant A cache entries', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { data } = await clientB.from('back_translation_cache').select('*')

    expect(data).toHaveLength(0)
  })

  it('should prevent Tenant B from inserting cache entries with Tenant A tenant_id', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { error } = await clientB.from('back_translation_cache').insert({
      segment_id: tenantA.segmentId,
      tenant_id: tenantA.id, // Tenant B trying to use Tenant A's ID
      language_pair: 'en→th',
      model_version: 'gpt-4o-mini-bt-v1',
      target_text_hash: 'b'.repeat(64),
      back_translation: 'Injected',
      contextual_explanation: 'Injected',
      confidence: 0.5,
      language_notes: [],
      input_tokens: 50,
      output_tokens: 25,
      estimated_cost_usd: 0.00005,
    })

    expect(error).toBeTruthy()
  })

  it('should prevent Tenant B from deleting Tenant A cache entries', async () => {
    const clientB = tenantClient(tenantB.jwt)
    const { data } = await clientB
      .from('back_translation_cache')
      .delete()
      .eq('tenant_id', tenantA.id)
      .select('id')

    // Should delete nothing (RLS blocks it)
    expect(data).toHaveLength(0)
  })
})
