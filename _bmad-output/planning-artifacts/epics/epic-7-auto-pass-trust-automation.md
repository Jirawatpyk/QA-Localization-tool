# Epic 7: Auto-Pass & Trust Automation

**Goal:** System intelligently auto-passes clean files meeting defined criteria, progresses from recommended-pass to full auto-pass, provides blind audit capability, and builds measurable trust over time — eliminating unnecessary manual review.

**FRs covered:** FR32, FR33, FR61, FR68
**NFRs addressed:** NFR16 (AI failure does not block QA), NFR39 (false positive rate tracked)
**Architecture:** Inngest auto-pass evaluation, configurable criteria per project, blind audit sampling

### Story 7.1: Recommended-Pass & Auto-Pass Progression

As a QA Reviewer,
I want the system to recommend passing clean files initially, then auto-pass them once trust is established,
So that I don't waste time reviewing files that consistently meet quality standards.

**Acceptance Criteria:**

**Given** a file completes all required pipeline layers and the final score is calculated
**When** the auto-pass evaluation runs
**Then** it checks: score >= configured threshold (default 95), 0 unresolved Critical findings, 0 unresolved Major findings (where unresolved = `findings.status IN ('Pending', 'Flagged')` — Accepted/Rejected/Noted/Source Issue are resolved), required AI layers completed (per project config)
**And** if ALL criteria are met, the file is eligible for pass (FR32)

**Given** the project is in "recommended-pass" mode (default for first 2 months)
**When** a file meets auto-pass criteria
**Then** the file is marked as "Recommended Pass" (not auto-passed)
**And** a reviewer must confirm with a single click: "Confirm Pass" button with green badge
**And** the auto-pass rationale is displayed: score with margin, finding counts, riskiest finding summary (FR33)

**Given** the project has been in operation for 2+ months with sufficient trust data
**When** an Admin enables "Auto-pass" mode in project settings
**Then** files meeting criteria are auto-passed without human confirmation
**And** auto-passed files are logged with full audit trail: `{ auto_passed: true, score, criteria_met, rationale }` (FR32)
**And** auto-passed files appear in the batch summary under "Auto-Passed" group with green checkmark

**Given** an Admin configures auto-pass criteria
**When** they access project settings → Auto-Pass Configuration
**Then** they can set: score threshold (0-100, default 95), maximum allowed severity (default: 0 Critical, 0 Major), required AI layers (L1 only / L1+L2 / L1+L2+L3), and mode toggle (recommended-pass / auto-pass / disabled) (FR61)
**And** changes take effect immediately for new files (existing evaluations are not retroactively changed)

**Given** an auto-passed file
**When** the auto-pass rationale is displayed
**Then** it shows: final score (e.g., 97) with margin from threshold (+2), finding breakdown (0C, 0M, 3m), "All criteria met ✓" checklist, and riskiest finding summary if any Minor findings exist

### Story 7.2: Blind Audit & Trust Metrics

As an Admin,
I want to run blind audits on auto-passed files and track trust metrics over time,
So that I can verify auto-pass accuracy and build confidence in the automation.

**Acceptance Criteria:**

**Given** an Admin wants to configure blind audit
**When** they access project settings → Audit Configuration
**Then** they can set: audit frequency (daily/weekly, default weekly), sample percentage (1-100%, default 5%), and audit assignee (reviewer who re-reviews sampled files) (FR68)

**Given** the blind audit schedule triggers (e.g., weekly)
**When** the audit runs
**Then** a random sample (configured %) of auto-passed files from the period is selected using PRNG with seed = `project_id + audit_week` (allowing reproducible audit trails)
**And** selected files are assigned to the audit reviewer with "Blind Audit" badge
**And** the auditor reviews the file without knowing it was auto-passed (blind)
**And** after audit: the auditor's decision is compared with auto-pass — agreement tracked as "audit match rate"

**Given** blind audit results are available
**When** the Admin views the Trust Dashboard
**Then** it shows: audit match rate (% of auto-passed files confirmed by human), false positive rate per language pair over time (FR65 foundation), auto-pass volume trend, and override rate (how often auto-pass is overridden)

**Given** the blind audit reveals auto-pass errors (auditor disagrees with auto-pass)
**When** the auto-pass override rate is calculated as `(files_where_auditor_found_issues / total_audited_files) × 100`
**Then** alert thresholds are: override rate > 10% → warning alert to Admin: "Auto-pass override rate at {X}% — review auto-pass criteria"; override rate > 15% → critical alert + auto-revert to recommended-pass mode; override rate ≤ 3% → informational: "Auto-pass performing well — consider lowering threshold by 1 point"
**And** the alert includes: affected language pair, override rate %, sample size, specific files where auditor disagreed, and recommended action
**And** target audit match rate ≥ 90% (auditor agrees with auto-pass ≥ 90% of the time)
**And** the alert is logged in the audit trail with: threshold_triggered, current_rate, sample_size, action_taken

**Given** trust metric data
**When** I inspect the database
**Then** the `audit_results` table contains: id, file_id, project_id, tenant_id, audit_type (blind/manual), auditor_id, original_decision (auto_pass), audit_decision (pass/fail), agreement (boolean), notes, created_at

---
