# 26. Integration Patterns Analysis

### AI Engine Integration (Claude API + Vercel AI SDK v6)

#### Structured Output Pattern

The Vercel AI SDK v6 introduces a unified approach for combining tool calling with structured output generation. The key API change is moving from `generateObject()` to `generateText()` with `Output.object()`:

```typescript
import { generateText, Output } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

const qaResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  issues: z.array(z.object({
    segmentId: z.string(),
    severity: z.enum(['critical', 'major', 'minor', 'suggestion']),
    category: z.enum(['accuracy', 'fluency', 'terminology', 'style', 'locale']),
    description: z.string(),
    suggestion: z.string().optional(),
  })),
});

const result = await generateText({
  model: anthropic('claude-sonnet-4-20250514'),
  prompt: `Analyze the following translation segments...`,
  experimental_output: Output.object({ schema: qaResultSchema }),
});
```

**Key advantage**: `Output.object()` can now be combined with tool calling in the same request. When using tools with structured output, generating the structured output counts as a step — configure `stopWhen` to allow enough steps for both tool execution and output generation.

_99.8% successful JSON extraction rate with schema validation_
_Source: [AI SDK 6 Blog](https://vercel.com/blog/ai-sdk-6), [Vercel Academy](https://vercel.com/academy/ai-sdk/structured-data-extraction)_

#### Claude API Native Structured Outputs

Anthropic also offers native structured outputs (beta) independent of the AI SDK:
- Header: `anthropic-beta: structured-outputs-2025-11-13`
- Compiles JSON schema into grammar for token-level enforcement
- Expect 100-300ms overhead for initial schema compilation, cached for 24 hours
- For production: warm the cache by sending a dummy request during deployment

_Source: [Claude API Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)_

#### Batch Processing Integration

For processing large XLIFF files with many segments, the Claude Message Batches API provides:
- Submit up to **10,000 queries** per batch
- **50% cost reduction** vs standard API calls
- Processing within 24 hours (async)
- Ideal for Phase 2 bulk QA operations

**Integration pattern for QA tool**:
1. Parse XLIFF → extract translation segments
2. Group segments into batches (e.g., 50-100 per batch request)
3. Submit to Batches API for cost-optimized processing
4. Poll for results and aggregate QA scores

_Source: [Claude Batch Processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)_

### Background Job Integration (Inngest + Next.js 16)

#### Durable Workflow Pattern

Inngest provides event-driven, durable workflow capabilities that integrate natively with Next.js:

```typescript
// app/api/inngest/route.ts
import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { qaAnalysisFunction } from '@/inngest/functions/qa-analysis';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [qaAnalysisFunction],
});

// inngest/functions/qa-analysis.ts
export const qaAnalysisFunction = inngest.createFunction(
  { id: 'qa-analysis', retries: 3 },
  { event: 'qa/analysis.requested' },
  async ({ event, step }) => {
    // Step 1: Parse XLIFF file
    const segments = await step.run('parse-xliff', async () => {
      return parseXliffFile(event.data.fileUrl);
    });

    // Step 2: Rule-based checks (free)
    const ruleResults = await step.run('rule-based-check', async () => {
      return runRuleBasedChecks(segments);
    });

    // Step 3: AI screening (GPT-4o-mini)
    const screeningResults = await step.run('ai-screening', async () => {
      return runAIScreening(segments, ruleResults);
    });

    // Step 4: Deep analysis on flagged segments (Claude Sonnet)
    const deepResults = await step.run('deep-analysis', async () => {
      return runDeepAnalysis(screeningResults.flaggedSegments);
    });

    // Step 5: Aggregate and save results
    await step.run('save-results', async () => {
      return saveQAResults(event.data.projectId, deepResults);
    });
  }
);
```

**Key capabilities for QA tool**:
- **Isolated retries**: Each step retries independently on failure (point-in-time recovery)
- **Long execution**: No serverless timeout limits — steps can pause for hours
- **Parallel processing**: Use `Promise.all()` for concurrent segment analysis
- **Event-driven**: Trigger via `inngest.send()` from API routes
- **No infrastructure**: No Redis, no message queue — just deploy to Vercel

_Source: [Inngest Next.js Quick Start](https://www.inngest.com/docs/getting-started/nextjs-quick-start), [Inngest Durable Workflows](https://www.inngest.com/uses/durable-workflows)_

#### Progress Tracking Pattern (Supabase Realtime)

Combine Inngest step events with Supabase Realtime for **live** progress updates (no polling needed):

```typescript
// Inside Inngest function - update progress after each step
await step.run('update-progress', async () => {
  // Update in Supabase PostgreSQL — triggers Realtime broadcast automatically
  await db.update(qaJobs)
    .set({ status: 'analyzing', progress: 60, currentStep: 'ai-screening' })
    .where(eq(qaJobs.id, event.data.jobId));
});

// Client-side - Supabase Realtime (WebSocket, instant updates)
'use client';
import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';

function useJobProgress(jobId: string) {
  const [job, setJob] = useState(null);
  const supabase = createClient();

  useEffect(() => {
    // Initial fetch
    supabase.from('qa_jobs').select('*').eq('id', jobId).single()
      .then(({ data }) => setJob(data));

    // Subscribe to live changes
    const channel = supabase
      .channel(`job-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'qa_jobs',
        filter: `id=eq.${jobId}`,
      }, (payload) => {
        setJob(payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  return job;
}
```

**Advantage over SWR Polling**: Zero-latency updates via WebSocket — no 2-second delay, no unnecessary network requests.

_Source: [Supabase Realtime Docs](https://supabase.com/docs/guides/realtime), [Inngest Blog](https://www.inngest.com/blog/nextjs-serverless-vs-durable-functions)_

### Authentication Integration (Supabase Auth + Google OAuth)

#### Built-in Authentication Pattern

Supabase Auth provides a complete authentication solution with built-in Google OAuth, eliminating the need for Auth.js/NextAuth.js:

```typescript
// utils/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options));
        },
      },
    }
  );
}

// app/login/page.tsx - Google OAuth sign-in
'use client';
import { createClient } from '@/utils/supabase/client';

export default function LoginPage() {
  const supabase = createClient();

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return <button onClick={handleGoogleLogin}>Sign in with Google</button>;
}
```

**Key advantages over Auth.js**:
- **Built-in Google OAuth**: No separate provider configuration needed
- **Row Level Security (RLS)**: Database-level access control — queries auto-filter by user
- **Session management**: Handled by Supabase SSR package (`@supabase/ssr`)
- **No adapter needed**: Auth is native to the platform (no DrizzleAdapter setup)
- **Email/password + Magic Link**: Additional auth methods available for free

**Team management** still requires custom implementation:
- Build custom: `teams` table, `team_members` table with RLS policies
- Use Supabase RLS to enforce team-level data isolation at the database level
- Example RLS policy: `auth.uid() IN (SELECT user_id FROM team_members WHERE team_id = qa_projects.team_id)`

_Source: [Supabase Auth Docs](https://supabase.com/docs/guides/auth), [Supabase + Next.js](https://supabase.com/docs/guides/getting-started/quickstarts/nextjs)_

### Database Integration (Supabase PostgreSQL + Drizzle ORM)

#### Connection Pattern

Every Supabase project comes with a full PostgreSQL database. Drizzle ORM has official support for Supabase:

```typescript
// db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Use connection pooling URI from Supabase Dashboard → Database Settings
const connectionString = process.env.DATABASE_URL!;

// Disable prefetch for connection pooling (Transaction mode)
const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });
```

**Important**: When using Supabase connection pooling with "Transaction" mode, set `prepare: false` — prepared statements are not supported in transaction pooling mode.

**Schema with RLS integration**:
```typescript
// db/schema.ts
import { pgTable, uuid, text, integer, timestamp, pgPolicy } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const qaProjects = pgTable('qa_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  teamId: uuid('team_id').references(() => teams.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const qaJobs = pgTable('qa_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').references(() => qaProjects.id).notNull(),
  status: text('status').default('pending'),
  progress: integer('progress').default(0),
  currentStep: text('current_step'),
  overallScore: integer('overall_score'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

**Key features for QA tool**:
- **Connection pooling**: Supabase Vitreous (Supavisor) built-in — no external pooler needed
- **RLS**: Row-level security for multi-tenant data isolation at database level
- **Drizzle migrations**: `drizzle-kit push` for dev, `drizzle-kit migrate` for production
- **SQL Editor**: Supabase Dashboard includes SQL editor for quick queries and debugging
- **Backups**: Automatic daily backups on Pro plan

_Source: [Drizzle + Supabase Guide](https://orm.drizzle.team/docs/connect-supabase), [Supabase Drizzle Docs](https://supabase.com/docs/guides/database/drizzle), [Drizzle with Supabase Tutorial](https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase)_

### File Storage Integration (Supabase Storage)

#### XLIFF File Upload Pattern

Supabase Storage provides file storage with RLS policies, integrated with the auth system:

```typescript
// app/api/upload/route.ts — Server-side upload via signed URL
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;

  // Validate file type
  if (!file.name.endsWith('.xliff') && !file.name.endsWith('.xlf')) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
  }

  // Upload to Supabase Storage
  const filePath = `${user.id}/${Date.now()}-${file.name}`;
  const { data, error } = await supabase.storage
    .from('xliff-files')
    .upload(filePath, file, {
      contentType: 'application/xliff+xml',
      upsert: false,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get public URL for processing
  const { data: { publicUrl } } = supabase.storage
    .from('xliff-files')
    .getPublicUrl(data.path);

  return NextResponse.json({ path: data.path, url: publicUrl });
}
```

**Alternative: Signed URL upload** (bypasses Next.js 1MB body limit):
```typescript
// Server Action — generate signed upload URL
'use server';
export async function getUploadUrl(filename: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from('xliff-files')
    .createSignedUploadUrl(`uploads/${Date.now()}-${filename}`);
  return data; // { signedUrl, token, path } — valid for 2 hours
}
```

**Key advantages**:
- **RLS on storage**: Storage buckets respect auth policies — user can only access their files
- **No separate service**: Bundled with Supabase (no Vercel Blob config needed)
- **Signed URLs**: Handle large file uploads without server bottleneck
- **CDN**: Supabase Storage includes CDN for file delivery
- **Migration path**: Move to S3 for Phase 2+ if needed (or stay on Supabase)

_Source: [Supabase Storage Docs](https://supabase.com/docs/guides/storage), [File Upload Guide](https://supalaunch.com/blog/file-upload-nextjs-supabase), [Signed URL Uploads](https://medium.com/@olliedoesdev/signed-url-file-uploads-with-nextjs-and-supabase-74ba91b65fe0)_

### Data Exchange Formats

#### XLIFF Integration Protocol

The QA tool's primary data exchange format is XLIFF (XML Localization Interchange File Format):

| Format | Version | Parser | Status |
|--------|---------|--------|--------|
| **XLIFF 1.2** | Most common in industry | `xliff` npm (55K/wk) | Primary support |
| **XLIFF 2.0** | Newer standard, less adoption | `xliff` npm | Secondary support |
| **JSON** | API responses, QA results | Native | Internal format |
| **CSV** | Export QA reports | Built-in | Phase 2 |

**Data flow**:
1. **Input**: XLIFF file upload → Supabase Storage
2. **Parse**: `xliff` npm → JSON segments array
3. **Process**: Inngest workflow → multi-layer AI analysis
4. **Output**: JSON QA results → Supabase PostgreSQL
5. **Real-time**: Supabase Realtime → live progress to client
6. **Export**: Dashboard display + downloadable reports

### Integration Security Patterns

#### API Authentication Layers

| Layer | Method | Purpose |
|-------|--------|---------|
| **User Auth** | Supabase Auth + Google OAuth | Web app access |
| **Row Level Security** | Supabase RLS policies | Data isolation per user/team |
| **AI API Keys** | Environment variables + Vercel secrets | Claude/OpenAI API access |
| **Database** | Supabase connection string + service role key | PostgreSQL access |
| **File Storage** | Supabase Storage RLS policies | File upload/download per user |
| **CI/CD API (Phase 3)** | API key + JWT | External system integration |

**Security best practices**:
- **Supabase RLS**: Enable Row Level Security on ALL tables — data isolation at database level
- Use `anon` key for client-side (limited by RLS), `service_role` key for server-side only
- Store AI API keys in Vercel environment variables (encrypted at rest)
- Use `proxy.ts` (Next.js 16) for API key proxying — never expose keys to client
- Supabase Storage policies: users can only access files in their own folder (`auth.uid()`)
- Validate XLIFF file content server-side before processing (prevent XXE attacks)
- Use `zod` schemas for all API input validation

_Source: [Supabase Security Docs](https://supabase.com/docs/guides/auth), [Vercel Environment Variables](https://vercel.com/docs/environment-variables)_

### End-to-End Integration Flow (MVP)

```
User Upload XLIFF
       ↓
[Next.js 16 API Route] → Validate + Store in Supabase Storage
       ↓
[inngest.send('qa/analysis.requested')] → Trigger Inngest
       ↓
[Inngest Durable Function]
  ├── Step 1: Fetch file from Supabase Storage → Parse with `xliff` npm
  ├── Step 2: Rule-based checks (local, free)
  ├── Step 3: GPT-4o-mini screening via AI SDK v6
  ├── Step 4: Claude Sonnet deep analysis (flagged segments only)
  ├── Step 5: Aggregate scores → Save to Supabase PostgreSQL
  └── Step 6: Update job status → 'completed'
       ↓
[Supabase Realtime WebSocket] → Client receives live update instantly
       ↓
[Dashboard] → Display QA results, scores, issues
```

---
