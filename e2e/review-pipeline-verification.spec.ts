/**
 * Story 4.8 — AC6: Pipeline Verification (L1 + L2 + L3)
 *
 * Run: INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx playwright test e2e/review-pipeline-verification.spec.ts
 *
 * Prerequisites: Supabase + Inngest dev server + Next.js dev server + API keys (OpenAI + Anthropic)
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { test, expect } from '@playwright/test'

import { cleanupTestProject, pollFileStatus } from './helpers/pipeline-admin'
import {
  SUPABASE_URL,
  adminHeaders,
  signupOrLogin,
  getUserInfo,
  setUserMetadata,
  createTestProject,
} from './helpers/supabase-admin'

const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// ── Helpers ─────────────────────────────────────────────────────────────────

async function postRest(path: string, body: unknown): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`)
  return (await res.json()) as unknown[]
}

async function queryRest(path: string): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}${path}`, { headers: adminHeaders() })
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`)
  return (await res.json()) as unknown[]
}

async function setupFileAndSegments(opts: {
  projectId: string
  tenantId: string
}): Promise<string> {
  const sdlxliffPath = join(
    process.cwd(),
    'docs/test-data/verification-baseline/verification-500.sdlxliff',
  )
  const sdlxliffContent = readFileSync(sdlxliffPath)
  const storagePath = `${opts.tenantId}/${opts.projectId}/verification-500-${Date.now()}.sdlxliff`

  await fetch(`${SUPABASE_URL}/storage/v1/object/project-files/${storagePath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: ANON_KEY,
      'Content-Type': 'application/xml',
    },
    body: sdlxliffContent,
  })

  const [file] = (await postRest('/rest/v1/files', {
    project_id: opts.projectId,
    tenant_id: opts.tenantId,
    file_name: `verification-500-${Date.now()}.sdlxliff`,
    file_type: 'sdlxliff',
    file_size_bytes: sdlxliffContent.length,
    file_hash: crypto.randomUUID().replace(/-/g, ''),
    storage_path: storagePath,
    status: 'uploaded',
  })) as Array<{ id: string }>
  const fileId = file!.id

  // Parse + insert segments
  const sdlxliffText = readFileSync(sdlxliffPath, 'utf-8')
  const segmentBodies: unknown[] = []
  for (let i = 1; i <= 500; i++) {
    const tuRegex = new RegExp(
      `<trans-unit id="tu-${i}">.*?<seg-source>\\s*<mrk[^>]*>(.*?)</mrk>.*?<target>\\s*<mrk[^>]*>(.*?)</mrk>`,
      's',
    )
    const match = sdlxliffText.match(tuRegex)
    if (match) {
      const decode = (s: string) =>
        s
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
      segmentBodies.push({
        file_id: fileId,
        project_id: opts.projectId,
        tenant_id: opts.tenantId,
        segment_number: i,
        source_text: decode(match[1]!),
        target_text: decode(match[2]!),
        source_lang: 'en-US',
        target_lang: 'th-TH',
        word_count: 20,
      })
    }
  }

  for (let b = 0; b < segmentBodies.length; b += 50) {
    await fetch(`${SUPABASE_URL}/rest/v1/segments`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify(segmentBodies.slice(b, b + 50)),
    })
  }

  await fetch(`${SUPABASE_URL}/rest/v1/files?id=eq.${fileId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'parsed' }),
  })

  return fileId
}

async function triggerPipeline(opts: {
  fileId: string
  projectId: string
  tenantId: string
  userId: string
  mode: 'economy' | 'thorough'
}) {
  const batchId = crypto.randomUUID()
  await fetch(`${INNGEST_DEV_URL}/e/${ANON_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'pipeline.batch-started',
      data: {
        batchId,
        fileIds: [opts.fileId],
        projectId: opts.projectId,
        tenantId: opts.tenantId,
        userId: opts.userId,
        mode: opts.mode,
        uploadBatchId: batchId,
      },
    }),
  })
}

type FindingRow = { id: string; segment_id: string; detected_by_layer: string }
type SegmentRow = { id: string; segment_number: number }

async function getFindings(fileId: string): Promise<FindingRow[]> {
  return (await queryRest(
    `/rest/v1/findings?file_id=eq.${fileId}&select=id,segment_id,detected_by_layer&limit=2000`,
  )) as FindingRow[]
}

async function getSegmentMap(fileId: string): Promise<Map<string, number>> {
  const segments = (await queryRest(
    `/rest/v1/segments?file_id=eq.${fileId}&select=id,segment_number&limit=1000`,
  )) as SegmentRow[]
  return new Map(segments.map((s) => [s.id, s.segment_number]))
}

function loadBaseline(): Set<number> {
  const annotationsPath = join(
    process.cwd(),
    'docs/test-data/verification-baseline/baseline-annotations.json',
  )
  const annotations = JSON.parse(readFileSync(annotationsPath, 'utf-8')) as {
    segments: Record<string, unknown>
  }
  return new Set(Object.keys(annotations.segments).map(Number))
}

// ── Economy Mode (L1 + L2) ──────────────────────────────────────────────────

test.describe.serial('Pipeline — Economy Mode (L1 + L2)', () => {
  test.skip(
    !process.env.INNGEST_DEV_URL,
    'Requires Inngest dev server (set INNGEST_DEV_URL=http://localhost:8288 to enable)',
  )

  let tenantId: string
  let projectId: string
  let fileId: string
  let userId: string
  let testEmail: string
  let pipelineStartTime: number

  test.setTimeout(600_000)

  test('[setup] signup, upload, trigger Economy pipeline', async ({ page }) => {
    test.setTimeout(420_000)
    testEmail = `pipeline-eco-${Date.now()}@test.local`
    await signupOrLogin(page, testEmail, 'TestPass123!')
    await setUserMetadata(testEmail, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })
    const user = await getUserInfo(testEmail)
    if (!user) throw new Error('User not found')
    userId = user.id
    tenantId = user.tenantId
    projectId = await createTestProject(tenantId, 'Economy Pipeline Verify')

    fileId = await setupFileAndSegments({ projectId, tenantId })
    pipelineStartTime = Date.now()
    await triggerPipeline({ fileId, projectId, tenantId, userId, mode: 'economy' })
    await pollFileStatus(fileId, 'l2_completed', 300_000)
  })

  test.afterAll(async () => {
    if (projectId && tenantId) {
      await cleanupTestProject(projectId, tenantId)
    }
  })

  test('L1 findings exist', async () => {
    const findings = await getFindings(fileId)
    const l1 = findings.filter((f) => f.detected_by_layer === 'L1')
    // eslint-disable-next-line no-console
    console.log(`[PIPELINE] L1 findings: ${l1.length}`)
    expect(l1.length).toBeGreaterThan(0)
  })

  test('L2 findings exist', async () => {
    const findings = await getFindings(fileId)
    const l2 = findings.filter((f) => f.detected_by_layer === 'L2')
    // eslint-disable-next-line no-console
    console.log(`[PIPELINE] L2 findings: ${l2.length}`)
    expect(l2.length).toBeGreaterThan(0)
  })

  test('Precision >= 60% (AC6)', async () => {
    const findings = await getFindings(fileId)
    const segMap = await getSegmentMap(fileId)
    const baselineSet = loadBaseline()

    let tp = 0
    let fp = 0
    for (const f of findings) {
      const segNum = segMap.get(f.segment_id)
      if (segNum && baselineSet.has(segNum)) tp++
      else fp++
    }
    const precision = tp / (tp + fp) || 0
    // eslint-disable-next-line no-console
    console.log(`[PIPELINE] Precision: ${(precision * 100).toFixed(1)}% (TP=${tp}, FP=${fp})`)
    expect(precision).toBeGreaterThanOrEqual(0.6)
  })

  test('Recall >= 50% (AC6)', async () => {
    const findings = await getFindings(fileId)
    const segMap = await getSegmentMap(fileId)
    const baselineSet = loadBaseline()

    const matched = new Set<number>()
    for (const f of findings) {
      const segNum = segMap.get(f.segment_id)
      if (segNum && baselineSet.has(segNum)) matched.add(segNum)
    }
    const fn = baselineSet.size - matched.size
    const recall = matched.size / (matched.size + fn) || 0
    // eslint-disable-next-line no-console
    console.log(
      `[PIPELINE] Recall: ${(recall * 100).toFixed(1)}% (matched=${matched.size}, FN=${fn})`,
    )
    // L2 detects ~3/33 semantic issues — prompt quality, Epic 9 tuning scope
    expect(recall).toBeGreaterThanOrEqual(0.5)
  })

  test('Economy pipeline < 5 minutes (AC6)', async () => {
    const elapsed = Date.now() - pipelineStartTime
    // eslint-disable-next-line no-console
    console.log(`[PIPELINE] Economy time: ${(elapsed / 1000).toFixed(1)}s`)
    expect(elapsed).toBeLessThan(300_000)
  })
})

// ── Thorough Mode (L1 + L2 + L3) ───────────────────────────────────────────

test.describe.serial('Pipeline — Thorough Mode (L1 + L2 + L3)', () => {
  test.skip(
    !process.env.INNGEST_DEV_URL,
    'Requires Inngest dev server (set INNGEST_DEV_URL=http://localhost:8288 to enable)',
  )

  let tenantId: string
  let projectId: string
  let fileId: string
  let userId: string
  let testEmail: string
  let pipelineStartTime: number

  test.setTimeout(900_000) // 15 min — L3 adds significant time

  test('[setup] signup, upload, trigger Thorough pipeline', async ({ page }) => {
    test.setTimeout(720_000) // 12 min setup
    testEmail = `pipeline-thorough-${Date.now()}@test.local`
    await signupOrLogin(page, testEmail, 'TestPass123!')
    await setUserMetadata(testEmail, {
      setup_tour_completed: '2026-01-01T00:00:00Z',
      project_tour_completed: '2026-01-01T00:00:00Z',
    })
    const user = await getUserInfo(testEmail)
    if (!user) throw new Error('User not found')
    userId = user.id
    tenantId = user.tenantId
    projectId = await createTestProject(tenantId, 'Thorough Pipeline Verify')

    fileId = await setupFileAndSegments({ projectId, tenantId })
    pipelineStartTime = Date.now()
    await triggerPipeline({ fileId, projectId, tenantId, userId, mode: 'thorough' })
    await pollFileStatus(fileId, 'l3_completed', 600_000) // 10 min timeout for L3
  })

  test.afterAll(async () => {
    if (projectId && tenantId) {
      await cleanupTestProject(projectId, tenantId)
    }
  })

  test('L1 findings exist', async () => {
    const findings = await getFindings(fileId)
    const l1 = findings.filter((f) => f.detected_by_layer === 'L1')
    // eslint-disable-next-line no-console
    console.log(`[PIPELINE] L1 findings: ${l1.length}`)
    expect(l1.length).toBeGreaterThan(0)
  })

  test('L2 findings exist', async () => {
    const findings = await getFindings(fileId)
    const l2 = findings.filter((f) => f.detected_by_layer === 'L2')
    // eslint-disable-next-line no-console
    console.log(`[PIPELINE] L2 findings: ${l2.length}`)
    expect(l2.length).toBeGreaterThan(0)
  })

  test('L3 API call succeeded + findings processed', async () => {
    // L3 may produce 0 unique findings (all deduped with L2) — that's valid.
    // But the API call must succeed (status != 'error', tokens > 0).
    const logs = (await queryRest(
      `/rest/v1/ai_usage_logs?file_id=eq.${fileId}&layer=eq.L3&select=status,input_tokens,output_tokens&limit=10`,
    )) as Array<{ status: string; input_tokens: number; output_tokens: number }>

    // eslint-disable-next-line no-console
    console.log(`[PIPELINE] L3 ai_usage_logs: ${logs.length} entries`)
    for (const l of logs) {
      // eslint-disable-next-line no-console
      console.log(`  L3 ${l.status} ${l.input_tokens}+${l.output_tokens} tokens`)
    }

    expect(logs.length).toBeGreaterThan(0)
    const successLogs = logs.filter((l) => l.status === 'success')
    expect(successLogs.length).toBeGreaterThan(0)

    const findings = await getFindings(fileId)
    const l3 = findings.filter((f) => f.detected_by_layer === 'L3')
    // eslint-disable-next-line no-console
    console.log(`[PIPELINE] L3 findings: ${l3.length} (0 is valid if all deduped with L2)`)
  })

  test('L3 deduplication — no duplicate segment+category across L2/L3 (AC6)', async () => {
    const findings = (await queryRest(
      `/rest/v1/findings?file_id=eq.${fileId}&select=segment_id,category,detected_by_layer&limit=2000`,
    )) as Array<{ segment_id: string; category: string; detected_by_layer: string }>

    // Group by segment_id + category
    const groups = new Map<string, Set<string>>()
    for (const f of findings) {
      const key = `${f.segment_id}:${f.category}`
      if (!groups.has(key)) groups.set(key, new Set())
      groups.get(key)!.add(f.detected_by_layer)
    }

    // Check for duplicates: same segment+category has both L2 and L3
    let duplicates = 0
    for (const [key, layers] of groups) {
      if (layers.has('L2') && layers.has('L3')) {
        duplicates++
        // eslint-disable-next-line no-console
        console.log(`[PIPELINE] Duplicate: ${key} layers=${[...layers].join(',')}`)
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[PIPELINE] L2/L3 duplicates: ${duplicates}`)
    expect(duplicates).toBe(0)
  })

  test('Thorough pipeline < 10 minutes (AC6)', async () => {
    const elapsed = Date.now() - pipelineStartTime
    // eslint-disable-next-line no-console
    console.log(`[PIPELINE] Thorough time: ${(elapsed / 1000).toFixed(1)}s`)
    expect(elapsed).toBeLessThan(600_000)
  })
})
