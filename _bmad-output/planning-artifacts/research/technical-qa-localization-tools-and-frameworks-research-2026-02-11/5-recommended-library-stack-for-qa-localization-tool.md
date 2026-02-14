# 5. Recommended Library Stack for QA Localization Tool

### MVP (Phase 1) -- XLIFF Focus

| Purpose | Library | Reason |
|---------|---------|--------|
| **XLIFF parsing** | `xliff` | Best XLIFF-specific library, both 1.2 and 2.0 |
| **XML fallback** | `fast-xml-parser` | For edge cases `xliff` can't handle |
| **Language detection** | `franc` or `cld3-asm` | Auto-detect source/target languages |
| **Encoding detection** | `chardet` or `jschardet` | Handle non-UTF-8 files |

### Phase 2-3 -- Multi-format Support

| Purpose | Library | Reason |
|---------|---------|--------|
| **PO/POT files** | `gettext-parser` | De facto standard, ~1M downloads/wk |
| **JSON i18n** | Custom (simple JSON.parse) | JSON formats are trivial to parse |
| **Android XML** | `fast-xml-parser` + custom adapter | No dominant dedicated library |
| **iOS .strings** | Custom regex parser | Simple key=value format |
| **iOS .stringsdict** | `plist` + custom adapter | Standard plist parsing |
| **YAML** | `js-yaml` | Industry standard, 30M+ downloads/wk |
| **ICU MessageFormat** | `@messageformat/core` | For validating ICU patterns |

### Architecture Recommendation

```
src/
  parsers/
    index.ts              # Parser factory (auto-detect format)
    xliff-parser.ts       # Uses 'xliff' package
    xliff-custom.ts       # Custom fallback using 'fast-xml-parser'
    po-parser.ts          # Uses 'gettext-parser' (Phase 2)
    json-parser.ts        # Custom JSON i18n parser (Phase 2)
    android-xml-parser.ts # Custom using 'fast-xml-parser' (Phase 3)
    ios-strings-parser.ts # Custom regex parser (Phase 3)
    yaml-parser.ts        # Uses 'js-yaml' (Phase 3)
    types.ts              # Shared TranslationUnit interface
```

**Shared interface for all parsers:**
```typescript
interface TranslationUnit {
  id: string;
  source: string;
  target: string;
  state?: string;
  note?: string;
  sourceLanguage: string;
  targetLanguage: string;
  context?: string;         // group, namespace, etc.
  inlineTags?: InlineTag[]; // preserved tags for validation
  metadata?: Record<string, unknown>;
}

interface ParseResult {
  format: 'xliff-1.2' | 'xliff-2.0' | 'po' | 'json' | 'android-xml' | 'ios-strings' | 'yaml';
  sourceLanguage: string;
  targetLanguage: string;
  units: TranslationUnit[];
  metadata?: Record<string, unknown>;
  errors?: ParseError[];
}
```

---
