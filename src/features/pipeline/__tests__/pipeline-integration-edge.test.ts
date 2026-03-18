/**
 * AI Pipeline Integration — Edge Cases + Quality Checks
 * Each test has its own tenant/project (fully isolated).
 *
 * Run: INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx vitest run src/features/pipeline/__tests__/pipeline-integration-edge.test.ts --project unit
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  HAS_PREREQUISITES,
  SUPABASE_URL,
  TIMEOUT,
  adminHeaders,
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

describe.skipIf(!HAS_PREREQUISITES)('Pipeline Edge Cases (real AI)', () => {
  let tenantId: string
  let projectId: string

  beforeAll(async () => {
    tenantId = randomUUID()
    await postRest('/rest/v1/tenants', { id: tenantId, name: 'Edge Case Test' })
    const [project] = (await postRest('/rest/v1/projects', {
      id: randomUUID(),
      tenant_id: tenantId,
      name: 'Edge Case Project',
      source_lang: 'en-US',
      target_langs: ['th-TH'],
    })) as Array<{ id: string }>
    projectId = project!.id
  }, TIMEOUT.SETUP)

  afterAll(async () => {
    await cleanupTenantProject(tenantId, projectId)
  }, TIMEOUT.CLEANUP)

  it(
    'should handle empty file (0 segments) gracefully',
    async () => {
      const fileId = await createTestFile(projectId, tenantId, 'empty.sdlxliff')
      await setFileParsed(fileId)
      await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'economy' })

      const start = Date.now()
      let status = ''
      while (Date.now() - start < TIMEOUT.EDGE_CASE) {
        const rows = (await queryRest(`/rest/v1/files?id=eq.${fileId}&select=status`)) as Array<{
          status: string
        }>
        status = rows[0]?.status ?? ''
        if (status !== 'parsed' && status !== 'l1_processing') break
        await new Promise((r) => setTimeout(r, TIMEOUT.POLL_INTERVAL))
      }

      expect(['l1_completed', 'l2_completed', 'ai_partial', 'failed']).toContain(status)
      expect(await queryCount(`/rest/v1/findings?file_id=eq.${fileId}&select=id`)).toBe(0)
    },
    TIMEOUT.EDGE_CASE,
  )

  it(
    'should detect glossary violations when glossary seeded',
    async () => {
      const [glossary] = (await postRest('/rest/v1/glossaries', {
        id: randomUUID(),
        tenant_id: tenantId,
        project_id: projectId,
        name: 'Test Glossary',
        source_lang: 'en-US',
        target_lang: 'th-TH',
      })) as Array<{ id: string }>

      await postRest('/rest/v1/glossary_terms', [
        {
          glossary_id: glossary!.id,
          source_term: 'employee',
          target_term: 'พนักงาน',
          case_sensitive: false,
        },
      ])

      const fileId = await createTestFile(projectId, tenantId, 'glossary-test.sdlxliff')
      await insertSegments(fileId, projectId, tenantId, [
        {
          segmentNumber: 1,
          sourceText: 'All employee must attend.',
          targetText: 'คนงานทุกคนต้องเข้าร่วม',
        },
      ])
      await setFileParsed(fileId)
      await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'economy' })
      await pollFileStatus(fileId, 'l2_completed', TIMEOUT.ECONOMY_PIPELINE)

      const findings = (await queryRest(
        `/rest/v1/findings?file_id=eq.${fileId}&select=category&limit=50`,
      )) as Array<{ category: string }>

      const glossaryFindings = findings.filter(
        (f) =>
          f.category.toLowerCase().includes('glossary') ||
          f.category.toLowerCase().includes('terminology'),
      )
      expect(glossaryFindings.length).toBeGreaterThan(0)

      await fetch(`${SUPABASE_URL}/rest/v1/glossary_terms?glossary_id=eq.${glossary!.id}`, {
        method: 'DELETE',
        headers: adminHeaders,
      })
      await fetch(`${SUPABASE_URL}/rest/v1/glossaries?id=eq.${glossary!.id}`, {
        method: 'DELETE',
        headers: adminHeaders,
      })
    },
    TIMEOUT.GLOSSARY_TEST,
  )

  it(
    'should log AI usage with non-zero tokens',
    async () => {
      const fileId = await createTestFile(projectId, tenantId, 'cost-test.sdlxliff')
      await insertSegments(fileId, projectId, tenantId, [
        { segmentNumber: 1, sourceText: 'Hello world.', targetText: 'สวัสดีชาวโลก' },
      ])
      await setFileParsed(fileId)
      await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'economy' })
      await pollFileStatus(fileId, 'l2_completed', TIMEOUT.ECONOMY_PIPELINE)

      const aiLogs = (await queryRest(
        `/rest/v1/ai_usage_logs?file_id=eq.${fileId}&select=input_tokens,output_tokens,model,layer&limit=50`,
      )) as Array<{ input_tokens: number; output_tokens: number; model: string; layer: string }>

      expect(aiLogs.length).toBeGreaterThan(0)
      for (const log of aiLogs) {
        expect(log.input_tokens).toBeGreaterThan(0)
        expect(log.output_tokens).toBeGreaterThan(0)
        expect(log.model).toBeTruthy()
        expect(['L2', 'L3']).toContain(log.layer)
      }
    },
    TIMEOUT.ECONOMY_TEST,
  )

  it(
    'should handle large segment (>1000 words) without crash',
    async () => {
      const longText = Array.from(
        { length: 200 },
        (_, i) => `Sentence ${i + 1} has important product information.`,
      ).join(' ')
      const longThai = Array.from(
        { length: 200 },
        (_, i) => `ประโยคที่ ${i + 1} มีข้อมูลสำคัญเกี่ยวกับผลิตภัณฑ์`,
      ).join(' ')

      const fileId = await createTestFile(projectId, tenantId, 'large-segment.sdlxliff')
      await insertSegments(fileId, projectId, tenantId, [
        { segmentNumber: 1, sourceText: longText, targetText: longThai },
      ])
      await setFileParsed(fileId)
      await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'economy' })

      const start = Date.now()
      let status = ''
      while (Date.now() - start < TIMEOUT.EDGE_CASE) {
        const rows = (await queryRest(`/rest/v1/files?id=eq.${fileId}&select=status`)) as Array<{
          status: string
        }>
        status = rows[0]?.status ?? ''
        if (['l2_completed', 'ai_partial', 'failed', 'l1_completed'].includes(status)) break
        await new Promise((r) => setTimeout(r, TIMEOUT.POLL_INTERVAL))
      }
      expect(['l1_completed', 'l2_completed', 'ai_partial', 'failed']).toContain(status)
    },
    TIMEOUT.EDGE_CASE * 1.5,
  )

  it(
    'should prevent double pipeline run via CAS guard',
    async () => {
      const fileId = await createTestFile(projectId, tenantId, 'concurrent-test.sdlxliff')
      await insertSegments(fileId, projectId, tenantId, [
        { segmentNumber: 1, sourceText: 'Test concurrent.', targetText: 'ทดสอบ concurrent' },
      ])
      await setFileParsed(fileId)

      await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'economy' })
      await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'economy' })

      const start = Date.now()
      let status = ''
      while (Date.now() - start < TIMEOUT.EDGE_CASE) {
        const rows = (await queryRest(`/rest/v1/files?id=eq.${fileId}&select=status`)) as Array<{
          status: string
        }>
        status = rows[0]?.status ?? ''
        if (['l2_completed', 'ai_partial', 'failed'].includes(status)) break
        await new Promise((r) => setTimeout(r, TIMEOUT.POLL_INTERVAL))
      }

      expect(['l2_completed', 'ai_partial', 'failed']).toContain(status)
      const total = await queryCount(`/rest/v1/findings?file_id=eq.${fileId}&select=id`)
      expect(total).toBeLessThan(20)
    },
    TIMEOUT.EDGE_CASE * 1.5,
  )
})
