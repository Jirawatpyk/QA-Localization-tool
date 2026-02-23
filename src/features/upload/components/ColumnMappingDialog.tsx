'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { parseFile } from '@/features/parser/actions/parseFile.action'
import { previewExcelColumns } from '@/features/parser/actions/previewExcelColumns.action'
import type { ExcelPreview } from '@/features/parser/actions/previewExcelColumns.action'
import type { ExcelColumnMapping } from '@/features/parser/validation/excelMappingSchema'

const NONE_VALUE = '__none__'

type ColumnMappingDialogProps = {
  open: boolean
  fileId: string
  fileName: string
  onSuccess: (segmentCount: number) => void
  onCancel: () => void
}

/**
 * Column Mapping Dialog for Excel bilingual files.
 * Opens when an Excel file upload completes.
 * Displays first 5 rows preview and allows user to select source/target columns.
 */
export function ColumnMappingDialog({
  open,
  fileId,
  fileName,
  onSuccess,
  onCancel,
}: ColumnMappingDialogProps) {
  const [preview, setPreview] = useState<ExcelPreview | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [isParsing, setIsParsing] = useState(false)

  const [hasHeader, setHasHeader] = useState(true)
  const [sourceColumn, setSourceColumn] = useState<string>('')
  const [targetColumn, setTargetColumn] = useState<string>('')
  const [segmentIdColumn, setSegmentIdColumn] = useState<string>(NONE_VALUE)
  const [contextColumn, setContextColumn] = useState<string>(NONE_VALUE)
  const [languageColumn, setLanguageColumn] = useState<string>(NONE_VALUE)

  function handleHasHeaderChange(checked: boolean) {
    setHasHeader(checked)
    // Reset all column selections when toggling header mode — previously selected names
    // are invalid in the new mode (header names vs numeric indices are incompatible)
    setSourceColumn('')
    setTargetColumn('')
    setSegmentIdColumn(NONE_VALUE)
    setContextColumn(NONE_VALUE)
    setLanguageColumn(NONE_VALUE)
  }

  // Load preview once when dialog opens (or fileId changes)
  useEffect(() => {
    if (!open) return

    async function loadPreview() {
      // L1: Reset all column selections when loading a new file — selections from a
      // previous file are invalid for a different file's columns
      setSourceColumn('')
      setTargetColumn('')
      setSegmentIdColumn(NONE_VALUE)
      setContextColumn(NONE_VALUE)
      setLanguageColumn(NONE_VALUE)
      setPreview(null)
      setIsLoadingPreview(true)
      try {
        const result = await previewExcelColumns(fileId)
        if (result.success) {
          setPreview(result.data)
          // Pre-select auto-detected columns (header-mode only)
          if (result.data.suggestedSourceColumn) {
            setSourceColumn(result.data.suggestedSourceColumn)
          }
          if (result.data.suggestedTargetColumn) {
            setTargetColumn(result.data.suggestedTargetColumn)
          }
        } else {
          toast.error(`Failed to preview Excel file: ${result.error}`)
        }
      } finally {
        setIsLoadingPreview(false)
      }
    }

    void loadPreview()
  }, [open, fileId])

  // C2: column options depend on hasHeader mode
  // hasHeader=true  → use header names (deduped to prevent React key + Radix value collision)
  // hasHeader=false → use numeric indices ("1", "2", ...) — parser expects parseInt-able strings
  const rawHeaders = preview?.headers ?? []
  const columnOptions: Array<{ label: string; value: string }> = hasHeader
    ? rawHeaders.map((h, i) => {
        const label = h || `Column ${i + 1}`
        // H1: append column number to duplicate header names to make values unique
        const isDup =
          h.trim().length > 0 &&
          rawHeaders
            .slice(0, i)
            .some((prev) => prev.toLowerCase().trim() === h.toLowerCase().trim())
        const value = isDup ? `${h} (col ${i + 1})` : label
        return { label, value }
      })
    : Array.from({ length: preview?.columnCount ?? 0 }, (_, i) => ({
        label: String(i + 1),
        value: String(i + 1),
      }))
  const canConfirm =
    sourceColumn.length > 0 && targetColumn.length > 0 && sourceColumn !== targetColumn

  async function handleConfirm() {
    if (!canConfirm) return

    setIsParsing(true)
    try {
      const mapping: ExcelColumnMapping = {
        sourceColumn,
        targetColumn,
        hasHeader,
        segmentIdColumn: segmentIdColumn !== NONE_VALUE ? segmentIdColumn : undefined,
        contextColumn: contextColumn !== NONE_VALUE ? contextColumn : undefined,
        languageColumn: languageColumn !== NONE_VALUE ? languageColumn : undefined,
      }

      const result = await parseFile(fileId, mapping)
      if (result.success) {
        onSuccess(result.data.segmentCount)
      } else {
        toast.error(`Parse failed: ${result.error}`)
      }
    } finally {
      setIsParsing(false)
    }
  }

  const isAutoDetectedSource =
    preview?.suggestedSourceColumn === sourceColumn && sourceColumn !== ''
  const isAutoDetectedTarget =
    preview?.suggestedTargetColumn === targetColumn && targetColumn !== ''

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isParsing) onCancel()
      }}
    >
      <DialogContent className="max-w-3xl" aria-label="Column mapping">
        <DialogHeader>
          <DialogTitle>Column Mapping — {fileName}</DialogTitle>
          <DialogDescription>
            Select which columns contain source and target text.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Has Header checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="has-header"
              checked={hasHeader}
              onCheckedChange={(checked) => handleHasHeaderChange(checked === true)}
              disabled={isParsing}
            />
            <label htmlFor="has-header" className="text-sm font-medium">
              First row is header
            </label>
          </div>

          {/* Preview table */}
          {isLoadingPreview ? (
            <div
              className="h-32 animate-pulse rounded bg-surface-secondary"
              aria-label="Loading preview"
            />
          ) : preview ? (
            <div className="overflow-x-auto rounded border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-text-muted">#</TableHead>
                    {preview.headers.map((h, i) => (
                      <TableHead key={i} className="whitespace-nowrap">
                        {h || `Column ${i + 1}`}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.previewRows.map((row, rowIdx) => (
                    <TableRow key={rowIdx}>
                      <TableCell className="text-text-muted">{rowIdx + 1}</TableCell>
                      {row.map((cell, colIdx) => (
                        <TableCell key={colIdx} className="max-w-[160px] truncate">
                          {cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {/* Column selectors */}
          {preview && (
            <div className="grid grid-cols-2 gap-4">
              {/* Source Column */}
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Source Column <span className="text-destructive">*</span>
                  {isAutoDetectedSource && (
                    <span className="ml-2 text-xs text-success">✓ auto</span>
                  )}
                </label>
                <Select value={sourceColumn} onValueChange={setSourceColumn} disabled={isParsing}>
                  <SelectTrigger aria-label="Source Column">
                    <SelectValue placeholder="Select column…" />
                  </SelectTrigger>
                  <SelectContent>
                    {columnOptions.map(({ label, value }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Target Column */}
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Target Column <span className="text-destructive">*</span>
                  {isAutoDetectedTarget && (
                    <span className="ml-2 text-xs text-success">✓ auto</span>
                  )}
                </label>
                <Select value={targetColumn} onValueChange={setTargetColumn} disabled={isParsing}>
                  <SelectTrigger aria-label="Target Column">
                    <SelectValue placeholder="Select column…" />
                  </SelectTrigger>
                  <SelectContent>
                    {columnOptions.map(({ label, value }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Segment ID Column (optional) */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-text-muted">Segment ID (optional)</label>
                <Select
                  value={segmentIdColumn}
                  onValueChange={setSegmentIdColumn}
                  disabled={isParsing}
                >
                  <SelectTrigger aria-label="Segment ID Column">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>— None —</SelectItem>
                    {columnOptions.map(({ label, value }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Context/Notes Column (optional) */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-text-muted">
                  Context/Notes (optional)
                </label>
                <Select value={contextColumn} onValueChange={setContextColumn} disabled={isParsing}>
                  <SelectTrigger aria-label="Context Column">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>— None —</SelectItem>
                    {columnOptions.map(({ label, value }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Language Column (optional, C1) */}
              <div className="space-y-1 col-span-2">
                <label className="text-sm font-medium text-text-muted">Language (optional)</label>
                <Select
                  value={languageColumn}
                  onValueChange={setLanguageColumn}
                  disabled={isParsing}
                >
                  <SelectTrigger aria-label="Language Column">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>— None —</SelectItem>
                    {columnOptions.map(({ label, value }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Multi-sheet info (E2) */}
          <p className="text-xs text-text-muted">ℹ Only the first sheet will be parsed.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isParsing}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || isParsing}>
            {isParsing ? 'Parsing…' : 'Confirm & Parse'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
