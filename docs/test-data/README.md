# Test Data Directory

Data for building and testing the qa-localization-tool.

> See full requirements: `_bmad-output/planning-artifacts/data-requirements-and-human-feedback-plan.md`

## Downloaded Public Test Data (ready to use)

| Directory | Source | Contents | Purpose |
|-----------|--------|----------|---------|
| `oasis-xliff-test-suite/` | [OASIS XLIFF TC](https://github.com/oasis-tcs/xliff-xliff-22) | 462 XLIFF files — valid + invalid test cases for XLIFF 2.1 + 2.2 | Parser validation, tag handling, edge cases |
| `lingohub-examples/` | [lingohub](https://github.com/lingohub/example-resource-files) | XLIFF 1.2 samples (FR, DE-AT) + multi-format examples (JSON, PO, Android, iOS, etc.) | XLIFF 1.2 parsing, future format reference |
| `tbx-official/` | [LTAC-Global TBX-Basic](https://github.com/LTAC-Global/TBX-Basic_dialect) | TBX sample files (DCA + DCT dialect) + schemas + specs | Glossary import testing (TBX format) |

## Production Data from Mona (to be collected)

| Directory | Contents | Status |
|-----------|----------|:------:|
| `xliff/clean/` | XLIFF files with no/minimal issues | ⬜ |
| `xliff/with-issues/` | XLIFF files with known issues | ⬜ |
| `excel/` | Excel bilingual files (source/target columns) | ⬜ |
| `xbench-output/` | Xbench QA reports (matched to xliff/ files) | ⬜ |
| `glossaries/` | Production glossary files (CSV/XLSX/TBX) | ⬜ |
| `language-samples/en-th/` | Thai samples — no spaces, Thai numerals, line breaks | ⬜ |
| `language-samples/en-zh/` | Chinese samples — no spaces, fullwidth punctuation | ⬜ |
| `language-samples/en-ja/` | Japanese samples — mixed scripts, no spaces | ⬜ |
| `language-samples/en-ko/` | Korean samples — spacing rules | ⬜ |
| `language-samples/en-es/` | Spanish samples — inverted punctuation (¿¡), accents | ⬜ |

## File Naming Convention

- XLIFF: use original filename
- Xbench output: match XLIFF filename + `-xbench-output` suffix
  - Example: `project-a-file1.xliff` → `project-a-file1-xbench-output.csv`

## Security

- Anonymize client-confidential content before adding
- This directory should be added to `.gitignore` if the repo will be public
