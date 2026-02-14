# 18. Final Recommended Tech Stack

### Summary Table

| Layer | Technology | Version | Confidence |
|-------|------------|---------|------------|
| **Framework** | Next.js | 16.x | High |
| **UI Components** | shadcn/ui | Latest | High |
| **Styling** | Tailwind CSS | v3.4 (migrate to v4 when shadcn ready) | High |
| **BaaS Platform** | **Supabase** (DB + Auth + Storage + Realtime) | Latest | High |
| **Database** | Supabase PostgreSQL | Latest | High |
| **ORM** | Drizzle ORM | Latest | High |
| **Auth** | Supabase Auth + Google OAuth | Latest | High |
| **File Storage** | Supabase Storage (MVP) / S3 (Production) | Latest | High |
| **Real-time** | Supabase Realtime (WebSocket) | Latest | High |
| **Queue/Jobs** | Inngest | Latest | High |
| **AI Engine** | Claude API (Sonnet) + GPT-4o-mini (screening) | Latest | High |
| **AI SDK** | Vercel AI SDK v6 (`Output.object()`) | v6 | High |
| **Hosting** | Vercel (frontend) + optional Railway (workers) | N/A | High |
| **Language** | TypeScript | 5.x | High |

### Architecture Decision: Vercel-First vs Hybrid

#### Option A: Vercel + Supabase (Recommended for MVP)

```
Next.js 16 on Vercel
    |-- Frontend (App Router, SSR)
    |-- API Routes (light processing)
    |-- Inngest (background AI jobs)
Supabase (All-in-One BaaS)
    |-- PostgreSQL (database)
    |-- Auth (Google OAuth, session management)
    |-- Storage (XLIFF file uploads)
    |-- Realtime (live progress updates via WebSocket)
```

**Pros:** Simple deployment, unified BaaS, built-in auth + storage + realtime, great DX, fast iteration
**Cons:** Supabase vendor coupling, instance-based pricing (no scale-to-zero)

#### Option B: Hybrid (Recommended for Production/Scale)

```
Vercel: Next.js 16 (Frontend + API)
Railway: Worker Service (BullMQ + heavy processing)
Supabase: PostgreSQL + Auth + Storage + Realtime
S3: File Storage (high-volume migration)
```

**Pros:** No timeout limits for AI processing, full control over workers
**Cons:** More complex deployment, two platforms to manage

### MVP Development Priority

For the fastest path to MVP, go with **Option A (All-Vercel)** and migrate to **Option B** if and when serverless limitations become a bottleneck.

---
