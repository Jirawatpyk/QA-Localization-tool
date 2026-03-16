import { Button } from '@/components/ui/button'
import { useReviewStore, useFileState } from '@/features/review/stores/review.store'
import { cn } from '@/lib/utils'

export function AiToggle() {
  const aiSuggestionsEnabled = useFileState((fs) => fs.aiSuggestionsEnabled)
  const setAiSuggestionsEnabled = useReviewStore((s) => s.setAiSuggestionsEnabled)

  return (
    <div className="flex items-center gap-2">
      <Button
        data-testid="ai-toggle"
        variant={aiSuggestionsEnabled ? 'secondary' : 'outline'}
        size="xs"
        aria-label={`Toggle AI suggestions, currently ${aiSuggestionsEnabled ? 'on' : 'off'}`}
        aria-pressed={aiSuggestionsEnabled}
        className={cn('text-xs', !aiSuggestionsEnabled && 'opacity-60')}
        onClick={() => setAiSuggestionsEnabled(!aiSuggestionsEnabled)}
      >
        AI Suggestions {aiSuggestionsEnabled ? 'ON' : 'OFF'}
      </Button>
    </div>
  )
}
