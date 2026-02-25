'use client'

import { useState } from 'react'

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

const PAGE_SIZE = 20

const FILTER_LABELS: Record<FileHistoryFilter, string> = {
  all: 'All',
  passed: 'Passed',
  needs_review: 'Needs Review',
  failed: 'Failed',
}

function formatStatus(status: string): string {
  if (status === 'auto_passed') return 'Passed'
  if (status === 'needs_review') return 'Needs Review'
  if (status === 'failed') return 'Failed'
  if (status === 'l1_completed') return 'Completed'
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function FileHistoryTable({ files, activeFilter, onFilterChange }: FileHistoryTableProps) {
  const [page, setPage] = useState(1)
  const totalPages = Math.ceil(files.length / PAGE_SIZE)
  const pagedFiles = files.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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
                    {formatStatus(file.status)}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <nav aria-label="pagination" className="flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              className={`rounded px-3 py-1 text-sm ${
                page === p ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
