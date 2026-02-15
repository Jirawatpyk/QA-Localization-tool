---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/prd-self-healing-translation.md
  - _bmad-output/planning-artifacts/architecture/index.md
  - _bmad-output/planning-artifacts/architecture/growth-architecture-self-healing-translation-foundation.md
  - _bmad-output/planning-artifacts/architecture/architecture-validation-results.md
  - _bmad-output/planning-artifacts/ux-design-specification/index.md
---

# qa-localization-tool - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for qa-localization-tool, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**Main PRD — FR1-FR80 (69 MVP + 8 MVP backport + 3 Growth)**

#### 1. File Management & Parsing (FR1-FR7)
- FR1: QA Reviewer can upload single or multiple files (SDLXLIFF, XLIFF 1.2, Excel bilingual) for QA processing
- FR2: QA Reviewer can view batch summary showing per-file status (auto-pass, needs review, processing, failed)
- FR3: System can parse SDLXLIFF files preserving Trados-specific metadata (confirmation states, match percentages, translator comments, sdl: namespace elements)
- FR4: System can parse XLIFF 1.2 files preserving inline tags, notes, and segment metadata
- FR5: System can parse Excel bilingual files with configurable source/target column mapping
- FR6: System can detect duplicate file uploads and alert the user
- FR7: QA Reviewer can view file history with processing status and decision tracking

#### 2. Quality Analysis Engine (FR8-FR23)
- FR8: System can execute rule-based QA checks achieving 100% parity with Xbench (tags, placeholders, numbers, glossary, consistency, spacing). Prerequisite: Xbench Parity Specification document must be completed before implementation
- FR9: System can execute AI-powered semantic screening (Layer 2) to detect issues beyond rule-based checks
- FR10: System can execute AI-powered deep contextual analysis (Layer 3) on segments flagged by semantic screening
- FR11: System can calculate quality score per file using MQM-aligned formula: Score = max(0, 100 - NPT) where NPT = Normalized Penalty Total per 1,000 words. Severity weights: Critical=25, Major=5, Minor=1. Edge cases: word count 0 = score N/A, CJK/Thai word count via Intl.Segmenter, score recalculates after each layer, multi-segment findings count penalty once
- FR12: System can apply separate confidence thresholds per language pair (per-language calibration)
- FR13: System can apply conservative default settings for new language pairs, including mandatory manual review for first 50 files per language pair per project
- FR14: QA Reviewer can select processing depth (Economy or Thorough mode) per file or batch
- FR15: System can display rule-based results immediately while AI analysis continues asynchronously with progress indication
- FR16: System can preserve partial results and display rule-based findings when AI analysis times out or fails
- FR17: System can process up to 50 files concurrently in a managed queue with configurable parallelism
- FR18: System can switch to a fallback AI model provider when primary is unavailable or degraded. Cross-provider fallback requires per-language confidence recalibration and must be flagged in findings
- FR19: System can generate a parity comparison report between tool findings and Xbench output
- FR20: QA Reviewer can retry AI analysis per file when AI processing has failed or timed out
- FR21: QA Reviewer can report a missing QA check which enters priority fix queue
- FR22: System can manage score lifecycle across pipeline layers: interim while processing, final when complete. Auto-pass evaluation occurs only on final score
- FR23: System can display auto-pass rationale showing: final score with margin, finding counts by severity, riskiest finding summary, criteria met

#### 3. Review & Decision Making (FR24-FR34, FR76-FR80)
- FR24: QA Reviewer can view findings organized by severity with progressive disclosure (Critical expanded, Minor collapsed)
- FR25: QA Reviewer can navigate from any finding directly to its source/target segment in context
- FR26: QA Reviewer can perform 7 review actions: Accept, Reject, Flag, Note, Source Issue, Severity Override, Add Finding
- FR27: QA Reviewer can bulk accept or reject 2+ findings, with confirmation dialog for > 5 items
- FR28: QA Reviewer can override a previous decision, creating a new immutable audit entry
- FR29: QA Reviewer can flag specific segments for native reviewer verification
- FR30: QA Reviewer can suppress a recurring false positive pattern. Trigger: 3+ rejections of same pattern. Scope: file/language pair/all. Duration: until AI improves/permanently/session only
- FR31: QA Reviewer can temporarily disable AI suggestions to view rule-based results only
- FR32: System can auto-pass files meeting criteria: score >= configurable threshold (default 95), 0 unresolved Critical, required AI layers completed. Full audit trail recorded
- FR33: System can operate in recommended-pass mode requiring human confirmation. Admin toggle per project. Default: recommended-pass for first 2 months
- FR34: QA Reviewer can search and filter findings by severity, type, segment range, and keyword
- FR76: System can track each finding through 8 lifecycle states: Pending, Accepted, Re-accepted, Rejected, Flagged, Noted, Source Issue, Manual — with defined score impact per state
- FR77: QA Reviewer can mark finding as "Note" (Hotkey: N) — stylistic observation, no score penalty
- FR78: QA Reviewer can reclassify finding as "Source Issue" (Hotkey: S) — source text problem, no translation penalty
- FR79: QA Reviewer can accept with Severity Override — dropdown offers Accept/Accept as Major/Accept as Minor with score recalculation
- FR80: QA Reviewer can manually add a finding not detected by system (Hotkey: +) with Manual badge and MQM score impact

#### 4. Language Intelligence (FR35-FR39)
- FR35: System can provide AI-generated back-translation and contextual explanation for non-native reviewers in persistent sidebar panel
- FR36: System can display confidence indicators per finding calibrated to specific language pair
- FR37: System can apply language-specific processing rules (word boundary detection, fullwidth punctuation, mixed script recognition)
- FR38: System can auto-tag decisions made by non-native reviewers as "subject to native audit"
- FR39: Native Reviewer can view and comment on only assigned segments (scoped access)

#### 5. Glossary Management (FR40-FR45)
- FR40: Admin can import glossaries in CSV, TBX, and Excel formats
- FR41: Admin can configure per-project glossary overrides
- FR42: QA Reviewer can add terms to project glossary from review interface (1-click)
- FR43: System can match glossary terms in no-space languages using Intl.Segmenter-based tokenization. Prerequisite: Research spike required
- FR44: System can match multi-token glossary terms with fallback to substring matching
- FR45: System can notify assigned reviewers when glossary terms change

#### 6. Reporting & Certification (FR46-FR50)
- FR46: QA Reviewer can export QA reports in PDF and Excel formats
- FR47: System can generate Smart Reports with 3-tier classification (verified / non-native accepted / needs native)
- FR48: System can generate QA Audit Trail per file
- FR49: QA Reviewer can generate QA Certificate (1-click PDF)
- FR50: System can invalidate previously exported report when decisions are overridden

#### 7. User & Project Management (FR51-FR63)
- FR51: Admin can create and manage user accounts with role assignment
- FR52: System can enforce role-based access permissions per RBAC matrix
- FR53: Admin can create and manage projects with QA rules, glossaries, and settings
- FR54: Admin can manage dual taxonomy mapping (QA Cosmetic ↔ MQM) via mapping editor
- FR55: System can display internal terminology in UI and export industry-standard in reports
- FR56: Admin or PM can assign files to specific reviewers with language-pair filtering and urgency flag
- FR57: System can display file assignment status to prevent concurrent editing conflicts
- FR58: QA Reviewer can set priority level on files for queue ordering
- FR59: QA Reviewer can view dashboard showing recent files, pending reviews, auto-pass summary, team activity
- FR60: System can notify users of relevant events (analysis complete, file assigned, glossary updated, auto-pass)
- FR61: Admin can configure auto-pass criteria (score threshold, max severity, required AI layers)
- FR62: System can provide contextual onboarding guidance for first-time users
- FR63: QA Reviewer can view estimated AI processing cost before initiating analysis

#### 8. AI Learning & Trust (FR64-FR72)
- FR64: System can log reviewer decisions as structured feedback for AI improvement. Severity overrides and manual findings are high-value signals
- FR65: System can track and display false positive rate per language pair over time
- FR66: System can display AI learning progress showing patterns learned and accuracy trend
- FR67: System can distinguish feedback states: "logged" vs "applied"
- FR68: Admin can configure and execute blind audit of auto-pass files (weekly default, 5% sample)
- FR69: System can maintain immutable append-only audit log from Day 1
- FR70: System can log run metadata per QA execution (model version, glossary version, rule config, cost)
- FR71: System can throttle AI API calls to respect rate limits and enforce budget constraints
- FR72: Admin can pin specific AI model version per project

#### 9. Rule-based Auto-fix — Growth Scope (FR73-FR75)
- FR73: System can auto-fix deterministic rule-based errors (tags, placeholders, numbers, whitespace) with full audit trail. Admin enable/disable per category per project. One-click revert
- FR74: System can display auto-fix preview with before/after comparison
- FR75: System can track auto-fix acceptance rate per category per language pair

**Self-healing Translation PRD — FR-SH1 through FR-SH18 (Growth/Vision Scope)**

#### Fix Generation (FR-SH1 to FR-SH3)
- FR-SH1: System can generate AI fix suggestions using Fix Agent with: proposed correction, confidence score (0-100), fix category, explanation. Uses structured output validation for XLIFF tag preservation
- FR-SH2: System can enrich fix generation context using RAG retrieval from glossary, translation memory, and previously accepted fixes as pgvector embeddings
- FR-SH3: System can route fix requests by complexity: simple → Layer 2 quick fix; complex → Layer 3 deep fix

#### Fix Verification (FR-SH4 to FR-SH5)
- FR-SH4: System can verify fix quality using independent Judge Agent evaluating: semantic preservation, glossary compliance, tag integrity, fluency, no new errors
- FR-SH5: System can route verified fixes through Trust Gateway: High (>95% + Judge pass) → auto-apply eligible; Medium (80-95%) → suggest; Low (<80%) → flag only

#### Fix Presentation & User Interaction (FR-SH6 to FR-SH9)
- FR-SH6: QA Reviewer can view AI fix suggestions alongside findings with before/after preview, confidence, Judge status, and fix category badge
- FR-SH7: QA Reviewer can Accept/Modify/Reject each fix. Every action recorded with timestamp, actor, rationale
- FR-SH8: QA Reviewer can bulk accept fixes above configurable confidence threshold (default 90%)
- FR-SH9: QA Reviewer can view fix history per segment

#### Progressive Trust System (FR-SH10 to FR-SH13)
- FR-SH10: System can operate in Shadow Mode — AI generates fixes silently, tracks accuracy against reviewer corrections
- FR-SH11: System can transition Shadow → Assisted when accuracy > 85% (rolling 500 fixes per language pair)
- FR-SH12: System can transition Assisted → Autonomous when acceptance > 75% AND Judge agreement > 90% for 1,000+ fixes. Auto-revert if revert rate > 5% in 7-day window
- FR-SH13: System can display trust level status per language pair: mode, accuracy trend, fixes until threshold, transition history

#### Learning & Feedback Loop (FR-SH14 to FR-SH16)
- FR-SH14: System can update RAG knowledge base on Accept/Modify actions
- FR-SH15: System can recalibrate confidence thresholds per language pair weekly (minimum 100 new signals)
- FR-SH16: System can display Self-healing analytics dashboard

#### Observability & Cost Control (FR-SH17 to FR-SH18)
- FR-SH17: System can log all Self-healing pipeline events linked to source finding ID and file ID
- FR-SH18: System can enforce Self-healing cost budget per project, separate from main QA detection budget

### NonFunctional Requirements

**Main PRD — NFR1-NFR42**

#### Performance (NFR1-NFR8)
- NFR1: File upload + parse < 3 seconds (files < 10MB)
- NFR2: Rule-based engine < 5 seconds per 5,000 segments
- NFR3: AI Layer 2 < 30 seconds per 5,000 segments
- NFR4: AI Layer 3 < 2 minutes per flagged segments
- NFR5: Page load < 2 seconds (TTI)
- NFR6: Report export < 10 seconds (file < 5,000 segments)
- NFR7: Batch of 10 files < 5 minutes total
- NFR8: Reject files > 50MB with clear error

#### Security (NFR9-NFR14)
- NFR9: All data encrypted at rest and in transit
- NFR10: File content never written to application logs
- NFR11: AI API integration must prevent prompt injection
- NFR12: Sessions expire after 8 hours inactivity (configurable)
- NFR13: Tenant-scoped storage paths from Day 1
- NFR14: No user passwords in application database

#### Reliability (NFR15-NFR19)
- NFR15: 99.5% availability during business hours (Mon-Fri 08:00-19:00 ICT)
- NFR16: AI failure does not block QA workflow — rule-based always available
- NFR17: No review progress lost on browser crash (auto-save on every decision action)
- NFR18: Queue jobs survive server restart
- NFR19: Recovery time < 4 hours during business hours

#### Scalability (NFR20-NFR24)
- NFR20: Support 6-9 concurrent users with < 10% degradation (MVP)
- NFR21: Handle 50 concurrent file processing during peak (MVP)
- NFR22: tenant_id on all tables from Day 1 (MVP design)
- NFR23: Support 50+ concurrent users multi-tenant (Growth)
- NFR24: AI cost per file within 2x average, alert at 3x

#### Accessibility (NFR25-NFR30)
- NFR25: WCAG 2.1 Level AA compliance
- NFR26: All 7 review actions reachable via keyboard (Hotkeys: A, R, F, N, S, —, +)
- NFR27: Severity uses icon + text + color (never color alone)
- NFR28: Contrast 4.5:1 (normal), 3:1 (large text)
- NFR29: Functional at 200% browser zoom
- NFR30: UI language English-only in MVP

#### Browser Compatibility (NFR31-NFR35)
- NFR31: Chrome (latest) — fully tested
- NFR32: Firefox (latest) — best-effort
- NFR33: Edge (latest) — best-effort
- NFR34: Safari 17.4+ — best-effort (Intl.Segmenter required)
- NFR35: Mobile — not supported (desktop workflow)

#### Observability (NFR36-NFR39)
- NFR36: All AI API calls logged with latency, tokens, cost, model, status
- NFR37: Failed parsing and AI timeouts logged with full error context
- NFR38: Application performance metrics tracked
- NFR39: AI false positive rate tracked per language pair as time series

#### AI Cost Control (NFR40)
- NFR40: Max AI cost per file capped (configurable), halt + notify if exceeded

#### Data Retention & Backup (NFR41-NFR42)
- NFR41: Logs retained 90 days, AI metrics and audit trail indefinitely
- NFR42: Daily DB backup with point-in-time recovery, quarterly restore test

**Self-healing PRD — NFR-SH1 through NFR-SH7**

- NFR-SH1: Layer 2 quick fix < 3 seconds per finding
- NFR-SH2: Layer 3 deep fix + Judge < 10 seconds per finding
- NFR-SH3: Shadow Mode < 20% overhead on existing pipeline
- NFR-SH4: Fix cost < $0.05 (L2) and < $0.15 (L3) per fix
- NFR-SH5: RAG retrieval < 500ms
- NFR-SH6: Self-healing failure does not block QA pipeline
- NFR-SH7: Fix suggestions cached per file version

### Additional Requirements

**From Architecture Document:**

#### Starter Template & Project Initialization
- Version verification required before `npm install` (9 technologies with specific versions)
- Version lock strategy: `npm ci` in CI, pinned versions for core dependencies
- 4-step initialization sequence: create-next-app → shadcn init → core deps → dev deps
- Drizzle ORM 0.x → 1.0 migration plan documented

#### Infrastructure Setup
- Service tier requirements: Supabase Pro ($25/mo), Vercel Pro ($20/mo), Inngest Free→Pro, Upstash Free
- Connection pooling: Supabase Supavisor Transaction mode, pool size 15
- Load testing pre-launch: 50 concurrent dashboard loads, 10 concurrent pipelines, 50 Realtime subscriptions
- Performance upgrade triggers defined per service
- Backup strategy: daily automatic + weekly pg_dump + continuous PITR
- DR targets: RPO < 1 hour, RTO < 4 hours
- Audit log retention: hot (0-12mo) → warm partitioned (12-36mo) → cold export (36+mo)
- GDPR tenant data deletion with 30-day grace period

#### AI Provider Integration
- Multi-provider model assignment: L2 = GPT-4o-mini (fallback: Gemini Flash), L3 = Claude Sonnet (fallback: GPT-4o)
- Provider configuration in `src/lib/ai/providers.ts`
- Per-language-pair confidence thresholds (provisional, requires calibration during beta)
- AI cost tracking: mandatory structured log fields per call

#### Rate Limiting (Upstash Redis)
- API mutations: 100 req/min
- File upload: 10 req/min
- AI pipeline trigger: 5 req/min
- Auth endpoints: 10 req/15min
- Read endpoints: 300 req/min
- Rate limit headers: X-RateLimit-Limit, Remaining, Reset, Retry-After

#### Data & Schema Setup
- Drizzle schema + SQL migrations version controlled
- RLS policies enforced on critical tables from Day 1
- Immutable audit log: 3-layer defense (app code INSERT only + RLS + DB trigger)
- Auth webhook for role sync (JWT 15min expiry)
- Database indexes for audit_logs and feedback_events
- Monthly table partitioning for audit_logs
- Feedback events table (Growth ML training foundation)
- Self-healing schema design in MVP: fix_suggestions + self_healing_config tables (mode="disabled")

#### Monitoring & Logging
- Structured logging: pino (Node.js) + edgeLogger (Edge Runtime)
- Better Stack uptime monitoring (5 monitors: homepage, API health, Inngest, Supabase, reserved)
- Health endpoint `/api/health` checking DB + Auth + Inngest
- Alert escalation: Warning (3min) → Critical (9min) → Recovery
- Vercel Analytics for Core Web Vitals

#### Security Implementation
- RBAC M3 pattern: JWT for reads, DB lookup for writes
- Stale JWT UI mitigation: Realtime subscription + 5min fallback poll + 15min max stale window
- 5 security test scenarios as CI gates
- AI version pinning with chaos testing
- Environment variable security conventions
- service_role key server-side only

#### Technical Standards
- Server Actions return ActionResult<T> pattern
- Inngest events include tenantId + projectId
- Score recalculation: event-driven via Inngest serial queue with 500ms debounce
- Pipeline orchestration: 3-tier Inngest (Orchestrator → Batch Workers → Per-segment pipeline)
- RSC/Client component boundary strategy (feature-based)
- Feature-based co-location project structure
- CI/CD pipeline: quality gate (every PR) + E2E gate (merge to main) + chaos test (weekly)
- Cache strategy: Next.js "use cache" directive + cacheTag/cacheLife
- File size hard limit: 15MB (DOM parsing memory constraint)

**From UX Design Specification:**

#### Responsive Design
- Desktop-first professional tool: 1440px+ primary, 1024px+ high priority, 768px+ low, <768px minimal
- Desktop-first CSS with max-width degradation breakpoints
- No feature parity on mobile — dashboard/status only
- Sidebar collapsed/expanded state saved per user

#### Accessibility Implementation
- WCAG 2.1 AA with specific ARIA patterns per component
- Screen reader support: role="grid" for finding list, aria-live for score changes, aria-labels on all actions
- Focus management: auto-advance after action, Esc hierarchy, focus trap in modals
- Color accessibility: severity uses icon shape + color (protanopia/deuteranopia/tritanopia safe)
- Multilingual: lang attributes on Thai/CJK/RTL segments, CJK 1.1x font scale
- High contrast mode support (@media forced-colors)
- prefers-reduced-motion respected for all animations

#### Component Architecture
- 30 components: 16 shadcn (configure) + 14 custom (build)
- P0 components: FindingCard, FindingCardCompact, BatchSummary, LanguageBridge, ScoreBadge, ReviewProgress
- P1 components: FileStatusCard, SegmentContext, AILearningIndicator, ReviewerSelector
- P2 components: ScoreChangeLog, QACertificate, FindingPattern
- Shared hooks: useKeyboardActions, useAnimatedNumber, useBulkSelection, useKeyboardRangeSelect, useOptimisticUpdate
- Command palette with 3-tier search (Ctrl+K)
- ProcessingModeDialog for Economy/Thorough selection with cost estimates
- QACertificate: server-side PDF via Puppeteer/Playwright for Thai text rendering

### FR Coverage Map

| FR | Epic | Description |
|---|:---:|---|
| FR1 | 2 | Upload single/multiple files |
| FR2 | 2 | Batch summary per-file status |
| FR3 | 2 | Parse SDLXLIFF with Trados metadata |
| FR4 | 2 | Parse XLIFF 1.2 with inline tags |
| FR5 | 2 | Parse Excel bilingual files |
| FR6 | 2 | Duplicate file detection |
| FR7 | 2 | File history with status tracking |
| FR8 | 2 | Rule-based QA Xbench parity 100% |
| FR9 | 3 | AI Layer 2 semantic screening |
| FR10 | 3 | AI Layer 3 deep contextual analysis |
| FR11 | 2 | MQM score calculation |
| FR12 | 2 | Per-language confidence thresholds |
| FR13 | 2 | Conservative defaults new language pairs |
| FR14 | 2 | Economy/Thorough mode selection |
| FR15 | 2 | Rule-based results instant, AI async |
| FR16 | 3 | Partial results on AI timeout/failure |
| FR17 | 3 | 50 concurrent files managed queue |
| FR18 | 3 | Fallback AI model provider |
| FR19 | 2 | Parity comparison report |
| FR20 | 3 | Retry AI per file |
| FR21 | 2 | Report missing QA check |
| FR22 | 3 | Score lifecycle (interim → final) |
| FR23 | 3 | Auto-pass rationale display |
| FR24 | 4 | Progressive disclosure by severity |
| FR25 | 4 | Segment navigation from finding |
| FR26 | 4 | 7 review actions |
| FR27 | 4 | Bulk accept/reject with confirmation |
| FR28 | 4 | Override previous decision (immutable) |
| FR29 | 5 | Flag segments for native review |
| FR30 | 4 | Suppress recurring false positive |
| FR31 | 4 | Disable AI suggestions temporarily |
| FR32 | 7 | Auto-pass files meeting criteria |
| FR33 | 7 | Recommended-pass mode |
| FR34 | 4 | Search and filter findings |
| FR35 | 5 | Back-translation + explanation sidebar |
| FR36 | 3 | Confidence indicators per language pair |
| FR37 | 2 | Language-specific processing rules |
| FR38 | 5 | Non-native auto-tag |
| FR39 | 5 | Native Reviewer scoped access |
| FR40 | 1 | Glossary import (CSV, TBX, Excel) |
| FR41 | 1 | Per-project glossary overrides |
| FR42 | 4 | Add to glossary from review (1-click) |
| FR43 | 1 | Glossary matching no-space languages |
| FR44 | 1 | Multi-token glossary matching |
| FR45 | 1 | Glossary change notification |
| FR46 | 8 | Export reports PDF/Excel |
| FR47 | 8 | Smart Reports 3-tier |
| FR48 | 8 | QA Audit Trail per file |
| FR49 | 8 | QA Certificate (1-click PDF) |
| FR50 | 8 | Report invalidation on override |
| FR51 | 1 | User management with roles |
| FR52 | 1 | RBAC enforcement |
| FR53 | 1 | Project management |
| FR54 | 1 | Dual taxonomy mapping editor |
| FR55 | 1 | Internal terminology UI / standard reports |
| FR56 | 6 | File assignment with language-pair filter |
| FR57 | 6 | File assignment status display |
| FR58 | 6 | Priority queue (urgent files) |
| FR59 | 1 | Dashboard |
| FR60 | 6 | Notifications |
| FR61 | 7 | Configure auto-pass criteria |
| FR62 | 1 | Contextual onboarding |
| FR63 | 3 | Estimated AI cost before run |
| FR64 | 9 | Log reviewer decisions as feedback |
| FR65 | 9 | False positive rate per language pair |
| FR66 | 9 | AI learning progress indicator |
| FR67 | 9 | Feedback states: logged vs applied |
| FR68 | 7 | Blind audit of auto-pass files |
| FR69 | 8 | Immutable append-only audit log |
| FR70 | 8 | Run metadata logging |
| FR71 | 3 | AI API throttling and budget |
| FR72 | 3 | Model version pinning per project |
| FR73 | 10 | Rule-based auto-fix (Growth) |
| FR74 | 10 | Auto-fix preview (Growth) |
| FR75 | 10 | Auto-fix tracking (Growth) |
| FR76 | 4 | 8 finding lifecycle states |
| FR77 | 4 | Note action (Hotkey: N) |
| FR78 | 4 | Source Issue action (Hotkey: S) |
| FR79 | 4 | Severity Override action |
| FR80 | 4 | Add Finding action (Hotkey: +) |
| FR-SH1 | 11 | AI fix suggestions via Fix Agent |
| FR-SH2 | 11 | RAG-enriched fix context |
| FR-SH3 | 11 | Fix routing by complexity |
| FR-SH4 | 11 | Judge Agent verification |
| FR-SH5 | 11 | Trust Gateway routing |
| FR-SH6 | 11 | Fix display alongside findings |
| FR-SH7 | 11 | Accept/Modify/Reject fixes |
| FR-SH8 | 11 | Bulk accept high-confidence fixes |
| FR-SH9 | 11 | Fix history per segment |
| FR-SH10 | 11 | Shadow Mode operation |
| FR-SH11 | 11 | Shadow → Assisted transition |
| FR-SH12 | 11 | Assisted → Autonomous transition |
| FR-SH13 | 11 | Trust level status display |
| FR-SH14 | 11 | RAG update on Accept/Modify |
| FR-SH15 | 11 | Confidence threshold recalibration |
| FR-SH16 | 11 | Self-healing analytics dashboard |
| FR-SH17 | 11 | Self-healing pipeline logging |
| FR-SH18 | 11 | Self-healing cost budget enforcement |

## Epic List

### Epic 1: Project Foundation & Configuration
**Goal:** Users can create accounts, set up projects, import glossaries, configure taxonomy mappings, and get onboarded — establishing the complete workspace foundation for QA review operations.
**FRs covered:** FR40, FR41, FR43, FR44, FR45, FR51, FR52, FR53, FR54, FR55, FR59, FR62
**Scope:** MVP | **FRs:** 12
**Includes:** Architecture initialization (starter template, DB schema, RLS policies, audit trigger, auth setup), Supabase Auth + RBAC, project CRUD, glossary import/matching, taxonomy editor, dashboard shell, onboarding guidance.

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
**FRs covered:** FR64, FR65, FR66, FR67
**Scope:** MVP | **FRs:** 4
**Includes:** Structured feedback logging, false positive rate tracking per language pair, AI learning indicator (patterns + accuracy trend), feedback states (logged vs applied).

### Epic 10: Rule-based Auto-fix (Growth)
**Goal:** System can auto-fix deterministic errors (tags, placeholders, numbers) with preview and acceptance tracking — transitioning from detection-only to detection-and-correction for mechanical errors.
**FRs covered:** FR73, FR74, FR75
**Scope:** Growth (Month 3-6) | **FRs:** 3
**Note:** MVP includes schema design only (fix_suggestions, self_healing_config tables with mode="disabled").

### Epic 11: Self-healing Translation (Growth/Vision)
**Goal:** AI generates verified corrections for detected QA issues using multi-agent pipeline (Fix Agent + Judge Agent), with progressive trust model (Shadow → Assisted → Autonomous) — transforming the tool from Detective to Doctor.
**FRs covered:** FR-SH1 to FR-SH18
**Scope:** Growth/Vision (Month 3-12+) | **FRs:** 18
**Note:** Depends on MVP data accumulation (500+ human-corrected translations per language pair).

---

## Epic 1: Project Foundation & Configuration

**Goal:** Users can create accounts, set up projects, import glossaries, configure taxonomy mappings, and get onboarded — establishing the complete workspace foundation for QA review operations.

**FRs covered:** FR40, FR41, FR43, FR44, FR45, FR51, FR52, FR53, FR54, FR55, FR59, FR62
**NFRs addressed:** NFR9 (encryption), NFR12 (session expiry), NFR13 (tenant-scoped paths), NFR14 (no passwords in DB), NFR22 (tenant_id Day 1), NFR25-30 (accessibility baseline)
**Architecture:** Starter template, DB schema, RLS policies, audit trigger, auth webhooks, Edge middleware, design system

### Story 1.1: Project Initialization & Design System Setup

As a Developer,
I want the application initialized with the correct tech stack, folder structure, design tokens, and app shell layout,
So that all subsequent development has a consistent, well-structured foundation to build upon.

**Acceptance Criteria:**

**Given** no project exists yet
**When** the initialization commands are executed (create-next-app, shadcn init, dependency install)
**Then** a Next.js 16 project is created with TypeScript, Tailwind CSS v4, ESLint, App Router, and src directory
**And** shadcn/ui is initialized with the project's design tokens (colors, typography, spacing from UX spec)
**And** all core dependencies are installed: @supabase/supabase-js, @supabase/ssr, drizzle-orm, inngest, ai, fast-xml-parser, zustand, pino, sonner, zod, @upstash/ratelimit, @upstash/redis
**And** all dev dependencies are installed: drizzle-kit, vitest, @vitejs/plugin-react, jsdom, @testing-library/react, playwright, drizzle-zod

**Given** the project is initialized
**When** I examine the folder structure
**Then** the feature-based structure matches Architecture spec: src/features/, src/components/ui/, src/components/layout/, src/lib/, src/db/, src/app/
**And** the app shell layout is implemented with collapsible sidebar (48px collapsed / 240px expanded) + main content area + detail panel placeholder
**And** sidebar collapsed/expanded state persists per user preference (localStorage)

**Given** the app shell is loaded in Chrome
**When** I navigate to the root URL
**Then** the page loads within 2 seconds (NFR5)
**And** the layout is responsive: full layout at >= 1440px, collapsed sidebar at >= 1024px, single column at >= 768px, dashboard-only at < 768px
**And** WCAG 2.1 AA baseline is met: 4.5:1 contrast, focus indicators visible, semantic HTML structure

**Given** the project is set up
**When** I check configuration files
**Then** .env.example exists with all required environment variable keys (no secrets)
**And** drizzle.config.ts is configured for Supabase connection
**And** vitest workspace is configured (jsdom for components, node for server)
**And** edgeLogger utility exists at src/lib/logger-edge.ts for Edge Runtime logging
**And** pino logger exists at src/lib/logger.ts for Node.js runtime

### Story 1.2: Database Schema & Authentication

As an Admin,
I want to register, log in, and manage user accounts with role-based access control,
So that the right people have the right permissions from Day 1.

**Acceptance Criteria:**

**Given** the database has no schema
**When** the initial migration runs
**Then** core tables are created: tenants, users (Supabase Auth), user_roles, audit_logs
**And** all tables include tenant_id column (NFR22)
**And** audit_logs table is partitioned by month with 3-layer immutability protection: app-level INSERT only, RLS INSERT-only policy, DB trigger blocking UPDATE/DELETE
**And** RLS policies are enabled on all tables enforcing tenant isolation

**Given** no user account exists
**When** a user navigates to the login page
**Then** they can sign in via Supabase Auth (email/password or Google OAuth)
**And** upon first login, a default tenant and Admin role are assigned
**And** JWT expiry is set to 15 minutes with automatic silent refresh

**Given** an Admin is logged in
**When** they navigate to user management
**Then** they can create new users and assign roles: Admin, QA Reviewer, or Native Reviewer (FR51)
**And** role changes trigger JWT refresh via Supabase Realtime subscription
**And** a 5-minute fallback poll ensures stale JWT maximum window is 15 minutes

**Given** a user with QA Reviewer role
**When** they attempt to access admin-only features (user management, settings)
**Then** the request is blocked (FR52)
**And** read operations check JWT claims (fast path)
**And** write operations verify role against user_roles DB table (M3 pattern — accurate path)

**Given** Edge middleware is processing a request
**When** authentication and tenant verification occur
**Then** structured JSON logs are written via edgeLogger (never raw console.log)
**And** rate limiting is enforced via Upstash Redis: API mutations 100/min, auth endpoints 10/15min, reads 300/min

**Given** a user session is inactive for 8 hours
**When** the session timeout check runs
**Then** the session expires and the user is redirected to login (NFR12)

### Story 1.3: Project Management & Configuration

As an Admin,
I want to create and manage QA projects with associated settings,
So that my team has organized workspaces for each localization project.

**Acceptance Criteria:**

**Given** an Admin is logged in
**When** they navigate to the Projects page
**Then** they see a list of all projects for their tenant with name, language pairs, creation date, and file count

**Given** an Admin is on the Projects page
**When** they click "Create Project"
**Then** a form appears to enter: project name, description, source language, target language(s), and processing mode default (Economy/Thorough)
**And** upon submission, a new project is created with tenant_id automatically set
**And** the project appears in the project list

**Given** a project exists
**When** an Admin opens project settings
**Then** they can edit: project name, description, default processing mode, auto-pass threshold (default 95), and language pair configurations (FR53)
**And** changes are saved with audit trail entry

**Given** a QA Reviewer is logged in
**When** they access the project list
**Then** they can view projects assigned to their tenant but cannot create or delete projects

**Given** the projects table schema
**When** I inspect the database
**Then** the projects table includes: id, tenant_id, name, description, source_lang, target_langs (jsonb), default_mode, auto_pass_threshold, created_at, updated_at
**And** language_pair_configs table exists with provisional thresholds per language pair (EN→TH: 93, EN→JA: 93, EN→ZH: 94, default: 95)

### Story 1.4: Glossary Import & Management

As an Admin,
I want to import glossaries in CSV, TBX, and Excel formats and manage per-project overrides,
So that the QA engine can check terminology compliance against our approved terms.

**Acceptance Criteria:**

**Given** an Admin is on the project glossary page
**When** they click "Import Glossary" and select a CSV file with source/target term columns
**Then** terms are parsed and imported into the project's glossary
**And** a summary shows: terms imported count, duplicates skipped, errors (if any)

**Given** an Admin uploads a TBX (TermBase eXchange) file
**When** the import processes
**Then** TBX XML is parsed correctly preserving language-specific terms
**And** terms are mapped to the project's language pairs (FR40)

**Given** an Admin uploads an Excel glossary file
**When** the import processes
**Then** configurable column mapping allows selecting source/target columns
**And** terms are imported matching the configured mapping

**Given** a project has an imported glossary
**When** an Admin views the glossary management page
**Then** they see all terms with source, target, language pair, and status
**And** they can add, edit, or delete individual terms
**And** they can configure per-project overrides for approved terminology (FR41)

**Given** the glossary schema
**When** I inspect the database
**Then** glossaries table exists: id, project_id, tenant_id, name, format_source, created_at
**And** glossary_terms table exists: id, glossary_id, tenant_id, source_term, target_term, language_pair, notes, created_at
**And** glossary terms are cached using Next.js "use cache" + cacheTag per project, invalidated on mutation

**Given** a glossary with 500+ terms is imported
**When** I measure import performance
**Then** the import completes within 10 seconds
**And** the glossary index is precomputed on import (not on-the-fly matching)

### Story 1.5: Glossary Matching Engine for No-space Languages

As a QA Reviewer,
I want glossary terms to be accurately matched in Thai, Chinese, and Japanese text,
So that terminology compliance checks work correctly for languages without word boundaries.

**Acceptance Criteria:**

**Given** a project has a glossary with Thai terms
**When** the glossary matching engine processes a Thai target segment
**Then** terms are matched using Intl.Segmenter('th') tokenization (not substring or regex \b)
**And** false negative rate is < 5% on reference test corpus
**And** false positive rate is < 10% on reference test corpus (FR43)

**Given** a glossary entry spans multiple Intl.Segmenter tokens (e.g., compound word in Chinese)
**When** matching runs on a segment containing the compound term
**Then** multi-token matching logic identifies the term correctly
**And** if Intl.Segmenter output is ambiguous, substring matching fallback is used
**And** fallback usage is logged via structured pino log for monitoring (FR44)

**Given** a segment in Japanese with mixed scripts (hiragana, katakana, kanji)
**When** glossary matching runs
**Then** Intl.Segmenter('ja') correctly segments the text
**And** glossary terms are matched regardless of script type

**Given** a segment in Chinese (Simplified)
**When** glossary matching runs
**Then** Intl.Segmenter('zh') tokenizes correctly
**And** fullwidth punctuation is handled properly (not matched as term boundaries)

**Given** a European language segment (EN→FR, EN→DE)
**When** glossary matching runs
**Then** standard word-boundary matching is used (Intl.Segmenter not required)
**And** diacritics are handled correctly (á, ñ, ü are not errors)

### Story 1.6: Taxonomy Mapping Editor

As an Admin,
I want to manage the mapping between internal QA Cosmetic terminology and industry-standard MQM categories,
So that the team sees familiar terms in the UI while reports export in MQM standard format.

**Acceptance Criteria:**

**Given** an Admin navigates to the Taxonomy Mapping page
**When** the page loads
**Then** a pre-populated mapping table shows: QA Cosmetic term ↔ MQM category ↔ severity level
**And** initial mappings are seeded from docs/QA _ Quality Cosmetic.md

**Given** the mapping table is displayed
**When** an Admin edits a mapping row
**Then** they can change: QA Cosmetic term, MQM category, severity level (Critical/Major/Minor)
**And** changes save immediately with audit trail entry (FR54)

**Given** an Admin adds a new mapping entry
**When** they fill in QA Cosmetic term, MQM category, and severity
**Then** the new mapping is added and available for the QA engine to use

**Given** an Admin deletes a mapping entry
**When** they confirm deletion
**Then** the mapping is removed (soft delete with audit trail)

**Given** the taxonomy system is configured
**When** findings are displayed in the review UI
**Then** QA Cosmetic terminology is shown (familiar to team)
**And** when findings are exported to reports, MQM standard terminology is used (FR55)

**Given** the taxonomy schema
**When** I inspect the database
**Then** taxonomy_definitions table exists: id, tenant_id, internal_name, mqm_category, mqm_subcategory, severity, description, is_active, created_at

### Story 1.7: Dashboard, Notifications & Onboarding

As a QA Reviewer,
I want a dashboard showing my recent activity and pending work, receive notifications for relevant events, and get guided onboarding on first use,
So that I can quickly orient myself and stay informed.

**Acceptance Criteria:**

**Given** a QA Reviewer logs in
**When** they land on the dashboard
**Then** they see: recent files (last 10), pending reviews count, auto-pass summary (passed/review counts), and team activity feed (FR59)
**And** the dashboard loads within 2 seconds (NFR5)
**And** dashboard data is server-rendered (RSC) with client-side chart components

**Given** an Admin updates glossary terms for a project
**When** the change is saved
**Then** all QA Reviewers assigned to that project receive a notification: "Glossary updated: X terms added/modified" (FR45)
**And** notifications appear as toast (sonner) and persist in a notification dropdown

**Given** a first-time user logs in
**When** they reach the dashboard for the first time
**Then** a contextual onboarding guide activates: 5-step walkthrough covering severity levels → review actions → auto-pass concept → report generation → keyboard shortcuts (FR62)
**And** the user can skip or dismiss the onboarding at any step
**And** onboarding completion state is saved per user (does not re-appear)

**Given** the notification system
**When** events fire (glossary updated, analysis complete, file assigned, auto-pass triggered)
**Then** relevant users receive notifications via Supabase Realtime push (FR60 foundation — full implementation in Epic 6)

**Given** the dashboard on a mobile device (< 768px)
**When** the page loads
**Then** only dashboard summary cards and batch status list are shown
**And** a banner displays: "For the best review experience, use a desktop browser"

---

## Epic 2: File Processing & Rule-based QA Engine

**Goal:** Users can upload translation files (SDLXLIFF, XLIFF 1.2, Excel), see parsed results with full metadata, and get instant rule-based QA results achieving 100% Xbench parity — the foundation for replacing Xbench.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR11, FR12, FR13, FR14, FR15, FR19, FR21, FR37
**NFRs addressed:** NFR1 (parse < 3s), NFR2 (rules < 5s/5K segments), NFR7 (batch 10 files < 5min), NFR8 (reject > 50MB), NFR10 (no file content in logs), NFR16 (rule-based always available)
**Architecture:** Unified SDLXLIFF/XLIFF parser (fast-xml-parser), 15MB file guard, Inngest pipeline L1, glossary cache integration

### Story 2.1: File Upload & Storage Infrastructure

As a QA Reviewer,
I want to upload single or multiple translation files for QA processing,
So that I can start the quality analysis workflow.

**Acceptance Criteria:**

**Given** a QA Reviewer is on a project page
**When** they click "Upload Files" and select one or more files (SDLXLIFF, XLIFF 1.2, or Excel)
**Then** files are uploaded to Supabase Storage with tenant-scoped paths: `{tenant_id}/{project_id}/{file_hash}/{filename}` (NFR13)
**And** upload progress is displayed per file
**And** each file receives a unique ID and SHA-256 hash for tracking (FR1)

**Given** a file exceeds 50MB
**When** the upload is attempted
**Then** the upload is rejected immediately with a clear error message: "File exceeds maximum size of 50MB" (NFR8)
**And** the rejection occurs before any server-side processing begins

**Given** a file exceeds 15MB but is under 50MB
**When** the upload is attempted
**Then** the upload is accepted but a warning is shown: "Large file — processing may be slower"
**And** the 15MB DOM parsing guard is enforced at parse time (Architecture constraint)

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
**And** all inline tags are preserved: `<g>`, `<x/>`, `<ph>`, `<bx/>`, `<ex/>`, `<bpt>`, `<ept>` and sdl: namespace elements
**And** the `sdl:` namespace is recognized and handled (not stripped or errored)

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
**And** word count for CJK/Thai uses Intl.Segmenter token count (not space-split)

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
**And** 100% of issues that Xbench catches are also caught by this engine (FR8)

**Given** the rule engine processes Thai (TH) segments
**When** checking glossary compliance and spacing
**Then** Thai-specific rules apply: no word-boundary regex (use Intl.Segmenter from Story 1.5), Thai numeral ↔ Arabic mapping, particles (ครับ/ค่ะ) not flagged as errors (FR37)

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

**Given** a file with 0 word count or only tags (no translatable text)
**When** scoring is attempted
**Then** score is set to N/A with status "unable to score"

**Given** CJK or Thai text
**When** word count is calculated
**Then** Intl.Segmenter token count is used (not space-split) for accurate NPT calculation (FR11)

**Given** a finding spans multiple segments
**When** the penalty is calculated
**Then** the penalty counts once per finding, not once per segment (FR11)

**Given** a project with EN→TH language pair
**When** confidence thresholds are applied
**Then** the per-language calibration from language_pair_configs is used: EN→TH auto-pass threshold = 93 (not default 95) (FR12)

**Given** a new language pair (e.g., EN→AR) with no previous data
**When** the first file is processed
**Then** conservative defaults apply: auto-pass threshold at maximum (99), mandatory manual review for first 50 files
**And** a "New language pair" badge is displayed
**And** the system tracks file count per language pair per project and notifies admin at file 51 when transitioning to standard mode (FR13)

**Given** the score is calculated
**When** I inspect the database
**Then** the scores table contains: id, file_id, project_id, tenant_id, score_value, score_status (calculating/calculated/na), word_count, penalty_total, findings_critical, findings_major, findings_minor, layer_completed (L1/L1L2/L1L2L3), calculated_at

### Story 2.6: Inngest Pipeline Foundation & Processing Modes

As a QA Reviewer,
I want to choose between Economy and Thorough processing modes and see rule-based results instantly,
So that I can balance speed/cost with analysis depth and start reviewing while AI processes.

**Acceptance Criteria:**

**Given** a QA Reviewer has uploaded files
**When** they initiate QA processing
**Then** a ProcessingModeDialog appears offering: Economy (L1+L2, faster, cheaper) and Thorough (L1+L2+L3, deeper, recommended badge)
**And** cost and time estimates are shown per mode
**And** Economy is the default selection (FR14)

**Given** the user selects a processing mode and clicks "Start Processing"
**When** the Inngest orchestrator function is triggered
**Then** the orchestrator reads project config (mode, language pair settings)
**And** segments are grouped by language pair
**And** segments are batched (configurable batch size, default 20)
**And** Layer 1 (rule-based) runs first via `step.run("segment-{id}-L1", ...)`
**And** each Inngest step has a deterministic ID for idempotency

**Given** Layer 1 processing completes for a file
**When** results are ready
**Then** rule-based findings are displayed immediately in the UI via Supabase Realtime push
**And** the score shows with a "Rule-based" badge (blue)
**And** if AI layers are pending, an "AI pending" badge is displayed alongside (FR15)
**And** the user can begin reviewing rule-based findings immediately without waiting for AI

**Given** Economy mode is selected
**When** the pipeline runs
**Then** only L1 is executed in this epic (L2 will be added in Epic 3)
**And** score_status reflects layers completed: "L1" for Economy at this stage

**Given** the Inngest function encounters an error during L1 processing
**When** the error occurs
**Then** Inngest retries automatically (default 3 retries with backoff)
**And** if all retries fail, the file status is set to "failed" with error context
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
**And** files are split into two groups: "Recommended Pass" (sorted by score descending) and "Need Review" (sorted by score ascending — worst first) (FR2)
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
**Then** a parity comparison report is generated showing: issues found by both tools, issues found only by our tool, issues found only by Xbench (should be 0) (FR19)
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

## Epic 3: AI-Powered Quality Analysis

**Goal:** Users get AI semantic analysis (Layer 2 screening + Layer 3 deep analysis) that catches issues beyond rule-based checks, with confidence scoring, resilient processing, and cost visibility — extending the pipeline from Xbench parity to beyond-Xbench intelligence.

**FRs covered:** FR9, FR10, FR16, FR17, FR18, FR20, FR22, FR23, FR36, FR63, FR71, FR72
**NFRs addressed:** NFR3 (L2 < 30s/100 segments), NFR4 (L3 < 60s/100 segments), NFR16 (AI failure does not block QA), NFR18 (queue jobs survive restart), NFR36 (all AI API calls logged)
**Architecture:** Vercel AI SDK v6 structured output, LAYER_MODELS config, fallbackChain pattern, Inngest pipeline extension (L2+L3 steps), Upstash rate limiting for AI triggers

### Story 3.1: AI Layer 2 Screening Integration

As a QA Reviewer,
I want AI-powered semantic screening (Layer 2) to detect issues beyond rule-based checks,
So that I get deeper quality analysis that catches meaning errors, omissions, and fluency problems that rules cannot detect.

**Acceptance Criteria:**

**Given** Layer 1 (rule-based) processing has completed for a file
**When** the Inngest pipeline continues to Layer 2
**Then** segments are sent to the L2 AI model (primary: `gpt-4o-mini`, as configured in `LAYER_MODELS.L2`) via Vercel AI SDK v6 structured output
**And** segments are batched in groups of 20 (configurable batch size)
**And** each batch is processed as a separate Inngest step with deterministic ID: `step.run("batch-{batchId}-L2", ...)`

**Given** the L2 model receives a batch of segments
**When** it performs semantic screening
**Then** the prompt includes: source text, target text, language pair, and any L1 findings for context
**And** the AI checks for: mistranslations, omissions, additions, fluency issues, register/tone mismatches, and cultural inappropriateness
**And** the response is parsed via Zod schema enforcing structured output: `{ findings: [{ segmentId, category, severity, description, suggestion, confidence }] }`

**Given** L2 screening produces findings
**When** findings are saved
**Then** each finding is inserted into the findings table with: layer = "L2", confidence = AI-reported confidence (0-100), status = "Pending"
**And** the confidence value reflects the per-language-pair calibration from `language_pair_configs` (FR36)
**And** findings with confidence below `L2_confidence_min` threshold for the language pair are flagged with a "Low confidence" badge

**Given** L2 processing completes for a file
**When** results are available
**Then** the score is recalculated incorporating L2 findings (same MQM formula from Story 2.5)
**And** `scores.layer_completed` is updated to "L1L2"
**And** the score badge updates from "Rule-based" (blue) to "AI Screened" (purple) via Supabase Realtime push
**And** the QA Reviewer can see both L1 and L2 findings in the review UI

**Given** 100 segments are submitted for L2 screening
**When** processing completes
**Then** it finishes within 30 seconds (NFR3)

**Given** Economy mode was selected
**When** L2 processing completes
**Then** the pipeline stops after L2 (no L3 triggered)
**And** `scores.layer_completed` = "L1L2" and `scores.score_status` = "calculated"

**Given** all AI API calls during L2 processing
**When** I inspect the logs
**Then** each call is logged via pino with: model, provider, latency_ms, input_tokens, output_tokens, estimated_cost, status (success/error), language_pair (NFR36)

### Story 3.2: AI Layer 3 Deep Contextual Analysis

As a QA Reviewer,
I want AI-powered deep contextual analysis (Layer 3) on segments flagged by screening,
So that I get the most thorough quality assessment with high-confidence findings on complex issues.

**Acceptance Criteria:**

**Given** Layer 2 screening has completed and Thorough mode was selected
**When** the Inngest pipeline continues to Layer 3
**Then** only segments flagged by L2 (those with L2 findings OR confidence < threshold) are sent to L3 — not all segments
**And** the L3 AI model is used (primary: `claude-sonnet-4-5-20250929`, as configured in `LAYER_MODELS.L3`)
**And** each segment is processed as a separate Inngest step: `step.run("segment-{id}-L3", ...)`

**Given** a segment is sent to the L3 model
**When** it performs deep contextual analysis
**Then** the prompt includes: source text, target text, language pair, surrounding context (±2 segments), L1 findings, L2 findings, and relevant glossary terms
**And** the AI performs: semantic accuracy verification, contextual appropriateness, terminology consistency check against glossary, tone/register analysis, and cultural sensitivity assessment
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
**Then** it finishes within 60 seconds (NFR4)

**Given** L3 completes and the final score meets auto-pass criteria
**When** auto-pass evaluation runs
**Then** evaluation occurs only on the final score (all layers complete) (FR22)
**And** auto-pass checks: score >= language pair threshold AND 0 Critical findings AND 0 unresolved Major findings

### Story 3.3: AI Resilience — Fallback, Retry & Partial Results

As a QA Reviewer,
I want AI processing to gracefully handle failures with fallback providers, automatic retries, and preserved partial results,
So that I never lose rule-based findings and can continue working even when AI services are degraded.

**Acceptance Criteria:**

**Given** the primary L2 model (`gpt-4o-mini`) is unavailable or returns errors
**When** the fallback chain activates
**Then** the system automatically tries: (1) pinned version first, (2) latest same provider, (3) fallback provider (`gemini-2.0-flash` for L2)
**And** each fallback attempt is logged with an audit flag: `{ fallback: true, originalProvider, actualProvider, reason }` (FR18)
**And** findings generated by fallback providers include a visual indicator: "⚠ Fallback model" badge

**Given** the primary L3 model (`claude-sonnet-4-5-20250929`) is unavailable
**When** the fallback chain activates
**Then** the system falls back to `gpt-4o` (OpenAI) for L3
**And** findings from fallback models are flagged for confidence recalibration per language pair (FR18)

**Given** an AI API call fails after all fallback attempts are exhausted
**When** the Inngest step encounters a terminal failure
**Then** Inngest retries the step automatically (3 retries with exponential backoff)
**And** if all retries fail, the file status is set to "ai_partial" (not "failed")
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

### Story 3.4: Score Lifecycle & Confidence Display

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
**Then** the previous score is briefly dimmed with a "Recalculating..." badge (500ms debounce on finding changes)
**And** after Inngest recalculation (~1-2s), the new score is pushed via Supabase Realtime
**And** the new score is highlighted briefly to draw attention to the change
**And** the Approve button re-enables only after `scores.score_status` = "calculated" (FR22)

**Given** a reviewer changes a finding status during review (e.g., Reject a finding)
**When** the score needs recalculation
**Then** a `finding.changed` event is emitted after 500ms debounce
**And** the Inngest recalculation runs in serial queue per project (`concurrency: { key: projectId, limit: 1 }`)
**And** during recalculation: previous score shown dimmed, "Recalculating..." badge, Approve button disabled
**And** after completion: new score highlighted, button re-enabled

**Given** the Approve/Auto-pass Server Action is called
**When** the server processes the request
**Then** it must verify `scores.score_status = 'calculated'` server-side before proceeding
**And** if status is "calculating", return `{ success: false, code: 'SCORE_STALE' }` with message "Please wait for score recalculation to complete"

**Given** a file passes auto-pass criteria after all layers complete
**When** auto-pass evaluation runs
**Then** the auto-pass rationale is displayed showing: final score with margin from threshold, finding counts by severity (Critical: 0, Major: X, Minor: Y), riskiest finding summary, and all criteria met checkmarks (FR23)
**And** the rationale is stored in `scores.auto_pass_rationale` (jsonb)

**Given** findings are displayed in the review UI
**When** a finding has a confidence value from AI layers
**Then** the confidence is shown as a badge: High (≥85%, green), Medium (70-84%, yellow), Low (<70%, red)
**And** the confidence thresholds are sourced from `language_pair_configs` for the file's language pair (FR36)
**And** hovering the confidence badge shows: "Confidence: X% (calibrated for EN→TH)" with language pair context

**Given** a finding was generated by a fallback AI model
**When** the finding is displayed
**Then** the confidence badge includes a warning icon and tooltip: "Generated by fallback model — confidence may need recalibration"

### Story 3.5: AI Cost Control, Throttling & Model Pinning

As a PM / Admin,
I want to see AI cost estimates before processing, enforce rate limits and budget constraints on AI usage, and pin specific model versions per project,
So that I can control costs, prevent abuse, and ensure consistent AI behavior across processing runs.

**Acceptance Criteria:**

**Given** a QA Reviewer has selected files and a processing mode
**When** they see the ProcessingModeDialog (from Story 2.6)
**Then** estimated AI costs are displayed per mode:
- Economy (L1+L2): "~$0.40 per 100K words" with estimated cost for selected files based on word count
- Thorough (L1+L2+L3): "~$2.40 per 100K words" with estimated cost for selected files
**And** the estimate is calculated from: (total word count / 100,000) × mode cost rate (FR63)
**And** a comparison note shows: "vs. manual QA: ~$150-300 per 100K words"

**Given** a user triggers AI pipeline processing
**When** the request hits the AI pipeline trigger endpoint
**Then** Upstash rate limiting enforces: 5 requests per 1 minute per user (sliding window) (FR71)
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

---

## Epic 4: Review & Decision Workflow

**Goal:** Reviewers can efficiently review findings using progressive disclosure, perform 7 review actions with keyboard hotkeys, use bulk operations, suppress false positive patterns, and complete file QA in a single pass — the core daily workflow loop.

**FRs covered:** FR24, FR25, FR26, FR27, FR28, FR30, FR31, FR34, FR42, FR76, FR77, FR78, FR79, FR80
**NFRs addressed:** NFR17 (no progress lost on crash), NFR25 (WCAG 2.1 AA), NFR26 (all 7 actions keyboard-reachable), NFR27 (severity icon+text+color), NFR28 (contrast 4.5:1)
**Architecture:** FindingCard (P0), FindingCardCompact (P0), ReviewProgress (P0), Zustand `useReviewStore`, Supabase Realtime for live updates, immutable audit log per action

### Story 4.1: Finding List, Progressive Disclosure & Segment Navigation

As a QA Reviewer,
I want to see findings organized by severity with critical issues expanded first, and navigate directly to any finding's source/target segment in context,
So that I can focus on the most important issues first and review them with full translation context.

**Acceptance Criteria:**

**Given** a file has findings from any completed pipeline layer (L1, L2, or L3)
**When** the QA Reviewer opens the file review view
**Then** findings are displayed in a FindingList (shadcn Data Table) sorted by severity: Critical first, then Major, then Minor
**And** Critical findings are auto-expanded showing full FindingCard detail
**And** Major findings show as collapsed FindingCardCompact rows (severity icon + category + layer badge + preview + confidence)
**And** Minor findings are collapsed under a "Minor (N)" accordion header (FR24)

**Given** the finding list is displayed
**When** the reviewer uses keyboard navigation (J/↓ = next, K/↑ = previous)
**Then** focus moves between findings with visible focus indicator (indigo border)
**And** the detail panel (shadcn Sheet, right side) syncs to show the focused finding's full context
**And** pressing Enter expands a collapsed finding, Esc collapses an expanded finding

**Given** a finding is focused or expanded
**When** the detail panel displays
**Then** it shows: source text with highlighted issue span, target text with highlighted issue span, suggestion text, confidence badge, layer badge (Rule-based/AI), category, and the action button bar (FR25)
**And** surrounding context is shown: ±2 segments above and below the finding's segment for translation context

**Given** the finding list with mixed layer results
**When** L1 results are available but AI is still processing
**Then** L1 findings are displayed immediately
**And** a ReviewProgress component shows dual progress: "Reviewed: 0/14" and "AI: analyzing..." with animated indicator
**And** new AI findings appear in real-time via Supabase Realtime push, inserted at correct severity position

**Given** a finding row in FindingCardCompact format
**When** the reviewer scans it
**Then** they see: severity icon (16px, with color+icon per NFR27), category label, layer badge (blue=Rule, purple=AI), source→target preview (truncated), confidence % (AI only), and quick action icons (Accept/Reject)

**Given** the review view on different screen sizes
**When** viewed at ≥1440px: full 3-column layout (file list | finding list | detail panel)
**When** viewed at ≥1024px: 2-column layout (finding list | detail panel) with file list in dropdown
**When** viewed at <768px: single column with banner "For the best review experience, use a desktop browser"

**Given** accessibility requirements
**When** the finding list renders
**Then** all findings are navigable via keyboard only (no mouse required)
**And** severity uses icon + text + color (never color alone) (NFR27)
**And** contrast ratios meet WCAG 2.1 AA: 4.5:1 normal text, 3:1 large text (NFR28)
**And** focus management follows logical tab order: filter bar → finding list → detail panel → action bar

### Story 4.2: Core Review Actions — Accept, Reject, Flag & Finding States

As a QA Reviewer,
I want to Accept, Reject, or Flag findings using keyboard hotkeys with immediate visual feedback,
So that I can review 300+ findings per day efficiently with a consistent state lifecycle.

**Acceptance Criteria:**

**Given** a finding is focused in the finding list
**When** the reviewer presses `A` (Accept hotkey)
**Then** the finding transitions to "Accepted" state: green-tinted background, strikethrough on finding text
**And** the MQM score recalculates (penalty removed for this finding) via `finding.changed` event (debounced 500ms)
**And** a toast notification confirms: "Finding #14 accepted"
**And** focus auto-advances to the next Pending finding
**And** the action is saved immediately (auto-save, NFR17) with an immutable audit log entry: `{ action: 'accept', finding_id, user_id, timestamp, previous_state }`

**Given** a finding is focused
**When** the reviewer presses `R` (Reject hotkey)
**Then** the finding transitions to "Rejected" state: red-tinted background, dimmed text
**And** the MQM score recalculates (penalty remains — false positive dismissed)
**And** a toast confirms: "Finding #14 rejected"
**And** focus auto-advances to next Pending finding
**And** the rejection is logged for AI training via `feedback_events` table (MVP data collection for Growth self-healing)

**Given** a finding is focused
**When** the reviewer presses `F` (Flag hotkey)
**Then** the finding transitions to "Flagged" state: yellow-tinted background, flag icon
**And** the score impact is "held" (finding stays in score calculation but marked for escalation)
**And** a toast confirms: "Finding #14 flagged for review"
**And** flagged findings are visible to all team members on the project

**Given** the 8-state lifecycle system
**When** any finding transitions between states
**Then** valid states are: Pending, Accepted, Re-accepted, Rejected, Flagged, Noted, Source Issue, Manual (FR76)
**And** each state has defined score impact: Accepted (penalty counts), Rejected/Noted/Source Issue (no penalty), Flagged (penalty held), Manual (penalty counts per assigned severity)
**And** every state transition creates an immutable `review_actions` log entry
**And** the `review_actions` table contains: id, finding_id, file_id, project_id, tenant_id, action_type, previous_state, new_state, user_id, metadata (jsonb), created_at

**Given** the reviewer clicks the Accept/Reject/Flag button (mouse) instead of using a hotkey
**When** the button is clicked
**Then** the same state transition occurs as the keyboard hotkey
**And** buttons show: Accept (green filled), Reject (red filled), Flag (yellow outline)
**And** each button displays its hotkey label: "[A] Accept", "[R] Reject", "[F] Flag"

**Given** a browser crash or accidental page close during review
**When** the reviewer returns to the file
**Then** all previously saved actions are preserved (auto-saved on every action) (NFR17)
**And** the ReviewProgress shows accurate count of reviewed findings
**And** the reviewer can continue from where they left off

### Story 4.3: Extended Actions — Note, Source Issue, Severity Override & Add Finding

As a QA Reviewer,
I want to mark findings as Notes, Source Issues, override severity, and manually add findings,
So that I have full control over the review outcome with nuanced categorization beyond Accept/Reject.

**Acceptance Criteria:**

**Given** a finding is focused
**When** the reviewer presses `N` (Note hotkey)
**Then** the finding transitions to "Noted" state: blue-tinted background, note icon
**And** a note input field appears for optional comment text
**And** the finding has NO MQM score penalty (stylistic observation only) (FR77)
**And** toast confirms: "Finding #14 noted"

**Given** a finding is focused
**When** the reviewer presses `S` (Source Issue hotkey)
**Then** the finding transitions to "Source Issue" state: purple-tinted background, source icon
**And** the finding is reclassified as a source text problem — no translation penalty (FR78)
**And** source issues are tracked separately for reporting (count of source problems per file)
**And** toast confirms: "Finding #14 — source issue"

**Given** a finding is focused
**When** the reviewer selects Severity Override from the context menu (right-click or "..." menu)
**Then** a dropdown appears with options: "Accept as Critical", "Accept as Major", "Accept as Minor"
**And** selecting an option changes the finding's effective severity for MQM calculation (FR79)
**And** the finding shows the original severity crossed out and the new severity: "~~Critical~~ → Minor"
**And** the score recalculates with the overridden severity weight
**And** an override badge is displayed on the finding
**And** the audit log records: `{ action: 'severity_override', original_severity, new_severity, user_id }`

**Given** the reviewer presses `+` (Add Finding hotkey)
**When** the Add Finding dialog opens
**Then** the dialog shows: segment selector (dropdown of all segments), category selector (from taxonomy), severity selector (Critical/Major/Minor), description text field, and suggestion text field (FR80)
**And** the reviewer fills in the details and submits

**Given** a manual finding is submitted
**When** it is created
**Then** the finding is inserted with: layer = "Manual", confidence = null, status = "Manual", a "Manual" badge
**And** the MQM score recalculates including the manual finding's penalty
**And** manual findings are visually distinct (dotted border + "Manual" badge) from system-detected findings

**Given** any extended action is performed
**When** the action saves
**Then** the ReviewProgress component updates: "Reviewed: X/N" increments
**And** all actions are auto-saved immediately (NFR17)
**And** each action creates an immutable audit log entry

### Story 4.4: Bulk Operations & Decision Override

As a QA Reviewer,
I want to bulk accept or reject multiple findings at once and override previous decisions when needed,
So that I can handle large batches of false positives efficiently and correct mistakes without losing audit history.

**Acceptance Criteria:**

**Given** the finding list is displayed
**When** the reviewer uses Shift+Click or Shift+J/K to select multiple findings
**Then** selected findings show a checkbox indicator
**And** a BulkActionBar appears at the bottom: "[X] findings selected | [Bulk Accept] [Bulk Reject] [Clear Selection]"
**And** Ctrl+A selects all visible (filtered) findings

**Given** 3 findings are selected (≤5)
**When** the reviewer clicks "Bulk Accept"
**Then** all 3 findings transition to "Accepted" state immediately (no confirmation dialog)
**And** a single summary toast: "3 findings accepted"
**And** individual per-finding toasts are suppressed
**And** the score recalculates once (not 3 times) after bulk operation completes (FR27)

**Given** 8 findings are selected (>5)
**When** the reviewer clicks "Bulk Reject"
**Then** a confirmation dialog appears: "Reject 8 findings? This will dismiss them as false positives."
**And** the dialog shows a severity breakdown: "2 Critical, 3 Major, 3 Minor"
**And** the reviewer must confirm before the bulk action executes (FR27)

**Given** a bulk operation was just performed
**When** the reviewer presses Ctrl+Z (undo)
**Then** the entire bulk operation is undone atomically (all findings revert to previous state)
**And** undo stack supports up to 20 actions per session
**And** toast confirms: "Undone: bulk reject of 8 findings"

**Given** a finding was previously Accepted
**When** the reviewer changes their decision to Reject (or any other action)
**Then** the finding transitions to the new state
**And** a new immutable audit entry is created (previous entry is NOT modified) (FR28)
**And** an "Override" badge appears on the finding showing it was changed
**And** if the finding was Rejected and is now Accepted again, the state is "Re-accepted" (distinct from first Accept)

**Given** the override history for a finding
**When** the reviewer clicks the "Override" badge or views finding history
**Then** the full decision history is displayed: each action with timestamp, user, and previous→new state
**And** all entries are read-only (immutable audit trail)

**Given** bulk operations and overrides
**When** each action is recorded
**Then** the `review_actions` table captures: batch_id (for bulk operations, null for single), action_type, is_bulk (boolean)
**And** bulk operations share the same batch_id for atomic undo tracking

### Story 4.5: Search, Filter & AI Layer Toggle

As a QA Reviewer,
I want to search and filter findings by severity, type, segment range, and keyword, and toggle AI suggestions on/off,
So that I can quickly find specific issues and focus on rule-based results when needed.

**Acceptance Criteria:**

**Given** the finding list is displayed
**When** the filter bar renders above the list
**Then** filter options are: Severity (All/Critical/Major/Minor), Layer (All/Rule-based/AI), Status (All/Pending/Accepted/Rejected/Flagged), Category (All/Terminology/Consistency/Number/Grammar/...), Confidence (All/High >85%/Medium 70-85%/Low <70%) (FR34)
**And** default filter is: Status = Pending (show unreviewed findings first)

**Given** the reviewer selects filters
**When** filters are applied
**Then** the finding list updates instantly (client-side filtering via Zustand store)
**And** active filters show as removable badge chips above the list
**And** the count updates: "Showing 5 of 28 findings"
**And** filters use AND logic (all conditions must match)

**Given** the reviewer types in the search box
**When** they enter a keyword (e.g., "bank" or "ธนาคาร")
**Then** findings are filtered to those containing the keyword in: source text, target text, description, or suggestion
**And** the matching text is highlighted in the results
**And** search supports both source and target language text (FR34)

**Given** the reviewer presses Ctrl+K
**When** the Command Palette opens
**Then** 3-tier search is available with scope shortcuts: `>` (actions only), `#` (findings only), `@` (files only)
**And** finding search shows: finding number, source→target preview, severity, category
**And** selecting a finding navigates to and focuses it in the finding list

**Given** the reviewer wants to see only rule-based results
**When** they activate "Rule-based only" toggle (or use Layer filter = Rule-based)
**Then** all AI-generated findings (L2, L3) are hidden from the list (FR31)
**And** the score recalculates to show L1-only score with "Rule-based only" badge
**And** the toggle state is clearly visible: "AI suggestions: OFF" indicator
**And** toggling back to "All" restores AI findings and full score

**Given** filter state during a review session
**When** the reviewer switches between files in a batch
**Then** filter state persists per file within the session
**And** returning to a previously viewed file restores its filter state

### Story 4.6: Suppress False Positive Patterns

As a QA Reviewer,
I want the system to detect recurring false positive patterns and offer to suppress them,
So that I don't waste time rejecting the same false positive type repeatedly.

**Acceptance Criteria:**

**Given** the reviewer has rejected 3 or more findings with the same error pattern (same category + similar description)
**When** the 3rd rejection is made
**Then** a toast notification appears: "Pattern detected: '{pattern_name}' (3 rejects) — [Suppress this pattern] [Keep checking]" (FR30)

**Given** the reviewer clicks "Suppress this pattern"
**When** the suppress configuration dialog opens
**Then** the dialog shows:
- Pattern description: preview of what will be suppressed
- Scope: radio buttons — "This file only" / "This language pair (EN→TH)" / "All language pairs"
- Duration: radio buttons — "Until AI accuracy improves" / "Permanently" / "This session only"
**And** default scope is "This language pair"
**And** default duration is "Until AI accuracy improves"

**Given** the reviewer confirms suppression
**When** the pattern is suppressed
**Then** all matching Pending findings in the current file are auto-rejected with a "Suppressed" tag
**And** future findings matching this pattern (based on scope) are auto-rejected on detection
**And** suppressed findings are still logged in `feedback_events` for AI training (MVP data collection)
**And** a toast confirms: "Pattern suppressed — X findings auto-rejected"

**Given** the reviewer clicks "Keep checking"
**When** the toast is dismissed
**Then** no suppression occurs and the pattern detection counter resets
**And** the system will re-detect at the next 3+ rejection threshold

**Given** suppressed patterns exist for a project
**When** an Admin views Settings → AI Learning → Suppressed Patterns
**Then** all active suppressions are listed with: pattern description, scope, duration, created by, created date, match count
**And** each pattern has a "[Re-enable]" button to remove the suppression
**And** re-enabling restores future detection without affecting previously suppressed findings

**Given** a suppression with duration "This session only"
**When** the reviewer's session ends (logout or browser close)
**Then** the suppression is automatically removed
**And** the pattern will be detected again in the next session

### Story 4.7: Add to Glossary from Review

As a QA Reviewer,
I want to add terms to the project glossary directly from the review interface with one click,
So that I can build the glossary organically as I discover terminology issues during review.

**Acceptance Criteria:**

**Given** a finding is focused that involves a terminology issue (category = Terminology or Glossary)
**When** the reviewer clicks "Add to Glossary" button in the finding detail panel
**Then** a pre-filled glossary entry dialog appears with:
- Source term: extracted from the finding's source text highlight
- Target term: extracted from the suggestion or the reviewer can type the correct translation
- Language pair: auto-populated from the file's language pair
- Notes: optional field for usage context
**And** the dialog is pre-filled to minimize typing (1-click goal) (FR42)

**Given** the glossary entry dialog is filled
**When** the reviewer confirms the addition
**Then** the term is added to the project's glossary immediately
**And** a toast confirms: "Added to glossary: '{source}' → '{target}'"
**And** the glossary cache is invalidated so future rule-based checks use the new term
**And** the action is logged in the audit trail

**Given** the term already exists in the project glossary
**When** the reviewer attempts to add a duplicate
**Then** the dialog shows a warning: "Term '{source}' already exists with target '{existing_target}'"
**And** the reviewer can choose: "Update existing" (replace target) or "Cancel"

**Given** a non-terminology finding is focused (e.g., tag error, number mismatch)
**When** the finding detail panel renders
**Then** the "Add to Glossary" button is not shown (only relevant for terminology/glossary findings)

**Given** the reviewer adds a glossary term
**When** other findings in the same file are re-evaluated
**Then** the system does NOT automatically re-run QA (to avoid disrupting the current review)
**And** a subtle note appears: "New glossary term will apply to future QA runs"

---

## Epic 5: Language Intelligence & Non-Native Support

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
**And** results are cached per segment (same segment does not re-request on refocus)
**And** loading state shows a skeleton placeholder while AI generates

**Given** a segment in Thai (no spaces between words)
**When** the back-translation is generated
**Then** the AI correctly handles Thai script including tone markers, particles, and compound words
**And** the contextual explanation notes any cultural adaptation or localization choices

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
**Then** the decision is automatically tagged with "Subject to native audit" badge (FR38)
**And** the tag is stored in the `review_actions` metadata: `{ non_native: true }`
**And** non-native tagged decisions are visually distinct in the audit trail (italic + badge)

**Given** a QA Reviewer flags a segment for native review (press F or "Flag" action)
**When** the segment is flagged
**Then** the flag includes the reviewer's comment explaining why native review is needed (FR29)
**And** the segment appears in the "Flagged for Native Review" queue

**Given** a Native Reviewer logs in and has segments assigned to them
**When** they access a file
**Then** they see ONLY the flagged segments assigned to them — not the full file (scoped access via Supabase RLS) (FR39)
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

## Epic 6: Batch Processing & Team Collaboration

**Goal:** Teams can process multiple files efficiently, assign work to specific reviewers by language pair, set file priorities, and receive notifications — enabling coordinated team QA workflows.

**FRs covered:** FR56, FR57, FR58, FR60
**NFRs addressed:** NFR17 (no progress lost), NFR20 (6-9 concurrent users MVP)
**Architecture:** Supabase Realtime for notifications, file assignment with RLS scoping, priority queue via Inngest

### Story 6.1: File Assignment & Language-Pair Matching

As an Admin or PM,
I want to assign files to specific reviewers filtered by language pair and urgency,
So that work is distributed efficiently to reviewers with the right language expertise.

**Acceptance Criteria:**

**Given** an Admin or PM views a batch of uploaded files
**When** they open the file assignment interface
**Then** they see a ReviewerSelector component showing: available reviewers filtered by language pair compatibility, each reviewer's current workload (files assigned / in progress), and an urgency flag toggle (FR56)
**And** language-pair filtering shows only reviewers whose profile includes the file's target language

**Given** the Admin assigns a file to a reviewer
**When** the assignment is saved
**Then** the file's `assigned_to` field is updated
**And** the assigned reviewer receives a notification: "File '{filename}' assigned to you" (FR60)
**And** the assignment is logged in the audit trail

**Given** a file has an urgency flag set
**When** the file appears in the reviewer's queue
**Then** it is displayed at the top with a red "Urgent" badge
**And** urgent files are processed first in the Inngest queue (priority ordering) (FR58)

**Given** a file is already assigned to a reviewer
**When** another reviewer attempts to open it for review
**Then** a soft lock warning displays: "This file is being reviewed by {name} — last active {time}" (FR57)
**And** the second reviewer can choose: "View read-only" or "Take over" (with notification to original assignee)

**Given** file assignment data
**When** I inspect the database
**Then** the `file_assignments` table contains: id, file_id, project_id, tenant_id, assigned_to, assigned_by, priority (normal/urgent), status (assigned/in_progress/completed), assigned_at, started_at, completed_at

### Story 6.2: Event Notifications & Real-time Updates

As a QA Reviewer,
I want to receive notifications for relevant events like analysis completion, file assignments, and glossary updates,
So that I stay informed and can respond quickly to changes.

**Acceptance Criteria:**

**Given** the notification system is active
**When** any of the following events occur:
- Analysis complete (L1/L2/L3 finished for a file)
- File assigned to reviewer
- Glossary updated for project
- Auto-pass triggered for a file
**Then** relevant users receive notifications via Supabase Realtime push (FR60)
**And** notifications appear as: (1) toast (sonner) for immediate attention, (2) persisted in notification dropdown (bell icon in header)

**Given** a notification is received
**When** the user views the notification dropdown
**Then** notifications are listed chronologically (newest first) with: event type icon, message text, timestamp, and read/unread indicator
**And** clicking a notification navigates to the relevant context (e.g., file review view)
**And** unread count badge shows on the bell icon

**Given** multiple events fire in quick succession (e.g., batch processing completes)
**When** notifications are generated
**Then** similar events are grouped: "Analysis complete for 5 files" instead of 5 individual notifications
**And** grouped notifications expand to show individual items on click

**Given** the notification system
**When** I inspect the database
**Then** the `notifications` table contains: id, user_id, tenant_id, event_type, title, message, metadata (jsonb — link target), is_read, created_at
**And** notifications older than 30 days are auto-archived

---

## Epic 7: Auto-Pass & Trust Automation

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
**Then** it checks: score >= configured threshold (default 95), 0 unresolved Critical findings, 0 unresolved Major findings, required AI layers completed (per project config)
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
**Then** a random sample (configured %) of auto-passed files from the period is selected
**And** selected files are assigned to the audit reviewer with "Blind Audit" badge
**And** the auditor reviews the file without knowing it was auto-passed (blind)
**And** after audit: the auditor's decision is compared with auto-pass — agreement tracked as "audit match rate"

**Given** blind audit results are available
**When** the Admin views the Trust Dashboard
**Then** it shows: audit match rate (% of auto-passed files confirmed by human), false positive rate per language pair over time (FR65 foundation), auto-pass volume trend, and override rate (how often auto-pass is overridden)

**Given** the blind audit reveals auto-pass errors (auditor disagrees with auto-pass)
**When** the error rate exceeds a configurable threshold (default: >10% disagreement)
**Then** an alert is sent to Admin: "Auto-pass accuracy below threshold — consider reverting to recommended-pass"
**And** the alert is logged in the audit trail

**Given** trust metric data
**When** I inspect the database
**Then** the `audit_results` table contains: id, file_id, project_id, tenant_id, audit_type (blind/manual), auditor_id, original_decision (auto_pass), audit_decision (pass/fail), agreement (boolean), notes, created_at

---

## Epic 8: Reporting & Certification

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
**Then** a QA report PDF is generated server-side (Puppeteer/Playwright) containing: file summary (filename, language pair, score, date), finding list grouped by severity, each finding with: category, description, segment reference, reviewer decision, and overall quality assessment
**And** the report uses MQM standard terminology (not internal QA Cosmetic terms) for external audiences (FR46)

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
**And** the certificate is rendered server-side (Puppeteer/Playwright) to handle Thai/CJK text correctly (FR49)
**And** generation completes within 5 seconds

**Given** a decision is overridden on a file that has an exported report
**When** the override is saved
**Then** the previously exported report is marked as "Invalidated — decisions changed after export"
**And** a notification is sent to the report downloader: "Report for '{filename}' has been invalidated due to decision changes"
**And** the invalidated report shows a watermark "SUPERSEDED" if re-opened (FR50)

**Given** any user wants to view the audit trail for a file
**When** they access File → Audit Trail
**Then** a chronological log is displayed showing every action: uploads, parsing, pipeline runs, each finding state change, score calculations, exports, and certificate generations (FR48)
**And** each entry shows: timestamp, user, action type, details, and metadata

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

## Epic 9: AI Learning & Continuous Improvement

**Goal:** System learns from every reviewer decision, tracks false positive rates, displays visible AI improvement over time, and distinguishes between logged and applied feedback — building the data-driven quality moat.

**FRs covered:** FR64, FR65, FR66, FR67
**NFRs addressed:** NFR39 (false positive rate tracked per language pair)
**Architecture:** `feedback_events` table (MVP data collection), time-series tracking, AI learning indicators

### Story 9.1: Structured Feedback Logging & False Positive Tracking

As a PM,
I want every reviewer decision logged as structured AI training data and false positive rates tracked per language pair,
So that we build the data foundation for AI improvement and can measure quality trends.

**Acceptance Criteria:**

**Given** a reviewer makes any decision on a finding (Accept, Reject, Flag, Note, Source Issue, Severity Override)
**When** the action is saved
**Then** a structured feedback event is logged in `feedback_events` table: id, finding_id, file_id, project_id, tenant_id, language_pair, layer (L1/L2/L3), category, original_severity, action_taken, is_false_positive (boolean — true if Rejected), reviewer_is_native (boolean), metadata (jsonb), created_at (FR64)
**And** severity overrides and manual findings are tagged as high-value signals: `{ high_value: true, reason: 'severity_override' }` (FR64)

**Given** feedback events accumulate over time
**When** the false positive rate is calculated per language pair
**Then** the formula is: FP rate = (rejected findings) / (total findings) × 100, calculated per language pair, per layer, rolling 30-day window (FR65)
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
**Then** it shows: patterns learned count (unique categories with >10 feedback events), accuracy trend (improving/stable/declining arrow), total feedback events count, and top 3 categories with most false positives (FR66)

**Given** the accuracy trend over time
**When** comparing current 30-day FP rate vs previous 30-day FP rate
**Then** an arrow indicator shows: ↑ improving (FP rate decreased), → stable (within ±2%), ↓ declining (FP rate increased)
**And** the percentage change is shown: "FP rate: 18% → 14% (↑ improving)"

**Given** a specific language pair (e.g., EN→TH) with high false positive rate
**When** the reviewer views the Language Pair Performance detail
**Then** it shows: FP rate by finding category (terminology, fluency, etc.), most-rejected patterns (potential suppression candidates), and feedback volume with estimated data sufficiency for Growth self-healing ("Need 5,000 events for Assisted Mode — currently at 1,200")

**Given** the AI learning system in MVP
**When** data is displayed
**Then** a clear disclaimer shows: "AI learning data is being collected. Active AI improvement will begin in the Growth phase"
**And** the data collection progress bar shows: "{N} / 1,000 events per language pair for Shadow Mode eligibility"

---

## Epic 10: Rule-based Auto-fix (Growth)

**Goal:** System can auto-fix deterministic errors (tags, placeholders, numbers) with preview and acceptance tracking — transitioning from detection-only to detection-and-correction for mechanical errors.

**FRs covered:** FR73, FR74, FR75
**NFRs addressed:** NFR-SH6 (fix failure does not block QA pipeline)
**Scope:** Growth (Month 3-6). MVP includes schema design only (`fix_suggestions`, `self_healing_config` tables with mode="disabled").
**Architecture:** Extends L1 rule engine with deterministic fix generation, Inngest step for fix application, audit trail per auto-fix

### Story 10.1: Deterministic Auto-fix Engine

As a QA Reviewer,
I want the system to automatically fix deterministic rule-based errors like broken tags, missing placeholders, and number format mismatches,
So that mechanical errors are corrected instantly without manual effort.

**Acceptance Criteria:**

**Given** the rule-based engine (L1) detects a deterministic error during QA processing
**When** the error is fixable with 100% confidence (tag repair, placeholder restore, number format correction, whitespace normalization)
**Then** the system generates a fix suggestion with: original text, fixed text, fix category, confidence (always 100% for deterministic), and explanation
**And** the fix is stored in `fix_suggestions` table: id, finding_id, file_id, project_id, tenant_id, original_text, fixed_text, fix_category, confidence, status (suggested/accepted/rejected/reverted), created_by_layer (L1), created_at (FR73)

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
**And** categories with revert rate > 5% are flagged with a warning: "Consider disabling auto-fix for this category"

**Given** a batch of files is processed with auto-fix enabled
**When** processing completes
**Then** the batch summary shows: "Auto-fixed: X findings (Y tags, Z placeholders, W numbers)"
**And** each auto-fixed finding is visually distinct: green background + "Auto-fixed" badge
**And** the overall fix acceptance rate is displayed

---

## Epic 11: Self-healing Translation (Growth/Vision)

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
**And** XLIFF tags, placeholders (`{0}`, `%s`), and HTML entities in the original are preserved in the fix (constrained decoding)

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
**And** the Judge returns: pass/fail verdict, quality score (0-100), and reasoning per criterion

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
**And** a TrustLevelIndicator component shows: "Shadow Mode — tracking accuracy: X% (need 85% for Assisted)" (FR-SH10)

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
**Then** confidence thresholds per language pair are recalculated using the last 7 days of feedback (minimum 100 new signals required)
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
