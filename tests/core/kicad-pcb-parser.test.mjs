// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { KicadPcbParser } from '../../src/core/kicad/KicadPcbParser.mjs'

const fixtureUrl = new URL('../fixtures/minimal.kicad_pcb', import.meta.url)

test('KicadPcbParser extracts title, outline, footprints, pads, and transformed locations', async () => {
    const source = await readFile(fixtureUrl, 'utf8')
    const board = KicadPcbParser.parse(source, {
        fileName: 'minimal.kicad_pcb'
    })

    assert.equal(board.title, 'Tiny Board')
    assert.equal(board.revision, 'A')
    assert.equal(board.fileName, 'minimal.kicad_pcb')
    assert.equal(board.outlines.length, 1)
    assert.equal(board.outlines[0].type, 'polygon')
    assert.equal(board.footprints.length, 1)
    assert.equal(board.footprints[0].reference, 'U1')
    assert.equal(board.pads.length, 2)

    const pad1 = board.pads.find((pad) => pad.number === '1')
    assert.ok(pad1)
    assert.equal(pad1.shape, 'roundrect')
    assert.equal(pad1.side, 'front')
    assert.deepEqual(
        { x: Number(pad1.x.toFixed(3)), y: Number(pad1.y.toFixed(3)) },
        { x: 10, y: 9 }
    )

    const pad2 = board.pads.find((pad) => pad.number === '2')
    assert.ok(pad2)
    assert.equal(pad2.side, 'both')
    assert.equal(pad2.drill, 0.7)

    const mirroredText = board.texts.find((text) => text.value === 'BACK')
    assert.ok(mirroredText)
    assert.equal(mirroredText.side, 'back')
    assert.equal(mirroredText.mirrored, true)
})

test('KicadPcbParser extracts copper segments, vias, zones, and rotated rectangles', async () => {
    const source = await readFile(fixtureUrl, 'utf8')
    const board = KicadPcbParser.parse(source, {
        fileName: 'minimal.kicad_pcb'
    })

    const segment = board.drawings.find((drawing) => drawing.type === 'segment')
    assert.ok(segment)
    assert.equal(segment.layer, 'F.Cu')
    assert.equal(segment.side, 'front')
    assert.equal(segment.material, 'copper')
    assert.equal(segment.strokeWidth, 0.4)

    const via = board.drawings.find((drawing) => drawing.type === 'via')
    assert.ok(via)
    assert.equal(via.side, 'both')
    assert.equal(via.material, 'copper')
    assert.equal(via.size, 1.2)
    assert.equal(via.drill, 0.5)

    const zone = board.drawings.find((drawing) => drawing.type === 'zone')
    assert.ok(zone)
    assert.equal(zone.layer, 'B.Cu')
    assert.equal(zone.side, 'back')
    assert.equal(zone.fill, true)
    assert.equal(zone.points.length, 4)

    const rotatedRect = board.drawings.find((drawing) => {
        return (
            drawing.ownerId?.startsWith('footprint:U1') &&
            drawing.sourceType === 'fp_rect'
        )
    })
    assert.ok(rotatedRect)
    assert.equal(rotatedRect.type, 'polygon')
    assert.deepEqual(
        rotatedRect.points.map((point) => ({
            x: Number(point.x.toFixed(3)),
            y: Number(point.y.toFixed(3))
        })),
        [
            { x: 9, y: 12 },
            { x: 9, y: 8 },
            { x: 11, y: 8 },
            { x: 11, y: 12 }
        ]
    )
})

test('KicadPcbParser parses a multi-footprint board without throwing', async () => {
    const source = multiFootprintFixture()
    const board = KicadPcbParser.parse(source, {
        fileName: 'multi-footprint.kicad_pcb'
    })

    assert.equal(board.title, 'Fixture Board')
    assert.equal(board.outlines.length, 1)
    assert.equal(board.footprints.length, 2)
    assert.equal(board.pads.length, 4)
    assert.ok(board.drawings.some((drawing) => drawing.type === 'segment'))
    assert.ok(board.drawings.some((drawing) => drawing.type === 'via'))
    assert.ok(board.drawings.some((drawing) => drawing.type === 'zone'))
    assert.ok(board.texts.some((text) => text.value === 'FIXTURE_TOP'))
    assert.ok(board.texts.some((text) => text.value === 'BOTTOM_VALUE'))
    assert.ok(board.bounds.width > 20)
    assert.ok(board.bounds.height > 20)
})

test('KicadPcbParser applies KiCad bottom-footprint transforms and text alignment', () => {
    const board = KicadPcbParser.parse(multiFootprintFixture(), {
        fileName: 'multi-footprint.kicad_pcb'
    })

    const bottomConnector = board.footprints.find(
        (footprint) => footprint.reference === 'J1'
    )
    assert.ok(bottomConnector)
    assert.equal(bottomConnector.side, 'back')

    const pad1 = bottomConnector.pads.find((pad) => pad.number === '1')
    assert.ok(pad1)
    assert.equal(pad1.side, 'back')
    assert.deepEqual(pad1.layers, ['B.Cu', 'B.Mask', 'B.Paste'])
    assert.deepEqual(roundedPoint(pad1), { x: 20.866, y: 19.5, rotation: 0 })

    const pad2 = bottomConnector.pads.find((pad) => pad.number === '2')
    assert.ok(pad2)
    assert.equal(pad2.side, 'both')
    assert.equal(pad2.rotation, 90)

    const referenceText = board.texts.find(
        (text) => text.value === 'J1' && text.layer === 'B.SilkS'
    )
    assert.ok(referenceText)
    assert.equal(referenceText.visible, true)
    assert.equal(referenceText.propertyName, 'Reference')
    assert.equal(referenceText.mirrored, true)
    assert.equal(referenceText.hAlign, 'left')
    assert.equal(referenceText.vAlign, 'bottom')
    assert.deepEqual(roundedPoint(referenceText), {
        x: 21.866,
        y: 21.232,
        rotation: 345
    })

    const valueText = board.texts.find((text) => text.value === 'BOTTOM_VALUE')
    assert.ok(valueText)
    assert.equal(valueText.hAlign, 'center')
    assert.equal(valueText.vAlign, 'center')
    assert.deepEqual(roundedPoint(valueText), {
        x: 18.768,
        y: 21.866,
        rotation: 315
    })
})

/**
 * Builds a fake multi-footprint KiCad board fixture.
 * @returns {string}
 */
function multiFootprintFixture() {
    return `(kicad_pcb
        (version 20241229)
        (title_block
            (title "Fixture Board")
            (rev "B")
        )
        (gr_poly
            (pts (xy 0 0) (xy 40 0) (xy 40 30) (xy 0 30))
            (stroke (width 0.1) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
        (segment
            (start 2 2)
            (end 15 2)
            (width 0.3)
            (layer "F.Cu")
            (net 1)
        )
        (via
            (at 15 15)
            (size 1.2)
            (drill 0.5)
            (layers "F.Cu" "B.Cu")
            (net 1)
        )
        (zone
            (net 1)
            (net_name "GND")
            (layer "B.Cu")
            (filled_polygon
                (layer "B.Cu")
                (pts (xy 20 14) (xy 25 14) (xy 25 18) (xy 20 18))
            )
        )
        (gr_text "FIXTURE_TOP"
            (at 5 25 0)
            (layer "F.SilkS")
            (effects
                (font (size 1 1) (thickness 0.15))
                (justify left bottom)
            )
        )
        (footprint "Package:Top"
            (layer "F.Cu")
            (at 10 10 0)
            (property "Reference" "U1"
                (at 0 -2 0)
                (layer "F.SilkS")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (pad "1" smd rect
                (at 1 0 0)
                (size 2 1)
                (layers "F.Cu" "F.Mask" "F.Paste")
            )
            (pad "2" thru_hole circle
                (at -1 0 0)
                (size 1.4 1.4)
                (drill 0.7)
                (layers "*.Cu" "*.Mask")
            )
        )
        (footprint "Connector:Bottom"
            (layer "B.Cu")
            (at 20 20 30)
            (property "Reference" "J1"
                (at 1 2 45)
                (layer "B.SilkS")
                (effects
                    (font (size 1 1) (thickness 0.15))
                    (justify left bottom mirror)
                )
            )
            (fp_text value "BOTTOM_VALUE"
                (at -2 1 15)
                (layer "B.SilkS")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (fp_rect
                (start -1 -1)
                (end 1 1)
                (stroke (width 0.12) (type solid))
                (fill no)
                (layer "B.SilkS")
            )
            (pad "1" smd rect
                (at 1 0 0)
                (size 2 1)
                (layers "B.Cu" "B.Mask" "B.Paste")
            )
            (pad "2" thru_hole circle
                (at -1 0 90)
                (size 1.4 1.4)
                (drill 0.7)
                (layers "*.Cu" "*.Mask")
            )
        )
    )`
}

/**
 * Rounds a model point and rotation.
 * @param {{ x: number, y: number, rotation: number }} value
 * @returns {{ x: number, y: number, rotation: number }}
 */
function roundedPoint(value) {
    return {
        x: Number(value.x.toFixed(3)),
        y: Number(value.y.toFixed(3)),
        rotation: Number(value.rotation.toFixed(3))
    }
}
