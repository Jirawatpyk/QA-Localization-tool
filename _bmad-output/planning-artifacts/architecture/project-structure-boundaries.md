# Project Structure & Boundaries

### Complete Project Directory Structure

```
qa-localization-tool/
├── .github/
│   └── workflows/
│       ├── quality-gate.yml              # Every PR: lint, type-check, test, rls-test, build
│       ├── e2e-gate.yml                  # Merge to main: Playwright critical paths
│       └── chaos-test.yml                # Weekly: AI fallback chaos test
├── .env.example                          # All env keys with descriptions
├── .eslintrc.json
├── .gitignore
├── .prettierrc
├── drizzle.config.ts                     # Drizzle Kit configuration
├── next.config.ts                        # Next.js 16 (Turbopack, React Compiler)
├── package.json
├── playwright.config.ts
├── tsconfig.json                         # strict + noUncheckedIndexedAccess
├── vitest.config.ts                      # Base Vitest config
├── vitest.workspace.ts                   # Separate unit (jsdom) + rls (node) projects
│
├── e2e/                                  # Playwright E2E tests
│   ├── review-workflow.spec.ts           # E1+E3
│   ├── pipeline.spec.ts                  # E2
│   ├── multi-tenancy.spec.ts             # E4
│   └── fixtures/
│       └── sample.sdlxliff
│
├── public/
│   └── fonts/                            # Inter, JetBrains Mono
│
├── supabase/                             # Supabase local development
│   ├── config.toml
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_rls_policies.sql          # RLS for critical tables
│   │   ├── 003_audit_trigger.sql         # DELETE/UPDATE block on audit_logs
│   │   └── 004_auth_hooks.sql            # Role sync webhook function
│   └── seed.sql
│
└── src/
    ├── app/                              # Next.js App Router
    │   ├── globals.css                   # Tailwind v4 @theme imports
    │   ├── layout.tsx                    # Root (fonts, metadata, Toaster/sonner)
    │   ├── loading.tsx
    │   ├── error.tsx
    │   ├── not-found.tsx
    │   │
    │   ├── (auth)/
    │   │   ├── login/page.tsx
    │   │   ├── signup/page.tsx
    │   │   └── callback/route.ts
    │   │
    │   ├── (app)/
    │   │   ├── layout.tsx                # App shell (sidebar, header)
    │   │   ├── loading.tsx
    │   │   ├── error.tsx                 # App-level error boundary (R48)
    │   │   │
    │   │   ├── projects/
    │   │   │   ├── page.tsx              # Project list (Server)
    │   │   │   ├── loading.tsx
    │   │   │   ├── new/page.tsx
    │   │   │   └── [projectId]/
    │   │   │       ├── page.tsx          # Project detail (Server)
    │   │   │       ├── loading.tsx
    │   │   │       ├── error.tsx         # Project-level error boundary (R48)
    │   │   │       ├── files/page.tsx
    │   │   │       ├── settings/page.tsx
    │   │   │       ├── glossary/page.tsx
    │   │   │       └── review/
    │   │   │           ├── page.tsx
    │   │   │           ├── loading.tsx
    │   │   │           └── [sessionId]/page.tsx
    │   │   │
    │   │   ├── dashboard/
    │   │   │   ├── page.tsx
    │   │   │   └── loading.tsx
    │   │   │
    │   │   └── admin/
    │   │       ├── page.tsx
    │   │       ├── users/page.tsx
    │   │       └── settings/page.tsx
    │   │
    │   └── api/
    │       ├── inngest/route.ts          # Inngest serve (imports function registry)
    │       ├── health/route.ts           # DB + Auth + Inngest check, no-store
    │       └── webhooks/
    │           └── supabase/route.ts     # Auth webhook (role sync)
    │
    ├── components/                       # Shared/global components
    │   ├── ui/                           # shadcn/ui base (16+3 shared custom)
    │   │   ├── button.tsx
    │   │   ├── input.tsx
    │   │   ├── dialog.tsx
    │   │   ├── dropdown-menu.tsx
    │   │   ├── table.tsx
    │   │   ├── badge.tsx
    │   │   ├── skeleton.tsx
    │   │   ├── tooltip.tsx
    │   │   ├── status-badge.tsx          # Finding status (8 states) — shared (R49)
    │   │   ├── progress-ring.tsx         # Circular progress — shared (R49)
    │   │   ├── empty-state.tsx           # Empty state with illustration + CTA (R49)
    │   │   └── ...
    │   └── layout/
    │       ├── app-sidebar.tsx
    │       ├── app-header.tsx
    │       ├── page-header.tsx
    │       └── compact-layout.tsx        # 0.75x density wrapper
    │
    ├── features/                         # Feature modules
    │   ├── review/                       # FR31-FR40
    │   │   ├── components/
    │   │   │   ├── ReviewPanel.tsx                # "use client" entry
    │   │   │   ├── ReviewPanel.test.tsx
    │   │   │   ├── SegmentViewer.tsx
    │   │   │   ├── SegmentViewer.test.tsx
    │   │   │   ├── FindingCard.tsx
    │   │   │   ├── FindingCard.test.tsx
    │   │   │   ├── FindingList.tsx
    │   │   │   ├── FindingFilter.tsx              # Filter by severity/status/category (R49)
    │   │   │   ├── ScoringPanel.tsx
    │   │   │   ├── ReviewActions.tsx
    │   │   │   ├── LanguageBridge.tsx              # FR33
    │   │   │   ├── SegmentNavigator.tsx            # J/K nav UI indicator (R49)
    │   │   │   ├── BatchActions.tsx                # Bulk accept/reject toolbar (R49)
    │   │   │   ├── CommentThread.tsx               # Finding comments (R49)
    │   │   │   └── SeveritySelector.tsx            # Severity picker (R49)
    │   │   ├── actions/
    │   │   │   ├── updateFinding.action.ts
    │   │   │   ├── updateFinding.action.test.ts
    │   │   │   ├── submitReview.action.ts
    │   │   │   └── overrideScore.action.ts
    │   │   ├── hooks/
    │   │   │   ├── useKeyboardShortcuts.ts
    │   │   │   ├── useKeyboardShortcuts.test.ts
    │   │   │   └── useRealtimeFindings.ts
    │   │   ├── stores/
    │   │   │   ├── review.store.ts
    │   │   │   └── review.store.test.ts
    │   │   └── validation/                        # Feature-level form validation (R47)
    │   │       └── findingSchema.ts
    │   │
    │   ├── pipeline/                     # FR10-FR22
    │   │   ├── components/
    │   │   │   ├── PipelineStatus.tsx
    │   │   │   ├── PipelineConfig.tsx
    │   │   │   └── LayerProgress.tsx
    │   │   ├── actions/
    │   │   │   ├── startPipeline.action.ts
    │   │   │   └── cancelPipeline.action.ts
    │   │   ├── inngest/
    │   │   │   ├── index.ts                       # Function registry — exports all (R44)
    │   │   │   ├── orchestrator.ts
    │   │   │   ├── orchestrator.test.ts
    │   │   │   ├── batchWorker.ts
    │   │   │   ├── batchWorker.test.ts
    │   │   │   └── scoreRecalculator.ts
    │   │   ├── layers/
    │   │   │   ├── ruleLayer.ts
    │   │   │   ├── ruleLayer.test.ts
    │   │   │   ├── aiScreeningLayer.ts
    │   │   │   ├── aiScreeningLayer.test.ts
    │   │   │   ├── deepAiLayer.ts
    │   │   │   └── deepAiLayer.test.ts
    │   │   └── stores/
    │   │       └── pipeline.store.ts
    │   │
    │   ├── parser/                       # FR1-FR9
    │   │   ├── sdlxliffParser.ts
    │   │   ├── sdlxliffParser.test.ts
    │   │   ├── excelParser.ts
    │   │   ├── excelParser.test.ts
    │   │   ├── segmentExtractor.ts
    │   │   ├── segmentExtractor.test.ts
    │   │   ├── namespaceHandler.ts
    │   │   └── constants.ts              # MAX_FILE_SIZE_BYTES (15MB)
    │   │
    │   ├── scoring/                      # FR23-FR30, FR70
    │   │   ├── components/
    │   │   │   ├── ScoreDisplay.tsx
    │   │   │   └── AutoPassIndicator.tsx
    │   │   ├── mqmCalculator.ts
    │   │   ├── mqmCalculator.test.ts
    │   │   └── scoreLifecycle.ts
    │   │
    │   ├── glossary/                     # FR41-FR45, FR72
    │   │   ├── components/
    │   │   │   ├── GlossaryEditor.tsx
    │   │   │   ├── GlossaryEditor.test.tsx
    │   │   │   └── TermList.tsx
    │   │   ├── actions/
    │   │   │   ├── importGlossary.action.ts
    │   │   │   └── updateTerm.action.ts
    │   │   ├── multiTokenMatcher.ts
    │   │   └── multiTokenMatcher.test.ts
    │   │
    │   ├── taxonomy/                     # FR10-FR16
    │   │   ├── components/
    │   │   │   └── TaxonomyConfig.tsx
    │   │   ├── actions/
    │   │   │   └── updateTaxonomy.action.ts
    │   │   └── severityWeights.ts
    │   │
    │   ├── dashboard/                    # FR51-FR60
    │   │   ├── components/
    │   │   │   ├── ScoreChart.tsx
    │   │   │   ├── TrendGraph.tsx
    │   │   │   ├── ProjectSummary.tsx
    │   │   │   └── ExportButton.tsx
    │   │   └── actions/
    │   │       └── exportReport.action.ts
    │   │
    │   ├── audit/                        # FR61-FR69
    │   │   ├── auditLogger.ts
    │   │   ├── auditLogger.test.ts
    │   │   └── components/
    │   │       └── AuditTrail.tsx
    │   │
    │   ├── project/
    │   │   ├── components/
    │   │   │   ├── ProjectCard.tsx
    │   │   │   ├── ProjectSettings.tsx
    │   │   │   └── FileUpload.tsx
    │   │   └── actions/
    │   │       ├── createProject.action.ts
    │   │       └── uploadFile.action.ts
    │   │
    │   └── admin/
    │       ├── components/
    │       │   ├── UserManagement.tsx
    │       │   └── RoleAssignment.tsx
    │       └── actions/
    │           └── updateUserRole.action.ts
    │
    ├── lib/                              # Shared utilities
    │   ├── env.ts                        # Zod-validated env access (R35)
    │   ├── logger.ts                     # pino configuration (Node.js runtime)
    │   ├── logger-edge.ts                # Structured JSON logger (Edge Runtime)
    │   ├── utils.ts                      # cn(), general utilities
    │   ├── constants.ts                  # App-wide constants
    │   ├── cache/                        # Cache isolation layer
    │   │   ├── glossaryCache.ts          # "use cache" + cacheTag for glossary
    │   │   └── taxonomyCache.ts          # "use cache" + cacheTag for taxonomy
    │   ├── supabase/                     # Client factories (R36)
    │   │   ├── server.ts                 # Server Component/Action client
    │   │   ├── client.ts                 # Browser client
    │   │   └── admin.ts                  # Admin/service role (server-only)
    │   ├── inngest/                      # Inngest client (R44)
    │   │   ├── client.ts                 # Inngest client instance
    │   │   └── index.ts                  # Re-export
    │   ├── auth/                         # Auth helpers (R45)
    │   │   ├── requireRole.ts            # Server-side role check (M3)
    │   │   ├── requireRole.test.ts
    │   │   ├── getCurrentUser.ts         # Get user + tenant from session
    │   │   └── getCurrentUser.test.ts
    │   ├── ai/
    │   │   ├── providers.ts              # Multi-provider config
    │   │   ├── fallbackChain.ts          # Version pin + fallback
    │   │   ├── fallbackChain.test.ts
    │   │   └── costTracker.ts            # Token + cost logging (R30)
    │   └── language/
    │       ├── segmenter.ts              # Intl.Segmenter (CJK/Thai)
    │       ├── segmenter.test.ts
    │       └── rules/
    │           ├── index.ts
    │           ├── thai.ts
    │           ├── japanese.ts
    │           ├── chinese.ts
    │           └── korean.ts
    │
    ├── db/                               # Database layer (Drizzle)
    │   ├── index.ts                      # Drizzle client export
    │   ├── connection.ts                 # DB connection config (R46)
    │   ├── schema/
    │   │   ├── index.ts                  # Re-export all schemas
    │   │   ├── tenants.ts
    │   │   ├── users.ts
    │   │   ├── projects.ts
    │   │   ├── files.ts
    │   │   ├── segments.ts
    │   │   ├── findings.ts
    │   │   ├── scores.ts
    │   │   ├── reviewSessions.ts
    │   │   ├── glossaries.ts
    │   │   ├── taxonomies.ts
    │   │   ├── auditLogs.ts
    │   │   ├── userRoles.ts
    │   │   ├── feedbackEvents.ts            # MVP: Review feedback for Growth ML training
    │   │   ├── languagePairConfigs.ts       # Per-language thresholds (Decision 3.6)
    │   │   └── relations.ts
    │   ├── migrations/                   # Drizzle-generated SQL
    │   ├── helpers/
    │   │   └── withTenant.ts             # Tenant filter helper
    │   ├── validation/
    │   │   ├── base.ts                   # drizzle-zod generated
    │   │   └── extended.ts               # Custom Zod extensions
    │   └── __tests__/
    │       └── rls/
    │           ├── findings.rls.test.ts
    │           ├── projects.rls.test.ts
    │           ├── auditLogs.rls.test.ts
    │           └── glossaries.rls.test.ts
    │
    ├── stores/                           # Global Zustand stores
    │   ├── ui.store.ts
    │   └── keyboard.store.ts             # Cross-feature shortcuts (R17)
    │
    ├── styles/
    │   ├── tokens.css                    # Design system CSS properties (R22)
    │   └── animations.css                # Shared transitions (R22)
    │
    ├── test/                             # Shared test utilities
    │   ├── factories.ts                  # Test data factories (R42)
    │   ├── setup.ts                      # Global test setup
    │   ├── helpers.ts                    # Shared test helpers
    │   ├── mocks/                        # Standardized mocks (R50)
    │   │   ├── supabase.ts              # Mock Auth, Realtime, DB
    │   │   ├── inngest.ts               # Mock step.run, events
    │   │   ├── ai-providers.ts          # Mock OpenAI/Anthropic
    │   │   └── fast-xml-parser.ts       # Mock parser
    │   └── fixtures/                     # Test data files (R51)
    │       ├── segments/
    │       │   ├── simple.json
    │       │   ├── with-findings.json
    │       │   └── cjk-thai.json
    │       ├── sdlxliff/
    │       │   ├── minimal.sdlxliff
    │       │   └── with-namespaces.sdlxliff
    │       └── glossary/
    │           └── sample-terms.json
    │
    ├── types/                            # Shared TypeScript types
    │   ├── index.ts
    │   ├── finding.ts
    │   ├── review.ts
    │   ├── pipeline.ts
    │   └── actionResult.ts              # ActionResult<T> (R11)
    │
    └── middleware.ts                     # Edge: auth + tenant + rate limit
```

### Requirements to Structure Mapping

| FR Category | Feature Module | Key Files |
|-------------|---------------|-----------|
| FR1-FR9: File Parsing | `features/parser/` | sdlxliffParser, excelParser, segmentExtractor |
| FR10-FR16: Dual Taxonomy | `features/taxonomy/` + `features/pipeline/layers/ruleLayer` | TaxonomyConfig, severityWeights, ruleLayer |
| FR17-FR22: AI/LLM | `features/pipeline/layers/` + `lib/ai/` | aiScreeningLayer, deepAiLayer, fallbackChain |
| FR23-FR30: Scoring | `features/scoring/` | mqmCalculator, scoreLifecycle, ScoreDisplay |
| FR31-FR40: Review | `features/review/` | ReviewPanel, FindingCard, keyboard shortcuts |
| FR41-FR45, FR72: Glossary | `features/glossary/` | GlossaryEditor, multiTokenMatcher |
| FR46-FR50: Language Bridge | `features/review/components/LanguageBridge` | LanguageBridge |
| FR51-FR60: Reporting | `features/dashboard/` | ScoreChart, TrendGraph, exportReport |
| FR61-FR69: Audit | `features/audit/` + `db/schema/auditLogs` | auditLogger, AuditTrail |
| FR70-FR72: Score Lifecycle | `features/scoring/` + `features/pipeline/inngest/` | scoreLifecycle, scoreRecalculator |
| FR-SH1-18: Self-healing | `features/self-healing/` (Growth — future) | fixAgent, judgeAgent, ragPipeline |
| Feedback Data (Growth foundation) | `db/schema/feedbackEvents.ts` + review actions | feedbackEvents table, collected in MVP |
| Language-pair Config | `db/schema/languagePairConfig.ts` | Per-language thresholds, word segmenter config |

### Cross-Cutting Concern Mapping

| Concern | Primary Files |
|---------|--------------|
| Multi-tenancy | `db/helpers/withTenant.ts`, `middleware.ts`, `supabase/migrations/002_rls_policies.sql` |
| Authentication | `middleware.ts`, `lib/supabase/server.ts`, `lib/auth/`, `app/(auth)/` |
| RBAC | `db/schema/userRoles.ts`, `lib/auth/requireRole.ts`, M3 in Server Actions |
| Audit Trail | `features/audit/auditLogger.ts` — called from every Server Action |
| AI Cost Tracking | `lib/ai/costTracker.ts` — logged in every pipeline layer |
| CJK/Thai | `lib/language/segmenter.ts` — used by parser + rule layer + scoring |
| Error Boundaries | `app/error.tsx`, `app/(app)/error.tsx`, `app/(app)/projects/[projectId]/error.tsx` |

### Architectural Boundaries

**Data Flow:**
```
Upload → Parser → Segments (DB)
                       ↓
              Inngest Orchestrator (reads project config: Economy/Thorough)
                    ↓          ↓          ↓
               Batch 1      Batch 2    Batch N   (grouped by language pair)
                 ↓ per segment
              L1 (Rules) → L2 (AI Screen) → L3 (Deep AI, if Thorough)
                 ↓
              Findings (DB) → Score Aggregation (atomic)
                 ↓
              Supabase Realtime → Zustand Store → UI
                 ↓
              Review Actions → finding.changed event → Score Recalculation
                 ↓
              Audit Log (append-only, defense-in-depth)
```

**Integration Points:**

| External Service | Integration Files | Purpose |
|-----------------|------------------|---------|
| Supabase Auth | `lib/supabase/`, `middleware.ts`, `lib/auth/` | Authentication, JWT, RBAC |
| Supabase DB | `db/index.ts` (Drizzle), `db/connection.ts` | Data persistence |
| Supabase Storage | `features/project/actions/uploadFile` | File storage |
| Supabase Realtime | `features/*/hooks/useRealtime*` | Live updates |
| Inngest | `app/api/inngest/route.ts`, `lib/inngest/client.ts`, `features/pipeline/inngest/` | Queue |
| OpenAI / Anthropic | `lib/ai/providers.ts`, `lib/ai/fallbackChain.ts` | AI analysis |
| Better Stack | External config (no code files) | Uptime monitoring |
| Vercel | `next.config.ts`, deployment config | Hosting, analytics |

### Vitest Workspace Configuration

```typescript
// vitest.workspace.ts
export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['src/**/*.test.{ts,tsx}'],
      exclude: ['src/db/__tests__/**'],
      environment: 'jsdom',
    }
  },
  {
    test: {
      name: 'rls',
      include: ['src/db/__tests__/rls/**/*.test.ts'],
      environment: 'node',
    }
  }
])
```
