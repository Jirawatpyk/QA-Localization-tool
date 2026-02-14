# 8. Next.js - Frontend Framework

### Current Status (Web-Verified 2026-02-11)

| Attribute | Detail |
|-----------|--------|
| **Latest Stable** | **Next.js 16** (released Oct 21, 2025) |
| **Latest Patch** | Next.js 16.1 |
| **Previous** | Next.js 16.x |
| **React Version** | React 19.2 (View Transitions, useEffectEvent, Activity) |
| **Bundler** | **Turbopack** (stable, now default) |
| **React Compiler** | Stable (automatic memoization) |
| **Official Site** | https://nextjs.org |

### Next.js 16 Key Features

| Feature | Detail |
|---------|--------|
| **Turbopack (default)** | 2-5x faster builds, up to 10x faster Fast Refresh, now default for all apps |
| **Cache Components** | New `"use cache"` directive, replaces PPR, opt-in caching model |
| **React Compiler (stable)** | Auto-memoization, zero manual code changes needed |
| **React 19.2** | View Transitions, `useEffectEvent()`, `<Activity/>` component |
| **`proxy.ts`** | Replaces `middleware.ts`, runs on Node.js runtime |
| **Enhanced Routing** | Layout deduplication, incremental prefetching |
| **New Caching APIs** | `updateTag()` (read-your-writes), `refresh()`, refined `revalidateTag()` |
| **DevTools MCP** | AI-assisted debugging with Model Context Protocol |
| **Filesystem Caching** | Turbopack stores compiler artifacts on disk (beta) |
| **Node.js 20.9+** | Minimum requirement (Node 18 no longer supported) |

### Breaking Changes from Next.js 16

| Change | Impact |
|--------|--------|
| `middleware.ts` → `proxy.ts` | Rename file and exported function |
| `params`/`searchParams` must be async | `await params`, `await searchParams` |
| `cookies()`/`headers()` must be async | `await cookies()`, `await headers()` |
| Turbopack is default | Webpack available via `--webpack` flag |
| AMP support removed | Not relevant for this project |
| `next lint` removed | Use ESLint or Biome directly |
| `experimental.ppr` removed | Replaced by `cacheComponents` config |
| Parallel routes need `default.js` | Explicit default files required |

### Recommendation: Use Next.js 16

**Reasons:**
- Next.js 16 is the **current stable release** (Oct 2025)
- **Turbopack as default** = dramatically faster DX out of the box
- **Cache Components** with `"use cache"` is perfect for caching QA results explicitly
- **React Compiler** = automatic performance optimization without manual `useMemo`/`useCallback`
- **React 19.2 View Transitions** = smooth UX when navigating between QA results
- **`proxy.ts`** = cleaner request interception for auth checks
- **DevTools MCP** = AI-assisted debugging during development
- **`updateTag()`** = instant cache invalidation when QA run completes (read-your-writes)

### File Upload Handling

- Next.js API Routes support `FormData` and file uploads natively
- For large XLIFF files (>4MB on Vercel), consider:
  - Direct-to-storage uploads (presigned URLs to S3/GCS)
  - Streaming uploads via Route Handlers
  - Server Actions with `FormData` for simple uploads
- Cache Components can cache parsed XLIFF results with `"use cache"`

### Gotchas for QA Localization Tool

- **Vercel function timeout:** 10s (Hobby), 60s (Pro), 300s (Enterprise) - AI processing needs background jobs (Inngest)
- **Payload size limit:** 4.5MB on Vercel serverless functions - large XLIFF files need direct-to-storage upload
- **Turbopack + Babel:** If using React Compiler, Turbopack auto-enables Babel (may slow builds slightly)
- **`proxy.ts` migration:** If using middleware patterns, rename to `proxy.ts`
- **`cacheComponents: true`** needed in `next.config.ts` to enable Cache Components

### Sources
- https://nextjs.org/blog/next-16
- https://nextjs.org/blog/next-16-1
- https://nextjs.org/docs/app/guides/upgrading/version-16
- https://nextjs.org/docs/app/building-your-application/routing/route-handlers

---
