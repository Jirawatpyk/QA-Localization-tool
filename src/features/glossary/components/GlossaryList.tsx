'use client'

import { useRouter } from 'next/navigation'
import { Fragment, useState, useTransition } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { deleteGlossary } from '@/features/glossary/actions/deleteGlossary.action'
import type { AppRole } from '@/lib/auth/getCurrentUser'

import { GlossaryTermTable } from './GlossaryTermTable'

type GlossaryWithTermCount = {
  id: string
  name: string
  sourceLang: string
  targetLang: string
  createdAt: Date
  termCount: number
}

type GlossaryListProps = {
  glossaries: GlossaryWithTermCount[]
  userRole: AppRole
}

export function GlossaryList({ glossaries, userRole }: GlossaryListProps) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const isAdmin = userRole === 'admin'

  function confirmDelete() {
    if (!deleteTarget) return

    startTransition(async () => {
      const result = await deleteGlossary(deleteTarget.id)
      if (result.success) {
        toast.success('Glossary deleted')
        router.refresh()
      } else {
        toast.error(result.error)
      }
      setDeleteTarget(null)
    })
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="px-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Language Pair</TableHead>
            <TableHead className="text-right">Terms</TableHead>
            <TableHead>Created</TableHead>
            {isAdmin && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {glossaries.map((g) => (
            <Fragment key={g.id}>
              <TableRow className="cursor-pointer" onClick={() => toggleExpand(g.id)}>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell>
                  {g.sourceLang} → {g.targetLang}
                </TableCell>
                <TableCell className="text-right">{g.termCount}</TableCell>
                <TableCell>{g.createdAt.toLocaleDateString()}</TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteTarget({ id: g.id, name: g.name })
                      }}
                    >
                      Delete
                    </Button>
                  </TableCell>
                )}
              </TableRow>
              {expandedId === g.id && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="p-0">
                    <GlossaryTermTable glossaryId={g.id} userRole={userRole} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Glossary</AlertDialogTitle>
            <AlertDialogDescription>
              Delete glossary &ldquo;{deleteTarget?.name}&rdquo; and all its terms? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isPending} onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
