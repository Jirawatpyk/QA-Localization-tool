'use client'

import { Monitor } from 'lucide-react'

export function MobileBanner() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-text-secondary md:hidden">
      <Monitor size={16} className="shrink-0 text-warning" aria-hidden />
      <span>For the best review experience, use a desktop browser</span>
    </div>
  )
}
