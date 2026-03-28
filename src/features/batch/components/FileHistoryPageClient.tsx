'use client'

import { useState, useTransition } from 'react'

import { getFileHistory } from '@/features/batch/actions/getFileHistory.action'
import type { DbFileStatus } from '@/types/pipeline'

import { FileHistoryTable } from './FileHistoryTable'

type FileHistoryFilter = 'all' | 'passed' | 'needs_review' | 'failed'

type FileRow = {
  fileId: string
  fileName: string
  processedAt: string
  status: DbFileStatus
  mqmScore: number | null
  reviewerName: string | null
}

type FileHistoryPageClientProps = {
  projectId: string
  initialFiles: FileRow[]
  initialTotalCount: number
}

export function FileHistoryPageClient({
  projectId,
  initialFiles,
  initialTotalCount,
}: FileHistoryPageClientProps) {
  const [filter, setFilter] = useState<FileHistoryFilter>('all')
  const [page, setPage] = useState(1)
  const [files, setFiles] = useState<FileRow[]>(initialFiles)
  const [totalCount, setTotalCount] = useState(initialTotalCount)
  const [isPending, startTransition] = useTransition()

  const fetchFiles = (newFilter: FileHistoryFilter, newPage: number) => {
    startTransition(async () => {
      const result = await getFileHistory({
        projectId,
        filter: newFilter,
        page: newPage,
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
        setTotalCount(result.data.totalCount)
      }
    })
  }

  const handleFilterChange = (newFilter: FileHistoryFilter) => {
    setFilter(newFilter)
    setPage(1)
    fetchFiles(newFilter, 1)
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    fetchFiles(filter, newPage)
  }

  return (
    <div className={isPending ? 'opacity-50' : ''}>
      <FileHistoryTable
        files={files}
        totalCount={totalCount}
        currentPage={page}
        activeFilter={filter}
        onFilterChange={handleFilterChange}
        onPageChange={handlePageChange}
        projectId={projectId}
      />
    </div>
  )
}
