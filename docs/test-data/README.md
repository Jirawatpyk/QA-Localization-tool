# Test Data Directory

Data for building and testing the qa-localization-tool.

> Full requirements: `_bmad-output/planning-artifacts/data-requirements-and-human-feedback-plan.md`

---

## Status Overview

| Source | Files | Status |
|--------|:-----:|:------:|
| Public test data (parser validation) | 462+ | ✅ Ready |
| Public XLIFF with real translations | 707 | ✅ Ready (NEW) |
| Production data (from Mona) | — | ⬜ Not yet collected |
| Epic test fixtures (generated from above) | — | ⬜ Waiting on production data |

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

> **หมายเหตุ:** ภาษาอื่น (JA/KO/ZH) มีจาก public data แล้ว — Mona เตรียมแค่ **ภาษาไทย** เป็นหลัก
>
> **วิธีทำข้อ 4:** เปิด Xbench → โหลด XLIFF → Run QA → Export CSV → ตั้งชื่อตาม naming rule ด้านล่าง

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

Purpose-specific test data referenced in Epic acceptance criteria. Created from production data above.

| Directory | Epic / Story | What's Inside | Data Source |
|-----------|-------------|--------------|-------------|
| `glossary-matching/th.json` | Epic 1 / Story 1.5 | 500+ annotated Thai segments for glossary matching validation | ← `glossaries/` |
| `segmenter/{language}.json` | Epic 2 / Story 2.1 | Token count verification for CJK/Thai (Intl.Segmenter) | ← `sap-xliff/` + Mona's TH data |
| `back-translation/th-reference.json` | Epic 5 / Story 5.1 | 100 Thai reference segments for back-translation accuracy | ← Mona (bilingual reference) |

---

## 5. Who Does What

| Task | Owner | When | Status |
|------|-------|------|:------:|
| Download public test data (parser) | Dev | — | ✅ Done |
| Download public XLIFF with translations | Dev | — | ✅ Done (707 files) |
| Provide production XLIFF EN→TH + Xbench output | **Mona** | Before Epic 2 / Story 2.4 | ⬜ |
| Provide glossaries | **Mona** | Before Epic 1 / Story 1.5 | ⬜ |
| Provide Thai back-translation reference | **Mona** | Before Epic 5 / Story 5.1 | ⬜ |
| Create Epic test fixtures from all data | Dev | During each Epic | ⬜ |

---

## Security

- Anonymize client-confidential content before adding
- This directory should be added to `.gitignore` if the repo will be public
