import {
  AlertTriangle,
  ArrowRightLeft,
  Bell,
  BookOpen,
  CheckCircle,
  CheckSquare,
  FileText,
  Flag,
  GraduationCap,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react'
import { describe, it, expect } from 'vitest'

import { NOTIFICATION_TYPES } from '@/lib/notifications/types'

import { NOTIFICATION_ICON_MAP, getNotificationIcon } from './notificationIcons'

describe('NOTIFICATION_ICON_MAP', () => {
  it('should have an entry for every notification type', () => {
    const allTypes = Object.values(NOTIFICATION_TYPES)
    for (const type of allTypes) {
      expect(NOTIFICATION_ICON_MAP[type]).toBeDefined()
      expect(NOTIFICATION_ICON_MAP[type].icon).toBeDefined()
      expect(NOTIFICATION_ICON_MAP[type].colorClass).toBeTruthy()
    }
  })

  it('should map each type to the correct icon and color class', () => {
    expect(NOTIFICATION_ICON_MAP.analysis_complete).toEqual({
      icon: CheckCircle,
      colorClass: 'text-success',
    })
    expect(NOTIFICATION_ICON_MAP.file_assigned).toEqual({
      icon: FileText,
      colorClass: 'text-primary',
    })
    expect(NOTIFICATION_ICON_MAP.file_reassigned).toEqual({
      icon: ArrowRightLeft,
      colorClass: 'text-warning',
    })
    expect(NOTIFICATION_ICON_MAP.file_urgent).toEqual({
      icon: AlertTriangle,
      colorClass: 'text-destructive',
    })
    expect(NOTIFICATION_ICON_MAP.assignment_completed).toEqual({
      icon: CheckSquare,
      colorClass: 'text-success',
    })
    expect(NOTIFICATION_ICON_MAP.glossary_updated).toEqual({
      icon: BookOpen,
      colorClass: 'text-info',
    })
    expect(NOTIFICATION_ICON_MAP.auto_pass_triggered).toEqual({
      icon: ShieldCheck,
      colorClass: 'text-success',
    })
    expect(NOTIFICATION_ICON_MAP.finding_flagged_for_native).toEqual({
      icon: Flag,
      colorClass: 'text-warning',
    })
    expect(NOTIFICATION_ICON_MAP.native_review_completed).toEqual({
      icon: CheckSquare,
      colorClass: 'text-success',
    })
    expect(NOTIFICATION_ICON_MAP.native_comment_added).toEqual({
      icon: MessageSquare,
      colorClass: 'text-info',
    })
    expect(NOTIFICATION_ICON_MAP.language_pair_graduated).toEqual({
      icon: GraduationCap,
      colorClass: 'text-success',
    })
  })

  it('should use only design token color classes (no arbitrary Tailwind)', () => {
    const validColorClasses = [
      'text-success',
      'text-destructive',
      'text-warning',
      'text-primary',
      'text-info',
      'text-muted-foreground',
    ]
    for (const config of Object.values(NOTIFICATION_ICON_MAP)) {
      expect(validColorClasses).toContain(config.colorClass)
    }
  })
})

describe('getNotificationIcon', () => {
  it('should return correct config for known type', () => {
    const result = getNotificationIcon('file_assigned')
    expect(result.icon).toBe(FileText)
    expect(result.colorClass).toBe('text-primary')
  })

  it('should return fallback Bell icon for unknown type', () => {
    const result = getNotificationIcon('unknown_type_xyz')
    expect(result.icon).toBe(Bell)
    expect(result.colorClass).toBe('text-muted-foreground')
  })

  it('should return fallback for empty string', () => {
    const result = getNotificationIcon('')
    expect(result.icon).toBe(Bell)
    expect(result.colorClass).toBe('text-muted-foreground')
  })
})
