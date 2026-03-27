import type { LanguageNote } from '../types'

// Thai tone marks: mai ek (่), mai tho (้), mai tri (๊), mai chattawa (๋)
const THAI_TONE_MARKS = /[\u0E48\u0E49\u0E4A\u0E4B]/g

/**
 * Count Thai tone markers in a text string.
 * Tone marks: ่ (U+0E48), ้ (U+0E49), ๊ (U+0E4A), ๋ (U+0E4B)
 */
export function countThaiToneMarkers(text: string): number {
  const matches = text.match(THAI_TONE_MARKS)
  return matches ? matches.length : 0
}

/**
 * Verify that Thai tone markers from the target text are reflected
 * in the back-translation's language notes.
 *
 * AC3: Preservation rate >= 98%
 *
 * @param targetText - Original Thai target text
 * @param languageNotes - Language notes from back-translation result
 * @returns Preservation rate (0.0 to 1.0) and details
 */
export function verifyToneMarkerPreservation(
  targetText: string,
  languageNotes: LanguageNote[],
): { rate: number; totalMarkers: number; referencedMarkers: number } {
  const totalMarkers = countThaiToneMarkers(targetText)

  // If no tone markers in the target, preservation is perfect
  if (totalMarkers === 0) {
    return { rate: 1.0, totalMarkers: 0, referencedMarkers: 0 }
  }

  // Count tone markers referenced in language notes with noteType 'tone_marker'
  const toneNotes = languageNotes.filter((note) => note.noteType === 'tone_marker')
  let referencedMarkers = 0
  for (const note of toneNotes) {
    referencedMarkers += countThaiToneMarkers(note.originalText)
  }

  // Clamp to total (a note may reference a marker more than once)
  referencedMarkers = Math.min(referencedMarkers, totalMarkers)

  const rate = referencedMarkers / totalMarkers

  return { rate, totalMarkers, referencedMarkers }
}

// Common Thai compound words for recognition testing
const THAI_COMPOUND_WORDS = [
  'โรงพยาบาล', // hospital
  'มหาวิทยาลัย', // university
  'โรงเรียน', // school
  'สนามบิน', // airport
  'ตำรวจ', // police
  'รัฐบาล', // government
  'ธนาคาร', // bank
  'ไปรษณีย์', // post office
  'ห้องสมุด', // library
  'โทรศัพท์', // telephone
]

/**
 * Check if Thai compound words in the target text are recognized
 * as single concepts in the back-translation language notes.
 *
 * AC3: Recognition rate >= 90%
 *
 * @param targetText - Original Thai target text
 * @param languageNotes - Language notes from back-translation result
 * @returns Recognition rate and details
 */
export function verifyCompoundWordRecognition(
  targetText: string,
  languageNotes: LanguageNote[],
): { rate: number; totalCompounds: number; recognizedCompounds: number } {
  // Find compound words present in the target text
  const foundCompounds = THAI_COMPOUND_WORDS.filter((word) => targetText.includes(word))

  if (foundCompounds.length === 0) {
    return { rate: 1.0, totalCompounds: 0, recognizedCompounds: 0 }
  }

  // Check which compounds have a language note
  const compoundNotes = languageNotes.filter((note) => note.noteType === 'compound_word')
  const compoundNoteTexts = compoundNotes.map((note) => note.originalText)

  let recognizedCompounds = 0
  for (const compound of foundCompounds) {
    if (compoundNoteTexts.some((noteText) => noteText.includes(compound))) {
      recognizedCompounds++
    }
  }

  const rate = recognizedCompounds / foundCompounds.length

  return { rate, totalCompounds: foundCompounds.length, recognizedCompounds }
}

// Thai politeness particles
const THAI_PARTICLES = ['ครับ', 'ค่ะ', 'คะ', 'นะ', 'จ้า', 'จ๊ะ', 'นะคะ', 'นะครับ']

/**
 * Find Thai politeness particles in text for AC3 verification.
 */
export function findThaiParticles(text: string): string[] {
  return THAI_PARTICLES.filter((particle) => text.includes(particle))
}
