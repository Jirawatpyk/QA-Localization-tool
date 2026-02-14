# 11. NextAuth.js / Auth.js

### Current Status

| Attribute | Detail |
|-----------|--------|
| **Package** | `next-auth` (v4.x stable) / `next-auth@beta` (v5) |
| **Rebranding** | NextAuth.js is being rebranded to Auth.js (framework-agnostic) |
| **v4** | Stable, widely used, well-documented |
| **v5 (Auth.js)** | Beta/RC stage as of early 2025 |
| **Official Site** | https://authjs.dev / https://next-auth.js.org (v4) |

### v4 vs v5 Comparison

| Feature | v4 (`next-auth`) | v5 (`next-auth@beta`) |
|---------|------|------|
| Stability | Stable, production-proven | Beta/Release Candidate |
| App Router | Supported (with workarounds) | Native support |
| Edge Runtime | Limited | Full support |
| Configuration | `[...nextauth].ts` API route | `auth.ts` root config |
| Middleware | Custom implementation | Built-in `auth()` middleware |
| Session strategy | JWT or Database | JWT or Database (improved) |
| TypeScript | Good | Excellent (improved types) |
| Providers | 50+ (Google, GitHub, etc.) | 80+ providers |
| Database adapters | Prisma, Drizzle, etc. | Prisma, Drizzle, etc. |

### Google OAuth Setup

Both v4 and v5 support Google OAuth with minimal configuration:

```typescript
// v5 example (auth.ts)
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
})
```

### Team/Organization Support

- Neither v4 nor v5 has built-in team/organization management
- Must be implemented as custom logic on top of the auth layer
- Common pattern: after auth, check user's team membership in database
- Consider using a `teams` and `team_members` table (as in the plan)

### Recommendation: Use NextAuth.js v5 (Auth.js)

**Reasons:**
- Native App Router support is important for Next.js 16
- Better middleware integration for protecting routes
- The project is greenfield, so no migration pain
- v5 has been in beta long enough to be reasonably stable
- Better TypeScript support
- If v5 GA is not yet released by project start, v4 is a perfectly fine fallback

### Gotchas

- v5 docs can be confusing due to the Auth.js rebrand
- Session callback customization is slightly different from v4
- Database adapter setup requires careful configuration
- Google OAuth requires setting up Google Cloud Console credentials
- Team management must be built as custom middleware/logic

### Sources
- https://authjs.dev/getting-started
- https://next-auth.js.org/getting-started/introduction
- https://authjs.dev/getting-started/providers/google

---
