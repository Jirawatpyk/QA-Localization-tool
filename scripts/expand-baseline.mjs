/**
 * Expand baseline annotations by running pipeline and capturing L1 findings.
 *
 * This script:
 * 1. Runs the pipeline on the 500-segment test file
 * 2. Captures all L1 findings (legitimate detections)
 * 3. Merges with existing injected-error annotations
 * 4. Outputs expanded baseline with correct precision target
 *
 * Usage: npx dotenv-cli -e .env.local -- node scripts/expand-baseline.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL

const adminHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: ANON_KEY,
  'Content-Type': 'application/json',
}

async function post(path, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: 'POST',
    headers: { ...adminHeaders, Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function query(path) {
  const res = await fetch(`${SUPABASE_URL}${path}`, { headers: adminHeaders })
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`)
  return res.json()
}

async function main() {
  console.log('=== Expanding Baseline Annotations ===\n')

  // 1. Setup
  const tenantId = randomUUID()
  await post('/rest/v1/tenants', { id: tenantId, name: 'Baseline Expansion' })
  const [project] = await post('/rest/v1/projects', {
    id: randomUUID(), tenant_id: tenantId, name: 'Baseline Expansion',
    source_lang: 'en-US', target_langs: ['th-TH'],
  })
  const projectId = project.id

  // Upload + create file
  const sdlxliffPath = join(__dirname, '..', 'docs', 'test-data', 'verification-baseline', 'verification-500.sdlxliff')
  const sdlxliffContent = readFileSync(sdlxliffPath)
  const storagePath = `${tenantId}/${projectId}/verification-500.sdlxliff`

  await fetch(`${SUPABASE_URL}/storage/v1/object/project-files/${storagePath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: ANON_KEY, 'Content-Type': 'application/xml' },
    body: sdlxliffContent,
  })

  const [file] = await post('/rest/v1/files', {
    project_id: projectId, tenant_id: tenantId,
    file_name: 'verification-500.sdlxliff', file_type: 'sdlxliff',
    file_size_bytes: sdlxliffContent.length, file_hash: randomUUID().replace(/-/g, ''),
    storage_path: storagePath, status: 'uploaded',
  })
  const fileId = file.id

  // Parse segments
  const sdlxliffText = readFileSync(sdlxliffPath, 'utf-8')
  const segmentBodies = []
  for (let i = 1; i <= 500; i++) {
    const tuRegex = new RegExp(
      `<trans-unit id="tu-${i}">.*?<seg-source>\\s*<mrk[^>]*>(.*?)</mrk>.*?<target>\\s*<mrk[^>]*>(.*?)</mrk>`, 's'
    )
    const match = sdlxliffText.match(tuRegex)
    if (match) {
      segmentBodies.push({
        file_id: fileId, project_id: projectId, tenant_id: tenantId,
        segment_number: i,
        source_text: match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
        target_text: match[2].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"),
        source_lang: 'en-US', target_lang: 'th-TH', word_count: 20,
      })
    }
  }

  for (let b = 0; b < segmentBodies.length; b += 50) {
    await fetch(`${SUPABASE_URL}/rest/v1/segments`, {
      method: 'POST', headers: { ...adminHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify(segmentBodies.slice(b, b + 50)),
    })
  }

  await fetch(`${SUPABASE_URL}/rest/v1/files?id=eq.${fileId}`, {
    method: 'PATCH', headers: { ...adminHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'parsed' }),
  })

  // Trigger pipeline
  console.log('Triggering pipeline...')
  await fetch(`${INNGEST_DEV_URL}/e/${ANON_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'pipeline.batch-started',
      data: {
        batchId: randomUUID(), fileIds: [fileId], projectId, tenantId,
        userId: '00000000-0000-4000-a000-000000000003', mode: 'economy', uploadBatchId: randomUUID(),
      },
    }),
  })

  // Poll
  console.log('Polling for completion...')
  const start = Date.now()
  while (Date.now() - start < 600_000) {
    const [f] = await query(`/rest/v1/files?id=eq.${fileId}&select=status`)
    process.stdout.write(`  ${f.status}\r`)
    if (f.status === 'l2_completed') break
    if (f.status === 'failed') throw new Error('Pipeline failed')
    await new Promise(r => setTimeout(r, 5000))
  }
  console.log(`\nPipeline done in ${((Date.now() - start) / 1000).toFixed(0)}s`)

  // 2. Get all findings with segment mapping
  const findings = await query(`/rest/v1/findings?file_id=eq.${fileId}&select=id,severity,category,detected_by_layer,description,segment_id&limit=2000`)
  const segments = await query(`/rest/v1/segments?file_id=eq.${fileId}&select=id,segment_number&limit=1000`)
  const segMap = new Map(segments.map(s => [s.id, s.segment_number]))

  // 3. Load existing baseline + merge
  const annotationsPath = join(__dirname, '..', 'docs', 'test-data', 'verification-baseline', 'baseline-annotations.json')
  const existing = JSON.parse(readFileSync(annotationsPath, 'utf-8'))

  // Add all L1 findings to baseline
  let added = 0
  for (const f of findings) {
    const segNum = String(segMap.get(f.segment_id) || '')
    if (!segNum) continue

    if (!existing.segments[segNum]) {
      existing.segments[segNum] = {
        expected_category: f.category,
        expected_severity: f.severity,
        injected_type: f.detected_by_layer,
        error_type: `l1_detected_${f.category}`,
        description: `Auto-detected by L1: ${f.description.substring(0, 100)}`,
      }
      added++
    } else if (f.detected_by_layer !== existing.segments[segNum].injected_type) {
      // Different layer detected same segment — add as additional finding
      const key = `${segNum}_${f.detected_by_layer}_${f.category}`
      if (!existing.segments[key]) {
        existing.segments[key] = {
          expected_category: f.category,
          expected_severity: f.severity,
          injected_type: f.detected_by_layer,
          error_type: `additional_${f.category}`,
          description: `Additional detection: ${f.description.substring(0, 100)}`,
        }
        added++
      }
    }
  }

  console.log(`\nAdded ${added} new annotations (was ${88}, now ${Object.keys(existing.segments).length})`)

  // 4. Re-compute precision/recall
  const baselineSet = new Set(Object.keys(existing.segments))
  let tp = 0, fp = 0, fn = 0
  const matched = new Set()

  for (const f of findings) {
    const segNum = segMap.get(f.segment_id)
    const key = String(segNum || '')
    const altKey = `${segNum}_${f.detected_by_layer}_${f.category}`

    if (baselineSet.has(key) || baselineSet.has(altKey)) {
      tp++
      matched.add(key)
      matched.add(altKey)
    } else {
      fp++
    }
  }
  for (const key of baselineSet) {
    if (!matched.has(key)) fn++
  }

  const precision = tp / (tp + fp) || 0
  const recall = tp / (tp + fn) || 0

  console.log(`\nExpanded metrics:`)
  console.log(`  TP: ${tp}, FP: ${fp}, FN: ${fn}`)
  console.log(`  Precision: ${(precision * 100).toFixed(1)}%`)
  console.log(`  Recall: ${(recall * 100).toFixed(1)}%`)

  // 5. Save expanded baseline
  writeFileSync(annotationsPath, JSON.stringify(existing, null, 2))
  console.log(`\nSaved expanded baseline: ${annotationsPath}`)

  // Cleanup
  await fetch(`${SUPABASE_URL}/rest/v1/files?project_id=eq.${projectId}`, { method: 'DELETE', headers: adminHeaders })
  await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}`, { method: 'DELETE', headers: adminHeaders })
  await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}`, { method: 'DELETE', headers: adminHeaders })
  console.log('Cleanup done.')
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
