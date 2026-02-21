'use client'

// CSS must be imported at module level — NOT inside useEffect
import 'driver.js/dist/driver.css'

import { useEffect, useRef } from 'react'

import { updateTourState } from '@/features/onboarding/actions/updateTourState.action'
import type { UserMetadata } from '@/features/onboarding/types'

// Type the driver instance from v1.x API
type DriverInstance = ReturnType<(typeof import('driver.js'))['driver']>

interface OnboardingTourProps {
  userId: string
  userMetadata: UserMetadata | null
}

const SETUP_TOUR_STEPS = [
  {
    element: 'body',
    popover: {
      title: 'Welcome to QA Localization Tool',
      description:
        "Your AI-powered QA assistant — catches everything Xbench catches, plus semantic issues Xbench can't.",
    },
  },
  {
    element: '[data-tour="create-project"]',
    popover: {
      title: 'Create a Project',
      description: 'Start by setting your language pair and QA mode.',
      side: 'bottom' as const,
    },
  },
  {
    element: '[data-tour="nav-glossary"]',
    popover: {
      title: 'Import Your Glossary',
      description:
        'Import your existing glossary (CSV/XLSX/TBX) — terminology checks start immediately.',
      side: 'right' as const,
    },
  },
  {
    element: '[data-tour="nav-upload"]',
    popover: {
      title: 'Upload Your First File',
      description: "Try with a file you already QA'd in Xbench — compare results side-by-side.",
      side: 'right' as const,
    },
  },
] as const

const LAST_STEP_INDEX = SETUP_TOUR_STEPS.length - 1

export function OnboardingTour({ userId, userMetadata }: OnboardingTourProps) {
  const driverRef = useRef<DriverInstance | null>(null)

  useEffect(() => {
    // Only trigger if setup_tour_completed is null/undefined
    if (userMetadata?.setup_tour_completed) return
    // No mobile tours (viewport >= 768px)
    if (typeof window !== 'undefined' && window.innerWidth < 768) return

    // Calculate resume step (0-indexed) from dismissed_at_step (1-based)
    const resumeStep = userMetadata?.dismissed_at_step?.setup
      ? userMetadata.dismissed_at_step.setup - 1
      : 0

    async function initTour() {
      // Dynamic JS import inside useEffect — avoids SSR window reference issues
      const { driver } = await import('driver.js')

      const driverObj = driver({
        showProgress: true,
        overlayColor: '#1e293b',
        overlayOpacity: 0.4,
        stagePadding: 8,
        stageRadius: 6,
        onDestroyStarted: () => {
          // Esc/X dismissed — save step (getActiveIndex is 0-based; store as 1-based)
          const currentIndex = driverObj.getActiveIndex() ?? 0
          void updateTourState({
            action: 'dismiss',
            tourId: 'setup',
            dismissedAtStep: currentIndex + 1,
          })
          driverObj.destroy()
        },
        onDestroyed: () => {
          // Check if tour was completed (reached last step)
          const activeIndex = driverObj.getActiveIndex()
          if (activeIndex === LAST_STEP_INDEX) {
            void updateTourState({ action: 'complete', tourId: 'setup' })
          }
        },
      })

      driverRef.current = driverObj
      driverObj.setSteps([...SETUP_TOUR_STEPS])

      // Resume from dismissed step OR start from 0
      driverObj.drive(resumeStep)
    }

    void initTour()

    return () => {
      // Destroy driver on unmount (prevents memory leak)
      driverRef.current?.destroy()
    }
  }, [userId, userMetadata])

  // Purely behavioral component — renders nothing
  return null
}
