import { readFileSync } from 'fs'
import { join } from 'path'

import { XMLParser } from 'fast-xml-parser'
import { describe, expect, it, vi } from 'vitest'

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
      expect(seg1.inlineTags!.source).toHaveLength(1)
      expect(seg1.inlineTags!.source[0]!.type).toBe('g')
    })

    it('should extract x tag from segment 2 source text', () => {
      const xml = readFixture(FIXTURES.withNamespaces)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const seg2 = result.data.segments[1]!
      expect(seg2.inlineTags).not.toBeNull()
      expect(seg2.inlineTags!.source[0]!.type).toBe('x')
    })

    it('should extract ph tag from segment 3 source text', () => {
      const xml = readFixture(FIXTURES.withNamespaces)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const seg3 = result.data.segments[2]!
      expect(seg3.inlineTags).not.toBeNull()
      expect(seg3.inlineTags!.source.some((t) => t.type === 'ph')).toBe(true)
    })

    it('should extract bpt and ept tags from segment 4', () => {
      const xml = readFixture(FIXTURES.withNamespaces)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const seg4 = result.data.segments[3]!
      const types = seg4.inlineTags?.source.map((t) => t.type) ?? []
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

    it('should report g tag at correct character position in seg1 (H3)', () => {
      const xml = readFixture(FIXTURES.withNamespaces)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      // seg1 source: "Please read the <g>important notice</g> before continuing."
      // fast-xml-parser textNode = "Please read the" (15 chars, trailing space belongs to next context)
      expect(result.data.segments[0]?.inlineTags?.source[0]?.position).toBe(15)
    })

    it('should report x tag at correct character position in seg2 (H3)', () => {
      const xml = readFixture(FIXTURES.withNamespaces)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      // seg2 source: "Line 1<x/>Line 2" — "Line 1" = 6 chars → x at position 6
      expect(result.data.segments[1]?.inlineTags?.source[0]?.position).toBe(6)
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

    it('should extract g tag with position for seg2 (H5)', () => {
      const xml = readFixture(FIXTURES.standard)
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const seg2 = result.data.segments[1]!
      // seg2: "Please enter your <g id="1">email address</g>."
      // fast-xml-parser textNode = "Please enter your" (17 chars, trailing space belongs to next context)
      expect(seg2.inlineTags).not.toBeNull()
      expect(seg2.inlineTags!.source).toHaveLength(1)
      expect(seg2.inlineTags!.source[0]).toMatchObject({ type: 'g', id: '1', position: 17 })
    })

    it('should extract ph tag with position for seg3 (H5)', () => {
      const xml = readFixture(FIXTURES.standard)
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const seg3 = result.data.segments[2]!
      // seg3: "Error: <ph id="1">{message}</ph>"
      // fast-xml-parser textNode = "Error:" (6 chars, trailing space belongs to next context)
      expect(seg3.inlineTags).not.toBeNull()
      expect(seg3.inlineTags!.source).toHaveLength(1)
      expect(seg3.inlineTags!.source[0]).toMatchObject({ type: 'ph', id: '1', position: 6 })
    })

    it('should use trans-unit @id as segmentId for XLIFF segments (H13)', () => {
      const xml = readFixture(FIXTURES.standard)
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.segmentId).toBe('1')
      expect(result.data.segments[1]?.segmentId).toBe('2')
      expect(result.data.segments[2]?.segmentId).toBe('3')
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

    it('should extract single note as translatorComment for seg1 (H11)', () => {
      const xml = readFixture(FIXTURES.xliffWithNotes)
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.translatorComment).toBe(
        'Translator note: formal register required',
      )
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

    it('should store empty string for seg3 with self-closing <target/> (H10)', () => {
      const xml = readFixture(FIXTURES.emptyTarget)
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      // Segment 3 has <target/> (self-closing) — no mrk children, so targetMrkMap has no entry for mid="3"
      const seg3 = result.data.segments[2]!
      expect(seg3.targetText).toBe('')
      expect(seg3.sourceText).toBe('Goodbye')
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
      expect(result.error.message).toBe(
        'File too large for processing (max 15MB). Please split the file in your CAT tool',
      )
    })

    it('should include file size details in error', () => {
      const result = parseXliff('content', 'xliff', MAX_PARSE_SIZE_BYTES + 100)
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.details).toContain('bytes')
    })

    it('should NOT trigger size guard when fileSizeBytes equals exactly MAX_PARSE_SIZE_BYTES (H6)', () => {
      // Operator is > (strictly greater than), so exactly 15MB must NOT return FILE_TOO_LARGE
      const result = parseXliff('a'.repeat(100), 'xliff', MAX_PARSE_SIZE_BYTES)
      expect(result.success).toBe(false)
      if (result.success) return
      // File is at exactly the limit — must fail for content reasons, not size
      expect(result.error.code).not.toBe('FILE_TOO_LARGE')
    })

    it('should NOT trigger size guard when fileSizeBytes is one byte below MAX_PARSE_SIZE_BYTES (H6)', () => {
      const result = parseXliff('a'.repeat(100), 'xliff', MAX_PARSE_SIZE_BYTES - 1)
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.code).not.toBe('FILE_TOO_LARGE')
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
      expect(result.error.message).toBe('Invalid file format — missing <xliff> root element')
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

  describe('INVALID_XML — XMLParser.parse throws (AC #7, H4)', () => {
    it('should return INVALID_XML with exact message when parser throws', () => {
      const spy = vi.spyOn(XMLParser.prototype, 'parse').mockImplementationOnce(() => {
        throw new Error('Unexpected character &#xFFFE;')
      })
      const result = parseXliff('<?xml version="1.0"?>', 'xliff')
      spy.mockRestore()

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.code).toBe('INVALID_XML')
      expect(result.error.message).toBe('Invalid file format — could not parse XML structure')
    })
  })

  describe('bx/ex inline tags in SDLXLIFF (AC #1, H1)', () => {
    const bxExXml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2" xmlns:sdl="http://sdl.com/FileTypes/SdlXliff/1.0">
  <file original="test.docx" source-language="en-US" target-language="de-DE" datatype="x-sdlxliff">
    <body>
      <group id="g1">
        <trans-unit id="1">
          <source>Start<bx id="1"/>middle<ex id="1"/>End</source>
          <seg-source><mrk mtype="seg" mid="1">Start<bx id="1"/>middle<ex id="1"/>End</mrk></seg-source>
          <target><mrk mtype="seg" mid="1">Anfang<bx id="1"/>mitte<ex id="1"/>Ende</mrk></target>
          <sdl:seg-defs><sdl:seg id="1" conf="Draft" percent="0"/></sdl:seg-defs>
        </trans-unit>
      </group>
    </body>
  </file>
</xliff>`

    it('should extract bx and ex tags from SDLXLIFF source', () => {
      const result = parseXliff(bxExXml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const seg = result.data.segments[0]!
      expect(seg.inlineTags).not.toBeNull()
      const types = seg.inlineTags!.source.map((t) => t.type)
      expect(types).toContain('bx')
      expect(types).toContain('ex')
    })

    it('should record bx at position 5 and ex at position 11', () => {
      const result = parseXliff(bxExXml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      const tags = result.data.segments[0]!.inlineTags!.source
      const bxTag = tags.find((t) => t.type === 'bx')!
      const exTag = tags.find((t) => t.type === 'ex')!
      // "Start" = 5 chars → bx at 5; "middle" = 6 more chars → ex at 11
      expect(bxTag.position).toBe(5)
      expect(exTag.position).toBe(11)
    })
  })

  describe('multi-file XLIFF — segments from all <file> elements (M5)', () => {
    it('should extract segments from all file elements and assign sequential numbers', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="doc1.docx" source-language="en-US" target-language="th-TH" datatype="plaintext">
    <body>
      <trans-unit id="1"><source>Hello</source><target state="translated">สวัสดี</target></trans-unit>
    </body>
  </file>
  <file original="doc2.docx" source-language="en-US" target-language="th-TH" datatype="plaintext">
    <body>
      <trans-unit id="1"><source>Goodbye</source><target state="translated">ลาก่อน</target></trans-unit>
    </body>
  </file>
</xliff>`
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments).toHaveLength(2)
      expect(result.data.segments[0]?.sourceText).toBe('Hello')
      expect(result.data.segments[1]?.sourceText).toBe('Goodbye')
      expect(result.data.segments[1]?.segmentNumber).toBe(2)
    })
  })

  describe('seg-source preferred over source when both present (M1)', () => {
    it('should use seg-source text when source and seg-source have different content (M1)', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2" xmlns:sdl="http://sdl.com/FileTypes/SdlXliff/1.0">
  <file original="test.docx" source-language="en-US" target-language="de-DE" datatype="x-sdlxliff">
    <body>
      <trans-unit id="1">
        <source>WRONG-SOURCE</source>
        <seg-source><mrk mtype="seg" mid="1">CORRECT-SOURCE</mrk></seg-source>
        <target><mrk mtype="seg" mid="1">Korrekt</mrk></target>
        <sdl:seg-defs><sdl:seg id="1" conf="Translated" percent="100"/></sdl:seg-defs>
      </trans-unit>
    </body>
  </file>
</xliff>`
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.sourceText).toBe('CORRECT-SOURCE')
    })
  })

  describe('matchPercentage clamping defense-in-depth (M4)', () => {
    function buildSdlxliffWithPercent(percent: string): string {
      return `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2" xmlns:sdl="http://sdl.com/FileTypes/SdlXliff/1.0">
  <file original="test.docx" source-language="en-US" target-language="de-DE" datatype="x-sdlxliff">
    <body>
      <trans-unit id="1">
        <source>Hello</source>
        <seg-source><mrk mtype="seg" mid="1">Hello</mrk></seg-source>
        <target><mrk mtype="seg" mid="1">Hallo</mrk></target>
        <sdl:seg-defs><sdl:seg id="1" conf="Translated" percent="${percent}"/></sdl:seg-defs>
      </trans-unit>
    </body>
  </file>
</xliff>`
    }

    it('should clamp percent="-1" to 0 when percent is negative (M4)', () => {
      const result = parseXliff(buildSdlxliffWithPercent('-1'), 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.matchPercentage).toBe(0)
    })

    it('should clamp percent="150" to 100 when percent exceeds 100 (M4)', () => {
      const result = parseXliff(buildSdlxliffWithPercent('150'), 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.matchPercentage).toBe(100)
    })

    it('should return null when percent="abc" is non-numeric (M4)', () => {
      const result = parseXliff(buildSdlxliffWithPercent('abc'), 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.matchPercentage).toBeNull()
    })

    it('should return null when percent="" is empty string (M4)', () => {
      const result = parseXliff(buildSdlxliffWithPercent(''), 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.matchPercentage).toBeNull()
    })
  })

  describe('TAG_MISMATCH propagation from extractInlineTags through parseXliff (M6)', () => {
    it('should return TAG_MISMATCH when source has unmatched ex tag in SDLXLIFF (M6)', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2" xmlns:sdl="http://sdl.com/FileTypes/SdlXliff/1.0">
  <file original="test.docx" source-language="en-US" target-language="de-DE" datatype="x-sdlxliff">
    <body>
      <trans-unit id="1">
        <source>Start middle</source>
        <seg-source><mrk mtype="seg" mid="1">Start<ex id="99"/>middle</mrk></seg-source>
        <target><mrk mtype="seg" mid="1">Anfang</mrk></target>
        <sdl:seg-defs><sdl:seg id="1" conf="Translated" percent="0"/></sdl:seg-defs>
      </trans-unit>
    </body>
  </file>
</xliff>`
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.code).toBe('TAG_MISMATCH')
    })

    it('should return TAG_MISMATCH when source has unmatched ept tag in XLIFF (M6)', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="test.docx" source-language="en-US" target-language="de-DE" datatype="plaintext">
    <body>
      <trans-unit id="1">
        <source>Hello<ept id="99"/>world</source>
        <target>Hallo</target>
      </trans-unit>
    </body>
  </file>
</xliff>`
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error.code).toBe('TAG_MISMATCH')
    })
  })

  describe('trans-unit with missing source or target (M7, M8)', () => {
    it('should silently skip trans-unit with no source element in XLIFF (M7)', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="test.docx" source-language="en-US" target-language="de-DE" datatype="plaintext">
    <body>
      <trans-unit id="1">
        <source>First</source>
        <target state="translated">Erste</target>
      </trans-unit>
      <trans-unit id="2">
        <target state="translated">No source here</target>
      </trans-unit>
      <trans-unit id="3">
        <source>Third</source>
        <target state="translated">Dritte</target>
      </trans-unit>
    </body>
  </file>
</xliff>`
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      // trans-unit id="2" has no <source> — silently skipped → 2 segments total
      expect(result.data.segments).toHaveLength(2)
      expect(result.data.segments[0]?.sourceText).toBe('First')
      expect(result.data.segments[1]?.sourceText).toBe('Third')
    })

    it('should produce empty targetText when trans-unit has no target element in XLIFF (M8)', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="test.docx" source-language="en-US" target-language="de-DE" datatype="plaintext">
    <body>
      <trans-unit id="1">
        <source>Source only</source>
      </trans-unit>
    </body>
  </file>
</xliff>`
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments).toHaveLength(1)
      expect(result.data.segments[0]?.targetText).toBe('')
      expect(result.data.segments[0]?.confirmationState).toBeNull()
    })
  })

  describe('multi-file first-file-wins language selection (M5)', () => {
    it('should use first file language as globalSourceLang when files have different languages (M5)', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="doc1.docx" source-language="en-US" target-language="th-TH" datatype="plaintext">
    <body>
      <trans-unit id="1"><source>Hello</source><target state="translated">สวัสดี</target></trans-unit>
    </body>
  </file>
  <file original="doc2.docx" source-language="fr-FR" target-language="de-DE" datatype="plaintext">
    <body>
      <trans-unit id="1"><source>Bonjour</source><target state="translated">Hallo</target></trans-unit>
    </body>
  </file>
</xliff>`
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      // First-file-wins: globalSourceLang = 'en-US' (not 'fr-FR')
      expect(result.data.sourceLang).toBe('en-US')
      // Per-file source lang still stored in segment
      expect(result.data.segments[0]?.sourceLang).toBe('en-US')
      expect(result.data.segments[1]?.sourceLang).toBe('fr-FR')
    })
  })

  describe('file element with missing body silently skipped (L4)', () => {
    it('should skip file element with no body and extract segments from remaining files (L4)', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file original="no-body.docx" source-language="en-US" target-language="de-DE" datatype="plaintext">
  </file>
  <file original="with-body.docx" source-language="en-US" target-language="de-DE" datatype="plaintext">
    <body>
      <trans-unit id="1"><source>Valid segment</source><target state="translated">Gültig</target></trans-unit>
    </body>
  </file>
</xliff>`
      const result = parseXliff(xml, 'xliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      // first file (no body) is skipped silently — only 1 segment from second file
      expect(result.data.segments).toHaveLength(1)
      expect(result.data.segments[0]?.sourceText).toBe('Valid segment')
    })
  })

  describe('unrecognized sdl:seg conf attribute fallback (M7)', () => {
    it('should set confirmationState to null for unknown conf values', () => {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2" xmlns:sdl="http://sdl.com/FileTypes/SdlXliff/1.0">
  <file original="test.docx" source-language="en-US" target-language="de-DE" datatype="x-sdlxliff">
    <body>
      <group id="g1">
        <trans-unit id="1">
          <source>Test</source>
          <seg-source><mrk mtype="seg" mid="1">Test</mrk></seg-source>
          <target><mrk mtype="seg" mid="1">Prüfung</mrk></target>
          <sdl:seg-defs><sdl:seg id="1" conf="PendingTranslation" percent="50"/></sdl:seg-defs>
        </trans-unit>
      </group>
    </body>
  </file>
</xliff>`
      const result = parseXliff(xml, 'sdlxliff')
      expect(result.success).toBe(true)
      if (!result.success) return
      expect(result.data.segments[0]?.confirmationState).toBeNull()
    })
  })
})
