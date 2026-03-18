/**
 * L2 AI Capability Test — hand-crafted segments with clear errors
 *
 * Tests what L2 (gpt-4o-mini) CAN and CANNOT detect.
 * Each segment is manually crafted with one specific error type.
 * No template generator — every error is guaranteed to exist.
 *
 * Usage: npx dotenv-cli -e .env.local -- node scripts/test-l2-capability.mjs
 */

import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

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

// ── Hand-crafted test segments ──
// Each has ONE clear error that L2 should be able to detect

const TEST_SEGMENTS = [
  // === Category 1: Glossary violations (with glossary context) ===
  {
    id: 1,
    type: 'glossary_violation',
    source: 'All employees must complete the training program before starting work.',
    target: 'พนักงานทุกคนต้องเข้าร่วมการเรียนก่อนเริ่มงาน',
    error: '"training" should be "การฝึกอบรม" not "การเรียน" (per glossary)',
  },
  {
    id: 2,
    type: 'glossary_violation',
    source: 'The system will automatically save your progress every 5 minutes.',
    target: 'เครื่องจะบันทึกความคืบหน้าของคุณโดยอัตโนมัติทุก 5 นาที',
    error: '"system" should be "ระบบ" not "เครื่อง" (per glossary)',
  },
  {
    id: 3,
    type: 'glossary_violation',
    source: 'Please submit the monthly performance report by Friday.',
    target: 'กรุณาส่งเอกสารผลงานประจำเดือนภายในวันศุกร์',
    error: '"report" should be "รายงาน" not "เอกสาร", "performance" should be "ประสิทธิภาพ" not "ผลงาน"',
  },

  // === Category 2: Mistranslation (meaning changed) ===
  {
    id: 4,
    type: 'mistranslation',
    source: 'The meeting has been postponed to next Monday.',
    target: 'การประชุมถูกยกเลิกในวันจันทร์หน้า',
    error: '"postponed" = เลื่อน, but target says "ยกเลิก" (cancelled) — meaning completely wrong',
  },
  {
    id: 5,
    type: 'mistranslation',
    source: 'Please decrease the temperature to 20 degrees.',
    target: 'กรุณาเพิ่มอุณหภูมิเป็น 20 องศา',
    error: '"decrease" = ลด, but target says "เพิ่ม" (increase) — opposite meaning',
  },
  {
    id: 6,
    type: 'mistranslation',
    source: 'The project was approved by the board of directors.',
    target: 'โครงการถูกปฏิเสธโดยคณะกรรมการบริหาร',
    error: '"approved" = อนุมัติ, but target says "ปฏิเสธ" (rejected) — opposite meaning',
  },

  // === Category 3: Omission (content missing) ===
  {
    id: 7,
    type: 'omission',
    source: 'Warning: Do not share your password with anyone. Change it every 90 days for security.',
    target: 'คำเตือน: อย่าแชร์รหัสผ่านกับใคร',
    error: 'Second sentence about changing password every 90 days is completely omitted',
  },
  {
    id: 8,
    type: 'omission',
    source: 'The package includes breakfast, lunch, and dinner for all three days.',
    target: 'แพ็คเกจรวมอาหารเช้าสำหรับทั้งสามวัน',
    error: '"lunch" and "dinner" omitted — only breakfast mentioned',
  },

  // === Category 4: Addition (content added that is not in source) ===
  {
    id: 9,
    type: 'addition',
    source: 'Click Save to continue.',
    target: 'คลิกบันทึกเพื่อดำเนินการต่อ โปรดตรวจสอบข้อมูลให้ถูกต้องก่อนบันทึก',
    error: 'Added "โปรดตรวจสอบข้อมูลให้ถูกต้องก่อนบันทึก" (please verify data before saving) — not in source',
  },

  // === Category 5: Fluency (unnatural Thai) ===
  {
    id: 10,
    type: 'fluency',
    source: 'Thank you for your patience while we process your request.',
    target: 'ขอบคุณสำหรับความอดทนของคุณในขณะที่เราประมวลผลคำร้องขอของคุณ',
    error: 'Overly literal translation — "ความอดทนของคุณ" + "คำร้องขอของคุณ" sounds robotic in Thai',
  },

  // === Category 6: Clean segments (no error — should NOT be flagged) ===
  {
    id: 11,
    type: 'clean',
    source: 'Welcome to the application. Please sign in to continue.',
    target: 'ยินดีต้อนรับสู่แอปพลิเคชัน กรุณาลงชื่อเข้าใช้เพื่อดำเนินการต่อ',
    error: null,
  },
  {
    id: 12,
    type: 'clean',
    source: 'Your order has been confirmed. You will receive an email shortly.',
    target: 'คำสั่งซื้อของคุณได้รับการยืนยันแล้ว คุณจะได้รับอีเมลในไม่ช้า',
    error: null,
  },
  {
    id: 13,
    type: 'clean',
    source: 'The training session will begin at 9:00 AM in Conference Room B.',
    target: 'การฝึกอบรมจะเริ่มเวลา 9:00 น. ที่ห้องประชุม B',
    error: null,
  },
  {
    id: 14,
    type: 'clean',
    source: 'Please review the report and provide your feedback.',
    target: 'กรุณาตรวจสอบรายงานและให้ข้อเสนอแนะ',
    error: null,
  },
  {
    id: 15,
    type: 'clean',
    source: 'The system performance has been optimized for better speed.',
    target: 'ประสิทธิภาพของระบบได้รับการปรับปรุงเพื่อความเร็วที่ดียิ่งขึ้น',
    error: null,
  },
]

async function main() {
  console.log('=== L2 AI Capability Test ===')
  console.log(`Segments: ${TEST_SEGMENTS.length} (${TEST_SEGMENTS.filter(s => s.error).length} with errors, ${TEST_SEGMENTS.filter(s => !s.error).length} clean)\n`)

  // 1. Setup
  const tenantId = randomUUID()
  await post('/rest/v1/tenants', { id: tenantId, name: 'L2 Capability Test' })
  const [project] = await post('/rest/v1/projects', {
    id: randomUUID(), tenant_id: tenantId, name: 'L2 Capability Test',
    source_lang: 'en-US', target_langs: ['th-TH'],
  })
  const projectId = project.id

  // 2. Seed glossary
  const [glossary] = await post('/rest/v1/glossaries', {
    id: randomUUID(), tenant_id: tenantId, project_id: projectId,
    name: 'Test Glossary', source_lang: 'en-US', target_lang: 'th-TH',
  })
  const glossaryTerms = [
    { source_term: 'training', target_term: 'การฝึกอบรม' },
    { source_term: 'system', target_term: 'ระบบ' },
    { source_term: 'report', target_term: 'รายงาน' },
    { source_term: 'performance', target_term: 'ประสิทธิภาพ' },
    { source_term: 'application', target_term: 'แอปพลิเคชัน' },
  ]
  for (const term of glossaryTerms) {
    await post('/rest/v1/glossary_terms', {
      glossary_id: glossary.id, ...term, case_sensitive: false,
    })
  }
  console.log(`Glossary seeded: ${glossaryTerms.length} terms`)

  // 3. Create file + segments
  const [file] = await post('/rest/v1/files', {
    project_id: projectId, tenant_id: tenantId,
    file_name: 'l2-capability-test.sdlxliff', file_type: 'sdlxliff',
    file_size_bytes: 1024, file_hash: randomUUID().replace(/-/g, ''),
    storage_path: `${tenantId}/${projectId}/l2-test.sdlxliff`, status: 'uploaded',
  })
  const fileId = file.id

  const segRows = TEST_SEGMENTS.map(s => ({
    file_id: fileId, project_id: projectId, tenant_id: tenantId,
    segment_number: s.id, source_text: s.source, target_text: s.target,
    source_lang: 'en-US', target_lang: 'th-TH', word_count: 15,
  }))
  await fetch(`${SUPABASE_URL}/rest/v1/segments`, {
    method: 'POST', headers: { ...adminHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(segRows),
  })

  await fetch(`${SUPABASE_URL}/rest/v1/files?id=eq.${fileId}`, {
    method: 'PATCH', headers: { ...adminHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'parsed' }),
  })

  // 4. Run pipeline
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

  const start = Date.now()
  while (Date.now() - start < 300_000) {
    const [f] = await query(`/rest/v1/files?id=eq.${fileId}&select=status`)
    process.stdout.write(`  ${f.status}  \r`)
    if (f.status === 'l2_completed') break
    if (f.status === 'failed') throw new Error('Pipeline failed')
    await new Promise(r => setTimeout(r, 3000))
  }
  console.log(`\nDone in ${((Date.now() - start) / 1000).toFixed(0)}s\n`)

  // 5. Get findings
  const findings = await query(`/rest/v1/findings?file_id=eq.${fileId}&select=id,severity,category,detected_by_layer,description,segment_id&limit=200`)
  const segments = await query(`/rest/v1/segments?file_id=eq.${fileId}&select=id,segment_number&limit=100`)
  const segIdToNum = new Map(segments.map(s => [s.id, s.segment_number]))

  const findingsBySegNum = new Map()
  for (const f of findings) {
    const segNum = segIdToNum.get(f.segment_id)
    if (!segNum) continue
    if (!findingsBySegNum.has(segNum)) findingsBySegNum.set(segNum, [])
    findingsBySegNum.get(segNum).push(f)
  }

  // 6. Report
  console.log('=== RESULTS ===\n')
  console.log('Seg | Type                | Error?   | Detected? | Layer | Findings')
  console.log('----|---------------------|----------|-----------|-------|----------')

  let tp = 0, fp = 0, fn = 0, tn = 0

  for (const seg of TEST_SEGMENTS) {
    const segFindings = findingsBySegNum.get(seg.id) || []
    const hasError = seg.error !== null
    const detected = segFindings.length > 0

    let status
    if (hasError && detected) { status = 'TP'; tp++ }
    else if (hasError && !detected) { status = 'FN'; fn++ }
    else if (!hasError && detected) { status = 'FP'; fp++ }
    else { status = 'TN'; tn++ }

    const findingSummary = segFindings.length > 0
      ? segFindings.map(f => `${f.detected_by_layer}:${f.category}`).join(', ')
      : '-'

    console.log(
      `${String(seg.id).padStart(3)} | ${seg.type.padEnd(19)} | ${(hasError ? 'YES' : 'no').padEnd(8)} | ${status.padEnd(9)} | ${(segFindings[0]?.detected_by_layer || '-').padEnd(5)} | ${findingSummary}`
    )
  }

  console.log('\n=== SUMMARY ===')
  console.log(`TP (error + detected):  ${tp}`)
  console.log(`FN (error + missed):    ${fn}`)
  console.log(`FP (clean + flagged):   ${fp}`)
  console.log(`TN (clean + not flagged): ${tn}`)
  console.log(``)
  console.log(`Precision: ${((tp / (tp + fp)) * 100 || 0).toFixed(0)}%`)
  console.log(`Recall:    ${((tp / (tp + fn)) * 100 || 0).toFixed(0)}%`)
  console.log(``)

  // Detail on FN
  if (fn > 0) {
    console.log('=== MISSED ERRORS (FN) ===')
    for (const seg of TEST_SEGMENTS) {
      if (seg.error && !findingsBySegNum.has(seg.id)) {
        console.log(`  Seg ${seg.id} [${seg.type}]: ${seg.error}`)
      }
    }
  }

  // Detail on FP
  if (fp > 0) {
    console.log('\n=== FALSE ALARMS (FP) ===')
    for (const seg of TEST_SEGMENTS) {
      if (!seg.error && findingsBySegNum.has(seg.id)) {
        const f = findingsBySegNum.get(seg.id)
        console.log(`  Seg ${seg.id}: ${f.map(x => x.description).join('; ')}`)
      }
    }
  }

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
