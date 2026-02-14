# 3. Localization Frameworks

### 3.1 i18next

| Attribute | Detail |
|-----------|--------|
| **npm package** | `i18next` |
| **GitHub** | https://github.com/i18next/i18next |
| **GitHub Stars** | ~7,500+ |
| **Weekly downloads** | ~4M+ |
| **License** | MIT |
| **Maintenance** | Very active (locize company) |

**File format support:**
- JSON (native, nested/flat)
- XLIFF (via `i18next-xliff` plugin)
- PO/gettext (via `i18next-gettext-converter`)
- Fluent (via plugin)
- ICU MessageFormat (via plugin)

**QA-relevant features:**
- Missing key detection
- Fallback language chains
- Interpolation format: `{{variable}}`
- Plural handling (ICU or i18next native)
- Context-aware translations
- Namespace support

**Ecosystem packages:**
- `react-i18next` (~3.5M/wk) - React integration
- `next-i18next` (~500K/wk) - Next.js integration
- `i18next-http-backend` - Load translations from API
- `i18next-browser-languagedetector` - Auto-detect language
- `i18next-fs-backend` - Node.js file system backend

---

### 3.2 FormatJS / react-intl

| Attribute | Detail |
|-----------|--------|
| **npm package** | `react-intl` (main), `@formatjs/intl` |
| **GitHub** | https://github.com/formatjs/formatjs |
| **GitHub Stars** | ~14,000+ |
| **Weekly downloads** | `react-intl`: ~1.5M+, `@formatjs/cli`: ~200K+ |
| **License** | MIT |
| **Maintenance** | Active (Meta/community) |

**File format support:**
- ICU MessageFormat (native)
- JSON (via extraction tools)
- AST-compiled messages

**QA-relevant features:**
- `@formatjs/cli` includes `compile` and `extract` commands
- Built-in validation of ICU message syntax
- Plural rules per CLDR
- Number, date, time formatting per locale
- Argument type checking in messages

**Key tools:**
- `@formatjs/cli extract` - Extract messages from source code
- `@formatjs/cli compile` - Compile translations to AST
- `eslint-plugin-formatjs` - Lint rules for i18n best practices

---

### 3.3 LinguiJS

| Attribute | Detail |
|-----------|--------|
| **npm package** | `@lingui/core`, `@lingui/react` |
| **GitHub** | https://github.com/lingui/js-lingui |
| **GitHub Stars** | ~4,500+ |
| **Weekly downloads** | ~200K-400K (combined) |
| **License** | MIT |
| **Maintenance** | Active |

**File format support:**
- PO/POT (native, primary format)
- JSON (catalog format)
- CSV
- ICU MessageFormat

**QA-relevant features:**
- `lingui extract` - Extract messages from code
- `lingui compile` - Compile catalogs
- Validation of message syntax
- PO file as primary format (industry standard)
- Macro-based API (`t`, `plural`, `select`)

---

### 3.4 Localization Framework Comparison

| Feature | i18next | FormatJS/react-intl | LinguiJS |
|---------|---------|-------------------|----------|
| **Downloads** | ~4M/wk | ~1.5M/wk | ~300K/wk |
| **Stars** | ~7.5K | ~14K | ~4.5K |
| **Format** | JSON | ICU MessageFormat | PO/JSON |
| **React** | react-i18next | react-intl | @lingui/react |
| **Next.js** | next-i18next | Custom | @lingui/next |
| **Extraction** | Plugin | @formatjs/cli | lingui extract |
| **XLIFF** | Plugin | No | No |
| **PO** | Plugin | No | Native |
| **QA Tools** | Missing keys | eslint plugin | Validation |
| **Plurals** | ICU/native | ICU (CLDR) | ICU |
| **Bundle Size** | ~40KB | ~50KB | ~5KB (core) |

---
