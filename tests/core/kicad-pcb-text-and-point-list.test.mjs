// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadPcbParser } from '../../src/core/kicad/KicadPcbParser.mjs'

test('KicadPcbParser flattens arc segments inside polygon point lists', () => {
    const board = KicadPcbParser.parse(polygonArcFixture(), {
        fileName: 'polygon-arc-fixture.kicad_pcb'
    })
    const polygon = board.drawings.find(
        (drawing) => drawing.sourceType === 'gr_poly'
    )

    assert.ok(polygon)
    assert.ok(polygon.points.length > 4)
    assert.deepEqual(polygon.points[0], { x: 0, y: 0 })
    assert.ok(
        polygon.points.some((point) => {
            return Math.abs(point.x - 1) < 0.15 && Math.abs(point.y + 1) < 0.15
        })
    )
    assert.deepEqual(polygon.points.at(-1), { x: 0, y: 2 })
})

test('KicadPcbParser expands board and footprint text variables', () => {
    const board = KicadPcbParser.parse(textVariableFixture(), {
        fileName: 'text-variable-fixture.kicad_pcb'
    })

    assert.ok(
        board.texts.some((text) => text.value === 'Panel/R3/B42/"'),
        'expected board text variables and text escapes to expand'
    )
    assert.ok(
        board.texts.some((text) => {
            return (
                text.value === 'R1:10k:F.SilkS:Device:R:Local Build:Example Lab'
            )
        }),
        'expected footprint, board, and title block variables to expand'
    )
})

/**
 * Builds a fake board with an arc inside a polygon point list.
 * @returns {string}
 */
function polygonArcFixture() {
    return `(kicad_pcb
        (version 20241229)
        (gr_poly
            (pts
                (xy 0 0)
                (arc (start 0 0) (mid 1 -1) (end 2 0))
                (xy 2 2)
                (xy 0 2)
            )
            (stroke (width 0.1) (type solid))
            (fill solid)
            (layer "F.SilkS")
        )
    )`
}

/**
 * Builds a fake board with text variables.
 * @returns {string}
 */
function textVariableFixture() {
    return `(kicad_pcb
        (version 20250101)
        (title_block
            (title "Panel")
            (rev "R3")
            (company "Example Lab")
        )
        (property "Build" "B42")
        (gr_text "\${TITLE}/\${REVISION}/\${Build}/{dblquote}"
            (at 0 0 0)
            (layer "F.SilkS")
            (effects (font (size 1 1)))
        )
        (footprint "Device:R"
            (layer "F.Cu")
            (at 1 2 0)
            (property "Reference" "R1"
                (at 0 0 0)
                (layer "F.SilkS")
                (effects (font (size 1 1)))
            )
            (property "Value" "10k"
                (at 0 1 0)
                (layer "F.Fab")
                (effects (font (size 1 1)))
            )
            (property "Build" "Local Build"
                (at 0 2 0)
                (layer "F.Fab")
                (effects (font (size 1 1)))
            )
            (fp_text user "\${REFERENCE}:\${VALUE}:\${LAYER}:\${FOOTPRINT_LIBRARY}:\${FOOTPRINT_NAME}:\${Build}:\${COMPANY}"
                (at 0 3 0)
                (layer "F.SilkS")
                (effects (font (size 1 1)))
            )
        )
    )`
}
