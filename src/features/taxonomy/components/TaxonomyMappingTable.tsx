'use client'

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { MqmCategoryCombobox } from '@/features/taxonomy/components/MqmCategoryCombobox'
import type { TaxonomyMapping } from '@/features/taxonomy/types'
import type { Severity } from '@/features/taxonomy/validation/taxonomySchemas'
import { severityValues } from '@/features/taxonomy/validation/taxonomySchemas'

type ReorderItem = { id: string; displayOrder: number }

/**
 * Pure function: compute new display order after reorder.
 * Extracted for direct unit testing (jsdom cannot trigger @dnd-kit DragEnd events).
 */
export function computeNewOrder(
  mappings: TaxonomyMapping[],
  activeId: string,
  overId: string,
): ReorderItem[] | null {
  const oldIndex = mappings.findIndex((m) => m.id === activeId)
  const newIndex = mappings.findIndex((m) => m.id === overId)
  if (oldIndex === -1 || newIndex === -1) return null
  const reordered = arrayMove(mappings, oldIndex, newIndex)
  return reordered.map((m, i) => ({ id: m.id, displayOrder: i }))
}

type UpdateFields = {
  internalName: string
  category: string
  parentCategory: string
  severity: Severity
  description: string
}

type Props = {
  mappings: TaxonomyMapping[]
  onUpdate: (id: string, fields: UpdateFields) => void
  onDelete: (id: string) => void
  onAdd: () => void
  canReorder?: boolean | undefined
  onReorder?: ((newOrder: ReorderItem[]) => void) | undefined
}

const SEVERITY_CLASSES: Record<Severity, string> = {
  critical: 'bg-severity-critical text-white',
  major: 'bg-severity-major text-white',
  minor: 'bg-severity-minor text-white',
}

type EditDraft = {
  internalName: string
  category: string
  parentCategory: string
  severity: Severity
  description: string
}

type MappingCellsProps = {
  mapping: TaxonomyMapping
  isEditing: boolean
  draft: EditDraft | null
  onDraftChange: (draft: EditDraft) => void
  onStartEdit: (mapping: TaxonomyMapping) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  onDeleteRequest: (id: string) => void
  readOnly?: boolean | undefined
  allCategories: string[]
  allParentCategories: string[]
}

function MappingCells({
  mapping,
  isEditing,
  draft,
  onDraftChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDeleteRequest,
  readOnly,
  allCategories,
  allParentCategories,
}: MappingCellsProps) {
  return (
    <>
      {/* internalName */}
      <TableCell>
        {isEditing && draft ? (
          <Input
            aria-label="QA Cosmetic name"
            value={draft.internalName}
            onChange={(e) => onDraftChange({ ...draft, internalName: e.target.value })}
            className="h-7 text-sm"
          />
        ) : (
          <span className="text-sm">
            {mapping.internalName ?? <span className="text-text-secondary italic">—</span>}
          </span>
        )}
      </TableCell>

      {/* category */}
      <TableCell>
        {isEditing && draft ? (
          <MqmCategoryCombobox
            value={draft.category}
            onValueChange={(val) => onDraftChange({ ...draft, category: val })}
            suggestions={allCategories}
            aria-label="MQM category"
          />
        ) : (
          <span className="text-sm">{mapping.category}</span>
        )}
      </TableCell>

      {/* parentCategory */}
      <TableCell>
        {isEditing && draft ? (
          <MqmCategoryCombobox
            value={draft.parentCategory}
            onValueChange={(val) => onDraftChange({ ...draft, parentCategory: val })}
            suggestions={allParentCategories}
            aria-label="MQM parent category"
          />
        ) : (
          <span className="text-sm">
            {mapping.parentCategory ?? <span className="text-text-secondary italic">—</span>}
          </span>
        )}
      </TableCell>

      {/* severity */}
      <TableCell>
        {isEditing && draft ? (
          <Select
            value={draft.severity}
            onValueChange={(val) => onDraftChange({ ...draft, severity: val as Severity })}
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
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_CLASSES[mapping.severity ?? 'minor'] ?? SEVERITY_CLASSES['minor']}`}
          >
            {mapping.severity ?? 'minor'}
          </span>
        )}
      </TableCell>

      {/* description */}
      <TableCell className="max-w-[260px]">
        {isEditing && draft ? (
          <Input
            aria-label="Description"
            value={draft.description}
            onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
            className="h-7 text-sm"
          />
        ) : mapping.description ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="text-sm text-text-secondary truncate block cursor-default"
                tabIndex={readOnly ? -1 : 0}
              >
                {mapping.description}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[400px]">
              <p>{mapping.description}</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-text-secondary italic">—</span>
        )}
      </TableCell>

      {/* actions — hidden in readOnly mode (DragOverlay) */}
      {readOnly ? (
        <TableCell />
      ) : (
        <TableCell>
          {isEditing ? (
            <div className="flex gap-1">
              <Button size="sm" className="h-7 text-xs" onClick={() => onSaveEdit(mapping.id)}>
                Save
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancelEdit}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onStartEdit(mapping)}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-error hover:text-error h-7 text-xs"
                onClick={() => onDeleteRequest(mapping.id)}
                aria-label={`Delete mapping: ${mapping.internalName ?? mapping.category}`}
              >
                Delete
              </Button>
            </div>
          )}
        </TableCell>
      )}
    </>
  )
}

function SortableMappingRow({
  mapping,
  isDragDisabled,
  cellProps,
}: {
  mapping: TaxonomyMapping
  isDragDisabled: boolean
  cellProps: MappingCellsProps
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: mapping.id,
    disabled: isDragDisabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-8">
        <button
          type="button"
          data-testid="drag-handle"
          className="cursor-grab touch-none"
          {...attributes}
          {...(isDragDisabled ? {} : listeners)}
          aria-disabled={isDragDisabled}
          aria-roledescription="sortable"
        >
          <GripVertical className="h-4 w-4 text-text-secondary" />
        </button>
      </TableCell>
      <MappingCells {...cellProps} />
    </TableRow>
  )
}

export function TaxonomyMappingTable({
  mappings,
  onUpdate,
  onDelete,
  onAdd,
  canReorder,
  onReorder,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  // SSR hydration fix (T-05): @dnd-kit DndContext accesses DOM globals during render.
  // useSyncExternalStore is React Compiler safe (no setState in effect).
  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  const isDragDisabled = editingId !== null

  // Hooks must be called unconditionally (Rules of Hooks) even when canReorder=false
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function startEdit(mapping: TaxonomyMapping) {
    // D2 review fix: warn when switching edit with unsaved changes
    if (editingId && editingId !== mapping.id && draft) {
      const prev = mappings.find((m) => m.id === editingId)
      if (
        prev &&
        (draft.internalName !== (prev.internalName ?? '') ||
          draft.category !== prev.category ||
          draft.parentCategory !== (prev.parentCategory ?? '') ||
          draft.severity !== (prev.severity ?? 'minor') ||
          draft.description !== prev.description)
      ) {
        toast.info('Previous edit discarded')
      }
    }
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

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDragId(null)
    if (!over || active.id === over.id) return

    const newOrder = computeNewOrder(mappings, String(active.id), String(over.id))
    if (newOrder) onReorder?.(newOrder)
  }

  // CR R2 M2 fix: reset DragOverlay when user cancels (e.g. Escape key)
  function handleDragCancel() {
    setActiveDragId(null)
  }

  const allCategories = [...new Set(mappings.map((m) => m.category))]
  const allParentCategories = [
    ...new Set(mappings.map((m) => m.parentCategory).filter(Boolean)),
  ] as string[]

  function getCellProps(mapping: TaxonomyMapping): MappingCellsProps {
    return {
      mapping,
      isEditing: editingId === mapping.id,
      draft: editingId === mapping.id ? draft : null,
      onDraftChange: setDraft,
      onStartEdit: startEdit,
      onSaveEdit: saveEdit,
      onCancelEdit: cancelEdit,
      onDeleteRequest: setDeleteTargetId,
      allCategories,
      allParentCategories,
    }
  }

  const activeDragMapping = activeDragId ? mappings.find((m) => m.id === activeDragId) : undefined

  const columnCount = canReorder ? 7 : 6

  const tableElement = (
    <div className="rounded-md border">
      <Table aria-label="Taxonomy mapping table" data-testid="taxonomy-mapping-table">
        <TableHeader>
          <TableRow>
            {canReorder && <TableHead className="w-8" />}
            <TableHead className="w-[180px]">QA Cosmetic Term</TableHead>
            <TableHead className="w-[140px]">MQM Category</TableHead>
            <TableHead className="w-[160px]">MQM Parent</TableHead>
            <TableHead className="w-[130px]">Severity</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-[130px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {hasMounted && canReorder ? (
            <SortableContext
              items={mappings.map((m) => m.id)}
              strategy={verticalListSortingStrategy}
            >
              {mappings.map((mapping) => (
                <SortableMappingRow
                  key={mapping.id}
                  mapping={mapping}
                  isDragDisabled={isDragDisabled}
                  cellProps={getCellProps(mapping)}
                />
              ))}
            </SortableContext>
          ) : (
            mappings.map((mapping) => (
              <TableRow key={mapping.id}>
                {canReorder && (
                  <TableCell className="w-8">
                    <GripVertical className="h-4 w-4 text-text-secondary opacity-50" />
                  </TableCell>
                )}
                <MappingCells {...getCellProps(mapping)} />
              </TableRow>
            ))
          )}

          {mappings.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columnCount}
                className="text-center text-text-secondary text-sm py-8"
              >
                No mappings found. Add one to get started.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )

  return (
    <TooltipProvider>
      <>
        <div className="flex justify-between items-center">
          <p className="text-sm text-text-secondary">
            {mappings.length} mapping{mappings.length !== 1 ? 's' : ''}
          </p>
          <Button size="sm" onClick={onAdd} data-testid="add-mapping-btn">
            Add Mapping
          </Button>
        </div>

        {hasMounted && canReorder ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {tableElement}
            <DragOverlay>
              {activeDragMapping && (
                <Table>
                  <TableBody>
                    <TableRow className="bg-surface shadow-md">
                      <TableCell className="w-8">
                        <GripVertical className="h-4 w-4 text-text-secondary" />
                      </TableCell>
                      <MappingCells {...getCellProps(activeDragMapping)} readOnly />
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </DragOverlay>
          </DndContext>
        ) : (
          tableElement
        )}

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
    </TooltipProvider>
  )
}
