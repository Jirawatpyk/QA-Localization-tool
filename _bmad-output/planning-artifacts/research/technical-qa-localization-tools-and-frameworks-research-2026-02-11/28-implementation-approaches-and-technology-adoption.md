# 28. Implementation Approaches and Technology Adoption

### MVP Implementation Roadmap

#### Phase 1: Foundation (Week 1-2)

| Task | Details | Outcome |
|------|---------|---------|
| **Project setup** | `npx create-next-app@latest` with Next.js 16, TypeScript, Tailwind, App Router | Boilerplate ready |
| **Supabase setup** | Create project, install CLI, `supabase init`, configure local dev | Local Supabase running |
| **Auth integration** | Supabase Auth + Google OAuth, `proxy.ts` auth gate, `@supabase/ssr` | Login/logout working |
| **DB schema** | Drizzle schema for users, teams, projects, jobs, issues | Tables + RLS policies |
| **UI foundation** | Install shadcn/ui, create layout, sidebar, navigation | Base UI shell |

#### Phase 2: Core QA Engine (Week 3-5)

| Task | Details | Outcome |
|------|---------|---------|
| **XLIFF parser** | `xliff` npm integration, file upload to Supabase Storage | Parse + store working |
| **Rule-based checks** | Placeholder, tag, number, length validation rules | Layer 1 QA running |
| **Inngest setup** | Durable workflow for QA pipeline, step functions | Background processing |
| **AI screening** | GPT-4o-mini integration via AI SDK v6, batch segments | Layer 2 screening |
| **Deep analysis** | Claude Sonnet integration, `Output.object()` for structured results | Layer 3 deep QA |
| **Score aggregation** | Combine rule + AI results, calculate overall score (0-100) | Scoring system |

#### Phase 3: Dashboard & UX (Week 6-7)

| Task | Details | Outcome |
|------|---------|---------|
| **Project dashboard** | List projects, create new, upload XLIFF | Project management |
| **Real-time progress** | Supabase Realtime subscription for job status | Live progress bar |
| **Results view** | Issue list, severity filters, segment-level detail | QA results display |
| **Score visualization** | Overall score, category breakdown, charts | Visual QA report |

#### Phase 4: Polish & Launch (Week 8)

| Task | Details | Outcome |
|------|---------|---------|
| **Error handling** | Graceful failures, retry UI, error boundaries | Robust UX |
| **Testing** | Vitest unit tests, Playwright E2E for critical flows | Test coverage |
| **Deploy** | Vercel production, Supabase production, Inngest production | Live MVP |

_Total estimated MVP development: ~8 weeks for a solo developer_

### Development Workflow

#### Local Development Setup

```bash
# 1. Clone & install
git clone <repo> && cd qa-localization-tool
npm install

# 2. Start Supabase local stack
npx supabase start
# → Local Supabase: http://localhost:54323 (Studio Dashboard)
# → Local DB: postgresql://postgres:postgres@localhost:54322/postgres
# → Local Auth: http://localhost:54321/auth/v1

# 3. Push Drizzle schema to local DB
npx drizzle-kit push

# 4. Start Inngest dev server
npx inngest-cli@latest dev

# 5. Start Next.js dev server
npm run dev
# → App: http://localhost:3000
# → Inngest dashboard: http://localhost:8288
```

**Key workflow benefits**:
- **Full local stack**: No cloud dependency during development
- **Supabase Studio**: Visual DB management, SQL editor, auth testing at `localhost:54323`
- **Inngest Dev Server**: Test workflows locally with event replay
- **Hot reload**: Turbopack provides sub-second refresh

_Source: [Supabase Local Development](https://supabase.com/docs/guides/local-development/overview), [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)_

#### Database Migration Workflow

```
Developer makes schema change
       ↓
[Option A: Code-first]
  drizzle-kit generate → creates SQL migration file
       ↓
[Option B: Dashboard-first]
  Make changes in Supabase Studio → supabase db diff → creates migration file
       ↓
supabase/migrations/YYYYMMDDHHMMSS_description.sql
       ↓
git commit → push to GitHub
       ↓
CI: supabase db push (staging) → verify → supabase db push (production)
```

**Best practice**: Use Drizzle for schema definition (code-first), but use `supabase db diff` to capture RLS policies and Supabase-specific features that Drizzle doesn't manage.

_Source: [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Drizzle Migrations](https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase)_

### Testing Strategy

#### Testing Pyramid for QA Localization Tool

```
        ┌───────────┐
        │    E2E    │  Playwright (3-5 critical flows)
        │  (少量)    │  Upload → Analyze → View Results
        ├───────────┤
        │Integration│  Vitest + Supabase local
        │  (中量)    │  API routes, Server Actions, RLS
        ├───────────┤
        │   Unit    │  Vitest (fast, many)
        │  (大量)    │  Rules engine, parsers, scoring
        └───────────┘
```

#### Layer-by-Layer Testing Approach

| Layer | Tool | What to Test | Priority |
|-------|------|-------------|----------|
| **Rule-based checks** | Vitest | Each rule independently (placeholder, tags, numbers) | High — deterministic, easy to test |
| **XLIFF parser** | Vitest | Parse various XLIFF 1.2/2.0 files, edge cases, malformed XML | High — critical path |
| **Score aggregation** | Vitest | Score calculation, weighting, category breakdown | High — business logic |
| **AI screening** | Vitest + mocks | Mock AI SDK responses, test prompt construction, result parsing | Medium — nondeterministic outputs |
| **AI deep analysis** | Vitest + mocks | Mock Claude responses, test structured output parsing | Medium — nondeterministic |
| **Inngest workflow** | Inngest test utilities | Test step execution order, retry behavior, error handling | Medium — integration |
| **RLS policies** | Supabase local + pgTAP | Test data isolation, cross-user access prevention | High — security critical |
| **Auth flow** | Playwright | Google OAuth login, session persistence, logout | High — E2E |
| **Upload → Results** | Playwright | Full flow: upload XLIFF → wait for analysis → view results | High — E2E |

#### AI/LLM Testing Strategy

For the AI layers, testing requires a different approach than traditional software:

**1. Prompt regression testing**: Maintain a set of "golden" XLIFF segments with known issues. After any prompt change, run the same segments through the AI and compare results:

```typescript
// tests/ai/prompt-regression.test.ts
import { describe, it, expect } from 'vitest';

const goldenTestCases = [
  {
    source: 'Click {button_name} to continue',
    target: 'คลิก เพื่อดำเนินการต่อ', // Missing placeholder
    expectedIssue: 'missing_placeholder',
  },
  {
    source: 'Save 50% today!',
    target: 'ประหยัด 50% วันนี้!',
    expectedIssue: null, // Should pass
  },
];

describe('AI QA prompt regression', () => {
  goldenTestCases.forEach((tc, i) => {
    it(`case ${i}: detects ${tc.expectedIssue ?? 'no issues'}`, async () => {
      const result = await runAIScreening(tc.source, tc.target);
      if (tc.expectedIssue) {
        expect(result.issues).toContainEqual(
          expect.objectContaining({ category: tc.expectedIssue })
        );
      } else {
        expect(result.issues).toHaveLength(0);
      }
    });
  });
});
```

**2. Evaluation metrics**: Track AI performance over time:
- **Precision**: % of flagged issues that are real issues (avoid false positives)
- **Recall**: % of real issues that are caught (avoid false negatives)
- **Consistency**: Same input produces similar results across runs

**3. Cost tracking tests**: Assert that token usage stays within budget per batch.

_Source: [LLM Testing Strategies 2026](https://www.confident-ai.com/blog/llm-testing-in-2024-top-methods-and-strategies), [LLM Prompt Evaluation Guide](https://www.keywordsai.co/blog/prompt_eval_guide_2025), [Testing LLM Applications](https://langfuse.com/blog/2025-10-21-testing-llm-applications), [Vitest + Next.js](https://nextjs.org/docs/app/guides/testing/vitest), [Playwright + Next.js](https://nextjs.org/docs/pages/guides/testing/playwright)_

### CI/CD Pipeline

```
┌──────────────────────────────────────────────────────────┐
│                   GitHub Actions CI/CD                   │
│                                                          │
│  On PR:                                                  │
│  ┌────────────────────────────────────────────────┐      │
│  │ Job 1: Lint + Type Check + Unit Tests (fast)  │      │
│  │  • ESLint + Prettier                          │      │
│  │  • tsc --noEmit                               │      │
│  │  • Vitest (unit + integration)                │      │
│  │  • ~2 min                                     │      │
│  └───────────────────┬────────────────────────────┘      │
│                      ↓ (only if Job 1 passes)            │
│  ┌────────────────────────────────────────────────┐      │
│  │ Job 2: E2E Tests (slow)                       │      │
│  │  • Supabase CLI (local DB)                    │      │
│  │  • Playwright (critical flows)                │      │
│  │  • ~5-10 min                                  │      │
│  └───────────────────┬────────────────────────────┘      │
│                      ↓                                   │
│  Vercel Preview Deployment (automatic)                   │
│                                                          │
│  On merge to main:                                       │
│  ┌────────────────────────────────────────────────┐      │
│  │ Deploy Pipeline                               │      │
│  │  • Drizzle migrations → Supabase production   │      │
│  │  • Vercel production deployment               │      │
│  │  • Inngest function sync                      │      │
│  └────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────┘
```

_Source: [Supabase CI/CD](https://supabase.com/docs/guides/deployment/managing-environments), [Testing in 2026](https://www.nucamp.co/blog/testing-in-2026-jest-react-testing-library-and-full-stack-testing-strategies)_

### Cost Optimization and Resource Management

#### AI Cost Monitoring & Controls

| Control | Implementation | Purpose |
|---------|---------------|---------|
| **Per-user daily limit** | Track API token usage in `user_usage` table | Prevent runaway costs |
| **Batch optimization** | Group 50-100 segments per AI call | Reduce per-call overhead |
| **Prompt caching** | Reuse system prompt across calls (Claude cache) | ~90% reduction on system prompt tokens |
| **Model tiering** | Rules → GPT-4o-mini → Claude Sonnet (funnel) | 75% cost savings |
| **Usage dashboard** | Track daily/weekly/monthly token spend | Visibility & alerts |
| **Budget alerts** | Notify when monthly AI spend exceeds threshold | Cost protection |

#### Infrastructure Cost Control

| Phase | Monthly Budget | Controls |
|-------|---------------|----------|
| **MVP** | $30-95 | Supabase Free, Inngest Free, Vercel Pro |
| **Growth** | $100-300 | Supabase Pro, AI usage scaling, monitoring |
| **Scale** | $300-1000 | Optimize AI calls, add caching, batch API |

### Risk Assessment and Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **AI API downtime** | Medium | High | Multi-provider fallback (Claude → GPT-4o), graceful degradation (rule-only mode) |
| **Supabase free tier limits** | Medium | Medium | Monitor usage, upgrade to Pro ($25/mo) when needed |
| **XLIFF parsing edge cases** | High | Medium | Comprehensive test suite, graceful error handling, user-friendly error messages |
| **AI false positives** | High | Medium | Confidence thresholds, allow user to dismiss issues, feedback loop for prompt improvement |
| **Large file timeouts** | Medium | Medium | Inngest durable steps (no timeout), streaming parse, progress reporting |
| **RLS policy bugs** | Low | Critical | pgTAP tests for RLS, never skip RLS in production, security review before launch |
| **Cost overrun on AI** | Medium | High | Per-user daily limits, budget alerts, admin dashboard for spend monitoring |
| **Scope creep** | High | Medium | Strict MVP scope (XLIFF only, single-user), Phase 2/3 feature backlog |

### Success Metrics and KPIs

#### Technical KPIs

| Metric | Target (MVP) | Measurement |
|--------|-------------|-------------|
| **QA analysis time** | < 2 min for 1K segments | Inngest job duration |
| **AI accuracy (precision)** | > 85% | Golden test set comparison |
| **AI accuracy (recall)** | > 80% | Golden test set comparison |
| **Page load time** | < 1.5s (LCP) | Vercel Analytics |
| **Uptime** | > 99% | Vercel + Supabase status |
| **AI cost per file** | < $0.50 for avg file (500 segments) | Token usage tracking |

#### Business KPIs (Post-Launch)

| Metric | Target (3 months) | Measurement |
|--------|-------------------|-------------|
| **User signups** | 100+ | Supabase Auth analytics |
| **Files analyzed** | 500+ | `qa_jobs` table count |
| **Returning users** | > 30% | Session analytics |
| **User satisfaction** | > 4/5 | In-app feedback form |

---

---
