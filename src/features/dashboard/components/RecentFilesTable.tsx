import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScoreBadge } from '@/features/batch/components/ScoreBadge'
import type { RecentFileRow } from '@/features/dashboard/types'
import type { DbFileStatus } from '@/types/pipeline'

type RecentFilesTableProps = {
  files: RecentFileRow[]
}

function getStatusVariant(
  status: DbFileStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'parsed':
    case 'l1_completed':
    case 'l2_completed':
    case 'l3_completed':
      return 'default'
    case 'parsing':
    case 'l1_processing':
    case 'l2_processing':
    case 'l3_processing':
      return 'secondary'
    case 'ai_partial':
      return 'secondary'
    case 'failed':
      return 'destructive'
    default:
      return 'outline'
  }
}

export function RecentFilesTable({ files }: RecentFilesTableProps) {
  if (files.length === 0) {
    return (
      <div
        className="rounded-lg border border-border bg-card p-6 text-center"
        data-testid="recent-files-empty"
      >
        <p className="text-sm text-muted-foreground">
          No files uploaded yet. Upload your first file to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border" data-testid="dashboard-recent-files-table">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>File</TableHead>
            <TableHead>Project</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.map((file) => (
            <TableRow key={file.id}>
              <TableCell className="font-medium">{file.fileName}</TableCell>
              <TableCell>{file.projectName}</TableCell>
              <TableCell className="text-right">
                <ScoreBadge score={file.mqmScore} size="sm" />
              </TableCell>
              <TableCell>
                <Badge variant={getStatusVariant(file.status)}>{file.status}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
