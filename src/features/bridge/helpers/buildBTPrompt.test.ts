/**
 * ATDD Story 5.1 — buildBTPrompt unit tests
 *
 * Tests the back-translation prompt builder:
 *   - System role: "translate what IS written" (Guardrail #55)
 *   - Thai-specific enhancement for th-* languages (Guardrail #68)
 *   - CJK instructions for zh/ja/ko via getBTLanguageInstructions (Guardrail #69)
 *   - Confidence scale instructions (0.0–1.0)
 *   - Language notes (7 noteType categories)
 */

import { describe, it, expect } from 'vitest'

import { buildBTPrompt } from './buildBTPrompt'

describe('buildBTPrompt', () => {
  // ── AC3 / Scenario 3.3 [P0]: System role principle ─────────────────────
  it('should include "translate what IS written" in system role', () => {
    // Guardrail #55: core BT principle — expose errors, don't fix them
    const prompt = buildBTPrompt({
      sourceText: 'The quick brown fox',
      targetText: 'สุนัขจิ้งจอกสีน้ำตาล',
      sourceLang: 'en-US',
      targetLang: 'th-TH',
      contextSegments: [],
    })

    expect(prompt.system).toContain('translate what IS written')
    // Core principle must NOT instruct to correct/improve the translation
    expect(prompt.system).toContain('Never fix')
    expect(prompt.system).toContain('translate it exactly as it appears')
  })

  // ── AC3 / Scenario 3.1 [P0]: Thai-specific instructions ───────────────
  it('should inject Thai-specific instructions for th-* targetLang', () => {
    // Guardrail #68: Thai tone markers, compound words, politeness particles
    const prompt = buildBTPrompt({
      sourceText: 'Hello',
      targetText: 'สวัสดีครับ',
      sourceLang: 'en-US',
      targetLang: 'th-TH',
      contextSegments: [],
    })

    // Must mention all 3 Thai aspects (in system prompt)
    expect(prompt.system).toMatch(/[Tt]one [Mm]arker/)
    expect(prompt.system).toMatch(/[Cc]ompound [Ww]ord/)
    expect(prompt.system).toMatch(/[Pp]article|[Pp]oliteness/)
  })

  it('should NOT inject Thai instructions for non-Thai languages', () => {
    const prompt = buildBTPrompt({
      sourceText: 'Hello',
      targetText: 'Bonjour',
      sourceLang: 'en-US',
      targetLang: 'fr-FR',
      contextSegments: [],
    })

    expect(prompt.system).not.toContain('Thai Tone Marker')
    expect(prompt.system).not.toContain('Thai Compound Word')
  })

  // ── AC3 / Scenario 3.2 [P1]: CJK instructions ─────────────────────────
  it('should inject CJK language instructions for zh targetLang', () => {
    // Guardrail #69: getBTLanguageInstructions(targetLang) for CJK
    const prompt = buildBTPrompt({
      sourceText: 'Settings',
      targetText: '设置',
      sourceLang: 'en-US',
      targetLang: 'zh-CN',
      contextSegments: [],
    })

    // CJK-specific section should be present
    expect(prompt.system).toMatch(/[Cc]hinese/)
  })

  it('should inject CJK language instructions for ja targetLang', () => {
    const prompt = buildBTPrompt({
      sourceText: 'Settings',
      targetText: '設定',
      sourceLang: 'en-US',
      targetLang: 'ja-JP',
      contextSegments: [],
    })

    expect(prompt.system).toMatch(/[Jj]apanese/)
  })

  it('should inject CJK language instructions for ko targetLang', () => {
    const prompt = buildBTPrompt({
      sourceText: 'Settings',
      targetText: '설정',
      sourceLang: 'en-US',
      targetLang: 'ko-KR',
      contextSegments: [],
    })

    expect(prompt.system).toMatch(/[Kk]orean/)
  })

  // ── AC1+AC3 / Scenario 3.6 [P2]: Thai particles ───────────────────────
  it('should instruct noting Thai particles as politeness markers', () => {
    const prompt = buildBTPrompt({
      sourceText: 'Thank you',
      targetText: 'ขอบคุณครับ',
      sourceLang: 'en-US',
      targetLang: 'th-TH',
      contextSegments: [],
    })

    // Instructions should tell AI to note particles like ครับ/ค่ะ/นะ/คะ
    expect(prompt.system).toMatch(/ครับ|ค่ะ|นะ|คะ|politeness/)
  })

  // ── AC2 / Confidence instructions ──────────────────────────────────────
  it('should include confidence scale instructions (0.0–1.0)', () => {
    const prompt = buildBTPrompt({
      sourceText: 'Hello',
      targetText: 'Bonjour',
      sourceLang: 'en-US',
      targetLang: 'fr-FR',
      contextSegments: [],
    })

    expect(prompt.system).toContain('confidence')
    expect(prompt.system).toMatch(/0\.0.*1\.0|0.*to.*1/)
  })

  // ── Context segments included ──────────────────────────────────────────
  it('should include surrounding context segments in prompt', () => {
    const prompt = buildBTPrompt({
      sourceText: 'Current segment',
      targetText: 'เซ็กเมนต์ปัจจุบัน',
      sourceLang: 'en-US',
      targetLang: 'th-TH',
      contextSegments: [
        { sourceText: 'Previous segment', targetText: 'เซ็กเมนต์ก่อนหน้า', segmentNumber: 1 },
        { sourceText: 'Next segment', targetText: 'เซ็กเมนต์ถัดไป', segmentNumber: 3 },
      ],
    })

    expect(prompt.user).toContain('Previous segment')
    expect(prompt.user).toContain('Next segment')
  })

  // ── Language notes: 7 noteType categories ──────────────────────────────
  it('should include instructions for all 7 noteType categories', () => {
    const prompt = buildBTPrompt({
      sourceText: 'Test',
      targetText: 'ทดสอบ',
      sourceLang: 'en-US',
      targetLang: 'th-TH',
      contextSegments: [],
    })

    const noteTypes = [
      'tone_marker',
      'politeness_particle',
      'compound_word',
      'cultural_adaptation',
      'register',
      'idiom',
      'ambiguity',
    ]

    for (const noteType of noteTypes) {
      expect(prompt.system).toContain(noteType)
    }
  })
})
