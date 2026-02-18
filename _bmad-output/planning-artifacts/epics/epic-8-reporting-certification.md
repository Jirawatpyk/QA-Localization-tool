# Epic 8: Reporting & Certification

**Goal:** Users can export QA reports in multiple formats, generate QA certificates for client delivery, maintain immutable audit trails, and track run metadata — providing accountability and client-facing quality proof.

**FRs covered:** FR46, FR47, FR48, FR49, FR50, FR69, FR70
**NFRs addressed:** NFR10 (file content not in logs), NFR22 (tenant_id Day 1)
**Architecture:** Server-side PDF generation (Puppeteer/Playwright), immutable append-only audit log, run metadata per QA execution

### Story 8.1: Report Export — PDF & Excel

As a QA Reviewer,
I want to export QA reports in PDF and Excel formats,
So that I can share quality results with clients and stakeholders in their preferred format.

**Acceptance Criteria:**

**Given** a file has completed QA review (all findings reviewed)
**When** the reviewer clicks "Export Report" and selects PDF
**Then** a QA report PDF is generated server-side containing: file summary (filename, language pair, score, date), finding list grouped by severity, each finding with: category, description, segment reference, reviewer decision, and overall quality assessment
**And** segment_reference in findings = `{ file_id, segment_number, source_excerpt_50chars, target_excerpt_50chars }`
**And** the report uses MQM standard terminology (not internal QA Cosmetic terms) for external audiences (FR46)

> **UX Spec Decision (2026-02-16):** PDF generation library decision per `component-strategy.md#QACertificate`: MVP uses `@react-pdf/renderer` (lightweight, React components, SSR-friendly). Puppeteer/Playwright deferred to Growth phase due to heavy Chrome binary and Vercel memory limits. **CRITICAL:** Thai/CJK rendering POC required before Story 8.1 implementation — test Sarabun + Noto Sans CJK font embedding with 50+ segments. If POC fails, fallback to Puppeteer immediately. Certificate wireframe includes: Page 1 (certificate summary + score circle + check summary + MQM breakdown + report metadata), Page 2+ (detailed findings grouped by severity). Smart Report (3-tier classification) is a separate PDF document. Excel export spec covers 3 sheets (Summary, Findings, Segments). See `component-strategy.md#QACertificate` for full wireframes.

**Given** a report has been exported for a file
**When** a finding state is overridden AFTER the export
**Then** the report is marked "Stale" — tracked in `exported_reports` table: file_id, exported_at, findings_snapshot (jsonb) (FR50)
**And** on any finding state override, query exported_reports for this file; if export_date < override_date, flag as "Stale"
**And** warn user on export page: "Previous report from [date] is stale due to [X] changes. Regenerate?"
**And** "Download PDF" button disabled for stale reports until regenerated

**Given** the reviewer selects Excel export
**When** the export generates
**Then** an .xlsx file is created with: Summary sheet (file metadata, score, finding counts), Findings sheet (one row per finding with all fields), and Segments sheet (full segment list with source/target)
**And** the Excel is formatted with headers, auto-filters, and conditional formatting by severity (FR46)

**Given** a Smart Report is requested
**When** the report generates
**Then** findings are classified into 3 tiers: "Verified" (accepted by native reviewer), "Non-native accepted" (accepted by non-native, tagged for audit), "Needs native review" (flagged or pending) (FR47)
**And** the report clearly distinguishes review confidence levels for the recipient

**Given** report generation
**When** the PDF/Excel is created
**Then** run metadata is embedded: model versions used, glossary version, rule config snapshot, processing date, AI cost (FR70)
**And** the report is stored in Supabase Storage with a unique URL for sharing

### Story 8.2: QA Certificate & Audit Trail

As a QA Reviewer,
I want to generate a 1-click QA Certificate for client delivery and access the complete immutable audit trail per file,
So that clients receive quality proof and every QA action is fully traceable.

**Acceptance Criteria:**

**Given** a file has been fully reviewed and passed (manual pass or auto-pass)
**When** the reviewer clicks "Generate Certificate"
**Then** a QA Certificate PDF is generated server-side containing: project name, file name, language pair, final MQM score, review date, reviewer name(s), and a "Quality Certified" stamp
**And** the certificate is rendered server-side to handle Thai/CJK text correctly (FR49)
**And** generation completes within 5 seconds

> **UX Spec Decision (2026-02-16):** PDF library for Story 8.2 follows same decision as Story 8.1 — MVP uses `@react-pdf/renderer`, contingent on Thai/CJK POC passing. If POC fails, fallback to Puppeteer/Playwright. See `component-strategy.md#QACertificate` for full specification, wireframes, and font requirements.

**Given** a decision is overridden on a file that has an exported report
**When** the override is saved
**Then** the previously exported report is marked as "Invalidated — decisions changed after export"
**And** a notification is sent to the report downloader: "Report for '{filename}' has been invalidated due to decision changes"
**And** the invalidated report shows a watermark "SUPERSEDED" if re-opened (FR50)

**Given** any user wants to view the audit trail for a file
**When** they access File → Audit Trail
**Then** a chronological log is displayed showing every action: uploads, parsing, pipeline runs, each finding state change, score calculations, exports, and certificate generations (FR48)
**And** each entry shows: timestamp, user, action type, details, and metadata (jsonb includes action-specific fields, e.g., `{ previous_state, new_state }` for state changes)
**And** audit trail is IMMUTABLE (append-only, 3-layer protection per Story 1.2), exportable as CSV, filterable by action type/date range
**And** shown in finding detail panel under "Audit Trail" tab
**And** audit_logs indexed on: (tenant_id, created_at), (entity_type, entity_id), (action, actor_id) for query performance

**Given** the immutable audit log system
**When** any action occurs in the system
**Then** an append-only entry is created in `audit_logs` (partitioned table) (FR69)
**And** entries can never be updated or deleted (immutable — enforced by RLS policy)
**And** the audit log includes: id, tenant_id, entity_type, entity_id, action, actor_id, metadata (jsonb), created_at
**And** audit logs are partitioned by month for query performance

**Given** run metadata tracking
**When** a QA execution completes
**Then** the `run_metadata` record includes: file_id, project_id, model_versions (jsonb), glossary_version, rule_config_hash, processing_mode, total_cost, duration_ms, layers_completed, created_at (FR70)

---
