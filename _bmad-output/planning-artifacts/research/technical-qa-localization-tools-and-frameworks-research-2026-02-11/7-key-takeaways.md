# 7. Key Takeaways

1. **`xliff` package is the clear primary choice** for XLIFF parsing -- it's the most popular dedicated XLIFF library for JavaScript, supports both XLIFF 1.2 and 2.0, and is actively maintained by the locize team (same ecosystem as i18next).

2. **For the MVP, only `xliff` + `fast-xml-parser` (fallback) are needed** -- this covers the primary XLIFF format requirement identified in the product plan.

3. **Phase 2-3 format expansion is well-served** by existing npm packages: `gettext-parser` for PO, `js-yaml` for YAML, `plist` for iOS stringsdict, and custom parsers for simpler formats (JSON, .strings, Android XML).

4. **XLIFF 1.2 is still more widely used** in the industry, but 2.0 support is important for forward compatibility. The `xliff` package handles both.

5. **The unified `TranslationUnit` interface** should abstract away format differences, allowing the QA engine to work identically regardless of input format.

6. **Common parsing pitfalls** include inline tag handling, encoding issues, large file streaming, and malformed XML from various CAT tools -- all should be addressed in the parser layer with graceful error handling.

---
---
