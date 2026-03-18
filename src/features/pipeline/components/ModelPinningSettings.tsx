'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { updateModelPinning } from '@/features/pipeline/actions/updateModelPinning.action'
import { AVAILABLE_L2_MODELS, AVAILABLE_L3_MODELS } from '@/lib/ai/models'

type ModelPinningSettingsProps = {
  projectId: string
  l2PinnedModel: string | null
  l3PinnedModel: string | null
  isAdmin: boolean
}

type ModelOption = { value: string | null; label: string }

function ModelSelect({
  layer,
  projectId,
  currentModel,
  models,
  testId,
  label,
}: {
  layer: 'L2' | 'L3'
  projectId: string
  currentModel: string | null
  models: string[]
  testId: string
  label: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedModel, setSelectedModel] = useState(currentModel)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Sync state when prop changes (Guardrail #12: useState only captures initial value)
  useEffect(() => {
    setSelectedModel(currentModel)
  }, [currentModel])

  // Guardrail #11: reset focusedIndex when dropdown closes (same as dialog state reset on re-open)
  useEffect(() => {
    if (!isOpen) setFocusedIndex(-1)
  }, [isOpen])

  // Close on click outside or Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const options: ModelOption[] = [
    { value: null, label: 'System Default' },
    ...models.map((m) => ({ value: m, label: m })),
  ]

  const handleSelect = async (model: string | null) => {
    setIsOpen(false)
    const result = await updateModelPinning({ projectId, layer, model })
    if (!result.success) {
      toast.error(result.error)
    } else {
      setSelectedModel(model)
      toast.success(`${layer} model updated`)
    }
  }

  return (
    <div ref={dropdownRef} className="relative">
      <label id={`${testId}-label`} htmlFor={testId}>
        {label}
      </label>
      <button
        type="button"
        id={testId}
        data-testid={testId}
        aria-labelledby={`${testId}-label`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full rounded-md border px-3 py-2 text-left text-sm"
      >
        {selectedModel ?? 'System Default'}
      </button>
      {isOpen && (
        <div
          role="listbox"
          aria-labelledby={`${testId}-label`}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setFocusedIndex((prev) => Math.min(prev + 1, options.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setFocusedIndex((prev) => Math.max(prev - 1, 0))
            } else if (e.key === 'Enter' && focusedIndex >= 0) {
              e.preventDefault()
              handleSelect(options[focusedIndex]!.value).catch(() => {
                /* non-critical */
              })
            }
          }}
          className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md"
        >
          {options.map((opt, idx) => (
            <div
              key={opt.label}
              role="option"
              tabIndex={idx === focusedIndex ? 0 : -1}
              ref={(el) => {
                if (idx === focusedIndex) el?.focus()
              }}
              aria-selected={selectedModel === opt.value}
              onClick={() => {
                handleSelect(opt.value).catch(() => {
                  /* non-critical — toast handles user feedback inside handleSelect */
                })
              }}
              className={`cursor-pointer px-3 py-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary ${idx === focusedIndex ? 'bg-accent' : ''}`}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ModelDisplay({
  label,
  model,
  testId,
}: {
  label: string
  model: string | null
  testId: string
}) {
  return (
    <div data-testid={testId}>
      <span className="text-sm text-muted-foreground">{label}:</span>{' '}
      <span>{model ?? 'System Default'}</span>
      {model && <span className="ml-1 text-xs text-muted-foreground">(pinned)</span>}
    </div>
  )
}

export function ModelPinningSettings({
  projectId,
  l2PinnedModel,
  l3PinnedModel,
  isAdmin,
}: ModelPinningSettingsProps) {
  if (!isAdmin) {
    return (
      <div className="space-y-2">
        <ModelDisplay label="L2 screening model" model={l2PinnedModel} testId="model-display-l2" />
        <ModelDisplay
          label="L3 deep analysis model"
          model={l3PinnedModel}
          testId="model-display-l3"
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ModelSelect
        layer="L2"
        projectId={projectId}
        currentModel={l2PinnedModel}
        models={[...AVAILABLE_L2_MODELS]}
        testId="model-select-l2"
        label="L2 screening model"
      />
      <ModelSelect
        layer="L3"
        projectId={projectId}
        currentModel={l3PinnedModel}
        models={[...AVAILABLE_L3_MODELS]}
        testId="model-select-l3"
        label="L3 deep analysis model"
      />
    </div>
  )
}
