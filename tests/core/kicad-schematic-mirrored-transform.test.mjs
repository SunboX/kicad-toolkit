// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadParser } from '../../src/legacy-parser.mjs'

test('KicadParser aligns mirrored rotated symbol graphics and pins to their wires', () => {
    const document = KicadParser.parseArrayBuffer(
        'fake-mirrored-rotated-symbol.kicad_sch',
        bytesFor(mirroredRotatedSymbolSource())
    )
    const pins = document.schematic.pins.map(pinPlacement)
    const bodyCircle = document.schematic.ellipses.find(
        (ellipse) => ellipse.ownerIndex === 'mirrored-rotated-symbol'
    )

    assert.deepEqual(pins, [
        { designator: '1', x: 17, y: 23, length: 2, orientation: 'left' },
        { designator: '4', x: 20, y: 28, length: 2, orientation: 'bottom' },
        { designator: '5', x: 23, y: 23, length: 2, orientation: 'right' }
    ])
    assert.deepEqual(
        {
            x: round(bodyCircle.x),
            y: round(bodyCircle.y),
            radiusX: round(bodyCircle.radiusX)
        },
        { x: 20, y: 24, radiusX: 3 }
    )
    assert.ok(
        document.schematic.nets.some((net) => net.name === 'LEFT_NET'),
        'expected the left mirrored pin to connect to its wire'
    )
    assert.ok(
        document.schematic.nets.some((net) => net.name === 'RIGHT_NET'),
        'expected the right mirrored pin to connect to its wire'
    )
    assert.ok(
        document.schematic.nets.some((net) => net.name === 'BOTTOM_NET'),
        'expected the bottom mirrored pin to connect to its wire'
    )
})

/**
 * Extracts rounded placement fields from one pin.
 * @param {object} pin Parsed schematic pin.
 * @returns {object}
 */
function pinPlacement(pin) {
    return {
        designator: pin.designator,
        x: round(pin.x),
        y: round(pin.y),
        length: round(pin.length),
        orientation: pin.orientation
    }
}

/**
 * Rounds a numeric value for deterministic fixture assertions.
 * @param {number} value Number.
 * @returns {number}
 */
function round(value) {
    return Number(Number(value || 0).toFixed(3))
}

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
 * Builds a mirrored and rotated split-symbol fixture.
 * @returns {string}
 */
function mirroredRotatedSymbolSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Test:MIRRORED_ROTATED"
                (symbol "MIRRORED_ROTATED_0_1"
                    (circle (center 6 0) (radius 3)
                        (stroke (width 0.2) (type solid))
                        (fill (type none))
                    )
                )
                (symbol "MIRRORED_ROTATED_1_1"
                    (pin passive line (at 7 -5 90) (length 2)
                        (name "LEFT" (effects (font (size 1 1))))
                        (number "1" (effects (font (size 1 1))))
                    )
                    (pin passive line (at 0 0 0) (length 2)
                        (name "BOTTOM" (effects (font (size 1 1))))
                        (number "4" (effects (font (size 1 1))))
                    )
                    (pin passive line (at 7 5 270) (length 2)
                        (name "RIGHT" (effects (font (size 1 1))))
                        (number "5" (effects (font (size 1 1))))
                    )
                )
            )
        )
        (wire (pts (xy 15 23) (xy 12 23)) (stroke (width 0.15) (type solid)))
        (wire (pts (xy 25 23) (xy 28 23)) (stroke (width 0.15) (type solid)))
        (wire (pts (xy 20 30) (xy 20 34)) (stroke (width 0.15) (type solid)))
        (label "LEFT_NET" (at 12 23 180)
            (effects (font (size 1.27 1.27)) (justify right bottom))
        )
        (label "RIGHT_NET" (at 28 23 0)
            (effects (font (size 1.27 1.27)) (justify left bottom))
        )
        (label "BOTTOM_NET" (at 20 34 90)
            (effects (font (size 1.27 1.27)) (justify left bottom))
        )
        (symbol "Test:MIRRORED_ROTATED"
            (at 20 30 270)
            (mirror x)
            (unit 1)
            (property "Reference" "Q1" (at 14 20 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "MIRRORED_ROTATED" (at 14 22 0)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "mirrored-rotated-symbol")
        )
    )`
}
