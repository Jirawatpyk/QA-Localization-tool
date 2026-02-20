import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { RecentFileRow } from '@/features/dashboard/types'

interface RecentFilesTableProps {
  files: RecentFileRow[]
}

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'parsed':
      return 'default'
    case 'parsing':
      return 'secondary'
    case 'error':
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
    <div className="rounded-lg border border-border" data-testid="recent-files-table">
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
                {file.mqmScore != null ? (
                  <span className="font-mono text-sm">{file.mqmScore.toFixed(1)}</span>
                ) : (
                  <span className="text-muted-foreground">&mdash;</span>
                )}
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
