# Epic 9: AI Learning & Continuous Improvement

**Goal:** System learns from every reviewer decision, tracks false positive rates, displays visible AI improvement over time, and distinguishes between logged and applied feedback — building the data-driven quality moat.

**FRs covered:** FR64, FR65, FR66, FR67, FR81
**NFRs addressed:** NFR39 (false positive rate tracked per language pair)
**Architecture:** `feedback_events` table (MVP data collection), time-series tracking, AI learning indicators, AI-to-Rule promotion candidate detection (FR81)

### Story 9.1: Structured Feedback Logging & False Positive Tracking

As a PM,
I want every reviewer decision logged as structured AI training data and false positive rates tracked per language pair,
So that we build the data foundation for AI improvement and can measure quality trends.

**Acceptance Criteria:**

**Given** a reviewer makes any decision on a finding (Accept, Reject, Flag, Note, Source Issue, Severity Override)
**When** the action is saved
**Then** a structured feedback event is logged in `feedback_events` table (reconciled with Architecture ERD 1.9): id, finding_id, file_id, project_id, tenant_id, reviewer_id, language_pair (source_lang + target_lang), layer (L1/L2/L3), finding_category, original_severity, new_severity (if override), action_taken, is_false_positive (boolean — true if Rejected), reviewer_is_native (boolean), source_text (denormalized for ML training context), original_target, corrected_target (if applicable), detected_by_layer, ai_model, ai_confidence, metadata (jsonb), created_at (FR64)
**And** severity overrides and manual findings are tagged as high-value signals: `{ high_value: true, reason: 'severity_override' }` (FR64)

**Given** feedback events accumulate over time
**When** the false positive rate is calculated per language pair
**Then** the formula is: IF total_findings = 0, fp_rate = NULL; ELSE fp_rate = (rejected_findings / total_findings) × 100, clamped [0, 100]. Calculated per language pair, per layer, rolling 30-day window (UTC: `[now() - 30 days, now()]` inclusive) (FR65)
**And** the rate is stored as a time-series data point for trend analysis
**And** alerts fire if FP rate exceeds threshold (>30% for any language pair)

**Given** a PM views the AI Performance dashboard
**When** the dashboard loads
**Then** it shows per language pair: false positive rate trend (line chart, 30/60/90 day), finding volume trend, rejection rate by category (bar chart), and comparison between L1/L2/L3 accuracy

**Given** the feedback data structure
**When** feedback states are tracked
**Then** each feedback event has a state: "logged" (recorded but not yet used for improvement) or "applied" (used in model fine-tuning or rule adjustment) (FR67)
**And** the distinction is visible in the dashboard: "12,340 feedback events logged, 0 applied (Growth feature)"
**And** in MVP, all feedback stays in "logged" state — "applied" transitions happen in Growth phase

### Story 9.2: AI Learning Indicators & Improvement Visibility

As a QA Reviewer,
I want to see visible indicators that the AI is learning from my feedback,
So that I'm motivated to provide quality feedback and can trust the system is improving.

**Acceptance Criteria:**

**Given** a project has accumulated feedback data (100+ decisions per language pair)
**When** the AI Learning indicator renders in the project dashboard
**Then** it shows: patterns learned count = `DISTINCT(feedback_events.category) WHERE count(category) > 10`, accuracy trend (improving/stable/declining arrow), total feedback events count, and top 3 categories with most false positives (FR66)

**Given** the accuracy trend over time
**When** comparing current 30-day FP rate vs previous 30-day FP rate
**Then** an arrow indicator shows: ↑ improving = FP_rate_current_30d < FP_rate_previous_30d - 2%; → stable = within ±2%; ↓ declining = FP_rate increased > 2%
**And** the percentage change is shown: "FP rate: 18% → 14% (↑ improving)"

**Given** a specific language pair (e.g., EN→TH) with high false positive rate
**When** the reviewer views the Language Pair Performance detail
**Then** it shows: FP rate by finding category (terminology, fluency, etc.), most-rejected patterns (potential suppression candidates), and feedback volume with estimated data sufficiency for Growth self-healing ("Need 5,000 events for Assisted Mode — currently at 1,200")

**Given** the AI learning system in MVP
**When** data is displayed
**Then** a clear disclaimer shows: "AI learning data is being collected. Active AI improvement will begin in the Growth phase"
**And** the data collection progress bar shows: "{N} / 1,000 events per language pair for Shadow Mode eligibility"

### Story 9.3: False Positive Rate Time-series Tracking & Alerting

As an Admin,
I want to see false positive rate trending per language pair over time with automated alerts,
So that I can identify when AI accuracy drops and take corrective action.

**Acceptance Criteria:**

**Given** a finding is rejected by a reviewer
**When** the feedback event is logged
**Then** `is_false_positive = true` is recorded in `feedback_events` (NFR39)

**Given** accumulated feedback data
**When** weekly aggregation runs
**Then** FP rate is calculated: `(rejected_ai_findings / total_ai_findings) × 100` per language pair per week
**And** stored in `ai_metrics_timeseries` table: id, project_id, tenant_id, language_pair, week_start, fp_rate, sample_size, trend_direction (improving/stable/declining), created_at

**Given** the Admin views the AI Metrics dashboard
**When** the FP rate chart loads
**Then** it shows: line chart of FP% over past 12 weeks per language pair, with threshold line at 15%
**And** if FP% > 15% in the past week, a warning alert fires: "EN→TH false positive rate at 18% — review AI model performance"
**And** alert includes: affected language pair, current rate, sample size, recommended action

### Story 9.4: AI-to-Rule Promotion Candidate Detection

As a System,
I want to automatically identify AI finding patterns with consistently high acceptance rates,
So that these patterns can be flagged as candidates for promotion to L1 rules in the Growth phase.

**Acceptance Criteria:**

**Given** accumulated feedback data from reviewer actions (accept/reject)
**When** a weekly aggregation job runs (Inngest cron)
**Then** the system groups AI findings by: error_type + language_pair + context_similarity_hash
**And** calculates per group: acceptance_rate = `accepted / (accepted + rejected)`, occurrence_count, distinct_reviewers

**Given** a finding pattern reaches ≥95% acceptance rate AND ≥50 occurrences
**When** the aggregation job completes
**Then** the pattern is flagged as `promotion_candidate = true` in the aggregation results
**And** the candidate record stores: pattern_description, acceptance_rate, occurrence_count, sample_finding_ids (up to 5), affected_language_pairs, first_seen_at, last_seen_at (FR81)

**Given** a pattern was previously flagged as a candidate
**When** subsequent data changes its acceptance rate below 95% OR new rejections reduce confidence
**Then** the candidate flag is removed with reason: "Acceptance rate dropped to {rate}%"
**And** the pattern can be re-flagged if it recovers above threshold

**Given** the aggregation job runs
**When** it completes successfully
**Then** it logs: total patterns analyzed, new candidates found, candidates removed, execution time
**And** no UI is displayed for candidates in MVP — data is stored for Growth phase activation

**Architecture Note:** Uses existing `feedback_events` table data. Aggregation query leverages `idx_feedback_events_category` and `idx_feedback_events_lang_pair` indexes. No new tables required in MVP — results stored as materialized view or in `ai_metrics_timeseries`.

---
