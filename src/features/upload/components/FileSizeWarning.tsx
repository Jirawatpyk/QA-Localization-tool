'use client'

type FileSizeWarningProps = {
  fileNames: string[]
}

export function FileSizeWarning({ fileNames }: FileSizeWarningProps) {
  if (fileNames.length === 0) return null

  return (
    <div
      role="alert"
      className="mt-3 rounded-md border border-warning-border bg-warning-light px-4 py-2 text-sm text-warning-foreground"
    >
      <span className="font-medium">Large file</span> — processing may be slower:{' '}
      {fileNames.join(', ')}
    </div>
  )
}
