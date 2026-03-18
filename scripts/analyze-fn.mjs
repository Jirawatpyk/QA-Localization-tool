/**
 * Analyze all 42 False Negatives from pipeline verification.
 * Run pipeline → compare each baseline segment → report why each FN was missed.
 *
 * Usage: npx dotenv-cli -e .env.local -- node scripts/analyze-fn.mjs
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
  console.log('=== Detailed FN Analysis ===\n')

  // 1. Setup + run pipeline (same as verify-pipeline)
  const tenantId = randomUUID()
  await post('/rest/v1/tenants', { id: tenantId, name: 'FN Analysis' })
  const [project] = await post('/rest/v1/projects', {
    id: randomUUID(), tenant_id: tenantId, name: 'FN Analysis',
    source_lang: 'en-US', target_langs: ['th-TH'],
  })
  const projectId = project.id

  const sdlxliffPath = join(__dirname, '..', 'docs', 'test-data', 'verification-baseline', 'verification-500.sdlxliff')
  const sdlxliffContent = readFileSync(sdlxliffPath)
  const sdlxliffText = readFileSync(sdlxliffPath, 'utf-8')
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

  // Parse + insert segments
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
  console.log('Running pipeline...')
  await fetch(`${INNGEST_DEV_URL}/e/${ANON_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'pipeline.batch-started',
      data: {
        batchId: randomUUID(), fileIds: [fileId], projectId, tenantId,
        userId: 'system', mode: 'economy', uploadBatchId: randomUUID(),
      },
    }),
  })

  // Poll
  const start = Date.now()
  while (Date.now() - start < 600_000) {
    const [f] = await query(`/rest/v1/files?id=eq.${fileId}&select=status`)
    process.stdout.write(`  ${f.status}  \r`)
    if (f.status === 'l2_completed') break
    if (f.status === 'failed') throw new Error('Pipeline failed')
    await new Promise(r => setTimeout(r, 5000))
  }
  console.log(`Pipeline done in ${((Date.now() - start) / 1000).toFixed(0)}s\n`)

  // 2. Get findings + segments
  const findings = await query(`/rest/v1/findings?file_id=eq.${fileId}&select=id,severity,category,detected_by_layer,description,segment_id&limit=2000`)
  const segments = await query(`/rest/v1/segments?file_id=eq.${fileId}&select=id,segment_number,source_text,target_text&limit=1000`)
  const segIdToNum = new Map(segments.map(s => [s.id, s.segment_number]))
  const segNumToData = new Map(segments.map(s => [s.segment_number, s]))

  // Build findings-by-segment lookup
  const findingsBySegNum = new Map()
  for (const f of findings) {
    const segNum = segIdToNum.get(f.segment_id)
    if (!segNum) continue
    if (!findingsBySegNum.has(segNum)) findingsBySegNum.set(segNum, [])
    findingsBySegNum.get(segNum).push(f)
  }

  // 3. Load baseline
  const annotationsPath = join(__dirname, '..', 'docs', 'test-data', 'verification-baseline', 'baseline-annotations.json')
  const annotations = JSON.parse(readFileSync(annotationsPath, 'utf-8'))

  // 4. Analyze each baseline segment
  console.log('=== DETAILED ANALYSIS PER ERROR TYPE ===\n')

  const results = { TP: [], FN: [] }
  const fnByType = {}

  for (const [segNumStr, ann] of Object.entries(annotations.segments)) {
    const segNum = Number(segNumStr)
    const segFindings = findingsBySegNum.get(segNum) || []
    const segData = segNumToData.get(segNum)

    if (segFindings.length > 0) {
      results.TP.push({ segNum, type: ann.error_type, findings: segFindings.length })
    } else {
      results.FN.push({ segNum, type: ann.error_type, ann })

      if (!fnByType[ann.error_type]) fnByType[ann.error_type] = []
      fnByType[ann.error_type].push({
        segNum,
        source: segData?.source_text?.substring(0, 100) || '?',
        target: segData?.target_text?.substring(0, 100) || '?',
        description: ann.description,
      })
    }
  }

  console.log(`TP: ${results.TP.length}, FN: ${results.FN.length}\n`)

  for (const [type, items] of Object.entries(fnByType)) {
    console.log(`\n--- ${type} (${items.length} FN) ---`)
    for (const item of items.slice(0, 5)) {
      console.log(`  Seg ${item.segNum}: ${item.description}`)
      console.log(`    SRC: ${item.source}`)
      console.log(`    TGT: ${item.target}`)
      console.log()
    }
    if (items.length > 5) console.log(`  ... and ${items.length - 5} more`)
  }

  // 5. Summary
  console.log('\n=== FN SUMMARY BY ERROR TYPE ===')
  const typeStats = {}
  for (const [segNumStr, ann] of Object.entries(annotations.segments)) {
    const segNum = Number(segNumStr)
    const t = ann.error_type
    if (!typeStats[t]) typeStats[t] = { total: 0, detected: 0, missed: 0, layer: ann.injected_type }
    typeStats[t].total++
    if (findingsBySegNum.has(segNum)) {
      typeStats[t].detected++
    } else {
      typeStats[t].missed++
    }
  }

  console.log('\nType              | Total | Detected | Missed | Rate    | Layer | Root Cause')
  console.log('------------------|-------|----------|--------|---------|-------|----------')
  for (const [t, s] of Object.entries(typeStats)) {
    const rate = ((s.detected / s.total) * 100).toFixed(0) + '%'
    console.log(`${t.padEnd(18)}| ${String(s.total).padEnd(6)}| ${String(s.detected).padEnd(9)}| ${String(s.missed).padEnd(7)}| ${rate.padEnd(8)}| ${s.layer.padEnd(6)}|`)
  }

  // Cleanup
  await fetch(`${SUPABASE_URL}/rest/v1/files?project_id=eq.${projectId}`, { method: 'DELETE', headers: adminHeaders })
  await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}`, { method: 'DELETE', headers: adminHeaders })
  await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}`, { method: 'DELETE', headers: adminHeaders })
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
