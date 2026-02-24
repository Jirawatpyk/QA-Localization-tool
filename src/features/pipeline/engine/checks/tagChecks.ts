import type { InlineTag, InlineTagsData } from '@/features/parser/types'

import type { RuleCheckResult, SegmentCheckContext, SegmentRecord } from '../types'

type TagKey = string // "type:id" composite key

/**
 * Check tag integrity: compare inline tags between source and target.
 * - Missing tags (in source but not target): Critical
 * - Extra tags (in target but not source): Critical
 * - Reordered tags (same set but different order): Minor
 *
 * inlineTags is { source: InlineTag[], target: InlineTag[] } | null
 * null for Excel segments or segments with no tags.
 */
export function checkTagIntegrity(
  segment: SegmentRecord,
  _ctx: SegmentCheckContext,
): RuleCheckResult[] {
  const results: RuleCheckResult[] = []

  // inlineTags is null for Excel segments or segments without tags — skip
  if (segment.inlineTags === null || segment.inlineTags === undefined) {
    return results
  }

  const tagsData = segment.inlineTags as InlineTagsData
  const sourceTags = tagsData.source ?? []
  const targetTags = tagsData.target ?? []

  // Both empty — nothing to check
  if (sourceTags.length === 0 && targetTags.length === 0) {
    return results
  }

  // Build frequency maps by tag key (type:id)
  const sourceMap = buildTagMap(sourceTags)
  const targetMap = buildTagMap(targetTags)

  // Check for missing tags (in source but not in target)
  for (const [key, sourceCount] of sourceMap) {
    const targetCount = targetMap.get(key) ?? 0
    if (targetCount < sourceCount) {
      const missing = sourceCount - targetCount
      const { type, id } = splitTagKey(key)
      results.push({
        segmentId: segment.id,
        category: 'tag_integrity',
        severity: 'critical',
        description: `Missing tag in target: <${type} id="${id}"> (${missing} missing)`,
        suggestedFix: `Add the missing <${type} id="${id}"> tag to the target`,
        sourceExcerpt: segment.sourceText,
        targetExcerpt: segment.targetText,
      })
    }
  }

  // Check for extra tags (in target but not in source)
  for (const [key, targetCount] of targetMap) {
    const sourceCount = sourceMap.get(key) ?? 0
    if (targetCount > sourceCount) {
      const extra = targetCount - sourceCount
      const { type, id } = splitTagKey(key)
      results.push({
        segmentId: segment.id,
        category: 'tag_integrity',
        severity: 'critical',
        description: `Extra tag in target: <${type} id="${id}"> (${extra} extra)`,
        suggestedFix: `Remove the extra <${type} id="${id}"> tag from the target`,
        sourceExcerpt: segment.sourceText,
        targetExcerpt: segment.targetText,
      })
    }
  }

  // Check for reordered tags (same set but different order)
  // Only check if counts match (no missing/extra) — reorder is a minor issue
  if (results.length === 0 && sourceTags.length > 1) {
    const sourceOrder = sourceTags.map((t) => `${t.type}${TAG_KEY_SEP}${t.id}`)
    const targetOrder = targetTags.map((t) => `${t.type}${TAG_KEY_SEP}${t.id}`)

    if (
      sourceOrder.length === targetOrder.length &&
      sourceOrder.some((key, i) => key !== targetOrder[i])
    ) {
      results.push({
        segmentId: segment.id,
        category: 'tag_integrity',
        severity: 'minor',
        description: `Tag order differs between source and target`,
        suggestedFix: `Verify tag order matches the source`,
        sourceExcerpt: segment.sourceText,
        targetExcerpt: segment.targetText,
      })
    }
  }

  return results
}

// Tag key separator — use null byte to avoid collision if id contains ':'
const TAG_KEY_SEP = '\0'

function buildTagMap(tags: InlineTag[]): Map<TagKey, number> {
  const map = new Map<TagKey, number>()
  for (const tag of tags) {
    const key = `${tag.type}${TAG_KEY_SEP}${tag.id}`
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
}

function splitTagKey(key: TagKey): { type: string; id: string } {
  const sepIdx = key.indexOf(TAG_KEY_SEP)
  return { type: key.slice(0, sepIdx), id: key.slice(sepIdx + 1) }
}
