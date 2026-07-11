// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadParser } from '../../src/legacy-parser.mjs'
import { SchematicSvgRenderer } from '../../src/legacy-renderers.mjs'

test('KicadParser and SVG renderer preserve filled schematic symbol arcs', () => {
    const document = KicadParser.parseArrayBuffer(
        'fake-filled-arc.kicad_sch',
        bytesFor(filledArcSource())
    )
    const markup = SchematicSvgRenderer.render(document)
    const fillArc = markup.match(
        /<path class="schematic-arc schematic-shape-fill"[^>]+>/
    )?.[0]
    const strokeArc = markup.match(
        /<path class="schematic-arc schematic-shape-stroke"[^>]+>/
    )?.[0]

    assert.equal(document.schematic.arcs.length, 1)
    assert.equal(document.schematic.arcs[0].fill, 'outline')
    assert.match(fillArc, /d="[^"]+ Z"/)
    assert.match(fillArc, /fill="var\(--schematic-power-color\)"/)
    assert.match(fillArc, /stroke="none"/)
    assert.doesNotMatch(strokeArc, /d="[^"]+ Z"/)
})

/**
 * Encodes source text as an ArrayBuffer.
 * @param {string} source Source text.
 * @returns {ArrayBuffer}
 */
function bytesFor(source) {
    const buffer = Buffer.from(source, 'utf8')
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
    )
}

/**
 * Builds a schematic fixture with a filled symbol arc cap.
 * @returns {string}
 */
function filledArcSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Test:FILLED_ARC"
                (symbol "FILLED_ARC_0_1"
                    (arc (start -2 0) (mid 0 -2) (end 2 0)
                        (stroke (width 0.2) (type default))
                        (fill (type outline))
                    )
                )
            )
        )
        (symbol "Test:FILLED_ARC"
            (at 20 20 0)
            (property "Reference" "U1" (at 20 16 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "FilledArc" (at 20 24 0)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "filled-arc-symbol")
        )
    )`
}
