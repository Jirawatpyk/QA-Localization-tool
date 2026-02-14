# 21. Changes from Original Plan

The original plan (`docs/qa-localization-tool-plan.md`) proposed:

| Original | Updated Recommendation | Reason |
|----------|----------------------|--------|
| Next.js 14 | **Next.js 16** | 16 is current stable, Turbopack default, Cache Components, React 19.2 |
| Node.js + Express | **Next.js API Routes + Inngest** | Simpler architecture, no need for separate Express server |
| PostgreSQL (generic) | **Supabase PostgreSQL** | All-in-one BaaS with DB + Auth + Storage + Realtime |
| NextAuth.js + Google | **Supabase Auth** + Google OAuth | Built-in auth, no extra adapter, RLS integration |
| S3 / GCS | **Supabase Storage (MVP) then S3** | Bundled with Supabase, signed URL uploads, RLS on files |
| Redis (generic) | **Removed for MVP** | Supabase Realtime replaces polling; Inngest handles queue |
| (not specified) | **Supabase Realtime** | Live WebSocket updates for job progress (replaces SWR Polling) |
| Vercel / Railway | **Vercel-first, Railway for workers** | Best of both worlds |
| (not specified) | **Drizzle ORM** | Better serverless support, lighter weight, Supabase compatible |
| (not specified) | **Inngest** for background jobs | Solves Vercel timeout limitations |

---

---
