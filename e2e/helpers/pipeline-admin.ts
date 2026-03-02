/**
 * Pipeline E2E Admin Helpers — PostgREST queries for pipeline assertions.
 *
 * Uses service_role key to bypass RLS and query pipeline state (files, findings, scores).
 *
 * NOTE: process.env is used directly here because this runs in the Playwright Node.js
 * context (not Next.js runtime), so @/lib/env is not available.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

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
