# Epic 2: File Processing & Rule-based QA Engine

**Goal:** Users can upload translation files (SDLXLIFF, XLIFF 1.2, Excel), see parsed results with full metadata, and get instant rule-based QA results achieving 100% Xbench parity — the foundation for replacing Xbench.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR11, FR12, FR13, FR14, FR15, FR19, FR21, FR37
**NFRs addressed:** NFR1 (parse < 3s), NFR2 (rules < 5s/5K segments), NFR7 (batch 10 files < 5min), NFR8 (reject > 15MB), NFR10 (no file content in logs), NFR16 (rule-based always available)
**Architecture:** Unified SDLXLIFF/XLIFF parser (fast-xml-parser), 15MB file guard, Inngest pipeline L1, glossary cache integration

### Story 2.1: File Upload & Storage Infrastructure

As a QA Reviewer,
I want to upload single or multiple translation files for QA processing,
So that I can start the quality analysis workflow.

**Acceptance Criteria:**

**Given** a QA Reviewer is on a project page
**When** they click "Upload Files" and select one or more files (SDLXLIFF, XLIFF 1.2, or Excel)
**Then** files are uploaded to Supabase Storage with tenant-scoped paths: `{tenant_id}/{project_id}/{file_hash}/{filename}` (NFR13)
**And** upload progress bar shows 0-100%, updates every 100ms, displays estimated time remaining per file
**And** each file receives a unique ID (uuid) and SHA-256 hash for tracking (FR1)
**And** when same file uploaded twice, SHA-256 matches existing file hash and triggers duplicate detection UI

**Given** a file exceeds 15MB
**When** the upload is attempted
**Then** the upload is rejected immediately at the Route Handler BEFORE file is read into memory with error: "File exceeds maximum size of 15MB. Please split the file in your CAT tool" (NFR8, Architecture Decision 1.6)
**And** the rejection occurs before any server-side processing begins
**And** files between 10-15MB show a warning: "Large file — processing may be slower"

**Given** a user uploads a file that was previously uploaded to the same project
**When** the SHA-256 hash matches an existing file
**Then** the system alerts: "This file was uploaded on [date] (Score [X]) — re-run?" with options to re-run or cancel (FR6)

**Given** the upload completes
**When** I inspect the database
**Then** the files table contains: id, project_id, tenant_id, filename, file_hash, file_size, file_type (sdlxliff/xliff/excel), storage_path, status (uploaded/parsing/parsed/failed), uploaded_by, uploaded_at
**And** file content is never written to application logs (NFR10)

**Given** multiple files are uploaded simultaneously
**When** the upload processes
**Then** each file is tracked independently with its own status
**And** a batch record is created linking all files from the same upload session

### Story 2.2: SDLXLIFF & XLIFF 1.2 Unified Parser

As a QA Reviewer,
I want my SDLXLIFF and XLIFF files parsed correctly with all metadata preserved,
So that the QA engine has complete segment data including Trados-specific information.

**Acceptance Criteria:**

**Given** a valid SDLXLIFF file from Trados Studio is uploaded
**When** the parser processes it
**Then** all trans-units are extracted with: source text, target text, segment ID, confirmation state (Draft/Translated/ApprovedSignOff), match percentage, and translator comments (`<sdl:cmt>`) (FR3)
**And** all inline tags are preserved: `<g>`, `<x/>`, `<ph>`, `<bx/>`, `<ex/>`, `<bpt>`, `<ept>` and sdl: namespace elements — preserved means inline_tags (jsonb) contains `[{ type, id, attributes }]` with count matching original file and positions identical to source XML
**And** the `sdl:` namespace is recognized and handled (not stripped or errored)
**And** parser validates tag structure per XLIFF spec; malformed tag nesting triggers graceful error with specific tag ID and position; invalid tags are rejected (not silently dropped) with clear error message to user

**Given** a standard XLIFF 1.2 file is uploaded
**When** the parser processes it
**Then** the same unified parser handles it (SDLXLIFF is superset — strip sdl: namespace = XLIFF 1.2) (FR4)
**And** trans-units, inline tags, notes, and segment metadata are preserved

**Given** a file larger than 15MB is being parsed
**When** the DOM parsing guard is triggered
**Then** the file is rejected with error: "File too large for processing (max 15MB). Please split the file in your CAT tool"
**And** the rejection is logged with file size and filename (no file content)

**Given** parsing completes successfully
**When** I inspect the database
**Then** the segments table contains: id, file_id, project_id, tenant_id, segment_number, source_text, target_text, confirmation_state, match_percentage, translator_comment, inline_tags (jsonb), word_count, created_at
**And** word count for CJK/Thai uses Intl.Segmenter token count (not space-split) — deterministic: for test corpus `docs/test-data/segmenter/{language}.json`, token count must match expected_tokens within ±0%

**Given** a file with mixed confirmation states (Draft + Translated + ApprovedSignOff)
**When** the parser processes it
**Then** each segment's confirmation state is correctly preserved
**And** the state is available for downstream QA logic (e.g., skip Approved segments)

**Given** a 10MB SDLXLIFF file with ~5,000 segments
**When** parsing runs
**Then** it completes within 3 seconds (NFR1)
**And** memory usage stays within Vercel's 1024MB serverless limit

**Given** a malformed XLIFF file (invalid XML)
**When** parsing is attempted
**Then** the parser returns a clear error: "Invalid file format — could not parse XML structure"
**And** the file status is set to "failed" with the error details

### Story 2.3: Excel Bilingual Parser

As a QA Reviewer,
I want to upload Excel bilingual files with configurable column mapping,
So that I can QA translations delivered in spreadsheet format.

**Acceptance Criteria:**

**Given** a QA Reviewer uploads an Excel (.xlsx) file
**When** the system detects it is an Excel file
**Then** a column mapping dialog appears showing the first 5 rows as preview
**And** the user can select which column is Source and which is Target (FR5)
**And** optional columns can be mapped: Segment ID, Context/Notes, Language

**Given** the column mapping is confirmed
**When** the parser processes the Excel file
**Then** rows are extracted as segments with source_text and target_text
**And** empty rows are skipped
**And** segments are stored in the same segments table as XLIFF-parsed segments

**Given** an Excel file with 5,000 rows
**When** parsing runs
**Then** it completes within 3 seconds (NFR1)

**Given** an Excel file with no clear source/target columns
**When** the mapping dialog is shown
**Then** the system attempts to auto-detect by looking for header keywords (Source, Target, Original, Translation)
**And** if auto-detection fails, the user must manually map columns before proceeding

### Story 2.4: Rule-based QA Engine & Language Rules

As a QA Reviewer,
I want rule-based QA checks that catch everything Xbench catches,
So that I can trust this tool to replace Xbench with 100% parity.

**Acceptance Criteria:**

**Given** a file has been parsed into segments
**When** the rule-based engine (Layer 1) processes the segments
**Then** the following check categories are executed:
- **Tag integrity:** Missing, extra, or misordered inline tags between source and target
- **Placeholder consistency:** Placeholders ({0}, %s, %d, etc.) present in source must appear in target
- **Number consistency:** Numbers in source must appear in target (accounting for locale formatting)
- **Glossary compliance:** Target text must use approved glossary terms (using glossary matching engine from Story 1.5)
- **Consistency:** Same source text should have same target text across segments (within file)
- **Spacing:** Leading/trailing spaces, double spaces, missing spaces around tags
**And** ≥99.5% of issues that Xbench catches are also caught by this engine, with detailed diff report per any missing issue (FR8)
**And** PREREQUISITE: Xbench Parity Specification document (`docs/xbench-parity-spec.md`) must be completed before implementation begins. Story cannot start until document is finalized and golden test corpus available

**Given** the rule engine processes Thai (TH) segments
**When** checking glossary compliance and spacing
**Then** Thai-specific rules apply: no word-boundary regex (use Hybrid glossary matching from Story 1.5 per Architecture Decision 5.6), Thai numeral ↔ Arabic mapping, particles (ครับ/ค่ะ) not flagged as errors (FR37)
**And** findings DO NOT include segments with particle-only differences — verified by negative test case: `{ source: "Thank you", target_with_particles: "ขอบคุณครับ" }` must auto-accept without false positive

**Given** the rule engine processes Chinese (ZH) segments
**When** checking punctuation and glossary
**Then** fullwidth punctuation (。，！？) is recognized as valid, Simplified vs Traditional consistency checked, Intl.Segmenter('zh') used for glossary matching (FR37)

**Given** the rule engine processes Japanese (JA) segments
**When** checking scripts and glossary
**Then** mixed scripts (hiragana/katakana/kanji) handled correctly, katakana loan words not flagged as mistranslation, Intl.Segmenter('ja') used (FR37)

**Given** a finding is detected by the rule engine
**When** the finding is created
**Then** the findings table entry includes: id, file_id, segment_id, project_id, tenant_id, finding_type, category (tag/placeholder/number/glossary/consistency/spacing), severity (Critical/Major/Minor), source_text_excerpt, target_text_excerpt, description, suggestion, layer (L1), confidence (100 for rule-based), status (Pending), created_at

**Given** a file with 5,000 segments
**When** the rule engine runs
**Then** it completes within 5 seconds (NFR2)

**Given** the Xbench Parity Specification document exists
**When** the rule engine is tested against the golden test corpus
**Then** every issue in the Xbench output is also found by the rule engine (0 misses)
**And** a parity test report can be generated showing side-by-side comparison

### Story 2.5: MQM Score Calculation & Language Calibration

As a QA Reviewer,
I want an MQM-aligned quality score per file with per-language calibration,
So that I can quickly assess file quality and the system handles new language pairs safely.

**Acceptance Criteria:**

**Given** findings exist for a file after Layer 1 processing
**When** the MQM score is calculated
**Then** the formula is: `Score = max(0, 100 - NPT)` where NPT = (sum of penalties / word count) × 1000
**And** severity weights are: Critical = 25, Major = 5, Minor = 1
**And** only findings in Accepted or Pending state contribute to score (Rejected/Noted/Source Issue do not) (FR11)
**And** when NPT > 100, score = 0 (clamped) — no negative scores possible

**Given** a file with 0 word count or only tags (no translatable text)
**When** scoring is attempted
**Then** IF word_count = 0, score_status = 'na' (unable to score); IF only_tags = true (no translatable content), score_status = 'na'; ELSE calculate normally

**Given** CJK or Thai text
**When** word count is calculated
**Then** Intl.Segmenter token count is used (not space-split) for accurate NPT calculation (FR11)

**Given** a finding spans multiple segments
**When** the penalty is calculated
**Then** the penalty counts once per finding regardless of how many segments it spans, verified by: `findings.segment_count` field tracking span (FR11)

**Given** a project with EN→TH language pair
**When** confidence thresholds are applied
**Then** the per-language calibration from language_pair_configs is used: EN→TH auto-pass threshold = 93 (not default 95) (FR12)

**Given** a new language pair (e.g., EN→AR) with no previous data
**When** the first file is processed
**Then** conservative defaults apply: auto-pass threshold at maximum (99), mandatory manual review for first 50 files
**And** a "New language pair" badge is displayed
**And** the system tracks file count per language pair per project and notifies admin at file 51 when transitioning to standard mode via: (1) in-app toast, (2) email to all project admins, (3) dashboard banner. Notification includes: language pair, current file count (51), recommendation to review confidence thresholds. Notification can be dismissed but persists in audit log (FR13)

**Given** the score is calculated
**When** I inspect the database
**Then** the scores table contains: id, file_id, project_id, tenant_id, score_value, score_status (calculating/calculated/partial/overridden/auto_passed/na), word_count, penalty_total, findings_critical, findings_major, findings_minor, layer_completed (L1/L1L2/L1L2L3), calculated_at
**And** `layers_completed` is in scores table (denormalized for query performance), while `run_metadata` stores immutable pipeline execution details (model_versions, glossary_version, rule_config_hash) — populated in Story 8.2

### Story 2.6: Inngest Pipeline Foundation & Processing Modes

As a QA Reviewer,
I want to choose between Economy and Thorough processing modes and see rule-based results instantly,
So that I can balance speed/cost with analysis depth and start reviewing while AI processes.

**Acceptance Criteria:**

**Given** a QA Reviewer has uploaded files
**When** they initiate QA processing
**Then** a ProcessingModeDialog appears with layout: [Title bar] [Two ModeCard panels side-by-side: Economy left, Thorough right] [Cost bar below] [Cancel + Start buttons]
**And** Economy card shows: "L1+L2", "~30s/file", "$0.15/file", "Can upgrade later"
**And** Thorough card shows: "★ Recommended" badge, "L1+L2+L3", "~2min/file", "$0.35/file", "Best accuracy"
**And** cost bar shows: total estimated cost, per-file cost, budget remaining
**And** Economy is the default selection (FR14)
**And** UpgradeButton only visible in ReviewHeader if current mode = Economy

**Given** the user selects a processing mode and clicks "Start Processing"
**When** the Inngest orchestrator function is triggered
**Then** the orchestrator reads project config (mode, language pair settings)
**And** segments are grouped by language pair
**And** segments are batched (configurable batch size, default 20)
**And** Layer 1 (rule-based) runs first via `step.run("segment-{id}-L1", ...)`
**And** each Inngest step has a deterministic ID for idempotency

**Given** Layer 1 processing completes for a file
**When** results are ready
**Then** rule-based findings are displayed in the UI via Supabase Realtime push within 500ms of L1 completion, and UI updates within 1 second of push
**And** the score shows with a "Rule-based" badge (blue)
**And** if AI layers are pending, an "AI pending" badge is displayed alongside (FR15)
**And** the user can begin reviewing rule-based findings immediately without waiting for AI

**Given** Economy mode is selected
**When** the pipeline runs
**Then** only L1 is executed in this epic (L2 will be added in Epic 3)
**And** score_status reflects layers completed: "L1" for Economy at this stage

**Given** the Inngest function encounters an error during L1 processing
**When** the error occurs
**Then** Inngest retries automatically at intervals: 1s, 2s, 4s (3 retries with exponential backoff)
**And** if all 3 retries fail, the file status is set to "failed" with error context
**And** the error is logged via pino with full context (NFR37)

**Given** a batch of 10 files is submitted
**When** the pipeline processes them
**Then** files are processed with configurable parallelism via Inngest concurrency controls
**And** the batch completes within 5 minutes for L1 processing (NFR7)

### Story 2.7: Batch Summary, File History & Parity Tools

As a QA Reviewer,
I want to see batch processing results at a glance, track file history, and verify Xbench parity,
So that I can efficiently triage files and trust the tool's accuracy.

**Acceptance Criteria:**

**Given** a batch of files has been processed (L1 complete)
**When** the QA Reviewer views the batch page
**Then** a BatchSummary component displays: total files, passed count (score >= threshold + 0 Critical), needs review count, processing time
**And** files are split into two groups: "Recommended Pass" (files with score >= project auto_pass_threshold AND 0 Critical findings, sorted by score descending) and "Need Review" (all others, sorted by score ascending — worst first). Secondary sort: file_id ascending (deterministic). Tertiary: upload date descending (FR2)
**And** each file shows a FileStatusCard with: filename, ScoreBadge, status, issue counts by severity

**Given** the batch summary is displayed
**When** the user clicks a FileStatusCard
**Then** they navigate to that file's review view (ready for Epic 4)

**Given** a QA Reviewer wants to check file history
**When** they navigate to the file history page
**Then** they see all files for the project with: filename, upload date, processing status, score, last reviewer, decision status (FR7)
**And** files can be filtered by status (all/passed/needs review/failed)

**Given** a QA Reviewer wants to verify Xbench parity
**When** they upload both the tool's results and a matching Xbench report for the same file
**Then** a parity comparison report is generated showing side-by-side table: [Tool Only], [Both Found], [Xbench Only] (FR19)
**And** comparison matches by: same issue type + same segment + within ±1 severity level
**And** [Xbench Only] issues are highlighted as parity gaps — these trigger NFR requirement to update rule engine
**And** parity report is stored in DB for audit trail (persistent, not one-time)
**And** if any Xbench-only issues are found, they are highlighted as parity gaps

**Given** a QA Reviewer finds an issue that Xbench catches but the tool does not
**When** they click "Report Missing Check"
**Then** a form captures: file reference, segment number, expected finding description, and Xbench check type
**And** the report is submitted to a priority fix queue for investigation (FR21)
**And** the reporter receives confirmation with a tracking reference

**Given** the batch summary on different screen sizes
**When** viewed at >= 1440px
**Then** FileStatusCards show full detail with all columns
**When** viewed at >= 1024px
**Then** some columns are hidden, layout remains functional
**When** viewed at < 768px
**Then** only summary counts are shown (no individual file cards)

---
