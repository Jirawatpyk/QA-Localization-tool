export type SupportedFileType = 'sdlxliff' | 'xliff' | 'xlsx'

export function getFileType(fileName: string): SupportedFileType | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'sdlxliff') return 'sdlxliff'
  if (ext === 'xlf' || ext === 'xliff') return 'xliff'
  if (ext === 'xlsx') return 'xlsx'
  return null
}
