import { describe, expect, it } from 'vitest'

import { formatFewShotExamples } from '../few-shot-examples'

describe('formatFewShotExamples', () => {
  it('should include calibration examples header', () => {
    const result = formatFewShotExamples()

    expect(result).toContain('## Calibration Examples')
  })

  it('should include all 7 examples by default', () => {
    const result = formatFewShotExamples()

    expect(result).toContain('### Example 1')
    expect(result).toContain('### Example 7')
  })

  it('should limit examples when maxExamples is specified', () => {
    const result = formatFewShotExamples(3)

    expect(result).toContain('### Example 1')
    expect(result).toContain('### Example 3')
    expect(result).not.toContain('### Example 4')
  })

  it('should include positive examples with findings', () => {
    const result = formatFewShotExamples()

    // Accuracy example
    expect(result).toContain('บันทัก')
    expect(result).toContain('accuracy (critical)')

    // Omission example
    expect(result).toContain('omitted from translation')

    // Fluency example
    expect(result).toContain('fluency (minor)')
  })

  it('should include negative examples with no findings', () => {
    const result = formatFewShotExamples()

    expect(result).toContain('None — this translation is correct')
    expect(result).toContain('Do NOT flag it')
  })

  it('should include anti-over-flagging principle', () => {
    const result = formatFewShotExamples()

    expect(result).toContain('Do NOT over-flag stylistic preferences')
  })

  it('should include source and target language codes', () => {
    const result = formatFewShotExamples(1)

    expect(result).toContain('Source (en)')
    expect(result).toContain('Target (th)')
  })
})
