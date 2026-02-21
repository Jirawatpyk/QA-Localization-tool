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
      description:
        'Start by setting your language pair and QA mode. Glossary import and file upload are inside each project.',
      side: 'bottom' as const,
    },
  },
] as const

const LAST_STEP_INDEX = SETUP_TOUR_STEPS.length - 1

export function OnboardingTour({ userId, userMetadata }: OnboardingTourProps) {
  const driverRef = useRef<DriverInstance | null>(null)
  const dismissedRef = useRef(false)

  useEffect(() => {
    if (userMetadata?.setup_tour_completed) return
    if (dismissedRef.current) return
    if (typeof window !== 'undefined' && window.innerWidth < 768) return

    let cancelled = false

    const rawResume = userMetadata?.dismissed_at_step?.setup
      ? userMetadata.dismissed_at_step.setup - 1
      : 0
    const resumeStep = Math.min(rawResume, LAST_STEP_INDEX)

    async function initTour() {
      const { driver } = await import('driver.js')

      // Effect was cleaned up during async import — don't create instance
      if (cancelled) return

      const driverObj = driver({
        showProgress: true,
        overlayColor: 'var(--color-overlay, #1e293b)',
        overlayOpacity: 0.4,
        stagePadding: 8,
        stageRadius: 6,
        onCloseClick: () => {
          dismissedRef.current = true
          const currentIndex = driverObj.getActiveIndex() ?? 0
          void updateTourState({
            action: 'dismiss',
            tourId: 'setup',
            dismissedAtStep: currentIndex + 1,
          })
          driverObj.destroy()
        },
        onDestroyed: () => {
          // Guard: skip if destroyed via X button (dismiss) or cleanup (unmount)
          if (dismissedRef.current || cancelled) return
          const activeIndex = driverObj.getActiveIndex()
          if (activeIndex === LAST_STEP_INDEX) {
            void updateTourState({ action: 'complete', tourId: 'setup' })
          }
        },
      })

      driverRef.current = driverObj
      driverObj.setSteps([...SETUP_TOUR_STEPS])
      driverObj.drive(resumeStep)
    }

    void initTour()

    return () => {
      cancelled = true
      driverRef.current?.destroy()
      driverRef.current = null
      // Force remove leftover driver.js DOM elements (driver.js v1.3-1.4 class names)
      document.querySelectorAll('.driver-active-element').forEach((el) => {
        el.classList.remove('driver-active-element')
      })
      document.body.classList.remove('driver-active', 'driver-fade', 'driver-simple')
      document.querySelectorAll('.driver-overlay, .driver-popover').forEach((el) => el.remove())
    }
  }, [userId, userMetadata])

  return null
}
