import { INLINE_TAG_TYPES } from './constants'
import type { InlineTag, InlineTagType, ParserError } from './types'

// fast-xml-parser preserveOrder: true node shape (internal)
// Public API accepts Record<string, unknown>[] for flexibility
type XmlNode = Record<string, unknown>

type ExtractResult =
  | { success: true; plainText: string; tags: InlineTag[] }
  | { success: false; error: ParserError }

/**
 * Extract plain text and inline tags from a list of XML nodes.
 * Handles fast-xml-parser preserveOrder: true output format.
 *
 * With preserveOrder:true, children of an element are an array:
 *   [{ "#text": "hello" }, { "g": [...], ":@": { "@_id": "1" } }]
 *
 * Position is the char offset in plain text BEFORE the tag's content is placed.
 * For self-closing tags (x, ph, bx, ex): position = insertion point in plain text.
 * For wrapping tags (g, bpt, ept): position = start of first char they wrap.
 */
export function extractInlineTags(nodes: XmlNode[]): ExtractResult {
  const tags: InlineTag[] = []
  // Track paired tags: bpt/bx need matching ept/ex
  const openPaired = new Map<string, 'bpt' | 'bx'>()

  const result = walkNodes(nodes, tags, openPaired, '')
  if (!result.success) return result

  // Validate all paired tags are closed
  if (openPaired.size > 0) {
    const unclosedId = openPaired.keys().next().value as string
    return {
      success: false,
      error: {
        code: 'TAG_MISMATCH',
        message: `Unclosed inline tag: id="${unclosedId}"`,
        details: `Tag opened but never closed`,
      },
    }
  }

  return { success: true, plainText: result.plainText, tags }
}

type WalkResult = { success: true; plainText: string } | { success: false; error: ParserError }

function walkNodes(
  nodes: XmlNode[],
  tags: InlineTag[],
  openPaired: Map<string, 'bpt' | 'bx'>,
  currentText: string,
): WalkResult {
  let text = currentText

  for (const node of nodes) {
    // Text node
    if ('#text' in node) {
      text += String(node['#text'] ?? '')
      continue
    }

    // Find the tag name (the key that is not ':@' or '#text')
    const tagName = Object.keys(node).find((k) => k !== ':@')
    if (!tagName) continue

    const attrs = getAttrs(node)

    // Skip non-inline tags — recurse to collect text
    if (!isInlineTagType(tagName)) {
      const children = asNodeArray(node[tagName])
      if (children.length > 0) {
        const innerResult = walkNodes(children, tags, openPaired, text)
        if (!innerResult.success) return innerResult
        text = innerResult.plainText
      }
      continue
    }

    const tagId = attrs['@_id'] ?? attrs['@_mid'] ?? String(tags.length)
    const position = text.length

    switch (tagName) {
      case 'g': {
        // Wrapping tag — recurse to collect content
        const children = asNodeArray(node[tagName])
        const sanitized = sanitizeAttributes(attrs)
        const tag: InlineTag = {
          type: 'g',
          id: tagId,
          position,
          ...(sanitized ? { attributes: sanitized } : {}),
        }
        tags.push(tag)
        if (children.length > 0) {
          const innerResult = walkNodes(children, tags, openPaired, text)
          if (!innerResult.success) return innerResult
          text = innerResult.plainText
        }
        break
      }

      case 'bpt': {
        // Opening of a paired tag
        const children = asNodeArray(node[tagName])
        let content: string | undefined
        if (children.length > 0) {
          let innerText = ''
          for (const child of children) {
            if ('#text' in child) innerText += String(child['#text'] ?? '')
          }
          content = innerText || undefined
        }
        const sanitized = sanitizeAttributes(attrs)
        const tag: InlineTag = {
          type: 'bpt',
          id: tagId,
          position,
          ...(sanitized ? { attributes: sanitized } : {}),
          ...(content !== undefined ? { content } : {}),
        }
        tags.push(tag)
        openPaired.set(tagId, 'bpt')
        break
      }

      case 'ept': {
        // Closing of a paired tag — validate matching bpt exists
        const openType = openPaired.get(tagId)
        if (openType !== 'bpt') {
          return {
            success: false,
            error: {
              code: 'TAG_MISMATCH',
              message: `Unmatched closing tag <ept id="${tagId}">`,
              details: `No matching <bpt id="${tagId}"> found`,
            },
          }
        }
        openPaired.delete(tagId)
        const sanitized = sanitizeAttributes(attrs)
        tags.push({
          type: 'ept',
          id: tagId,
          position,
          ...(sanitized ? { attributes: sanitized } : {}),
        })
        break
      }

      case 'bx': {
        const sanitized = sanitizeAttributes(attrs)
        tags.push({
          type: 'bx',
          id: tagId,
          position,
          ...(sanitized ? { attributes: sanitized } : {}),
        })
        openPaired.set(tagId, 'bx')
        break
      }

      case 'ex': {
        const openType = openPaired.get(tagId)
        if (openType !== 'bx') {
          return {
            success: false,
            error: {
              code: 'TAG_MISMATCH',
              message: `Unmatched closing tag <ex id="${tagId}">`,
              details: `No matching <bx id="${tagId}"> found`,
            },
          }
        }
        openPaired.delete(tagId)
        const sanitized = sanitizeAttributes(attrs)
        tags.push({
          type: 'ex',
          id: tagId,
          position,
          ...(sanitized ? { attributes: sanitized } : {}),
        })
        break
      }

      case 'x':
      case 'ph': {
        const sanitized = sanitizeAttributes(attrs)
        tags.push({
          type: tagName as 'x' | 'ph',
          id: tagId,
          position,
          ...(sanitized ? { attributes: sanitized } : {}),
        })
        break
      }

      default:
        break
    }
  }

  return { success: true, plainText: text }
}

function isInlineTagType(name: string): name is InlineTagType {
  return (INLINE_TAG_TYPES as readonly string[]).includes(name)
}

function getAttrs(node: XmlNode): Record<string, string> {
  const attrs = node[':@']
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
    const result: Record<string, string> = {}
    for (const [k, v] of Object.entries(attrs)) {
      result[k] = String(v)
    }
    return result
  }
  return {}
}

function asNodeArray(value: unknown): XmlNode[] {
  if (Array.isArray(value)) return value as XmlNode[]
  return []
}

/** Remove @_ prefix from attribute keys for storage, exclude id/mid (stored separately) */
function sanitizeAttributes(attrs: Record<string, string>): Record<string, string> | undefined {
  const cleaned: Record<string, string> = {}
  for (const [k, v] of Object.entries(attrs)) {
    if (k === '@_id' || k === '@_mid') continue // stored separately as id
    const key = k.startsWith('@_') ? k.slice(2) : k
    cleaned[key] = v
  }
  return Object.keys(cleaned).length > 0 ? cleaned : undefined
}
