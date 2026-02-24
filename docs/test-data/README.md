# Test Data Directory

Data for building and testing the qa-localization-tool.

> Full requirements: `_bmad-output/planning-artifacts/data-requirements-and-human-feedback-plan.md`

---

## Status Overview

| Source | Files | Status |
|--------|:-----:|:------:|
| Public test data (parser validation) | 462+ | ✅ Ready |
| Public XLIFF with real translations | 707 | ✅ Ready |
| Public glossary/terminology (TBX + TSV) | 111 TBX + 124K TSV | ✅ Ready |
| **Golden Test Corpus (from Mona)** | **695 SDLXLIFF + 19 reports + 19 glossary** | **✅ Ready** |
| Epic test fixtures (generated from above) | — | 🟡 Partially ready (see notes) |

---

## Mona's Checklist — ต้องเตรียมอะไรบ้าง

| # | ไฟล์อะไร | จำนวน | ใส่ที่ไหน | ต้องใช้ก่อน | Status |
|:-:|---------|:-----:|----------|:----------:|:------:|
| 1 | Glossary files (CSV / XLSX / TBX) | ≥ 1 | `Golden-Test-Mona/.../GLOSSARY/` | Epic 1 | ✅ 9 lang pairs |
| 2 | SDLXLIFF ภาษาไทย (EN→TH) ที่ไม่มี issue | ≥ 5 | `Golden-Test-Mona/2026-02-24_Studio_No_issues_Mona/` | Epic 2 | ✅ 14 files |
| 3 | SDLXLIFF ภาษาไทย (EN→TH) ที่มี issue | ≥ 10 | `Golden-Test-Mona/2026-02-24_With_Issues_Mona/` + NCR | Epic 2 | ✅ 8 + 32 TH files |
| 4 | Xbench report (คู่กับ SDLXLIFF ข้อ 2-3) | batch per set | paired in same directory | Epic 2 | ✅ 19 reports |
| 5 | Excel bilingual (source/target columns) | ≥ 1 | included in clean set (xlsx.sdlxliff) | Epic 2 | ✅ 6 files |
| 6 | Thai reference สำหรับ back-translation | 100 segments | `back-translation/th-reference.json` | Epic 5 | ⬜ |

> **หมายเหตุ:**
> - ข้อ 1-5 ครบแล้ว! Golden corpus มี **695 SDLXLIFF** ข้าม **8 ภาษา** (TH, ESLA, FR, IT, PL, PTBR, DE, TR)
> - Xbench reports เป็น **.xlsx** (ไม่ใช่ CSV ตามที่ spec เดิมสมมติ) — batch report ครอบคลุมหลายไฟล์ต่อ 1 report
> - ดู manifest ที่ `golden-corpus/manifest.yaml` สำหรับ file mapping ทั้งหมด
> - เหลือแค่ข้อ 6 (back-translation reference) สำหรับ Epic 5

---

## 1. Public Test Data — Parser Validation

Downloaded from open-source projects. Dev can use immediately.

| Directory | What's Inside | Used For |
|-----------|--------------|----------|
| `oasis-xliff-test-suite/` | 462 XLIFF 2.1 + 2.2 files (valid + invalid) | Parser validation, tag handling, edge cases |
| `lingohub-examples/` | XLIFF 1.2 samples (FR, DE-AT) + multi-format (JSON, PO, Android, iOS) | XLIFF 1.2 parsing, future format reference |
| `tbx-official/` | TBX sample files (DCA + DCT dialect) + schemas | Glossary import testing (TBX format) |

Sources: [OASIS XLIFF TC](https://github.com/oasis-tcs/xliff-xliff-22), [lingohub](https://github.com/lingohub/example-resource-files), [LTAC-Global TBX-Basic](https://github.com/LTAC-Global/TBX-Basic_dialect)

---

## 1b. Public Test Data — Glossary & Terminology (NEW)

| Directory | What's Inside | Used For |
|-----------|--------------|----------|
| `microsoft-terminology/` | 111 TBX files (~100 languages) — THAI.tbx has 34,515 EN→TH terms | TBX import testing, glossary matching (all languages) |
| `yaitron-en-th/` | 124,187 EN↔TH dictionary entries (TSV + XML + SQL) | Large-scale EN→TH glossary testing, CSV import |

Sources: [Microsoft Terminology](https://learn.microsoft.com/en-us/globalization/reference/microsoft-terminology), [Yaitron](https://github.com/veer66/Yaitron) (based on LEXiTRON)

---

## 2. Public Test Data — Real Translations (NEW)

XLIFF files with real translations — useful for rule engine testing and QA validation.

| Directory | Files | Format | Language Pairs | What's Inside | Used For |
|-----------|:-----:|--------|---------------|--------------|----------|
| `sap-xliff/en-ja/` | 195 | XLIFF 1.2 | EN→JA | SAP technical docs (MT) | Number/placeholder/terminology checks |
| `sap-xliff/en-ko/` | 195 | XLIFF 1.2 | EN→KO | SAP technical docs (MT) | Number/placeholder/terminology checks |
| `sap-xliff/en-zh/` | 195 | XLIFF 1.2 | EN→ZH | SAP technical docs (MT) | CJK-specific checks, fullwidth punctuation |
| `ocelot-test-files/` | 38 | XLIFF 1.2 + 2.0 | EN→JA, EN→RU, misc | Ocelot QA tool test files — includes MT artifacts, spacing issues | Parser + QA rule testing |
| `capstanlqc-xliff/haram-bad/` | 6 | XLIFF 1.2 | misc | **Intentionally broken** XLIFF — bad tags, fragmented segments | QA rule testing (known issues) |
| `capstanlqc-xliff/halal-good/` | 6 | XLIFF 1.2 | misc | **Correctly structured** XLIFF — best practices | False positive testing |
| `locize-xliff-fixtures/` | 44 | XLIFF 1.2 + 2.0 | misc | Parser edge cases — CDATA, inline elements, Angular format | Parser robustness testing |
| `pwa-install-i18n/` | 28 | XLIFF 1.2 | EN→JA, KO, ZH + 25 langs | Real community translations | Multi-language QA testing |

Sources: [SAP Documentation](https://github.com/SAP/software-documentation-data-set-for-machine-translation) (CC BY-NC 4.0), [Ocelot](https://github.com/vistatec/ocelot) (LGPL-3.0), [capstanlqc](https://github.com/capstanlqc/xliff_bestpractices_omt), [locize/xliff](https://github.com/locize/xliff) (MIT), [pwa-install](https://github.com/khmyznikov/pwa-install) (MIT)

---

## 3. Golden Test Corpus (from Mona) — ✅ READY

Real-world production files from Mona's QA workflow. **695 SDLXLIFF files across 8 languages + 19 Xbench reports.**

> Manifest: `golden-corpus/manifest.yaml` — complete file-to-report mapping with tiered testing strategy.
> Parity spec: `docs/xbench-parity-spec.md` — acceptance criteria for rule engine validation.

### Tier 1 — MVP Parity (BT Barista Trainer EN→TH) — Start Here

| Directory | Files | Format | Lang | Status |
|-----------|:-----:|--------|:----:|:------:|
| `Golden-Test-Mona/2026-02-24_Studio_No_issues_Mona/` | 14 | SDLXLIFF (pptx + xlsx) | EN→TH | ✅ Clean |
| `Golden-Test-Mona/2026-02-24_With_Issues_Mona/` | 8 | SDLXLIFF (pptx) | EN→TH | ✅ With issues |
| `Golden-Test-Mona/2026-02-24_With_Issues_Mona/Xbench_QA_Report.xlsx` | 1 | xlsx (batch) | — | ✅ Report |

### Tier 2 — Extended TH (NCR One Time Passcode)

| Directory | Files | Format | Lang | Status |
|-----------|:-----:|--------|:----:|:------:|
| `Golden-Test-Mona/JOS24-00585.../1 QA-Translation/2024-09-12_TH/1_Studio/` | 32 | SDLXLIFF (VTT + docx) | EN→TH | ✅ QA'd |
| `Golden-Test-Mona/JOS24-00585.../1 QA-Translation/2024-09-12_TH/QA Report/` | 4 | xlsx (batch) | — | ✅ Reports |

### Tier 3 — Multi-language Regression (NCR)

| Language | QA'd SDLXLIFF | Reports | From-translator |
|----------|:------------:|:-------:|:---------------:|
| ESLA (es-LA) | 32 | 2 | 32 + 32 (v2) |
| FR (fr-FR) | ~32 | 2 | in PL/FR/PT dir |
| IT (it-IT) | ~32 | 2 | 64 |
| PL (pl-PL) | ~32 | 2 | in PL/FR/PT dir |
| PT-BR (pt-BR) | ~32 | 2 | in PL/FR/PT dir |
| DE (de-DE) | 32 | 2 | 64 |
| TR (tr-TR) | 32 | 1 | 64 |

### Glossaries (NCR Security Awareness)

| Directory | Files | Format | Status |
|-----------|:-----:|--------|:------:|
| `Golden-Test-Mona/JOS24-00585.../GLOSSARY/NCR Security Awareness/` | 9 pairs | xlsx + sdltb | ✅ Ready |

Languages: ar-AE, de-DE, es-LA, fr-FR, he-IL, it-IT, ja-JP, nl-BE, pt-BR

### Report Authority Rules

When multiple Xbench reports exist for the same file set:
1. **Original > Updated_*** (Original matches the raw SDLXLIFF files in corpus)
2. **Updated_*** = post-fix re-scan (translator fixed some issues — fewer findings). Use for verification only.
3. **LI/** copies are byte-identical to Original — ignore duplicates
4. From-translator reports = translator's own QA (informational, not authoritative)

---

## 4. Epic Test Fixtures

Purpose-specific test data referenced in Epic acceptance criteria.

| Directory | Epic / Story | What's Inside | Data Source | Status |
|-----------|-------------|--------------|-------------|:------:|
| `glossary-matching/th.json` | Epic 1 / Story 1.5 | 759 annotated Thai cases from `THAI.tbx` (34,515 EN→TH terms) | ← `microsoft-terminology/THAI.tbx` | ✅ **Done** — `scripts/generate-th-fixture.mjs` |
| `glossary-matching/ja.json` | Epic 1 / Story 1.5 | 759 annotated Japanese cases from `JAPANESE.tbx` (51,578 EN→JA pairs) | ← `microsoft-terminology/JAPANESE.tbx` | ✅ **Done** — `scripts/generate-multilang-fixtures.mjs` |
| `glossary-matching/zh.json` | Epic 1 / Story 1.5 | 759 annotated Chinese (Simplified) cases from `CHINESE (SIMPLIFIED).tbx` | ← `microsoft-terminology/CHINESE (SIMPLIFIED).tbx` | ✅ **Done** — `scripts/generate-multilang-fixtures.mjs` |
| `glossary-matching/en-fr-de.json` | Epic 1 / Story 1.5 | 686 annotated EN/FR/DE cases (mixed lang field) from `FRENCH.tbx` + `GERMAN.tbx` | ← `microsoft-terminology/FRENCH.tbx` + `GERMAN.tbx` | ✅ **Done** — `scripts/generate-multilang-fixtures.mjs` |
| `segmenter/{language}.json` | Epic 2 / Story 2.1 | Token count verification for CJK/Thai (Intl.Segmenter) | ← `sap-xliff/` | 🟢 Data ready |
| `back-translation/th-reference.json` | Epic 5 / Story 5.1 | 100 Thai reference segments — Mona เขียน reference back-translation | ← Mona (bilingual reference) | ⬜ Mona |
| `back-translation/ja-reference.json` | Epic 5 / Story 5.1 | JA back-translation reference — extract EN source from SAP | ← Dev extract จาก `sap-xliff/en-ja/` | 🟢 Data ready |
| `back-translation/ko-reference.json` | Epic 5 / Story 5.1 | KO back-translation reference — extract EN source from SAP | ← Dev extract จาก `sap-xliff/en-ko/` | 🟢 Data ready |
| `back-translation/zh-reference.json` | Epic 5 / Story 5.1 | ZH back-translation reference — extract EN source from SAP | ← Dev extract จาก `sap-xliff/en-zh/` | 🟢 Data ready |

> **Note สำหรับ Story 1.5 (Glossary Matching):**
> ไม่ต้องรอ production data จาก Mona — ใช้ Microsoft THAI.tbx (34,515 terms) + Yaitron (124K entries) สร้าง fixture ได้เลย
> Mona's glossary เป็นข้อมูลเสริมสำหรับ real-world validation เพิ่มเติม

---

## 5. Who Does What

| Task | Owner | When | Status |
|------|-------|------|:------:|
| Download public test data (parser) | Dev | — | ✅ Done |
| Download public XLIFF with translations | Dev | — | ✅ Done (707 files) |
| Provide production SDLXLIFF + Xbench output | **Mona** | Before Epic 2 / Story 2.4 | ✅ Done — 695 SDLXLIFF + 19 reports (Golden-Test-Mona/) |
| Provide glossaries | **Mona** | For glossary compliance testing | ✅ Done — 9 lang pairs (NCR Security Awareness) |
| Provide Thai back-translation reference | **Mona** | Before Epic 5 / Story 5.1 | ⬜ |
| Extract JA/KO/ZH back-translation reference from SAP | Dev | Before Epic 5 / Story 5.1 | ⬜ |
| Generate glossary-matching fixtures from public data (TH/JA/ZH/EN/FR/DE) | Dev | Story 1.5 | ✅ Done — TH=759 JA=759 ZH=759 EN-FR-DE=686 cases, `scripts/generate-th-fixture.mjs` + `scripts/generate-multilang-fixtures.mjs` |
| Create other Epic test fixtures | Dev | During each Epic | ⬜ |

---

## Security

- Anonymize client-confidential content before adding
- This directory should be added to `.gitignore` if the repo will be public
