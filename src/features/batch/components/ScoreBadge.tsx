'use client'

type ScoreBadgeProps = {
  score: number | null
  status?: string
}

function getVariant(score: number | null): 'success' | 'warning' | 'destructive' | 'muted' {
  if (score === null) return 'muted'
  if (score >= 95) return 'success'
  if (score >= 80) return 'warning'
  return 'destructive'
}

const variantClasses: Record<string, string> = {
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20',
  muted: 'bg-muted text-muted-foreground border-muted',
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  const variant = getVariant(score)
  const displayText = score !== null ? score.toFixed(1) : 'N/A'

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${variantClasses[variant]}`}
    >
      {displayText}
    </span>
  )
}
