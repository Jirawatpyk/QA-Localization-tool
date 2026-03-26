import { describe, expect, it } from 'vitest'

import { validateRedirectPath } from './validateRedirect'

describe('validateRedirectPath', () => {
  it('should reject protocol-relative URL //evil.com', () => {
    expect(validateRedirectPath('//evil.com')).toBe('/dashboard')
  })

  it('should reject backslash path /\\evil.com', () => {
    expect(validateRedirectPath('/\\evil.com')).toBe('/dashboard')
  })

  it('should reject triple-slash ///evil.com', () => {
    expect(validateRedirectPath('///evil.com')).toBe('/dashboard')
  })

  it('should reject fragment /#fragment', () => {
    expect(validateRedirectPath('/#fragment')).toBe('/dashboard')
  })

  it('should pass through /dashboard', () => {
    expect(validateRedirectPath('/dashboard')).toBe('/dashboard')
  })

  it('should pass through /projects/123', () => {
    expect(validateRedirectPath('/projects/123')).toBe('/projects/123')
  })

  it('should default to /dashboard when null', () => {
    expect(validateRedirectPath(null)).toBe('/dashboard')
  })

  it('should reject empty string', () => {
    expect(validateRedirectPath('')).toBe('/dashboard')
  })

  it('should pass through path with query params /projects?filter=active', () => {
    expect(validateRedirectPath('/projects?filter=active')).toBe('/projects?filter=active')
  })

  it('should reject absolute URL with scheme http://evil.com', () => {
    expect(validateRedirectPath('http://evil.com')).toBe('/dashboard')
  })

  it('should reject javascript: protocol', () => {
    expect(validateRedirectPath('javascript:alert(1)')).toBe('/dashboard')
  })

  it('should pass through nested path with UUID', () => {
    expect(validateRedirectPath('/projects/550e8400-e29b-41d4-a716-446655440000/review/abc')).toBe(
      '/projects/550e8400-e29b-41d4-a716-446655440000/review/abc',
    )
  })
})
