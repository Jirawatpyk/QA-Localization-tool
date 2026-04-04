import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { ReviewStatusBar } from '@/features/review/components/ReviewStatusBar'

describe('ReviewStatusBar', () => {
  const defaultProps = {
    score: 85.5,
    badgeState: 'pass' as const,
    reviewedCount: 14,
    totalCount: 28,
    layerCompleted: 'L1L2' as const,
    processingMode: 'economy' as const,
    isVisible: true,
  }

  it('should render all 4 sections when visible', () => {
    render(<ReviewStatusBar {...defaultProps} />)

    expect(screen.getByTestId('review-status-bar')).toBeInTheDocument()
    // Progress section
    expect(screen.getByText('14/28')).toBeInTheDocument()
    expect(screen.getByText(/14 remaining/)).toBeInTheDocument()
    // AI status — L1L2 economy = Complete
    expect(screen.getByText('Complete')).toBeInTheDocument()
  })

  it('should not render when isVisible is false', () => {
    render(<ReviewStatusBar {...defaultProps} isVisible={false} />)

    expect(screen.queryByTestId('review-status-bar')).not.toBeInTheDocument()
  })

  it('should show AI L2 processing when layerCompleted is L1', () => {
    render(<ReviewStatusBar {...defaultProps} layerCompleted="L1" />)

    expect(screen.getByText('AI L2 processing...')).toBeInTheDocument()
  })

  it('should show AI L3 processing when L1L2 + thorough mode', () => {
    render(<ReviewStatusBar {...defaultProps} layerCompleted="L1L2" processingMode="thorough" />)

    expect(screen.getByText('AI L3 processing...')).toBeInTheDocument()
  })

  it('should show Rule-based when layerCompleted is null', () => {
    render(<ReviewStatusBar {...defaultProps} layerCompleted={null} />)

    expect(screen.getByText('Rule-based')).toBeInTheDocument()
  })

  it('should show Complete when L1L2L3', () => {
    render(<ReviewStatusBar {...defaultProps} layerCompleted="L1L2L3" />)

    expect(screen.getByText('Complete')).toBeInTheDocument()
  })

  it('should have correct ARIA attributes', () => {
    render(<ReviewStatusBar {...defaultProps} />)

    expect(screen.getByRole('status', { name: /MQM score/i })).toBeInTheDocument()
    // Progress section uses aria-label without role="status" to reduce screen reader noise
    expect(screen.getByLabelText(/review progress/i)).toBeInTheDocument()
  })
})
