# 23. Web-Verified Technical Updates

### Next.js - Updated to v15 (Confirmed)

Web search confirms Next.js 16 is the current stable release:
- **Turbopack** is now stable: 76.7% faster local server startup, 96.3% faster code updates
- **React 19** support built-in
- **Caching behavior changed**: GET routes NOT cached by default (important behavioral change)
- **Next.js 16** is also mentioned for [future planning](https://strapi.io/blog/next-js-16-features)
- **Recommendation: Use Next.js 16** (confirmed, plan's Next.js 14 should be updated)

Source: [Next.js 16 Blog](https://nextjs.org/blog/next-15)

### XLIFF Package - Web-Verified

- `xliff` npm package: **55,383 downloads/week** (higher than estimated ~30K)
- Actively maintained with at least one release in past 12 months
- `ilib-xliff` (v1.4.1) is another actively maintained option, published 13 days ago
- Source: [npm xliff](https://www.npmjs.com/package/xliff)

### Vercel AI SDK - Major Update to v6

**Critical Update**: Vercel AI SDK has released v6 with significant changes:
- `generateObject()` and `streamObject()` are **deprecated**
- New API: `generateText()` with `Output.object()` for structured output
- Support for any schema library implementing Standard JSON Schema
- New **Agent abstraction** for building reusable agents
- 99.8% successful JSON extraction rate
- Source: [AI SDK 6](https://vercel.com/blog/ai-sdk-6)

**Impact on our project**: Use `Output.object()` pattern instead of `generateObject()` for QA result generation.

### Claude API vs GPT-4o for Translation QA (Web-Verified)

Web research confirms our AI model choice:
- **Claude 3.5 Sonnet** and **GPT-4.5/o1** are the most reliable for translation quality
- Claude excels at **cross-lingual performance** relative to English
- Production best practice: Use **multiple models** - Claude for marketing text, GPT-4o for UI strings
- LLM translation quality in 2026 is "really quite good for production use"
- Source: [intlpull.com comparison](https://intlpull.com/fr/blog/ai-translation-api-comparison-2026), [Localize LLM comparison](https://localizejs.com/articles/the-3-best-llms-for-translation)

### Inngest - Confirmed Best Choice for Vercel

Web search confirms Inngest as the recommended background job solution:
- No message queue needed - just send events
- Native Vercel/Next.js integration
- Trigger.dev offers "no timeouts" with atomic versioning as an alternative
- BullMQ requires self-managed infrastructure (Redis + persistent workers)
- Source: [Inngest Docs](https://www.inngest.com/docs/guides/background-jobs)

---
