# Language Pair Calibration Plan

**Author:** Winston (Architect Agent)
**Date:** 2026-02-15
**Status:** Ready for Implementation
**Cross-references:** Architecture Decision 3.6, PRD FR12/FR13, Data Requirements Plan C1-C6, Epics Story 2.5

---

## 1. Purpose

This plan defines how to transition language-pair confidence thresholds from **provisional estimates** (Architecture Decision 3.6) to **production-validated values** using real QA data from Mona's team during MVP beta.

**Current provisional thresholds:**

| Language Pair | Auto-pass Threshold | L2 Confidence Min | Status |
|:---:|:---:|:---:|:---:|
| EN → TH | 93 | 75 | Provisional |
| EN → JA | 93 | 75 | Provisional |
| EN → ZH | 94 | 78 | Provisional |
| EN → KO | 93 | 75 | Provisional |
| Default (new pairs) | 95 | 80 | Conservative |

**Goal:** Validate or adjust each threshold so that:
- Auto-pass override rate < 10% (reviewer disagrees with auto-pass < 10% of the time)
- AI false positive rate < 5% per language pair (PRD Success Criteria)
- AI false negative rate < 3% per language pair (PRD Success Criteria)

---

## 2. Data Sources

All calibration data comes from tables already in the Architecture schema:

| Table | What It Provides | When Populated |
|---|---|---|
| `findings` | AI findings with confidence scores per language pair | Every QA run (Epic 2-3) |
| `review_actions` | Reviewer Accept/Reject/Flag decisions per finding | Every review session (Epic 4) |
| `scores` | File-level MQM scores + auto-pass status | Every scoring event (Story 2.5) |
| `feedback_events` | Structured feedback linking reviewer decision to AI finding | Every decision (Epic 9) |
| `language_pair_configs` | Current thresholds per language pair | Seeded on project creation (Story 1.3) |
| `run_metadata` | Model versions + config snapshot per run | Every pipeline run (Story 8.2) |

**No new tables or infrastructure required.** Calibration uses existing data via SQL queries.

---

## 3. Calibration Phases

### Phase 0: Pre-launch Setup (Before Sprint 1)

**Owner:** Winston (Architect) + Mona (data provider)

| Action | Detail |
|---|---|
| Confirm language pairs for MVP | Mona confirms: EN→TH (primary), EN→ZH, EN→JA, EN→KO (secondary) |
| Prepare test data per pair | Per Data Requirements Plan: ≥ 2 files per pair (1 clean, 1 with known issues) |
| Document expected outcomes | For each test file: list of known issues that Xbench catches + known issues Xbench misses |
| Set provisional values in DB seed | Use Architecture Decision 3.6 defaults in initial migration |

**Deliverable:** `language_pair_configs` seeded with provisional values + test corpus annotated

---

### Phase 1: Baseline Collection (Sprint 3-5, First 2 weeks of QA usage)

**Trigger:** First real files processed through full pipeline (L1+L2 at minimum)

**Data collection method:** Passive — no extra work for Mona beyond normal QA review

| Metric | How to Collect | Minimum Sample |
|---|---|---|
| **Finding accuracy** | Compare AI findings vs reviewer Accept/Reject decisions | 100+ findings per pair |
| **Auto-pass agreement** | Check if reviewer would have passed files that auto-passed | 20+ auto-pass files per pair |
| **Confidence distribution** | Histogram of AI confidence scores per language pair | 200+ findings per pair |
| **False positive rate** | `rejected_findings / total_findings × 100` per pair | 100+ findings per pair |

**SQL query for Phase 1 metrics:**

```sql
-- False positive rate per language pair
SELECT
  lpc.source_lang || '→' || lpc.target_lang AS pair,
  COUNT(*) FILTER (WHERE ra.action_type = 'ACCEPTED') AS accepted,
  COUNT(*) FILTER (WHERE ra.action_type = 'REJECTED') AS rejected,
  COUNT(*) AS total,
  ROUND(
    COUNT(*) FILTER (WHERE ra.action_type = 'REJECTED')::numeric
    / NULLIF(COUNT(*), 0) * 100, 1
  ) AS fp_rate_pct
FROM findings f
JOIN review_actions ra ON ra.finding_id = f.id
JOIN files fi ON f.file_id = fi.id
JOIN projects p ON fi.project_id = p.id
JOIN language_pair_configs lpc
  ON lpc.tenant_id = p.tenant_id
  AND lpc.source_lang = p.source_lang
WHERE f.detected_by_layer IN ('L2', 'L3')
  AND ra.action_type IN ('ACCEPTED', 'REJECTED')
GROUP BY lpc.source_lang, lpc.target_lang;
```

**Exit criteria for Phase 1:** ≥ 100 reviewed findings per primary language pair (EN→TH)

---

### Phase 2: Statistical Analysis (After 500+ findings per pair)

**Trigger:** 500+ AI findings reviewed by Mona's team for a language pair

**Analysis method:**

#### A. Confidence Threshold Calibration

For each language pair, calculate the **optimal L2 confidence threshold** — the score below which AI findings are unreliable:

```
For confidence buckets [0-10, 10-20, ..., 90-100]:
  Calculate: acceptance_rate = accepted / (accepted + rejected)

Optimal threshold = lowest bucket where acceptance_rate ≥ 85%
```

**Example output:**

| Confidence Bucket | EN→TH Accept Rate | EN→ZH Accept Rate |
|:---:|:---:|:---:|
| 90-100 | 95% ✅ | 92% ✅ |
| 80-89 | 88% ✅ | 85% ✅ |
| 70-79 | 76% ❌ | 72% ❌ |
| 60-69 | 61% ❌ | 55% ❌ |

→ EN→TH optimal threshold = **80** (raise from provisional 75)
→ EN→ZH optimal threshold = **80** (raise from provisional 78)

#### B. Auto-pass Threshold Calibration

Calculate the **auto-pass override rate** — how often reviewers disagree with auto-pass:

```
auto_pass_override_rate = files_where_reviewer_found_issues / total_auto_passed_files × 100

If override_rate > 10% → lower auto_pass_threshold by 2
If override_rate < 3%  → can raise auto_pass_threshold by 1 (more auto-pass)
If 3-10%               → keep current threshold
```

**Data source:** Blind audit results from FR68 (weekly 5% sample of auto-passed files)

#### C. False Negative Detection

**Method:** Mona manually reviews 10 random "clean" files (auto-passed, high score) per language pair during blind audit:

```
false_negative_rate = issues_mona_found_but_ai_missed / total_segments_reviewed × 100

Target: < 3% per language pair (PRD Success Criteria)
```

If false_negative_rate > 3%:
- Investigate AI model performance for that language pair
- Consider switching L2/L3 model assignment
- Lower auto-pass threshold as interim protection

---

### Phase 3: Threshold Update (After Analysis)

**Trigger:** Phase 2 analysis complete for a language pair

**Update process:**

1. **Generate calibration report** — automated SQL report showing:
   - Current thresholds vs recommended thresholds
   - Sample sizes and confidence intervals
   - Accept/reject distribution by confidence bucket
   - Auto-pass override rate

2. **Mona review + approval** — Mona reviews calibration report and approves/adjusts recommendations. She has domain knowledge that pure statistics miss (e.g., "this language pair has unusual content types")

3. **Apply via DB update** — Update `language_pair_configs` for the specific pair:
   ```sql
   UPDATE language_pair_configs
   SET auto_pass_threshold = :new_threshold,
       l2_confidence_min = :new_min,
       updated_at = NOW()
   WHERE tenant_id = :tenant AND source_lang = :src AND target_lang = :tgt;
   ```

4. **Audit trail** — Update logged in `audit_logs` with: old values, new values, calibration report reference, approver (Mona)

5. **Mark as production** — Add `calibration_status = 'production'` flag (vs 'provisional')

**No deployment required.** Thresholds are read from DB at runtime — changes take effect on next QA run.

---

### Phase 4: Ongoing Monitoring (Continuous, Post-calibration)

**Trigger:** Always running after Phase 3

**Automated monitoring (via existing feedback_events + Inngest scheduled function):**

| Check | Frequency | Alert If |
|---|---|---|
| False positive rate drift | Weekly | Rate increases > 5 percentage points from calibrated baseline |
| Auto-pass override rate | Weekly | Rate exceeds 10% for any language pair |
| Confidence distribution shift | Monthly | Mean confidence changes > 10 points (model behavior changed) |
| New language pair detection | On file upload | New pair with no `language_pair_configs` entry |

**Drift response:**

| Drift Level | Threshold | Action |
|---|---|---|
| **Minor** | FP rate +2-5% | Log for next calibration cycle |
| **Moderate** | FP rate +5-10% OR override rate 10-15% | Alert Mona + schedule re-calibration within 2 weeks |
| **Major** | FP rate > 15% OR override rate > 15% | Auto-revert to conservative defaults + immediate alert |

**Re-calibration trigger:** Any language pair accumulates 500+ new reviewed findings since last calibration → auto-generate calibration report for Mona to review

---

## 4. New Language Pair Protocol

When a new language pair is added (e.g., EN→AR):

| Step | What | Config |
|:---:|---|---|
| 1 | **Conservative defaults applied** | auto_pass=99, L2_confidence_min=80, calibration_status='provisional' |
| 2 | **Mandatory manual review** | First 50 files require manual review (FR13) — no auto-pass |
| 3 | **"New language pair" badge** | Visible in UI until Phase 2 calibration complete |
| 4 | **Phase 1 starts** | Baseline collection begins immediately from file 1 |
| 5 | **Phase 2 at 500 findings** | When 500+ reviewed findings accumulated → run statistical analysis |
| 6 | **Phase 3 update** | Mona approves calibrated thresholds → status changes to 'production' |
| 7 | **Phase 4 monitoring** | Ongoing monitoring begins |

**Estimated time to calibration:** ~2-4 weeks per language pair (depends on file volume)

---

## 5. Calibration Report Template

Generated automatically when Phase 2 criteria met:

```
=== Language Pair Calibration Report ===
Pair:          EN → TH
Date:          2026-04-15
Sample Size:   523 reviewed findings (L2+L3)
Auto-pass Files: 47 files audited

--- Current Thresholds ---
Auto-pass:     93 (PROVISIONAL)
L2 Conf Min:   75 (PROVISIONAL)

--- Recommended Thresholds ---
Auto-pass:     91 (lower by 2 — override rate 12.8%)
L2 Conf Min:   80 (raise by 5 — bucket 70-79 has 76% accept rate)

--- Evidence ---
False positive rate:     4.2% ✅ (target < 5%)
False negative rate:     1.8% ✅ (target < 3%)
Auto-pass override rate: 12.8% ❌ (target < 10%)

Confidence Distribution:
  90-100: 156 findings, 95% accepted
  80-89:  134 findings, 88% accepted
  70-79:   98 findings, 76% accepted  ← below 85% threshold
  60-69:   72 findings, 61% accepted
  50-59:   43 findings, 44% accepted
  <50:     20 findings, 25% accepted

--- Action Required ---
☐ Mona: Review and approve threshold changes
☐ Apply via DB update (no deploy needed)
```

---

## 6. Integration with Existing Architecture

| Component | How Calibration Connects |
|---|---|
| `language_pair_configs` table | Stores thresholds — calibration updates this table |
| `feedback_events` table | Source data for accept/reject rates |
| `audit_logs` table | Records threshold changes with approver |
| FR68 Blind Audit | Provides auto-pass override rate data |
| FR65 FP Rate Tracking | Provides ongoing false positive monitoring |
| Inngest scheduled function | Weekly monitoring checks (new function, Growth phase) |
| Admin dashboard (Growth) | Displays calibration status and reports |

**MVP scope:** Phases 0-3 (manual SQL queries + Mona review). No UI needed.
**Growth scope:** Phase 4 automation (Inngest monitoring + admin dashboard + auto-reports).

---

## 7. Timeline

```
Sprint 1-2  │ Phase 0: Seed provisional values, prepare test data
            │
Sprint 3-5  │ Phase 1: Baseline collection (passive, during normal QA usage)
            │ └── Mona reviews findings normally → data accumulates
            │
Sprint 5-6  │ Phase 2: Statistical analysis (when 500+ findings per primary pair)
            │ └── Generate calibration report for EN→TH first
            │
Sprint 6    │ Phase 3: Apply calibrated thresholds (EN→TH → production)
            │ └── Secondary pairs (ZH/JA/KO) follow as data accumulates
            │
Sprint 7+   │ Phase 4: Ongoing monitoring (manual checks in MVP, automated in Growth)
```

**Key dependency:** Calibration cannot start until Epic 3 (AI Layer 2) is live and Mona's team is actively reviewing files. No blocking dependency on Sprint 1.

---

*This plan requires zero new infrastructure. All data comes from existing schema tables. Calibration runs as SQL queries during MVP, automated via Inngest in Growth phase.*
