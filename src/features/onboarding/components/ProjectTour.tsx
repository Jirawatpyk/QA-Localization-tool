'use client'

// CSS must be imported at module level — NOT inside useEffect
import 'driver.js/dist/driver.css'

import { useEffect, useRef } from 'react'

import { updateTourState } from '@/features/onboarding/actions/updateTourState.action'
import type { UserMetadata } from '@/features/onboarding/types'

// Type the driver instance from v1.x API
type DriverInstance = ReturnType<(typeof import('driver.js'))['driver']>

interface ProjectTourProps {
  userId: string
  userMetadata: UserMetadata | null
}

const PROJECT_TOUR_STEPS = [
  {
    element: '[data-tour="project-glossary"]',
    popover: {
      title: 'Import Glossary',
      description:
        'Import your terminology files (CSV, XLSX, or TBX) so the QA engine can check glossary compliance.',
      side: 'bottom' as const,
    },
  },
  {
    element: '[data-tour="project-files"]',
    popover: {
      title: 'Upload Files',
      description:
        "Click Files to upload your first translation file. Try one you already QA'd in Xbench — compare results side-by-side.",
      side: 'bottom' as const,
    },
  },
] as const

const LAST_STEP_INDEX = PROJECT_TOUR_STEPS.length - 1

export function ProjectTour({ userId, userMetadata }: ProjectTourProps) {
  const driverRef = useRef<DriverInstance | null>(null)
  const dismissedRef = useRef(false)

  useEffect(() => {
    if (userMetadata?.project_tour_completed) return
    // Reset dismissedRef when a restart has cleared dismissed_at_step.
    // After router.refresh() from HelpMenu restart, userMetadata reflects the
    // server-cleared state (dismissed_at_step.project = null/undefined).
    if (dismissedRef.current && !userMetadata?.dismissed_at_step?.project) {
      dismissedRef.current = false
    }
    if (dismissedRef.current) return
    if (typeof window !== 'undefined' && window.innerWidth < 768) return

    let cancelled = false

    const rawResume = userMetadata?.dismissed_at_step?.project
      ? userMetadata.dismissed_at_step.project - 1
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
          updateTourState({
            action: 'dismiss',
            tourId: 'project',
            dismissedAtStep: currentIndex + 1,
          }).catch(() => {
            // Non-critical: dismiss state not persisted, tour will re-show next visit
          })
          driverObj.destroy()
        },
        onDestroyed: () => {
          // Guard: skip if destroyed via X button (dismiss) or cleanup (unmount)
          if (dismissedRef.current || cancelled) return
          const activeIndex = driverObj.getActiveIndex()
          if (activeIndex === LAST_STEP_INDEX) {
            updateTourState({ action: 'complete', tourId: 'project' }).catch(() => {
              // Non-critical: complete state not persisted, tour will re-show next visit
            })
          }
        },
      })

      driverRef.current = driverObj
      driverObj.setSteps([...PROJECT_TOUR_STEPS])
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
