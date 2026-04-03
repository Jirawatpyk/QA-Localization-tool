'use client'

import { Check, ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type MqmCategoryComboboxProps = {
  value: string
  onValueChange: (val: string) => void
  suggestions: string[]
  placeholder?: string
  className?: string
  'aria-label'?: string
}

export function MqmCategoryCombobox({
  value,
  onValueChange,
  suggestions,
  placeholder = 'Select or type...',
  className,
  'aria-label': ariaLabel = 'MQM category',
}: MqmCategoryComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setSearch('')
    }
  }

  function handleSelect(selectedValue: string) {
    onValueChange(selectedValue)
    setOpen(false)
    setSearch('')
  }

  function handleSearchChange(newSearch: string) {
    setSearch(newSearch)
    // Free-form: update value as user types (allows custom categories)
    onValueChange(newSearch)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn('h-7 w-full justify-between text-sm font-normal', className)}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="min-w-[200px] w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search..."
            value={search || value}
            onValueChange={handleSearchChange}
          />
          <CommandList>
            <CommandEmpty>Use custom value</CommandEmpty>
            {suggestions
              .filter((s) => s.toLowerCase().includes((search || value).toLowerCase()))
              .map((suggestion) => (
                <CommandItem key={suggestion} value={suggestion} onSelect={handleSelect}>
                  <Check
                    className={cn(
                      'mr-2 h-3 w-3',
                      value === suggestion ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {suggestion}
                </CommandItem>
              ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
