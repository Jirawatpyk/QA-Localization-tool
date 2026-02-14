# 4. XLIFF Specification Details

### 4.1 XLIFF 1.2 vs 2.0 Key Differences

| Aspect | XLIFF 1.2 | XLIFF 2.0 |
|--------|-----------|-----------|
| **Standard** | OASIS 2007 | OASIS 2014 |
| **Namespace** | `urn:oasis:names:tc:xliff:document:1.2` | `urn:oasis:names:tc:xliff:document:2.0` |
| **Root element** | `<xliff>` | `<xliff>` |
| **File container** | `<file>` with `<header>` + `<body>` | `<file>` (simplified) |
| **Translation unit** | `<trans-unit>` | `<unit>` containing `<segment>` |
| **Source/Target** | In `<trans-unit>` directly | In `<segment>` inside `<unit>` |
| **Inline elements** | `<g>`, `<x/>`, `<bx/>`, `<ex/>`, `<bpt>`, `<ept>`, `<ph>`, `<it>` | `<pc>`, `<ph>`, `<sc>`, `<ec>`, `<mrk>` (simplified) |
| **State** | `state` attribute on `<target>` | `state` attribute on `<segment>` |
| **Modules** | Built into core | Modular (separate namespaces) |
| **Adoption** | Very widely used | Growing but less common |
| **Complexity** | More complex inline model | Simplified, cleaner spec |

### 4.2 XLIFF 1.2 Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="th" datatype="plaintext" original="messages.json">
    <header>
      <tool tool-id="my-tool" tool-name="QA Tool"/>
    </header>
    <body>
      <trans-unit id="1" approved="yes">
        <source>Hello, World!</source>
        <target state="translated">สวัสดีชาวโลก!</target>
        <note from="developer">Greeting message</note>
        <alt-trans match-quality="85">
          <target>สวัสดี, โลก!</target>
        </alt-trans>
      </trans-unit>

      <trans-unit id="2" approved="no">
        <source>Click <g id="1">&lt;b&gt;</g>here<g id="2">&lt;/b&gt;</g> to continue</source>
        <target state="needs-review-translation">คลิก <g id="1">&lt;b&gt;</g>ที่นี่<g id="2">&lt;/b&gt;</g> เพื่อดำเนินการต่อ</target>
        <note from="translator">Check bold tags</note>
      </trans-unit>

      <group id="menu">
        <trans-unit id="3">
          <source>File</source>
          <target state="final">ไฟล์</target>
        </trans-unit>
      </group>
    </body>
  </file>
</xliff>
```

### 4.3 XLIFF 2.0 Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0"
       srcLang="en" trgLang="th">
  <file id="f1" original="messages.json">
    <unit id="1">
      <notes>
        <note category="developer">Greeting message</note>
      </notes>
      <segment state="translated">
        <source>Hello, World!</source>
        <target>สวัสดีชาวโลก!</target>
      </segment>
    </unit>

    <unit id="2">
      <segment state="initial">
        <source>Click <pc id="1">here</pc> to continue</source>
        <target>คลิก <pc id="1">ที่นี่</pc> เพื่อดำเนินการต่อ</target>
      </segment>
    </unit>

    <group id="menu">
      <unit id="3">
        <segment state="final">
          <source>File</source>
          <target>ไฟล์</target>
        </segment>
      </unit>
    </group>
  </file>
</xliff>
```

### 4.4 Key XLIFF Elements for QA

| Element/Attribute | XLIFF 1.2 | XLIFF 2.0 | QA Relevance |
|------------------|-----------|-----------|--------------|
| `source` | Text to translate | Text to translate | Base text for comparison |
| `target` | Translated text | Translated text | Text to validate |
| `state` | `new`, `needs-translation`, `needs-review-translation`, `translated`, `final`, `signed-off` | `initial`, `translated`, `reviewed`, `final` | Filter which units to QA |
| `approved` | `yes`/`no` on `<trans-unit>` | N/A (use `state`) | Skip approved units |
| `note` / `notes` | `<note>` child of `<trans-unit>` | `<notes><note>` child of `<unit>` | Context for AI QA |
| `id` | On `<trans-unit>` | On `<unit>` | Issue tracking reference |
| Inline tags | `<g>`, `<x/>`, `<bx/>`, `<ex/>`, `<ph>`, `<bpt>`, `<ept>`, `<it>` | `<pc>`, `<ph>`, `<sc>`, `<ec>`, `<mrk>` | Tag validation checks |
| `alt-trans` | Alternative translations | N/A (use modules) | Reference translations |
| `match-quality` | On `<alt-trans>` | N/A | TM match percentage |
| `source-language` / `srcLang` | On `<file>` | On `<xliff>` | Language detection |
| `target-language` / `trgLang` | On `<file>` | On `<xliff>` | Language detection |
| `<group>` | Groups trans-units | Groups units | Logical grouping |
| `restype` | Resource type hint | N/A | Context for QA |
| `xml:space` | Whitespace handling | Whitespace handling | Formatting checks |

### 4.5 XLIFF State Values (Important for QA workflow)

**XLIFF 1.2 states:**
| State | Meaning | QA Action |
|-------|---------|-----------|
| `new` | Not yet translated | Skip (no target) |
| `needs-translation` | Needs translation | Skip (no target) |
| `needs-review-translation` | Translated, needs review | **QA this** |
| `needs-review-adaptation` | Adapted, needs review | **QA this** |
| `needs-review-l10n` | Localized, needs review | **QA this** |
| `translated` | Translation complete | **QA this** |
| `final` | Finalized | QA if requested |
| `signed-off` | Approved | Usually skip |

**XLIFF 2.0 states:**
| State | Meaning | QA Action |
|-------|---------|-----------|
| `initial` | Initial state | Skip (may have no target) |
| `translated` | Translation done | **QA this** |
| `reviewed` | Reviewed | QA if requested |
| `final` | Final | Usually skip |

### 4.6 Common XLIFF Parsing Challenges

| Challenge | Description | Mitigation |
|-----------|-------------|------------|
| **Version detection** | Must handle both 1.2 and 2.0 | Check `version` attribute and namespace |
| **Inline elements** | Complex nested tags inside source/target | Preserve tag structure, validate tag pairing |
| **CDATA sections** | Some tools wrap content in CDATA | Handle both raw text and CDATA |
| **Namespaces** | Custom namespaces for tool-specific metadata | Use namespace-aware parsing |
| **Encoding** | Non-UTF-8 files from legacy tools | Detect and convert encoding |
| **Large files** | XLIFF files can be 100MB+ | Stream parsing, chunked processing |
| **Malformed XML** | Some CAT tools produce invalid XML | Graceful error handling, repair strategies |
| **Nested groups** | Deeply nested `<group>` elements | Recursive parsing |
| **Segmentation** | XLIFF 2.0 segments within units | Handle multiple segments per unit |
| **Metadata preservation** | Custom attributes and elements | Pass-through unknown elements |
| **Empty targets** | Units with no translation yet | Filter or flag appropriately |
| **Whitespace** | Significant whitespace in CJK languages | Respect `xml:space` attribute |

---
