export interface UserMetadata {
  setup_tour_completed?: string | null // ISO 8601 timestamp
  review_tour_completed?: string | null // ISO 8601 timestamp
  project_tour_completed?: string | null // ISO 8601 timestamp (Story 2.8)
  dismissed_at_step?: {
    setup?: number | null // 1-based step number
    review?: number | null
    project?: number | null // Story 2.8
  }
}

export type TourId = 'setup' | 'review' | 'project'

export type TourAction = 'complete' | 'dismiss' | 'restart'

export interface TourStep {
  element: string
  title: string
  description: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}
