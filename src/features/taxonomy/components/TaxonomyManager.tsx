'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { createMapping } from '@/features/taxonomy/actions/createMapping.action'
import { deleteMapping } from '@/features/taxonomy/actions/deleteMapping.action'
import { reorderMappings } from '@/features/taxonomy/actions/reorderMappings.action'
import { updateMapping } from '@/features/taxonomy/actions/updateMapping.action'
import type { TaxonomyMapping } from '@/features/taxonomy/types'
import type { Severity } from '@/features/taxonomy/validation/taxonomySchemas'

import { AddMappingDialog } from './AddMappingDialog'
import { TaxonomyMappingTable } from './TaxonomyMappingTable'

type Props = {
  initialMappings: TaxonomyMapping[]
  isAdmin?: boolean | undefined
}

export function TaxonomyManager({ initialMappings, isAdmin }: Props) {
  const router = useRouter()
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
    severity: Severity
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
      severity: Severity
      description: string
    },
  ) {
    startTransition(() => {
      toast.promise(
        updateMapping(id, {
          internalName: fields.internalName,
          category: fields.category,
          parentCategory: fields.parentCategory || null,
          severity: fields.severity,
          description: fields.description,
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

  function handleReorder(newOrder: { id: string; displayOrder: number }[]) {
    const previous = mappings
    // Optimistic: reorder local state immediately
    const orderMap = new Map(newOrder.map((o) => [o.id, o.displayOrder]))
    const reordered = [...mappings].sort((a, b) => {
      const aOrder = orderMap.get(a.id) ?? a.displayOrder
      const bOrder = orderMap.get(b.id) ?? b.displayOrder
      return aOrder - bOrder
    })
    setMappings(reordered)

    startTransition(() => {
      toast.promise(reorderMappings(newOrder), {
        loading: 'Reordering...',
        success: (result) => {
          if (!result.success) {
            // CR R1 M3 fix: don't revert here — throwing triggers `error` callback which reverts
            throw new Error(result.error)
          }
          // Reconcile optimistic state with server-canonical order via RSC re-fetch
          router.refresh()
          return 'Mappings reordered'
        },
        error: (err: unknown) => {
          setMappings(previous)
          return err instanceof Error ? err.message : 'Failed to reorder'
        },
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
        canReorder={isAdmin}
        onReorder={handleReorder}
      />

      <AddMappingDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSubmit={handleAddSubmit}
      />
    </div>
  )
}
