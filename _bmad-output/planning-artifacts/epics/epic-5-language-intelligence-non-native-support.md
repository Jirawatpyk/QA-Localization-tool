# Epic 5: Language Intelligence & Non-Native Support

**Goal:** Non-native reviewers can review files in languages they cannot read using AI-powered back-translation and contextual explanation, while native reviewers have scoped access to flagged segments — enabling language-agnostic QA review.

**FRs covered:** FR29, FR35, FR38, FR39
**NFRs addressed:** NFR25 (WCAG 2.1 AA), NFR30 (UI language English-only MVP)
**Architecture:** LanguageBridge sidebar (P0 component), AI back-translation via LAYER_MODELS, Supabase RLS scoped access for native reviewers

### Story 5.1: Language Bridge — Back-translation & Contextual Explanation

As a non-native QA Reviewer,
I want AI-generated back-translation and contextual explanation of target text in a persistent sidebar,
So that I can understand and review translations in languages I cannot read.

**Acceptance Criteria:**

**Given** a QA Reviewer opens a file review view
**When** the LanguageBridge sidebar panel is displayed (persistent right panel)
**Then** for the currently focused segment, it shows:
- **Back-translation:** AI-generated translation of the target text back to the source language
- **Contextual explanation:** AI-generated note explaining nuances, cultural context, or register choices
- **Confidence indicator:** How confident the AI is in the back-translation accuracy
**And** the panel updates automatically when focus changes between findings/segments (FR35)

**Given** the back-translation is generated
**When** the AI processes a segment
**Then** the request uses the same AI provider infrastructure (`LAYER_MODELS`) with structured output
**And** back-translation uses same AI model chain as L2/L3 — output cached per segment. Cache key: `{segment_id}_{language_pair}_{model_version}`. Cache TTL: 24 hours. Cache invalidated on: file re-upload, glossary update, model version change
**And** loading state shows skeleton placeholder for back-translation + explanation (150ms fade-in)

**Given** a segment in Thai (no spaces between words)
**When** the back-translation is generated
**Then** back-translation preserves meaning with ≥ 95% semantic accuracy measured against a reference test corpus of 100 Thai segments at `docs/test-data/back-translation/th-reference.json` (scored by bilingual evaluator)
**And** Thai tone markers (่ ้ ๊ ๋) in the original are reflected correctly in the back-translation context — tone marker preservation rate ≥ 98% (verified by automated check: count markers in source vs markers referenced in explanation)
**And** Thai compound words (e.g., โรงพยาบาล, มหาวิทยาลัย) are translated as single concepts, not decomposed into sub-words — compound word recognition rate ≥ 90% on reference corpus
**And** Thai particles (ครับ/ค่ะ/นะ/คะ) are noted in the contextual explanation as politeness markers, not flagged as translation issues
**And** the contextual explanation notes any cultural adaptation or localization choices

**Given** LanguageBridge visual states
**When** the panel renders
**Then** it supports 5 states: (1) Standard = full panel with all sections, (2) Hidden = not rendered (native pair detected — reviewer is native for this language pair), (3) Confidence Warning = orange border + "Flag recommended" text when back-translation confidence < language threshold, (4) Loading = skeleton for back-translation + explanation (150ms fade-in), (5) Error = fallback message "Back-translation unavailable". AI explanation updates use `aria-live="polite"`. Back-translation diff uses `<mark>` tags with `aria-label="difference from source"`

**Given** the LanguageBridge panel on a 1024px screen
**When** the layout adjusts
**Then** the panel remains visible but may collapse to a narrower width
**And** back-translation text wraps properly without horizontal scroll

### Story 5.2: Non-Native Auto-Tag & Native Reviewer Scoped Access

As a PM,
I want decisions by non-native reviewers automatically tagged for native audit, and native reviewers to have scoped access to only their assigned flagged segments,
So that quality is maintained through layered review while keeping native reviewer scope focused.

**Acceptance Criteria:**

**Given** a non-native reviewer (user whose profile language ≠ file target language) makes any review decision
**When** the action is saved
**Then** the decision is automatically tagged with "Subject to native audit" badge — applies when `user.is_native_language_pair = false` for the file's language pair. Tag applies to EVERY action (Accept/Reject/Flag) by non-native reviewers (FR38)
**And** the tag is stored in the `review_actions` metadata: `{ non_native: true }`
**And** tag is visible in export and audit trail (italic + badge)
**And** score impact: NONE — tag is audit flag, not score modifier
**And** tag persists until native reviewer reviews and confirms/changes decision, then tag is cleared

**Given** a QA Reviewer (non-native) flags a finding specifically for native review (press F or "Flag" action with "Flag for Native" option)
**When** the segment is flagged
**Then** the flag includes the reviewer's comment explaining why native review is needed (FR29)
**And** the finding shows status: "Flagged for Native — awaiting {native reviewer name}"
**And** the segment appears in the "Flagged for Native Review" queue
**And** native reviewer sees routed findings in dedicated "For Verification" section — decision by native reviewer updates original finding state

**Given** a Native Reviewer logs in and has segments assigned to them
**When** they access a file
**Then** they see ONLY the flagged segments assigned to them — not the full file. RLS policy enforces: `SELECT segments WHERE assigned_to = current_user_id AND flagged = true` ELSE return 0 rows (FR39)
**And** they can: view source + target + back-translation, read the flagger's comment, add their own comment, and confirm or override the original decision
**And** they cannot access unflagged segments or modify non-assigned findings

**Given** the Native Reviewer comments on a flagged segment
**When** the comment is saved
**Then** the original flagger receives a notification: "Native reviewer commented on segment #X"
**And** the comment appears in the finding's history alongside the original flag
**And** the finding's state can be updated by the native reviewer (e.g., confirm as Accept or change to Reject)

**Given** the scoped access enforcement
**When** a Native Reviewer attempts to access unflagged segments via URL manipulation or API
**Then** Supabase RLS blocks the query — no data returned
**And** the UI shows: "You have access to X flagged segments in this file"

---
