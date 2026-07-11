// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadParser } from '../../src/legacy-parser.mjs'
import { SchematicSvgRenderer } from '../../src/legacy-renderers.mjs'

test('KicadParser marks only unconnected visible pins with dangling endpoint circles', () => {
    const document = KicadParser.parseArrayBuffer(
        'fake-dangling-pin.kicad_sch',
        bytesFor(danglingPinSource())
    )
    const markup = SchematicSvgRenderer.render(document)
    const pinByNumber = new Map(
        document.schematic.pins.map((pin) => [pin.designator, pin])
    )

    assert.equal(pinByNumber.get('1').danglingEndpointVisible, false)
    assert.equal(pinByNumber.get('2').danglingEndpointVisible, true)
    assert.equal(pinByNumber.get('3').danglingEndpointVisible, false)
    assert.match(
        markup,
        /<circle class="schematic-pin-dangling-endpoint" cx="25" cy="22\.54" r="0\.42" fill="var\(--schematic-fill-color\)" stroke="var\(--schematic-power-color\)" stroke-width="0\.12"\/>/
    )
    assert.doesNotMatch(
        markup,
        /class="schematic-pin-dangling-endpoint" cx="25" cy="20"/
    )
    assert.doesNotMatch(
        markup,
        /class="schematic-pin-dangling-endpoint" cx="25" cy="25\.08"/
    )
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
 * Builds a schematic fixture with connected, dangling, and no-connect pins.
 * @returns {string}
 */
function danglingPinSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Test:DANGLING_PIN"
                (pin_names (offset 1.016))
                (symbol "DANGLING_PIN_1_1"
                    (rectangle (start 0 -7) (end 5 2)
                        (stroke (width 0.15) (type solid))
                        (fill (type background))
                    )
                    (pin passive line (at 5 0 180) (length 5)
                        (name "CONNECTED" (effects (font (size 1.27 1.27))))
                        (number "1" (effects (font (size 1.27 1.27))))
                    )
                    (pin passive line (at 5 -2.54 180) (length 5)
                        (name "DANGLING" (effects (font (size 1.27 1.27))))
                        (number "2" (effects (font (size 1.27 1.27))))
                    )
                    (pin passive line (at 5 -5.08 180) (length 5)
                        (name "NO_CONNECT" (effects (font (size 1.27 1.27))))
                        (number "3" (effects (font (size 1.27 1.27))))
                    )
                )
            )
        )
        (wire
            (pts (xy 25 20) (xy 30 20))
            (stroke (width 0) (type default))
            (uuid "connected-wire")
        )
        (label "CONNECTED"
            (at 30 20 0)
            (effects (font (size 1.27 1.27)))
        )
        (no_connect (at 25 25.08) (uuid "explicit-no-connect"))
        (symbol "Test:DANGLING_PIN"
            (at 20 20 0)
            (property "Reference" "U1" (at 20 14 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "DanglingPin" (at 20 28 0)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "dangling-symbol")
        )
    )`
}
