// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadParser } from '../../src/legacy-parser.mjs'
import { SchematicSvgRenderer } from '../../src/legacy-renderers.mjs'

test('KicadParser preserves authored schematic graphic stroke and fill styles', () => {
    const document = KicadParser.parseArrayBufferToRendererModel(
        'authored-style.kicad_sch',
        bytesFor(authoredStyleSource())
    )

    const textBox = document.schematic.textBoxes[0]
    const rectangle = document.schematic.rectangles.find(
        (entry) => entry.sourceType === 'rectangle' && !entry.ownerIndex
    )
    const symbolRectangle = document.schematic.rectangles.find(
        (entry) => entry.ownerIndex
    )

    assert.equal(textBox.strokeStyle, 'dash')
    assert.equal(textBox.strokeColor, 'rgba(255,0,0,1)')
    assert.equal(textBox.fillColor, 'rgba(0,128,64,0.5)')
    assert.equal(rectangle.strokeStyle, 'dot')
    assert.equal(rectangle.strokeColor, 'rgba(0,64,255,1)')
    assert.equal(rectangle.fillColor, 'rgba(255,255,0,0.75)')
    assert.equal(symbolRectangle.strokeStyle, 'dash_dot')
    assert.equal(symbolRectangle.strokeColor, 'rgba(128,0,255,1)')
    assert.equal(symbolRectangle.fillColor, 'rgba(255,192,0,0.25)')
})

test('SchematicSvgRenderer renders schematic text boxes and table cells', () => {
    const markup = SchematicSvgRenderer.render(frameDocument())

    assert.match(markup, /class="schematic-text-box-frame"/)
    assert.match(markup, /class="schematic-table-cell-frame"/)
    assert.ok(markup.includes('aria-label="Box A\nBox B"'))
    assert.match(markup, /aria-label="Cell 1"/)
    assert.match(markup, /aria-label="Cell 2"/)
    assert.match(markup, /data-line="Box A"/)
    assert.match(markup, /data-line="Box B"/)
})

test('SchematicSvgRenderer reports frame objects in render-operation metadata', () => {
    const markup = SchematicSvgRenderer.render(frameDocument())

    assert.match(markup, /"primitive":"text_box"/)
    assert.match(markup, /"primitive":"table_cell"/)
    assert.match(markup, /"type":"frame"/)
    assert.match(markup, /"type":"stroke-text"/)
})

test('SchematicSvgRenderer applies authored schematic colors and stroke patterns', () => {
    const document = KicadParser.parseArrayBufferToRendererModel(
        'authored-style.kicad_sch',
        bytesFor(authoredStyleSource())
    )
    const markup = SchematicSvgRenderer.render(document)

    assert.match(
        markup,
        /<rect class="schematic-text-box-frame"[^>]*fill="rgba\(0,128,64,0\.5\)"[^>]*stroke="rgba\(255,0,0,1\)"[^>]*stroke-dasharray=/
    )
    assert.match(
        markup,
        /<rect class="schematic-rect schematic-shape-stroke"[^>]*stroke="rgba\(0,64,255,1\)"[^>]*stroke-dasharray=/
    )
    assert.match(
        markup,
        /<rect class="schematic-rect schematic-shape-fill"[^>]*fill="rgba\(255,192,0,0\.25\)"/
    )
})

/**
 * Builds a renderer document with root schematic frame objects.
 * @returns {object}
 */
function frameDocument() {
    const baseText = {
        fontSize: 1,
        font: {
            width: 1,
            height: 1,
            hAlign: 'left',
            vAlign: 'top'
        },
        margins: {
            left: 1,
            top: 1,
            right: 1,
            bottom: 1
        },
        lineWidth: 0.2,
        strokeColor: 'rgba(255,0,0,1)',
        fillColor: 'rgba(0,128,64,0.5)',
        fill: 'background',
        strokeStyle: 'dash'
    }

    return {
        fileName: 'schematic-frames.kicad_sch',
        summary: { title: 'Schematic Frames' },
        schematic: {
            sheet: {
                width: 60,
                height: 35,
                borderOn: false,
                titleBlockOn: false
            },
            lines: [],
            rectangles: [],
            pins: [],
            texts: [],
            junctions: [],
            crosses: [],
            textBoxes: [
                {
                    ...baseText,
                    x: 5,
                    y: 6,
                    width: 18,
                    height: 8,
                    text: 'Box A\nBox B',
                    value: 'Box A\nBox B'
                }
            ],
            tables: [
                {
                    sourceType: 'table',
                    cells: [
                        {
                            ...baseText,
                            x: 30,
                            y: 6,
                            width: 10,
                            height: 5,
                            text: 'Cell 1',
                            value: 'Cell 1'
                        },
                        {
                            ...baseText,
                            x: 40,
                            y: 6,
                            width: 10,
                            height: 5,
                            text: 'Cell 2',
                            value: 'Cell 2'
                        }
                    ]
                }
            ]
        }
    }
}

/**
 * Builds a fake schematic with explicit object-level styles.
 * @returns {string}
 */
function authoredStyleSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Test:STYLE_BOX"
                (symbol "STYLE_BOX_1_1"
                    (rectangle
                        (start -2 2)
                        (end 2 -2)
                        (stroke (width 0.2) (type dash_dot) (color 128 0 255 1))
                        (fill (type background) (color 255 192 0 0.25))
                    )
                )
            )
        )
        (text_box "Styled note"
            (at 5 5 0)
            (size 18 8)
            (margins 1 1 1 1)
            (stroke (width 0.2) (type dash) (color 255 0 0 1))
            (fill (type background) (color 0 128 64 0.5))
            (effects (font (size 1 1)) (justify left top))
            (uuid "text-box-style")
        )
        (rectangle
            (start 5 18)
            (end 20 26)
            (stroke (width 0.3) (type dot) (color 0 64 255 1))
            (fill (type background) (color 255 255 0 0.75))
            (uuid "rectangle-style")
        )
        (symbol "Test:STYLE_BOX" (at 35 20 0) (unit 1)
            (property "Reference" "U1" (at 35 15 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "STYLE_BOX" (at 35 25 0)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "style-symbol")
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
