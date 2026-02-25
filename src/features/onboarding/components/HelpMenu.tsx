'use client'

import { HelpCircle, RotateCcw } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { updateTourState } from '@/features/onboarding/actions/updateTourState.action'
import type { TourId } from '@/features/onboarding/types'

export function HelpMenu() {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const isProjectRoute = pathname.startsWith('/projects/')

  function handleRestartTour(tourId: TourId) {
    startTransition(async () => {
      const result = await updateTourState({ action: 'restart', tourId })
      if (result.success) {
        router.refresh()
      }
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
          onClick={() => handleRestartTour('setup')}
          disabled={isPending}
          data-testid="restart-tour-btn"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Restart Tour
        </DropdownMenuItem>
        {isProjectRoute && (
          <DropdownMenuItem
            onClick={() => handleRestartTour('project')}
            disabled={isPending}
            data-testid="restart-project-tour-btn"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restart Project Tour
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
