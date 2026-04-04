'use client'

import {
  AlertTriangle,
  Globe,
  Languages,
  Lightbulb,
  MessageCircle,
  Music,
  Sparkles,
} from 'lucide-react'
import type { ComponentType } from 'react'

import type { LanguageNote, LanguageNoteType } from '../types'

const NOTE_TYPE_CONFIG: Record<
  LanguageNoteType,
  { label: string; Icon: ComponentType<{ className?: string }> }
> = {
  tone_marker: { label: 'Tone Marker', Icon: Music },
  politeness_particle: { label: 'Politeness', Icon: MessageCircle },
  compound_word: { label: 'Compound Word', Icon: Languages },
  cultural_adaptation: { label: 'Cultural', Icon: Globe },
  register: { label: 'Register', Icon: Sparkles },
  idiom: { label: 'Idiom', Icon: Lightbulb },
  ambiguity: { label: 'Ambiguity', Icon: AlertTriangle },
}

/**
 * Contextual explanation + language notes display.
 *
 * Guardrail #70: `lang="en"` on explanation text.
 * Language notes grouped by noteType with icons (Guardrail #25: icon + text + color).
 */
export function ContextualExplanation({
  explanation,
  languageNotes,
}: {
  explanation: string
  languageNotes: LanguageNote[]
}) {
  return (
    <div data-testid="bt-explanation">
      <h4 className="text-xs font-medium text-muted-foreground mb-1">Contextual Explanation</h4>
      <p
        className="text-sm leading-relaxed mb-3 break-words"
        lang="en"
        data-testid="explanation-text"
      >
        {explanation}
      </p>

      {languageNotes.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">Language Notes</h4>
          <ul className="space-y-1.5" data-testid="language-notes-list">
            {languageNotes.map((note, i) => {
              const config = NOTE_TYPE_CONFIG[note.noteType]
              const NoteIcon = config.Icon
              return (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <NoteIcon
                    className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div>
                    <span className="font-medium">{config.label}:</span>{' '}
                    <span className="text-muted-foreground">
                      &ldquo;{note.originalText}&rdquo; — {note.explanation}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
