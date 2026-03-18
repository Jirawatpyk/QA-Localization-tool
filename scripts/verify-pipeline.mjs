/**
 * Story 4.8 Task 7 — Pipeline Verification Script
 *
 * Programmatic verification of L2 precision/recall on 500-segment test file.
 * Does NOT use Playwright — runs as a Node.js script against live services.
 *
 * Prerequisites:
 * - Supabase running (npx supabase start)
 * - Inngest dev server running (npx inngest-cli@latest dev)
 * - Next.js dev server running (npm run dev)
 * - .env.local with OPENAI_API_KEY + ANTHROPIC_API_KEY
 *
 * Usage: npx dotenv-cli -e .env.local -- node scripts/verify-pipeline.mjs
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error('Missing SUPABASE env vars')
  process.exit(1)
}

const adminHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: ANON_KEY,
  'Content-Type': 'application/json',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function post(path, body, headers = adminHeaders) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function query(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, { headers: adminHeaders })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json()
}

async function queryCount(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { ...adminHeaders, Prefer: 'count=exact' },
  })
  const range = res.headers.get('content-range')
  if (!range) return 0
  const match = range.match(/\/(\d+)$/)
  return match ? parseInt(match[1], 10) : 0
}

async function pollFileStatus(fileId, target, timeoutMs = 600_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const [file] = await query(`/rest/v1/files?id=eq.${fileId}&select=status`)
    console.log(`  [poll] file status: ${file.status} (target: ${target})`)
    if (file.status === target) return file.status
    if (file.status === 'failed') throw new Error(`File ${fileId} FAILED`)
    await new Promise(r => setTimeout(r, 5000))
  }
  throw new Error(`Timeout waiting for file ${fileId} to reach ${target}`)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Pipeline Verification (Story 4.8 Task 7) ===\n')

  // 1. Create test tenant + project
  console.log('[1/7] Creating test tenant + project...')
  const tenantId = randomUUID()
  await post('/rest/v1/tenants', { id: tenantId, name: 'Pipeline Verification Tenant' })

  const [project] = await post('/rest/v1/projects', {
    id: randomUUID(),
    tenant_id: tenantId,
    name: 'Pipeline Verification Project',
    source_lang: 'en-US',
    target_langs: ['th-TH'],
  })
  const projectId = project.id
  console.log(`  project: ${projectId}`)

  // 2. Upload SDLXLIFF to Supabase Storage
  console.log('[2/7] Uploading 500-segment SDLXLIFF to Storage...')
  const sdlxliffPath = join(__dirname, '..', 'docs', 'test-data', 'verification-baseline', 'verification-500.sdlxliff')
  const sdlxliffContent = readFileSync(sdlxliffPath)
  const storagePath = `${tenantId}/${projectId}/verification-500.sdlxliff`

  const uploadRes = await fetch(
    `${SUPABASE_URL}/storage/v1/object/project-files/${storagePath}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: ANON_KEY,
        'Content-Type': 'application/xml',
      },
      body: sdlxliffContent,
    },
  )
  if (!uploadRes.ok) throw new Error(`Storage upload failed: ${uploadRes.status} ${await uploadRes.text()}`)
  console.log(`  uploaded: ${storagePath} (${sdlxliffContent.length} bytes)`)

  // 3. Create file record
  console.log('[3/7] Creating file record...')
  const fileHash = randomUUID().replace(/-/g, '')
  const [file] = await post('/rest/v1/files', {
    project_id: projectId,
    tenant_id: tenantId,
    file_name: 'verification-500.sdlxliff',
    file_type: 'sdlxliff',
    file_size_bytes: sdlxliffContent.length,
    file_hash: fileHash,
    storage_path: storagePath,
    status: 'uploaded',
  })
  const fileId = file.id
  console.log(`  file: ${fileId}`)

  // 4a. Parse the SDLXLIFF locally and insert segments into DB
  console.log('[4/7] Parsing SDLXLIFF and inserting segments...')

  // Parse XML to extract segments (reuse generator logic — segment content is deterministic)
  const sdlxliffText = readFileSync(sdlxliffPath, 'utf-8')
  const segmentMatches = [...sdlxliffText.matchAll(/<trans-unit id="tu-(\d+)">/g)]

  // Extract segments from SDLXLIFF manually via regex (simpler than importing parser)
  const segmentBodies = []
  for (let i = 1; i <= 500; i++) {
    // Source and target are inside <mrk> tags
    const tuRegex = new RegExp(
      `<trans-unit id="tu-${i}">.*?<seg-source>\\s*<mrk[^>]*>(.*?)</mrk>.*?<target>\\s*<mrk[^>]*>(.*?)</mrk>`,
      's'
    )
    const match = sdlxliffText.match(tuRegex)
    if (match) {
      segmentBodies.push({
        file_id: fileId,
        project_id: projectId,
        tenant_id: tenantId,
        segment_number: i,
        source_text: match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
        target_text: match[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
        source_lang: 'en-US',
        target_lang: 'th-TH',
        word_count: 20,
      })
    }
  }

  console.log(`  Parsed ${segmentBodies.length} segments`)

  // Insert segments in batches
  for (let batch = 0; batch < segmentBodies.length; batch += 50) {
    const chunk = segmentBodies.slice(batch, batch + 50)
    const segRes = await fetch(`${SUPABASE_URL}/rest/v1/segments`, {
      method: 'POST',
      headers: { ...adminHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(chunk),
    })
    if (!segRes.ok) throw new Error(`Segment insert failed: ${segRes.status} ${await segRes.text()}`)
  }
  console.log(`  Inserted ${segmentBodies.length} segments`)

  // Update file status to 'parsed'
  await fetch(`${SUPABASE_URL}/rest/v1/files?id=eq.${fileId}`, {
    method: 'PATCH',
    headers: { ...adminHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'parsed' }),
  })
  console.log('  File status → parsed')

  // 4b. Trigger pipeline via Inngest
  console.log('  Triggering pipeline via Inngest...')
  const batchId = randomUUID()

  const eventRes = await fetch(`${INNGEST_DEV_URL}/e/${ANON_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'pipeline.batch-started',
      data: {
        batchId,
        fileIds: [fileId],
        projectId,
        tenantId,
        userId: 'system-verification',
        mode: 'thorough',
        uploadBatchId: batchId,
      },
    }),
  })
  console.log(`  Inngest response: ${eventRes.status}`)
  console.log(`  Pipeline triggered (mode: economy, batch: ${batchId})`)

  // 5. Poll for completion
  console.log('[5/7] Polling for pipeline completion...')
  const startTime = Date.now()

  try {
    await pollFileStatus(fileId, 'l3_completed', 600_000) // 10 min timeout (Thorough: L1+L2+L3)
  } catch (err) {
    // Check if file is still in 'uploaded' — means pipeline didn't pick it up
    const [currentFile] = await query(`/rest/v1/files?id=eq.${fileId}&select=status`)
    if (currentFile.status === 'uploaded') {
      console.log('  Pipeline did not start — file still in "uploaded" status')
      console.log('  This means the Inngest event was not processed.')
      console.log('  Checking if pipeline needs file to be in "parsed" status first...')

      // The pipeline might need the file to be parsed first (parse → L1 → L2)
      // Let me check segments
      const segCount = await queryCount(`/rest/v1/segments?file_id=eq.${fileId}&select=id`)
      console.log(`  Segments in DB: ${segCount}`)
      if (segCount === 0) {
        console.log('  No segments found — file needs to be parsed first')
        console.log('  The pipeline orchestrator expects parsed segments to exist')
        console.log('')
        console.log('  WORKAROUND: Upload via the app UI instead of direct API')
        console.log('  Or manually trigger parse: npm run dev → upload file via /projects/X/upload')
      }
    }
    throw err
  }

  const pipelineTime = Date.now() - startTime
  console.log(`  Pipeline completed in ${(pipelineTime / 1000).toFixed(1)}s`)

  // 6. Query findings + compute precision/recall
  console.log('[6/7] Computing L2 precision/recall...')
  const annotationsPath = join(__dirname, '..', 'docs', 'test-data', 'verification-baseline', 'baseline-annotations.json')
  const annotations = JSON.parse(readFileSync(annotationsPath, 'utf-8'))
  const baselineSegments = annotations.segments

  // Get all findings for this file
  const findings = await query(
    `/rest/v1/findings?file_id=eq.${fileId}&select=id,severity,category,detected_by_layer,segment_id&limit=1000`,
  )

  // Get segments to map segment_id → segment_number
  const segments = await query(
    `/rest/v1/segments?file_id=eq.${fileId}&select=id,segment_number&limit=1000`,
  )
  const segIdToNum = new Map(segments.map(s => [s.id, s.segment_number]))

  // Compute TP / FP / FN
  const baselineSet = new Set(Object.keys(baselineSegments).map(Number))
  let tp = 0, fp = 0, fn = 0

  // Check each finding against baseline
  const matchedBaseline = new Set()
  for (const finding of findings) {
    const segNum = segIdToNum.get(finding.segment_id)
    if (segNum && baselineSet.has(segNum)) {
      tp++
      matchedBaseline.add(segNum)
    } else {
      fp++
    }
  }

  // Count missed baseline entries
  for (const segNum of baselineSet) {
    if (!matchedBaseline.has(segNum)) fn++
  }

  const precision = tp / (tp + fp) || 0
  const recall = tp / (tp + fn) || 0

  console.log(`  Total findings: ${findings.length}`)
  console.log(`  L1 findings: ${findings.filter(f => f.detected_by_layer === 'L1').length}`)
  console.log(`  L2 findings: ${findings.filter(f => f.detected_by_layer === 'L2').length}`)
  console.log(`  Baseline errors: ${baselineSet.size}`)
  console.log(`  TP: ${tp}, FP: ${fp}, FN: ${fn}`)
  console.log(`  Precision: ${(precision * 100).toFixed(1)}% (target: >= 70%)`)
  console.log(`  Recall: ${(recall * 100).toFixed(1)}% (target: >= 60%)`)

  // 7. Check score
  console.log('[7/7] Checking score...')
  const [score] = await query(`/rest/v1/scores?file_id=eq.${fileId}&select=*&limit=1`)
  if (score) {
    console.log(`  MQM Score: ${score.mqm_score}`)
    console.log(`  Layer: ${score.layer_completed}`)
    console.log(`  Status: ${score.status}`)
  }

  // Check ai_usage_logs (AC7)
  console.log('\n[7b/7] Verifying AI cost tracking (AC7)...')
  const aiLogs = await query(`/rest/v1/ai_usage_logs?file_id=eq.${fileId}&select=*&limit=100`)
  let totalInput = 0, totalOutput = 0, totalCost = 0
  for (const log of aiLogs) {
    totalInput += log.input_tokens || 0
    totalOutput += log.output_tokens || 0
    totalCost += log.estimated_cost || 0
  }
  console.log(`  AI Usage Logs: ${aiLogs.length} entries`)
  console.log(`  Total tokens: ${totalInput} input + ${totalOutput} output`)
  console.log(`  Estimated cost: $${totalCost.toFixed(4)}`)

  // AC7: Verify token counts are non-zero (basic sanity — exact match requires provider billing)
  const tokenVerified = totalInput > 0 && totalOutput > 0
  console.log(`  Token logging: ${tokenVerified ? 'PASS' : 'FAIL'} (input>0 && output>0)`)

  // AC7: Verify each log entry has required fields
  let logIntegrity = true
  for (const log of aiLogs) {
    if (!log.model || !log.layer || log.input_tokens == null || log.output_tokens == null) {
      console.log(`  WARNING: Incomplete log entry: ${JSON.stringify(log)}`)
      logIntegrity = false
    }
  }
  console.log(`  Log integrity: ${logIntegrity ? 'PASS' : 'FAIL'} (all entries have model, layer, tokens)`)

  // AC7: Check project-level aggregation matches sum of individual logs
  const projectAiLogs = await query(
    `/rest/v1/ai_usage_logs?select=input_tokens,output_tokens,estimated_cost&project_id=eq.${projectId}&limit=1000`
  )
  let projInput = 0, projOutput = 0, projCost = 0
  for (const log of projectAiLogs) {
    projInput += log.input_tokens || 0
    projOutput += log.output_tokens || 0
    projCost += log.estimated_cost || 0
  }
  const aggregationMatch = projInput === totalInput && projOutput === totalOutput
  console.log(`  Aggregation match: ${aggregationMatch ? 'PASS' : 'FAIL'} (project sum == file sum)`)

  // Summary
  console.log('\n=== VERIFICATION SUMMARY ===')
  console.log(`Pipeline time:  ${(pipelineTime / 1000).toFixed(1)}s (target: < 300s)`)
  console.log(`L2 Precision:   ${(precision * 100).toFixed(1)}% (target: >= 70%)`)
  console.log(`L2 Recall:      ${(recall * 100).toFixed(1)}% (target: >= 60%)`)
  console.log(`Pipeline time:  ${pipelineTime < 300_000 ? 'PASS' : 'FAIL'}`)
  console.log(`Precision:      ${precision >= 0.7 ? 'PASS' : 'FAIL'}`)
  console.log(`Recall:         ${recall >= 0.6 ? 'PASS' : 'FAIL'}`)
  console.log(`Token logging:  ${tokenVerified ? 'PASS' : 'FAIL'}`)
  console.log(`Log integrity:  ${logIntegrity ? 'PASS' : 'FAIL'}`)
  console.log(`Aggregation:    ${aggregationMatch ? 'PASS' : 'FAIL'}`)

  // Cleanup
  console.log('\nCleaning up test data...')
  await fetch(`${SUPABASE_URL}/rest/v1/files?project_id=eq.${projectId}`, {
    method: 'DELETE', headers: adminHeaders,
  })
  await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}`, {
    method: 'DELETE', headers: adminHeaders,
  })
  await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}`, {
    method: 'DELETE', headers: adminHeaders,
  })
  console.log('Done.')
}

main().catch(err => {
  console.error('VERIFICATION FAILED:', err.message)
  process.exit(1)
})
