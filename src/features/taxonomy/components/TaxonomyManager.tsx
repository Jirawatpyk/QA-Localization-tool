'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { createMapping } from '@/features/taxonomy/actions/createMapping.action'
import { deleteMapping } from '@/features/taxonomy/actions/deleteMapping.action'
import { updateMapping } from '@/features/taxonomy/actions/updateMapping.action'
import type { TaxonomyMapping } from '@/features/taxonomy/types'

import { AddMappingDialog } from './AddMappingDialog'
import { TaxonomyMappingTable } from './TaxonomyMappingTable'

type Props = {
  initialMappings: TaxonomyMapping[]
}

export function TaxonomyManager({ initialMappings }: Props) {
  const [mappings, setMappings] = useState<TaxonomyMapping[]>(initialMappings)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [, startTransition] = useTransition()

  function handleAdd() {
    setShowAddDialog(true)
  }

  function handleAddSubmit(input: {
    category: string
    parentCategory?: string | null
    internalName: string
    severity: 'critical' | 'major' | 'minor'
    description: string
  }) {
    startTransition(() => {
      toast.promise(createMapping(input), {
        loading: 'Adding mapping...',
        success: (result) => {
          if (!result.success) throw new Error(result.error)
          setMappings((prev) => [...prev, result.data])
          setShowAddDialog(false)
          return 'Mapping created'
        },
        error: (err: unknown) => (err instanceof Error ? err.message : 'Failed to add mapping'),
      })
    })
  }

  function handleUpdate(
    id: string,
    fields: {
      internalName: string
      category: string
      parentCategory: string
      severity: string
      description: string
    },
  ) {
    startTransition(() => {
      toast.promise(
        updateMapping(id, {
          internalName: fields.internalName || undefined,
          category: fields.category,
          parentCategory: fields.parentCategory || null,
          severity: fields.severity as 'critical' | 'major' | 'minor',
          description: fields.description, // send as-is; empty → schema min(1) → error toast
        }),
        {
          loading: 'Saving...',
          success: (result) => {
            if (!result.success) throw new Error(result.error)
            setMappings((prev) => prev.map((m) => (m.id === id ? result.data : m)))
            return 'Mapping updated'
          },
          error: (err: unknown) => (err instanceof Error ? err.message : 'Failed to save'),
        },
      )
    })
  }

  function handleDelete(id: string) {
    startTransition(() => {
      toast.promise(deleteMapping(id), {
        loading: 'Deleting...',
        success: (result) => {
          if (!result.success) throw new Error(result.error)
          setMappings((prev) => prev.filter((m) => m.id !== id))
          return 'Mapping deleted'
        },
        error: (err: unknown) => (err instanceof Error ? err.message : 'Failed to delete'),
      })
    })
  }

  return (
    <div className="space-y-4">
      <TaxonomyMappingTable
        mappings={mappings}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onAdd={handleAdd}
      />

      <AddMappingDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSubmit={handleAddSubmit}
      />
    </div>
  )
}
