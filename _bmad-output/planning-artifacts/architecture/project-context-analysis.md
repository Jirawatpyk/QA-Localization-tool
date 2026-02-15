# Project Context Analysis

### Requirements Overview

**Functional Requirements:**

The project encompasses **80 FRs** (68 MVP + 12 Growth) across 10 categories plus **18 FR-SH** (Self-healing Translation, Growth phase):

| Category | FR Range | Architectural Implication |
|----------|----------|--------------------------|
| File Parsing & Segment Extraction | FR1–FR9 | Requires SDLXLIFF/XLIFF parser (fast-xml-parser) with namespace handling. Supports streaming for large files and Excel bilingual input. |
| Dual Taxonomy & Rule Engine | FR10–FR16 | 3-Layer QA Pipeline (Rule → AI Screening → Deep AI), MQM + Custom taxonomy, configurable severity weights |
| AI/LLM Integration | FR17–FR22 | Vercel AI SDK v6, multi-provider abstraction, context injection across layers, fallback chain with version pinning |
| Scoring & Metrics | FR23–FR30 | MQM formula `Score = max(0, 100 - NPT)` where NPT per 1,000 words, severity weights Critical=25/Major=5/Minor=1, score lifecycle state machine (FR70) |
| Review Workflow | FR31–FR40 | 8 finding states, 7 review actions, auto-pass logic (≥95 + 0 Critical + L2 clean), recommended-pass → true auto-pass progression |
| Glossary & Terminology | FR41–FR45, FR72 | Multi-token glossary matching, case-sensitive/insensitive modes, glossary import/export |
| Language Bridge & Context | FR33, FR46–FR50 | Back-translation display, source/target alignment, collapsible sidebar panel |
| Reporting & Export | FR51–FR60 | PDF/Excel export, per-project and cross-project dashboards, trend analysis |
| Audit Trail & Immutability | FR61–FR69 | Append-only audit log from Day 1, application-level immutability, override creates new entry |
| Score Lifecycle & Auto-pass | FR70–FR72 | State machine for score progression, auto-pass rationale display, multi-token glossary |
| Self-healing Translation | FR-SH1–FR-SH18 | Fix Agent + Judge Agent, RAG pipeline (pgvector), Progressive Trust (Shadow → Assisted → Autonomous), 4-layer fix pipeline |

**Non-Functional Requirements:**

**42 NFRs** + **7 NFR-SH** driving architectural decisions:

| NFR Category | Key Requirements | Architecture Impact |
|-------------|-----------------|---------------------|
| Performance | P95 < 2s rule layer, P95 < 8s AI layer, < 30s full pipeline per 100 segments | Async processing, queue-based AI calls, caching strategy |
| Scalability | 100K words/project, 50 concurrent users, 10 projects/tenant | Multi-tenant isolation, connection pooling, horizontal scaling readiness |
| Security | RBAC (Admin/QA Reviewer/Native Reviewer MVP), RLS policies, immutable audit | Row-Level Security on all tables, tenant_id from Day 1, append-only patterns |
| Reliability | 99.5% uptime, AI fallback chain, graceful degradation | Multi-provider fallback, circuit breaker pattern, offline-capable rule layer |
| Accessibility | WCAG 2.1 AA, keyboard-first navigation | Semantic HTML, ARIA labels, focus management, screen reader support |
| Cost | Economy mode ~$0.40/100K words, Thorough ~$2.40/100K words | Tiered processing (L1+L2 vs L1+L2+L3), token budget management |

**Scale & Complexity:**

- Primary domain: **Full-stack Web Application**
- Complexity level: **High** — domain-specific QA pipeline, multi-layer AI integration, real-time processing, multi-tenancy
- Estimated architectural components: **~15–20 major components** (parser, rule engine, AI orchestrator, scoring engine, review workflow, audit system, auth/RBAC, file storage, queue, realtime, glossary, reporting, export, dashboard, self-healing pipeline)

### Technical Constraints & Dependencies

**Technology Stack (from PRD & Research):**

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Framework | Next.js (App Router) | RSC for performance, API routes for backend, Vercel deployment |
| UI | shadcn/ui + Tailwind CSS | 16 base + 14 custom + 2 Party Mode components (ReviewerSelector, PM Onboarding), Indigo primary (#4F46E5), Inter font |
| Backend/DB | Supabase (Auth + PostgreSQL + Storage + Realtime) | Multi-tenant RLS, pgvector for RAG, real-time subscriptions |
| ORM | Drizzle ORM | Type-safe queries, migration management |
| Queue | Inngest | Durable functions, retry logic, fan-out for AI pipeline |
| AI SDK | Vercel AI SDK v6 | Multi-provider abstraction, streaming, structured output |
| File Parsing | fast-xml-parser | SDLXLIFF/XLIFF parsing with namespace support |
| CJK/Thai | Intl.Segmenter API | Word boundary detection for non-space-delimited languages |

**Key Constraints:**

1. **Single-Pass Completion** — 5 pillars: zero re-upload, inline editing, persistent state, keyboard-first, batch operations
2. **Multi-tenancy from Day 1** — tenant_id on all tables, RLS policies written but not enforced in MVP
3. **Immutable Audit Trail from Day 1** — append-only, no edits/deletes on audit records
4. **Economy mode vs Thorough mode** — user-selectable processing depth affects cost and latency
5. **SDLXLIFF as Primary Format** — Trados ecosystem, XLIFF 1.2 uses same parser (SDLXLIFF is superset)
6. **3-Layer Pipeline Architecture** — each layer must be independently testable and bypassable
7. **Progressive Trust for Self-healing** — Shadow → Assisted → Autonomous with kill criteria

### Cross-Cutting Concerns Identified

1. **Multi-tenancy Isolation** — tenant_id permeates every table, query, and API call; RLS enforcement strategy needed
2. **Audit Trail Consistency** — every state change across all modules must produce append-only audit entries
3. **AI Cost Management** — token budgets, provider fallback costs, Economy mode vs Thorough mode routing
4. **Error Handling & Fallback** — AI provider failures, parser errors, queue failures all need graceful degradation
5. **CJK/Thai Language Handling** — word segmentation, character counting, and confidence calibration affect parser, rule engine, and AI layers
6. **Real-time State Synchronization** — review progress, score updates, and finding state changes must propagate via Supabase Realtime
7. **File Processing Pipeline** — upload → parse → extract segments → queue for QA → aggregate results; must handle large files without memory issues
8. **RBAC Enforcement** — role-based access control must be consistently applied across UI, API, and database layers
9. **Score Calculation Atomicity** — MQM scoring across 3 layers with recalculation must prevent race conditions (FR70 handoff)
10. **Configuration Management** — per-tenant and per-project settings for taxonomy weights, AI thresholds, auto-pass criteria, glossaries

### Architecture Handoff Items (from PRD Validation)

These 8 items were explicitly flagged for resolution in this Architecture Document:

| # | Item | Source | Decision Needed |
|---|------|--------|-----------------|
| 1 | FR18/FR69 priority: version pinning vs fallback availability | PRD Validation Round 3 | Define priority order when pinned version unavailable |
| 2 | FR70 score recalculation atomicity | PRD Validation Round 3 | Prevent race conditions between pipeline layers |
| 3 | FR72 substring fallback logging | PRD Validation Round 3 | Log as "degraded matching mode" for audit trail |
| 4 | RLS enforcement strategy | PRD Validation Round 3 | Write-but-not-enforce (MVP) vs enforce from Day 1 |
| 5 | Immutable audit log DB mechanism | PRD Validation Round 3 | Triggers vs write-only RLS vs separate table |
| 6 | SDLXLIFF parser memory strategy | PRD Validation Round 3 | DOM vs streaming for large files |
| 7 | Uptime monitoring tool selection | PRD Validation Round 3 | Tool selection for 99.5% SLA tracking |
| 8 | AI fallback chaos testing approach | PRD Validation Round 3 | Testing strategy for multi-provider failover |
