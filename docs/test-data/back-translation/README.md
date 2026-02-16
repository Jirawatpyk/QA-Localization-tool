# Back-translation Reference Data

Reference corpora for testing AI back-translation accuracy (Epic 5 / Story 5.1).

## Output Format

Each `{lang}-reference.json` file must follow this structure:

```json
[
  {
    "id": 1,
    "source_en": "Original English text",
    "target": "Translated text in target language",
    "reference_back_translation": "What the target should translate back to in English",
    "notes": "Optional — nuance, cultural context, or edge case explanation"
  }
]
```

## Files

| File | Segments | Owner | How to Create |
|------|:--------:|-------|---------------|
| `th-reference.json` | 100 | **Mona** | Manually — Thai has unique nuance (particles, compound words, tone markers) |
| `ja-reference.json` | 100 | **Dev** | Extract from `sap-xliff/en-ja/` (see script below) |
| `ko-reference.json` | 100 | **Dev** | Extract from `sap-xliff/en-ko/` (see script below) |
| `zh-reference.json` | 100 | **Dev** | Extract from `sap-xliff/en-zh/` (see script below) |

## Dev: How to Extract JA/KO/ZH from SAP XLIFF

SAP XLIFF files have `<source>` (EN) and `<target>` (JA/KO/ZH) pairs. The EN source = reference back-translation.

### Extraction Script

```typescript
// scripts/extract-back-translation-reference.ts
// Usage: npx tsx scripts/extract-back-translation-reference.ts ja

import { XMLParser } from 'fast-xml-parser';
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const lang = process.argv[2]; // 'ja' | 'ko' | 'zh'
if (!lang) {
  console.error('Usage: npx tsx scripts/extract-back-translation-reference.ts <lang>');
  process.exit(1);
}

const dir = join('docs/test-data/sap-xliff', `en-${lang}`);
const parser = new XMLParser({ ignoreAttributes: false });
const segments: Array<{
  id: number;
  source_en: string;
  target: string;
  reference_back_translation: string;
  notes: string;
}> = [];

let id = 0;
for (const file of readdirSync(dir).filter(f => f.endsWith('.xlf'))) {
  const xml = readFileSync(join(dir, file), 'utf-8');
  const parsed = parser.parse(xml);

  // Navigate XLIFF 1.2 structure: xliff > file > body > trans-unit
  const fileNode = parsed?.xliff?.file;
  if (!fileNode) continue;

  const units = fileNode?.body?.['trans-unit'];
  if (!units) continue;

  const unitList = Array.isArray(units) ? units : [units];
  for (const unit of unitList) {
    const source = typeof unit.source === 'string' ? unit.source : unit.source?.['#text'];
    const target = typeof unit.target === 'string' ? unit.target : unit.target?.['#text'];

    if (source && target && source.trim().length > 10) {
      id++;
      segments.push({
        id,
        source_en: source.trim(),
        target: target.trim(),
        reference_back_translation: source.trim(), // EN source = reference
        notes: `Extracted from SAP ${file}`
      });
    }

    if (segments.length >= 100) break;
  }
  if (segments.length >= 100) break;
}

const outPath = join('docs/test-data/back-translation', `${lang}-reference.json`);
writeFileSync(outPath, JSON.stringify(segments, null, 2), 'utf-8');
console.log(`Wrote ${segments.length} segments to ${outPath}`);
```

### Run

```bash
npx tsx scripts/extract-back-translation-reference.ts ja
npx tsx scripts/extract-back-translation-reference.ts ko
npx tsx scripts/extract-back-translation-reference.ts zh
```

## Mona: How to Create TH Reference

1. Pick 100 segments from your production EN→TH translations
2. For each segment, fill in all fields:
   - `source_en` — copy from source
   - `target` — copy from target (Thai text)
   - `reference_back_translation` — write what the Thai text SHOULD mean back in English
   - `notes` — explain any nuance (particles, compound words, cultural adaptation)

### Segment Mix Guide

| Type | Count | Examples |
|------|:-----:|---------|
| Direct translation | ~40 | Technical terms, UI text |
| Politeness particles (ครับ/ค่ะ/นะ/คะ) | ~15 | Polite forms |
| Compound words (โรงพยาบาล, มหาวิทยาลัย) | ~15 | Words that should not decompose |
| Cultural adaptation | ~10 | Localized idioms/expressions |
| Tone markers (่ ้ ๊ ๋) | ~10 | Words where tone changes meaning |
| Mixed Thai+English | ~10 | Tech terms left in English |
