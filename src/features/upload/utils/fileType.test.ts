import { describe, expect, it } from 'vitest'

import { getFileType } from './fileType'

describe('getFileType', () => {
  it('should return sdlxliff for .sdlxliff extension', () => {
    expect(getFileType('report.sdlxliff')).toBe('sdlxliff')
  })

  it('should return xliff for .xlf extension', () => {
    expect(getFileType('report.xlf')).toBe('xliff')
  })

  it('should return xliff for .xliff extension', () => {
    expect(getFileType('report.xliff')).toBe('xliff')
  })

  it('should return xlsx for .xlsx extension', () => {
    expect(getFileType('report.xlsx')).toBe('xlsx')
  })

  it('should return null for unsupported extension', () => {
    expect(getFileType('document.pdf')).toBeNull()
  })

  it('should return null for file with no extension', () => {
    expect(getFileType('noextension')).toBeNull()
  })

  it('should be case-insensitive (UPPERCASE extension)', () => {
    expect(getFileType('REPORT.SDLXLIFF')).toBe('sdlxliff')
    expect(getFileType('REPORT.XLF')).toBe('xliff')
    expect(getFileType('REPORT.XLSX')).toBe('xlsx')
  })

  it('should use the last segment when file has multiple dots', () => {
    expect(getFileType('file.backup.sdlxliff')).toBe('sdlxliff')
    expect(getFileType('archive.tar.gz')).toBeNull()
  })

  it('should return null for empty string', () => {
    expect(getFileType('')).toBeNull()
  })
})
