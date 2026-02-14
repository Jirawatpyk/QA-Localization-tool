# 10. Tailwind CSS

### Current Status

| Attribute | Detail |
|-----------|--------|
| **Latest Stable** | Tailwind CSS v4.0 (released Jan 2025) |
| **Previous** | Tailwind CSS v3.4.x |
| **Official Site** | https://tailwindcss.com |

### Tailwind v3 vs v4

| Feature | v3 | v4 |
|---------|----|----|
| Config file | `tailwind.config.js` | CSS-based `@theme` directive |
| Build engine | PostCSS plugin | Oxide engine (Rust-based, 10x faster) |
| Content detection | Manual `content` config | Automatic source detection |
| CSS import | `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| Container queries | Plugin | Built-in `@container` |
| 3D transforms | Not built-in | Built-in |
| Color mixing | Not built-in | `color-mix()` support |
| `@starting-style` | Not available | Built-in |

### Compatibility with Next.js 16

- **Tailwind v4** works with Next.js 16 but may require `@tailwindcss/postcss` adapter
- **Tailwind v3** is fully compatible and battle-tested with Next.js
- **shadcn/ui** was originally built for Tailwind v3; v4 support has been in progress

### Recommendation: Start with Tailwind v3, migrate to v4 when stable

**Reasoning:**
- shadcn/ui's CLI and components are primarily tested with Tailwind v3
- Tailwind v4 is a major rewrite with breaking changes in config approach
- For a new project, stability of the component library integration matters more
- Migration path from v3 to v4 is well-documented when ready

**Alternative approach:** If shadcn/ui has full v4 support by project start, go with v4 directly for the performance benefits and simpler configuration.

### Sources
- https://tailwindcss.com/blog/tailwindcss-v4
- https://tailwindcss.com/docs/installation

---
