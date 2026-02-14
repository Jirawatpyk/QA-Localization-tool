# 13. Redis & Queue System

### Managed Redis Options

| Provider | Free Tier | Paid Starting | Highlights | Best For |
|----------|-----------|---------------|------------|----------|
| **Upstash** | 10K commands/day | $0.2/100K commands | Serverless, REST API, per-request pricing, excellent Vercel integration | Serverless apps, caching |
| **Redis Cloud** | 30MB | $5/mo | Full Redis features, Redis modules, persistence | Feature-rich Redis needs |
| **Railway Redis** | Included in $5 credit | Usage-based | Simple setup, persistent, co-located with app | Railway deployments |
| **Vercel KV** | Powered by Upstash | Included in Pro | Zero config with Vercel | Simple caching on Vercel |

### Queue Library: BullMQ

| Attribute | Detail |
|-----------|--------|
| **Version** | 5.x |
| **Requires** | Redis (full Redis, not Upstash REST) |
| **Features** | Job queues, delayed jobs, retry, priority, rate limiting, concurrency control |
| **Relevance** | Essential for background AI processing |

### Queue Architecture for QA Tool

```
User uploads XLIFF
    |
    v
API Route: Parse XLIFF, create QA run record
    |
    v
Queue: Add jobs for each batch of translation units
    |
    v
Worker: Process batches (Rule engine + AI API calls)
    |
    v
Database: Store results
    |
    v
SSE/Polling: Update client with progress
```

### Important Consideration: Serverless vs Persistent Workers

**BullMQ requires persistent workers** - it cannot run on serverless functions (Vercel). Options:

1. **Railway** - Run a dedicated worker process alongside the web app
2. **Fly.io** - Similar to Railway, run persistent workers
3. **Alternative: Upstash QStash** - Serverless message queue that works with Vercel
   - No need for persistent workers
   - Calls your API routes as HTTP requests
   - Built-in retry, delay, scheduling
   - Pay-per-use pricing
4. **Alternative: Inngest** - Event-driven serverless functions
   - Works natively with Vercel
   - Built-in retry, concurrency control, rate limiting
   - No Redis needed
   - Better DX for complex workflows

### Recommendation

**For Vercel deployment: Inngest or Upstash QStash**
- No persistent workers needed
- Works within serverless constraints
- Inngest is particularly well-suited for multi-step AI processing pipelines

**For Railway deployment: BullMQ + Redis**
- Full control over workers
- Better for long-running AI processes
- More mature queue semantics

### Sources
- https://upstash.com/docs/redis/overall/getstarted
- https://docs.bullmq.io/
- https://upstash.com/docs/qstash/overall/getstarted
- https://www.inngest.com/docs

---
