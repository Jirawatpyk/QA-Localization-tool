# Epic List

### Epic 1: Project Foundation & Configuration
**Goal:** Users can create accounts, set up projects, import glossaries, configure taxonomy mappings, and get onboarded — establishing the complete workspace foundation for QA review operations, with CI/CD, monitoring, and load testing infrastructure.
**FRs covered:** FR40, FR41, FR43, FR44, FR45, FR51, FR52, FR53, FR54, FR55, FR59, FR62
**Scope:** MVP | **FRs:** 12
**Includes:** Architecture initialization (starter template, DB schema, RLS policies, audit trigger, auth setup, CI/CD pipeline, monitoring & observability, load testing pre-launch gate), Supabase Auth + RBAC, project CRUD, glossary import/matching, taxonomy editor, dashboard shell, onboarding guidance.

### Epic 2: File Processing & Rule-based QA Engine
**Goal:** Users can upload translation files (SDLXLIFF, XLIFF 1.2, Excel), see parsed results with full metadata, and get instant rule-based QA results achieving 100% Xbench parity — the foundation for replacing Xbench.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR11, FR12, FR13, FR14, FR15, FR19, FR21, FR37
**Scope:** MVP Gate + MVP | **FRs:** 16
**Includes:** File upload/parsing, SDLXLIFF/XLIFF/Excel parsers, rule-based engine (Layer 1), MQM score calculation, language-specific rules, parity reporting, Inngest pipeline foundation (L1 orchestration), Economy/Thorough mode selection.

### Epic 3: AI-Powered Quality Analysis
**Goal:** Users get AI semantic analysis (Layer 2 screening + Layer 3 deep analysis) that catches issues beyond rule-based checks, with confidence scoring, resilient processing, and cost visibility — extending the pipeline from Xbench parity to beyond-Xbench intelligence.
**FRs covered:** FR9, FR10, FR16, FR17, FR18, FR20, FR22, FR23, FR36, FR63, FR71, FR72
**Scope:** MVP | **FRs:** 12
**Includes:** AI Layer 2/3 integration, Inngest pipeline extension (L2+L3), score lifecycle management, fallback providers, concurrent queue processing, AI cost estimation, model version pinning, API throttling/budget.

### Epic 4: Review & Decision Workflow
**Goal:** Reviewers can efficiently review findings using progressive disclosure, perform 7 review actions with keyboard hotkeys, use bulk operations, suppress false positive patterns, and complete file QA in a single pass — the core daily workflow loop.
**FRs covered:** FR24, FR25, FR26, FR27, FR28, FR30, FR31, FR34, FR42, FR76, FR77, FR78, FR79, FR80
**Scope:** MVP | **FRs:** 14
**Includes:** Finding list with progressive disclosure, segment navigation, 7 actions (Accept/Reject/Flag/Note/Source Issue/Severity Override/Add Finding), 8 finding states, bulk accept/reject, suppress patterns, override history, search/filter, add to glossary from review.

### Epic 5: Language Intelligence & Non-Native Support
**Goal:** Non-native reviewers can review files in languages they cannot read using AI-powered back-translation and contextual explanation, while native reviewers have scoped access to flagged segments — enabling language-agnostic QA review.
**FRs covered:** FR29, FR35, FR38, FR39
**Scope:** MVP | **FRs:** 4
**Includes:** Language Bridge sidebar panel (back-translation + AI explanation), non-native auto-tag ("subject to native audit"), native reviewer scoped access, flag for native review action.

### Epic 6: Batch Processing & Team Collaboration
**Goal:** Teams can process multiple files efficiently, assign work to specific reviewers by language pair, set file priorities, and receive notifications — enabling coordinated team QA workflows.
**FRs covered:** FR56, FR57, FR58, FR60
**Scope:** MVP | **FRs:** 4
**Includes:** File assignment with language-pair matching, assignment status display, priority queue (urgent files), event notifications (analysis complete, file assigned, glossary updated, auto-pass).

### Epic 7: Auto-Pass & Trust Automation
**Goal:** System intelligently auto-passes clean files meeting defined criteria, progresses from recommended-pass to full auto-pass, provides blind audit capability, and builds measurable trust over time — eliminating unnecessary manual review.
**FRs covered:** FR32, FR33, FR61, FR68
**Scope:** MVP | **FRs:** 4
**Includes:** Recommended-pass (Month 1) → auto-pass (Month 2+), configurable auto-pass criteria, blind audit protocol, auto-pass rationale display.

### Epic 8: Reporting & Certification
**Goal:** Users can export QA reports in multiple formats, generate QA certificates for client delivery, maintain immutable audit trails, and track run metadata — providing accountability and client-facing quality proof.
**FRs covered:** FR46, FR47, FR48, FR49, FR50, FR69, FR70
**Scope:** MVP | **FRs:** 7
**Includes:** PDF/Excel export, Smart Reports (3-tier), QA Audit Trail per file, QA Certificate (1-click PDF), report invalidation on override, immutable audit log, run metadata logging.

### Epic 9: AI Learning & Continuous Improvement
**Goal:** System learns from every reviewer decision, tracks false positive rates, displays visible AI improvement over time, and distinguishes between logged and applied feedback — building the data-driven quality moat.
**FRs covered:** FR64, FR65, FR66, FR67, FR81
**Scope:** MVP | **FRs:** 5
**Includes:** Structured feedback logging, false positive rate tracking per language pair, AI learning indicator (patterns + accuracy trend), feedback states (logged vs applied), AI-to-Rule promotion candidate detection (FR81).

### Epic 10: Rule-based Auto-fix (Growth)
**Goal:** System can auto-fix deterministic errors (tags, placeholders, numbers) with preview and acceptance tracking, AND promote consistently accurate AI findings into L1 rules — transitioning from detection-only to detection-and-correction while making the system smarter over time.
**FRs covered:** FR73, FR74, FR75, FR82, FR83, FR84
**Scope:** Growth (Month 3-6) | **FRs:** 6
**Note:** MVP includes schema design only (fix_suggestions, self_healing_config tables with mode="disabled"). AI-to-Rule Promotion (FR82-84) activates when FR81 data reaches sufficient volume.

### Epic 11: Self-healing Translation (Growth/Vision)
**Goal:** AI generates verified corrections for detected QA issues using multi-agent pipeline (Fix Agent + Judge Agent), with progressive trust model (Shadow → Assisted → Autonomous) — transforming the tool from Detective to Doctor.
**FRs covered:** FR-SH1 to FR-SH18
**Scope:** Growth/Vision (Month 3-12+) | **FRs:** 18
**Note:** Depends on MVP data accumulation (500+ human-corrected translations per language pair).

---
