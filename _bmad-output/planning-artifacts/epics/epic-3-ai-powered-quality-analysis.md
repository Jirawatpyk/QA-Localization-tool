# Epic 3: AI-Powered Quality Analysis

**Goal:** Users get AI semantic analysis (Layer 2 screening + Layer 3 deep analysis) that catches issues beyond rule-based checks, with confidence scoring, resilient processing, and cost visibility — extending the pipeline from Xbench parity to beyond-Xbench intelligence.

**FRs covered:** FR9, FR10, FR16, FR17, FR18, FR20, FR22, FR23, FR36, FR63, FR71, FR72
**NFRs addressed:** NFR3 (L2 < 30s/100 segments), NFR4 (L3 < 2 minutes per flagged segments), NFR16 (AI failure does not block QA), NFR18 (queue jobs survive restart), NFR36 (all AI API calls logged)
**Architecture:** Vercel AI SDK v6 structured output, LAYER_MODELS config, fallbackChain pattern, Inngest pipeline extension (L2+L3 steps), Upstash rate limiting for AI triggers

### Preparation Artifacts (P1-P5.1)

| # | Artifact | Path | Used By |
|---|----------|------|---------|
| P1 | AI SDK Spike Guide | `planning-artifacts/research/ai-sdk-spike-guide-2026-02-26.md` | Story 3.0, 3.1 |
| P2 | AI Mock Strategy | `src/test/mocks/ai-providers.ts` + `src/test/fixtures/ai-responses.ts` | Story 3.2a-3.5 (all AI tests) |
| P3 | Proactive Guardrails | CLAUDE.md (Guardrails #16-22) | All stories |
| P4 | Inngest L2/L3 Templates | `planning-artifacts/research/inngest-l2-l3-template-guide-2026-02-26.md` + `src/features/pipeline/helpers/runL2ForFile.ts`, `runL3ForFile.ts`, `chunkSegments.ts` | Story 3.2a, 3.3 |
| P5 | Prompt Intelligence Module | `src/features/pipeline/prompts/` (7 modules, 66 tests) | Story 3.2a (`buildL2Prompt`), 3.3 (`buildL3Prompt`) |
| P5.1 | Prompt Evaluation Framework | `src/features/pipeline/prompts/evaluation/` (golden segments, scoring, 43 tests) | Story 3.4 (regression testing) |

### Story 3.0: Score & Review Infrastructure

As a Developer,
I want the shared score recalculation infrastructure, review state store, and real-time event system established,
So that Stories 3.1-3.5 can use consistent score lifecycle, finding state events, and real-time UI updates without forward dependency on Epic 4.

**Acceptance Criteria:**

**Given** the project foundation is in place (Epic 1 complete)
**When** this infrastructure story is implemented
**Then** a Zustand `useReviewStore` is created at `src/features/review/stores/review-store.ts` managing: finding list state (findingsMap, selectedId, filterState), score display state (currentScore, scoreStatus, isRecalculating), and bulk selection state (selectedIds, selectionMode)
**And** the store follows the Architecture slice pattern: each concern (findings, score, selection) as a separate slice composed into the store
**And** the store is scoped per file (reset on file navigation)

**Given** the review store exists
**When** a finding state changes (Accept, Reject, Flag, etc.)
**Then** a `finding.changed` event schema is defined: `{ findingId: string, fileId: string, projectId: string, previousState: FindingState, newState: FindingState, triggeredBy: string, timestamp: string }`
**And** the event is emitted after a 500ms debounce (Architecture Decision 3.4) to batch rapid changes
**And** the event triggers an Inngest score recalculation function with deterministic ID: `step.run("recalculate-score-{fileId}", ...)`
**And** the Inngest function runs in serial queue per project: `concurrency: { key: "score-{projectId}", limit: 1 }`

**Given** score recalculation infrastructure
**When** a Supabase Realtime channel is set up
**Then** a `useScoreSubscription` hook at `src/features/review/hooks/use-score-subscription.ts` subscribes to `scores` table changes filtered by `file_id`
**And** on score update event: store updates `currentScore` + `scoreStatus`, ScoreBadge re-renders with 200ms fade-in animation (respects prefers-reduced-motion)
**And** on subscription error: fallback to polling every 5 seconds with exponential backoff (5s → 10s → 20s, max 60s)

**Given** the infrastructure is tested
**When** I verify the setup
**Then** unit tests exist for: `useReviewStore` state transitions, `finding.changed` event debounce behavior, `useScoreSubscription` reconnection logic
**And** the Inngest function is registered and testable via Inngest Dev Server

### Story 3.1: AI Cost Control, Throttling & Model Pinning

As a PM / Admin,
I want to see AI cost estimates before processing, enforce rate limits and budget constraints on AI usage, and pin specific model versions per project,
So that I can control costs, prevent abuse, and ensure consistent AI behavior across processing runs.

**Acceptance Criteria:**

**Given** a QA Reviewer has selected files and a processing mode
**When** they see the ProcessingModeDialog (from Story 2.6)
**Then** estimated AI costs are displayed per mode:
- Economy (L1+L2): "~$0.40 per 100K words" with estimated cost for selected files based on word count
- Thorough (L1+L2+L3): "~$2.40 per 100K words" with estimated cost for selected files
**And** the estimate is calculated from: `(total_word_count / 100,000) × mode_rate_per_100k` where word_count is from segments table (same source as MQM scoring in Story 2.5) (FR63)
**And** actual cost ÷ word_count × 100,000 compared against estimate must have variance ≤ 20%
**And** a comparison note shows: "vs. manual QA: ~$150-300 per 100K words"

**Given** a user triggers AI pipeline processing
**When** the request hits the AI pipeline trigger endpoint
**Then** Upstash rate limiting enforces: 5 requests per 60-second sliding window (not fixed 1min buckets) per user (FR71)
**And** per-project per-layer rate limits also apply: L2 max 100/hour, L3 max 50/hour. Key: `ai_quota:{project_id}:{layer}`
**And** budget enforcement: `project.ai_budget_monthly_usd`. On each AI call, estimate cost, check remaining budget. If insufficient, block with toast: "AI budget exhausted ($X/$Y). Upgrade plan or set new budget"
**And** budget resets monthly. Admin can override with one-time increase
**And** coordination: both Upstash rate limit and project budget enforced — most restrictive wins
**And** if rate limited, return 429 with message: "Rate limit exceeded — please wait before starting another analysis"
**And** the rate limit key is `user_id` (authenticated users)

**Given** an Admin navigates to project settings
**When** they access the AI Configuration section
**Then** they can pin a specific AI model version per project per layer:
- L2: select from available models (e.g., `gpt-4o-mini-2024-07-18`)
- L3: select from available models (e.g., `claude-sonnet-4-5-20250929`)
**And** pinned versions are stored in project configuration (FR72)
**And** the fallback chain respects pinned versions: pinned first → latest same provider → next provider

**Given** a pinned model version becomes unavailable
**When** the Inngest pipeline attempts to use it
**Then** the fallback chain activates and an admin notification is sent: "Pinned model {version} unavailable for project {name} — using fallback"
**And** the event is logged in the audit trail

**Given** concurrent file processing is requested
**When** multiple files are queued
**Then** the Inngest concurrency control enforces: 1 concurrent pipeline per project (serial per project for score atomicity) (FR17)
**And** up to 50 files can be queued in the managed queue
**And** queue position and estimated wait time are displayed per file (NFR18)

**Given** AI processing completes for a batch
**When** the results are available
**Then** actual costs are recorded per file: model used, tokens consumed (input + output), calculated cost
**And** a cost summary is shown in the batch results: total AI cost, cost per file, cost per 100K words
**And** costs are stored in: `ai_usage_logs` table with: id, file_id, project_id, tenant_id, layer, model, provider, input_tokens, output_tokens, estimated_cost, latency_ms, status, created_at (NFR36)

**Given** an Admin views the AI usage dashboard
**When** the dashboard loads
**Then** it shows: monthly AI spend by project, spend by model/provider, average cost per file, trend over time
**And** budget alerts can be configured: warn at 80% of monthly budget, block at 100%
**And** alert threshold percentage is editable by both Admin and PM roles (PM manages day-to-day budget awareness; Admin manages budget ceiling and overrides). QA Reviewer cannot edit alert settings.

### Story 3.2a: AI Provider Integration & Structured Output

As a Developer,
I want the AI provider infrastructure configured with Vercel AI SDK v6, structured output schemas, and L2 prompt templates,
So that L2 screening has a reliable, tested foundation for calling AI models with type-safe responses.

**Acceptance Criteria:**

**Given** the AI provider configuration at `src/lib/ai/providers.ts`
**When** the L2 provider is configured
**Then** `LAYER_MODELS.L2.primary` is set to `gpt-4o-mini-2024-07-18` via Vercel AI SDK v6
**And** `LAYER_MODELS.L2.fallback` chain is configured: (1) pinned version, (2) latest same provider, (3) `gemini-2.0-flash`
**And** each provider has a health check function returning availability status

**Given** the L2 structured output schema
**When** the Zod schema is defined at `src/features/pipeline/schemas/l2-output.ts`
**Then** the schema enforces: `{ findings: [{ segmentId: string, category: enum, severity: enum, description: string, suggestion: string, confidence: number }] }`
**And** confidence value is clamped to [0, 100] — non-numeric values rejected with Zod refinement error
**And** all 6 finding categories are required: mistranslation, omission, addition, fluency, register, cultural

**Given** the L2 prompt template
**When** assembled for a batch of segments
**Then** the prompt MUST be assembled via `buildL2Prompt()` from `src/features/pipeline/prompts/build-l2-prompt.ts` which includes: glossary terms, MQM taxonomy categories, project domain context, language-specific instructions, few-shot calibration examples, confidence scoring guidance, and L1 findings for dedup
**And** L2 focuses on SEMANTIC issues not caught by L1 rules: mistranslations, omissions, additions, fluency issues, register/tone mismatches, and cultural inappropriateness. L2 does NOT re-check L1 categories (tags, placeholders, numbers) unless semantic interpretation matters
**And** prompt template is tested with mock responses to verify Zod parsing

**Given** AI API call logging requirements
**When** any L2 API call completes (success or error)
**Then** the call is logged via pino with: model, provider, latency_ms, input_tokens, output_tokens, estimated_cost, status (success/error), language_pair (NFR36)

### Story 3.2b: L2 Batch Processing & Pipeline Extension

As a QA Reviewer,
I want AI Layer 2 screening to process segments in efficient batches within the Inngest pipeline,
So that large files are processed within performance targets with proper error handling per batch.

**Acceptance Criteria:**

**Given** Layer 1 (rule-based) processing has completed for a file
**When** the Inngest pipeline continues to Layer 2
**Then** segments are sent to the L2 AI model via the provider infrastructure from Story 3.2a
**And** segments are batched in groups of 20 (configurable batch size — batch=1 and batch=1000 must both work correctly; last batch ≤ batch_size)
**And** each batch is processed as a separate Inngest step with deterministic ID: `step.run("batch-{batchId}-L2", ...)`

**Given** L2 screening produces findings for a batch
**When** findings are saved
**Then** each finding is inserted into the findings table with: layer = "L2", confidence = AI-reported confidence (0-100), status = "Pending"
**And** the confidence value reflects the per-language-pair calibration from `language_pair_configs` (FR36)
**And** findings with confidence below `L2_confidence_min` threshold for the language pair are flagged with a "Low confidence" badge

**Given** 100 segments are submitted for L2 screening
**When** processing completes
**Then** it finishes within 30 seconds (NFR3)

**Given** Economy mode was selected
**When** L2 processing completes
**Then** the pipeline stops after L2 (no L3 triggered)
**And** `scores.layer_completed` = "L1L2" and `scores.score_status` = "calculated"

### Story 3.2c: L2 Results Display & Score Update

As a QA Reviewer,
I want to see L2 AI findings appear in real-time with updated scores as screening completes,
So that I can begin reviewing AI findings immediately and track score progression per layer.

**Acceptance Criteria:**

**Given** L2 processing completes for a file
**When** results are available
**Then** the score is recalculated incorporating L2 findings (same MQM formula from Story 2.5) via `finding.changed` event from Story 3.0
**And** `scores.layer_completed` is updated to "L1L2"
**And** the score badge updates from "Rule-based" (blue) to "AI Screened" (purple) via Supabase Realtime push (Story 3.0 infrastructure)
**And** the QA Reviewer can see both L1 and L2 findings in the review UI

**Given** L2 findings are pushed via Supabase Realtime
**When** the `useReviewStore` (Story 3.0) receives new findings
**Then** findings are inserted into the finding list at correct severity position (Critical first, Major, Minor)
**And** a subtle animation highlights newly added findings (200ms fade-in, respects prefers-reduced-motion)
**And** the ReviewProgress component updates: "AI: L2 complete" with checkmark

**Given** findings with confidence indicators
**When** displayed in the finding list
**Then** L2 findings show confidence badge: High (≥85%, green), Medium (70-84%, orange), Low (<70%, red)
**And** "Low confidence" badge appears for findings below `L2_confidence_min` threshold from `language_pair_configs`

### Story 3.3: AI Layer 3 Deep Contextual Analysis

As a QA Reviewer,
I want AI-powered deep contextual analysis (Layer 3) on segments flagged by screening,
So that I get the most thorough quality assessment with high-confidence findings on complex issues.

**Acceptance Criteria:**

**Given** Layer 2 screening has completed and Thorough mode was selected
**When** the Inngest pipeline continues to Layer 3
**Then** only segments flagged by L2 are sent to L3 — explicit boolean: segment sent to L3 IF `(L2_findings.length > 0) OR (L2_confidence < language_pair_threshold)` — not all segments
**And** the L3 AI model is used (primary: `claude-sonnet-4-5-20250929`, as configured in `LAYER_MODELS.L3.primary` in `src/lib/ai/providers.ts`)
**And** each segment is processed as a separate Inngest step: `step.run("segment-{id}-L3", ...)`

**Given** a segment is sent to the L3 model
**When** it performs deep contextual analysis
**Then** the prompt MUST be assembled via `buildL3Prompt()` from `src/features/pipeline/prompts/build-l3-prompt.ts` which includes: glossary terms, MQM taxonomy categories, project domain context, language-specific instructions, few-shot calibration examples, confidence scoring with rationale requirement, cross-layer dedup instructions, and all prior findings (L1+L2). Additionally, surrounding context (±2 segments in file order — if at boundary, use available segments: first segment has 0 above, 2 below; context sent as `{ previous: [{…}], current: {…}, next: [{…}] }`) MUST be included
**And** L3 deepens L2 analysis: full semantic accuracy verification + glossary consistency + tone/register analysis + cultural sensitivity. When L3 confirms L2 finding, boost confidence. When L3 contradicts (finds no issue where L2 did), mark for review with "L3 disagrees" badge
**And** the response uses Zod structured output: `{ findings: [{ segmentId, category, severity, description, suggestion, confidence, reasoning }] }`
**And** the `reasoning` field explains why the issue was flagged (for reviewer context)

**Given** L3 analysis produces findings
**When** findings are saved
**Then** each finding is inserted with: layer = "L3", confidence = AI-reported confidence, status = "Pending"
**And** if L3 confirms an L2 finding (same segment, same category), the L2 finding's confidence is boosted and a "Confirmed by L3" badge is added
**And** if L3 contradicts an L2 finding (finds no issue where L2 did), the L2 finding gets a "L3 disagrees" badge for reviewer attention

**Given** L3 processing completes for a file
**When** results are available
**Then** the score is recalculated incorporating L3 findings
**And** `scores.layer_completed` is updated to "L1L2L3"
**And** the score badge updates to "Deep Analyzed" (gold) via Supabase Realtime push
**And** `scores.score_status` = "calculated" (final)

**Given** 100 flagged segments are submitted for L3 analysis
**When** processing completes
**Then** it finishes within 2 minutes (NFR4)

**Given** L3 completes and the final score meets auto-pass criteria
**When** auto-pass evaluation runs
**Then** evaluation occurs only on the final score (all layers complete) (FR22)
**And** auto-pass checks: score >= language pair threshold AND 0 Critical findings AND 0 unresolved Major findings

### Story 3.4: AI Resilience — Fallback, Retry & Partial Results

As a QA Reviewer,
I want AI processing to gracefully handle failures with fallback providers, automatic retries, and preserved partial results,
So that I never lose rule-based findings and can continue working even when AI services are degraded.

**Acceptance Criteria:**

**Given** the primary L2 model (`gpt-4o-mini`) is unavailable or returns errors
**When** the fallback chain activates
**Then** the system automatically tries: (1) pinned version first, (2) latest same provider, (3) fallback provider (`gemini-2.0-flash` for L2)
**And** each fallback attempt is logged with an audit flag: `{ fallback: true, originalProvider, actualProvider, reason }` (FR18)
**And** findings generated by fallback providers include a visual indicator next to confidence percentage: "⚠ 78% (Fallback)" badge. Hovering reveals tooltip: "Generated by {provider} fallback — confidence may differ from primary model"

**Given** the primary L3 model (`claude-sonnet-4-5-20250929`) is unavailable
**When** the fallback chain activates
**Then** the system falls back to `gpt-4o` (OpenAI) for L3
**And** findings from fallback models are flagged for confidence recalibration per language pair (FR18)

**Given** an AI API call fails after all fallback attempts are exhausted
**When** the Inngest step encounters a terminal failure
**Then** Inngest retries the step at intervals: 1s, 2s, 4s (3 retries with exponential backoff)
**And** after 3 retries fail, file status is set to "ai_partial" (not "failed")
**And** all rule-based (L1) findings remain intact and visible (FR16, NFR16)
**And** the score is calculated using L1 findings only, with a "Partial — AI unavailable" badge

**Given** L2 succeeds but L3 fails for a file in Thorough mode
**When** L3 processing cannot complete
**Then** L1 + L2 findings are preserved and the score reflects L1+L2
**And** `scores.layer_completed` = "L1L2" with `scores.score_status` = "partial"
**And** the file shows a yellow warning: "Deep analysis unavailable — showing screening results"

**Given** a file has failed or partial AI processing
**When** the QA Reviewer clicks "Retry AI Analysis"
**Then** only the failed layers are re-run (not the entire pipeline) (FR20)
**And** a new Inngest function is triggered for the specific layers that need retry
**And** existing findings from successful layers are preserved
**And** the retry button shows estimated wait time based on current queue depth

**Given** a batch of 10 files is being processed and AI becomes degraded mid-batch
**When** some files succeed and others fail
**Then** each file's status is tracked independently
**And** successful files show full results
**And** failed files show partial results with retry option
**And** the batch summary accurately reflects mixed status: "7/10 complete, 3/10 partial"

**Given** the AI provider returns a 429 (rate limited) response
**When** the Inngest step encounters the rate limit
**Then** the step backs off using the provider's Retry-After header
**And** other files in the batch continue processing (rate limit is per-provider, not system-wide)

### Story 3.5: Score Lifecycle & Confidence Display

As a QA Reviewer,
I want to see scores update progressively as each analysis layer completes, with per-finding confidence indicators calibrated to my language pair,
So that I can trust the scores, understand how they evolve, and make informed review decisions.

**Acceptance Criteria:**

**Given** a file enters the pipeline
**When** processing begins
**Then** `scores.score_status` = "calculating" and the UI shows a ScoreBadge with spinner and "Calculating..." text
**And** the "Approve" button is disabled while score is calculating

**Given** Layer 1 completes
**When** the initial score is calculated
**Then** `scores.score_status` remains "calculating" if AI layers are pending
**And** the ScoreBadge shows the L1 score value with "Rule-based" layer badge (blue)
**And** an "AI pending" indicator shows alongside

**Given** each subsequent layer (L2, L3) completes
**When** the score is recalculated
**Then** the score transitions: dimmed state (score_status='calculating') → "Recalculating..." badge visible → Inngest recalculation (~1-2s) → new score pushed via Supabase Realtime → score highlighted briefly (200ms fade-in)
**And** dimmed state lasts until recalculation completes (no assertion on exact duration, only that state transitions occur correctly)
**And** the Approve button: `button.disabled = true` WHILE `score_status != 'calculated'`; `button.disabled = false` WHEN `score_status = 'calculated'` (FR22)
**And** score recalculation Inngest function has deterministic ID: `step.run("recalculate-score-{projectId}", ...)` per Architecture Decision 3.4
**And** DEPENDENCY: Uses Zustand `useReviewStore`, `finding.changed` event schema, and Supabase Realtime listener from Story 3.0 "Score & Review Infrastructure"

**Given** a reviewer changes a finding status during review (e.g., Reject a finding)
**When** the score needs recalculation
**Then** a `finding.changed` event is emitted after 500ms debounce
**And** the Inngest recalculation runs in serial queue per project (`concurrency: { key: projectId, limit: 1 }`)
**And** during recalculation: previous score shown dimmed, "Recalculating..." badge, Approve button disabled
**And** after completion: new score highlighted, button re-enabled

**Given** the Approve/Auto-pass Server Action is called
**When** the server processes the request
**Then** it must verify `scores.score_status` server-side before proceeding. Valid values allowing Approve: 'calculated' or 'overridden'. Values blocking Approve: 'calculating', 'partial', 'na', 'auto_passed'
**And** if status is "calculating", return `{ success: false, code: 'SCORE_STALE', message: 'Please wait for score recalculation to complete' }` per ActionResult<T> pattern (Architecture Decision 3.2)

**Given** a file passes auto-pass criteria after all layers complete
**When** auto-pass evaluation runs
**Then** the auto-pass rationale is displayed showing: final score with margin from threshold, finding counts by severity (Critical: 0, Major: X, Minor: Y), riskiest finding summary, and all criteria met checkmarks (FR23)
**And** the rationale is stored in `scores.auto_pass_rationale` (jsonb)

**Given** findings are displayed in the review UI
**When** a finding has a confidence value from AI layers
**Then** the confidence is displayed in two locations: (1) Inline in FindingCardCompact row: "94%" badge, (2) In FindingCard expanded: badge + tooltip explaining language pair threshold (e.g., "EN→TH threshold: 93%")
**And** color coding: High (≥85%, green), Medium (70-84%, orange), Low (<70%, red)
**And** the confidence thresholds are sourced from `language_pair_configs` for the file's language pair (FR36)
**And** when `language_pair_configs` threshold changes (admin adjusts), existing findings re-evaluate styling but NOT state. Show toast: "Confidence thresholds updated"
**And** if finding confidence drops below new threshold, show "Below threshold" warning badge

**Given** a finding was generated by a fallback AI model
**When** the finding is displayed
**Then** the confidence badge includes a warning icon and tooltip: "Generated by fallback model — confidence may need recalibration"

---
