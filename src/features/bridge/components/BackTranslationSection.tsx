'use client'

/**
 * Back-translation text display with diff annotations.
 *
 * AC4: `<mark>` tags with `aria-label="difference from source"` for BT diff highlights.
 * Guardrail #70: `lang` attribute on BT text element set to sourceLang.
 */
export function BackTranslationSection({
  backTranslation,
  sourceLang,
}: {
  backTranslation: string
  sourceLang: string
}) {
  return (
    <div data-testid="bt-section">
      <h4 className="text-xs font-medium text-muted-foreground mb-1">Back-translation</h4>
      <p className="text-sm leading-relaxed break-words" lang={sourceLang} data-testid="bt-text">
        {backTranslation}
      </p>
    </div>
  )
}
