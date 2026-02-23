# SDLXLIFF / XLIFF 1.2 Format Research Note

**Owner:** Elena (Junior Dev)
**Created:** 2026-02-23 (Epic 1 Retrospective — Preparation Task P1)
**Purpose:** Understand SDLXLIFF structure before implementing Story 2.2 (Unified Parser).
  Covers: XLIFF 1.2 spec, sdl: namespace, inline tags, confirmation states,
  fast-xml-parser config.

---

## TL;DR

```
SDLXLIFF = XLIFF 1.2 + sdl: namespace extensions (Trados Studio format)
XLIFF 1.2  = SDLXLIFF with sdl: namespace stripped
→ One unified parser handles both (SDLXLIFF is a superset)
```

Parser library: **fast-xml-parser** (already in dependencies)
Location of parser: `src/features/parser/` (to be created in Story 2.2)

---

## 1. XLIFF 1.2 File Structure

```xml
<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"
       xmlns="urn:oasis:names:tc:xliff:document:1.2"
       xmlns:sdl="http://sdl.com/FileTypes/SdlXliff/1.0">

  <file original="MyDocument.docx"
        source-language="en-US"
        target-language="th-TH"
        datatype="x-sdlxliff">
    <header>
      <!-- file-level metadata -->
    </header>
    <body>
      <group id="g1">
        <trans-unit id="1">
          <source>Hello world</source>
          <target state="translated">สวัสดีโลก</target>
        </trans-unit>
        <trans-unit id="2">
          <source>Click <g id="1">here</g> to continue.</source>
          <target>คลิก <g id="1">ที่นี่</g> เพื่อดำเนินการต่อ</target>
        </trans-unit>
      </group>
    </body>
  </file>
</xliff>
```

**Key elements:**
| Element | Purpose |
|---------|---------|
| `<file>` | One file per source document, holds source-language + target-language |
| `<trans-unit>` | One segment pair (source + target) |
| `<source>` | Source text (may contain inline tags) |
| `<target>` | Translated text, `state` attribute = XLIFF state |
| `<group>` | Optional grouping of trans-units |
| `<note>` | Translator comment (XLIFF standard) |

---

## 2. SDLXLIFF Extensions (sdl: namespace)

SDLXLIFF adds `xmlns:sdl="http://sdl.com/FileTypes/SdlXliff/1.0"` and wraps
each `<trans-unit>` with Trados-specific metadata:

```xml
<trans-unit id="1">
  <source>Hello world</source>
  <seg-source>
    <mrk mtype="seg" mid="1">Hello world</mrk>
  </seg-source>
  <target>
    <mrk mtype="seg" mid="1">สวัสดีโลก</mrk>
  </target>
  <sdl:seg-defs>
    <sdl:seg id="1"
             conf="Translated"
             origin="mt"
             percent="0">
      <sdl:prev-origin percent="85" origin="tm"/>
    </sdl:seg>
  </sdl:seg-defs>
</trans-unit>
```

### Key sdl: attributes to extract

| Attribute | Location | Values | Map to DB |
|-----------|----------|--------|-----------|
| `conf` | `sdl:seg` | Draft, Translated, ApprovedTranslation, ApprovedSignOff, RejectedTranslation, RejectedSignOff | `confirmation_state` |
| `percent` | `sdl:seg` | 0–100 (TM match %) | `match_percentage` |
| `origin` | `sdl:seg` | mt, tm, interactive | metadata |

### Translator Comments (`sdl:cmt`)

```xml
<trans-unit id="3">
  <source>Submit</source>
  <target>ส่ง</target>
  <sdl:seg-defs>
    <sdl:seg id="3" conf="Draft">
      <sdl:cmt>Please check Thai equivalent</sdl:cmt>
    </sdl:seg>
  </sdl:seg-defs>
</trans-unit>
```

→ Map `<sdl:cmt>` text content to `translator_comment` in DB.

---

## 3. Confirmation States Mapping

| SDLXLIFF `conf` value | Meaning | Action in QA engine |
|-----------------------|---------|---------------------|
| `Draft` | Not translated yet | Run all QA checks |
| `Translated` | Translator marked done | Run all QA checks |
| `ApprovedTranslation` | PM approved translation | Run QA checks |
| `ApprovedSignOff` | Final approved, signed off | **Skip** QA checks (FR logic) |
| `RejectedTranslation` | Translation rejected | Run all QA checks |
| `RejectedSignOff` | Sign-off rejected | Run all QA checks |

**XLIFF 1.2 standard `state` values** (no sdl: namespace):
`new`, `needs-translation`, `needs-l10n`, `needs-review-translation`,
`translated`, `needs-review-l10n`, `signed-off`, `final`

---

## 4. Inline Tags (Must Preserve)

Inline tags appear inside `<source>` and `<target>` text. They must be:
1. **Extracted** from the text (stored in `inline_tags` jsonb)
2. **Not stripped** silently — positions and IDs must be preserved

| Tag | Type | Paired? | Example |
|-----|------|---------|---------|
| `<g id="1">text</g>` | Span (formatting) | Yes (open+close) | `<g id="1">bold text</g>` |
| `<x id="1"/>` | Standalone placeholder | No | `<x id="1"/>` (line break) |
| `<ph id="1"/>` | Generic placeholder | No | `<ph id="1">{0}</ph>` |
| `<bx id="1"/>` | Begin paired span | Half | `<bx id="1"/>...<ex id="1"/>` |
| `<ex id="1"/>` | End paired span | Half | `<bx id="1"/>...<ex id="1"/>` |
| `<bpt id="1">` | Begin tag (translatable) | Yes | `<bpt id="1">&lt;b&gt;</bpt>` |
| `<ept id="1">` | End tag (translatable) | Yes | `<ept id="1">&lt;/b&gt;</ept>` |

### inline_tags JSON schema (stored in DB)

```typescript
type InlineTag = {
  type: 'g' | 'x' | 'ph' | 'bx' | 'ex' | 'bpt' | 'ept'
  id: string
  position: number       // char offset in text AFTER stripping tags
  attributes?: Record<string, string>
  content?: string       // for bpt/ept that have translatable content
}

// Example for: "Click <g id='1'>here</g> to continue"
[
  { type: 'g', id: '1', position: 6, attributes: {} },
]
```

---

## 5. Segments Table — Missing Columns (Story 2.2 must add)

Current `segments` table (from Story 1.2) is missing:

```typescript
// Must ADD in Story 2.2 migration:
confirmationState: varchar('confirmation_state', { length: 30 }),
// 'Draft' | 'Translated' | 'ApprovedTranslation' | 'ApprovedSignOff' | 'RejectedTranslation' | 'RejectedSignOff'
matchPercentage: integer('match_percentage'),  // 0-100
translatorComment: text('translator_comment'), // nullable
inlineTags: jsonb('inline_tags').$type<InlineTag[]>(),
```

⚠️ **Story 2.2 dev must run `npm run db:generate` + `npm run db:migrate`** for these columns.

---

## 6. fast-xml-parser Config for SDLXLIFF

```typescript
import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  // Preserve element order — critical for inline tag position tracking
  preserveOrder: true,

  // Treat these as arrays even if only one element
  isArray: (name) => [
    'trans-unit', 'group', 'file', 'seg', 'seg-defs',
    'g', 'x', 'ph', 'bx', 'ex', 'bpt', 'ept',
  ].includes(name),

  // Parse attributes on all elements
  ignoreAttributes: false,
  attributeNamePrefix: '@_',

  // Handle sdl: namespace — do NOT strip it
  removeNSPrefix: false,  // keep 'sdl:seg', 'sdl:cmt' as-is

  // Preserve CDATA and text content
  cdataPropName: '__cdata',
  textNodeName: '#text',

  // Stop on first parse error (don't silently skip malformed XML)
  stopNodes: [],
  allowBooleanAttributes: true,
})

// Usage
const result = parser.parse(xmlString)
```

### Namespace prefix handling

With `removeNSPrefix: false`, sdl: elements appear as:
```javascript
// Parsed output keys:
'sdl:seg-defs'  → access via result['sdl:seg-defs']
'sdl:seg'       → access via result['sdl:seg']
```

Alternatively, set `removeNSPrefix: true` to strip prefixes (simpler access):
```javascript
'seg-defs'  → result['seg-defs']
'seg'       → result['seg']
```
⚠️ If stripping, be careful — `<seg>` in XLIFF namespace conflicts with `sdl:seg`.
**Recommended: keep `removeNSPrefix: false`** and access via full prefix key.

---

## 7. Parser Algorithm (Story 2.2 implementation guide)

```
1. Validate file size < 15MB (before parse)
2. Parse full XML with fast-xml-parser (DOM, not streaming — MVP)
3. Walk <file> elements → extract source-language, target-language
4. Walk <trans-unit> elements:
   a. Extract id attribute → segment_number
   b. Extract <source> text → strip inline tags → source_text
      Collect inline tags with positions → inline_tags jsonb
   c. Extract <target> text → strip inline tags → target_text
   d. Extract sdl:seg conf attribute → confirmation_state
   e. Extract sdl:seg percent attribute → match_percentage
   f. Extract sdl:cmt text → translator_comment
   g. Count words: Intl.Segmenter for CJK/Thai, split for others → word_count
5. Batch insert segments (100 at a time to avoid memory spike)
6. Return { segmentCount, fileId }
```

---

## 8. Edge Cases to Handle

| Case | Handling |
|------|---------|
| No sdl: namespace (pure XLIFF 1.2) | Use `<target state="">` for confirmation |
| `<seg-source>` with `<mrk>` wrappers | Extract text from inside `<mrk mtype="seg">` |
| Multiple `<sdl:seg>` per trans-unit | Each `<mrk mid="N">` = separate segment |
| Nested inline tags `<g><ph/></g>` | Flatten to position list, track depth |
| Empty `<target>` | Store as empty string `""`, not null |
| Invalid XML | Catch parse error → set file status `failed` with message |
| File > 15MB | Reject at Route Handler before parse (not here) |

---

## 9. Minimal Sample Files (in `e2e/fixtures/`)

See `e2e/fixtures/sdlxliff/minimal.sdlxliff` — basic SDLXLIFF with 3 segments.
See `e2e/fixtures/sdlxliff/with-namespaces.sdlxliff` — full sdl: namespace example.

---

## Quick Reference

| Topic | Detail |
|-------|--------|
| Namespace URI | `http://sdl.com/FileTypes/SdlXliff/1.0` |
| Confirmation attr | `sdl:seg conf="Translated"` |
| Match percent attr | `sdl:seg percent="85"` |
| Translator comment | `<sdl:cmt>text</sdl:cmt>` |
| Inline tag types | `g, x, ph, bx, ex, bpt, ept` |
| Parser library | `fast-xml-parser` (already installed) |
| Parser key config | `preserveOrder: true, ignoreAttributes: false, removeNSPrefix: false` |
| DB columns needed | `confirmation_state, match_percentage, translator_comment, inline_tags` |
| Skip QA if | `confirmation_state = 'ApprovedSignOff'` |
