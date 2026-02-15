# Requirements Inventory

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
- FR11: System can calculate quality score per file using MQM-aligned formula: Score = max(0, 100 - NPT) where NPT = Normalized Penalty Total per 1,000 words. Severity weights: Critical=25, Major=5, Minor=1. Edge cases: word count 0 = score N/A, CJK/Thai/Korean word count via Intl.Segmenter, score recalculates after each layer, multi-segment findings count penalty once
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
- FR43: System can match glossary terms in no-space languages (TH, ZH, JA) and compound-splitting languages (KO) using Hybrid approach: substring search + Intl.Segmenter boundary validation + NFKC normalization (per Architecture Decision 5.6, Research Spike 2026-02-15)
- FR44: System can match multi-token glossary terms in no-space and compound-splitting languages with fallback to substring matching
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

#### 10. AI-to-Rule Promotion — MVP Foundation + Growth (FR81-FR84)
- FR81: System shall aggregate AI finding acceptance stats per pattern (error_type + language_pair). Flag as "promotion candidate" when ≥95% acceptance rate + ≥50 occurrences. MVP scope: data collection only (no UI)
- FR82: System shall present promotion candidates to Admin with stats, sample findings, language pairs, and one-click Approve/Reject. Growth scope (Epic 10)
- FR83: Promoted rules maintain full traceability: source_finding_ids[], acceptance_rate, occurrence_count, promoted_at, promoted_by, original_ai_layer. Immutable. Growth scope (Epic 10)
- FR84: System monitors promoted rule accuracy weekly. Alert <90%, auto-demote <80% with Admin notification. Growth scope (Epic 10)

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
- NFR8: Reject files > 15MB with clear error (Architecture Decision 1.6)

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
