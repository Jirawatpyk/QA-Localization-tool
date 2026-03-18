/**
 * AI Pipeline Integration — L2 Semantic Detection Quality
 *
 * Verifies L2 (gpt-4o-mini) can detect specific semantic error types.
 * Each segment has ONE clear error — asserts L2 detects it (or logs miss).
 *
 * This test exposes L2 weaknesses for prompt tuning (TD-AI-009).
 * Run: INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx vitest run src/features/pipeline/__tests__/pipeline-integration-l2-quality.test.ts --project unit
 */
import { randomUUID } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  HAS_PREREQUISITES,
  TIMEOUT,
  cleanupTenantProject,
  createTestFile,
  insertSegments,
  pollFileStatus,
  postRest,
  queryRest,
  setFileParsed,
  triggerPipeline,
} from './pipeline-integration.helpers'

// Hand-crafted segments with CLEAR semantic errors that L2 should detect
const L2_TEST_CASES = [
  {
    segmentNumber: 1,
    sourceText: 'The meeting has been postponed to next Monday.',
    targetText: 'การประชุมถูกยกเลิกในวันจันทร์หน้า',
    errorType: 'mistranslation',
    errorDetail: 'postponed(เลื่อน) → ยกเลิก(cancelled) — opposite meaning',
  },
  {
    segmentNumber: 2,
    sourceText: 'Please decrease the temperature to 20 degrees.',
    targetText: 'กรุณาเพิ่มอุณหภูมิเป็น 20 องศา',
    errorType: 'mistranslation',
    errorDetail: 'decrease(ลด) → เพิ่ม(increase) — opposite meaning',
  },
  {
    segmentNumber: 3,
    sourceText: 'The project was approved by the board of directors.',
    targetText: 'โครงการถูกปฏิเสธโดยคณะกรรมการบริหาร',
    errorType: 'mistranslation',
    errorDetail: 'approved(อนุมัติ) → ปฏิเสธ(rejected) — opposite meaning',
  },
  {
    segmentNumber: 4,
    sourceText: 'Warning: Do not share your password. Change it every 90 days.',
    targetText: 'คำเตือน: อย่าแชร์รหัสผ่านกับใคร',
    errorType: 'omission',
    errorDetail: 'Second sentence about changing password every 90 days omitted',
  },
  {
    segmentNumber: 5,
    sourceText: 'Click Save to continue.',
    targetText: 'คลิกบันทึกเพื่อดำเนินการต่อ โปรดตรวจสอบข้อมูลให้ถูกต้องก่อนบันทึก',
    errorType: 'addition',
    errorDetail: 'Added content not in source: โปรดตรวจสอบข้อมูลให้ถูกต้องก่อนบันทึก',
  },
  // Clean segments — L2 should NOT flag these
  {
    segmentNumber: 6,
    sourceText: 'Welcome to the application. Please sign in.',
    targetText: 'ยินดีต้อนรับสู่แอปพลิเคชัน กรุณาลงชื่อเข้าใช้',
    errorType: null,
    errorDetail: null,
  },
  {
    segmentNumber: 7,
    sourceText: 'Your order has been confirmed.',
    targetText: 'คำสั่งซื้อของคุณได้รับการยืนยันแล้ว',
    errorType: null,
    errorDetail: null,
  },
]

describe.skipIf(!HAS_PREREQUISITES)('L2 Semantic Detection Quality', () => {
  let tenantId: string
  let projectId: string
  let fileId: string

  beforeAll(async () => {
    tenantId = randomUUID()
    await postRest('/rest/v1/tenants', { id: tenantId, name: 'L2 Quality Test' })
    const [project] = (await postRest('/rest/v1/projects', {
      id: randomUUID(),
      tenant_id: tenantId,
      name: 'L2 Quality Test',
      source_lang: 'en-US',
      target_langs: ['th-TH'],
    })) as Array<{ id: string }>
    projectId = project!.id

    fileId = await createTestFile(projectId, tenantId, 'l2-quality-test.sdlxliff')
    await insertSegments(
      fileId,
      projectId,
      tenantId,
      L2_TEST_CASES.map((s) => ({
        segmentNumber: s.segmentNumber,
        sourceText: s.sourceText,
        targetText: s.targetText,
      })),
    )
    await setFileParsed(fileId)
  }, TIMEOUT.SETUP)

  afterAll(async () => {
    await cleanupTenantProject(tenantId, projectId)
  }, TIMEOUT.CLEANUP)

  it(
    'should run L2 and produce findings report',
    async () => {
      await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'economy' })
      await pollFileStatus(fileId, 'l2_completed', TIMEOUT.ECONOMY_PIPELINE)

      // Get all findings with segment mapping
      const findings = (await queryRest(
        `/rest/v1/findings?file_id=eq.${fileId}&select=id,severity,category,detected_by_layer,description,segment_id&limit=100`,
      )) as Array<{
        id: string
        severity: string
        category: string
        detected_by_layer: string
        description: string
        segment_id: string
      }>

      const segments = (await queryRest(
        `/rest/v1/segments?file_id=eq.${fileId}&select=id,segment_number&limit=20`,
      )) as Array<{ id: string; segment_number: number }>
      const segMap = new Map(segments.map((s) => [s.id, s.segment_number]))

      // Build per-segment findings
      const findingsBySegNum = new Map<number, typeof findings>()
      for (const f of findings) {
        const segNum = segMap.get(f.segment_id)
        if (segNum === undefined) continue
        if (!findingsBySegNum.has(segNum)) findingsBySegNum.set(segNum, [])
        findingsBySegNum.get(segNum)!.push(f)
      }

      // Report each test case
      let detected = 0
      let missed = 0
      let falsePositive = 0

      // eslint-disable-next-line no-console
      console.log('\n[L2 QUALITY] Per-segment detection report:')
      for (const tc of L2_TEST_CASES) {
        const segFindings = findingsBySegNum.get(tc.segmentNumber) ?? []
        const l2Findings = segFindings.filter((f) => f.detected_by_layer === 'L2')
        const hasError = tc.errorType !== null

        if (hasError && l2Findings.length > 0) {
          detected++
          // eslint-disable-next-line no-console
          console.log(
            `  Seg ${tc.segmentNumber} [${tc.errorType}]: ✅ DETECTED — ${l2Findings[0]!.category}`,
          )
        } else if (hasError && l2Findings.length === 0) {
          missed++
          // eslint-disable-next-line no-console
          console.log(`  Seg ${tc.segmentNumber} [${tc.errorType}]: ❌ MISSED — ${tc.errorDetail}`)
        } else if (!hasError && l2Findings.length > 0) {
          falsePositive++
          // eslint-disable-next-line no-console
          console.log(
            `  Seg ${tc.segmentNumber} [clean]: ⚠️ FALSE POSITIVE — ${l2Findings[0]!.description.substring(0, 60)}`,
          )
        } else {
          // eslint-disable-next-line no-console
          console.log(`  Seg ${tc.segmentNumber} [clean]: ✅ CORRECT — not flagged`)
        }
      }

      const errorCount = L2_TEST_CASES.filter((t) => t.errorType !== null).length
      const cleanCount = L2_TEST_CASES.filter((t) => t.errorType === null).length
      const l2Recall = errorCount > 0 ? detected / errorCount : 0
      const l2Precision = detected + falsePositive > 0 ? detected / (detected + falsePositive) : 0

      // eslint-disable-next-line no-console
      console.log(`\n[L2 QUALITY] Summary:`)
      // eslint-disable-next-line no-console
      console.log(
        `  Errors: ${detected}/${errorCount} detected (${(l2Recall * 100).toFixed(0)}% recall)`,
      )
      // eslint-disable-next-line no-console
      console.log(
        `  Clean: ${cleanCount - falsePositive}/${cleanCount} correct (${falsePositive} FP)`,
      )
      // eslint-disable-next-line no-console
      console.log(`  L2 Precision: ${(l2Precision * 100).toFixed(0)}%`)

      // L2 MUST detect at least 1 semantic error — if 0, L2 is broken
      expect(detected).toBeGreaterThan(0)

      // Track for TD-AI-009: log actual recall for monitoring
      // Current gpt-4o-mini typically detects 1-3 out of 5 semantic errors
      // This test doesn't fail on low recall — it REPORTS it for prompt tuning
    },
    TIMEOUT.ECONOMY_TEST,
  )
})
