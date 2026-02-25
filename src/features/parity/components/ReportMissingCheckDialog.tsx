'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { reportMissingCheck } from '@/features/parity/actions/reportMissingCheck.action'

type ReportMissingCheckDialogProps = {
  projectId: string
  fileId?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const CHECK_TYPES = [
  { value: 'tag', label: 'Tag' },
  { value: 'number', label: 'Number' },
  { value: 'term', label: 'Term' },
  { value: 'consistency', label: 'Consistency' },
  { value: 'other', label: 'Other' },
]

export function ReportMissingCheckDialog({
  projectId,
  fileId,
  open,
  onOpenChange,
}: ReportMissingCheckDialogProps) {
  const [fileReference, setFileReference] = useState('')
  const [segmentNumber, setSegmentNumber] = useState('')
  const [description, setDescription] = useState('')
  const [checkType, setCheckType] = useState('')
  const [showTypeOptions, setShowTypeOptions] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const handleClose = useCallback(() => onOpenChange?.(false), [onOpenChange])

  // M5: Close on Escape key
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, handleClose])

  if (!open) return null

  const validate = (): boolean => {
    const newErrors: string[] = []
    if (!fileReference.trim()) newErrors.push('File Reference is required')
    if (!segmentNumber.trim() || Number(segmentNumber) <= 0)
      newErrors.push('Segment Number is required')
    if (!description.trim()) newErrors.push('Description is required')
    if (!checkType) newErrors.push('Check Type is required')
    setErrors(newErrors)
    return newErrors.length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return

    setSubmitting(true)
    try {
      const result = await reportMissingCheck({
        projectId,
        fileReference: fileReference || fileId || '',
        segmentNumber: Number(segmentNumber),
        expectedDescription: description,
        xbenchCheckType: checkType,
      })

      if (result.success) {
        toast.success(`Report submitted: ${result.data.trackingReference}`)
        onOpenChange?.(false)
      } else {
        toast.error(result.error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-missing-check-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleClose()
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
        <h2 id="report-missing-check-title" className="mb-4 text-lg font-semibold">
          Report Missing Check
        </h2>

        {errors.length > 0 && <p className="mb-4 text-sm text-destructive">{errors.join('. ')}</p>}

        <div className="space-y-4">
          <div>
            <label htmlFor="fileReference" className="mb-1 block text-sm font-medium">
              File Reference
            </label>
            <input
              id="fileReference"
              type="text"
              value={fileReference}
              onChange={(e) => setFileReference(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="segmentNumber" className="mb-1 block text-sm font-medium">
              Segment Number
            </label>
            <input
              id="segmentNumber"
              type="number"
              value={segmentNumber}
              onChange={(e) => setSegmentNumber(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="description" className="mb-1 block text-sm font-medium">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
              rows={3}
            />
          </div>

          <div>
            <label htmlFor="checkType" className="mb-1 block text-sm font-medium">
              Check Type
            </label>
            <div className="relative">
              <button
                id="checkType"
                type="button"
                onClick={() => setShowTypeOptions(!showTypeOptions)}
                className="w-full rounded border px-3 py-2 text-left text-sm"
              >
                {checkType ? CHECK_TYPES.find((t) => t.value === checkType)?.label : 'Select...'}
              </button>
              {showTypeOptions && (
                <ul
                  role="listbox"
                  className="absolute z-10 mt-1 w-full rounded border bg-card shadow-lg"
                >
                  {CHECK_TYPES.map((type) => (
                    <li
                      key={type.value}
                      role="option"
                      aria-selected={checkType === type.value}
                      onClick={() => {
                        setCheckType(type.value)
                        setShowTypeOptions(false)
                      }}
                      className="cursor-pointer px-3 py-2 text-sm hover:bg-muted"
                    >
                      {type.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange?.(false)}
            className="rounded-md border px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSubmit}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
