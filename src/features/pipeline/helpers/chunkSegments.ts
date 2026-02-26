/**
 * Maximum character count per AI chunk (Guardrail #21).
 * Source + target text combined. Prevents token overflow.
 */
export const AI_CHUNK_CHAR_LIMIT = 30_000

/**
 * Minimum fields required for chunking.
 */
type SegmentForChunking = {
  id: string
  sourceText: string
  targetText: string
}

export type SegmentChunk<T extends SegmentForChunking = SegmentForChunking> = {
  chunkIndex: number
  segments: T[]
  totalChars: number
}

/**
 * Split segments into chunks by character budget.
 *
 * Budget = sum of (sourceText.length + targetText.length) per segment.
 * A single segment exceeding the limit is placed in its own chunk (never split mid-segment).
 *
 * @param segments - Ordered array of segments to chunk
 * @param charLimit - Max chars per chunk (default: AI_CHUNK_CHAR_LIMIT)
 */
export function chunkSegments<T extends SegmentForChunking>(
  segments: T[],
  charLimit: number = AI_CHUNK_CHAR_LIMIT,
): SegmentChunk<T>[] {
  if (segments.length === 0) return []

  const chunks: SegmentChunk<T>[] = []
  let current: T[] = []
  let currentChars = 0

  for (const seg of segments) {
    const segChars = seg.sourceText.length + seg.targetText.length

    if (currentChars + segChars > charLimit && current.length > 0) {
      chunks.push({
        chunkIndex: chunks.length,
        segments: current,
        totalChars: currentChars,
      })
      current = []
      currentChars = 0
    }

    current.push(seg)
    currentChars += segChars
  }

  if (current.length > 0) {
    chunks.push({
      chunkIndex: chunks.length,
      segments: current,
      totalChars: currentChars,
    })
  }

  return chunks
}
