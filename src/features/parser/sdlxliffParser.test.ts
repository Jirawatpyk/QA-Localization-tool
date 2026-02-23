import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'vitest'

import { MAX_PARSE_SIZE_BYTES } from './constants'
import { parseXliff } from './sdlxliffParser'

const FIXTURES = {
  minimal: join(process.cwd(), 'e2e/fixtures/sdlxliff/minimal.sdlxliff'),
  withNamespaces: join(process.cwd(), 'e2e/fixtures/sdlxliff/with-namespaces.sdlxliff'),
  standard: join(process.cwd(), 'e2e/fixtures/xliff/standard.xliff'),
  emptyTarget: join(process.cwd(), 'src/test/fixtures/sdlxliff/empty-target.sdlxliff'),
  multiSeg: join(process.cwd(), 'src/test/fixtures/sdlxliff/multi-seg-per-tu.sdlxliff'),
  xliffWithNotes: join(process.cwd(), 'src/test/fixtures/xliff/xliff-with-notes.xliff'),
  malformed: join(process.cwd(), 'src/test/fixtures/sdlxliff/malformed.xml'),
}

function readFixture(path: string): string {
  return readFileSync(path, 'utf-8')
}

describe('parseXliff', () => {
  describe('minimal.sdlxliff — basic SDLXLIFF parsing (AC #1, #4, #5)', () => {
    it('should extract 3 segments from minimal fixture', () => {
      const xml = readFixture(FIXTURES.minimal)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments).toHaveLength(3)
    })

    it('should extract source and target language from file element', () => {
      const xml = readFixture(FIXTURES.minimal)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.sourceLang).toBe('en-US')
      expect(result.data.targetLang).toBe('th-TH')
    })

    it('should correctly extract segment 1 source/target text', () => {
      const xml = readFixture(FIXTURES.minimal)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const seg = result.data.segments[0]!
      expect(seg.sourceText).toBe('Hello world')
      expect(seg.targetText).toBe('สวัสดีโลก')
    })

    it('should extract confirmation states correctly (Draft/Translated/ApprovedSignOff)', () => {
      const xml = readFixture(FIXTURES.minimal)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.confirmationState).toBe('Draft')
      expect(result.data.segments[1]?.confirmationState).toBe('Translated')
      expect(result.data.segments[2]?.confirmationState).toBe('ApprovedSignOff')
    })

    it('should extract match percentage from sdl:seg percent attribute', () => {
      const xml = readFixture(FIXTURES.minimal)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.matchPercentage).toBe(0)
      expect(result.data.segments[1]?.matchPercentage).toBe(85)
      expect(result.data.segments[2]?.matchPercentage).toBe(100)
    })

    it('should count words correctly using sourceLang locale', () => {
      const xml = readFixture(FIXTURES.minimal)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.wordCount).toBe(2) // "Hello world"
      expect(result.data.segments[1]?.wordCount).toBe(4) // "Click here to continue."
      expect(result.data.segments[2]?.wordCount).toBe(1) // "Cancel"
    })

    it('should set translatorComment to null when no sdl:cmt', () => {
      const xml = readFixture(FIXTURES.minimal)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      for (const seg of result.data.segments) {
        expect(seg.translatorComment).toBeNull()
      }
    })

    it('should set inlineTags to null when no inline tags', () => {
      const xml = readFixture(FIXTURES.minimal)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      for (const seg of result.data.segments) {
        expect(seg.inlineTags).toBeNull()
      }
    })

    it('should detect fileType as sdlxliff when sdl namespace present', () => {
      const xml = readFixture(FIXTURES.minimal)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.fileType).toBe('sdlxliff')
    })

    it('should assign sequential segment numbers starting from 1', () => {
      const xml = readFixture(FIXTURES.minimal)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.segmentNumber).toBe(1)
      expect(result.data.segments[1]?.segmentNumber).toBe(2)
      expect(result.data.segments[2]?.segmentNumber).toBe(3)
    })
  })

  describe('with-namespaces.sdlxliff — inline tags + sdl:cmt (AC #1)', () => {
    it('should extract 5 segments from with-namespaces fixture', () => {
      const xml = readFixture(FIXTURES.withNamespaces)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments).toHaveLength(5)
    })

    it('should extract sdl:cmt as translatorComment for segment 3', () => {
      const xml = readFixture(FIXTURES.withNamespaces)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const seg3 = result.data.segments[2]!
      expect(seg3.translatorComment).toBe('Variable {username} must not be translated')
    })

    it('should extract g tag from segment 1 source text', () => {
      const xml = readFixture(FIXTURES.withNamespaces)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const seg1 = result.data.segments[0]!
      expect(seg1.inlineTags).not.toBeNull()
      expect(seg1.inlineTags).toHaveLength(1)
      expect(seg1.inlineTags![0]!.type).toBe('g')
    })

    it('should extract x tag from segment 2 source text', () => {
      const xml = readFixture(FIXTURES.withNamespaces)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const seg2 = result.data.segments[1]!
      expect(seg2.inlineTags).not.toBeNull()
      expect(seg2.inlineTags![0]!.type).toBe('x')
    })

    it('should extract ph tag from segment 3 source text', () => {
      const xml = readFixture(FIXTURES.withNamespaces)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const seg3 = result.data.segments[2]!
      expect(seg3.inlineTags).not.toBeNull()
      expect(seg3.inlineTags!.some((t) => t.type === 'ph')).toBe(true)
    })

    it('should extract bpt and ept tags from segment 4', () => {
      const xml = readFixture(FIXTURES.withNamespaces)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const seg4 = result.data.segments[3]!
      const types = seg4.inlineTags?.map((t) => t.type) ?? []
      expect(types).toContain('bpt')
      expect(types).toContain('ept')
    })

    it('should set confirmationState=ApprovedSignOff for segment 5', () => {
      const xml = readFixture(FIXTURES.withNamespaces)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[4]?.confirmationState).toBe('ApprovedSignOff')
    })
  })

  describe('standard.xliff — pure XLIFF 1.2 (AC #2)', () => {
    it('should extract 3 segments from standard XLIFF fixture', () => {
      const xml = readFixture(FIXTURES.standard)
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments).toHaveLength(3)
    })

    it('should map XLIFF state "translated" to Translated', () => {
      const xml = readFixture(FIXTURES.standard)
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.confirmationState).toBe('Translated')
    })

    it('should map XLIFF state "needs-review-translation" to Draft', () => {
      const xml = readFixture(FIXTURES.standard)
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[1]?.confirmationState).toBe('Draft')
    })

    it('should map XLIFF state "new" to Draft', () => {
      const xml = readFixture(FIXTURES.standard)
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[2]?.confirmationState).toBe('Draft')
    })

    it('should extract <note> as translatorComment for segment 1', () => {
      const xml = readFixture(FIXTURES.standard)
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.translatorComment).toBe('Standard greeting')
    })

    it('should detect fileType as xliff when no sdl namespace', () => {
      const xml = readFixture(FIXTURES.standard)
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.fileType).toBe('xliff')
    })

    it('should have null matchPercentage for pure XLIFF', () => {
      const xml = readFixture(FIXTURES.standard)
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      for (const seg of result.data.segments) {
        expect(seg.matchPercentage).toBeNull()
      }
    })
  })

  describe('XLIFF with notes — multiple <note> elements (AC #2)', () => {
    it('should concatenate multiple notes with " | " separator', () => {
      const xml = readFixture(FIXTURES.xliffWithNotes)
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const seg3 = result.data.segments[2]!
      expect(seg3.translatorComment).toBe('First reviewer note | Second reviewer note')
    })

    it('should map signed-off to ApprovedSignOff for segment 2', () => {
      const xml = readFixture(FIXTURES.xliffWithNotes)
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[1]?.confirmationState).toBe('ApprovedSignOff')
    })

    it('should return null translatorComment when no notes', () => {
      const xml = readFixture(FIXTURES.xliffWithNotes)
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[1]?.translatorComment).toBeNull()
    })
  })

  describe('empty-target.sdlxliff — AC #13 (empty target = "" not null)', () => {
    it('should store empty target as empty string, not null', () => {
      const xml = readFixture(FIXTURES.emptyTarget)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const seg2 = result.data.segments[1]!
      expect(seg2.targetText).toBe('')
    })

    it('should still have non-empty source text for empty-target segment', () => {
      const xml = readFixture(FIXTURES.emptyTarget)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[1]?.sourceText).toBe('World')
    })
  })

  describe('multi-seg-per-tu.sdlxliff — multiple mrk per trans-unit (AC #1, #5)', () => {
    it('should extract 3 separate segments from 1 trans-unit with 3 mrk elements', () => {
      const xml = readFixture(FIXTURES.multiSeg)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments).toHaveLength(3)
    })

    it('should match sdl:seg metadata to correct mrk by id', () => {
      const xml = readFixture(FIXTURES.multiSeg)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.confirmationState).toBe('Translated')
      expect(result.data.segments[1]?.confirmationState).toBe('Draft')
      expect(result.data.segments[2]?.confirmationState).toBe('ApprovedSignOff')
    })
  })

  describe('XLIFF state "final" mapping (AC #2)', () => {
    it('should map XLIFF state "final" to ApprovedSignOff', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="test.docx" source-language="en-US" target-language="th-TH" datatype="plaintext">
    <body>
      <trans-unit id="1">
        <source>Done</source>
        <target state="final">เสร็จสิ้น</target>
      </trans-unit>
    </body>
  </file>
</xliff>`
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.confirmationState).toBe('ApprovedSignOff')
    })
  })

  describe('15MB size guard (AC #3)', () => {
    it('should reject file when size exceeds 15MB', () => {
      const oversizedContent = 'a'.repeat(1024) // small content
      const result = parseXliff(oversizedContent, 'xliff', MAX_PARSE_SIZE_BYTES + 1)
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.code).toBe('FILE_TOO_LARGE')
      expect(result.error.message).toContain('15MB')
    })

    it('should include file size details in error', () => {
      const result = parseXliff('content', 'xliff', MAX_PARSE_SIZE_BYTES + 100)
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.details).toContain('bytes')
    })
  })

  describe('malformed/invalid XML (AC #7)', () => {
    it('should return INVALID_STRUCTURE for non-XLIFF XML file', () => {
      // fast-xml-parser is lenient — parses most content without throwing.
      // Structural validation catches files without <xliff> root.
      const xml = readFixture(FIXTURES.malformed) // has <document> root, not <xliff>
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.code).toBe('INVALID_STRUCTURE')
    })

    it('should return INVALID_STRUCTURE when no xliff root element', () => {
      const result = parseXliff('<root><foo/></root>', 'xliff')
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.code).toBe('INVALID_STRUCTURE')
      expect(result.error.message).toContain('<xliff>')
    })

    it('should return INVALID_STRUCTURE when no file elements found', () => {
      const emptyXliff =
        '<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2"></xliff>'
      const result = parseXliff(emptyXliff, 'xliff')
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.code).toBe('INVALID_STRUCTURE')
    })
  })
})
