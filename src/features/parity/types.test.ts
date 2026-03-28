/// <reference types="vitest/globals" />
import { toParitySeverity } from './types'
import type { ParitySeverity } from './types'

describe('toParitySeverity', () => {
  it.each<[string, ParitySeverity]>([
    ['critical', 'critical'],
    ['major', 'major'],
    ['minor', 'minor'],
    ['trivial', 'trivial'],
  ])('should return "%s" for valid input "%s"', (input, expected) => {
    expect(toParitySeverity(input)).toBe(expected)
  })

  it.each<[string, ParitySeverity]>([
    ['CRITICAL', 'critical'],
    ['Major', 'major'],
    ['MINOR', 'minor'],
    ['TRIVIAL', 'trivial'],
  ])('should normalize uppercase "%s" to "%s"', (input, expected) => {
    expect(toParitySeverity(input)).toBe(expected)
  })

  it.each<[string, ParitySeverity]>([
    ['  minor  ', 'minor'],
    [' major', 'major'],
    ['critical ', 'critical'],
  ])('should trim whitespace "%s" to "%s"', (input, expected) => {
    expect(toParitySeverity(input)).toBe(expected)
  })

  it('should return "major" for null (matches parser default)', () => {
    expect(toParitySeverity(null)).toBe('major')
  })

  it('should return "major" for undefined (matches parser default)', () => {
    expect(toParitySeverity(undefined)).toBe('major')
  })

  it('should return "major" for empty string (matches parser default)', () => {
    expect(toParitySeverity('')).toBe('major')
  })

  it('should return "major" for invalid severity string (matches parser default)', () => {
    expect(toParitySeverity('invalid')).toBe('major')
    expect(toParitySeverity('HIGH')).toBe('major')
    expect(toParitySeverity('error')).toBe('major')
    expect(toParitySeverity('warning')).toBe('major')
  })
})
