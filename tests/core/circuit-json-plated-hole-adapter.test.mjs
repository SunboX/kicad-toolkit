// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { CircuitJsonDocument } from 'circuitjson-toolkit'
import {
    CircuitJsonModelAdapter,
    KicadParser
} from '../../src/legacy-parser.mjs'

/**
 * Encodes fixture text as an ArrayBuffer.
 * @param {string} source Fixture source.
 * @returns {ArrayBuffer} Encoded source bytes.
 */
function bytesFor(source) {
    const buffer = Buffer.from(source, 'utf8')
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
    )
}

/**
 * Builds a neutral standalone footprint with independent copper and drill axes.
 * @returns {string} KiCad footprint source.
 */
function standaloneDrillFixture() {
    return `
        (footprint "Neutral:Drilled_Pads"
            (version 20240108)
            (generator "kicad-toolkit-test")
            (layer "F.Cu")
            (pad "1" thru_hole oval
                (at -2 0 30)
                (size 2 1)
                (drill oval 0.6 1.6)
                (layers "*.Cu" "*.Mask")
            )
            (pad "2" thru_hole custom
                (at 2 1 30)
                (size 2 1.4)
                (drill oval 0.6 1.6 (offset 0.3 -0.2))
                (layers "*.Cu" "*.Mask")
                (options
                    (clearance outline)
                    (anchor rect)
                )
                (primitives
                    (gr_poly
                        (pts
                            (xy -1 -0.5)
                            (xy 1 -0.5)
                            (xy 1 0.5)
                            (xy -1 0.5)
                        )
                        (width 0)
                        (fill yes)
                    )
                )
            )
        )
    `
}

/**
 * Converts one neutral renderer-model pad and returns its canonical hole row.
 * @param {Record<string, unknown>} pad Pad fields under test.
 * @returns {Record<string, unknown>} Generated CircuitJSON hole row.
 */
function holeForPad(pad) {
    const circuitJson = CircuitJsonModelAdapter.fromRendererModel({
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileType: 'kicad_pcb',
        fileName: 'neutral-drill-geometry.kicad_pcb',
        summary: {
            title: 'Neutral Drill Geometry',
            boardWidthMil: 400,
            boardHeightMil: 300,
            layerCount: 2
        },
        diagnostics: [],
        pcb: {
            boardOutline: {
                widthMil: 400,
                heightMil: 300,
                minX: 0,
                minY: 0
            },
            components: [
                {
                    componentIndex: 1,
                    designator: 'X1',
                    x: 200,
                    y: 150,
                    layer: 'TOP'
                }
            ],
            pads: [
                {
                    componentIndex: 1,
                    number: '1',
                    x: 200,
                    y: 150,
                    sizeTopX: 120,
                    sizeTopY: 60,
                    shapeTopName: 'oval',
                    holeDiameter: 40,
                    isPlated: true,
                    ...pad
                }
            ],
            tracks: [],
            vias: []
        }
    })
    const hole = circuitJson.find((element) =>
        ['pcb_hole', 'pcb_plated_hole'].includes(element.type)
    )

    assert.ok(hole)
    assert.deepEqual(CircuitJsonDocument.validateModel([hole]), [])
    return hole
}

test('CircuitJsonModelAdapter preserves oval copper around a circular drill', () => {
    const platedHole = holeForPad({
        rotation: 90,
        drillShape: 'circle'
    })

    assert.deepEqual(
        {
            shape: platedHole.shape,
            padShape: platedHole.pad_shape,
            width: platedHole.rect_pad_width,
            height: platedHole.rect_pad_height,
            rotation: platedHole.rect_ccw_rotation,
            borderRadius: platedHole.rect_border_radius,
            holeShape: platedHole.hole_shape,
            holeDiameter: platedHole.hole_diameter
        },
        {
            shape: 'circular_hole_with_rect_pad',
            padShape: 'rect',
            width: 3.048,
            height: 1.524,
            rotation: 90,
            borderRadius: 0.762,
            holeShape: 'circle',
            holeDiameter: 1.016
        }
    )
})

test('CircuitJsonModelAdapter preserves an axis-aligned slot inside oval copper', () => {
    const platedHole = holeForPad({
        rotation: 0,
        drillShape: 'oval',
        holeSlotLength: 80,
        holeRotation: 0
    })

    assert.deepEqual(
        {
            shape: platedHole.shape,
            padShape: platedHole.pad_shape,
            width: platedHole.rect_pad_width,
            height: platedHole.rect_pad_height,
            borderRadius: platedHole.rect_border_radius,
            holeShape: platedHole.hole_shape,
            holeWidth: platedHole.hole_width,
            holeHeight: platedHole.hole_height
        },
        {
            shape: 'pill_hole_with_rect_pad',
            padShape: 'rect',
            width: 3.048,
            height: 1.524,
            borderRadius: 0.762,
            holeShape: 'pill',
            holeWidth: 2.032,
            holeHeight: 1.016
        }
    )
})

test('CircuitJsonModelAdapter preserves independent oval copper and slot rotations', () => {
    const platedHole = holeForPad({
        rotation: 30,
        drillShape: 'oval',
        holeSlotLength: 80,
        holeRotation: 90
    })

    assert.deepEqual(
        {
            shape: platedHole.shape,
            padShape: platedHole.pad_shape,
            width: platedHole.rect_pad_width,
            height: platedHole.rect_pad_height,
            rotation: platedHole.rect_ccw_rotation,
            borderRadius: platedHole.rect_border_radius,
            holeShape: platedHole.hole_shape,
            holeWidth: platedHole.hole_width,
            holeHeight: platedHole.hole_height,
            holeRotation: platedHole.hole_ccw_rotation
        },
        {
            shape: 'rotated_pill_hole_with_rect_pad',
            padShape: 'rect',
            width: 3.048,
            height: 1.524,
            rotation: 30,
            borderRadius: 0.762,
            holeShape: 'rotated_pill',
            holeWidth: 2.032,
            holeHeight: 1.016,
            holeRotation: 120
        }
    )
})

test('CircuitJsonModelAdapter preserves a slot independently of rectangular copper', () => {
    const platedHole = holeForPad({
        shapeTopName: 'rect',
        sizeTopX: 120,
        sizeTopY: 80,
        rotation: 0,
        drillShape: 'oval',
        holeSlotLength: 60,
        holeDiameter: 30,
        holeRotation: 0
    })

    assert.deepEqual(
        {
            shape: platedHole.shape,
            padShape: platedHole.pad_shape,
            width: platedHole.rect_pad_width,
            height: platedHole.rect_pad_height,
            borderRadius: platedHole.rect_border_radius,
            holeShape: platedHole.hole_shape,
            holeWidth: platedHole.hole_width,
            holeHeight: platedHole.hole_height
        },
        {
            shape: 'pill_hole_with_rect_pad',
            padShape: 'rect',
            width: 3.048,
            height: 2.032,
            borderRadius: 0,
            holeShape: 'pill',
            holeWidth: 1.524,
            holeHeight: 0.762
        }
    )
})

test('CircuitJsonModelAdapter preserves a rotated non-plated slot', () => {
    const hole = holeForPad({
        rotation: 30,
        drillShape: 'oval',
        holeSlotLength: 80,
        holeRotation: 90,
        isPlated: false
    })

    assert.deepEqual(
        {
            type: hole.type,
            holeShape: hole.hole_shape,
            holeWidth: hole.hole_width,
            holeHeight: hole.hole_height,
            rotation: hole.ccw_rotation
        },
        {
            type: 'pcb_hole',
            holeShape: 'rotated_pill',
            holeWidth: 2.032,
            holeHeight: 1.016,
            rotation: 120
        }
    )
})

test('CircuitJsonModelAdapter emits polygon copper and rotated local drill offsets', () => {
    const platedHole = holeForPad({
        shapeTopName: 'custom',
        rotation: 30,
        drillShape: 'oval',
        holeSlotLength: 80,
        holeRotation: 90,
        drillOffset: { x: 0.3, y: -0.2 },
        points: [
            { x: 4.5, y: 3.5 },
            { x: 5.6, y: 3.4 },
            { x: 5.7, y: 4.1 },
            { x: 4.4, y: 4.2 }
        ]
    })

    assert.deepEqual(
        {
            shape: platedHole.shape,
            outline: platedHole.pad_outline,
            holeShape: platedHole.hole_shape,
            holeWidth: platedHole.hole_width,
            holeHeight: platedHole.hole_height,
            holeRotation: platedHole.ccw_rotation,
            offsetX: platedHole.hole_offset_x,
            offsetY: platedHole.hole_offset_y
        },
        {
            shape: 'hole_with_polygon_pad',
            outline: [
                { x: 4.5, y: 3.5 },
                { x: 5.6, y: 3.4 },
                { x: 5.7, y: 4.1 },
                { x: 4.4, y: 4.2 }
            ],
            holeShape: 'rotated_pill',
            holeWidth: 2.032,
            holeHeight: 1.016,
            holeRotation: 120,
            offsetX: 0.359808,
            offsetY: -0.023205
        }
    )
})

test('KicadParser preserves a standalone vertical slot relative to pad rotation', () => {
    const circuitJson = KicadParser.parseArrayBuffer(
        'neutral-drilled-pads.kicad_mod',
        bytesFor(standaloneDrillFixture())
    )
    const [platedSlot] = circuitJson.filter(
        (element) => element.type === 'pcb_plated_hole'
    )

    assert.ok(platedSlot)
    assert.equal(platedSlot.shape, 'rotated_pill_hole_with_rect_pad')
    assert.equal(platedSlot.rect_ccw_rotation, 30)
    assert.equal(platedSlot.hole_ccw_rotation, 120)
    assert.equal(platedSlot.hole_width, 1.6)
    assert.equal(platedSlot.hole_height, 0.6)
})

test('KicadParser preserves standalone custom copper and rotated drill offset', () => {
    const circuitJson = KicadParser.parseArrayBuffer(
        'neutral-drilled-pads.kicad_mod',
        bytesFor(standaloneDrillFixture())
    )
    const platedHoles = circuitJson.filter(
        (element) => element.type === 'pcb_plated_hole'
    )
    const customHole = platedHoles[1]

    assert.ok(customHole)
    assert.equal(customHole.shape, 'hole_with_polygon_pad')
    assert.equal(customHole.hole_shape, 'rotated_pill')
    assert.equal(customHole.ccw_rotation, 120)
    assert.equal(customHole.hole_width, 1.6)
    assert.equal(customHole.hole_height, 0.6)
    assert.equal(customHole.hole_offset_x, 0.359808)
    assert.equal(customHole.hole_offset_y, -0.023205)
    assert.deepEqual(customHole.pad_outline, [
        { x: 1.383975, y: 0.066987 },
        { x: 3.116025, y: 1.066987 },
        { x: 2.616025, y: 1.933013 },
        { x: 0.883975, y: 0.933013 }
    ])
    assert.deepEqual(CircuitJsonDocument.validateModel([...circuitJson]), [])
})
