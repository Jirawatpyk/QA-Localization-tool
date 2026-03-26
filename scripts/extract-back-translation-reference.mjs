// scripts/extract-back-translation-reference.mjs
// Usage: node scripts/extract-back-translation-reference.mjs ja|ko|zh
// Extracts 100 source/target pairs from SAP XLIFF 1.2 files

import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const lang = process.argv[2];
if (!lang || !['ja', 'ko', 'zh'].includes(lang)) {
  console.error('Usage: node scripts/extract-back-translation-reference.mjs <ja|ko|zh>');
  process.exit(1);
}

const dir = join('docs/test-data/sap-xliff', `en-${lang}`);
const files = readdirSync(dir).filter(f => f.endsWith('.xlf')).sort((a, b) => {
  const numA = parseInt(a.replace('.xlf', ''));
  const numB = parseInt(b.replace('.xlf', ''));
  return numA - numB;
});

const segments = [];
const seen = new Set(); // deduplicate

for (const file of files) {
  const xml = readFileSync(join(dir, file), 'utf-8');

  // Extract translatable trans-units (no translate="no")
  // Pattern: <trans-unit id="..."> with <source>...<seg-source><mrk>...</mrk></seg-source> <target><mrk>...</mrk></target>
  const unitRegex = /<trans-unit(?![^>]*translate="no")[^>]*>([\s\S]*?)<\/trans-unit>/g;
  let match;

  while ((match = unitRegex.exec(xml)) !== null) {
    const unitContent = match[1];

    // Extract source text from <seg-source><mrk>...</mrk></seg-source>
    const segSourceMatch = unitContent.match(/<seg-source><mrk[^>]*>([\s\S]*?)<\/mrk><\/seg-source>/);
    const targetMatch = unitContent.match(/<target><mrk[^>]*>([\s\S]*?)<\/mrk><\/target>/);

    if (!segSourceMatch || !targetMatch) continue;

    // Strip XML tags and entity-encoded tags to get plain text
    const stripTags = (s) => s
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;[^&]*?&gt;/g, '')
      .trim();
    const sourceText = stripTags(segSourceMatch[1]);
    const targetText = stripTags(targetMatch[1]);

    // Filter: must have meaningful content (>10 chars source), non-empty target, not duplicate
    if (!sourceText || !targetText || sourceText.length <= 10) continue;
    if (seen.has(sourceText)) continue;

    // Skip entries that are just markup/code
    if (sourceText.startsWith('&lt;') || sourceText.startsWith('<')) continue;
    if (/^[A-Z0-9_]+$/.test(sourceText)) continue; // all-caps identifiers

    seen.add(sourceText);
    segments.push({
      id: segments.length + 1,
      source_en: sourceText,
      target: targetText,
      reference_back_translation: sourceText, // EN source = reference
      notes: `Extracted from SAP XLIFF ${file}`
    });

    if (segments.length >= 100) break;
  }

  if (segments.length >= 100) break;
}

const outPath = join('docs/test-data/back-translation', `${lang}-reference.json`);
writeFileSync(outPath, JSON.stringify(segments, null, 2), 'utf-8');
console.log(`Wrote ${segments.length} segments to ${outPath}`);
