# Localization QA Researcher — Memory

## Project Context

- Project: qa-localization-tool (AI-powered localization QA web app)
- Stack: Next.js 16 + Supabase + Inngest + Vercel AI SDK
- Goal: Single-Pass Completion, 100% Xbench parity for L1 rule engine
- Story 2.4: Implement rule engine (6 categories + CJK/Thai language rules)

## Key Research Paths

- Rule engine research: `_bmad-output/planning-artifacts/research/technical-rule-engine-3-layer-pipeline-research-2026-02-12/`
- Tech/framework research: `_bmad-output/planning-artifacts/research/technical-qa-localization-tools-and-frameworks-research-2026-02-11/`
- CJK/Thai research spike: `_bmad-output/planning-artifacts/research/intl-segmenter-cjk-thai-research-spike-2026-02-15.md`

## Xbench Parity — 18 Check Types

Xbench has 18 checks. MVP covers 14 (8 core + 6 bonus). 3 consistency checks deferred to Phase 2.
Core checks: tag-integrity(Critical), missing-text(Critical), number-consistency(Critical),
placeholder-match(Critical), glossary-compliance(Major), punctuation(Major),
symbol-numbering(Major), capitalization(Minor), double-spacing(Minor), text-format(Minor)

## MQM Scoring

Formula: Score = max(0, 100 - NPT) where NPT = (APT / EWC) \* 1000
Severity multipliers: Critical=25, Major=5, Minor=1
Auto-pass: score >= 95 AND 0 Critical findings

## CJK/Thai Critical Rules

- NEVER use \b word boundary for CJK/Thai/Korean — use Intl.Segmenter hybrid approach
- NFKC normalize before text comparison (glossary, dedup) but NOT before Intl.Segmenter (Thai sara am U+0E33 decomposes)
- Intl.Segmenter instances MUST be cached per locale (singleton) — ~2x perf improvement
- Chunk text at 30,000 chars max to prevent stack overflow
- Strip inline markup before segmentation, maintain offset map
- Hybrid strategy: substring search (primary) + Intl.Segmenter boundary validation (secondary)

## Compound Word Splitting (All CJK+Thai)

- Thai: 4/10 glossary terms split (โรงพยาบาล, สนามบิน, ตู้เย็น, ปัญญาประดิษฐ์)
- Chinese: 4/4 common terms SPLIT — aggressive 2-char splitting
- Japanese: Kanji compounds split, Katakana loan words INTACT
- Korean: Sino-Korean compounds split, loan words (컴퓨터, 프로그래밍) INTACT

## Thai-Specific Patterns

- Thai particles (ครับ/ค่ะ/นะ/ไหม) correctly segmented as separate segments — do NOT flag
- Thai+English adjacency without space fails segmenter — strip markup first
- Thai numeral ↔ Arabic: ๑๒๓ = 123 — must map before number consistency check

## Performance Benchmarks

- Intl.Segmenter: ~0.017ms per call (cached instance)
- 5,000 Thai segments (25,500 chars): ~229ms total
- 5,000 Chinese segments (11,500 chars): ~102ms total
- Target: 5,000 segments in < 5 seconds — achievable

## Rule Engine Architecture Pattern

Each rule implements QARule interface: { id, name, severity, category, execute(segment) }
Rules registered in RuleRegistry, executed per-segment by RuleRunner
Findings deduplicated in FindingCollector
Each rule tested independently with Vitest
See: `architectural-patterns-and-design.md` section 2 for full implementations

## Files to Reference for Story 2.4 Implementation

- `technology-stack-analysis.md` — Rule 1-10 implementations with TypeScript code
- `architectural-patterns-and-design.md` — Score formula + architecture diagram
- `implementation-approaches-and-technology-adoption.md` — Testing strategy + dev order
- `intl-segmenter-cjk-thai-research-spike-2026-02-15.md` — Glossary matching hybrid approach
