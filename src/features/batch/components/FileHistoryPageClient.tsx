'use client'

import { useState, useTransition } from 'react'

import { getFileHistory } from '@/features/batch/actions/getFileHistory.action'

import { FileHistoryTable } from './FileHistoryTable'

type FileHistoryFilter = 'all' | 'passed' | 'needs_review' | 'failed'

type FileRow = {
  fileId: string
  fileName: string
  processedAt: string
  status: string
  mqmScore: number | null
  reviewerName: string | null
}

type FileHistoryPageClientProps = {
  projectId: string
  initialFiles: FileRow[]
}

export function FileHistoryPageClient({ projectId, initialFiles }: FileHistoryPageClientProps) {
  const [filter, setFilter] = useState<FileHistoryFilter>('all')
  const [files, setFiles] = useState<FileRow[]>(initialFiles)
  const [isPending, startTransition] = useTransition()

  const handleFilterChange = (newFilter: FileHistoryFilter) => {
    setFilter(newFilter)
    startTransition(async () => {
      const result = await getFileHistory({
        projectId,
        filter: newFilter,
      })
      if (result.success) {
        setFiles(
          result.data.files.map((f) => ({
            fileId: f.fileId,
            fileName: f.fileName,
            processedAt: new Date(f.createdAt).toISOString(),
            status: f.status,
            mqmScore: f.mqmScore,
            reviewerName: f.lastReviewerName,
          })),
        )
      }
    })
  }

  return (
    <div className={isPending ? 'opacity-50' : ''}>
      <FileHistoryTable
        files={files}
        activeFilter={filter}
        onFilterChange={handleFilterChange}
        projectId={projectId}
      />
    </div>
  )
}
