/**
 * Test L2 AI with glossary context — does it actually catch glossary violations?
 *
 * Seeds glossary terms matching the injected violations, then runs pipeline.
 * This is the CORRECT test — previous runs had no glossary → L2 couldn't check.
 *
 * Usage: npx dotenv-cli -e .env.local -- node scripts/test-l2-with-glossary.mjs
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

// Glossary terms matching the injected violations in generate-verification-data.mjs
const GLOSSARY_TERMS = [
  { src: 'training', correctTgt: 'การฝึกอบรม' },
  { src: 'system', correctTgt: 'ระบบ' },
  { src: 'report', correctTgt: 'รายงาน' },
  { src: 'performance', correctTgt: 'ประสิทธิภาพ' },
  { src: 'application', correctTgt: 'แอปพลิเคชัน' },
]

async function main() {
  console.log('=== L2 AI Test WITH Glossary Context ===\n')

  // 1. Setup tenant + project
  const tenantId = randomUUID()
  await post('/rest/v1/tenants', { id: tenantId, name: 'L2 Glossary Test' })
  const [project] = await post('/rest/v1/projects', {
    id: randomUUID(), tenant_id: tenantId, name: 'L2 Glossary Test',
    source_lang: 'en-US', target_langs: ['th-TH'],
  })
  const projectId = project.id
  console.log(`Project: ${projectId}`)

  // 2. Seed glossary with correct terms
  console.log('\nSeeding glossary terms...')
  const [glossary] = await post('/rest/v1/glossaries', {
    id: randomUUID(),
    tenant_id: tenantId,
    project_id: projectId,
    name: 'Verification Glossary',
    source_lang: 'en-US',
    target_lang: 'th-TH',
  })
  console.log(`  Glossary: ${glossary.id}`)

  for (const term of GLOSSARY_TERMS) {
    await post('/rest/v1/glossary_terms', {
      glossary_id: glossary.id,
      source_term: term.src,
      target_term: term.correctTgt,
      case_sensitive: false,
    })
    console.log(`  Term: "${term.src}" → "${term.correctTgt}"`)
  }

  // 3. Upload + parse file
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

  // Parse segments
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

  // 4. Trigger pipeline
  console.log('\nTriggering pipeline (Economy mode)...')
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
  console.log(`\nPipeline done in ${((Date.now() - start) / 1000).toFixed(0)}s`)

  // 5. Analyze L2 findings for glossary segments
  const findings = await query(`/rest/v1/findings?file_id=eq.${fileId}&select=id,severity,category,detected_by_layer,description,segment_id&limit=2000`)
  const segments = await query(`/rest/v1/segments?file_id=eq.${fileId}&select=id,segment_number&limit=1000`)
  const segIdToNum = new Map(segments.map(s => [s.id, s.segment_number]))

  const findingsBySegNum = new Map()
  for (const f of findings) {
    const segNum = segIdToNum.get(f.segment_id)
    if (!segNum) continue
    if (!findingsBySegNum.has(segNum)) findingsBySegNum.set(segNum, [])
    findingsBySegNum.get(segNum).push(f)
  }

  // Load baseline — check glossary_violation segments
  const ann = JSON.parse(readFileSync(join(__dirname, '..', 'docs', 'test-data', 'verification-baseline', 'baseline-annotations.json'), 'utf-8'))

  console.log('\n=== GLOSSARY VIOLATION DETECTION (WITH glossary context) ===\n')

  const glossarySegs = Object.entries(ann.segments).filter(([, v]) => v.error_type === 'glossary_violation')
  let glossaryTP = 0, glossaryFN = 0

  for (const [segNumStr, info] of glossarySegs) {
    const segNum = Number(segNumStr)
    const segFindings = findingsBySegNum.get(segNum) || []
    const detected = segFindings.length > 0

    if (detected) {
      glossaryTP++
      const f = segFindings[0]
      console.log(`  Seg ${segNum}: DETECTED — ${f.detected_by_layer} ${f.category}: ${f.description.substring(0, 80)}`)
    } else {
      glossaryFN++
      const segData = segmentBodies.find(s => s.segment_number === segNum)
      console.log(`  Seg ${segNum}: MISSED — ${info.description}`)
      if (segData) {
        console.log(`    TGT: ${segData.target_text.substring(0, 80)}`)
      }
    }
  }

  console.log(`\nGlossary detection: ${glossaryTP}/${glossarySegs.length} (${((glossaryTP / glossarySegs.length) * 100).toFixed(0)}%)`)

  // Also check consistency
  console.log('\n=== CONSISTENCY ERROR DETECTION ===\n')
  const consistencySegs = Object.entries(ann.segments).filter(([, v]) => v.error_type === 'consistency_error')
  let consTP = 0, consFN = 0

  for (const [segNumStr] of consistencySegs) {
    const segNum = Number(segNumStr)
    const segFindings = findingsBySegNum.get(segNum) || []
    if (segFindings.length > 0) consTP++
    else consFN++
  }
  console.log(`Consistency detection: ${consTP}/${consistencySegs.length} (${((consTP / consistencySegs.length) * 100).toFixed(0)}%)`)

  // Overall
  console.log('\n=== OVERALL WITH GLOSSARY ===')
  const baselineSet = new Set(Object.keys(ann.segments).map(Number))
  let tp = 0, fp = 0, fn = 0
  const matched = new Set()
  for (const f of findings) {
    const segNum = segIdToNum.get(f.segment_id)
    if (segNum && baselineSet.has(segNum)) { tp++; matched.add(segNum) }
    else fp++
  }
  for (const segNum of baselineSet) {
    if (!matched.has(segNum)) fn++
  }

  const precision = tp / (tp + fp) || 0
  const recall = tp / (tp + fn) || 0

  console.log(`Total findings: ${findings.length} (L1: ${findings.filter(f => f.detected_by_layer === 'L1').length}, L2: ${findings.filter(f => f.detected_by_layer === 'L2').length})`)
  console.log(`Precision: ${(precision * 100).toFixed(1)}% (target >= 70%)`)
  console.log(`Recall:    ${(recall * 100).toFixed(1)}% (target >= 60%)`)

  // Cleanup
  console.log('\nCleaning up...')
  await fetch(`${SUPABASE_URL}/rest/v1/glossary_terms?glossary_id=eq.${glossary.id}`, { method: 'DELETE', headers: adminHeaders })
  await fetch(`${SUPABASE_URL}/rest/v1/glossaries?id=eq.${glossary.id}`, { method: 'DELETE', headers: adminHeaders })
  await fetch(`${SUPABASE_URL}/rest/v1/files?project_id=eq.${projectId}`, { method: 'DELETE', headers: adminHeaders })
  await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}`, { method: 'DELETE', headers: adminHeaders })
  await fetch(`${SUPABASE_URL}/rest/v1/tenants?id=eq.${tenantId}`, { method: 'DELETE', headers: adminHeaders })
  console.log('Done.')
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
