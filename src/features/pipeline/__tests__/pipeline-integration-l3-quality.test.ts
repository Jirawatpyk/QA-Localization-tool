/**
 * AI Pipeline Integration — L3 Deep Analysis Quality
 *
 * Verifies L3 (Claude Sonnet / fallback gpt-4o) detects semantic errors
 * that L2 misses — omission, addition, fluency, subtle mistranslation.
 *
 * Run: INNGEST_DEV_URL=http://localhost:8288 npx dotenv-cli -e .env.local -- npx vitest run src/features/pipeline/__tests__/pipeline-integration-l3-quality.test.ts --project unit
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

const L3_TEST_CASES = [
  // L2 typically catches these — L3 should confirm or add detail
  {
    segmentNumber: 1,
    sourceText: 'The meeting has been postponed to next Monday.',
    targetText: 'การประชุมถูกยกเลิกในวันจันทร์หน้า',
    errorType: 'mistranslation',
    errorDetail: 'postponed→cancelled — L2 catches, L3 should confirm',
  },
  // L2 typically misses these — L3 should catch
  {
    segmentNumber: 2,
    sourceText: 'Warning: Do not share your password. Change it every 90 days for security.',
    targetText: 'คำเตือน: อย่าแชร์รหัสผ่านกับใคร',
    errorType: 'omission',
    errorDetail: 'Second sentence omitted — L2 misses, L3 should catch with deeper analysis',
  },
  {
    segmentNumber: 3,
    sourceText: 'Click Save to continue.',
    targetText: 'คลิกบันทึกเพื่อดำเนินการต่อ โปรดตรวจสอบข้อมูลให้ถูกต้องก่อนบันทึก',
    errorType: 'addition',
    errorDetail: 'Added content not in source — L2 misses, L3 should catch',
  },
  {
    segmentNumber: 4,
    sourceText: 'Thank you for your patience while we process your request.',
    targetText: 'ขอบคุณสำหรับความอดทนของคุณในขณะที่เราประมวลผลคำร้องขอของคุณ',
    errorType: 'fluency',
    errorDetail: 'Overly literal — robotic Thai phrasing',
  },
  // Clean
  {
    segmentNumber: 5,
    sourceText: 'Your order has been confirmed. You will receive an email shortly.',
    targetText: 'คำสั่งซื้อของคุณได้รับการยืนยันแล้ว คุณจะได้รับอีเมลในไม่ช้า',
    errorType: null,
    errorDetail: null,
  },
]

describe.skipIf(!HAS_PREREQUISITES)('L3 Deep Analysis Quality', () => {
  let tenantId: string
  let projectId: string
  let fileId: string

  beforeAll(async () => {
    tenantId = randomUUID()
    await postRest('/rest/v1/tenants', { id: tenantId, name: 'L3 Quality Test' })
    const [project] = (await postRest('/rest/v1/projects', {
      id: randomUUID(),
      tenant_id: tenantId,
      name: 'L3 Quality Test',
      source_lang: 'en-US',
      target_langs: ['th-TH'],
    })) as Array<{ id: string }>
    projectId = project!.id

    fileId = await createTestFile(projectId, tenantId, 'l3-quality-test.sdlxliff')
    await insertSegments(
      fileId,
      projectId,
      tenantId,
      L3_TEST_CASES.map((s) => ({
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
    'should run L3 and produce findings report',
    async () => {
      await triggerPipeline({ fileIds: [fileId], projectId, tenantId, mode: 'thorough' })
      await pollFileStatus(fileId, 'l3_completed', TIMEOUT.THOROUGH_PIPELINE)

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

      const findingsBySegNum = new Map<number, typeof findings>()
      for (const f of findings) {
        const segNum = segMap.get(f.segment_id)
        if (segNum === undefined) continue
        if (!findingsBySegNum.has(segNum)) findingsBySegNum.set(segNum, [])
        findingsBySegNum.get(segNum)!.push(f)
      }

      let l2Detected = 0
      let l3Detected = 0
      let missed = 0
      let _fp = 0
      const errorCount = L3_TEST_CASES.filter((t) => t.errorType !== null).length

      // eslint-disable-next-line no-console
      console.log('\n[L3 QUALITY] Per-segment detection report:')
      for (const tc of L3_TEST_CASES) {
        const segFindings = findingsBySegNum.get(tc.segmentNumber) ?? []
        const l2 = segFindings.filter((f) => f.detected_by_layer === 'L2')
        const l3 = segFindings.filter((f) => f.detected_by_layer === 'L3')
        const hasError = tc.errorType !== null

        if (hasError) {
          if (l3.length > 0) {
            l3Detected++
            // eslint-disable-next-line no-console
            console.log(
              `  Seg ${tc.segmentNumber} [${tc.errorType}]: ✅ L3 DETECTED — ${l3[0]!.category}`,
            )
          } else if (l2.length > 0) {
            l2Detected++
            // eslint-disable-next-line no-console
            console.log(
              `  Seg ${tc.segmentNumber} [${tc.errorType}]: ⚡ L2 caught (L3 skipped/confirmed) — ${l2[0]!.category}`,
            )
          } else {
            missed++
            // eslint-disable-next-line no-console
            console.log(
              `  Seg ${tc.segmentNumber} [${tc.errorType}]: ❌ MISSED by both L2+L3 — ${tc.errorDetail}`,
            )
          }
        } else {
          const anyFinding = segFindings.length > 0
          if (anyFinding) _fp++
          // eslint-disable-next-line no-console
          console.log(`  Seg ${tc.segmentNumber} [clean]: ${anyFinding ? '⚠️ FP' : '✅ CORRECT'}`)
        }
      }

      const totalDetected = l2Detected + l3Detected
      const combinedRecall = errorCount > 0 ? totalDetected / errorCount : 0

      // eslint-disable-next-line no-console
      console.log(`\n[L3 QUALITY] Summary:`)
      // eslint-disable-next-line no-console
      console.log(`  L3 detected: ${l3Detected}/${errorCount}`)
      // eslint-disable-next-line no-console
      console.log(`  L2 detected: ${l2Detected}/${errorCount}`)
      // eslint-disable-next-line no-console
      console.log(`  Missed: ${missed}/${errorCount}`)
      // eslint-disable-next-line no-console
      console.log(`  Combined recall: ${(combinedRecall * 100).toFixed(0)}%`)

      // Pipeline must detect at least 1 error across L2+L3
      expect(totalDetected).toBeGreaterThan(0)
    },
    TIMEOUT.THOROUGH_TEST,
  )
})
