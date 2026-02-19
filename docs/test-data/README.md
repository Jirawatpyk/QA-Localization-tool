# Test Data Directory

Data for building and testing the qa-localization-tool.

> Full requirements: `_bmad-output/planning-artifacts/data-requirements-and-human-feedback-plan.md`

---

## Status Overview

| Source | Files | Status |
|--------|:-----:|:------:|
| Public test data (parser validation) | 462+ | ✅ Ready |
| Public XLIFF with real translations | 707 | ✅ Ready |
| Public glossary/terminology (TBX + TSV) | 111 TBX + 124K TSV | ✅ Ready (NEW) |
| Production data (from Mona) | — | ⬜ Not yet collected |
| Epic test fixtures (generated from above) | — | 🟡 Partially ready (see notes) |

---

## Mona's Checklist — ต้องเตรียมอะไรบ้าง

| # | ไฟล์อะไร | จำนวน | ใส่ที่ไหน | ต้องใช้ก่อน |
|:-:|---------|:-----:|----------|:----------:|
| 1 | Glossary files (CSV / XLSX / TBX) | ≥ 1 | `glossaries/` | Epic 1 |
| 2 | XLIFF ภาษาไทย (EN→TH) ที่ไม่มี issue | ≥ 5 | `xliff/clean/` | Epic 2 |
| 3 | XLIFF ภาษาไทย (EN→TH) ที่มี issue | ≥ 10 | `xliff/with-issues/` | Epic 2 |
| 4 | Xbench CSV export (คู่กับ XLIFF ข้อ 2-3) | 1 ต่อ 1 XLIFF | `xbench-output/` | Epic 2 |
| 5 | Excel bilingual (source/target columns) | ≥ 1 | `excel/` | Epic 2 |
| 6 | Thai reference สำหรับ back-translation | 100 segments | `back-translation/th-reference.json` | Epic 5 |

> **หมายเหตุ:**
> - ภาษาอื่น (JA/KO/ZH) — XLIFF, language samples, back-translation reference ใช้จาก SAP public data ได้หมด
> - **Mona เตรียมแค่ภาษาไทย** เพราะไม่มี public TH data
> - **วิธีทำข้อ 4:** เปิด Xbench → โหลด XLIFF → Run QA → Export CSV → ตั้งชื่อตาม naming rule ด้านล่าง

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

## 3. Production Data from Mona

Real-world files from Mona's QA workflow. Must be anonymized before adding. **เน้นภาษาไทย (EN→TH).**

### Translation Files

| Directory | What to Put Here | Status |
|-----------|-----------------|:------:|
| `xliff/clean/` | XLIFF EN→TH ที่ Xbench report = 0 issues (≥ 5 files) | ⬜ |
| `xliff/with-issues/` | XLIFF EN→TH ที่ Xbench report มี issues (≥ 10 files) | ⬜ |
| `excel/` | Excel bilingual files (source/target columns) | ⬜ |

### Xbench Output (paired with XLIFF)

| Directory | What to Put Here | Status |
|-----------|-----------------|:------:|
| `xbench-output/` | Xbench CSV export for each XLIFF file above | ⬜ |

**Naming rule:** XLIFF filename + `-xbench-output` suffix
Example: `project-a-file1.xliff` → `project-a-file1-xbench-output.csv`

> This pairing is the **Golden Test Corpus** for Xbench parity testing (see `docs/xbench-parity-spec.md`).

### Glossaries

| Directory | What to Put Here | Status |
|-----------|-----------------|:------:|
| `glossaries/` | Production glossary files (CSV / XLSX / TBX) | ⬜ |

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
| Provide production XLIFF EN→TH + Xbench output | **Mona** | Before Epic 2 / Story 2.4 | ⬜ |
| Provide glossaries (เสริม) | **Mona** | Nice-to-have for Story 1.5 | 🟡 Optional — public data sufficient |
| Provide Thai back-translation reference | **Mona** | Before Epic 5 / Story 5.1 | ⬜ |
| Extract JA/KO/ZH back-translation reference from SAP | Dev | Before Epic 5 / Story 5.1 | ⬜ |
| Generate glossary-matching fixtures from public data (TH/JA/ZH/EN/FR/DE) | Dev | Story 1.5 | ✅ Done — TH=759 JA=759 ZH=759 EN-FR-DE=686 cases, `scripts/generate-th-fixture.mjs` + `scripts/generate-multilang-fixtures.mjs` |
| Create other Epic test fixtures | Dev | During each Epic | ⬜ |

---

## Security

- Anonymize client-confidential content before adding
- This directory should be added to `.gitignore` if the repo will be public
