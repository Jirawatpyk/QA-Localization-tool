/**
 * Shared helpers for AI pipeline integration tests.
 * Extracted to keep each test file < 300 lines (TEA quality rule).
 */
import { randomUUID } from 'node:crypto'

// NOTE: process.env used directly — integration tests run outside Next.js runtime
/* eslint-disable no-restricted-syntax */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
export const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL ?? ''
const OPENAI_KEY = process.env.OPENAI_API_KEY ?? ''
/* eslint-enable no-restricted-syntax */

// ── Timeout Constants (no magic numbers — TEA quality rule) ──
export const TIMEOUT = {
  SETUP: 30_000,
  CLEANUP: 10_000,
  ECONOMY_PIPELINE: 300_000, // 5 min
  THOROUGH_PIPELINE: 600_000, // 10 min
  ECONOMY_TEST: 360_000, // 6 min (pipeline + assertions)
  THOROUGH_TEST: 660_000, // 11 min
  EDGE_CASE: 120_000, // 2 min
  GLOSSARY_TEST: 360_000, // 6 min
  SCORE_POLL: 30_000,
  POLL_INTERVAL: 3_000,
} as const

export const HAS_PREREQUISITES =
  SUPABASE_URL.length > 0 &&
  SERVICE_ROLE_KEY.length > 0 &&
  INNGEST_DEV_URL.length > 0 &&
  OPENAI_KEY.length > 0

export const adminHeaders: Record<string, string> = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: ANON_KEY,
  'Content-Type': 'application/json',
}

export async function postRest(path: string, body: unknown): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: { ...adminHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`)
  return (await res.json()) as unknown[]
}

export async function queryRest(path: string): Promise<unknown[]> {
  const res = await fetch(`${SUPABASE_URL}${path}`, { headers: adminHeaders })
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`)
  return (await res.json()) as unknown[]
}

export async function queryCount(path: string): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { ...adminHeaders, Prefer: 'count=exact' },
  })
  const range = res.headers.get('content-range')
  if (!range) return 0
  const match = range.match(/\/(\d+)$/)
  return match ? parseInt(match[1]!, 10) : 0
}

export async function pollFileStatus(
  fileId: string,
  target: string,
  timeoutMs: number,
): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const rows = (await queryRest(`/rest/v1/files?id=eq.${fileId}&select=status`)) as Array<{
      status: string
    }>
    const status = rows[0]?.status ?? ''
    if (status === target) return status
    if (status === 'failed') throw new Error(`File ${fileId} FAILED`)
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error(`Timeout waiting for file ${fileId} to reach ${target}`)
}

export async function triggerPipeline(opts: {
  fileIds: string[]
  projectId: string
  tenantId: string
  mode: 'economy' | 'thorough'
}): Promise<void> {
  const batchId = randomUUID()
  const res = await fetch(`${INNGEST_DEV_URL}/e/${ANON_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'pipeline.batch-started',
      data: {
        batchId,
        fileIds: opts.fileIds,
        projectId: opts.projectId,
        tenantId: opts.tenantId,
        userId: '00000000-0000-4000-a000-000000000001', // static UUID for integration test audit logs
        mode: opts.mode,
        uploadBatchId: batchId,
      },
    }),
  })
  if (!res.ok) throw new Error(`Inngest event failed: ${res.status}`)
}

export async function createTestFile(
  projectId: string,
  tenantId: string,
  fileName: string,
): Promise<string> {
  const [file] = (await postRest('/rest/v1/files', {
    project_id: projectId,
    tenant_id: tenantId,
    file_name: fileName,
    file_type: 'sdlxliff',
    file_size_bytes: 1024,
    file_hash: randomUUID().replace(/-/g, ''),
    storage_path: `${tenantId}/${projectId}/${fileName}`,
    status: 'uploaded',
  })) as Array<{ id: string }>
  return file!.id
}

export async function insertSegments(
  fileId: string,
  projectId: string,
  tenantId: string,
  segments: Array<{ segmentNumber: number; sourceText: string; targetText: string }>,
): Promise<void> {
  const rows = segments.map((s) => ({
    file_id: fileId,
    project_id: projectId,
    tenant_id: tenantId,
    segment_number: s.segmentNumber,
    source_text: s.sourceText,
    target_text: s.targetText,
    source_lang: 'en-US',
    target_lang: 'th-TH',
    word_count: s.sourceText.split(' ').length,
  }))
  await postRest('/rest/v1/segments', rows)
}

export async function setFileParsed(fileId: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/files?id=eq.${fileId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'parsed' }),
  })
}

export async function cleanupTenantProject(
  tenantId: string | undefined,
  projectId: string | undefined,
): Promise<void> {
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
}

export async function parseVerificationSegments(): Promise<
  Array<{
    segmentNumber: number
    sourceText: string
    targetText: string
  }>
> {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const sdlxliffPath = path.join(
    process.cwd(),
    'docs/test-data/verification-baseline/verification-500.sdlxliff',
  )
  const sdlxliffText = fs.readFileSync(sdlxliffPath, 'utf-8')

  const decode = (s: string) =>
    s
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")

  const segments: Array<{ segmentNumber: number; sourceText: string; targetText: string }> = []
  for (let i = 1; i <= 500; i++) {
    const re = new RegExp(
      `<trans-unit id="tu-${i}">.*?<seg-source>\\s*<mrk[^>]*>(.*?)</mrk>.*?<target>\\s*<mrk[^>]*>(.*?)</mrk>`,
      's',
    )
    const match = sdlxliffText.match(re)
    if (match) {
      segments.push({
        segmentNumber: i,
        sourceText: decode(match[1]!),
        targetText: decode(match[2]!),
      })
    }
  }
  return segments
}

export async function loadBaselineAnnotations(): Promise<
  Record<string, { expected_category: string; expected_severity: string; injected_type: string }>
> {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const annotationsPath = path.join(
    process.cwd(),
    'docs/test-data/verification-baseline/baseline-annotations.json',
  )
  const data = JSON.parse(fs.readFileSync(annotationsPath, 'utf-8')) as {
    segments: Record<
      string,
      { expected_category: string; expected_severity: string; injected_type: string }
    >
  }
  return data.segments
}

export const TEST_SEGMENTS = [
  {
    segmentNumber: 1,
    sourceText: 'There are 150 employees in the building.',
    targetText: 'มีพนักงาน 200 คนในอาคาร',
    expectedL1: true,
    errorType: 'number_mismatch',
  },
  {
    segmentNumber: 2,
    sourceText: 'Please save your work before closing.',
    targetText: 'กรุณาบันทึก  งานของคุณก่อนปิด',
    expectedL1: true,
    errorType: 'double_space',
  },
  {
    segmentNumber: 3,
    sourceText: 'The meeting has been postponed to next Monday.',
    targetText: 'การประชุมถูกยกเลิกในวันจันทร์หน้า',
    expectedL1: false,
    errorType: 'mistranslation',
  },
  {
    segmentNumber: 4,
    sourceText: 'Click Save to continue.',
    targetText: 'คลิกบันทึกเพื่อดำเนินการต่อ โปรดตรวจสอบข้อมูลให้ถูกต้องก่อนบันทึก',
    expectedL1: false,
    errorType: 'addition',
  },
  {
    segmentNumber: 5,
    sourceText: 'Welcome to the application.',
    targetText: 'ยินดีต้อนรับสู่แอปพลิเคชัน',
    expectedL1: false,
    errorType: null,
  },
  {
    segmentNumber: 6,
    sourceText: 'Warning: Do not share your password. Change it every 90 days for security.',
    targetText: 'คำเตือน: อย่าแชร์รหัสผ่านกับใคร',
    expectedL1: false,
    errorType: 'omission',
  },
  {
    segmentNumber: 7,
    sourceText: 'Your order has been confirmed.',
    targetText: 'คำสั่งซื้อของคุณได้รับการยืนยันแล้ว',
    expectedL1: false,
    errorType: null,
  },
] as const
