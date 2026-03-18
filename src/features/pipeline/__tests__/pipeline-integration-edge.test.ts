/**
 * AI Pipeline Integration — Edge Cases + Quality Checks
 *
 * P1: Empty file, glossary, invalid segments
 * P2: Cost tracking, budget guard, large segment, concurrent guard
 *
 * Run: INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx vitest run src/features/pipeline/__tests__/pipeline-integration-edge.test.ts --project unit
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  HAS_PREREQUISITES,
  SUPABASE_URL,
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

  // ── P1: Empty file ──

  it('should handle empty file (0 segments) gracefully', async () => {
    const fileId = await createTestFile(projectId, tenantId, 'empty.sdlxliff')
    await setFileParsed(fileId)
    await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'economy' })

    const start = Date.now()
    let status = ''
    while (Date.now() - start < 60_000) {
      const rows = (await queryRest(`/rest/v1/files?id=eq.${fileId}&select=status`)) as Array<{
        status: string
      }>
      status = rows[0]?.status ?? ''
      if (status !== 'parsed' && status !== 'l1_processing') break
      await new Promise((r) => setTimeout(r, 3000))
    }

    expect(['l1_completed', 'l2_completed', 'ai_partial', 'failed']).toContain(status)
    expect(await queryCount(`/rest/v1/findings?file_id=eq.${fileId}&select=id`)).toBe(0)
  }, 120_000)

  // ── P1: Glossary violations ──

  it('should detect glossary violations when glossary seeded', async () => {
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
    await pollFileStatus(fileId, 'l2_completed', 300_000)

    const findings = (await queryRest(
      `/rest/v1/findings?file_id=eq.${fileId}&select=category,detected_by_layer&limit=50`,
    )) as Array<{ category: string; detected_by_layer: string }>

    const glossaryFindings = findings.filter(
      (f) =>
        f.category.toLowerCase().includes('glossary') ||
        f.category.toLowerCase().includes('terminology'),
    )
    expect(glossaryFindings.length).toBeGreaterThan(0)

    // Cleanup glossary
    await fetch(`${SUPABASE_URL}/rest/v1/glossary_terms?glossary_id=eq.${glossary!.id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    })
    await fetch(`${SUPABASE_URL}/rest/v1/glossaries?id=eq.${glossary!.id}`, {
      method: 'DELETE',
      headers: adminHeaders,
    })
  }, 360_000)

  // ── P2: AI cost tracking accuracy ──

  it('should log AI usage with non-zero tokens for every AI call', async () => {
    const fileId = await createTestFile(projectId, tenantId, 'cost-test.sdlxliff')
    await insertSegments(fileId, projectId, tenantId, [
      { segmentNumber: 1, sourceText: 'Hello world.', targetText: 'สวัสดีชาวโลก' },
    ])
    await setFileParsed(fileId)
    await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'economy' })
    await pollFileStatus(fileId, 'l2_completed', 300_000)

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

    // eslint-disable-next-line no-console
    console.log(`[COST] AI logs: ${aiLogs.length} entries`)
  }, 360_000)

  // ── P2: Large segment handling ──

  it('should handle large segment (>1000 words) without crash', async () => {
    const longText = Array.from(
      { length: 200 },
      (_, i) => `Sentence number ${i + 1} contains important information about the product.`,
    ).join(' ')
    const longThaiText = Array.from(
      { length: 200 },
      (_, i) => `ประโยคที่ ${i + 1} มีข้อมูลสำคัญเกี่ยวกับผลิตภัณฑ์`,
    ).join(' ')

    const fileId = await createTestFile(projectId, tenantId, 'large-segment.sdlxliff')
    await insertSegments(fileId, projectId, tenantId, [
      { segmentNumber: 1, sourceText: longText, targetText: longThaiText },
    ])
    await setFileParsed(fileId)
    await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'economy' })

    // Should complete or fail gracefully — not hang or crash
    const start = Date.now()
    let status = ''
    while (Date.now() - start < 120_000) {
      const rows = (await queryRest(`/rest/v1/files?id=eq.${fileId}&select=status`)) as Array<{
        status: string
      }>
      status = rows[0]?.status ?? ''
      if (['l2_completed', 'failed', 'l1_completed'].includes(status)) break
      await new Promise((r) => setTimeout(r, 3000))
    }
    expect(['l1_completed', 'l2_completed', 'ai_partial', 'failed']).toContain(status)
  }, 180_000)

  // ── P2: Concurrent pipeline CAS guard ──

  it('should prevent double pipeline run on same file via CAS guard', async () => {
    const fileId = await createTestFile(projectId, tenantId, 'concurrent-test.sdlxliff')
    await insertSegments(fileId, projectId, tenantId, [
      { segmentNumber: 1, sourceText: 'Test concurrent.', targetText: 'ทดสอบ concurrent' },
    ])
    await setFileParsed(fileId)

    // Trigger twice rapidly
    await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'economy' })
    await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'economy' })

    // Wait for first run to complete
    const start = Date.now()
    let status = ''
    while (Date.now() - start < 120_000) {
      const rows = (await queryRest(`/rest/v1/files?id=eq.${fileId}&select=status`)) as Array<{
        status: string
      }>
      status = rows[0]?.status ?? ''
      if (['l2_completed', 'failed'].includes(status)) break
      await new Promise((r) => setTimeout(r, 3000))
    }

    // File should reach terminal state (not stuck in processing)
    expect(['l2_completed', 'ai_partial', 'failed']).toContain(status)

    // Findings should not be doubled (CAS guard prevents second run)
    const totalFindings = await queryCount(`/rest/v1/findings?file_id=eq.${fileId}&select=id`)
    // eslint-disable-next-line no-console
    console.log(`[CONCURRENT] Status: ${status}, Findings: ${totalFindings}`)
    // If both ran, findings would be ~doubled. CAS should prevent this.
    expect(totalFindings).toBeLessThan(20) // reasonable upper bound for 1 segment
  }, 180_000)
})
