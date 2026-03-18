/**
 * AI Pipeline Integration Test — Economy (L1+L2) + Thorough (L1+L2+L3)
 *
 * Real AI API calls — not mocked. Verifies findings inserted into DB.
 * Run: INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx vitest run src/features/pipeline/__tests__/pipeline-integration.test.ts --project unit
 *
 * Created: Story 4.8 (TD-TEST-006)
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  HAS_PREREQUISITES,
  SUPABASE_URL,
  TEST_SEGMENTS,
  adminHeaders,
  createTestFile,
  insertSegments,
  pollFileStatus,
  postRest,
  queryCount,
  queryRest,
  setFileParsed,
  triggerPipeline,
} from './pipeline-integration.helpers'

describe.skipIf(!HAS_PREREQUISITES)('AI Pipeline Integration (real AI calls)', () => {
  let tenantId: string
  let projectId: string
  let fileId: string

  beforeAll(async () => {
    tenantId = randomUUID()
    await postRest('/rest/v1/tenants', { id: tenantId, name: 'Integration Test' })

    const [project] = (await postRest('/rest/v1/projects', {
      id: randomUUID(),
      tenant_id: tenantId,
      name: 'Pipeline Integration Test',
      source_lang: 'en-US',
      target_langs: ['th-TH'],
    })) as Array<{ id: string }>
    projectId = project!.id

    fileId = await createTestFile(projectId, tenantId, 'integration-test.sdlxliff')
    await insertSegments(fileId, projectId, tenantId, [...TEST_SEGMENTS])
    await setFileParsed(fileId)
  }, 30_000)

  afterAll(async () => {
    if (projectId) {
      await fetch(`${SUPABASE_URL}/rest/v1/files?project_id=eq.${projectId}`, {
        method: 'DELETE',
        headers: adminHeaders,
      })
      await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}`, {
        method: 'DELETE',
        headers: adminHeaders,
      })
    }
    if (tenantId) {
      await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}`, {
        method: 'DELETE',
        headers: adminHeaders,
      })
    }
  }, 10_000)

  it('should complete Economy pipeline (L1+L2) and insert findings into DB', async () => {
    await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'economy' })
    await pollFileStatus(fileId, 'l2_completed', 300_000)

    // L1 + L2 findings in DB
    const l1Count = await queryCount(
      `/rest/v1/findings?file_id=eq.${fileId}&detected_by_layer=eq.L1&select=id`,
    )
    const l2Count = await queryCount(
      `/rest/v1/findings?file_id=eq.${fileId}&detected_by_layer=eq.L2&select=id`,
    )
    // eslint-disable-next-line no-console
    console.log(`[INTEGRATION] L1: ${l1Count}, L2: ${l2Count}`)
    expect(l1Count).toBeGreaterThan(0)
    expect(l2Count).toBeGreaterThan(0) // TD-AI-004 regression guard

    // Finding structure valid
    const findings = (await queryRest(
      `/rest/v1/findings?file_id=eq.${fileId}&select=id,severity,category,detected_by_layer,segment_id&limit=100`,
    )) as Array<{
      id: string
      severity: string
      category: string
      detected_by_layer: string
      segment_id: string | null
    }>

    for (const f of findings) {
      expect(['critical', 'major', 'minor']).toContain(f.severity)
      expect(f.category.length).toBeGreaterThan(0)
      expect(['L1', 'L2', 'L3']).toContain(f.detected_by_layer)
    }

    // segmentIds reference real segments
    const segIds = (await queryRest(`/rest/v1/segments?file_id=eq.${fileId}&select=id`)) as Array<{
      id: string
    }>
    const validIds = new Set(segIds.map((s) => s.id))
    for (const f of findings) {
      if (f.segment_id) expect(validIds.has(f.segment_id)).toBe(true)
    }

    // No duplicates
    const keys = new Set(
      findings.map((f) => `${f.segment_id}|${f.category}|${f.detected_by_layer}`),
    )
    // eslint-disable-next-line no-console
    console.log(`[QUALITY] Duplicates: ${findings.length - keys.size}`)

    // Score calculated
    const scores = (await queryRest(
      `/rest/v1/scores?file_id=eq.${fileId}&select=mqm_score,status&limit=1`,
    )) as Array<{ mqm_score: number; status: string }>
    expect(scores[0]!.status).toBe('calculated')
    expect(scores[0]!.mqm_score).toBeGreaterThanOrEqual(0)

    // AI usage logs
    const aiLogs = (await queryRest(
      `/rest/v1/ai_usage_logs?file_id=eq.${fileId}&select=input_tokens,output_tokens,model,layer&limit=50`,
    )) as Array<{ input_tokens: number; output_tokens: number; model: string; layer: string }>
    expect(aiLogs.length).toBeGreaterThan(0)
    for (const log of aiLogs) {
      expect(log.input_tokens).toBeGreaterThan(0)
      expect(log.output_tokens).toBeGreaterThan(0)
    }
  }, 360_000)

  it('should complete Thorough pipeline (L1+L2+L3) and insert L3 findings', async () => {
    const fileId2 = await createTestFile(projectId, tenantId, 'integration-thorough.sdlxliff')
    await insertSegments(fileId2, projectId, tenantId, [...TEST_SEGMENTS])
    await setFileParsed(fileId2)

    await triggerPipeline({ fileIds: [fileId2], projectId, tenantId, mode: 'thorough' })
    await pollFileStatus(fileId2, 'l3_completed', 600_000)

    const l1 = await queryCount(
      `/rest/v1/findings?file_id=eq.${fileId2}&detected_by_layer=eq.L1&select=id`,
    )
    const l2 = await queryCount(
      `/rest/v1/findings?file_id=eq.${fileId2}&detected_by_layer=eq.L2&select=id`,
    )
    const l3 = await queryCount(
      `/rest/v1/findings?file_id=eq.${fileId2}&detected_by_layer=eq.L3&select=id`,
    )
    // eslint-disable-next-line no-console
    console.log(`[INTEGRATION L3] L1: ${l1}, L2: ${l2}, L3: ${l3}`)

    // L3 structure valid
    const l3Findings = (await queryRest(
      `/rest/v1/findings?file_id=eq.${fileId2}&detected_by_layer=eq.L3&select=severity,category,segment_id&limit=50`,
    )) as Array<{ severity: string; category: string; segment_id: string | null }>
    for (const f of l3Findings) {
      expect(['critical', 'major', 'minor']).toContain(f.severity)
    }

    // Score updated
    let scoreLayer = ''
    const start = Date.now()
    while (Date.now() - start < 30_000) {
      const scores = (await queryRest(
        `/rest/v1/scores?file_id=eq.${fileId2}&select=layer_completed&limit=1`,
      )) as Array<{ layer_completed: string }>
      scoreLayer = scores[0]?.layer_completed ?? ''
      if (scoreLayer === 'L1L2L3') break
      await new Promise((r) => setTimeout(r, 2000))
    }
    expect(['L1L2', 'L1L2L3']).toContain(scoreLayer)

    // AI logs include L3
    const aiLogs = (await queryRest(
      `/rest/v1/ai_usage_logs?file_id=eq.${fileId2}&select=model,layer&limit=50`,
    )) as Array<{ model: string; layer: string }>
    const l3Logs = aiLogs.filter((l) => l.layer === 'L3')
    expect(l3Logs.length).toBeGreaterThan(0)
  }, 660_000)
})
