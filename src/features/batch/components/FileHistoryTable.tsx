'use client'

import Link from 'next/link'

import { FILE_HISTORY_PAGE_SIZE } from '@/features/batch/types'
import { FileAssignmentCell } from '@/features/project/components/FileAssignmentCell'
import type { AppRole } from '@/lib/auth/getCurrentUser'
import { L1_COMPLETED_STATUSES } from '@/types/pipeline'
import type { DbFileStatus } from '@/types/pipeline'

import { formatFileStatus } from '../helpers/formatFileStatus'

import { ScoreBadge } from './ScoreBadge'

type FileHistoryRow = {
  fileId: string
  fileName: string
  processedAt: string
  status: DbFileStatus
  mqmScore: number | null
  reviewerName: string | null
  assigneeName?: string | null | undefined
  assignmentPriority?: 'normal' | 'urgent' | null | undefined
}

type FileHistoryFilter = 'all' | 'passed' | 'needs_review' | 'failed'

type FileHistoryTableProps = {
  files: FileHistoryRow[]
  totalCount: number
  currentPage: number
  activeFilter: FileHistoryFilter
  onFilterChange: (filter: FileHistoryFilter) => void
  onPageChange: (page: number) => void
  projectId: string
  targetLanguage?: string | undefined
  currentUserRole: AppRole
  onRefresh?: (() => void) | undefined
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

export function FileHistoryTable({
  files,
  totalCount,
  currentPage,
  activeFilter,
  onFilterChange,
  onPageChange,
  projectId,
  targetLanguage,
  currentUserRole,
  onRefresh,
}: FileHistoryTableProps) {
  // Server already paginates — use totalCount for page calculation
  const totalPages = Math.ceil(totalCount / FILE_HISTORY_PAGE_SIZE)

  return (
    <div className="space-y-4" data-testid="file-list">
      {/* Filter buttons */}
      <div className="flex gap-2" role="group" aria-label="Filter files">
        {(Object.keys(FILTER_LABELS) as FileHistoryFilter[]).map((filter) => (
          <button
            key={filter}
            type="button"
            aria-pressed={activeFilter === filter}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              activeFilter === filter
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
            onClick={() => {
              onFilterChange(filter)
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
              <th className="border-b px-4 py-2 text-left text-sm font-medium" role="columnheader">
                Assignment
              </th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.fileId} className="border-b" data-testid={`file-row-${file.fileId}`}>
                <td className="px-4 py-2 text-sm">
                  {L1_COMPLETED_STATUSES.has(file.status) ? (
                    <Link
                      href={`/projects/${projectId}/review/${file.fileId}`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {file.fileName}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{file.fileName}</span>
                  )}
                </td>
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
                <td className="px-4 py-2">
                  <FileAssignmentCell
                    fileId={file.fileId}
                    fileName={file.fileName}
                    projectId={projectId}
                    targetLanguage={targetLanguage ?? ''}
                    currentUserRole={currentUserRole}
                    assigneeName={file.assigneeName}
                    priority={file.assignmentPriority}
                    onAssigned={onRefresh}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Pagination with ellipsis */}
      {totalPages > 1 && (
        <nav aria-label="pagination" className="flex items-center justify-center gap-1">
          {getPaginationPages(currentPage, totalPages).map((p, idx) =>
            p === '...' ? (
              <span key={`ellipsis-${idx}`} className="px-2 text-sm text-muted-foreground">
                ...
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={currentPage === p ? 'page' : undefined}
                className={`rounded px-3 py-1 text-sm ${
                  currentPage === p ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
                onClick={() => onPageChange(p as number)}
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
