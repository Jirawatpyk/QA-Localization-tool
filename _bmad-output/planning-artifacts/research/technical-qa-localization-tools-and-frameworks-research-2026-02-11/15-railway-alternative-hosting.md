# 15. Railway - Alternative Hosting

### Overview

| Attribute | Detail |
|-----------|--------|
| **Pricing** | Usage-based, starts at $5/mo credit |
| **Container-based** | Runs Docker containers (not serverless) |
| **Persistent** | Long-running processes supported |
| **Database** | Built-in PostgreSQL, Redis, MongoDB |
| **Deployment** | Git push, Dockerfile, or Nixpacks |
| **Official Site** | https://railway.app |

### Vercel vs Railway Comparison

| Feature | Vercel | Railway |
|---------|--------|---------|
| **Deployment Model** | Serverless (functions) | Container-based (persistent) |
| **Next.js Support** | Best-in-class | Good (via Docker/Nixpacks) |
| **Long-running Tasks** | Limited (timeouts) | No timeout limits |
| **Background Workers** | Not native (need Inngest/QStash) | Native (just run a process) |
| **Database** | Via partners (Neon, etc.) | Built-in PostgreSQL & Redis |
| **Scaling** | Auto-scale (serverless) | Manual/auto scale (containers) |
| **Preview Deploys** | Excellent | Supported but less polished |
| **CDN** | Global edge network | No built-in CDN |
| **Cost Model** | Per-invocation + bandwidth | Per-resource-usage (CPU, RAM, network) |
| **DX for Next.js** | Superior | Good |
| **Custom domains** | Included | Included |

### Recommendation: Hybrid Approach

**Best architecture for QA Localization Tool:**

```
Frontend + API (Vercel)
    |-- Upload handling
    |-- Auth (NextAuth)
    |-- Dashboard/UI
    |-- Light API routes
    |
    v
Background Workers (Railway)
    |-- BullMQ workers
    |-- AI API call processing
    |-- Heavy file processing
    |-- Redis (built-in)
    |-- PostgreSQL (or Neon)
```

**Alternative (simpler, MVP-friendly): All on Vercel**
- Use Inngest for background job orchestration
- Use Neon for PostgreSQL
- Use Upstash for Redis/caching
- Accept serverless limitations

**Alternative (simplest): All on Railway**
- Single deployment target
- Full control over everything
- Trade-off: Less polished Next.js DX, no edge CDN

### Sources
- https://docs.railway.app/
- https://railway.app/pricing

---
