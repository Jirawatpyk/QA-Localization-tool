'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
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
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { deleteTerm } from '@/features/glossary/actions/deleteTerm.action'
import { getGlossaryTerms } from '@/features/glossary/actions/getGlossaryTerms.action'
import type { AppRole } from '@/lib/auth/getCurrentUser'

import { TermEditDialog } from './TermEditDialog'

type GlossaryTerm = {
  id: string
  glossaryId: string
  sourceTerm: string
  targetTerm: string
  caseSensitive: boolean
  createdAt: Date
}

type GlossaryTermTableProps = {
  glossaryId: string
  userRole: AppRole
}

const PAGE_SIZE = 50

export function GlossaryTermTable({ glossaryId, userRole }: GlossaryTermTableProps) {
  const router = useRouter()
  const [terms, setTerms] = useState<GlossaryTerm[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [editTerm, setEditTerm] = useState<GlossaryTerm | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTermId, setDeleteTermId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isAdmin = userRole === 'admin'

  useEffect(() => {
    let cancelled = false
    async function loadTerms() {
      setLoading(true)
      const result = await getGlossaryTerms(glossaryId)
      if (!cancelled && result.success) {
        setTerms(result.data)
      }
      if (!cancelled) {
        setLoading(false)
      }
    }
    void loadTerms()
    return () => {
      cancelled = true
    }
  }, [glossaryId])

  const filtered = search
    ? terms.filter(
        (t) =>
          t.sourceTerm.toLowerCase().includes(search.toLowerCase()) ||
          t.targetTerm.toLowerCase().includes(search.toLowerCase()),
      )
    : terms

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  function confirmDeleteTerm() {
    if (!deleteTermId) return

    startTransition(async () => {
      const result = await deleteTerm(deleteTermId)
      if (result.success) {
        setTerms((prev) => prev.filter((t) => t.id !== deleteTermId))
        toast.success('Term deleted')
        router.refresh()
      } else {
        toast.error(result.error)
      }
      setDeleteTermId(null)
    })
  }

  function handleTermSaved() {
    // Reload terms after create/edit
    setEditTerm(null)
    setCreateOpen(false)
    void (async () => {
      const result = await getGlossaryTerms(glossaryId)
      if (result.success) {
        setTerms(result.data)
      }
      router.refresh()
    })()
  }

  if (loading) {
    return <div className="p-4 text-center text-sm text-text-muted">Loading terms...</div>
  }

  return (
    <div className="border-t bg-surface-raised p-4">
      <div className="mb-3 flex items-center gap-2">
        <Input
          placeholder="Search terms..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
          className="max-w-xs"
        />
        {isAdmin && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            Add Term
          </Button>
        )}
        <span className="ml-auto text-xs text-text-muted">
          {filtered.length} term{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source Term</TableHead>
            <TableHead>Target Term</TableHead>
            <TableHead>Case Sensitive</TableHead>
            {isAdmin && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginated.length === 0 ? (
            <TableRow>
              <TableCell colSpan={isAdmin ? 4 : 3} className="text-center text-text-muted">
                {search ? 'No matching terms' : 'No terms'}
              </TableCell>
            </TableRow>
          ) : (
            paginated.map((term) => (
              <TableRow key={term.id}>
                <TableCell>{term.sourceTerm}</TableCell>
                <TableCell>{term.targetTerm}</TableCell>
                <TableCell>{term.caseSensitive ? 'Yes' : 'No'}</TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="outline" size="sm" onClick={() => setEditTerm(term)}>
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isPending}
                        onClick={() => setDeleteTermId(term.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-text-muted">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {isAdmin && createOpen && (
        <TermEditDialog
          mode="create"
          glossaryId={glossaryId}
          onClose={() => setCreateOpen(false)}
          onSaved={handleTermSaved}
        />
      )}

      {isAdmin && editTerm && (
        <TermEditDialog
          mode="edit"
          glossaryId={glossaryId}
          term={editTerm}
          onClose={() => setEditTerm(null)}
          onSaved={handleTermSaved}
        />
      )}

      <AlertDialog open={!!deleteTermId} onOpenChange={(open) => !open && setDeleteTermId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Term</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this term? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={confirmDeleteTerm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
