'use client'

type ModeCardProps = {
  title: string
  layers: string
  estimatedTime: string
  costPerFile: string
  description: string
  badge?: string
  selected: boolean
  onSelect: () => void
}

export function ModeCard({
  title,
  layers,
  estimatedTime,
  costPerFile,
  description,
  badge,
  selected,
  onSelect,
}: ModeCardProps) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      data-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      {badge && <span>{badge}</span>}
      <div>{title}</div>
      <div>{layers}</div>
      <div>{estimatedTime}</div>
      <div>{costPerFile}</div>
      <div>{description}</div>
    </div>
  )
}
