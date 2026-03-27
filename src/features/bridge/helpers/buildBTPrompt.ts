import { getLanguageInstructions } from '@/features/pipeline/prompts/language-instructions'

type ContextSegment = {
  sourceText: string
  targetText: string
  segmentNumber: number
}

type BuildBTPromptInput = {
  sourceText: string
  targetText: string
  sourceLang: string
  targetLang: string
  contextSegments: ContextSegment[]
}

/**
 * Build system and user prompts for back-translation AI call.
 *
 * Guardrail #55: "Translate what IS written, not what SHOULD be."
 * This is the core principle — if the target has errors, the back-translation must expose them.
 */
export function buildBTPrompt(input: BuildBTPromptInput): { system: string; user: string } {
  const { sourceText, targetText, sourceLang, targetLang, contextSegments } = input

  const system = buildSystemPrompt(targetLang)
  const user = buildUserPrompt({ sourceText, targetText, sourceLang, targetLang, contextSegments })

  return { system, user }
}

function buildSystemPrompt(targetLang: string): string {
  const parts: string[] = []

  parts.push(`You are a professional back-translation specialist.

## Core Principle
translate what IS written in the target text, not what SHOULD be written.
If the translation contains errors, your back-translation must reflect those errors faithfully.
Never fix, clean up, or normalize the text — translate it exactly as it appears.

## Task
Given a source text and its translation (target text), provide:
1. A faithful back-translation of the target text into the source language
2. A contextual explanation noting nuances, cultural context, or register choices
3. A confidence score (0.0 to 1.0) indicating how confident you are in the back-translation accuracy
4. Language notes categorized by type

## Confidence Scale
- 1.0: Perfect confidence — unambiguous, straightforward translation
- 0.8-0.9: High confidence — minor ambiguity but meaning is clear
- 0.6-0.7: Moderate confidence — some nuances may be lost or ambiguous
- 0.4-0.5: Low confidence — significant ambiguity or unfamiliar constructs
- 0.0-0.3: Very low confidence — cannot reliably determine meaning

## Language Notes Categories
For each notable aspect of the translation, provide a note with one of these types:
- tone_marker: Tone or intonation markers in the language
- politeness_particle: Politeness or formality markers
- compound_word: Compound words that should be treated as single concepts
- cultural_adaptation: Cultural references or adaptations
- register: Formality level or register choices
- idiom: Idiomatic expressions
- ambiguity: Ambiguous passages with multiple interpretations`)

  // Guardrail #68: Thai-specific instructions
  const primaryLang = targetLang.split('-')[0]!.toLowerCase()
  if (primaryLang === 'th') {
    parts.push(getBTThaiInstructions())
  }

  // Guardrail #69: CJK-specific instructions
  if (['zh', 'ja', 'ko'].includes(primaryLang)) {
    parts.push(getBTLanguageInstructions(targetLang))
  }

  // Reuse existing language instructions for QA context
  const langInstructions = getLanguageInstructions(targetLang)
  if (langInstructions) {
    parts.push(`\n## QA Context\n${langInstructions}`)
  }

  return parts.join('\n\n')
}

function buildUserPrompt(input: BuildBTPromptInput): string {
  const { sourceText, targetText, sourceLang, targetLang, contextSegments } = input
  const parts: string[] = []

  // Context segments for surrounding context
  if (contextSegments.length > 0) {
    parts.push('## Surrounding Context')
    for (const seg of contextSegments) {
      parts.push(`Segment ${seg.segmentNumber}:`)
      parts.push(`  Source: ${seg.sourceText}`)
      parts.push(`  Target: ${seg.targetText}`)
    }
    parts.push('')
  }

  parts.push('## Current Segment')
  parts.push(`Source language: ${sourceLang}`)
  parts.push(`Target language: ${targetLang}`)
  parts.push(`Source text: ${sourceText}`)
  parts.push(`Target text: ${targetText}`)
  parts.push('')
  parts.push(
    'Provide a back-translation of the target text into the source language, along with contextual explanation, confidence score, and language notes.',
  )

  return parts.join('\n')
}

/**
 * Guardrail #68: Thai-specific back-translation instructions.
 *
 * Three aspects:
 * 1. Tone markers (สระ/วรรณยุกต์)
 * 2. Compound words (คำประสม)
 * 3. Politeness particles (ครับ/ค่ะ/นะ/คะ)
 */
function getBTThaiInstructions(): string {
  return `## Thai Language Back-Translation Instructions

### 1. Thai Tone Markers
Thai uses tone marks (่ ้ ๊ ๋) and vowel forms that affect meaning.
When back-translating, note any tone-dependent meaning differences.
Add a language note with noteType "tone_marker" for each significant tone-dependent word.

### 2. Thai Compound Words
Thai compound words (e.g., โรงพยาบาล=hospital, มหาวิทยาลัย=university) should be translated as single concepts.
Do NOT split compound words into individual morphemes.
Add a language note with noteType "compound_word" for compound words that may be confusing.

### 3. Thai Politeness Particles
Thai particles (ครับ/ค่ะ/นะ/คะ/จ้า/จ๊ะ) indicate politeness level and gender of speaker.
Note these in language notes with noteType "politeness_particle" — they are cultural markers, NOT errors.
Explain the register they convey (formal, informal, feminine, masculine).`
}

/**
 * Guardrail #69: CJK-specific back-translation instructions.
 * Augments existing getLanguageInstructions() with BT-specific guidance.
 */
export function getBTLanguageInstructions(targetLang: string): string {
  const primaryLang = targetLang.split('-')[0]!.toLowerCase()

  switch (primaryLang) {
    case 'zh':
      return `## Chinese Back-Translation Instructions
- Preserve the meaning of measure words (量词) in back-translation — note them as language notes
- If the text uses Simplified vs Traditional characters inconsistently, note it
- Four-character idioms (成语) should be back-translated with their meaning, with the idiom noted
- Note any cultural adaptations (e.g., Chinese internet slang, regional expressions)`

    case 'ja':
      return `## Japanese Back-Translation Instructions
- Preserve honorific levels (敬語 keigo) in the back-translation
- Note katakana loanwords (外来語) — back-translate to their original language equivalent
- です/ます vs casual form differences should be reflected in back-translation register
- Note any culturally-specific expressions that don't translate directly`

    case 'ko':
      return `## Korean Back-Translation Instructions
- Preserve formality level (존댓말 vs 반말) in back-translation
- Note Sino-Korean (한자어) vs native Korean (순우리말) word choices
- Honorific markers (-님, -씨) should be noted in language notes
- Note any cultural expressions specific to Korean context`

    default:
      return ''
  }
}
