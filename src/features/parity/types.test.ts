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

  it('should return "minor" for null', () => {
    expect(toParitySeverity(null)).toBe('minor')
  })

  it('should return "minor" for undefined', () => {
    expect(toParitySeverity(undefined)).toBe('minor')
  })

  it('should return "minor" for empty string', () => {
    expect(toParitySeverity('')).toBe('minor')
  })

  it('should return "minor" for invalid severity string', () => {
    expect(toParitySeverity('invalid')).toBe('minor')
    expect(toParitySeverity('HIGH')).toBe('minor')
    expect(toParitySeverity('error')).toBe('minor')
    expect(toParitySeverity('warning')).toBe('minor')
  })
})
