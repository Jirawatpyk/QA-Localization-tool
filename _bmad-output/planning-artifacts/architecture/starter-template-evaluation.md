# Starter Template Evaluation

### Primary Technology Domain

**Full-stack Web Application** — Next.js 16 App Router with Supabase backend, based on project requirements for real-time QA processing, multi-tenant data isolation, and rich interactive review UI.

### Technology Versions (Verified February 2026)

> **IMPORTANT — Version Verification Required at Project Init:** The versions below were verified via web search on 2026-02-14. Package ecosystems move fast — **before running `npm install`, verify each version is still current** by checking the npm registry (`npm info <package> version`) or the project's GitHub releases page. If a major version has changed (e.g., Next.js 17 released), this section and all affected architectural decisions must be reviewed.

| Technology | Version | Key Changes | Verify At |
|-----------|---------|-------------|-----------|
| Next.js | 16.1.6 LTS | Turbopack default, React Compiler stable, async APIs mandatory | `npm info next version` |
| shadcn/ui | CLI-based | `npx shadcn@latest init`, unified Radix UI package, RTL support | `npx shadcn@latest --version` |
| @supabase/supabase-js | 2.95.3 | SSR via `@supabase/ssr`, cookie-based auth | `npm info @supabase/supabase-js version` |
| Drizzle ORM | 0.45.1 (stable) | v1.0 beta available; use stable for production (see migration plan below) | `npm info drizzle-orm version` |
| Inngest | 3.52.0 | App Router support, Vercel Fluid Compute streaming | `npm info inngest version` |
| Vercel AI SDK | 6.0.86 | Agent abstraction, human-in-the-loop, structured output | `npm info ai version` |
| Tailwind CSS | 4.1.18 | Zero-config, CSS `@theme` directive, no tailwind.config.js | `npm info tailwindcss version` |
| TypeScript | 5.9.x | 6.0 Beta announced but not stable; use 5.9.x | `npm info typescript version` |
| fast-xml-parser | 5.3.5 | ESM support, no C/C++ dependencies | `npm info fast-xml-parser version` |

**Version Lock Strategy:** After project initialization, use `npm ci` (not `npm install`) in CI and pin exact versions in `package.json` (no `^` or `~` prefixes for core dependencies) to prevent drift between environments.

**Drizzle ORM 0.x → 1.0 Migration Plan:**

Drizzle ORM is pre-1.0 (0.45.x). The v1.0 release may introduce breaking changes to schema definitions, migration format, or query builder API. Mitigation strategy:

| Risk | Mitigation |
|------|-----------|
| Schema definition API changes | All schemas in `src/db/schema/` — single location to update. Drizzle Kit `generate` will flag incompatibilities. |
| Migration format changes | Existing SQL migrations in `src/db/migrations/` are plain SQL — format-independent. Only `drizzle.config.ts` may need updates. |
| Query builder API changes | All queries use Drizzle via Server Actions and Inngest functions — no scattered raw queries. Search `from(` across codebase to find all query sites. |
| **Upgrade trigger** | When Drizzle 1.0 reaches stable release (not beta), create a dedicated upgrade branch. Run `drizzle-kit generate` to verify all schemas pass. Run full test suite including RLS tests. |
| **Fallback** | If 1.0 migration proves too disruptive, stay on 0.45.x — Drizzle team maintains patch releases for latest 0.x. |

### Starter Options Considered

| Option | Description | Pros | Cons |
|--------|------------|------|------|
| `create-next-app -e with-supabase` | Official Supabase template | Cookie auth ready, Tailwind + TS | Missing Drizzle, Inngest, AI SDK, shadcn/ui |
| Nextbase Starter | Community Next.js + Supabase starter | Includes Jest + Playwright | Community-maintained, may be outdated |
| supa-next-starter | Community Next.js + Supabase + shadcn | Includes shadcn setup | Missing Drizzle, Inngest, AI SDK |
| **`create-next-app` + Manual Setup** | Official Next.js CLI + layered dependencies | Full version control, latest everything | Requires manual dependency setup |

### Selected Starter: `create-next-app` + Manual Setup

**Rationale for Selection:**

1. No existing starter template combines all required technologies (Next.js 16 + Supabase + Drizzle + shadcn/ui + Inngest + AI SDK v6)
2. Full control over dependency versions ensures latest stable releases
3. Avoids dependency on community starters with uncertain maintenance
4. AI-assisted project setup makes manual configuration fast and reliable

**Initialization Command:**

```bash
# 1. Create Next.js app (Next.js 16 + Tailwind v4 + TypeScript + App Router)
npx create-next-app@latest qa-localization-tool --typescript --tailwind --eslint --app --src-dir

# 2. Initialize shadcn/ui
npx shadcn@latest init

# 3. Install core dependencies
npm i @supabase/supabase-js @supabase/ssr drizzle-orm inngest ai fast-xml-parser zustand pino sonner zod @upstash/ratelimit @upstash/redis

# 4. Install dev dependencies
npm i -D drizzle-kit @types/node vitest @vitejs/plugin-react jsdom @testing-library/react @faker-js/faker playwright @playwright/test drizzle-zod
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
TypeScript 5.9.x on Node.js 20.9+, strict mode enabled, path aliases via `@/`

**Styling Solution:**
Tailwind CSS v4 with CSS `@theme` directive (no tailwind.config.js), shadcn/ui components with full source ownership

**Build Tooling:**
Turbopack (default in Next.js 16) for development, React Compiler for automatic memoization, filesystem caching for faster restarts

**Code Organization:**
Next.js App Router with `src/app/` directory structure, React Server Components by default, `"use client"` directive for interactive components

**Development Experience:**
Fast Refresh via Turbopack, TypeScript strict mode, ESLint integration, filesystem caching for incremental builds

> **Note:** Project initialization using this command sequence should be the first implementation story.
