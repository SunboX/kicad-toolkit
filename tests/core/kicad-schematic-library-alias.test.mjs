// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadParser } from '../../src/parser.mjs'

test('KicadParser resolves embedded lib_name aliases for schematic symbols', () => {
    const document = KicadParser.parseArrayBuffer(
        'fake-library-alias.kicad_sch',
        bytesFor(libraryAliasSource())
    )

    assert.equal(document.schematic.components[0].source, 'Mock:Aliased')
    assert.equal(document.schematic.rectangles.length, 1)
    assert.deepEqual(
        document.schematic.pins.map((pin) => ({
            designator: pin.designator,
            name: pin.name,
            x: roundCoordinate(pin.x),
            y: roundCoordinate(pin.y),
            orientation: pin.orientation
        })),
        [
            {
                designator: '1',
                name: 'IN',
                x: 30,
                y: 30,
                orientation: 'left'
            },
            {
                designator: '2',
                name: 'OUT',
                x: 40,
                y: 30,
                orientation: 'right'
            }
        ]
    )
})

test('KicadParser prefers placed lib_name geometry when lib_id also exists', () => {
    const document = KicadParser.parseArrayBuffer(
        'fake-library-alias-conflict.kicad_sch',
        bytesFor(libraryAliasConflictSource())
    )

    assert.deepEqual(
        document.schematic.pins.map((pin) => ({
            designator: pin.designator,
            name: pin.name,
            x: roundCoordinate(pin.x),
            y: roundCoordinate(pin.y),
            orientation: pin.orientation
        })),
        [
            {
                designator: '4',
                name: 'NEG',
                x: 25.08,
                y: 20,
                orientation: 'left'
            },
            {
                designator: '8',
                name: 'POS',
                x: 25.08,
                y: 17.46,
                orientation: 'left'
            },
            {
                designator: '9',
                name: 'PAD',
                x: 25.08,
                y: 22.54,
                orientation: 'left'
            }
        ]
    )
})

/**
 * Builds a fake schematic whose placed symbol lib_id differs from the
 * embedded symbol node name while lib_name points at that embedded body.
 * @returns {string}
 */
function libraryAliasSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Aliased_1"
                (property "Reference" "U" (at 0 4 0)
                    (effects (font (size 1.27 1.27)))
                )
                (property "Value" "Aliased" (at 0 -4 0)
                    (effects (font (size 1.27 1.27)))
                )
                (symbol "Aliased_1_1_1"
                    (rectangle
                        (start -5 3)
                        (end 5 -3)
                        (stroke (width 0.15) (type default))
                        (fill (type background))
                    )
                    (pin input line (at -10 0 0) (length 5)
                        (name "IN" (effects (font (size 1.27 1.27))))
                        (number "1" (effects (font (size 1.27 1.27))))
                    )
                    (pin output line (at 10 0 180) (length 5)
                        (name "OUT" (effects (font (size 1.27 1.27))))
                        (number "2" (effects (font (size 1.27 1.27))))
                    )
                )
            )
        )
        (symbol (lib_name "Aliased_1") (lib_id "Mock:Aliased")
            (at 35 30 0)
            (unit 1)
            (uuid "fake-alias-symbol")
            (property "Reference" "U1" (at 35 25 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "Aliased" (at 35 35 0)
                (effects (font (size 1.27 1.27)))
            )
        )
    )`
}

/**
 * Builds a fake schematic where both lib_id and lib_name resolve, but only
 * lib_name matches the placed symbol's selected unit geometry.
 * @returns {string}
 */
function libraryAliasConflictSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Mock:RotatedUnit"
                (symbol "RotatedUnit_3_1"
                    (pin passive line (at 0 0 90) (length 5.08)
                        (name "NEG" (effects (font (size 1.27 1.27))))
                        (number "4" (effects (font (size 1.27 1.27))))
                    )
                    (pin passive line (at 0 16.51 270) (length 5.08)
                        (name "POS" (effects (font (size 1.27 1.27))))
                        (number "8" (effects (font (size 1.27 1.27))))
                    )
                    (pin passive line (at 3.81 0 90) (length 5.08)
                        (name "PAD" (effects (font (size 1.27 1.27))))
                        (number "9" (effects (font (size 1.27 1.27))))
                    )
                )
            )
            (symbol "RotatedUnit_1"
                (symbol "RotatedUnit_1_3_1"
                    (pin passive line (at 0 0 90) (length 5.08)
                        (name "NEG" (effects (font (size 1.27 1.27))))
                        (number "4" (effects (font (size 1.27 1.27))))
                    )
                    (pin passive line (at -2.54 0 90) (length 5.08)
                        (name "POS" (effects (font (size 1.27 1.27))))
                        (number "8" (effects (font (size 1.27 1.27))))
                    )
                    (pin passive line (at 2.54 0 90) (length 5.08)
                        (name "PAD" (effects (font (size 1.27 1.27))))
                        (number "9" (effects (font (size 1.27 1.27))))
                    )
                )
            )
        )
        (symbol (lib_name "RotatedUnit_1") (lib_id "Mock:RotatedUnit")
            (at 20 20 270)
            (unit 3)
            (uuid "fake-alias-conflict")
            (property "Reference" "U1" (at 20 14 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "RotatedUnit" (at 20 26 0)
                (effects (font (size 1.27 1.27)))
            )
        )
    )`
}

/**
 * Encodes a fixture source as bytes.
 * @param {string} source Source fixture.
 * @returns {Uint8Array}
 */
function bytesFor(source) {
    return new TextEncoder().encode(source)
}

/**
 * Rounds a parsed schematic coordinate to renderer precision.
 * @param {number} value Coordinate value.
 * @returns {number}
 */
function roundCoordinate(value) {
    return Number(value.toFixed(3))
}
