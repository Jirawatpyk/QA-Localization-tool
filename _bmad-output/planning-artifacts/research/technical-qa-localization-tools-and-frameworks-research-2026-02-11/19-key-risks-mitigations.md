# 19. Key Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Vercel function timeouts for AI processing | Use Inngest with step functions to break processing into chunks |
| Large XLIFF file uploads | Direct-to-storage uploads via Supabase signed URLs |
| Supabase free tier pausing | Upgrade to Pro plan ($25/mo) when user activity grows |
| Tailwind v4 / shadcn/ui compatibility | Start with Tailwind v3, upgrade when ecosystem is ready |
| Database connection limits (serverless) | Supabase connection pooling (Supavisor) handles this |
| AI API rate limits | Implement request queuing with backoff, batch processing |
| Supabase vendor lock-in | Use Drizzle ORM for DB portability; Storage API is S3-compatible |

---
