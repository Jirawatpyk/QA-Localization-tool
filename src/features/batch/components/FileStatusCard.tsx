'use client'

import Link from 'next/link'

import { formatFileStatus } from '../helpers/formatFileStatus'

import { ScoreBadge } from './ScoreBadge'

type FileCardData = {
  fileId: string
  fileName: string
  status: string
  mqmScore: number | null
  criticalCount: number
  majorCount: number
  minorCount: number
}

type FileStatusCardProps = {
  file: FileCardData
  projectId?: string
  variant?: 'compact' | 'full'
}

export function FileStatusCard({ file, projectId, variant = 'full' }: FileStatusCardProps) {
  const href = projectId ? `/projects/${projectId}/review/${file.fileId}` : '#'

  return (
    <Link
      href={href}
      className="block rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{file.fileName}</span>
        <ScoreBadge score={file.mqmScore} />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
          {formatFileStatus(file.status)}
        </span>
      </div>

      {variant === 'full' && (
        <div className="mt-2 flex gap-3 text-xs">
          <span data-severity="critical" aria-label="critical">
            <span className="text-destructive font-medium">Critical</span> {file.criticalCount}
          </span>
          <span data-severity="major" aria-label="major">
            <span className="text-warning font-medium">Major</span> {file.majorCount}
          </span>
          <span data-severity="minor" aria-label="minor">
            <span className="text-muted-foreground font-medium">Minor</span> {file.minorCount}
          </span>
        </div>
      )}
    </Link>
  )
}
