# 27. Architectural Patterns and Design

### System Architecture Pattern: Serverless BaaS + Durable Workflows

The QA Localization Tool follows a **serverless-first architecture** combining two key platforms:

```
┌─────────────────────────────────────────────────────┐
│                    VERCEL (Compute)                  │
│  ┌─────────────────────────────────────────────┐    │
│  │           Next.js 16 Application            │    │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │    │
│  │  │   App    │ │   API    │ │  proxy.ts   │ │    │
│  │  │  Router  │ │  Routes  │ │ (middleware) │ │    │
│  │  │  (RSC)   │ │ (Server  │ │  Auth gate  │ │    │
│  │  │          │ │ Actions) │ │             │ │    │
│  │  └──────────┘ └──────────┘ └─────────────┘ │    │
│  └─────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────┐    │
│  │           Inngest (Durable Workflows)       │    │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐  │    │
│  │  │Parse │→│Rules │→│Screen│→│Deep      │  │    │
│  │  │XLIFF │ │Check │ │(mini)│ │Analysis  │  │    │
│  │  └──────┘ └──────┘ └──────┘ │(Sonnet)  │  │    │
│  │                              └──────────┘  │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
              ↕ API calls          ↕ DB/Auth/Storage
┌─────────────────────────────────────────────────────┐
│                  SUPABASE (BaaS)                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────┐ │
│  │PostgreSQL│ │   Auth   │ │ Storage  │ │Real-  │ │
│  │   + RLS  │ │  Google  │ │  XLIFF   │ │time   │ │
│  │          │ │  OAuth   │ │  files   │ │WebSoc.│ │
│  └──────────┘ └──────────┘ └──────────┘ └───────┘ │
└─────────────────────────────────────────────────────┘
              ↕ AI API calls
┌─────────────────────────────────────────────────────┐
│              AI PROVIDERS (External)                │
│  ┌──────────────────┐ ┌────────────────────┐       │
│  │ OpenAI GPT-4o-   │ │ Anthropic Claude   │       │
│  │ mini (screening) │ │ Sonnet (deep QA)   │       │
│  └──────────────────┘ └────────────────────┘       │
└─────────────────────────────────────────────────────┘
```

**Architecture rationale**:
- **Serverless compute** (Vercel): Zero ops, auto-scaling, pay-per-use, global CDN
- **BaaS** (Supabase): Unified DB + Auth + Storage + Realtime — reduces integration complexity
- **Durable workflows** (Inngest): Solves serverless timeout limits for long-running AI analysis
- **External AI**: Multi-provider strategy for cost optimization and quality

_Source: [Supabase Architecture](https://supabase.com/docs/guides/getting-started/architecture), [Inngest Architecture](https://www.inngest.com/blog/how-durable-workflow-engines-work)_

### Design Principles and Project Structure

#### Feature-Based Module Architecture

Following Next.js best practices and clean architecture principles, the project uses a **feature-based module structure** where each module is self-contained:

```
src/
├── app/                          # Next.js App Router (routing only)
│   ├── (auth)/                   # Auth route group
│   │   ├── login/page.tsx
│   │   └── callback/route.ts
│   ├── (dashboard)/              # Protected route group
│   │   ├── projects/page.tsx
│   │   ├── projects/[id]/page.tsx
│   │   └── projects/[id]/results/page.tsx
│   ├── api/
│   │   ├── inngest/route.ts      # Inngest webhook endpoint
│   │   └── upload/route.ts       # XLIFF upload endpoint
│   ├── layout.tsx
│   └── proxy.ts                  # Next.js 16 middleware (auth gate)
│
├── modules/                      # Feature-based modules
│   ├── auth/                     # Authentication module
│   │   ├── components/
│   │   ├── hooks/
│   │   └── utils/supabase/       # Supabase client (server + client)
│   ├── projects/                 # Project management module
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── actions/              # Server Actions
│   │   └── types.ts
│   ├── qa-engine/                # QA analysis module (core business logic)
│   │   ├── rules/                # Rule-based checks
│   │   ├── ai/                   # AI integration (screening + deep)
│   │   ├── parsers/              # XLIFF parsing
│   │   ├── scoring/              # Score aggregation
│   │   └── types.ts
│   └── results/                  # Results display module
│       ├── components/
│       ├── hooks/
│       └── types.ts
│
├── inngest/                      # Inngest workflows
│   ├── client.ts                 # Inngest client config
│   └── functions/
│       └── qa-analysis.ts        # Main QA workflow
│
├── db/                           # Database layer
│   ├── index.ts                  # Drizzle client
│   ├── schema.ts                 # Drizzle schema
│   └── migrations/               # Drizzle migrations
│
├── components/                   # Shared UI components (shadcn/ui)
│   └── ui/
│
└── lib/                          # Shared utilities
    ├── utils.ts
    └── constants.ts
```

**Key design principles**:
1. **Separation of concerns**: App Router handles routing only; business logic lives in `modules/`
2. **Feature encapsulation**: Each module owns its components, hooks, actions, and types
3. **Core domain isolation**: `qa-engine/` module contains pure business logic — no framework dependencies
4. **Server Actions over API routes**: Use Server Actions for data mutations; API routes only for webhooks (Inngest) and file upload
5. **Colocation**: Keep related code together in feature modules

_Source: [Next.js Project Structure](https://nextjs.org/docs/app/getting-started/project-structure), [Feature-Based Architecture](https://medium.com/@burpdeepak96/the-battle-tested-nextjs-project-structure-i-use-in-2025-f84c4eb5f426), [Clean Architecture Next.js](https://github.com/nikolovlazar/nextjs-clean-architecture)_

### Multi-Layer AI Pipeline Architecture

The QA engine follows a **hybrid AI + rule-based pipeline** pattern, where each layer acts as a progressively more expensive and intelligent filter:

```
                    Input: Translation Segments
                              │
                    ┌─────────▼─────────┐
                    │  Layer 1: Rules   │  Cost: $0
                    │  (Deterministic)  │  Speed: <1ms/segment
                    │                   │
                    │  • Placeholder    │  Catches: ~30% issues
                    │    validation     │  (formatting, tags,
                    │  • Tag integrity  │   numbers, encoding)
                    │  • Number format  │
                    │  • Length check   │
                    └─────────┬─────────┘
                              │ All segments + rule results
                    ┌─────────▼─────────┐
                    │  Layer 2: Screen  │  Cost: ~$0.40/100K words
                    │  (GPT-4o-mini)    │  Speed: ~50ms/segment
                    │                   │
                    │  • Quick quality  │  Flags: ~20% segments
                    │    assessment     │  for deep analysis
                    │  • Flag suspect   │
                    │    segments       │
                    │  • Confidence     │
                    │    scoring        │
                    └─────────┬─────────┘
                              │ Flagged segments only (~20%)
                    ┌─────────▼─────────┐
                    │  Layer 3: Deep    │  Cost: ~$2.00/100K words
                    │  (Claude Sonnet)  │  Speed: ~200ms/segment
                    │                   │
                    │  • MQM-based      │  Output: Detailed
                    │    analysis       │  issue reports with
                    │  • Semantic QA    │  suggestions and
                    │  • Contextual     │  confidence levels
                    │    accuracy       │
                    │  • Fix suggest.   │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Aggregation      │
                    │  • Score calc     │
                    │  • Issue merge    │
                    │  • Report gen     │
                    └───────────────────┘
```

**Architecture pattern**: This follows the **"sieve" or "funnel" pattern** from hybrid AI systems research — deterministic rules catch obvious issues for free, cheap LLM screening flags suspicious segments, and expensive deep analysis is only applied to the ~20% that need it. This achieves **~75% cost savings** compared to running all segments through Claude Sonnet.

**Modular pipeline design**: Each layer is implemented as a separate Inngest step, enabling:
- Independent retries per layer (if Claude API fails, rules don't re-run)
- Layer-level metrics and monitoring
- Easy swap of AI models per layer
- Gradual rollout of new rules or prompts

_Source: [Multi-Stage LLM Pipelines](https://pmdgtech.com/blog/technology/building-smarter-ai-systems-multi-stage-llm-pipelines-explained/), [Hybrid AI Architecture](https://www.preprints.org/manuscript/202512.2023), [LLM Orchestration Best Practices](https://orq.ai/blog/llm-orchestration)_

### Multi-Tenant Data Architecture (Supabase RLS)

The QA tool uses a **shared-database, shared-schema** multi-tenancy pattern with Supabase Row Level Security:

```
┌─────────────────────────────────────────┐
│           Supabase PostgreSQL           │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │         RLS Policy Layer        │    │
│  │  auth.uid() = user_id           │    │
│  │  OR team_id IN user_teams       │    │
│  └──────────────┬──────────────────┘    │
│                 │                        │
│  ┌──────────────▼──────────────────┐    │
│  │            Tables               │    │
│  │  users ─┐                       │    │
│  │         ├── teams               │    │
│  │         ├── team_members        │    │
│  │         ├── qa_projects ────┐   │    │
│  │         │                   │   │    │
│  │         │    qa_jobs ───────┤   │    │
│  │         │                   │   │    │
│  │         │    qa_issues ─────┘   │    │
│  │         │                       │    │
│  │         └── glossaries          │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**RLS policy strategy**:

| Table | Policy | Rule |
|-------|--------|------|
| `qa_projects` | User or team access | `auth.uid() = user_id OR team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())` |
| `qa_jobs` | Via project access | `project_id IN (SELECT id FROM qa_projects)` — cascades from project RLS |
| `qa_issues` | Via job access | `job_id IN (SELECT id FROM qa_jobs)` — cascades from job RLS |
| `glossaries` | Team-level sharing | `team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())` |

**Key data architecture decisions**:
1. **`user_id` on every row**: Enables simple RLS policies without complex joins
2. **`team_id` for sharing**: Optional team context for Phase 2 collaboration features
3. **Index all RLS columns**: Missing indexes are the #1 RLS performance killer
4. **Use `auth.uid()` function**: Supabase built-in — extracts user ID from JWT automatically
5. **Service role for Inngest**: Background jobs use `service_role` key to bypass RLS (server-side only)

_Source: [Supabase RLS Guide 2026](https://designrevision.com/blog/supabase-row-level-security), [Multi-Tenant RLS Patterns](https://www.antstack.com/blog/multi-tenant-applications-with-rls-on-supabase-postgress/), [Supabase RLS Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)_

### Scalability and Performance Patterns

#### MVP → Scale Migration Path

| Phase | Users | Architecture | Key Changes |
|-------|-------|-------------|-------------|
| **MVP** | 1-100 | Vercel + Supabase Free | Single project, basic RLS |
| **Growth** | 100-1K | Vercel Pro + Supabase Pro | Connection pooling, read replicas |
| **Scale** | 1K-10K | + Railway workers | Dedicated workers for heavy AI processing |
| **Enterprise** | 10K+ | + S3 + dedicated infra | Custom deployment, SLA guarantees |

#### Performance Optimization Strategies

| Strategy | Implementation | Impact |
|----------|---------------|--------|
| **Streaming parse** | Parse large XLIFF files in chunks (streaming XML parser) | Handle 50MB+ files without memory spikes |
| **Batch AI calls** | Group segments into batches of 50-100 for AI API | Reduce API overhead, enable batch pricing |
| **Connection pooling** | Supabase Supavisor (transaction mode) | Handle concurrent serverless connections |
| **CDN caching** | Vercel Edge Network + Supabase CDN | Sub-100ms page loads globally |
| **Incremental results** | Show partial results as analysis progresses | Better UX, no waiting for full completion |
| **Prompt caching** | Claude API prompt caching (system prompt reuse) | ~90% cost reduction on repeated prompts |

_Source: [Supabase Best Practices](https://www.leanware.co/insights/supabase-best-practices), [Inngest Performance](https://www.inngest.com/)_

### Security Architecture Patterns

```
┌──────────────────────────────────────────────────┐
│                 Security Layers                  │
│                                                  │
│  Layer 1: Edge (proxy.ts)                        │
│  ├── Auth check (Supabase session validation)    │
│  ├── Rate limiting headers                       │
│  └── CORS policy enforcement                     │
│                                                  │
│  Layer 2: Application (API Routes / Actions)     │
│  ├── Zod input validation                        │
│  ├── File type validation (XLIFF only)           │
│  ├── XXE prevention (XML parser config)          │
│  └── CSRF protection (Next.js built-in)          │
│                                                  │
│  Layer 3: Database (Supabase RLS)                │
│  ├── Row-level data isolation per user/team      │
│  ├── Storage bucket policies per user            │
│  └── Cascading access policies                   │
│                                                  │
│  Layer 4: Infrastructure (Vercel + Supabase)     │
│  ├── Environment variable encryption             │
│  ├── HTTPS everywhere (TLS 1.3)                  │
│  ├── Service role key server-only                │
│  └── AI API keys never exposed to client         │
└──────────────────────────────────────────────────┘
```

**Critical security rules**:
1. **Never expose `service_role` key**: Only use in server-side code (Inngest functions, Server Actions)
2. **`anon` key is public**: Client-side uses anon key — RLS policies are the real security
3. **XXE prevention**: Configure XML parser to disable external entity resolution
4. **File validation**: Check XLIFF structure server-side, not just file extension
5. **`proxy.ts` as auth gate**: Next.js 16's new middleware — redirect unauthenticated users before reaching routes

_Source: [Supabase Security Best Practices](https://www.leanware.co/insights/supabase-best-practices), [Supabase Auth Docs](https://supabase.com/docs/guides/auth)_

### Deployment and Operations Architecture

#### CI/CD Pipeline

```
GitHub Push → Vercel Preview → Tests → Vercel Production
                                  ↓
                        Drizzle Migrations
                        (drizzle-kit migrate)
                                  ↓
                        Supabase DB Updated
```

#### Monitoring and Observability

| Aspect | Tool | Purpose |
|--------|------|---------|
| **Application** | Vercel Analytics | Web vitals, function performance |
| **Workflows** | Inngest Dashboard | Step execution, retries, failures |
| **Database** | Supabase Dashboard | Query performance, connection count |
| **AI Costs** | Custom dashboard | Token usage per model, cost tracking |
| **Errors** | Vercel Logs / Sentry | Error tracking, stack traces |

#### Environment Strategy

| Environment | Vercel | Supabase | Inngest |
|-------------|--------|----------|---------|
| **Development** | `localhost:3000` | Local (Supabase CLI) | Inngest Dev Server |
| **Preview** | Preview deployment | Supabase branch/staging | Inngest branch env |
| **Production** | Production deployment | Production project | Production env |

_Source: [Supabase Local Development](https://supabase.com/docs/guides/local-development/overview), [Vercel Deployment](https://vercel.com/docs)_

### Architectural Decision Records (ADR) Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Compute platform** | Vercel (serverless) | Best DX for Next.js, global CDN, auto-scaling |
| **BaaS platform** | Supabase | All-in-one (DB+Auth+Storage+Realtime), reduces complexity |
| **AI pipeline** | Multi-layer funnel | 75% cost savings, independent layer retry |
| **Background jobs** | Inngest durable functions | No infra, step-level retries, no timeouts |
| **Auth strategy** | Supabase Auth + Google OAuth | Built-in, RLS integration, no adapter |
| **Data isolation** | Supabase RLS | Database-level security, no app-level filtering |
| **File storage** | Supabase Storage | Bundled with auth/RLS, signed URL uploads |
| **Real-time updates** | Supabase Realtime | WebSocket, zero-latency, replaces polling |
| **ORM** | Drizzle ORM | Type-safe, lightweight, Supabase-compatible, portable |
| **Project structure** | Feature-based modules | Encapsulated, scalable, maintainable |
| **AI SDK** | Vercel AI SDK v6 | Unified tool+output, multi-provider, type-safe |

---
