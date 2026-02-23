import { describe, expect, it } from 'vitest'

import { parseXliff } from './sdlxliffParser'

/**
 * Performance smoke test: ~5,000 segments must parse within 3 seconds (AC #6).
 * Uses performance.now() to measure; NOT a benchmark, just a smoke test.
 */
describe('sdlxliffParser — performance (AC #6)', () => {
  it('should parse ~5,000 segments within 3 seconds', () => {
    // Generate SDLXLIFF with ~5,000 trans-units
    const segmentCount = 5000
    const transUnits = Array.from({ length: segmentCount }, (_, i) => {
      const id = i + 1
      return `
        <trans-unit id="${id}">
          <source>Source text for segment number ${id} with some words here.</source>
          <seg-source>
            <mrk mtype="seg" mid="${id}">Source text for segment number ${id} with some words here.</mrk>
          </seg-source>
          <target>
            <mrk mtype="seg" mid="${id}">Target text for segment number ${id} with translated content.</mrk>
          </target>
          <sdl:seg-defs>
            <sdl:seg id="${id}" conf="Translated" percent="85" origin="tm"/>
          </sdl:seg-defs>
        </trans-unit>`
    }).join('\n')

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<xliff version="1.2"
       xmlns="urn:oasis:names:tc:xliff:document:1.2"
       xmlns:sdl="http://sdl.com/FileTypes/SdlXliff/1.0">
  <file original="perf-test.docx"
        source-language="en-US"
        target-language="de-DE"
        datatype="x-sdlxliff">
    <body>
      <group id="g1">
${transUnits}
      </group>
    </body>
  </file>
</xliff>`

    const start = performance.now()
    const result = parseXliff(xml, 'sdlxliff')
    const elapsed = performance.now() - start

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.segments).toHaveLength(segmentCount)
    expect(elapsed).toBeLessThan(3000) // AC #6: < 3 seconds
  })
})
