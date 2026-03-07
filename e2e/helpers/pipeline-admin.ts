/**
 * Pipeline E2E Admin Helpers — PostgREST queries for pipeline assertions.
 *
 * Uses service_role key to bypass RLS and query pipeline state (files, findings, scores).
 * Env constants and adminHeaders() are imported from supabase-admin.ts (single source of truth).
 */

import { SUPABASE_URL, adminHeaders } from './supabase-admin'

// ── Types ────────────────────────────────────────────────────────────────────

// Aligned with DbFileStatus in src/types/pipeline.ts
export type SeedFileStatus =
  | 'uploaded'
  | 'parsing'
  | 'parsed'
  | 'l1_processing'
  | 'l1_completed'
  | 'l2_processing'
  | 'l2_completed'
  | 'l3_processing'
  | 'l3_completed'
  | 'ai_partial'
  | 'failed'

// Aligned with scores.layer_completed column (varchar(10))
type ScoreLayerCompleted = 'L1' | 'L1L2' | 'L1L2L3'

// Aligned with ScoreStatus in src/types/finding.ts
type ScoreStatus = 'calculating' | 'calculated' | 'partial' | 'overridden' | 'auto_passed' | 'na'

type FileRow = {
  id: string
  status: SeedFileStatus
  file_name: string
  project_id: string
  tenant_id: string
}

type ScoreRow = {
  id: string
  mqm_score: number
  layer_completed: ScoreLayerCompleted
  status: ScoreStatus
  total_words: number
  critical_count: number
  major_count: number
  minor_count: number
}

// ── File Queries ─────────────────────────────────────────────────────────────

/**
 * Query a file's current status by file ID.
 */
export async function queryFileStatus(fileId: string): Promise<SeedFileStatus> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/files?id=eq.${fileId}&select=status`, {
    headers: adminHeaders(),
  })
  const data = (await res.json()) as Array<{ status: SeedFileStatus }>
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
    `${SUPABASE_URL}/rest/v1/files?project_id=eq.${projectId}&file_name=eq.${encodeURIComponent(fileName)}&select=id,status,file_name,project_id,tenant_id&order=created_at.desc,id.desc&limit=1`,
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
  targetStatus: SeedFileStatus,
  timeoutMs: number = 180_000,
  pollIntervalMs: number = 3_000,
): Promise<void> {
  const start = Date.now()
  let lastStatus = ''

  while (Date.now() - start < timeoutMs) {
    lastStatus = await queryFileStatus(fileId)

    if (lastStatus === targetStatus) return

    // Fail fast on terminal statuses that won't progress further
    if (lastStatus === 'failed' || lastStatus === 'ai_partial') {
      throw new Error(
        `File ${fileId} reached '${lastStatus}' status while waiting for '${targetStatus}'`,
      )
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for file ${fileId} to reach '${targetStatus}'. Last status: '${lastStatus}'`,
  )
}

/**
 * Poll a score's layer_completed until it reaches the target, with timeout.
 * Use after pollFileStatus — scoring step runs AFTER file status update.
 */
export async function pollScoreLayer(
  fileId: string,
  targetLayer: ScoreLayerCompleted,
  timeoutMs: number = 30_000,
  pollIntervalMs: number = 2_000,
): Promise<void> {
  const start = Date.now()
  let lastLayer = ''

  while (Date.now() - start < timeoutMs) {
    const score = await queryScore(fileId)
    lastLayer = score?.layer_completed ?? ''

    if (lastLayer === targetLayer) return

    // NOTE: Do NOT fail-fast on calculated+L1 — L2 scoring recalculates the same
    // score row to L1L2 after L2 processing completes. The score status transitions:
    // calculated+L1 → calculating+L1 → calculated+L1L2

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for score layer_completed='${targetLayer}'. Last: '${lastLayer}'`,
  )
}

// ── Seeding ──────────────────────────────────────────────────────────────────

/**
 * Seed a file with ai_partial status + L1 finding + partial score.
 * Used by Story 3.4 E2E to test partial results display + retry UI.
 */
export async function seedAiPartialFile(projectId: string, tenantId: string): Promise<string> {
  // 1. Insert file with ai_partial status
  const fileRes = await fetch(`${SUPABASE_URL}/rest/v1/files`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({
      project_id: projectId,
      tenant_id: tenantId,
      file_name: 'resilience-test.sdlxliff',
      file_type: 'sdlxliff',
      file_size_bytes: 1024,
      storage_path: `e2e/resilience-test-${Date.now()}.sdlxliff`,
      status: 'ai_partial',
    }),
  })
  if (!fileRes.ok) {
    const text = await fileRes.text()
    throw new Error(`Failed to seed file: ${fileRes.status} ${text}`)
  }
  const fileData = (await fileRes.json()) as Array<{ id: string }>
  if (fileData.length === 0) throw new Error('seedAiPartialFile: no file returned from POST')
  const fileId = fileData[0]!.id

  // 2. Insert a segment (required for L2 retry to have data to process)
  const segRes = await fetch(`${SUPABASE_URL}/rest/v1/segments`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: projectId,
      tenant_id: tenantId,
      segment_number: 1,
      source_text: 'Hello world',
      target_text: 'สวัสดีชาวโลก',
      source_lang: 'en',
      target_lang: 'th',
      word_count: 2,
    }),
  })
  if (!segRes.ok) {
    const text = await segRes.text()
    throw new Error(`Failed to seed segment: ${segRes.status} ${text}`)
  }

  // 3a. Insert L1 finding (so review page has something to display)
  const findingRes = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: projectId,
      tenant_id: tenantId,
      severity: 'minor',
      category: 'Whitespace',
      description: 'Leading whitespace in target segment',
      detected_by_layer: 'L1',
      status: 'pending',
    }),
  })
  if (!findingRes.ok) {
    const text = await findingRes.text()
    throw new Error(`Failed to seed finding: ${findingRes.status} ${text}`)
  }

  // 3b. Insert L2 finding with fallback model (for T80 fallback badge test)
  const fallbackFindingRes = await fetch(`${SUPABASE_URL}/rest/v1/findings`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: projectId,
      tenant_id: tenantId,
      severity: 'major',
      category: 'Terminology',
      description: 'Inconsistent term translation (fallback model)',
      detected_by_layer: 'L2',
      ai_model: 'gemini-2.0-flash',
      ai_confidence: 75,
      status: 'pending',
    }),
  })
  if (!fallbackFindingRes.ok) {
    const text = await fallbackFindingRes.text()
    throw new Error(`Failed to seed fallback finding: ${fallbackFindingRes.status} ${text}`)
  }

  // 3. Insert partial score (L1 only, status=partial)
  const scoreRes = await fetch(`${SUPABASE_URL}/rest/v1/scores`, {
    method: 'POST',
    headers: { ...adminHeaders(), Prefer: 'return=minimal' },
    body: JSON.stringify({
      file_id: fileId,
      project_id: projectId,
      tenant_id: tenantId,
      mqm_score: 99.0,
      total_words: 500,
      critical_count: 0,
      major_count: 0,
      minor_count: 1,
      npt: 0.02,
      layer_completed: 'L1',
      status: 'partial',
      calculated_at: new Date().toISOString(),
    }),
  })
  if (!scoreRes.ok) {
    const text = await scoreRes.text()
    throw new Error(`Failed to seed score: ${scoreRes.status} ${text}`)
  }

  return fileId
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
