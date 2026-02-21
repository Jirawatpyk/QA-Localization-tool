'use client'

import { useRouter } from 'next/navigation'
import { type ChangeEvent, useRef, useState, useTransition } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { importGlossary } from '@/features/glossary/actions/importGlossary.action'
import type { ImportResult } from '@/features/glossary/types'

type GlossaryImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}

type Step = 'file' | 'mapping' | 'result'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export function GlossaryImportDialog({ open, onOpenChange, projectId }: GlossaryImportDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('file')
  const [file, setFile] = useState<File | null>(null)
  const [glossaryName, setGlossaryName] = useState('')
  const [format, setFormat] = useState<'csv' | 'tbx' | 'xlsx' | ''>('')

  // Column mapping
  const [sourceColumn, setSourceColumn] = useState('source')
  const [targetColumn, setTargetColumn] = useState('target')
  const [hasHeader, setHasHeader] = useState(true)
  const [delimiter, setDelimiter] = useState<',' | ';' | '\t'>(',')

  // Result
  const [result, setResult] = useState<ImportResult | null>(null)
  const [showErrors, setShowErrors] = useState(false)

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return

    if (selected.size > MAX_FILE_SIZE) {
      toast.error('File too large. Maximum size is 10MB.')
      return
    }

    const ext = selected.name.split('.').pop()?.toLowerCase()
    let detectedFormat: 'csv' | 'tbx' | 'xlsx' | '' = ''
    if (ext === 'csv') detectedFormat = 'csv'
    else if (ext === 'tbx') detectedFormat = 'tbx'
    else if (ext === 'xlsx') detectedFormat = 'xlsx'

    if (!detectedFormat) {
      toast.error('Unsupported format. Use .csv, .tbx, or .xlsx')
      return
    }

    setFile(selected)
    setFormat(detectedFormat)
    setGlossaryName(selected.name.replace(/\.[^.]+$/, ''))
  }

  function handleNextFromFile() {
    if (!file || !glossaryName || !format) return

    // TBX skips column mapping
    if (format === 'tbx') {
      handleImport()
    } else {
      setStep('mapping')
    }
  }

  function handleImport() {
    if (!file || !format) return

    const formData = new FormData()
    formData.append('file', file)
    formData.append('name', glossaryName)
    formData.append('projectId', projectId)
    formData.append('format', format)
    formData.append('sourceColumn', sourceColumn)
    formData.append('targetColumn', targetColumn)
    formData.append('hasHeader', String(hasHeader))
    formData.append('delimiter', delimiter)

    startTransition(async () => {
      const res = await importGlossary(formData)
      if (res.success) {
        setResult(res.data)
        setStep('result')
        toast.success(`Imported ${res.data.imported} terms`)
      } else {
        toast.error(res.error)
      }
    })
  }

  function handleClose() {
    onOpenChange(false)
    // Reset state after close animation
    setTimeout(() => {
      setStep('file')
      setFile(null)
      setGlossaryName('')
      setFormat('')
      setSourceColumn('source')
      setTargetColumn('target')
      setHasHeader(true)
      setDelimiter(',')
      setResult(null)
      setShowErrors(false)
    }, 200)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent aria-label="Import glossary" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Glossary</DialogTitle>
          <DialogDescription>
            {step === 'file' && 'Select a glossary file to import.'}
            {step === 'mapping' && 'Configure column mapping.'}
            {step === 'result' && 'Import complete.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'file' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="glossary-file">File</Label>
              <Input
                id="glossary-file"
                ref={fileInputRef}
                type="file"
                accept=".csv,.tbx,.xlsx"
                onChange={handleFileChange}
              />
              <p className="text-xs text-text-muted">
                Supported: CSV, TBX, Excel (.xlsx). Max 10MB.
              </p>
            </div>

            {file && (
              <div className="space-y-2">
                <Label htmlFor="glossary-name">
                  Glossary Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="glossary-name"
                  value={glossaryName}
                  onChange={(e) => setGlossaryName(e.target.value)}
                  maxLength={255}
                  required
                />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button disabled={!file || !glossaryName || !format} onClick={handleNextFromFile}>
                {format === 'tbx' ? 'Import' : 'Next: Column Mapping'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'mapping' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="source-col">Source Column</Label>
              <Input
                id="source-col"
                value={sourceColumn}
                onChange={(e) => setSourceColumn(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="target-col">Target Column</Label>
              <Input
                id="target-col"
                value={targetColumn}
                onChange={(e) => setTargetColumn(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={hasHeader}
                onCheckedChange={(checked) => setHasHeader(checked === true)}
              />
              File has header row
            </label>

            {format === 'csv' && (
              <div className="space-y-2">
                <Label htmlFor="delimiter">Delimiter</Label>
                <Select
                  value={delimiter}
                  onValueChange={(v) => setDelimiter(v as typeof delimiter)}
                >
                  <SelectTrigger id="delimiter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=",">Comma (,)</SelectItem>
                    <SelectItem value=";">Semicolon (;)</SelectItem>
                    <SelectItem value={'\t'}>Tab</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('file')}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={isPending}>
                {isPending ? 'Importing...' : 'Import'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-4">
            <div className="space-y-2 text-sm">
              <p className="text-success">Imported: {result.imported} terms</p>
              {result.duplicates > 0 && (
                <p className="text-warning">Duplicates: {result.duplicates} (skipped)</p>
              )}
              {result.errors.length > 0 && (
                <p className="text-error">Errors: {result.errors.length} (failed to import)</p>
              )}
            </div>

            {result.errors.length > 0 && (
              <div>
                <Button variant="outline" size="sm" onClick={() => setShowErrors(!showErrors)}>
                  {showErrors ? 'Hide Skipped' : 'View Skipped'}
                </Button>

                {showErrors && (
                  <div className="mt-2 max-h-48 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Line</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errors.map((err, i) => (
                          <TableRow key={i}>
                            <TableCell>{err.line}</TableCell>
                            <TableCell className="font-mono text-xs">{err.code}</TableCell>
                            <TableCell>{err.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
