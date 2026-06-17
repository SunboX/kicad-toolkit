// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadParser } from '../../src/parser.mjs'
import { SchematicSvgRenderer } from '../../src/renderers.mjs'

test('KicadParser preserves schematic pin electrical type and graphic style', () => {
    const document = KicadParser.parseArrayBufferToRendererModel(
        'styled-pins.kicad_sch',
        bytesFor(styledPinsSource())
    )

    assert.deepEqual(
        document.schematic.pins.map((pin) => ({
            designator: pin.designator,
            electricalType: pin.electricalType,
            pinStyle: pin.pinStyle
        })),
        [
            { designator: '1', electricalType: 'input', pinStyle: 'inverted' },
            { designator: '2', electricalType: 'input', pinStyle: 'clock' },
            {
                designator: '3',
                electricalType: 'output',
                pinStyle: 'input_low'
            },
            {
                designator: '4',
                electricalType: 'passive',
                pinStyle: 'non_logic'
            }
        ]
    )
})

test('SchematicSvgRenderer renders KiCad schematic pin style markers', () => {
    const document = KicadParser.parseArrayBufferToRendererModel(
        'styled-pins.kicad_sch',
        bytesFor(styledPinsSource())
    )
    const markup = SchematicSvgRenderer.render(document)

    assert.match(markup, /schematic-pin-style--inverted/)
    assert.match(markup, /schematic-pin-style--clock/)
    assert.match(markup, /schematic-pin-style--low-active/)
    assert.match(markup, /schematic-pin-style--non-logic/)
})

test('SchematicSvgRenderer emits radius attributes for rounded schematic rectangles', () => {
    const markup = SchematicSvgRenderer.render({
        fileName: 'rounded-rectangle.kicad_sch',
        summary: { title: 'Rounded Rectangle' },
        schematic: {
            sheet: {
                width: 40,
                height: 25,
                borderOn: false,
                titleBlockOn: false
            },
            rectangles: [
                {
                    x: 5,
                    y: 6,
                    width: 12,
                    height: 8,
                    radius: 1.5,
                    fill: 'none',
                    lineWidth: 0.2
                }
            ],
            lines: [],
            pins: [],
            texts: [],
            junctions: []
        }
    })

    assert.match(
        markup,
        /<rect class="schematic-rect schematic-shape-stroke"[^>]* rx="1\.5" ry="1\.5"/
    )
})

/**
 * Builds a fake schematic with common KiCad pin graphic styles.
 * @returns {string}
 */
function styledPinsSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Test:PIN_STYLES"
                (pin_names (offset 1.016))
                (symbol "PIN_STYLES_1_1"
                    (rectangle
                        (start -4 8)
                        (end 4 -8)
                        (stroke (width 0.15) (type default))
                        (fill (type background))
                    )
                    (pin input inverted (at -6 6 0) (length 2)
                        (name "INV" (effects (font (size 1.27 1.27))))
                        (number "1" (effects (font (size 1.27 1.27))))
                    )
                    (pin input clock (at -6 2 0) (length 2)
                        (name "CLK" (effects (font (size 1.27 1.27))))
                        (number "2" (effects (font (size 1.27 1.27))))
                    )
                    (pin output input_low (at -6 -2 0) (length 2)
                        (name "LOW" (effects (font (size 1.27 1.27))))
                        (number "3" (effects (font (size 1.27 1.27))))
                    )
                    (pin passive non_logic (at -6 -6 0) (length 2)
                        (name "NL" (effects (font (size 1.27 1.27))))
                        (number "4" (effects (font (size 1.27 1.27))))
                    )
                )
            )
        )
        (symbol "Test:PIN_STYLES" (at 20 15 0) (unit 1)
            (property "Reference" "U1" (at 14 5 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "PIN_STYLES" (at 14 24 0)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "styled-pin-symbol")
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
