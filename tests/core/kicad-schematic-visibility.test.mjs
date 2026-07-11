// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadParser } from '../../src/legacy-parser.mjs'

test('KicadParser uses KiCad default A3 drawing-sheet zones', () => {
    const document = KicadParser.parseArrayBuffer(
        'generic-a3-sheet.kicad_sch',
        bytesFor(`(kicad_sch
            (version 20250114)
            (paper "A3")
            (title_block
                (title "Generic A3 Design")
                (date "2026-05-26")
                (rev "A")
                (company "Generic Company")
            )
        )`)
    )

    assert.equal(document.schematic.sheet.xZones, 8)
    assert.equal(document.schematic.sheet.yZones, 6)
    assert.equal(document.schematic.sheet.marginWidth, 10)
})

test('KicadParser omits scalar-hidden schematic properties from visible text', () => {
    const document = KicadParser.parseArrayBuffer(
        'hidden-properties.kicad_sch',
        bytesFor(`(kicad_sch
            (version 20250114)
            (paper "A4")
            (lib_symbols
                (symbol "Device:R"
                    (property "Reference" "R" (at 0 0 0)
                        (effects (font (size 1.27 1.27)))
                    )
                    (property "Value" "R" (at 0 2 0)
                        (effects (font (size 1.27 1.27)))
                    )
                    (pin passive line (at -2.54 0 0) (length 2.54)
                        (name "~" (effects (font (size 1.27 1.27))))
                        (number "1" (effects (font (size 1.27 1.27))))
                    )
                )
            )
            (symbol "Device:R"
                (at 20 20 0)
                (property "Reference" "R1" (at 20 17 0)
                    (effects (font (size 1.27 1.27)))
                )
                (property "Value" "10k" (at 20 23 0)
                    (effects (font (size 1.27 1.27)))
                )
                (property "Footprint" "Hidden:Long_Field" (at 20 25 0)
                    (effects (font (size 1.27 1.27)) hide)
                )
                (property "Datasheet" "https://example.invalid/hidden.pdf" (at 20 27 0)
                    (effects (font (size 1.27 1.27))) hide
                )
                (uuid "hidden-property-symbol")
            )
        )`)
    )

    assert.deepEqual(
        document.schematic.texts
            .filter((text) => text.propertyName)
            .map((text) => text.propertyName),
        ['Reference', 'Value']
    )
})

test('KicadParser keeps scalar-hidden pins connectable but not visible', () => {
    const document = KicadParser.parseArrayBuffer(
        'hidden-pin.kicad_sch',
        bytesFor(`(kicad_sch
            (version 20250114)
            (paper "A4")
            (lib_symbols
                (symbol "power:+V"
                    (power)
                    (property "Reference" "#PWR" (at 0 0 0)
                        (effects (font (size 1.27 1.27)) hide)
                    )
                    (property "Value" "+V" (at 0 3.556 0)
                        (effects (font (size 1.27 1.27)))
                    )
                    (pin power_in line (at 0 0 90) (length 0) hide
                        (name "+V" (effects (font (size 1.27 1.27))))
                        (number "1" (effects (font (size 1.27 1.27))))
                    )
                )
            )
            (symbol "power:+V"
                (at 20 20 0)
                (uuid "hidden-power-pin")
            )
        )`)
    )
    const pin = document.schematic.pins[0]

    assert.equal(pin.visible, false)
    assert.equal(pin.numberVisible, false)
    assert.equal(pin.x, 20)
    assert.equal(pin.y, 20)
})

/**
 * Encodes fixture source to an ArrayBuffer-like byte view.
 * @param {string} source Source fixture.
 * @returns {Uint8Array}
 */
function bytesFor(source) {
    return new TextEncoder().encode(source)
}
