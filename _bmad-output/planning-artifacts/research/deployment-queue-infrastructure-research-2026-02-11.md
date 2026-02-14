# Deployment, Queue Systems & Infrastructure Research

**Date:** 2026-02-11
**Context:** QA Localization Tool - AI-Powered XLIFF Quality Assurance
**Scope:** Queue/job processing, real-time updates, file processing, deployment architecture, CI/CD

---

## Table of Contents

1. [Queue/Job Processing Systems](#1-queuejob-processing-systems)
2. [Real-time Progress Updates](#2-real-time-progress-updates)
3. [File Processing Patterns](#3-file-processing-patterns)
4. [Deployment Architecture Patterns](#4-deployment-architecture-patterns)
5. [CI/CD for Phase 3](#5-cicd-for-phase-3)
6. [Recommendation Summary](#6-recommendation-summary)

---

## 1. Queue/Job Processing Systems

### Context: Why We Need a Queue

The QA Localization Tool needs to:
- Process thousands of translation units per file
- Make hundreds of Claude API calls (batched ~15 units per call)
- Handle 30+ second processing times
- Report progress in real-time
- Retry failed API calls gracefully
- Not block the web server

### 1.1 BullMQ with Redis

**What it is:** A Node.js library for robust job/message queues built on Redis.

**Architecture:**
```
Next.js API Route --> Redis Queue --> Worker Process --> Claude API
       |                                    |
       +--- SSE/Polling <--- Progress Events
```

**Key Features:**
- Job prioritization, delayed jobs, rate limiting
- Built-in retry with exponential backoff
- Job progress events (0-100%)
- Concurrency control per worker
- Job dependencies (flow/parent-child jobs)
- Dashboard available via `bull-board` or `arena`
- Stalled job detection and recovery
- Repeatable jobs (cron-like)

**Pros:**
- Mature, battle-tested (millions of weekly npm downloads)
- Fine-grained control over concurrency, rate limiting
- Built-in progress reporting via `job.updateProgress()`
- Excellent for batched API call patterns
- Redis is fast and widely available
- Strong TypeScript support
- Free and open source

**Cons:**
- Requires a Redis instance (not serverless-native)
- Cannot run workers on Vercel (serverless timeout limits)
- Need a separate worker process (Railway, Fly.io, EC2, etc.)
- More infrastructure to manage
- Redis adds cost (~$5-15/mo for small managed instance)

**Cost:**
- BullMQ: Free (MIT license)
- Redis: Upstash free tier (10K commands/day) or Railway Redis (~$5/mo) or Redis Cloud free tier (30MB)
- Worker hosting: Railway ($5/mo hobby) or Fly.io ($0 for small instances)

**Best Practices for QA Localization Tool:**
```typescript
// Queue setup
const qaQueue = new Queue('qa-processing', { connection: redis });

// Add job with file data
await qaQueue.add('process-xliff', {
  fileId: 'abc123',
  userId: 'user1',
  translationUnits: [...],  // or reference to stored file
}, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600 * 24 },
  removeOnFail: { age: 3600 * 24 * 7 },
});

// Worker with concurrency control
const worker = new Worker('qa-processing', async (job) => {
  const { translationUnits } = job.data;
  const batches = chunkArray(translationUnits, 15);

  for (let i = 0; i < batches.length; i++) {
    // Rule-based checks (fast, in-process)
    const ruleResults = runRuleChecks(batches[i]);

    // AI checks (slow, API call)
    const aiResults = await callClaudeAPI(batches[i]);

    // Update progress
    await job.updateProgress(Math.round(((i + 1) / batches.length) * 100));
  }

  return aggregateResults(allResults);
}, {
  concurrency: 3,  // Process 3 batches concurrently
  limiter: {
    max: 10,       // Max 10 jobs per duration
    duration: 60000, // Per minute (rate limit Claude API)
  },
});
```

**Source References:**
- BullMQ Documentation: https://docs.bullmq.io/
- BullMQ GitHub: https://github.com/taskforcesh/bullmq
- Bull Board (Dashboard): https://github.com/felixmosh/bull-board

---

### 1.2 Inngest

**What it is:** A serverless event-driven job processing platform that works without Redis. Functions are triggered by events and can run as durable workflows.

**Architecture:**
```
Next.js API Route --> Inngest Event --> Inngest Cloud --> Your Function (via HTTP)
       |                                                       |
       +--- Inngest API (status) <--- Step completion events ---+
```

**Key Features:**
- Durable functions with automatic retry
- Step functions: break long jobs into steps that checkpoint
- Event-driven architecture
- Built-in concurrency, throttling, debouncing
- Fan-out patterns (one event triggers multiple functions)
- No Redis needed
- Dashboard included (Inngest Cloud)
- Can self-host (Inngest Server is open source)
- Sleep/wait between steps without holding compute

**Pros:**
- Works natively with Vercel/serverless (no separate worker needed!)
- Step functions solve the serverless timeout problem
- Built-in observability and debugging dashboard
- Zero infrastructure (no Redis, no workers to manage)
- Automatic retries per step (not whole function)
- TypeScript-first SDK
- Local development server included
- Free tier is generous (up to 50K steps/month free on Cloud)

**Cons:**
- Your code runs as HTTP endpoints, invoked by Inngest (architecture change)
- Adds latency per step (HTTP round-trip to invoke each step)
- Less control over exact execution timing
- Vendor dependency (though self-hostable)
- Step-based progress tracking requires custom implementation
- Newer ecosystem vs BullMQ

**Cost:**
- Free tier: 50,000 function steps/month (generous for MVP)
- Pro: $50/mo for 500K steps
- Self-hosted: Free (you manage infrastructure)

**Pattern for QA Localization Tool:**
```typescript
// Define the function
export const processXliffQA = inngest.createFunction(
  {
    id: "process-xliff-qa",
    concurrency: [{ limit: 5 }],  // Max 5 concurrent jobs
    retries: 3,
  },
  { event: "qa/xliff.uploaded" },
  async ({ event, step }) => {
    const { fileId, translationUnits } = event.data;
    const batches = chunkArray(translationUnits, 15);

    // Step 1: Rule-based checks (fast)
    const ruleResults = await step.run("rule-checks", async () => {
      return runAllRuleChecks(translationUnits);
    });

    // Step 2-N: AI checks (each batch is a durable step)
    const aiResults = [];
    for (let i = 0; i < batches.length; i++) {
      const batchResult = await step.run(`ai-check-batch-${i}`, async () => {
        return await callClaudeAPI(batches[i]);
      });
      aiResults.push(batchResult);

      // Update progress in DB (SSE/polling reads from DB)
      await step.run(`update-progress-${i}`, async () => {
        await db.qaRun.update(fileId, {
          progress: Math.round(((i + 1) / batches.length) * 100)
        });
      });
    }

    // Final step: Aggregate
    return await step.run("aggregate", async () => {
      return aggregateResults(ruleResults, aiResults);
    });
  }
);
```

**Source References:**
- Inngest Documentation: https://www.inngest.com/docs
- Inngest GitHub: https://github.com/inngest/inngest
- Inngest vs BullMQ: https://www.inngest.com/blog/inngest-vs-bullmq
- Inngest + Next.js guide: https://www.inngest.com/docs/frameworks/nextjs

---

### 1.3 Trigger.dev

**What it is:** An open-source background job platform specifically designed for Next.js/TypeScript applications. Runs long-running tasks on their infrastructure.

**Architecture:**
```
Next.js API Route --> trigger.dev Cloud --> Your Task (runs on trigger.dev infra)
       |                                           |
       +--- Realtime API (built-in) <--- Status ---+
```

**Key Features:**
- Long-running tasks (up to 5 min free, longer on paid)
- Runs your code on their managed infrastructure
- Built-in real-time status/progress API
- Retry with backoff
- Concurrency controls
- SDK with `trigger()` and `triggerAndWait()`
- Built-in logging, metrics, dashboard
- v3 (current) has significant improvements over v2

**Pros:**
- Purpose-built for Next.js background jobs
- Built-in real-time progress (no SSE/WebSocket to implement)
- Tasks run on their infrastructure (no worker to manage)
- Excellent DX (Developer Experience) with TypeScript
- Dashboard for monitoring
- Can batch and fan-out tasks
- `runs.retrieve()` API for checking status/progress

**Cons:**
- Your task code runs on Trigger.dev servers (not your infra)
- Free tier limited to 5-min task duration
- Paid needed for production scale
- Newer product, smaller community than BullMQ
- Some lock-in to their SDK
- Self-hosting is complex

**Cost:**
- Free (Hobby): 30K runs/mo, 5-min max duration
- Pro: $50/mo, 100K runs, 5-min duration
- Growth: Custom, longer durations

**Pattern for QA Localization Tool:**
```typescript
// Define the task
export const processQATask = task({
  id: "process-qa",
  retry: { maxAttempts: 3 },
  run: async (payload: { fileId: string; units: TranslationUnit[] }) => {
    const { fileId, units } = payload;
    const batches = chunkArray(units, 15);

    // Report progress via metadata
    metadata.set("status", "rule-checks");
    const ruleResults = runRuleChecks(units);

    metadata.set("status", "ai-checks");
    for (let i = 0; i < batches.length; i++) {
      const result = await callClaudeAPI(batches[i]);
      metadata.set("progress", ((i + 1) / batches.length * 100).toFixed(0));
    }

    metadata.set("status", "complete");
    return aggregateResults(ruleResults, aiResults);
  },
});

// Trigger from API route
const handle = await processQATask.trigger({ fileId, units });

// Client-side: use Realtime hooks
const { data } = useRealtimeRun(handle.id);
// data.metadata.progress gives real-time progress
```

**Source References:**
- Trigger.dev Documentation: https://trigger.dev/docs
- Trigger.dev GitHub: https://github.com/triggerdotdev/trigger.dev
- Trigger.dev v3 Overview: https://trigger.dev/docs/v3

---

### 1.4 QStash (Upstash)

**What it is:** A serverless HTTP-based message queue by Upstash. Sends messages to your HTTP endpoints with guaranteed delivery, retries, and scheduling.

**Architecture:**
```
Next.js API Route --> QStash HTTP Publish --> Your API Route (callback)
       |                                           |
       +--- Upstash Redis (polling) <--- Status ---+
```

**Key Features:**
- HTTP-based messaging (no connections, no Redis client needed)
- Guaranteed at-least-once delivery
- Retry with configurable backoff
- Scheduled/delayed messages
- Batch publishing
- URL Groups (fan-out to multiple endpoints)
- Callback URLs (notify when done)
- Works with any HTTP endpoint
- Built on Upstash (serverless Redis infrastructure)

**Pros:**
- Truly serverless (works perfectly on Vercel)
- No Redis connection management
- Simple HTTP API
- Pay-per-message pricing
- Callback URL pattern for chaining jobs
- Good for simple fire-and-forget patterns
- DLQ (Dead Letter Queue) for failed messages

**Cons:**
- Not designed for complex workflow orchestration
- No built-in progress tracking
- Each "step" is a separate HTTP request (cold starts)
- Less suitable for tightly coupled batch processing
- No built-in concurrency control (you manage it)
- Limited orchestration compared to Inngest/Trigger.dev
- Breaking large jobs into HTTP call chains is awkward

**Cost:**
- Free: 500 messages/day
- Pay-as-you-go: $1 per 100K messages
- Pro: $180/mo for 500K messages/day

**Pattern for QA Localization Tool:**
```typescript
// Publish job to QStash
import { Client } from "@upstash/qstash";
const qstash = new Client({ token: process.env.QSTASH_TOKEN });

// Start processing
await qstash.publishJSON({
  url: `${BASE_URL}/api/process-batch`,
  body: { fileId, batchIndex: 0, totalBatches: 47 },
  retries: 3,
  callback: `${BASE_URL}/api/process-callback`,
});

// Each batch endpoint processes and chains to next
// api/process-batch.ts
export async function POST(req) {
  const { fileId, batchIndex, totalBatches } = await req.json();

  // Process this batch
  const result = await callClaudeAPI(getBatch(fileId, batchIndex));
  await saveResult(fileId, batchIndex, result);

  // Chain to next batch
  if (batchIndex + 1 < totalBatches) {
    await qstash.publishJSON({
      url: `${BASE_URL}/api/process-batch`,
      body: { fileId, batchIndex: batchIndex + 1, totalBatches },
    });
  }
}
```

**Source References:**
- QStash Documentation: https://upstash.com/docs/qstash
- Upstash QStash GitHub: https://github.com/upstash/qstash-js
- QStash + Next.js: https://upstash.com/docs/qstash/quickstarts/nextjs

---

### 1.5 Comparison Matrix

| Feature | BullMQ + Redis | Inngest | Trigger.dev | QStash |
|---------|---------------|---------|-------------|--------|
| **Architecture** | Redis queue + worker | Event-driven durable functions | Managed task runner | HTTP message queue |
| **Serverless Compatible** | No (needs worker) | Yes | Yes | Yes |
| **Vercel Compatible** | Partial (enqueue only) | Yes (native) | Yes (native) | Yes (native) |
| **Redis Required** | Yes | No | No | No |
| **Progress Tracking** | Built-in (excellent) | Custom (via DB/steps) | Built-in (good) | Manual |
| **Retry/Backoff** | Excellent | Excellent (per step) | Good | Good |
| **Rate Limiting** | Built-in | Built-in | Basic | Manual |
| **Concurrency Control** | Excellent | Good | Good | Manual |
| **Max Duration** | Unlimited | Varies (step-based) | 5min free, longer paid | Serverless timeout |
| **Dashboard** | bull-board (DIY) | Included (Cloud) | Included | Basic |
| **Local Dev** | Redis needed | Dev server included | CLI included | Tunnel needed |
| **Community/Maturity** | Very mature | Growing (est. 2022) | Growing (est. 2022) | Mature (Upstash) |
| **Self-hostable** | Yes | Yes | Complex | No |
| **Free Tier** | OSS (need Redis) | 50K steps/mo | 30K runs/mo | 500 msg/day |
| **Paid Starting** | Redis cost only | $50/mo | $50/mo | $1/100K msgs |
| **TypeScript** | Excellent | Excellent | Excellent | Good |
| **Complexity** | Medium | Low-Medium | Low | Medium (for workflows) |

### 1.6 Recommendation for QA Localization Tool

**Primary Recommendation: Inngest**

Reasoning:
1. **Zero infrastructure for MVP** - No Redis, no worker process to manage
2. **Step functions solve the batch problem** - Each Claude API batch is a durable step; if one fails, it retries just that step
3. **Works on Vercel** - No separate hosting needed initially
4. **Free tier covers MVP** - 50K steps/mo handles hundreds of QA runs
5. **Progress via DB update steps** - Natural pattern for our SSE/polling progress
6. **Concurrency/throttling built-in** - Important for Claude API rate limits
7. **Migration path** - Can self-host later if needed

**Secondary Recommendation: BullMQ + Redis**

If deploying on Railway (not Vercel), BullMQ gives:
- More control over execution
- Better built-in progress events
- More mature ecosystem
- No vendor dependency
- Best for the Vercel + Railway worker split architecture

**Not Recommended for this project:**
- **QStash**: Too low-level for complex batch orchestration; no progress tracking
- **Trigger.dev**: Good option but 5-min free tier limit may be tight for large files; Inngest's step-based approach is more natural for batch processing

---

## 2. Real-time Progress Updates

### Context: What We Need

When a user uploads an XLIFF file with 1,000+ translation units:
- Processing takes 30+ seconds (possibly minutes for large files)
- User needs to see: "Processing batch 15 of 47... 32%"
- Optionally show partial results as they come in

### 2.1 Server-Sent Events (SSE)

**What it is:** A one-way server-to-client streaming protocol over HTTP. Server keeps the connection open and pushes events.

**Next.js App Router Implementation:**
```typescript
// app/api/qa/[runId]/progress/route.ts
export async function GET(
  req: NextRequest,
  { params }: { params: { runId: string } }
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      // Poll DB for progress updates
      const interval = setInterval(async () => {
        const run = await db.qaRun.findUnique({
          where: { id: params.runId }
        });

        send({
          status: run.status,
          progress: run.progress,
          processedBatches: run.processedBatches,
          totalBatches: run.totalBatches,
          currentPhase: run.currentPhase,
        });

        if (run.status === 'completed' || run.status === 'failed') {
          clearInterval(interval);
          controller.close();
        }
      }, 1000); // Poll every second

      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**Client-side:**
```typescript
// hooks/useQAProgress.ts
export function useQAProgress(runId: string) {
  const [progress, setProgress] = useState<QAProgress | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(`/api/qa/${runId}/progress`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data);

      if (data.status === 'completed' || data.status === 'failed') {
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      // Fallback to polling
    };

    return () => eventSource.close();
  }, [runId]);

  return progress;
}
```

**Pros:**
- Native browser API (EventSource)
- Simple to implement
- Auto-reconnect built into EventSource
- Works with HTTP/2
- Low overhead

**Cons:**
- Vercel has a 25-second function timeout (SSE needs workaround or streaming response)
- One-directional only
- Limited to ~6 connections per domain in HTTP/1.1
- Vercel Serverless: SSE works with streaming but connection may be dropped at 25s
- Vercel Edge Runtime: Better SSE support, but limited Node.js APIs

**Vercel SSE Workaround:**
- Use Vercel Edge Runtime (longer streaming support)
- Or use SSE backed by DB polling (the SSE endpoint just polls DB and streams)
- Vercel supports streaming responses in Edge and Node runtimes

---

### 2.2 WebSockets

**What it is:** Full-duplex communication channel over a single TCP connection.

**Challenges with Next.js/Vercel:**
- Vercel does NOT support WebSockets natively in serverless functions
- Need a separate WebSocket server (Socket.io, ws library)
- Or use a managed service (Pusher, Ably, Soketi)

**Not recommended for Vercel deployment.** Additional complexity without significant benefit over SSE for this use case (one-directional progress updates).

---

### 2.3 Polling

**What it is:** Client periodically requests status from an API endpoint.

**Implementation:**
```typescript
// Client-side polling hook
export function useQAProgressPolling(runId: string, intervalMs = 2000) {
  const { data, error } = useSWR(
    runId ? `/api/qa/${runId}/status` : null,
    fetcher,
    {
      refreshInterval: (data) => {
        if (data?.status === 'completed' || data?.status === 'failed') {
          return 0; // Stop polling
        }
        return intervalMs;
      },
    }
  );
  return { progress: data, error };
}

// API endpoint (simple)
// app/api/qa/[runId]/status/route.ts
export async function GET(req, { params }) {
  const run = await db.qaRun.findUnique({
    where: { id: params.runId },
    select: {
      status: true,
      progress: true,
      totalBatches: true,
      processedBatches: true,
      qualityScore: true,
    },
  });
  return Response.json(run);
}
```

**Pros:**
- Simplest to implement
- Works everywhere (Vercel, Railway, anywhere)
- No connection management
- No serverless timeout issues
- SWR/React Query make it elegant
- Easy to cache and optimize

**Cons:**
- Not truly real-time (1-2s delay typical)
- More HTTP requests (but small payloads)
- Slight inefficiency (requests even when no change)

---

### 2.4 Pusher / Ably (Managed Real-time)

**What it is:** Third-party real-time messaging services that handle WebSocket infrastructure.

**Pattern:**
```typescript
// Server-side (in Inngest step or BullMQ worker)
import Pusher from "pusher";
const pusher = new Pusher({ /* config */ });

// After each batch
await pusher.trigger(`qa-run-${runId}`, 'progress', {
  progress: 45,
  batch: 15,
  total: 47,
});

// Client-side
import PusherClient from "pusher-js";
const channel = pusher.subscribe(`qa-run-${runId}`);
channel.bind('progress', (data) => {
  setProgress(data);
});
```

**Pros:**
- True real-time (sub-100ms latency)
- Works perfectly with Vercel
- Handles connection management, reconnection
- Scales automatically

**Cons:**
- Additional cost ($0 free for 200K messages/day on Pusher)
- Another service dependency
- Overkill for progress updates at 1-2s intervals

---

### 2.5 Recommendation for Progress Updates

**Primary Recommendation: Polling with SWR**

Reasoning:
1. **Simplest, most reliable** - Works on any platform
2. **2-second polling is fine** for QA jobs that take 30+ seconds
3. **No serverless timeout issues** on Vercel
4. **SWR handles everything** - caching, revalidation, error retry, focus refetch
5. **Zero additional infrastructure**
6. **Easy to test**

**Implementation Pattern:**
```
Job processor (Inngest/BullMQ) --> Updates DB (progress field) --> SWR polls API --> UI updates
```

**Upgrade Path:**
- Start with polling (Phase 1 MVP)
- Add SSE if polling latency becomes a UX issue (likely not needed)
- Add Pusher/Ably only if you need sub-second updates (Phase 2+)

---

## 3. File Processing Patterns

### 3.1 Handling Large XLIFF Uploads

**Vercel Limits:**
- Serverless function payload: 4.5MB (request body)
- Edge function payload: 4.5MB
- Vercel Blob storage: up to 500MB per file (on Pro plan)
- Function timeout: 10s (Hobby), 60s (Pro), 300s (Enterprise)

**Strategy for Large Files:**

```
Option A: Direct Upload to Storage (Recommended)
┌──────────┐    ┌─────────┐    ┌──────────────┐    ┌────────┐
│  Client   │ -> │ Presigned│ -> │ Upload to S3 │ -> │ Process│
│  Browser  │    │ URL API  │    │ / Vercel Blob│    │ Job    │
└──────────┘    └─────────┘    └──────────────┘    └────────┘

Option B: Chunked Upload
┌──────────┐    ┌─────────────┐    ┌──────────┐
│  Client   │ -> │ Upload chunks│ -> │ Reassemble│
│  Browser  │    │ sequentially │    │ & Process │
└──────────┘    └─────────────┘    └──────────┘
```

**Recommended: Vercel Blob + Presigned URLs**
```typescript
// Step 1: Get upload URL
// app/api/upload/route.ts
import { put } from '@vercel/blob';

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  // Upload to Vercel Blob
  const blob = await put(file.name, file, {
    access: 'public',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  // Trigger processing job
  await inngest.send({
    name: "qa/xliff.uploaded",
    data: {
      fileUrl: blob.url,
      fileName: file.name,
      userId: session.user.id,
    },
  });

  return Response.json({ uploadUrl: blob.url, jobId: '...' });
}
```

**Alternative: S3 Presigned URL (for larger files)**
```typescript
// Generate presigned URL for direct browser -> S3 upload
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function GET(req: Request) {
  const command = new PutObjectCommand({
    Bucket: 'qa-uploads',
    Key: `uploads/${userId}/${fileName}`,
    ContentType: 'application/xliff+xml',
  });

  const presignedUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 3600,
  });

  return Response.json({ uploadUrl: presignedUrl });
}
```

### 3.2 Streaming XLIFF Parsing

**Challenge:** XLIFF files can be 10MB+ with thousands of `<trans-unit>` elements. Loading entire file into memory and parsing DOM is slow.

**SAX-based Streaming (Recommended for large files):**
```typescript
import { SaxesParser } from 'saxes';

async function* parseXliffStream(
  stream: ReadableStream
): AsyncGenerator<TranslationUnit> {
  const parser = new SaxesParser();
  let currentUnit: Partial<TranslationUnit> = {};
  let currentElement = '';
  let textBuffer = '';

  parser.on('opentag', (node) => {
    if (node.name === 'trans-unit') {
      currentUnit = { id: node.attributes.id as string };
    }
    currentElement = node.name;
    textBuffer = '';
  });

  parser.on('text', (text) => {
    textBuffer += text;
  });

  parser.on('closetag', (name) => {
    if (name === 'source') currentUnit.source = textBuffer;
    if (name === 'target') currentUnit.target = textBuffer;
    if (name === 'trans-unit') {
      // Yield each unit as it's parsed (streaming)
      yield currentUnit as TranslationUnit;
    }
  });

  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.write(new TextDecoder().decode(value));
  }
}
```

**For MVP: DOM parsing is fine**

For files under 5MB (common case), using a standard XML parser like `fast-xml-parser` or `xml2js` is simpler:

```typescript
import { XMLParser } from 'fast-xml-parser';

function parseXliff(xmlString: string): TranslationUnit[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  const doc = parser.parse(xmlString);
  const units = doc.xliff.file.body['trans-unit'];

  return units.map((unit: any) => ({
    id: unit['@_id'],
    source: unit.source,
    target: unit.target,
    note: unit.note,
  }));
}
```

### 3.3 Chunked Processing Pattern

**Batch Strategy for Claude API:**
```typescript
interface BatchConfig {
  batchSize: number;       // 10-15 units per API call
  concurrentBatches: number; // 3-5 parallel API calls
  retryAttempts: number;    // 3 retries per batch
  rateLimitPerMinute: number; // Claude API rate limit
}

async function processInBatches(
  units: TranslationUnit[],
  config: BatchConfig,
  onProgress: (progress: number) => Promise<void>
): Promise<QAResult[]> {
  const batches = chunkArray(units, config.batchSize);
  const results: QAResult[] = [];

  // Process with controlled concurrency
  const semaphore = new Semaphore(config.concurrentBatches);

  await Promise.all(
    batches.map(async (batch, index) => {
      await semaphore.acquire();
      try {
        const result = await withRetry(
          () => callClaudeAPI(batch),
          config.retryAttempts
        );
        results.push(...result);

        await onProgress(((index + 1) / batches.length) * 100);
      } finally {
        semaphore.release();
      }
    })
  );

  return results;
}
```

### 3.4 File Size Guidelines

| File Size | Translation Units | API Calls (~15/batch) | Est. Duration | Strategy |
|-----------|-------------------|----------------------|---------------|----------|
| < 100KB | < 100 | ~7 | 5-10s | Synchronous possible |
| 100KB-1MB | 100-1,000 | ~67 | 30-60s | Queue + progress |
| 1-5MB | 1,000-5,000 | ~333 | 2-5min | Queue + progress (required) |
| 5-20MB | 5,000-20,000 | ~1,333 | 10-20min | Streaming parse + queue |
| > 20MB | 20,000+ | 1,333+ | 20min+ | Chunked upload + streaming |

---

## 4. Deployment Architecture Patterns

### 4.1 Option A: Full Vercel + Inngest (Recommended for MVP)

```
┌─────────────────────────────────────────────┐
│                   Vercel                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ Next.js  │  │ API      │  │ Inngest   │  │
│  │ Frontend │  │ Routes   │  │ Functions │  │
│  └──────────┘  └──────────┘  └───────────┘  │
└───────────────────┬─────────────────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
   ┌────┴────┐ ┌───┴───┐ ┌────┴─────┐
   │Inngest  │ │Vercel │ │Neon/     │
   │Cloud    │ │Blob   │ │Supabase  │
   │(Jobs)   │ │(Files)│ │(Postgres)│
   └─────────┘ └───────┘ └──────────┘
```

**Pros:**
- Simplest deployment: single `git push`
- No infrastructure management
- Vercel handles frontend + API
- Inngest handles background jobs
- Auto-scaling built in
- Great DX with preview deployments

**Cons:**
- Vercel function timeouts (10s Hobby / 60s Pro)
- Inngest step-based execution adds some latency
- Vercel Pro ($20/mo) likely needed for production

**Cost Estimate (Small-Medium):**
| Service | Plan | Cost/mo |
|---------|------|---------|
| Vercel | Pro | $20 |
| Inngest | Free/Pro | $0-50 |
| Neon PostgreSQL | Free | $0 |
| Vercel Blob | Free tier | $0 |
| Claude API | Usage-based | $10-50 |
| **Total** | | **$30-120/mo** |

---

### 4.2 Option B: Vercel + Railway Worker (BullMQ)

```
┌──────────────────────┐     ┌──────────────────────┐
│       Vercel          │     │       Railway          │
│  ┌──────────┐        │     │  ┌──────────────┐     │
│  │ Next.js  │        │     │  │ BullMQ Worker│     │
│  │ Frontend │        │     │  │ (Node.js)    │     │
│  │ + API    │        │     │  └──────┬───────┘     │
│  └────┬─────┘        │     │         │              │
│       │              │     │  ┌──────┴───────┐     │
│       │              │     │  │    Redis      │     │
│       │              │     │  │   (Railway)   │     │
└───────┼──────────────┘     │  └──────────────┘     │
        │                     └──────────────────────┘
        │
   ┌────┴─────┐
   │ Neon/    │
   │ Supabase │
   │(Postgres)│
   └──────────┘
```

**Pros:**
- More control over worker execution
- BullMQ is battle-tested
- Better for very long-running jobs
- Railway is simple to deploy (Dockerfile or Nixpacks)
- Redis on Railway is easy to set up

**Cons:**
- Two deployments to manage
- Need to keep worker code in sync with web app
- Redis costs money
- More moving parts

**Cost Estimate (Small-Medium):**
| Service | Plan | Cost/mo |
|---------|------|---------|
| Vercel | Pro | $20 |
| Railway (Worker) | Hobby | $5 |
| Railway (Redis) | Add-on | $5-10 |
| Neon PostgreSQL | Free | $0 |
| Claude API | Usage-based | $10-50 |
| **Total** | | **$40-85/mo** |

---

### 4.3 Option C: Full Railway Deployment

```
┌─────────────────────────────────────────┐
│               Railway                     │
│  ┌──────────┐  ┌──────────┐  ┌───────┐  │
│  │ Next.js  │  │ BullMQ   │  │ Redis │  │
│  │ App      │  │ Worker   │  │       │  │
│  │ (Web)    │  │          │  │       │  │
│  └──────────┘  └──────────┘  └───────┘  │
│                                           │
│  ┌──────────────┐                        │
│  │  PostgreSQL   │                        │
│  │  (Railway)    │                        │
│  └──────────────┘                        │
└─────────────────────────────────────────┘
```

**Pros:**
- Everything in one platform
- Simple networking (internal network)
- No cold starts
- Full control over all services
- PostgreSQL included
- No serverless limitations

**Cons:**
- No edge network / CDN (slower for global users)
- No preview deployments (manual setup needed)
- You manage scaling
- Less DX polish than Vercel

**Cost Estimate (Small-Medium):**
| Service | Plan | Cost/mo |
|---------|------|---------|
| Railway (Next.js) | Hobby | $5 |
| Railway (Worker) | Hobby | $5 |
| Railway (Redis) | Add-on | $5 |
| Railway (Postgres) | Add-on | $5 |
| Claude API | Usage-based | $10-50 |
| **Total** | | **$30-70/mo** |

---

### 4.4 Option D: Fly.io Full Deployment

Similar to Railway but with:
- Global edge deployment
- Built-in Redis (Upstash on Fly)
- Machines API for worker scaling
- Slightly more complex setup
- Free tier includes 3 shared CPUs

---

### 4.5 Monorepo vs Separate Services

**Monorepo (Recommended):**
```
qa-localization-tool/
├── apps/
│   └── web/              # Next.js app (Vercel)
├── packages/
│   ├── core/             # Shared business logic
│   │   ├── xliff-parser/
│   │   ├── rule-engine/
│   │   ├── ai-engine/
│   │   └── types/
│   ├── db/               # Prisma schema + client
│   └── config/           # Shared config
├── turbo.json
└── package.json
```

**Why Monorepo:**
- Shared types between web and worker
- Shared business logic (rule engine, AI engine)
- Single PR for related changes
- Turborepo/Nx handle build caching
- Easy to extract worker later if needed

**When to use Separate Repos:**
- Different teams own different services
- Different deployment cadences
- Different languages (not our case)

**For MVP:** Start with a flat Next.js project. Extract to monorepo when adding a separate worker or when complexity warrants it.

---

### 4.6 Architecture Recommendation

**Phase 1 (MVP): Option A - Vercel + Inngest**
- Fastest to ship
- Lowest complexity
- Free/cheap to start
- Inngest handles all background job needs
- Single deployable unit

**Phase 2 (Scale): Option B - Vercel + Railway Worker**
- When jobs get complex or need more control
- When rate limiting becomes sophisticated
- Extract worker to Railway with BullMQ + Redis

**Phase 3 (Growth): Evaluate based on usage patterns**
- If global users: Stay Vercel + Railway
- If cost-sensitive: Full Railway
- If enterprise: Consider AWS/GCP with ECS/Cloud Run

---

## 5. CI/CD for Phase 3

### 5.1 GitHub Actions Patterns

**Basic CI/CD Pipeline:**
```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  e2e:
    runs-on: ubuntu-latest
    needs: [lint-and-type-check, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps
      - run: pnpm test:e2e
```

**Vercel Auto-Deploy:**
Vercel automatically deploys on push to main and creates preview deployments for PRs. No GitHub Action needed for deployment itself.

### 5.2 API Endpoint Design for CI/CD Integration

**Phase 3 Feature: Allow CI/CD pipelines to trigger QA checks.**

```
POST /api/v1/qa/run
Authorization: Bearer <api-key>
Content-Type: multipart/form-data

{
  "file": <xliff-file>,
  "sourceLang": "en",
  "targetLang": "th",
  "options": {
    "checks": ["rules", "ai"],
    "failThreshold": 70,          // Fail if score < 70
    "severityThreshold": "high",  // Fail if any high+ issues
  },
  "callback": {                    // Optional webhook
    "url": "https://your-ci.com/webhook",
    "secret": "webhook-secret"
  }
}

// Response (immediate)
{
  "runId": "run_abc123",
  "status": "queued",
  "statusUrl": "/api/v1/qa/run/run_abc123",
}
```

**Status Endpoint:**
```
GET /api/v1/qa/run/{runId}
Authorization: Bearer <api-key>

// Response
{
  "runId": "run_abc123",
  "status": "completed",          // queued | processing | completed | failed
  "progress": 100,
  "result": {
    "qualityScore": 78,
    "passed": true,                // Based on failThreshold
    "issueCount": {
      "critical": 0,
      "high": 2,
      "medium": 5,
      "low": 3
    },
    "detailsUrl": "https://app.qatool.com/runs/run_abc123"
  }
}
```

### 5.3 GitHub Actions Integration Example

```yaml
# In user's CI pipeline
- name: Run QA Check
  uses: your-org/qa-localization-action@v1
  with:
    api-key: ${{ secrets.QA_TOOL_API_KEY }}
    file: ./translations/en-th.xliff
    source-lang: en
    target-lang: th
    fail-threshold: 70

# Or with curl
- name: Run QA Check
  run: |
    # Submit file
    RESPONSE=$(curl -s -X POST \
      -H "Authorization: Bearer ${{ secrets.QA_API_KEY }}" \
      -F "file=@./translations/en-th.xliff" \
      -F "sourceLang=en" \
      -F "targetLang=th" \
      https://app.qatool.com/api/v1/qa/run)

    RUN_ID=$(echo $RESPONSE | jq -r '.runId')

    # Poll until complete
    while true; do
      STATUS=$(curl -s \
        -H "Authorization: Bearer ${{ secrets.QA_API_KEY }}" \
        https://app.qatool.com/api/v1/qa/run/$RUN_ID)

      STATE=$(echo $STATUS | jq -r '.status')
      if [ "$STATE" = "completed" ]; then
        SCORE=$(echo $STATUS | jq -r '.result.qualityScore')
        echo "QA Score: $SCORE"
        if [ $SCORE -lt 70 ]; then
          echo "::error::QA score $SCORE is below threshold 70"
          exit 1
        fi
        break
      elif [ "$STATE" = "failed" ]; then
        echo "::error::QA check failed"
        exit 1
      fi
      sleep 5
    done
```

### 5.4 Webhook Pattern

```typescript
// When QA run completes, send webhook
async function sendWebhook(run: QARun, callbackConfig: CallbackConfig) {
  const payload = {
    event: 'qa.run.completed',
    runId: run.id,
    timestamp: new Date().toISOString(),
    result: {
      qualityScore: run.qualityScore,
      status: run.status,
      issueCount: run.issueCount,
      detailsUrl: `${APP_URL}/runs/${run.id}`,
    },
  };

  const signature = crypto
    .createHmac('sha256', callbackConfig.secret)
    .update(JSON.stringify(payload))
    .digest('hex');

  await fetch(callbackConfig.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-QA-Signature': signature,
    },
    body: JSON.stringify(payload),
  });
}
```

### 5.5 API Key Management

```typescript
// API keys for CI/CD integration
// Store as hashed values, show once on creation
interface ApiKey {
  id: string;
  teamId: string;
  name: string;           // "GitHub Actions - main repo"
  keyHash: string;        // bcrypt hash
  prefix: string;         // "qat_...abc" for identification
  permissions: string[];  // ["qa:run", "qa:read"]
  lastUsedAt: Date;
  createdAt: Date;
  expiresAt: Date | null;
}
```

---

## 6. Recommendation Summary

### MVP (Phase 1) Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    RECOMMENDED MVP STACK                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Frontend:    Next.js 14+ (App Router) + Tailwind + shadcn/ui
│  Backend:     Next.js API Routes                         │
│  Database:    Neon PostgreSQL (free tier)                │
│  ORM:         Prisma                                     │
│  Auth:        NextAuth.js v5 + Google OAuth              │
│  File Store:  Vercel Blob                                │
│  Queue:       Inngest (free tier)                        │
│  AI:          Claude API (Sonnet)                        │
│  Progress:    SWR Polling (2s interval)                  │
│  Hosting:     Vercel (Pro - $20/mo)                     │
│  CI/CD:       Vercel auto-deploy + GitHub Actions        │
│                                                          │
│  Total Cost:  ~$30-50/mo (excluding Claude API usage)   │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Key Decisions Rationale

| Decision | Choice | Why |
|----------|--------|-----|
| **Queue System** | Inngest | Zero infra, Vercel-native, durable steps, free tier |
| **Progress Updates** | SWR Polling | Simple, reliable, no timeout issues |
| **File Upload** | Vercel Blob | Integrated, free tier, no S3 config |
| **XLIFF Parsing** | fast-xml-parser (MVP) | Simple, fast enough for < 5MB files |
| **Deployment** | Vercel | Best DX, auto-deploy, preview URLs |
| **Database** | Neon PostgreSQL | Free tier, serverless, Prisma compatible |

### Migration Path

```
Phase 1 (MVP)           Phase 2 (Scale)              Phase 3 (Enterprise)
─────────────          ──────────────────           ──────────────────────
Vercel + Inngest   --> Vercel + Railway Worker  --> Multi-region deployment
SWR Polling        --> SSE or Pusher            --> WebSocket + Pusher
Vercel Blob        --> S3 + CloudFront          --> S3 + CDN
Neon Free          --> Neon Pro / Supabase      --> Managed PostgreSQL
                       BullMQ + Redis               Dedicated Redis cluster
                       API Keys for CI/CD            Full webhook system
                                                     Custom GitHub Action
```

---

## Source References

### Official Documentation
- **BullMQ**: https://docs.bullmq.io/
- **Inngest**: https://www.inngest.com/docs
- **Trigger.dev**: https://trigger.dev/docs
- **QStash/Upstash**: https://upstash.com/docs/qstash
- **Next.js Streaming**: https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming
- **Vercel Blob**: https://vercel.com/docs/storage/vercel-blob
- **Vercel Limits**: https://vercel.com/docs/functions/limitations
- **Neon PostgreSQL**: https://neon.tech/docs
- **Prisma**: https://www.prisma.io/docs
- **SWR**: https://swr.vercel.app/
- **fast-xml-parser**: https://github.com/NaturalIntelligence/fast-xml-parser
- **Railway**: https://docs.railway.app/

### Architecture References
- **Inngest vs BullMQ**: https://www.inngest.com/blog/inngest-vs-bullmq
- **Inngest + Next.js**: https://www.inngest.com/docs/frameworks/nextjs
- **Vercel + Background Jobs**: https://vercel.com/guides/how-to-setup-cron-jobs-on-vercel
- **Server-Sent Events MDN**: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events

### Pricing Pages (verify current pricing)
- **Vercel Pricing**: https://vercel.com/pricing
- **Inngest Pricing**: https://www.inngest.com/pricing
- **Trigger.dev Pricing**: https://trigger.dev/pricing
- **Upstash Pricing**: https://upstash.com/pricing
- **Railway Pricing**: https://railway.app/pricing
- **Neon Pricing**: https://neon.tech/pricing
- **Anthropic/Claude Pricing**: https://www.anthropic.com/pricing

---

*Research compiled: 2026-02-11*
*Knowledge cutoff note: Information is based on knowledge up to May 2025. Verify current pricing, features, and API changes from official documentation links above before making final decisions.*
