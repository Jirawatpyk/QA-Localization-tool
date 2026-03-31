'use client'

import { UserPlus } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UrgentBadge } from '@/components/ui/UrgentBadge'
import { FileAssignmentDialog } from '@/features/project/components/FileAssignmentDialog'

type FileAssignmentCellProps = {
  fileId: string
  fileName: string
  projectId: string
  targetLanguage: string
  assigneeName?: string | null | undefined
  priority?: 'normal' | 'urgent' | null | undefined
  onAssigned?: (() => void) | undefined
}

export function FileAssignmentCell({
  fileId,
  fileName,
  projectId,
  targetLanguage,
  assigneeName,
  priority,
  onAssigned,
}: FileAssignmentCellProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  if (assigneeName) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs" data-testid="assignment-badge">
          {assigneeName}
        </Badge>
        {priority === 'urgent' && <UrgentBadge />}
      </div>
    )
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDialogOpen(true)}
        aria-label={`Assign ${fileName}`}
      >
        <UserPlus className="mr-1 size-4" />
        Assign
      </Button>
      <FileAssignmentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        fileId={fileId}
        fileName={fileName}
        projectId={projectId}
        targetLanguage={targetLanguage}
        onAssigned={onAssigned}
      />
    </>
  )
}
