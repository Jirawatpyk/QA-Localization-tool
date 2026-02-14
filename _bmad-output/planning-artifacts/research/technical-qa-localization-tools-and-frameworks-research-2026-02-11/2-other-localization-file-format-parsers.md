# 2. Other Localization File Format Parsers

### 2.1 JSON i18n Parsers

#### `i18next-json-parser` / `i18next` native JSON support

| Attribute | Detail |
|-----------|--------|
| **npm package** | `i18next` (built-in JSON support) |
| **GitHub** | https://github.com/i18next/i18next |
| **Weekly downloads** | ~4M+ |
| **Format** | Nested JSON, flat JSON, i18next JSON v4 |

**JSON Format support:**
- Flat keys: `{ "greeting": "Hello" }`
- Nested keys: `{ "common": { "greeting": "Hello" } }`
- Plurals: `{ "item": "{{count}} item", "item_plural": "{{count}} items" }`
- Contexts: `{ "friend_male": "boyfriend", "friend_female": "girlfriend" }`
- ICU MessageFormat via plugin

#### `messageformat` / `@messageformat/core`

| Attribute | Detail |
|-----------|--------|
| **npm package** | `@messageformat/core` |
| **GitHub** | https://github.com/messageformat/messageformat |
| **Weekly downloads** | ~500K+ |
| **Format** | ICU MessageFormat |
| **License** | MIT |

**Features:**
- Full ICU MessageFormat support
- Plurals, select, selectordinal
- Number/date formatting
- Compile to JavaScript functions

---

### 2.2 PO/POT File Parsers (gettext)

#### `gettext-parser`

| Attribute | Detail |
|-----------|--------|
| **npm package** | `gettext-parser` |
| **GitHub** | https://github.com/smhg/gettext-parser |
| **Weekly downloads** | ~800K-1M |
| **Last updated** | 2023-2024 |
| **License** | MIT |
| **Maintenance** | Moderate -- stable, infrequent updates |

**Features:**
- Parse PO and MO files to JavaScript objects
- Compile JavaScript objects to PO and MO files
- Handles plural forms
- Supports headers, comments, contexts (msgctxt)
- Handles multiline strings
- Used by `i18next-gettext-converter`

**Code example:**
```javascript
import * as gettextParser from 'gettext-parser';

const po = gettextParser.po.parse(poFileBuffer);
// po.translations['context']['msgid'] = { msgstr: [...], comments: {...} }

const compiled = gettextParser.po.compile(po);
```

#### `pofile`

| Attribute | Detail |
|-----------|--------|
| **npm package** | `pofile` |
| **GitHub** | https://github.com/rubenv/pofile |
| **Weekly downloads** | ~50K-80K |
| **License** | MIT |

**Features:**
- PO file parsing and serialization
- Object model for PO entries
- Handles plurals, comments, flags, references
- Simpler API than `gettext-parser`

#### `jed` / `@m59/jed`

| Attribute | Detail |
|-----------|--------|
| **npm package** | `jed` |
| **Weekly downloads** | ~30K-50K |
| **Features** | Gettext-style i18n runtime for JS |

---

### 2.3 Android XML String Parsers

#### `android-string-resource`

| Attribute | Detail |
|-----------|--------|
| **npm package** | `android-string-resource` |
| **Weekly downloads** | Low (~100-500) |
| **Format** | Android `strings.xml` |

**Features:**
- Parse Android `strings.xml` files
- Handle `<string>`, `<string-array>`, `<plurals>`
- Preserve comments and formatting

#### Custom parsing approach (recommended)

Since there's no dominant Android XML parser on npm, most projects use `fast-xml-parser` or `xml2js` with custom mapping:

```xml
<!-- Android strings.xml -->
<resources>
    <string name="app_name">My App</string>
    <string name="greeting">Hello, %1$s!</string>
    <plurals name="items">
        <item quantity="one">%d item</item>
        <item quantity="other">%d items</item>
    </plurals>
</resources>
```

**Recommendation:** Use `fast-xml-parser` with a custom adapter for Android XML. The dedicated packages have very low adoption.

---

### 2.4 iOS .strings / .stringsdict Parsers

#### `apple-strings`

| Attribute | Detail |
|-----------|--------|
| **npm package** | `apple-strings` |
| **Weekly downloads** | Low (~100-300) |
| **Format** | `.strings` |

#### `dot-strings` / `ios-strings`

| Attribute | Detail |
|-----------|--------|
| **npm package** | `dot-strings` |
| **Format** | iOS `.strings` files |

**iOS .strings format:**
```
/* Comment */
"key" = "value";
"greeting" = "Hello, %@!";
```

**iOS .stringsdict format (plist XML):**
```xml
<plist version="1.0">
<dict>
    <key>items_count</key>
    <dict>
        <key>NSStringLocalizedFormatKey</key>
        <string>%#@count@</string>
        <key>count</key>
        <dict>
            <key>NSStringFormatSpecTypeKey</key>
            <string>NSStringPluralRuleType</string>
            <key>one</key>
            <string>%d item</string>
            <key>other</key>
            <string>%d items</string>
        </dict>
    </dict>
</dict>
</plist>
```

**Recommendation:** The `.strings` format is simple enough to parse with regex. For `.stringsdict` (plist XML), use `plist` npm package + custom mapping. No single dominant library exists for iOS formats.

#### `plist` (for .stringsdict)

| Attribute | Detail |
|-----------|--------|
| **npm package** | `plist` |
| **GitHub** | https://github.com/nicklockwood/plist |
| **Weekly downloads** | ~2M+ |
| **Features** | Parse/build Apple plist files (XML and binary) |

---

### 2.5 YAML Localization Parsers

#### `js-yaml`

| Attribute | Detail |
|-----------|--------|
| **npm package** | `js-yaml` |
| **GitHub** | https://github.com/nodeca/js-yaml |
| **Weekly downloads** | ~30M+ |
| **License** | MIT |
| **Maintenance** | Actively maintained |

**Features:**
- Full YAML 1.1 spec support
- Safe loading (no code execution)
- Used by Rails-style i18n YAML files

**YAML i18n format example (Rails):**
```yaml
en:
  greeting: "Hello"
  messages:
    welcome: "Welcome to %{app_name}"
```

**Recommendation:** `js-yaml` is the clear winner for YAML parsing. Very mature and widely used.

---

### 2.6 Localization Format Parser Comparison

| Format | Best Library | Downloads | Maturity | Notes |
|--------|-------------|-----------|----------|-------|
| **XLIFF 1.2/2.0** | `xliff` | ~30K/wk | High | First-party XLIFF support |
| **JSON i18n** | `i18next` (native) | ~4M/wk | Very High | Built-in JSON format |
| **PO/POT** | `gettext-parser` | ~1M/wk | High | De facto standard |
| **Android XML** | `fast-xml-parser` + custom | ~30M/wk | High | No dedicated dominant lib |
| **iOS .strings** | Custom regex | N/A | N/A | Simple format |
| **iOS .stringsdict** | `plist` + custom | ~2M/wk | High | Plist XML format |
| **YAML** | `js-yaml` | ~30M/wk | Very High | Standard YAML parser |
| **ICU MessageFormat** | `@messageformat/core` | ~500K/wk | High | ICU standard |

---
