# 25. Final Consolidated Recommendations

### Validated & Updated Tech Stack (MVP)

| Layer | Original Plan | **Updated Recommendation** | Confidence | Source |
|-------|--------------|---------------------------|------------|--------|
| **Framework** | Next.js 14 | **Next.js 16** | High | [nextjs.org](https://nextjs.org/blog/next-16) |
| **UI Components** | shadcn/ui | **shadcn/ui** (confirmed) | High | [ui.shadcn.com](https://ui.shadcn.com) |
| **Styling** | Tailwind CSS | **Tailwind CSS v3.4** (v4 when shadcn ready) | High | |
| **Backend** | Node.js + Express | **Next.js API Routes + Inngest** | High | [inngest.com](https://www.inngest.com/docs) |
| **AI Engine** | Claude API | **Claude Sonnet (primary) + GPT-4o-mini (screening)** | High | [Web verified](https://intlpull.com/fr/blog/ai-translation-api-comparison-2026) |
| **AI SDK** | (not specified) | **Vercel AI SDK v6** (`Output.object()`) | High | [AI SDK 6](https://vercel.com/blog/ai-sdk-6) |
| **BaaS Platform** | (not specified) | **Supabase** (DB + Auth + Storage + Realtime) | High | [supabase.com](https://supabase.com) |
| **Database** | PostgreSQL | **Supabase PostgreSQL** | High | [supabase.com/docs](https://supabase.com/docs) |
| **ORM** | (not specified) | **Drizzle ORM** (with Supabase) | High | [drizzle + supabase](https://orm.drizzle.team/docs/connect-supabase) |
| **Auth** | NextAuth.js + Google | **Supabase Auth** + Google OAuth | High | [supabase.com/auth](https://supabase.com/docs/guides/auth) |
| **File Storage** | S3 / GCS | **Supabase Storage** (MVP) → S3 (scale) | High | [supabase.com/storage](https://supabase.com/docs/guides/storage) |
| **Real-time** | (not specified) | **Supabase Realtime** (WebSocket, live updates) | High | [supabase.com/realtime](https://supabase.com/docs/guides/realtime) |
| **Queue** | (not specified) | **Inngest** (no Redis needed) | High | [Web verified](https://www.inngest.com/docs/guides/background-jobs) |
| **XLIFF Parser** | (not specified) | **`xliff` package** (55K downloads/wk) | High | [npm verified](https://www.npmjs.com/package/xliff) |
| **Hosting** | Vercel / Railway | **Vercel-first** + Railway for workers if needed | High | |

### Estimated Monthly Cost (MVP)

| Service | Plan | Cost/mo |
|---------|------|---------|
| Vercel | Pro | $20 |
| Supabase | Free → Pro ($25) | $0-25 |
| Inngest | Free tier | $0 |
| Claude API (Sonnet) | Usage-based | $10-50 |
| **Total** | | **$30-95/mo** |

> **Note**: Supabase bundles DB + Auth + Storage + Realtime in one plan, replacing Neon ($0) + Vercel Blob ($0) + Upstash Redis ($0) separately. Free tier is generous for MVP; upgrade to Pro ($25/mo) when scaling.

### AI Cost Optimization (Multi-Layer Approach)

| Layer | What | Model | Cost per 100K words |
|-------|------|-------|-------------------|
| **1. Rule-based** | Placeholder, tags, numbers | None (local) | $0 |
| **2. Quick screening** | Flag problematic segments | GPT-4o-mini | ~$0.40 |
| **3. Deep analysis** | Semantic QA on flagged segments (~20%) | Claude Sonnet | ~$2.00 |
| **Total** | | | **~$2.40 (~86 THB)** |

vs. Original plan estimate (all Sonnet): ~$8-10 (~300-400 THB)
**Savings: ~75%**

---

---
