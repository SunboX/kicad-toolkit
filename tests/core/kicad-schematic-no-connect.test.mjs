// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadParser } from '../../src/legacy-parser.mjs'
import { SchematicSvgRenderer } from '../../src/legacy-renderers.mjs'

test('KicadParser creates no-connect crosses for visible library no-connect pins', () => {
    const document = KicadParser.parseArrayBuffer(
        'fake-no-connect-pin.kicad_sch',
        bytesFor(noConnectPinSource())
    )
    const markup = SchematicSvgRenderer.render(document)
    const noConnectPins = document.schematic.pins.filter(
        (pin) => pin.electricalType === 'no_connect'
    )

    assert.equal(noConnectPins.length, 2)
    assert.deepEqual(document.schematic.crosses, [
        {
            x: 50,
            y: 30,
            size: 1.5,
            color: '#0f6b7a',
            ownerIndex: 'no-connect-symbol',
            sourceType: 'pin_no_connect',
            pinDesignator: '5'
        }
    ])
    assert.match(markup, /class="schematic-cross"/)
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
 * Builds a schematic fixture with visible and hidden no-connect library pins.
 * @returns {string}
 */
function noConnectPinSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Test:NO_CONNECT_PIN"
                (pin_names (offset 1.016))
                (symbol "NO_CONNECT_PIN_1_1"
                    (rectangle (start 0 -5) (end 5 5)
                        (stroke (width 0.15) (type solid))
                        (fill (type background))
                    )
                    (pin no_connect line (at 10 0 180) (length 5)
                        (name "NC" (effects (font (size 1.27 1.27))))
                        (number "5" (effects (font (size 1.27 1.27))))
                    )
                    (pin no_connect line (at 10 -2.54 180) (length 5) hide
                        (name "HIDDEN" (effects (font (size 1.27 1.27))))
                        (number "9" (effects (font (size 1.27 1.27))))
                    )
                )
            )
        )
        (symbol "Test:NO_CONNECT_PIN"
            (at 40 30 0)
            (property "Reference" "U1" (at 40 24 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "NoConnect" (at 40 36 0)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "no-connect-symbol")
        )
    )`
}
