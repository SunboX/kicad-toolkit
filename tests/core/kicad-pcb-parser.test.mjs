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

test('KicadPcbParser extracts footprint 3D model transforms', () => {
    const board = KicadPcbParser.parse(modelFootprintFixture(), {
        fileName: 'models.kicad_pcb'
    })

    assert.deepEqual(board.footprints[0].models, [
        {
            path: '${KIPRJMOD}/parts/body.step',
            name: 'body.step',
            offset: { x: 1.25, y: -2, z: 1.5 },
            scale: { x: 2, y: 3, z: 4 },
            rotation: { x: -90, y: 0, z: 90 },
            visible: true
        }
    ])
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
    assert.equal(board.pads.length, 5)
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
    assert.equal(pad2.rotation, 270)

    const pinOneMarker = bottomConnector.pads.find((pad) => pad.number === '3')
    assert.ok(pinOneMarker)
    assert.equal(pinOneMarker.shape, 'rect')
    assert.equal(pinOneMarker.side, 'both')
    assert.equal(pinOneMarker.rotation, 315)

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

test('KicadPcbParser resolves declared and named PCB nets onto primitives', () => {
    const board = KicadPcbParser.parse(netFixture(), {
        fileName: 'net-fixture.kicad_pcb'
    })

    assert.deepEqual(
        board.nets.map((net) => ({ netIndex: net.netIndex, name: net.name })),
        [
            { netIndex: 1, name: 'GND' },
            { netIndex: 2, name: '+3V3' },
            { netIndex: 3, name: 'SENSE' }
        ]
    )
    assert.equal(
        board.drawings.find((drawing) => drawing.type === 'segment')?.netName,
        'GND'
    )
    assert.equal(
        board.drawings.find((drawing) => drawing.type === 'via')?.netName,
        'SENSE'
    )
    assert.equal(
        board.drawings.find((drawing) => drawing.type === 'zone')?.netName,
        'GND'
    )
    assert.equal(board.pads.find((pad) => pad.number === '1')?.netName, '+3V3')
    assert.equal(board.pads.find((pad) => pad.number === '2')?.netName, 'GND')
})

test('KicadPcbParser extracts routed copper arcs and visible graphics', () => {
    const board = KicadPcbParser.parse(graphicsFixture(), {
        fileName: 'graphics-fixture.kicad_pcb'
    })

    const copperArc = board.drawings.find(
        (drawing) => drawing.sourceType === 'arc'
    )
    assert.ok(copperArc)
    assert.equal(copperArc.type, 'arc')
    assert.equal(copperArc.material, 'copper')
    assert.equal(copperArc.layer, 'F.Cu')
    assert.equal(copperArc.netName, 'GND')
    assert.equal(copperArc.strokeWidth, 0.25)

    assert.equal(
        board.drawings.find((drawing) => drawing.sourceType === 'gr_curve')
            ?.type,
        'curve'
    )
    assert.equal(
        board.drawings.find((drawing) => drawing.sourceType === 'fp_curve')
            ?.type,
        'curve'
    )
    assert.equal(
        board.drawings.find((drawing) => drawing.sourceType === 'gr_bbox')
            ?.type,
        'polygon'
    )
    assert.equal(
        board.drawings.find((drawing) => drawing.sourceType === 'gr_vector')
            ?.type,
        'line'
    )
    assert.equal(
        board.drawings.find((drawing) => drawing.sourceType === 'image')?.type,
        'image'
    )
    assert.equal(
        board.drawings.find((drawing) => drawing.sourceType === 'barcode')
            ?.text,
        'LOT-1'
    )
    assert.equal(
        board.drawings.find((drawing) => drawing.sourceType === 'dimension')
            ?.type,
        'dimension'
    )
    assert.equal(
        board.drawings.find((drawing) => drawing.sourceType === 'target')
            ?.shape,
        'plus'
    )
    assert.equal(
        board.drawings.find((drawing) => drawing.sourceType === 'point')?.size,
        0.8
    )
    assert.ok(board.texts.some((text) => text.value === 'BOX'))
    assert.ok(board.texts.some((text) => text.value === 'CELL'))
    assert.ok(board.texts.some((text) => text.value === '10 mm'))
    assert.deepEqual(
        board.groups.map((group) => group.name),
        ['G1']
    )
    assert.deepEqual(
        board.generatedItems.map((item) => item.type),
        ['tuning_pattern']
    )
})

test('KicadPcbParser extracts KiCad pad detail and padstack data', () => {
    const board = KicadPcbParser.parse(padDetailFixture(), {
        fileName: 'pad-detail-fixture.kicad_pcb'
    })
    const pad = board.pads.find((entry) => entry.number === '1')

    assert.ok(pad)
    assert.equal(pad.shape, 'custom')
    assert.equal(pad.pinFunction, 'GPIO0')
    assert.equal(pad.pinType, 'bidirectional')
    assert.equal(pad.drillShape, 'oval')
    assert.equal(pad.drillWidth, 0.45)
    assert.equal(pad.drillHeight, 0.9)
    assert.deepEqual(pad.drillOffset, { x: 0.1, y: -0.05 })
    assert.deepEqual(pad.rectDelta, { x: 0.2, y: -0.1 })
    assert.deepEqual(pad.backdrill, {
        size: 0.7,
        layers: ['F.Cu', 'In1.Cu']
    })
    assert.deepEqual(pad.frontPostMachining, {
        mode: 'counterbore',
        size: 0.8,
        depth: 0.2,
        angle: 90
    })
    assert.equal(pad.solderMaskMargin, 0.05)
    assert.equal(pad.solderPasteMargin, -0.02)
    assert.equal(pad.solderPasteMarginRatio, -0.1)
    assert.equal(pad.clearance, 0.15)
    assert.equal(pad.zoneConnect, 2)
    assert.equal(pad.thermalBridgeWidth, 0.35)
    assert.equal(pad.thermalBridgeAngle, 45)
    assert.equal(pad.thermalGap, 0.22)
    assert.equal(pad.chamferRatio, 0.2)
    assert.deepEqual(pad.chamfers, ['top_left', 'bottom_right'])
    assert.deepEqual(pad.padProperties, [
        'pad_prop_testpoint',
        'pad_prop_castellated'
    ])
    assert.deepEqual(pad.options, {
        anchor: 'circle',
        clearance: 'outline'
    })
    assert.deepEqual(pad.teardrops, {
        enabled: true,
        allowTwoSegments: true,
        preferZoneConnections: false,
        bestLengthRatio: 0.6,
        maxLength: 0.8,
        bestWidthRatio: 0.7,
        maxWidth: 0.5,
        curvedEdges: true,
        filterRatio: 0.3
    })
    assert.deepEqual(pad.zoneLayerConnections, ['F.Cu', 'B.Cu'])
    assert.deepEqual(pad.tenting, { front: true, back: true })
    assert.equal(pad.customPrimitives.length, 2)
    assert.deepEqual(
        pad.padstack.layers.map((layer) => ({
            layer: layer.layer,
            shape: layer.shape,
            size: layer.size,
            offset: layer.offset,
            rectDelta: layer.rectDelta,
            zoneConnect: layer.zoneConnect
        })),
        [
            {
                layer: 'F.Cu',
                shape: 'roundrect',
                size: { width: 1.8, height: 1.1 },
                offset: { x: 0.04, y: 0.05 },
                rectDelta: { x: 0.1, y: -0.1 },
                zoneConnect: 1
            },
            {
                layer: 'Inner',
                shape: 'circle',
                size: { width: 1.5, height: 1 },
                offset: { x: 0, y: 0 },
                rectDelta: { x: 0, y: 0 },
                zoneConnect: null
            },
            {
                layer: 'B.Cu',
                shape: 'oval',
                size: { width: 1.2, height: 0.8 },
                offset: { x: -0.03, y: 0.02 },
                rectDelta: { x: 0, y: 0 },
                zoneConnect: null
            }
        ]
    )
})

test('KicadPcbParser extracts KiCad footprint BOM attributes and properties', () => {
    const board = KicadPcbParser.parse(footprintAttributeFixture(), {
        fileName: 'footprint-attribute-fixture.kicad_pcb'
    })
    const byReference = new Map(
        board.footprints.map((footprint) => [footprint.reference, footprint])
    )

    assert.deepEqual(
        {
            value: byReference.get('R1').value,
            footprintProperty: byReference.get('R1').properties.Footprint,
            manufacturer: byReference.get('R1').properties.Manufacturer,
            isSmd: byReference.get('R1').isSmd
        },
        {
            value: '10k',
            footprintProperty: 'Resistor_SMD:R_0603',
            manufacturer: 'Example Parts',
            isSmd: true
        }
    )
    assert.equal(byReference.get('J1').value, '')
    assert.equal(byReference.get('J1').properties.Value, undefined)
    assert.equal(byReference.get('C1').excludeFromPositionFiles, true)
    assert.equal(byReference.get('U2').excludeFromBom, true)
    assert.equal(byReference.get('D1').doNotPopulate, true)
    assert.equal(byReference.get('TP1').boardOnly, true)
    assert.equal(byReference.get('LOGO1').excludeFromPositionFiles, true)
    assert.equal(byReference.get('LOGO1').excludeFromBom, true)
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
            (pad "3" thru_hole rect
                (at 0 -1 45)
                (size 0.85 0.85)
                (drill 0.5)
                (layers "*.Cu" "*.Mask")
            )
        )
    )`
}

/**
 * Builds a fake KiCad board fixture with footprint attributes and fields.
 * @returns {string}
 */
function footprintAttributeFixture() {
    return `(kicad_pcb
        (version 20250101)
        (gr_rect
            (start 0 0)
            (end 50 20)
            (stroke (width 0.1) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
        ${attributeFootprint('R1', 'Resistor_SMD:R_0603', 'smd', '10k', '(property "Manufacturer" "Example Parts" (at 0 2 0) (layer "F.Fab") (effects (font (size 1 1))))')}
        ${attributeFootprint('J1', 'Connector:Pin_1x02', 'through_hole', '')}
        ${attributeFootprint('C1', 'Capacitor_SMD:C_0603', 'smd exclude_from_pos_files', '100n')}
        ${attributeFootprint('U2', 'Package_QFN:QFN-32', 'smd exclude_from_bom', 'MCU')}
        ${attributeFootprint('D1', 'LED_SMD:LED_0603', 'smd dnp', 'RED')}
        ${attributeFootprint('TP1', 'TestPoint:Pad_1mm', 'board_only', 'TEST')}
        ${attributeFootprint('LOGO1', 'Symbol:Logo', 'virtual', 'LOGO')}
    )`
}

/**
 * Builds a minimal board fixture with footprint model metadata.
 * @returns {string}
 */
function modelFootprintFixture() {
    return `(kicad_pcb
        (version 20241229)
        (footprint "Fixture:Body"
            (layer "F.Cu")
            (at 1 2 90)
            (property "Reference" "U1"
                (at 0 0 0)
                (layer "F.SilkS")
                (effects (font (size 1 1)))
            )
            (property "Value" "Body"
                (at 0 1 0)
                (layer "F.Fab")
                (effects (font (size 1 1)))
            )
            (model "\${KIPRJMOD}/parts/body.step"
                (offset (xyz 1.25 -2 1.5))
                (scale (xyz 2 3 4))
                (rotate (xyz -90 0 90))
            )
        )
    )`
}

/**
 * Builds one fake footprint with common properties.
 * @param {string} reference Reference.
 * @param {string} footprintName Footprint library ID.
 * @param {string} attrs Attribute tokens.
 * @param {string} value Value property text.
 * @param {string} [extraProperties] Extra property nodes.
 * @returns {string}
 */
function attributeFootprint(
    reference,
    footprintName,
    attrs,
    value,
    extraProperties = ''
) {
    const valueProperty = value
        ? `(property "Value" "${value}" (at 0 1 0) (layer "F.Fab") (effects (font (size 1 1))))`
        : ''

    return `(footprint "${footprintName}"
        (layer "F.Cu")
        (at 5 5 0)
        (attr ${attrs})
        (property "Reference" "${reference}" (at 0 0 0) (layer "F.SilkS") (effects (font (size 1 1))))
        ${valueProperty}
        (property "Footprint" "${footprintName}" (at 0 3 0) (layer "F.Fab") (effects (font (size 1 1))))
        ${extraProperties}
    )`
}

/**
 * Builds a fake KiCad board fixture with declared and named nets.
 * @returns {string}
 */
function netFixture() {
    return `(kicad_pcb
        (version 20241229)
        (net 0 "")
        (net 1 "GND")
        (net 2 "+3V3")
        (gr_poly
            (pts (xy 0 0) (xy 20 0) (xy 20 12) (xy 0 12))
            (stroke (width 0.1) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
        (segment
            (start 1 1)
            (end 8 1)
            (width 0.25)
            (layer "F.Cu")
            (net 1)
        )
        (via
            (at 8 6)
            (size 1)
            (drill 0.4)
            (layers "F.Cu" "B.Cu")
            (net "SENSE")
        )
        (zone
            (net 1)
            (net_name "GND")
            (layer "B.Cu")
            (filled_polygon
                (layer "B.Cu")
                (pts (xy 2 3) (xy 7 3) (xy 7 6) (xy 2 6))
            )
        )
        (footprint "Package:NetPart"
            (layer "F.Cu")
            (at 10 6 0)
            (property "Reference" "U1"
                (at 0 -2 0)
                (layer "F.SilkS")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (pad "1" smd rect
                (at -1 0 0)
                (size 1 1)
                (layers "F.Cu" "F.Mask" "F.Paste")
                (net 2 "+3V3")
            )
            (pad "2" smd rect
                (at 1 0 0)
                (size 1 1)
                (layers "F.Cu" "F.Mask" "F.Paste")
                (net "GND")
            )
        )
    )`
}

/**
 * Builds a fake KiCad board fixture with routed arcs and visible graphics.
 * @returns {string}
 */
function graphicsFixture() {
    return `(kicad_pcb
        (version 20250101)
        (net 1 "GND")
        (gr_poly
            (pts (xy 0 0) (xy 28 0) (xy 28 16) (xy 0 16))
            (stroke (width 0.1) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
        (arc
            (start 1 1)
            (mid 3 3)
            (end 5 1)
            (width 0.25)
            (layer "F.Cu")
            (net 1)
        )
        (gr_curve
            (pts (xy 1 8) (xy 2 6) (xy 4 6) (xy 5 8))
            (stroke (width 0.2) (type solid))
            (layer "F.SilkS")
        )
        (gr_bbox
            (start 6 6)
            (end 8 7)
            (stroke (width 0.1) (type solid))
            (fill no)
            (layer "F.SilkS")
        )
        (gr_vector
            (start 8 8)
            (end 10 8)
            (width 0.12)
            (layer "F.SilkS")
        )
        (gr_text_box "BOX"
            (start 10 2)
            (end 14 4)
            (stroke (width 0.1) (type solid))
            (border yes)
            (layer "F.SilkS")
            (effects
                (font (size 1 1) (thickness 0.1))
                (justify left top)
            )
        )
        (table
            (layer "F.SilkS")
            (column_count 1)
            (column_widths 4)
            (row_heights 2)
            (cells
                (table_cell "CELL"
                    (start 15 2)
                    (end 19 4)
                    (layer "F.SilkS")
                    (effects
                        (font (size 1 1) (thickness 0.1))
                        (justify left top)
                    )
                )
            )
        )
        (dimension
            (type aligned)
            (layer "F.SilkS")
            (pts (xy 1 12) (xy 8 12))
            (gr_text "10 mm"
                (at 4 13 0)
                (layer "F.SilkS")
                (effects (font (size 1 1) (thickness 0.1)))
            )
        )
        (image
            (at 20 10)
            (scale 1)
            (layer "F.SilkS")
            (data "iVBORw0KGgo=")
        )
        (barcode
            (at 2 10 0)
            (size 3 2)
            (text "LOT-1")
            (text_height 0.5)
            (type qr)
            (layer "F.SilkS")
        )
        (target plus
            (at 16 10)
            (size 2)
            (width 0.1)
            (layer "F.SilkS")
        )
        (point
            (at 19 10)
            (size 0.8)
            (layer "F.SilkS")
        )
        (group "G1"
            (uuid 11111111-1111-1111-1111-111111111111)
            (members 22222222-2222-2222-2222-222222222222)
        )
        (generated
            (type tuning_pattern)
            (uuid 33333333-3333-3333-3333-333333333333)
            (members 44444444-4444-4444-4444-444444444444)
        )
        (footprint "Package:CurvePart"
            (layer "F.Cu")
            (at 14 10 0)
            (property "Reference" "U1"
                (at 0 -2 0)
                (layer "F.SilkS")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (fp_curve
                (pts (xy -2 1) (xy -1 0) (xy 1 0) (xy 2 1))
                (stroke (width 0.15) (type solid))
                (layer "F.SilkS")
            )
        )
    )`
}

/**
 * Builds a fake KiCad board fixture with detailed pad syntax.
 * @returns {string}
 */
function padDetailFixture() {
    return `(kicad_pcb
        (version 20250101)
        (net 1 "GPIO0")
        (gr_poly
            (pts (xy 0 0) (xy 12 0) (xy 12 8) (xy 0 8))
            (stroke (width 0.1) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
        (footprint "Package:PadDetail"
            (layer "F.Cu")
            (at 6 4 0)
            (property "Reference" "U1"
                (at 0 -2 0)
                (layer "F.SilkS")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (pad "1" thru_hole custom
                (at 0 0 30)
                (size 1.6 1.2)
                (rect_delta 0.2 -0.1)
                (drill oval 0.45 0.9 (offset 0.1 -0.05))
                (backdrill
                    (size 0.7)
                    (layers "F.Cu" "In1.Cu")
                )
                (front_post_machining counterbore
                    (size 0.8)
                    (depth 0.2)
                    (angle 90)
                )
                (layers "F.Cu" "In1.Cu" "B.Cu" "F.Mask" "B.Mask")
                (net 1 "GPIO0")
                (pinfunction "GPIO0")
                (pintype "bidirectional")
                (solder_mask_margin 0.05)
                (solder_paste_margin -0.02)
                (solder_paste_margin_ratio -0.1)
                (clearance 0.15)
                (teardrops
                    (enabled yes)
                    (allow_two_segments yes)
                    (prefer_zone_connections yes)
                    (best_length_ratio 0.6)
                    (max_length 0.8)
                    (best_width_ratio 0.7)
                    (max_width 0.5)
                    (curved_edges yes)
                    (filter_ratio 0.3)
                )
                (zone_connect 2)
                (thermal_bridge_width 0.35)
                (thermal_bridge_angle 45)
                (thermal_gap 0.22)
                (roundrect_rratio 0.25)
                (chamfer_ratio 0.2)
                (chamfer top_left bottom_right)
                (property pad_prop_testpoint pad_prop_castellated)
                (options
                    (anchor circle)
                    (clearance outline)
                )
                (primitives
                    (gr_line
                        (start -0.4 0)
                        (end 0.4 0)
                        (stroke (width 0.1) (type solid))
                        (layer "F.Cu")
                    )
                    (gr_circle
                        (center 0 0)
                        (end 0.2 0)
                        (stroke (width 0.05) (type solid))
                        (fill no)
                        (layer "F.Cu")
                    )
                )
                (remove_unused_layers yes)
                (keep_end_layers yes)
                (tenting front back)
                (zone_layer_connections "F.Cu" "B.Cu")
                (padstack
                    (mode custom)
                    (layer "F.Cu"
                        (shape roundrect)
                        (size 1.8 1.1)
                        (offset 0.04 0.05)
                        (rect_delta 0.1 -0.1)
                        (roundrect_rratio 0.2)
                        (chamfer_ratio 0.15)
                        (chamfer top_left top_right)
                        (thermal_bridge_width 0.3)
                        (thermal_gap 0.18)
                        (thermal_bridge_angle 30)
                        (zone_connect 1)
                        (clearance 0.12)
                        (tenting front back)
                    )
                    (layer "Inner"
                        (shape circle)
                        (size 1.5 1.0)
                    )
                    (layer "B.Cu"
                        (shape oval)
                        (size 1.2 0.8)
                        (offset -0.03 0.02)
                    )
                )
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
