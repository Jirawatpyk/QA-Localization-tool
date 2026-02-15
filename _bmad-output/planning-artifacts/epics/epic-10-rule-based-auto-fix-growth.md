# Epic 10: Rule-based Auto-fix (Growth)

**Goal:** System can auto-fix deterministic errors (tags, placeholders, numbers) with preview and acceptance tracking, AND promote consistently accurate AI findings into L1 rules — transitioning from detection-only to detection-and-correction while making the system smarter over time.

**FRs covered:** FR73, FR74, FR75, FR82, FR83, FR84
**NFRs addressed:** NFR-SH6 (fix failure does not block QA pipeline)
**Scope:** Growth (Month 3-6). MVP includes schema design only (`fix_suggestions`, `self_healing_config` tables with mode="disabled"). AI-to-Rule Promotion (FR82-84) activates when MVP data accumulation (FR81, Epic 9) reaches sufficient volume.
**Architecture:** Extends L1 rule engine with deterministic fix generation, Inngest step for fix application, audit trail per auto-fix. AI-to-Rule Promotion leverages `feedback_events` aggregation from MVP (Architecture Section 6)

### Story 10.1: Deterministic Auto-fix Engine

As a QA Reviewer,
I want the system to automatically fix deterministic rule-based errors like broken tags, missing placeholders, and number format mismatches,
So that mechanical errors are corrected instantly without manual effort.

**Acceptance Criteria:**

**Given** the rule-based engine (L1) detects a deterministic error during QA processing
**When** the error is fixable with 100% confidence (tag repair, placeholder restore, number format correction, whitespace normalization)
**Then** the system generates a fix suggestion with: original text, fixed text, fix category, confidence (always 100% for deterministic), and explanation
**And** the fix is stored in `fix_suggestions` table: id, finding_id, file_id, project_id, tenant_id, original_text, fixed_text, fix_category, confidence, status (suggested/accepted/rejected/reverted), created_by_layer (L1), created_at (FR73)
**And** valid state transitions: suggested→accepted, suggested→rejected, accepted→reverted ONLY. No other transitions allowed

**Given** an Admin accesses project settings → Auto-fix Configuration
**When** they configure auto-fix settings
**Then** they can enable/disable auto-fix per category: tags (on/off), placeholders (on/off), numbers (on/off), whitespace (on/off)
**And** default is all disabled (conservative start)
**And** the configuration is stored in `self_healing_config` table: id, project_id, tenant_id, mode (disabled/preview/auto), categories_enabled (jsonb), created_at, updated_at (FR73)

**Given** auto-fix mode is set to "auto" for a category
**When** a deterministic fix is generated
**Then** the fix is auto-applied to the target text
**And** the original text is preserved for revert capability
**And** the auto-fix is logged in the audit trail: `{ action: 'auto_fix', category, original, fixed, confidence: 100 }`

**Given** auto-fix mode is set to "preview" for a category
**When** a deterministic fix is generated
**Then** the fix is NOT auto-applied — it appears as a suggestion alongside the finding
**And** the reviewer must explicitly accept or reject the fix

### Story 10.2: Auto-fix Preview, Revert & Acceptance Tracking

As a QA Reviewer,
I want to see before/after previews of auto-fixes, revert any fix with one click, and see acceptance tracking per category,
So that I maintain control over corrections and the system can measure fix quality.

**Acceptance Criteria:**

**Given** a fix suggestion exists for a finding (auto-applied or preview)
**When** the reviewer views the finding
**Then** a before/after comparison is displayed: original text (red strikethrough) → fixed text (green highlight)
**And** the fix category badge shows: "Tag fix", "Placeholder fix", "Number fix", or "Whitespace fix"
**And** for auto-applied fixes, a "Revert" button is visible (FR74)

**Given** the reviewer clicks "Revert" on an auto-applied fix
**When** the revert is confirmed
**Then** the target text is restored to the original (pre-fix) version
**And** the fix status changes to "reverted"
**And** the revert is logged in audit trail and `feedback_events` (high-value signal)
**And** the MQM score recalculates to include the original finding's penalty (FR73)

**Given** fix suggestions have been accepted or rejected over time
**When** the PM views the Auto-fix Performance dashboard
**Then** it shows per category per language pair: acceptance rate, revert rate, total fixes applied, and trend over time (FR75)
**And** revert_rate = `reverted_count / accepted_count` per category (only calculated if accepted_count > 0). Categories with revert rate > 5% are flagged with a warning: "Consider disabling auto-fix for this category"

**Given** a batch of files is processed with auto-fix enabled
**When** processing completes
**Then** the batch summary shows: "Auto-fixed: X findings (Y tags, Z placeholders, W numbers)"
**And** each auto-fixed finding is visually distinct: green background + "Auto-fixed" badge
**And** the overall fix acceptance rate is displayed

### Story 10.3: Rule Candidate Proposal & Admin Approval

As an Admin,
I want to review AI-detected patterns that are candidates for promotion to L1 rules, and approve or reject them,
So that the system gets smarter over time by converting proven AI detections into fast, free, deterministic rules.

**Acceptance Criteria:**

**Given** the AI-to-Rule Promotion data from MVP (FR81, Story 9.4) has identified promotion candidates
**When** the Admin navigates to Settings → Rule Candidates
**Then** a dashboard displays all candidates sorted by occurrence count (highest first)
**And** each candidate shows: pattern description, acceptance rate (%), occurrence count, affected language pairs, sample findings (up to 5 with expand), first/last seen dates (FR82)

**Given** the Admin reviews a candidate
**When** they click "Approve"
**Then** a new L1 rule definition is generated with pre-filled parameters: error_type, pattern_match, severity, category
**And** the Admin can edit the rule name, description, and parameters before confirming
**And** on confirmation, the rule is added to the L1 rule engine with status "active"
**And** the promotion is logged in audit trail: candidate_id, approved_by, approved_at, generated_rule_id

**Given** the Admin reviews a candidate
**When** they click "Reject"
**Then** the candidate is marked as "rejected" with optional reason text
**And** the candidate will not be re-proposed unless new data pushes it above threshold again after a 30-day cooldown

### Story 10.4: Promoted Rule Traceability

As an Admin,
I want each promoted rule to show its full provenance — which AI findings it came from, acceptance stats, and promotion history,
So that I can understand why a rule exists and make informed decisions about its future.

**Acceptance Criteria:**

**Given** a rule was promoted from AI findings (via Story 10.3)
**When** the Admin views the rule detail page
**Then** a "Provenance" section shows: source AI finding IDs (clickable links), acceptance rate at promotion time, total occurrence count, language pairs validated, promoted_at timestamp, promoted_by user (FR83)
**And** a "Performance Since Promotion" section shows: findings detected by this rule, current acceptance rate, trend chart

**Given** a promoted rule is viewed
**When** the Admin clicks a source finding ID
**Then** the original AI finding detail is displayed with full context: source/target text, AI model used, original confidence score, reviewer action

**Given** traceability data exists for a promoted rule
**When** any traceability field is written
**Then** it is immutable — traceability records cannot be edited or deleted (append-only, consistent with audit trail pattern)

### Story 10.5: Promoted Rule Monitoring & Auto-Demote

As an Admin,
I want the system to automatically monitor promoted rules and demote underperforming ones,
So that bad rules don't silently degrade QA quality.

**Acceptance Criteria:**

**Given** promoted rules are active in the L1 rule engine
**When** the weekly monitoring job runs (Inngest cron, same schedule as Story 9.4)
**Then** the system calculates current acceptance rate for each promoted rule: `accepted / (accepted + rejected)` from recent findings (past 4 weeks)
**And** results are stored in `ai_metrics_timeseries` with rule_id reference

**Given** a promoted rule's acceptance rate drops below 90%
**When** the monitoring job detects this
**Then** a warning alert is sent to Admin: "Promoted rule '{name}' accuracy at {rate}% — review recommended" (FR84)
**And** the alert includes: rule name, current rate, rate at promotion, affected language pairs, link to rule detail

**Given** a promoted rule's acceptance rate drops below 80%
**When** the monitoring job detects this
**Then** the rule is automatically demoted: status changed to "disabled"
**And** Admin notification: "Promoted rule '{name}' auto-demoted — accuracy dropped to {rate}%"
**And** demote is logged in audit trail: rule_id, demoted_at, reason, acceptance_rate_at_demotion
**And** the rule can be re-promoted after Admin investigation and manual re-approval

**Given** the Admin views the Rule Performance dashboard
**When** the dashboard loads
**Then** it shows all promoted rules with: current accuracy, trend (improving/stable/declining), status (active/warning/demoted), days since promotion
**And** rules with warnings are highlighted in yellow, demoted in red

---
