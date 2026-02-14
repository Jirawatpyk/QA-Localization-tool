# 1. XLIFF Parsing Libraries (JavaScript/TypeScript)

### 1.1 `xliff` (by locize / i18next ecosystem)

| Attribute | Detail |
|-----------|--------|
| **npm package** | `xliff` |
| **GitHub** | https://github.com/locize/xliff |
| **Weekly downloads** | ~25,000-35,000 (verify on npmjs.com) |
| **Last updated** | Actively maintained (2024-2025) |
| **Version** | 6.x+ |
| **License** | MIT |
| **XLIFF support** | XLIFF 1.2 and XLIFF 2.0 |
| **Maintenance** | High -- part of the locize/i18next ecosystem |

**Features:**
- Parse XLIFF 1.2 (`xliff12ToJs`) and XLIFF 2.0 (`xliff2js`) to JavaScript objects
- Convert JavaScript objects back to XLIFF 1.2 (`jsToXliff12`) and XLIFF 2.0 (`js2xliff`)
- Supports `trans-unit` elements with `source`, `target`, `note`
- Handles `state` attributes (translated, needs-translation, final, etc.)
- Inline elements support (e.g., `<g>`, `<x/>`, `<bx/>`, `<ex/>`)
- Can create XLIFF from scratch
- Streaming-friendly design

**Code example:**
```javascript
import { xliff12ToJs, xliff2js, jsToXliff12 } from 'xliff';

// Parse XLIFF 1.2
const result = await xliff12ToJs(xliffString);
// Result: { resources: { namespace: { key: { source: '...', target: '...' } } } }

// Parse XLIFF 2.0
const result2 = await xliff2js(xliff2String);
```

**Recommendation:** Primary choice for XLIFF parsing. Most popular, well-maintained, supports both XLIFF versions, and integrates well with the i18next ecosystem.

---

### 1.2 `xliff-parser` / `@nicolo-ribaudo/xliff-parser`

| Attribute | Detail |
|-----------|--------|
| **npm package** | `xliff-parser` |
| **Weekly downloads** | Low (~50-200) |
| **XLIFF support** | XLIFF 1.2 primarily |
| **Maintenance** | Low -- infrequent updates |

**Features:**
- Basic XLIFF 1.2 parsing
- Simpler API than `xliff`
- Limited feature set

**Recommendation:** Not recommended for production. Low download count and limited maintenance.

---

### 1.3 `xml2js` / `fast-xml-parser` (Generic XML parsers)

| Attribute | Detail |
|-----------|--------|
| **npm package** | `xml2js` / `fast-xml-parser` |
| **Weekly downloads** | `xml2js`: ~18M, `fast-xml-parser`: ~30M+ |
| **Last updated** | Both actively maintained |
| **License** | MIT |

**Features (for XLIFF use):**
- Generic XML to JS object parsing
- Can parse any XML including XLIFF
- Requires custom mapping logic to extract translation units
- `fast-xml-parser` is significantly faster (5-10x vs xml2js)
- Both support attributes, CDATA, namespaces

**Recommendation:** Use as a fallback or for custom XLIFF parsing needs. The `xliff` package wraps similar functionality with XLIFF-specific abstractions. `fast-xml-parser` is excellent if you need to build a custom XLIFF parser with full control.

---

### 1.4 `cheerio` (HTML/XML parser)

| Attribute | Detail |
|-----------|--------|
| **npm package** | `cheerio` |
| **GitHub** | https://github.com/cheeriojs/cheerio |
| **Weekly downloads** | ~7M+ |
| **License** | MIT |

**Features (for XLIFF use):**
- jQuery-like API for XML traversal
- Can query XLIFF elements using CSS selectors
- Good for complex XML manipulation
- Not XLIFF-specific but very flexible

**Recommendation:** Useful for complex XLIFF manipulation scenarios where you need precise DOM-like access to XML elements.

---

### 1.5 XLIFF Library Comparison Summary

| Library | XLIFF 1.2 | XLIFF 2.0 | Downloads | Active | Recommended |
|---------|-----------|-----------|-----------|--------|-------------|
| `xliff` | Yes | Yes | ~30K/wk | Yes | **Primary** |
| `xliff-parser` | Yes | Limited | ~100/wk | Low | No |
| `fast-xml-parser` | Via custom | Via custom | ~30M/wk | Yes | Fallback |
| `xml2js` | Via custom | Via custom | ~18M/wk | Moderate | Fallback |
| `cheerio` | Via custom | Via custom | ~7M/wk | Yes | Special cases |

---
