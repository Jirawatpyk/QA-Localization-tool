'use client'

import { HelpCircle, RotateCcw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { updateTourState } from '@/features/onboarding/actions/updateTourState.action'

export function HelpMenu() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleRestartTour() {
    startTransition(async () => {
      await updateTourState({ action: 'restart', tourId: 'setup' })
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          aria-label="Help"
          data-testid="help-menu-trigger"
        >
          <HelpCircle size={16} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={handleRestartTour}
          disabled={isPending}
          data-testid="restart-tour-btn"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Restart Tour
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
