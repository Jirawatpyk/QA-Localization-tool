'use client'

import { Upload } from 'lucide-react'
import { type ChangeEvent, type DragEvent, useRef, useState } from 'react'

import { DEFAULT_BATCH_SIZE } from '@/lib/constants'
import { cn } from '@/lib/utils'

import { ALLOWED_EXTENSIONS } from '../constants'

type FileUploadZoneProps = {
  onFilesSelected: (files: File[]) => void
  isUploading: boolean
  className?: string
  'data-tour'?: string
}

export function FileUploadZone({
  onFilesSelected,
  isUploading,
  className,
  'data-tour': dataTour,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragError, setDragError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(files: File[]) {
    setDragError(null)
    if (files.length === 0) return
    if (files.length > DEFAULT_BATCH_SIZE) {
      setDragError(
        `Maximum ${DEFAULT_BATCH_SIZE} files per batch. Upload remaining files in a separate batch.`,
      )
      return
    }
    onFilesSelected(files)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    handleFiles(files)
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    handleFiles(files)
    // reset so same file can be re-selected after error
    e.target.value = ''
  }

  return (
    <div className={className}>
      {/* Mobile guard */}
      <div className="block md:hidden rounded-lg border border-border bg-muted p-6 text-center text-sm text-text-muted">
        Switch to desktop for file upload
      </div>

      {/* Desktop upload zone */}
      <div
        className={cn(
          'hidden md:block',
          'rounded-lg border-2 border-dashed p-10 text-center transition-colors cursor-pointer',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/50',
          isUploading && 'pointer-events-none opacity-60',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload files — click or drag and drop"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        data-tour={dataTour}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS.join(',')}
          className="sr-only"
          onChange={handleInputChange}
          aria-hidden="true"
          tabIndex={-1}
        />

        <div className="flex flex-col items-center gap-3">
          <Upload className="h-10 w-10 text-text-muted" aria-hidden="true" />

          <div>
            <p className="text-sm font-medium text-text-primary">
              {isUploading ? 'Uploading…' : 'Drop files here or click to browse'}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {ALLOWED_EXTENSIONS.join(', ')} · max 15 MB per file · up to {DEFAULT_BATCH_SIZE}{' '}
              files
            </p>
          </div>
        </div>
      </div>

      {dragError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {dragError}
        </p>
      )}
    </div>
  )
}
