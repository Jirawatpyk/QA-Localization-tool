# 14. Vercel - Hosting Platform

### Current Limitations

| Limit | Hobby (Free) | Pro ($20/mo) | Enterprise |
|-------|-------------|-------------|------------|
| Serverless Function Timeout | 10 seconds | 60 seconds | 300 seconds |
| Edge Function Timeout | 30 seconds | 30 seconds | 30 seconds |
| Payload Size | 4.5 MB | 4.5 MB | 4.5 MB |
| Build Time | 45 min | 45 min | 45 min |
| Bandwidth | 100 GB | 1 TB | Custom |
| Serverless Execution | 100 GB-hrs | 1000 GB-hrs | Custom |
| Cron Jobs | 2 per day | Unlimited | Unlimited |
| Team Members | 1 | Unlimited | Unlimited |
| Deployments | Unlimited | Unlimited | Unlimited |

### Impact on QA Localization Tool

| Concern | Impact | Mitigation |
|---------|--------|------------|
| **Function Timeout** | AI API calls may exceed 10s (Hobby) or 60s (Pro) | Use background jobs (Inngest/QStash), streaming responses |
| **Payload Size** | Large XLIFF files (>4.5MB) cannot be uploaded through API routes | Direct-to-storage uploads (presigned URLs) |
| **No Persistent Workers** | Cannot run BullMQ workers | Use serverless queue alternatives |
| **Cold Starts** | Serverless functions have cold start latency | Use edge functions where possible, keep functions warm |
| **Cost** | Heavy AI processing = many function invocations | Monitor usage, optimize batching |

### Vercel Strengths

- Zero-config Next.js deployment (best-in-class)
- Global CDN with edge network
- Preview deployments for every PR
- Built-in analytics and speed insights
- Tight integration with Neon, Upstash, and other partners
- Excellent CI/CD pipeline

### Verdict for QA Tool

Vercel is **excellent for the frontend and API layer** but has limitations for heavy backend processing. For the MVP, the Pro plan with Inngest/QStash for background jobs is viable. For production scale, consider a hybrid approach.

### Sources
- https://vercel.com/docs/functions/runtimes
- https://vercel.com/pricing

---
