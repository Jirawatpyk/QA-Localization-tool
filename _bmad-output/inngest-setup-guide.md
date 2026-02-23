# Inngest Local Dev Setup Guide

**Owner:** Charlie (Senior Dev)
**Created:** 2026-02-23 (Epic 1 Retrospective — Preparation Task P2)
**Purpose:** Step-by-step guide to run Inngest Dev Server locally and
  verify the patterns Epic 2 will use before writing production functions.

---

## Current State (Post-Epic 1)

The project has Inngest scaffolded but no functions registered yet:

```
src/lib/inngest/client.ts          ← Inngest client (app id: qa-localization-tool)
src/app/api/inngest/route.ts       ← serve() endpoint — functions array is empty
src/features/pipeline/inngest/     ← Does NOT exist yet — Epic 2 creates this
```

---

## Step 1: Start the Dev Stack

```bash
# Terminal 1 — Next.js dev server
npm run dev

# Terminal 2 — Inngest Dev Server (connects to your local Next.js)
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

The Inngest Dev Server opens at **http://localhost:8288**
You should see the `qa-localization-tool` app auto-detected.

**Troubleshooting:**
- If app not detected: verify `npm run dev` is running and port 3000 is accessible
- If `inngest-cli` not found: `npm install -D inngest-cli` or use `npx`
- Windows users: run both terminals in the same shell profile (WSL or Git Bash)

---

## Step 2: Verify the Serve Endpoint

Open `http://localhost:3000/api/inngest` in browser — should return:
```json
{ "message": "Inngest endpoint", "hasEventKey": false, "hasSigningKey": false }
```
`hasEventKey: false` is expected in local dev (no `.env` key needed for Dev Server).

---

## Step 3: Function Patterns for Epic 2

### 3a. Basic Function Structure

```typescript
// src/features/pipeline/inngest/processPipeline.ts
import { inngest } from '@/lib/inngest/client'

export const processPipeline = inngest.createFunction(
  {
    id: 'process-pipeline',          // kebab-case, unique across app
    name: 'Process QA Pipeline',
    concurrency: {
      key: 'event.data.projectId',   // 1 pipeline per project at a time
      limit: 1,
    },
  },
  { event: 'pipeline.started' },     // dot-notation event name
  async ({ event, step }) => {
    const { fileId, projectId, tenantId, mode } = event.data

    // Each step has a deterministic ID — Inngest uses this for retries
    const segments = await step.run(`parse-file-${fileId}`, async () => {
      // Do work here — NO try-catch (let Inngest handle retries)
      return await parseFile(fileId, tenantId)
    })

    const findings = await step.run(`l1-rules-${fileId}`, async () => {
      return await runL1Rules(segments, tenantId)
    })

    if (mode === 'thorough') {
      await step.run(`l2-screening-${fileId}`, async () => {
        return await runL2Screening(findings, tenantId)
      })
    }

    return { fileId, findingCount: findings.length }
  },
)
```

### 3b. Critical Rules for Every Function

```typescript
// ✅ Deterministic step IDs — include entity ID
await step.run(`segment-${segmentId}-L1`, async () => { ... })
await step.run(`batch-${batchId}-L2`, async () => { ... })

// ✅ Concurrency key for score atomicity
concurrency: { key: 'event.data.projectId', limit: 1 }

// ✅ Event names — dot-notation
{ event: 'pipeline.started' }
{ event: 'finding.changed' }

// ❌ NO try-catch inside step.run() — let Inngest retry
await step.run('my-step', async () => {
  try {                          // ← FORBIDDEN
    return await riskyOperation()
  } catch (e) {
    return null                  // ← hides errors from Inngest retry logic
  }
})
```

### 3c. Sending Events

```typescript
import { inngest } from '@/lib/inngest/client'

// In a Server Action or Route Handler:
await inngest.send({
  name: 'pipeline.started',
  data: {
    fileId: file.id,
    projectId: file.projectId,
    tenantId: file.tenantId,
    mode: 'economy',             // 'economy' | 'thorough'
  },
})
```

### 3d. Registering Functions

Every new function MUST be added to the registry in `src/app/api/inngest/route.ts`:

```typescript
// src/app/api/inngest/route.ts
import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { processPipeline } from '@/features/pipeline/inngest/processPipeline'
import { recalculateScore } from '@/features/scoring/inngest/recalculateScore'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processPipeline,
    recalculateScore,
  ],
})
```

---

## Step 4: Trigger a Function from Dev Server

1. Open **http://localhost:8288**
2. Click **"Send Event"**
3. Enter event name: `pipeline.started`
4. Enter payload:
```json
{
  "fileId": "00000000-0000-0000-0000-000000000001",
  "projectId": "00000000-0000-0000-0000-000000000002",
  "tenantId": "00000000-0000-0000-0000-000000000003",
  "mode": "economy"
}
```
5. Click **"Send"** — watch the function run in the Dev Server UI

---

## Step 5: Unit Testing Inngest Functions

Mock `step.run()` in unit tests — do NOT use the real Inngest client:

```typescript
// src/features/pipeline/inngest/processPipeline.test.ts
import { describe, it, expect, vi } from 'vitest'
import { processPipeline } from './processPipeline'

describe('processPipeline', () => {
  it('should run L1 step for economy mode', async () => {
    const mockStep = {
      run: vi.fn(async (id: string, fn: () => Promise<unknown>) => fn()),
    }

    const result = await processPipeline.handler(
      {
        event: {
          name: 'pipeline.started',
          data: { fileId: 'f-1', projectId: 'p-1', tenantId: 't-1', mode: 'economy' },
        },
        step: mockStep as never,
      }
    )

    expect(mockStep.run).toHaveBeenCalledWith(
      expect.stringContaining('l1-rules-f-1'),
      expect.any(Function),
    )
    expect(result).toMatchObject({ fileId: 'f-1' })
  })
})
```

**Rule:** Co-locate tests next to function files: `processPipeline.test.ts` next to
`processPipeline.ts`.

---

## Env Variables for Inngest (Production)

Add to `.env.local` for production-like local testing:

```bash
# .env.local
INNGEST_EVENT_KEY=your-event-key-from-inngest-dashboard
INNGEST_SIGNING_KEY=your-signing-key-from-inngest-dashboard
```

For local Dev Server, these are optional — Dev Server bypasses auth.

---

## Quick Reference

| Task | Command / Location |
|------|-------------------|
| Start Dev Server | `npx inngest-cli dev -u http://localhost:3000/api/inngest` |
| Dev Server UI | `http://localhost:8288` |
| Inngest client | `src/lib/inngest/client.ts` |
| Serve endpoint | `src/app/api/inngest/route.ts` — add functions here |
| Function location | `src/features/pipeline/inngest/{name}.ts` |
| Event naming | `pipeline.started`, `finding.changed` (dot-notation) |
| Function ID | kebab-case: `process-pipeline`, `recalculate-score` |
| Step ID | deterministic with entity ID: `l1-rules-${fileId}` |
| Concurrency | `{ key: 'event.data.projectId', limit: 1 }` |
| Unit test mock | `step.run: vi.fn(async (id, fn) => fn())` |
