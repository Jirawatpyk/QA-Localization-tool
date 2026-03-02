# Story 3.2a Anti-Pattern Scan — 2026-03-01

## Files Scanned (11 total)

1. `src/features/pipeline/helpers/runL2ForFile.ts`
2. `src/features/pipeline/helpers/runL2ForFile.test.ts`
3. `src/test/fixtures/ai-responses.ts`
4. `src/features/pipeline/schemas/l2-output.ts`
5. `src/lib/ai/providers.ts`
6. `src/lib/ai/providers.test.ts`
7. `src/lib/ai/costs.ts`
8. `src/lib/ai/costs.test.ts`
9. `src/lib/ai/types.ts`
10. `src/db/schema/aiUsageLogs.ts`
11. `src/db/schema/files.ts`

## Summary: 0C + 0H + 2M + 2L

## MEDIUM Violations

### M1: `L1FindingContext.severity` bare `string` type (runL2ForFile.ts line 83)

- `severity: string` in the internal `L1FindingContext` type
- Should be `severity: 'critical' | 'major' | 'minor'` (or imported union from @/types/)
- Recurring Guardrail #3 violation — bare string for severity field
- Same pattern as TaxonomyMappingTable finding in Story 3.0.5

### M2: `L1FindingContext.detectedByLayer` bare `string` type (runL2ForFile.ts line 85)

- `detectedByLayer: string` in the internal `L1FindingContext` type
- Should be `detectedByLayer: 'L1' | 'L2' | 'L3'` (or imported AILayer type)
- Same Guardrail #3 pattern — typed union is safer than bare string

## LOW Violations

### L1: Relative import `./chunkSegments` (runL2ForFile.ts line 29)

- `import { chunkSegments } from './chunkSegments'`
- Same-directory relative import — rule says "no paths going up more than one level"
- `./` (same dir) = LOW, not blocked. Consistent with previous stories.

### L2: `L2Finding` type name collision (runL2ForFile.ts lines 40-47 vs l2-output.ts line 39)

- `runL2ForFile.ts` exports `L2Finding` (the DB-mapped shape with `suggestedFix: string | null`)
- `l2-output.ts` also exports `L2Finding` (the Zod-inferred shape with `suggestion: string | null`)
- The two types have different field names (`suggestedFix` vs `suggestion`) — potential confusion
- Not strictly an anti-pattern violation, but a naming clarity risk (LOW)
- Fix: rename internal DB-mapped type to `L2DBFinding` or `L2FindingRow` to distinguish from schema type

## CLEAN Areas (confirmed)

- All 14 anti-patterns: CLEAN
- Guardrail #16: `generateText` + `Output.object()` used correctly, NOT `generateObject()`
- Guardrail #16: `result.output` used (NOT `result.object`), `maxOutputTokens` used (NOT `maxTokens`)
- Guardrail #17: l2-output.ts uses `.nullable()` only — no `.optional()` or `.nullish()` in AI output schema
- Guardrail #19: `logAIUsage()` called for every chunk success
- Guardrail #20: No inline `openai()`/`anthropic()` in feature code; uses `getModelById()` from @/lib/ai/client
- Guardrail #21: `chunkSegments()` used for 30K char chunking; separate step ID pattern per chunk
- Guardrail #22: `checkProjectBudget()` called at Step 2b before any AI calls
- withTenant(): ALL queries use withTenant() — files CAS, segments, findings, glossary JOIN, project
- Taxonomy exception documented: `taxonomyDefinitions` query has NO tenantId column — withTenant() correctly omitted with comment on line 220
- Audit log: correctly wrapped in try-catch (non-fatal pattern) at lines 414-433
- `rows[0]!` guard: CAS guard at line 137 (`if (!file) throw`), project guard at line 248
- `findingInserts.length` check: NOT needed because `if (findingInserts.length === 0)` would skip insert — BUT the batch loop handles empty array gracefully (0 iterations). No `inArray()` used so Guardrail #5 not triggered.
- `server-only`: providers.ts and costs.ts both have `import 'server-only'` at line 1
- No `export default` anywhere (except Next.js conventions — not applicable here)
- No `any` type — all types are explicit; `buildSegmentRow` uses `Record<string, unknown>` override param
- No `console.log` — pino logger used throughout
- No `process.env` direct access — env access not present in these files
- No TypeScript `enum` — uses `as const` (L2_SEMANTIC_CATEGORIES) and union types
- No hardcoded tenant_id
- No inline Supabase client creation
- No snapshot tests
- logAIUsage DB failure non-fatal: DB insert wrapped in try-catch in costs.ts lines 60-81

## Notable Patterns (for future reference)

- `taxonomyDefinitions` table has no `tenant_id` column — withTenant() correctly omitted with explicit comment
- `glossaryTerms` has no direct tenantId — tenant isolation via JOIN through `glossaries` table (correct pattern)
- `deriveLanguagePair()` returns null when segment rows empty or lang fields empty — null propagates to languagePair field (nullable per AIUsageRecord type)
- `logAIUsage` called with `.catch(() => { /* non-critical */ })` pattern — correct (Guardrail #13 compliant)
- `l2OutputSchema` correctly imported from `@/features/pipeline/schemas/l2-output` — not inline
