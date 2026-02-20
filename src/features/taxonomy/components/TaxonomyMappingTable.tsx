'use client'

import { useState } from 'react'

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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { TaxonomyMapping } from '@/features/taxonomy/types'
import { severityValues } from '@/features/taxonomy/validation/taxonomySchemas'

type UpdateFields = {
  internalName: string
  category: string
  parentCategory: string
  severity: string
  description: string
}

type Props = {
  mappings: TaxonomyMapping[]
  onUpdate: (id: string, fields: UpdateFields) => void
  onDelete: (id: string) => void
  onAdd: () => void
}

const SEVERITY_BADGE: Record<string, 'destructive' | 'default' | 'secondary'> = {
  critical: 'destructive',
  major: 'default',
  minor: 'secondary',
}

type EditDraft = {
  internalName: string
  category: string
  parentCategory: string
  severity: string
  description: string
}

export function TaxonomyMappingTable({ mappings, onUpdate, onDelete, onAdd }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  function startEdit(mapping: TaxonomyMapping) {
    setEditingId(mapping.id)
    setDraft({
      internalName: mapping.internalName ?? '',
      category: mapping.category,
      parentCategory: mapping.parentCategory ?? '',
      severity: mapping.severity ?? 'minor',
      description: mapping.description,
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(null)
  }

  function saveEdit(id: string) {
    if (!draft) return
    // Emit all changed fields in a single call → 1 API round-trip, 1 audit log entry
    onUpdate(id, {
      internalName: draft.internalName,
      category: draft.category,
      parentCategory: draft.parentCategory,
      severity: draft.severity,
      description: draft.description,
    })
    setEditingId(null)
    setDraft(null)
  }

  return (
    <>
      <div className="flex justify-between items-center">
        <p className="text-sm text-text-secondary">
          {mappings.length} mapping{mappings.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={onAdd} data-testid="add-mapping-btn">
          Add Mapping
        </Button>
      </div>

      <div className="rounded-md border">
        <Table aria-label="Taxonomy mapping table" data-testid="taxonomy-mapping-table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">QA Cosmetic Term</TableHead>
              <TableHead className="w-[140px]">MQM Category</TableHead>
              <TableHead className="w-[160px]">MQM Parent</TableHead>
              <TableHead className="w-[130px]">Severity</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[130px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((mapping) => {
              const isEditing = editingId === mapping.id

              return (
                <TableRow key={mapping.id}>
                  {/* internalName */}
                  <TableCell>
                    {isEditing && draft ? (
                      <Input
                        aria-label="QA Cosmetic name"
                        value={draft.internalName}
                        onChange={(e) => setDraft({ ...draft, internalName: e.target.value })}
                        className="h-7 text-sm"
                      />
                    ) : (
                      <span className="text-sm">
                        {mapping.internalName ?? (
                          <span className="text-text-secondary italic">—</span>
                        )}
                      </span>
                    )}
                  </TableCell>

                  {/* category */}
                  <TableCell>
                    {isEditing && draft ? (
                      <Input
                        aria-label="MQM category"
                        value={draft.category}
                        onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                        className="h-7 text-sm"
                      />
                    ) : (
                      <span className="text-sm">{mapping.category}</span>
                    )}
                  </TableCell>

                  {/* parentCategory */}
                  <TableCell>
                    {isEditing && draft ? (
                      <Input
                        aria-label="MQM parent category"
                        value={draft.parentCategory}
                        onChange={(e) => setDraft({ ...draft, parentCategory: e.target.value })}
                        className="h-7 text-sm"
                      />
                    ) : (
                      <span className="text-sm">
                        {mapping.parentCategory ?? (
                          <span className="text-text-secondary italic">—</span>
                        )}
                      </span>
                    )}
                  </TableCell>

                  {/* severity */}
                  <TableCell>
                    {isEditing && draft ? (
                      <Select
                        value={draft.severity}
                        onValueChange={(val) => setDraft({ ...draft, severity: val })}
                      >
                        <SelectTrigger className="h-7 text-xs w-[110px]" aria-label="severity">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {severityValues.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        variant={SEVERITY_BADGE[mapping.severity ?? 'minor'] ?? 'secondary'}
                        className="text-xs"
                      >
                        {mapping.severity ?? 'minor'}
                      </Badge>
                    )}
                  </TableCell>

                  {/* description */}
                  <TableCell className="max-w-[260px]">
                    {isEditing && draft ? (
                      <Input
                        aria-label="Description"
                        value={draft.description}
                        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                        className="h-7 text-sm"
                      />
                    ) : (
                      <span className="text-sm text-text-secondary truncate block">
                        {mapping.description}
                      </span>
                    )}
                  </TableCell>

                  {/* actions */}
                  <TableCell>
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => saveEdit(mapping.id)}
                        >
                          Save
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={cancelEdit}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => startEdit(mapping)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-error hover:text-error h-7 text-xs"
                          onClick={() => setDeleteTargetId(mapping.id)}
                          aria-label={`Delete mapping: ${mapping.internalName ?? mapping.category}`}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}

            {mappings.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-text-secondary text-sm py-8">
                  No mappings found. Add one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Mapping?</AlertDialogTitle>
            <AlertDialogDescription>
              This will soft-delete the mapping (it will no longer appear in the QA engine). The
              audit trail will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-white hover:bg-error/90"
              data-testid="confirm-delete-mapping"
              onClick={() => {
                if (deleteTargetId) {
                  onDelete(deleteTargetId)
                  setDeleteTargetId(null)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
