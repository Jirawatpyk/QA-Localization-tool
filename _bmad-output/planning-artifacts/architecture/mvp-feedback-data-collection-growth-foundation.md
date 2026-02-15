# MVP Feedback Data Collection (Growth Foundation)

_This section defines data collection patterns in MVP that provide the training data foundation for Growth-phase Self-healing Translation. Collecting feedback from Day 1 builds a competitive data moat before the Self-healing feature launches._

**Source:** Self-healing Translation Research — Recommendation #4: "Build feedback loop infrastructure from day 1 — this is our long-term competitive moat"

### Feedback Events Schema

```typescript
// src/db/schema/feedbackEvents.ts
export const feedbackEvents = pgTable('feedback_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  findingId: uuid('finding_id').notNull().references(() => findings.id),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  reviewerId: uuid('reviewer_id').notNull(),

  // Context for future ML training
  action: varchar('action', { length: 20 }).notNull(),        // 'accept' | 'reject' | 'edit' | 'change_severity'
  findingCategory: varchar('finding_category', { length: 50 }),  // MQM category (accuracy, fluency, etc.)
  findingSeverity: varchar('finding_severity', { length: 20 }),  // original severity
  newSeverity: varchar('new_severity', { length: 20 }),          // if changed

  // Source/Target for training data
  sourceLang: varchar('source_lang', { length: 10 }).notNull(),
  targetLang: varchar('target_lang', { length: 10 }).notNull(),
  sourceText: text('source_text').notNull(),
  originalTarget: text('original_target').notNull(),
  correctedTarget: text('corrected_target'),                     // if reviewer edited the target

  // AI layer metadata
  detectedByLayer: varchar('detected_by_layer', { length: 5 }), // 'L1' | 'L2' | 'L3'
  aiModel: varchar('ai_model', { length: 50 }),                  // model that detected the issue
  aiConfidence: real('ai_confidence'),                            // 0-100 confidence score

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// Indexes for future ML pipeline queries
// idx_feedback_events_lang_pair: (source_lang, target_lang, action)
// idx_feedback_events_category: (finding_category, action)
// idx_feedback_events_tenant_created: (tenant_id, created_at)
```

### Collection Points (MVP)

Every review action automatically writes to `feedback_events`:

| Review Action | `action` Value | Extra Data Captured |
|--------------|---------------|---------------------|
| Accept finding | `accept` | AI confidence was correct — positive signal |
| Reject finding (false positive) | `reject` | AI was wrong — negative signal for retraining |
| Edit target text | `edit` | `corrected_target` = gold standard correction |
| Change severity | `change_severity` | `new_severity` = calibration data |

### Implementation Pattern

```typescript
// Inside review Server Actions (e.g., acceptFinding.action.ts)
// After updating finding status, also write feedback event:
await db.insert(feedbackEvents).values({
  tenantId, findingId, projectId, reviewerId,
  action: 'accept',
  findingCategory: finding.category,
  findingSeverity: finding.severity,
  sourceLang, targetLang,
  sourceText: segment.source,
  originalTarget: segment.target,
  detectedByLayer: finding.detectedByLayer,
  aiModel: finding.aiModel,
  aiConfidence: finding.aiConfidence,
})
```

**Performance Impact:** INSERT only, no queries during review flow. Zero impact on P95 latency.

**RLS:** Same policy as findings — tenant-scoped, reviewers can INSERT, admins can SELECT for analytics.

**Data Volume Estimate:** ~10-50 events per review session × ~20 sessions/day = 200-1,000 rows/day. Negligible storage cost.

### Value for Growth Phase

| Data Collected | Growth Phase Usage |
|---------------|-------------------|
| Accept/Reject signals | Train confidence calibration per language pair |
| Edited target text | Gold-standard corrections for fine-tuning Fix Agent |
| Category + Severity changes | Calibrate MQM category detection accuracy per model |
| Layer + Model metadata | Evaluate which model performs best per language pair |

**Data Moat Timeline:** After 3-6 months of MVP usage, accumulated feedback_events provide enough training data to fine-tune domain-specific models — a competitive advantage no competitor can replicate without similar usage data.

---
