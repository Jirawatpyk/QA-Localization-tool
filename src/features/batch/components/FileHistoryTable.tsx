'use client'

import { useState } from 'react'

import { FILE_HISTORY_PAGE_SIZE } from '@/features/batch/types'

import { formatFileStatus } from '../helpers/formatFileStatus'

import { ScoreBadge } from './ScoreBadge'

type FileHistoryRow = {
  fileId: string
  fileName: string
  processedAt: string
  status: string
  mqmScore: number | null
  reviewerName: string | null
}

type FileHistoryFilter = 'all' | 'passed' | 'needs_review' | 'failed'

type FileHistoryTableProps = {
  files: FileHistoryRow[]
  activeFilter: FileHistoryFilter
  onFilterChange: (filter: FileHistoryFilter) => void
  projectId: string
}

const FILTER_LABELS: Record<FileHistoryFilter, string> = {
  all: 'All',
  passed: 'Passed',
  needs_review: 'Needs Review',
  failed: 'Failed',
}

function getPaginationPages(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | '...')[] = [1]
  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('...')
  pages.push(total)

  return pages
}

export function FileHistoryTable({ files, activeFilter, onFilterChange }: FileHistoryTableProps) {
  const [page, setPage] = useState(1)
  const totalPages = Math.ceil(files.length / FILE_HISTORY_PAGE_SIZE)
  const pagedFiles = files.slice((page - 1) * FILE_HISTORY_PAGE_SIZE, page * FILE_HISTORY_PAGE_SIZE)

  return (
    <div className="space-y-4">
      {/* Filter buttons */}
      <div className="flex gap-2" role="group">
        {(Object.keys(FILTER_LABELS) as FileHistoryFilter[]).map((filter) => (
          <button
            key={filter}
            type="button"
            className={`rounded-md border px-3 py-1.5 text-sm ${
              activeFilter === filter
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
            onClick={() => {
              onFilterChange(filter)
              setPage(1)
            }}
          >
            {FILTER_LABELS[filter]}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {files.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">No files found</p>
      )}

      {/* Table */}
      {files.length > 0 && (
        <table className="w-full border-collapse" role="table">
          <thead>
            <tr>
              <th className="border-b px-4 py-2 text-left text-sm font-medium" role="columnheader">
                File
              </th>
              <th className="border-b px-4 py-2 text-left text-sm font-medium" role="columnheader">
                Date
              </th>
              <th className="border-b px-4 py-2 text-left text-sm font-medium" role="columnheader">
                Status
              </th>
              <th className="border-b px-4 py-2 text-left text-sm font-medium" role="columnheader">
                Score
              </th>
              <th className="border-b px-4 py-2 text-left text-sm font-medium" role="columnheader">
                Reviewer
              </th>
            </tr>
          </thead>
          <tbody>
            {pagedFiles.map((file) => (
              <tr key={file.fileId} className="border-b">
                <td className="px-4 py-2 text-sm">{file.fileName}</td>
                <td className="px-4 py-2 text-sm text-muted-foreground">
                  {new Date(file.processedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-sm">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {formatFileStatus(file.status)}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <ScoreBadge score={file.mqmScore} />
                </td>
                <td className="px-4 py-2 text-sm text-muted-foreground">
                  {file.reviewerName ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination with ellipsis */}
      {totalPages > 1 && (
        <nav aria-label="pagination" className="flex items-center justify-center gap-1">
          {getPaginationPages(page, totalPages).map((p, idx) =>
            p === '...' ? (
              <span key={`ellipsis-${idx}`} className="px-2 text-sm text-muted-foreground">
                ...
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={`rounded px-3 py-1 text-sm ${
                  page === p ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
                onClick={() => setPage(p as number)}
              >
                {p}
              </button>
            ),
          )}
        </nav>
      )}
    </div>
  )
}
