# Growth Architecture: Self-healing Translation Foundation

_This section documents architectural patterns from the Self-healing Translation Research that guide Growth-phase implementation. While Self-healing (FR-SH1-18) is not built in MVP, these patterns are documented here to prevent costly retrofitting and ensure MVP decisions do not conflict with Growth requirements._

**Source:** Technical AI/LLM Self-healing Translation Research (2026-02-14) — 6 core technologies confirmed feasible with existing stack

### Self-healing Pipeline Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Rule-based Auto-fix (Phase 0)                  │
│ → Tag repair, placeholder restore, number format fix    │
│ → 99% safe, zero cost, instant                          │
│ → Uses existing L1 rule layer infrastructure             │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: AI Quick-fix Agent                             │
│ → Terminology corrections, obvious fluency fixes        │
│ → GPT-4o-mini (same as L2 screening)                   │
│ → RAG: glossary + translation memory retrieval          │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Deep AI Fix Agent + Judge Agent                │
│ → Fix Agent: Claude Sonnet generates correction         │
│ → Judge Agent: Separate model verifies fix quality      │
│ → Prevents self-evaluation bias (research finding)      │
│ → RUBRIC-MQM span-level confidence scoring              │
└────────────────────────┬────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 4: Progressive Trust Routing                      │
│ → 🟢 High confidence (>95%) → Auto-apply (Autonomous)  │
│ → 🟡 Medium (70-95%) → 1-click apply (Assisted)        │
│ → 🔴 Low (<70%) → Flag for review (Shadow)             │
└─────────────────────────────────────────────────────────┘
```

### Key Architectural Patterns (from Research)

**1. Fix Agent + Judge Agent (Decoupled Verification)**
- Fix Agent generates corrections using RAG-augmented prompts
- Judge Agent (different model or prompt) evaluates fix quality independently
- Prevents hallucination propagation — wrong fixes destroyed before user sees them
- MVP Inngest pipeline already supports multi-step execution (reuse same infrastructure)

**2. Progressive Trust Model**
- **Shadow Mode:** AI generates fix suggestions, displays alongside findings, but never auto-applies. Reviewer sees "suggested fix" badge. All accept/reject tracked in `feedback_events`.
- **Assisted Mode:** High-confidence fixes presented as 1-click apply. Reviewer can accept with single action.
- **Autonomous Mode:** Highest-confidence fixes auto-applied. Reviewer can override. Requires 2+ months of calibration data per language pair.
- **Kill Criteria:** Revert rate > 15% (rolling 500 fixes) → regress to previous trust level

**3. RAG Pipeline (pgvector)**
- Supabase already includes pgvector extension — no new infrastructure needed
- Embed glossary terms + translation memory segments for retrieval
- Fix Agent prompt = source + target + retrieved glossary context + retrieved TM examples
- Embedding model: text-embedding-3-small (OpenAI) — $0.02/1M tokens, sufficient quality

**4. Constrained Decoding for XLIFF Integrity**
- Vercel AI SDK structured output (Zod schemas) enforces tag/placeholder preservation
- Fix must preserve all XLIFF tags, placeholders (`{0}`, `%s`), and HTML entities
- Schema validation: original tags == fixed tags (post-processing check)

### Integration Points with MVP Architecture

| MVP Component | Growth Self-healing Usage |
|--------------|--------------------------|
| Inngest pipeline (3-tier) | Add fix steps after detection steps — same orchestrator |
| `feedback_events` table | Training data for confidence calibration + fine-tuning |
| `language_pair_configs` table | Per-language confidence thresholds for Progressive Trust |
| `lib/ai/providers.ts` | LAYER_MODELS config extends to Fix Agent + Judge Agent models |
| `lib/ai/fallbackChain.ts` | Same fallback pattern applies to fix generation |
| Supabase Realtime | Push fix suggestions to review UI in real-time |
| Zustand `useReviewStore` | Extend with `suggestedFix` field per finding |
| Audit log (3-layer) | All auto-fixes logged with full provenance |

### Future File Structure (Growth)

```
src/features/self-healing/
  agents/
    fixAgent.ts              # Fix generation with RAG context
    judgeAgent.ts            # Independent fix verification
  inngest/
    selfHealingOrchestrator.ts  # Orchestrate fix pipeline
    fixBatchWorker.ts        # Batch fix generation
  components/
    SuggestedFix.tsx         # Fix suggestion UI with 1-click apply
    FixConfidenceBadge.tsx   # Confidence visualization
    TrustLevelIndicator.tsx  # Shadow/Assisted/Autonomous status
  hooks/
    useSuggestedFixes.ts     # Realtime fix subscription
  stores/
    selfHealing.store.ts     # Fix state management
  actions/
    applyFix.action.ts       # Apply suggested fix
    rejectFix.action.ts      # Reject and log feedback
```

### Phased Implementation Roadmap (from Research)

| Phase | Name | Scope | Data Requirement |
|:-----:|------|-------|-----------------|
| 0 | Rule-based Auto-fix | Tag repair, placeholder restore (L1 only) | None — deterministic rules |
| 1 | Shadow Mode | AI generates fixes, displays alongside findings, never auto-applies | Needs ~1,000 feedback_events per language pair |
| 2 | Assisted Mode | 1-click apply for high-confidence fixes | Needs ~5,000 feedback_events + calibrated thresholds |
| 3 | Autonomous Mode | Auto-apply highest-confidence fixes | Needs ~10,000 feedback_events + proven accuracy |

### Cost Projection (from Research)

Self-healing adds fix generation cost on top of QA detection:

| Component | Per 100K Words | Notes |
|-----------|:--------------:|-------|
| QA Detection (MVP) | $0.40 - $2.40 | Economy vs Thorough |
| Fix Generation (Growth) | $1.50 - $3.00 | Fix Agent + Judge Agent |
| **Total with Self-healing** | **$1.90 - $5.40** | Still 70-85% cheaper than human QA ($150-300) |

---
