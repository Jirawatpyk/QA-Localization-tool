# Epic 11: Self-healing Translation (Growth/Vision)

**Goal:** AI generates verified corrections for detected QA issues using multi-agent pipeline (Fix Agent + Judge Agent), with progressive trust model (Shadow → Assisted → Autonomous) — transforming the tool from Detective to Doctor.

**FRs covered:** FR-SH1 to FR-SH18
**NFRs addressed:** NFR-SH1 (L2 fix < 3s), NFR-SH2 (L3 fix + Judge < 10s), NFR-SH3 (Shadow < 20% overhead), NFR-SH4 (fix cost < $0.05 L2 / $0.15 L3), NFR-SH5 (RAG < 500ms), NFR-SH6 (fix failure does not block QA), NFR-SH7 (fix cache per file version)
**Scope:** Growth/Vision (Month 3-12+). Depends on MVP data accumulation (500+ human-corrected translations per language pair).
**Architecture:** Fix Agent + Judge Agent (decoupled verification), RAG pipeline (pgvector), Progressive Trust Gateway, Inngest self-healing orchestrator

### Story 11.1: Fix Agent — AI Fix Generation with RAG Context

As a QA Reviewer,
I want the system to generate AI-powered fix suggestions for detected issues using glossary and translation memory context,
So that I get intelligent correction proposals that respect project terminology and past translations.

**Acceptance Criteria:**

**Given** a finding has been detected by the QA pipeline (L1, L2, or L3)
**When** the self-healing pipeline processes it
**Then** the Fix Agent generates a correction using: source text, target text, finding details, and RAG-retrieved context (glossary terms + translation memory + previously accepted fixes) (FR-SH1, FR-SH2)
**And** the fix output uses structured output (Zod schema) containing: proposed_correction, confidence (0-100), fix_category, explanation, tags_preserved (boolean)
**And** XLIFF tags, placeholders (`{0}`, `%s`), and HTML entities in the original are preserved in the fix (constrained decoding). Validation: parse fixed_text as XLIFF, verify tag count equals original AND placeholder count equals original — fail if validation error

**Given** the fix request complexity
**When** the system routes the request
**Then** simple fixes (terminology, obvious fluency) route to Layer 2 quick fix (GPT-4o-mini, < 3s) (NFR-SH1)
**And** complex fixes (semantic, contextual, cultural) route to Layer 3 deep fix (Claude Sonnet, < 10s including Judge) (NFR-SH2)
**And** routing is determined by: finding severity + category + L2 confidence score (FR-SH3)

**Given** RAG context retrieval
**When** the Fix Agent prompt is assembled
**Then** pgvector retrieves: top 5 glossary terms by semantic similarity, top 3 translation memory matches, and top 3 previously accepted fixes for same pattern (FR-SH2)
**And** retrieval completes within 500ms (NFR-SH5)
**And** retrieved context is included in the Fix Agent prompt with source attribution

**Given** the Fix Agent encounters an error or timeout
**When** fix generation fails
**Then** the original finding remains unaffected — no fix suggestion is shown
**And** the QA pipeline continues normally (NFR-SH6)
**And** the failure is logged with: finding_id, error type, model, latency

### Story 11.2: Judge Agent — Independent Fix Verification

As a QA Reviewer,
I want every AI fix independently verified by a separate Judge Agent before being presented to me,
So that I only see high-quality corrections and hallucinated fixes are destroyed before reaching the UI.

**Acceptance Criteria:**

**Given** the Fix Agent has generated a correction
**When** the Judge Agent evaluates it
**Then** the Judge uses a different model or prompt (preventing self-evaluation bias) to assess: semantic preservation (does the fix maintain meaning?), glossary compliance (does it use approved terms?), tag integrity (are all tags preserved?), fluency (is the fix natural?), no new errors (does the fix introduce problems?) (FR-SH4)
**And** the Judge returns: pass/fail verdict, quality score (0-100, clamped — non-numeric values rejected with error), and reasoning per criterion

**Given** the Judge Agent passes the fix (quality score ≥ threshold)
**When** the fix enters the Trust Gateway
**Then** routing is: High confidence (>95% + Judge pass) → auto-apply eligible; Medium (80-95%) → suggest with 1-click accept; Low (<80%) → flag only (display but de-emphasize) (FR-SH5)

**Given** the Judge Agent fails the fix
**When** the fix is rejected by the Judge
**Then** the fix is destroyed — NOT presented to the reviewer
**And** the failure is logged in `feedback_events` for analysis: `{ judge_rejected: true, reason, fix_quality_score }`
**And** the original finding remains with no fix suggestion

**Given** Judge Agent processing
**When** combined with Fix Agent
**Then** total time for L3 deep fix + Judge < 10 seconds per finding (NFR-SH2)
**And** the Judge and Fix Agent pipelines are orchestrated by `selfHealingOrchestrator.ts` via Inngest

### Story 11.3: Fix Presentation & User Interaction

As a QA Reviewer,
I want to see AI fix suggestions alongside findings with before/after preview, and Accept/Modify/Reject each fix,
So that I can efficiently apply good corrections and provide feedback on poor ones.

**Acceptance Criteria:**

**Given** a fix suggestion has passed the Judge Agent
**When** the reviewer views the finding in the review UI
**Then** a SuggestedFix component displays alongside the finding: before text (current target), after text (proposed fix), confidence badge (FixConfidenceBadge), Judge status (pass + score), fix category badge, and explanation text (FR-SH6)
**And** the component animates in via Supabase Realtime push (`useSuggestedFixes` hook)

**Given** the reviewer views a fix suggestion
**When** they decide on the fix
**Then** they can: Accept (apply fix as-is), Modify (edit the fix before accepting), or Reject (dismiss the fix)
**And** every action is recorded with: timestamp, actor, action, original_fix, modified_fix (if modified), rationale (optional) (FR-SH7)

**Given** the reviewer wants to bulk accept high-confidence fixes
**When** they use the bulk accept action
**Then** only fixes above a configurable confidence threshold (default 90%) are eligible for bulk accept (FR-SH8)
**And** a confirmation dialog shows: "Accept X fixes above 90% confidence?"
**And** each bulk-accepted fix is individually logged

**Given** a segment has multiple fix versions over time
**When** the reviewer views fix history
**Then** a chronological list shows: each fix attempt with timestamp, confidence, Judge verdict, reviewer action, and the final applied text (FR-SH9)

**Given** fix suggestions are cached
**When** the same file version is re-opened
**Then** previously generated fixes are loaded from cache (not re-generated) (NFR-SH7)
**And** cache is invalidated when file content changes or glossary updates

### Story 11.4: Progressive Trust System — Shadow, Assisted & Autonomous

As an Admin,
I want the system to progressively increase automation from Shadow to Assisted to Autonomous mode based on proven accuracy,
So that trust is earned through measurable performance and can be reverted if quality drops.

**Acceptance Criteria:**

**Given** a language pair has accumulated sufficient feedback data
**When** Shadow Mode is active (default starting mode)
**Then** the AI generates fixes silently in the background
**And** fixes are NOT shown to the reviewer
**And** the system tracks accuracy by comparing AI fixes against reviewer corrections on the same findings
**And** a TrustLevelIndicator component shows: "Shadow Mode — tracking accuracy: X% (need 85% for Assisted)" where X = `(accepted_fix_count / total_fix_count) × 100` calculated per language_pair per 500-fix rolling window (FR-SH10)

**Given** Shadow Mode accuracy exceeds 85% over rolling 500 fixes for a language pair
**When** the transition threshold is met
**Then** an Admin notification: "EN→TH eligible for Assisted Mode (accuracy: 87%)"
**And** Admin can approve the transition or keep Shadow Mode
**And** transition to Assisted Mode: high-confidence fixes shown as 1-click suggestions alongside findings (FR-SH11)

**Given** Assisted Mode acceptance rate exceeds 75% AND Judge agreement > 90% for 1,000+ fixes
**When** the Autonomous transition threshold is met
**Then** Admin receives notification: "EN→TH eligible for Autonomous Mode"
**And** Admin approval required for transition
**And** Autonomous Mode: highest-confidence fixes auto-applied with reviewer override capability (FR-SH12)

**Given** Autonomous Mode is active for a language pair
**When** the revert rate exceeds 5% in any 7-day rolling window
**Then** the system automatically reverts to Assisted Mode (kill switch)
**And** Admin is notified: "EN→TH reverted to Assisted — revert rate {X}% exceeded threshold"
**And** the revert event is logged with full context (FR-SH12)

**Given** the trust level display
**When** the Admin views Settings → Self-healing → Trust Levels
**Then** each language pair shows: current mode (Shadow/Assisted/Autonomous), accuracy %, acceptance rate %, fixes until next threshold, transition history (dates + admin who approved), and kill switch status (FR-SH13)

### Story 11.5: RAG Knowledge Base & Confidence Recalibration

As a PM,
I want the RAG knowledge base to update when fixes are accepted and confidence thresholds to recalibrate weekly,
So that the system continuously improves its fix quality and adapts to language-specific patterns.

**Acceptance Criteria:**

**Given** a reviewer Accepts or Modifies a fix
**When** the action is saved
**Then** the accepted/modified fix is embedded (text-embedding-3-small) and added to the pgvector knowledge base
**And** the embedding includes: source text, target text (corrected), language pair, fix category, and context metadata
**And** future RAG retrievals for similar patterns will include this fix as reference (FR-SH14)

**Given** a reviewer Rejects a fix
**When** the rejection is saved
**Then** the rejected fix is NOT added to the positive knowledge base
**And** it is logged as a negative signal for confidence calibration
**And** if the same pattern is rejected 3+ times, confidence for that pattern type is automatically reduced

**Given** weekly recalibration schedule
**When** the recalibration job runs (Inngest cron)
**Then** confidence thresholds per language pair are recalculated using the last 7 days of feedback (minimum 100 new signals required). IF new_signals < 100, recalibration SKIPPED and previous thresholds remain active
**And** thresholds adjust: if accuracy improved → thresholds can lower (more auto-suggestions); if accuracy declined → thresholds increase (more conservative) (FR-SH15)
**And** recalibration results are logged: previous thresholds, new thresholds, data points used, direction of change

**Given** the knowledge base grows over time
**When** retrieval quality is measured
**Then** relevance scores of retrieved context are tracked
**And** stale embeddings (>6 months without positive reinforcement) are deprioritized in retrieval results

### Story 11.6: Self-healing Analytics, Logging & Cost Control

As an Admin,
I want a self-healing analytics dashboard, complete pipeline logging, and separate cost budget enforcement,
So that I can monitor fix quality, trace every fix decision, and control self-healing costs independently.

**Acceptance Criteria:**

**Given** the Admin accesses the Self-healing Analytics dashboard
**When** the dashboard loads
**Then** it shows per language pair: fix acceptance rate (line chart), fix quality score trend, trust mode progression timeline, top fix categories (bar chart), Shadow vs Assisted vs Autonomous volume, and cost breakdown (FR-SH16)
**And** the dashboard includes comparison: "Cost savings: X hours of manual correction avoided"

**Given** any event in the self-healing pipeline
**When** the event occurs (fix generation, Judge evaluation, trust routing, user action, auto-apply, revert)
**Then** a structured log entry is created linked to: source finding_id, file_id, project_id, pipeline step, model used, latency, tokens, cost, and result (FR-SH17)
**And** the full provenance chain is traceable: finding → fix → judge → trust routing → user action → final result

**Given** self-healing cost budget configuration
**When** an Admin sets a monthly budget per project for self-healing (separate from QA detection budget)
**Then** the system tracks: fix generation cost (L2 quick fix ~$0.05/fix, L3 deep fix ~$0.15/fix), Judge evaluation cost, RAG retrieval cost (minimal), and total self-healing spend (FR-SH18)
**And** at 80% budget, a warning notification is sent
**And** at 100% budget, self-healing pauses (QA detection continues unaffected)
**And** the budget is displayed: "Self-healing: $45 / $100 this month (45%)"

**Given** the self-healing pipeline monitoring
**When** failure rates exceed normal thresholds
**Then** alerts fire: Fix Agent failure rate > 10%, Judge rejection rate > 50% (indicates Fix Agent quality issue), RAG retrieval latency > 1s consistently
**And** the system can auto-disable self-healing for a language pair if failure rate exceeds 25% for 24 hours
