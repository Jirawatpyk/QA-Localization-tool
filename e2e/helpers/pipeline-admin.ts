/**
 * Pipeline E2E Admin Helpers — PostgREST queries for pipeline assertions.
 *
 * Uses service_role key to bypass RLS and query pipeline state (files, findings, scores).
 * Also provides helpers to seed test data and trigger the pipeline via Inngest dev server.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY || 'test'
const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL || 'http://localhost:8288'

function adminHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

type FileRow = {
  id: string
  status: string
  file_name: string
  project_id: string
  tenant_id: string
}

type ScoreRow = {
  id: string
  mqm_score: number
  layer_completed: string
  status: string
  total_words: number
  critical_count: number
  major_count: number
  minor_count: number
}

type TestSegment = {
  segmentNumber: number
  sourceText: string
  targetText: string
  sourceLang: string
  targetLang: string
  wordCount: number
  confirmationState?: string
  matchPercentage?: number
}

// ── File Queries ─────────────────────────────────────────────────────────────

/**
 * Query a file's current status by file ID.
 */
export async function queryFileStatus(fileId: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/files?id=eq.${fileId}&select=status`, {
    headers: adminHeaders(),
  })
  const data = (await res.json()) as Array<{ status: string }>
  if (!data || data.length === 0) throw new Error(`File ${fileId} not found`)
  return data[0].status
}

/**
 * Query a file by name within a project.
 */
export async function queryFileByName(
  projectId: string,
  fileName: string,
): Promise<FileRow | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/files?project_id=eq.${projectId}&file_name=eq.${encodeURIComponent(fileName)}&select=id,status,file_name,project_id,tenant_id&order=created_at.desc&limit=1`,
    { headers: adminHeaders() },
  )
  const data = (await res.json()) as FileRow[]
  if (!data || data.length === 0) return null
  return data[0]
}

// ── Findings Queries ─────────────────────────────────────────────────────────

/**
 * Count findings for a file, optionally filtered by detection layer.
 */
export async function queryFindingsCount(
  fileId: string,
  layer?: 'L1' | 'L2' | 'L3',
): Promise<number> {
  let url = `${SUPABASE_URL}/rest/v1/findings?file_id=eq.${fileId}&select=id`
  if (layer) {
    url += `&detected_by_layer=eq.${layer}`
  }
  const res = await fetch(url, {
    headers: { ...adminHeaders(), Prefer: 'count=exact' },
  })
  // PostgREST returns count in content-range header: "0-N/total" or "*/0"
  const range = res.headers.get('content-range')
  if (!range) return 0
  const match = range.match(/\/(\d+)$/)
  return match ? parseInt(match[1], 10) : 0
}

// ── Score Queries ────────────────────────────────────────────────────────────

/**
 * Query the latest score for a file.
 */
export async function queryScore(fileId: string): Promise<ScoreRow | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/scores?file_id=eq.${fileId}&select=id,mqm_score,layer_completed,status,total_words,critical_count,major_count,minor_count&order=created_at.desc&limit=1`,
    { headers: adminHeaders() },
  )
  const data = (await res.json()) as ScoreRow[]
  if (!data || data.length === 0) return null
  return data[0]
}

// ── Polling ──────────────────────────────────────────────────────────────────

/**
 * Poll a file's status until it reaches the target, with timeout.
 * Throws on timeout or if the file reaches 'failed' status unexpectedly.
 */
export async function pollFileStatus(
  fileId: string,
  targetStatus: string,
  timeoutMs: number = 180_000,
  pollIntervalMs: number = 3_000,
): Promise<void> {
  const start = Date.now()
  let lastStatus = ''

  while (Date.now() - start < timeoutMs) {
    lastStatus = await queryFileStatus(fileId)

    if (lastStatus === targetStatus) return

    if (lastStatus === 'failed') {
      throw new Error(`File ${fileId} reached 'failed' status while waiting for '${targetStatus}'`)
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for file ${fileId} to reach '${targetStatus}'. Last status: '${lastStatus}'`,
  )
}

// ── Test Data Seeding ────────────────────────────────────────────────────────

/**
 * Insert a file record via PostgREST (admin bypass).
 * Returns the file ID.
 */
export async function insertTestFile(params: {
  tenantId: string
  projectId: string
  fileName: string
  fileType: 'sdlxliff' | 'xliff' | 'xlsx'
  status: string
  uploadedBy: string
}): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      tenant_id: params.tenantId,
      project_id: params.projectId,
      file_name: params.fileName,
      file_type: params.fileType,
      file_size_bytes: 2048, // synthetic test file
      file_hash: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      storage_path: `e2e-test/${params.tenantId}/${params.projectId}/${params.fileName}`,
      status: params.status,
      uploaded_by: params.uploadedBy,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to insert test file: ${res.status} ${text}`)
  }

  const data = (await res.json()) as Array<{ id: string }>
  if (!data || data.length === 0) throw new Error('No file record returned')
  return data[0].id
}

/**
 * Insert test segments for a file via PostgREST (admin bypass).
 */
export async function insertTestSegments(
  fileId: string,
  projectId: string,
  tenantId: string,
  segments: TestSegment[],
): Promise<void> {
  const values = segments.map((seg) => ({
    file_id: fileId,
    project_id: projectId,
    tenant_id: tenantId,
    segment_number: seg.segmentNumber,
    source_text: seg.sourceText,
    target_text: seg.targetText,
    source_lang: seg.sourceLang,
    target_lang: seg.targetLang,
    word_count: seg.wordCount,
    confirmation_state: seg.confirmationState ?? null,
    match_percentage: seg.matchPercentage ?? null,
  }))

  const res = await fetch(`${SUPABASE_URL}/rest/v1/segments`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify(values),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to insert test segments: ${res.status} ${text}`)
  }
}

// ── Pipeline Trigger ─────────────────────────────────────────────────────────

/**
 * Trigger pipeline processing by sending an event to the Inngest dev server.
 *
 * NOTE: ProcessingModeDialog is not yet mounted in any page, so we bypass the UI
 * and send the event directly. This still tests the real Inngest pipeline (L1 + L2 + scoring).
 *
 * Returns the generated batch ID.
 */
export async function triggerProcessing(params: {
  fileIds: string[]
  projectId: string
  tenantId: string
  userId: string
  mode: 'economy' | 'thorough'
}): Promise<string> {
  const batchId = crypto.randomUUID()

  const event = {
    name: 'pipeline.batch-started',
    data: {
      batchId,
      fileIds: params.fileIds,
      projectId: params.projectId,
      tenantId: params.tenantId,
      userId: params.userId,
      mode: params.mode,
      uploadBatchId: batchId,
    },
  }

  const res = await fetch(`${INNGEST_DEV_URL}/e/${INNGEST_EVENT_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Failed to send Inngest event: ${res.status} ${text}`)
  }

  return batchId
}

// ── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Delete all test data for a project via PostgREST (admin bypass).
 * Cascade deletes handle child rows (findings, segments, scores).
 */
export async function cleanupTestProject(projectId: string): Promise<void> {
  // Files cascade-delete findings, segments, scores
  await fetch(`${SUPABASE_URL}/rest/v1/files?project_id=eq.${projectId}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  })

  await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  })
}
