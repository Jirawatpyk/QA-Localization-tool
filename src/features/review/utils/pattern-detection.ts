import type { DetectedPattern, FindingForDisplay, SuppressionRule } from '@/features/review/types'

// ── Types ──

export type RejectionEntry = {
  findingId: string
  keywords: string[]
  description: string
  sourceLang: string
  targetLang: string
}

export type CategoryLangTracker = {
  entries: RejectionEntry[]
  dismissedPatterns: Set<string>
}

/** Keyed by `${category}::${sourceLang}::${targetLang}` */
export type RejectionTracker = Map<string, CategoryLangTracker>

// ── Constants ──

const MIN_WORD_LENGTH = 3
const MIN_UNIQUE_KEYWORDS = 4
const MIN_OVERLAP = 3
const MIN_CLUSTER_SIZE = 3

// R2-L4: cache Intl.Segmenter instances per locale (avoid re-creation per call)
const segmenterCache = new Map<string, Intl.Segmenter>()

// ── Keyword Extraction ──

/** Check if text likely contains CJK or Thai characters that need Intl.Segmenter */
function needsSegmenter(text: string): boolean {
  // Thai: U+0E00-U+0E7F, CJK: U+4E00-U+9FFF, U+3040-U+309F (Hiragana), U+30A0-U+30FF (Katakana)
  return /[\u0E00-\u0E7F\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/.test(text)
}

/**
 * Extract keywords from text.
 * - Latin: whitespace-split, lowercase, filter < 3 chars, deduplicate
 * - Thai/CJK: Intl.Segmenter with isWordLike, lowercase, filter < 3 chars, deduplicate
 */
export function extractKeywords(text: string): string[] {
  const lower = text.toLocaleLowerCase()
  const seen = new Set<string>()

  if (needsSegmenter(lower) && typeof Intl !== 'undefined' && Intl.Segmenter) {
    // Detect primary language for Intl.Segmenter locale
    const locale = /[\u0E00-\u0E7F]/.test(lower)
      ? 'th'
      : /[\u4E00-\u9FFF]/.test(lower)
        ? 'zh'
        : /[\u3040-\u309F\u30A0-\u30FF]/.test(lower)
          ? 'ja'
          : 'en'

    let segmenter = segmenterCache.get(locale)
    if (!segmenter) {
      segmenter = new Intl.Segmenter(locale, { granularity: 'word' })
      segmenterCache.set(locale, segmenter)
    }
    for (const { segment, isWordLike } of segmenter.segment(lower)) {
      if (isWordLike && segment.length >= MIN_WORD_LENGTH) {
        seen.add(segment)
      }
    }
  } else {
    // Latin: simple whitespace split
    for (const word of lower.split(/\s+/)) {
      const cleaned = word.replace(/[^\p{L}\p{N}]/gu, '')
      if (cleaned.length >= MIN_WORD_LENGTH) {
        seen.add(cleaned)
      }
    }
  }

  return [...seen]
}

// ── Word Overlap ──

/** Returns count of shared words between two keyword arrays */
export function computeWordOverlap(keywordsA: string[], keywordsB: string[]): number {
  const setB = new Set(keywordsB)
  let count = 0
  for (const word of keywordsA) {
    if (setB.has(word)) count++
  }
  return count
}

// ── Pattern Detection ──

/**
 * Build group key for the rejection tracker.
 * Groups findings by category + source/target language.
 */
function buildGroupKey(category: string, sourceLang: string, targetLang: string): string {
  return `${category}::${sourceLang}::${targetLang}`
}

/** Result of trackRejection — includes updated tracker (immutable pattern for Zustand) */
export type TrackRejectionResult = {
  tracker: RejectionTracker
  pattern: DetectedPattern | null
}

/**
 * Track a rejection and detect if a pattern cluster has formed.
 *
 * Returns new tracker + DetectedPattern when cluster of 3+ findings with >=3 shared keywords
 * is found within the same category + language pair group.
 * Returns new tracker + null if no pattern detected.
 *
 * IMPORTANT: returns a NEW Map (immutable pattern) — caller must call setRejectionTracker() on store.
 */
export function trackRejection(
  tracker: RejectionTracker,
  finding: FindingForDisplay,
  sourceLang: string,
  targetLang: string,
): TrackRejectionResult {
  const keywords = extractKeywords(finding.description)

  // Guard: skip findings with too few unique keywords (prevents false clusters on short L1 templated descriptions)
  if (keywords.length < MIN_UNIQUE_KEYWORDS) {
    return { tracker, pattern: null }
  }

  const groupKey = buildGroupKey(finding.category, sourceLang, targetLang)

  // Clone tracker (immutable — Zustand needs new reference to detect change)
  const newTracker: RejectionTracker = new Map(tracker)
  if (!newTracker.has(groupKey)) {
    newTracker.set(groupKey, { entries: [], dismissedPatterns: new Set() })
  }
  const oldGroup = newTracker.get(groupKey)!
  // Clone the group's entries array (shallow clone is sufficient — entries are immutable value objects)
  const group: CategoryLangTracker = {
    entries: [...oldGroup.entries],
    dismissedPatterns: new Set(oldGroup.dismissedPatterns),
  }
  newTracker.set(groupKey, group)

  const PATTERN_ENTRIES_CAP = 100

  const entry: RejectionEntry = {
    findingId: finding.id,
    keywords,
    description: finding.description,
    sourceLang,
    targetLang,
  }
  group.entries.push(entry)

  // Evict oldest entries if over cap to bound memory usage
  if (group.entries.length > PATTERN_ENTRIES_CAP) {
    group.entries = group.entries.slice(-PATTERN_ENTRIES_CAP)
  }

  // Cluster detection via transitive overlap (connected component in overlap graph)
  // Build adjacency: entries connected if they share >= MIN_OVERLAP keywords
  const allEntries = group.entries
  const adj = new Map<string, Set<string>>()
  for (const e of allEntries) {
    adj.set(e.findingId, new Set())
  }
  for (let i = 0; i < allEntries.length; i++) {
    for (let j = i + 1; j < allEntries.length; j++) {
      const a = allEntries[i]!
      const b = allEntries[j]!
      if (computeWordOverlap(a.keywords, b.keywords) >= MIN_OVERLAP) {
        adj.get(a.findingId)!.add(b.findingId)
        adj.get(b.findingId)!.add(a.findingId)
      }
    }
  }

  // BFS from new entry to find connected component
  const visited = new Set<string>()
  const queue = [entry.findingId]
  while (queue.length > 0) {
    const current = queue.pop()!
    if (visited.has(current)) continue
    visited.add(current)
    const neighbors = adj.get(current)
    if (neighbors) {
      for (const n of neighbors) {
        if (!visited.has(n)) queue.push(n)
      }
    }
  }

  if (visited.size < MIN_CLUSTER_SIZE) {
    return { tracker: newTracker, pattern: null }
  }

  const verifiedCluster = allEntries.filter((e) => visited.has(e.findingId))

  // Build pattern name from top-3 most frequent keywords across cluster
  const keywordFrequency = new Map<string, number>()
  for (const member of verifiedCluster) {
    for (const kw of member.keywords) {
      keywordFrequency.set(kw, (keywordFrequency.get(kw) ?? 0) + 1)
    }
  }

  const topKeywords = [...keywordFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([kw]) => kw)

  const patternName = `${finding.category}: ${topKeywords.join(', ')}`

  // Check if this pattern was already dismissed
  if (group.dismissedPatterns.has(patternName)) {
    return { tracker: newTracker, pattern: null }
  }

  return {
    tracker: newTracker,
    pattern: {
      category: finding.category,
      keywords: topKeywords,
      patternName,
      matchingFindingIds: verifiedCluster.map((e) => e.findingId),
      sourceLang,
      targetLang,
    },
  }
}

// ── Reset ──

/** Reset counter for "Keep checking" — clears entries and adds pattern to dismissed list.
 * AC4: "counter resets" — only NEW rejections after reset can form a new cluster.
 * Returns new tracker (immutable pattern for Zustand). */
export function resetPatternCounter(
  tracker: RejectionTracker,
  groupKey: string,
  patternName: string,
): RejectionTracker {
  const newTracker: RejectionTracker = new Map(tracker)
  const group = newTracker.get(groupKey)
  if (group) {
    const newDismissed = new Set(group.dismissedPatterns)
    newDismissed.add(patternName)
    newTracker.set(groupKey, { entries: [], dismissedPatterns: newDismissed })
  }
  return newTracker
}

// ── Suppression Check ──

/** Check if a finding matches any active suppression rule.
 * @param fileId - current file ID, used to verify 'file' scope rules (CR-M1 fix) */
export function isAlreadySuppressed(
  activeSuppressions: SuppressionRule[],
  finding: FindingForDisplay,
  sourceLang: string,
  targetLang: string,
  fileId: string | null,
): boolean {
  const findingKeywords = extractKeywords(finding.description)

  for (const rule of activeSuppressions) {
    if (!rule.isActive) continue
    if (rule.category !== finding.category) continue

    // Scope check
    if (rule.scope === 'file') {
      if (rule.fileId !== fileId) continue
    }
    if (rule.scope === 'language_pair') {
      if (rule.sourceLang !== sourceLang || rule.targetLang !== targetLang) continue
    }
    // 'all' scope: matches all language pairs

    // Keyword overlap check
    const ruleKeywords = rule.pattern.split(',').map((k) => k.trim().toLocaleLowerCase())
    const overlap = computeWordOverlap(findingKeywords, ruleKeywords)
    if (overlap >= MIN_OVERLAP) {
      return true
    }
  }

  return false
}
