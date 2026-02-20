export interface UserMetadata {
  setup_tour_completed?: string | null // ISO 8601 timestamp
  review_tour_completed?: string | null // ISO 8601 timestamp
  dismissed_at_step?: {
    setup?: number | null // 1-based step number
    review?: number | null
  }
}

export type TourId = 'setup' | 'review'

export type TourAction = 'complete' | 'dismiss' | 'restart'

export interface TourStep {
  element: string
  title: string
  description: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}
