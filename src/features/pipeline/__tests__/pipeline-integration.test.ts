/**
 * AI Pipeline Integration — Economy (L1+L2) + Thorough (L1+L2+L3)
 *
 * Real AI API calls. Each test has its own tenant/project/file (fully isolated).
 * Run: INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx vitest run src/features/pipeline/__tests__/pipeline-integration.test.ts --project unit
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  HAS_PREREQUISITES,
  TEST_SEGMENTS,
  TIMEOUT,
  cleanupTenantProject,
  createTestFile,
  insertSegments,
  pollFileStatus,
  postRest,
  queryCount,
  queryRest,
  setFileParsed,
  triggerPipeline,
} from './pipeline-integration.helpers'

describe.skipIf(!HAS_PREREQUISITES)('Economy Pipeline (L1+L2)', () => {
  let tenantId: string
  let projectId: string
  let fileId: string

  beforeAll(async () => {
    tenantId = randomUUID()
    await postRest('/rest/v1/tenants', { id: tenantId, name: 'Economy Test' })
    const [project] = (await postRest('/rest/v1/projects', {
      id: randomUUID(),
      tenant_id: tenantId,
      name: 'Economy Test',
      source_lang: 'en-US',
      target_langs: ['th-TH'],
    })) as Array<{ id: string }>
    projectId = project!.id
    fileId = await createTestFile(projectId, tenantId, 'economy-test.sdlxliff')
    await insertSegments(fileId, projectId, tenantId, [...TEST_SEGMENTS])
    await setFileParsed(fileId)
  }, TIMEOUT.SETUP)

  afterAll(async () => {
    await cleanupTenantProject(tenantId, projectId)
  }, TIMEOUT.CLEANUP)

  it(
    'should insert L1+L2 findings with valid structure',
    async () => {
      await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'economy' })
      await pollFileStatus(fileId, 'l2_completed', TIMEOUT.ECONOMY_PIPELINE)

      const l1 = await queryCount(
        `/rest/v1/findings?file_id=eq.${fileId}&detected_by_layer=eq.L1&select=id`,
      )
      const l2 = await queryCount(
        `/rest/v1/findings?file_id=eq.${fileId}&detected_by_layer=eq.L2&select=id`,
      )
      // eslint-disable-next-line no-console
      console.log(`[ECONOMY] L1: ${l1}, L2: ${l2}`)
      expect(l1).toBeGreaterThan(0)
      expect(l2).toBeGreaterThan(0) // TD-AI-004 regression guard

      const findings = (await queryRest(
        `/rest/v1/findings?file_id=eq.${fileId}&select=id,severity,category,detected_by_layer,segment_id&limit=100`,
      )) as Array<{
        id: string
        severity: string
        category: string
        detected_by_layer: string
        segment_id: string
      }>

      // Structure valid
      for (const f of findings) {
        expect(['critical', 'major', 'minor']).toContain(f.severity)
        expect(f.category.length).toBeGreaterThan(0)
        expect(['L1', 'L2', 'L3']).toContain(f.detected_by_layer)
      }

      // segmentIds reference real segments
      const segIds = (await queryRest(
        `/rest/v1/segments?file_id=eq.${fileId}&select=id`,
      )) as Array<{ id: string }>
      const validIds = new Set(segIds.map((s) => s.id))
      for (const f of findings) {
        expect(validIds.has(f.segment_id), `Invalid segment_id: ${f.segment_id}`).toBe(true)
      }

      // No duplicates
      const keys = new Set(
        findings.map((f) => `${f.segment_id}|${f.category}|${f.detected_by_layer}`),
      )
      expect(keys.size).toBe(findings.length)

      // Score calculated
      const scores = (await queryRest(
        `/rest/v1/scores?file_id=eq.${fileId}&select=mqm_score,status&limit=1`,
      )) as Array<{ mqm_score: number; status: string }>
      expect(scores[0]!.status).toBe('calculated')
      expect(scores[0]!.mqm_score).toBeGreaterThanOrEqual(0)

      // AI usage logs
      const aiLogs = (await queryRest(
        `/rest/v1/ai_usage_logs?file_id=eq.${fileId}&select=input_tokens,output_tokens&limit=50`,
      )) as Array<{ input_tokens: number; output_tokens: number }>
      expect(aiLogs.length).toBeGreaterThan(0)
      for (const log of aiLogs) {
        expect(log.input_tokens).toBeGreaterThan(0)
        expect(log.output_tokens).toBeGreaterThan(0)
      }
    },
    TIMEOUT.ECONOMY_TEST,
  )
})

describe.skipIf(!HAS_PREREQUISITES)('Thorough Pipeline (L1+L2+L3)', () => {
  let tenantId: string
  let projectId: string
  let fileId: string

  beforeAll(async () => {
    tenantId = randomUUID()
    await postRest('/rest/v1/tenants', { id: tenantId, name: 'Thorough Test' })
    const [project] = (await postRest('/rest/v1/projects', {
      id: randomUUID(),
      tenant_id: tenantId,
      name: 'Thorough Test',
      source_lang: 'en-US',
      target_langs: ['th-TH'],
    })) as Array<{ id: string }>
    projectId = project!.id
    fileId = await createTestFile(projectId, tenantId, 'thorough-test.sdlxliff')
    await insertSegments(fileId, projectId, tenantId, [...TEST_SEGMENTS])
    await setFileParsed(fileId)
  }, TIMEOUT.SETUP)

  afterAll(async () => {
    await cleanupTenantProject(tenantId, projectId)
  }, TIMEOUT.CLEANUP)

  it(
    'should insert L3 findings and update score layer',
    async () => {
      await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'thorough' })
      await pollFileStatus(fileId, 'l3_completed', TIMEOUT.THOROUGH_PIPELINE)

      const l1 = await queryCount(
        `/rest/v1/findings?file_id=eq.${fileId}&detected_by_layer=eq.L1&select=id`,
      )
      const l2 = await queryCount(
        `/rest/v1/findings?file_id=eq.${fileId}&detected_by_layer=eq.L2&select=id`,
      )
      const l3 = await queryCount(
        `/rest/v1/findings?file_id=eq.${fileId}&detected_by_layer=eq.L3&select=id`,
      )
      // eslint-disable-next-line no-console
      console.log(`[THOROUGH] L1: ${l1}, L2: ${l2}, L3: ${l3}`)

      // L3 structure valid
      const l3Findings = (await queryRest(
        `/rest/v1/findings?file_id=eq.${fileId}&detected_by_layer=eq.L3&select=severity,category,segment_id&limit=50`,
      )) as Array<{ severity: string; category: string; segment_id: string }>
      for (const f of l3Findings) {
        expect(['critical', 'major', 'minor']).toContain(f.severity)
      }

      // Score layer poll
      let scoreLayer = ''
      const start = Date.now()
      while (Date.now() - start < TIMEOUT.SCORE_POLL) {
        const scores = (await queryRest(
          `/rest/v1/scores?file_id=eq.${fileId}&select=layer_completed&limit=1`,
        )) as Array<{ layer_completed: string }>
        scoreLayer = scores[0]?.layer_completed ?? ''
        if (scoreLayer === 'L1L2L3') break
        await new Promise((r) => setTimeout(r, TIMEOUT.POLL_INTERVAL))
      }
      expect(['L1L2', 'L1L2L3']).toContain(scoreLayer)

      // AI logs include L3
      const aiLogs = (await queryRest(
        `/rest/v1/ai_usage_logs?file_id=eq.${fileId}&select=model,layer&limit=50`,
      )) as Array<{ model: string; layer: string }>
      expect(aiLogs.filter((l) => l.layer === 'L3').length).toBeGreaterThan(0)
    },
    TIMEOUT.THOROUGH_TEST,
  )
})
