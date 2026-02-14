# 12. PostgreSQL - Database

### Managed PostgreSQL Options

| Provider | Free Tier | Paid Starting | Highlights | Gotchas |
|----------|-----------|---------------|------------|---------|
| **Neon** | 0.5GB storage, branching | $19/mo | Serverless, auto-scaling, branching (like git for DB), excellent Vercel integration | Cold starts on free tier |
| **Supabase** | 500MB, 2 projects | $25/mo | Full BaaS (auth, storage, realtime), PostgREST API, built-in auth | Pauses after 1 week inactivity (free tier) |
| **Railway** | $5 credit/mo | Usage-based | Simple setup, good for backend-heavy apps, persistent | No branching, basic tooling |
| **Vercel Postgres** | Powered by Neon | Included in Pro | Tight Vercel integration, zero config | Neon under the hood, limited control |
| **AWS RDS** | 12 months free tier | ~$15/mo | Enterprise-grade, full control | Complex setup, overkill for MVP |

### ORM Comparison: Prisma vs Drizzle

| Feature | Prisma | Drizzle |
|---------|--------|---------|
| **Version** | 5.x+ (stable) | 0.3x+ |
| **Approach** | Schema-first, code generation | TypeScript-first, SQL-like |
| **Schema Definition** | `.prisma` file (custom DSL) | TypeScript files |
| **Type Safety** | Excellent (generated types) | Excellent (inferred types) |
| **Migrations** | `prisma migrate` (auto-generated) | `drizzle-kit` (auto + manual) |
| **Query Builder** | Custom API (`findMany`, etc.) | SQL-like syntax |
| **Raw SQL** | `$queryRaw` | First-class support |
| **Relations** | Declarative, auto-joined | Explicit join syntax |
| **Bundle Size** | ~2MB+ (engine binary) | ~50KB |
| **Edge Runtime** | Prisma Accelerate needed | Native support |
| **Learning Curve** | Low (intuitive API) | Medium (SQL knowledge needed) |
| **Community** | Very large, mature | Growing fast |
| **Serverless** | Connection pooling needed (Accelerate/pgbouncer) | Built-in connection handling |
| **Studio/GUI** | Prisma Studio (built-in) | Drizzle Studio |

### Recommendation for QA Localization Tool

**Database Host: Neon**
- Serverless auto-scaling is perfect for variable workloads (QA runs are bursty)
- Database branching enables safe schema changes
- Excellent Vercel integration
- Free tier is generous enough for MVP
- Connection pooling built-in (important for serverless)

**ORM: Drizzle ORM**
- Better for serverless/edge deployments (smaller bundle)
- No binary dependency issues
- SQL-like syntax is more flexible for complex QA queries (aggregations, joins for reports)
- Better Neon integration
- Growing ecosystem and community

**Alternative ORM: Prisma** is also an excellent choice if the team prefers a more abstracted, intuitive API. Prisma's ecosystem is more mature and has more learning resources.

### Database Schema Considerations

The schema in the plan is well-designed. Additional recommendations:
- Add indexes on `qa_runs.status`, `issues.severity`, `issues.issue_type` for efficient filtering
- Consider `jsonb` columns for flexible AI response storage
- Use `enum` types for severity and issue_type
- Add `tsearch` vector columns if full-text search is needed later

### Sources
- https://neon.tech/docs
- https://www.prisma.io/docs
- https://orm.drizzle.team/docs/overview
- https://supabase.com/docs

---
