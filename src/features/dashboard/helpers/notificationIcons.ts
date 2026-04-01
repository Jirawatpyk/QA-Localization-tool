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
  type LucideIcon,
} from 'lucide-react'

import { NOTIFICATION_TYPES, type NotificationType } from '@/lib/notifications/types'

type NotificationIconConfig = {
  icon: LucideIcon
  colorClass: string
}

/**
 * Maps each notification type to a Lucide icon + design token color class.
 * Uses shape + text + color (Guardrail #15 — color never sole info carrier).
 * Color classes from `src/styles/tokens.css` — no arbitrary Tailwind values.
 */
export const NOTIFICATION_ICON_MAP: Record<NotificationType, NotificationIconConfig> = {
  [NOTIFICATION_TYPES.ANALYSIS_COMPLETE]: { icon: CheckCircle, colorClass: 'text-success' },
  [NOTIFICATION_TYPES.FILE_ASSIGNED]: { icon: FileText, colorClass: 'text-primary' },
  [NOTIFICATION_TYPES.FILE_REASSIGNED]: { icon: ArrowRightLeft, colorClass: 'text-warning' },
  [NOTIFICATION_TYPES.FILE_URGENT]: { icon: AlertTriangle, colorClass: 'text-destructive' },
  [NOTIFICATION_TYPES.ASSIGNMENT_COMPLETED]: { icon: CheckSquare, colorClass: 'text-success' },
  [NOTIFICATION_TYPES.GLOSSARY_UPDATED]: { icon: BookOpen, colorClass: 'text-info' },
  [NOTIFICATION_TYPES.AUTO_PASS_TRIGGERED]: { icon: ShieldCheck, colorClass: 'text-success' },
  [NOTIFICATION_TYPES.FINDING_FLAGGED_FOR_NATIVE]: { icon: Flag, colorClass: 'text-warning' },
  [NOTIFICATION_TYPES.NATIVE_REVIEW_COMPLETED]: { icon: CheckSquare, colorClass: 'text-success' },
  [NOTIFICATION_TYPES.NATIVE_COMMENT_ADDED]: { icon: MessageSquare, colorClass: 'text-info' },
  [NOTIFICATION_TYPES.LANGUAGE_PAIR_GRADUATED]: { icon: GraduationCap, colorClass: 'text-success' },
}

const FALLBACK_ICON: NotificationIconConfig = {
  icon: Bell,
  colorClass: 'text-muted-foreground',
}

/** Get icon config for a notification type, with fallback for unknown types. */
export function getNotificationIcon(type: string): NotificationIconConfig {
  return (NOTIFICATION_ICON_MAP as Record<string, NotificationIconConfig>)[type] ?? FALLBACK_ICON
}
