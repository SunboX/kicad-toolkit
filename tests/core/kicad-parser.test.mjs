// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadParser, NormalizedModelSchema } from '../../src/parser.mjs'

test('KicadParser wraps .kicad_pcb files in the ECAD Forge document model', () => {
    const document = KicadParser.parseArrayBuffer(
        'panel.kicad_pcb',
        bytesFor(minimalPcbSource())
    )

    assert.equal(document.sourceFormat, 'kicad')
    assert.equal(document.schema, NormalizedModelSchema.CURRENT_SCHEMA_ID)
    assert.equal(document.kind, 'pcb')
    assert.equal(document.fileType, 'kicad_pcb')
    assert.equal(document.fileName, 'panel.kicad_pcb')
    assert.equal(document.summary.componentCount, 1)
    assert.equal(document.summary.boardWidthMil, 1181)
    assert.equal(document.pcb.kicadBoard.title, 'Panel')
    assert.equal(document.pcb.components[0].designator, 'U1')
    assert.equal(document.pcb.pads.length, 1)
    assert.deepEqual(document.bom[0].designators, ['U1'])
})

test('KicadParser exposes declared PCB metadata in the renderer model', () => {
    const document = KicadParser.parseArrayBuffer(
        'metadata.kicad_pcb',
        bytesFor(metadataPcbSource())
    )

    assert.equal(document.summary.layerCount, 3)
    assert.deepEqual(document.pcb.layerDefinitions, [
        {
            ordinal: 0,
            name: 'F.Cu',
            type: 'signal',
            userName: '',
            uuid: ''
        },
        {
            ordinal: 31,
            name: 'B.Cu',
            type: 'signal',
            userName: '',
            uuid: ''
        },
        {
            ordinal: 32,
            name: 'B.User',
            type: 'user',
            userName: 'Back user',
            uuid: ''
        }
    ])
    assert.equal(document.pcb.kicadBoard.setup.pcbPlotParams.layerselection, 3)
    assert.equal(document.pcb.kicadBoard.footprints[0].sourceType, 'module')
    assert.equal(document.pcb.components[0].designator, 'M1')
})

test('KicadParser preserves PCB text font faces for fidelity diagnostics', () => {
    const document = KicadParser.parseArrayBuffer(
        'font-face.kicad_pcb',
        bytesFor(`
            (kicad_pcb
                (version 20240108)
                (generator "kicad-toolkit-test")
                (layers
                    (0 "F.Cu" signal)
                    (37 "F.SilkS" user)
                    (44 "Edge.Cuts" user)
                )
                (gr_text "FACE"
                    (at 0 0 0)
                    (layer "F.SilkS")
                    (effects (font (face "Inter") (size 1 1)))
                )
            )
        `)
    )

    assert.equal(document.pcb.texts[0].fontFace, 'Inter')
    assert.deepEqual(
        document.pcb.fidelityDiagnostics.diagnostics.map(
            (diagnostic) => diagnostic.code
        ),
        ['kicad.pcb.fidelity.missing-font-face']
    )
})

test('KicadParser exposes KiCad footprint model metadata on PCB components', () => {
    const document = KicadParser.parseArrayBuffer(
        'models.kicad_pcb',
        bytesFor(modelPcbSource())
    )
    const component = document.pcb.components[0]

    assert.equal(component.modelName, 'body.step')
    assert.equal(component.modelPath, '${KIPRJMOD}/parts/body.step')
    assert.deepEqual(component.modelTransform, {
        rotationDeg: { x: -90, y: 0, z: 90 },
        offsetMil: {
            x: 49.21259842519685,
            y: -78.74015748031496,
            z: 59.05511811023622
        },
        dxMil: 49.21259842519685,
        dyMil: -78.74015748031496,
        dzMil: 59.05511811023622,
        scale: { x: 2, y: 3, z: 4 }
    })
})

test('KicadParser exposes Altium-style PCB nets and primitive net names', () => {
    const document = KicadParser.parseArrayBuffer(
        'nets.kicad_pcb',
        bytesFor(netPcbSource())
    )

    assert.equal(document.summary.netCount, 3)
    assert.deepEqual(
        document.pcb.nets.map((net) => ({
            netIndex: net.netIndex,
            name: net.name
        })),
        [
            { netIndex: 1, name: 'GND' },
            { netIndex: 2, name: '+3V3' },
            { netIndex: 3, name: 'SENSE' }
        ]
    )
    assert.equal(document.pcb.tracks[0].netName, 'GND')
    assert.equal(document.pcb.tracks[0].netIndex, 1)
    assert.equal(document.pcb.vias[0].netName, 'SENSE')
    assert.equal(document.pcb.pads[0].netName, '+3V3')
    assert.equal(document.pcb.pads[0].netIndex, 2)
    assert.equal(document.pcb.pads[1].netName, 'GND')
    assert.equal(document.pcb.polygons[1].netName, 'GND')
})

test('KicadParser exposes routed copper arcs in the Altium-style PCB model', () => {
    const document = KicadParser.parseArrayBuffer(
        'arcs.kicad_pcb',
        bytesFor(copperArcPcbSource())
    )

    assert.equal(document.summary.arcCount, 1)
    assert.equal(document.pcb.arcs.length, 1)
    assert.deepEqual(
        {
            x: Math.round(document.pcb.arcs[0].x),
            y: Math.round(document.pcb.arcs[0].y),
            radius: Math.round(document.pcb.arcs[0].radius),
            width: Math.round(document.pcb.arcs[0].width),
            netIndex: document.pcb.arcs[0].netIndex,
            netName: document.pcb.arcs[0].netName
        },
        {
            x: 118,
            y: 39,
            radius: 79,
            width: 10,
            netIndex: 1,
            netName: 'GND'
        }
    )
})

test('KicadParser exposes detailed KiCad pads in the Altium-style PCB model', () => {
    const document = KicadParser.parseArrayBuffer(
        'pad-details.kicad_pcb',
        bytesFor(padDetailPcbSource())
    )
    const pad = document.pcb.pads[0]

    assert.deepEqual(
        {
            sizeTopX: Math.round(pad.sizeTopX),
            sizeTopY: Math.round(pad.sizeTopY),
            sizeMidX: Math.round(pad.sizeMidX),
            sizeMidY: Math.round(pad.sizeMidY),
            sizeBottomX: Math.round(pad.sizeBottomX),
            sizeBottomY: Math.round(pad.sizeBottomY),
            shapeTop: pad.shapeTop,
            shapeMid: pad.shapeMid,
            shapeBottom: pad.shapeBottom,
            holeDiameter: Math.round(pad.holeDiameter),
            holeShape: pad.holeShape,
            holeSlotLength: Math.round(pad.holeSlotLength),
            holeRotation: pad.holeRotation,
            offsetTopX: Math.round(pad.offsetTopX),
            offsetTopY: Math.round(pad.offsetTopY),
            padMode: pad.padMode,
            planeConnectionStyle: pad.planeConnectionStyle
        },
        {
            sizeTopX: 71,
            sizeTopY: 43,
            sizeMidX: 59,
            sizeMidY: 39,
            sizeBottomX: 47,
            sizeBottomY: 31,
            shapeTop: 4,
            shapeMid: 1,
            shapeBottom: 2,
            holeDiameter: 18,
            holeShape: 2,
            holeSlotLength: 35,
            holeRotation: 90,
            offsetTopX: 2,
            offsetTopY: 2,
            padMode: 2,
            planeConnectionStyle: 2
        }
    )
    assert.equal(Math.round(pad.thermalReliefConductorWidth), 14)
    assert.equal(Math.round(pad.thermalReliefAirGap), 9)
    assert.equal(Math.round(pad.powerPlaneClearance), 6)
    assert.equal(Math.round(pad.solderMaskExpansion), 2)
    assert.equal(Math.round(pad.pasteMaskExpansion), -1)
    assert.equal(Math.round(pad.x), 236)
    assert.equal(Math.round(pad.y), 157)
    assert.equal(pad.pinFunction, 'GPIO0')
    assert.equal(pad.pinType, 'bidirectional')
    assert.equal(pad.isTestFabTop, true)
    assert.deepEqual(pad.layerShapes, [
        { layerNumber: 1, shape: 4 },
        { layerNumber: 2, shape: 1 },
        { layerNumber: 32, shape: 2 }
    ])
    assert.deepEqual(pad.innerLayerSizes, [
        { layerNumber: 2, width: 59.05511811023622, height: 39.37007874015748 }
    ])
    assert.equal(pad.customPrimitives.length, 2)
})

test('KicadParser keeps one-sided pad copper off the opposite face', () => {
    const document = KicadParser.parseArrayBuffer(
        'one-sided-pads.kicad_pcb',
        bytesFor(oneSidedPadPcbSource())
    )
    const [frontPad, backPad, throughPad] = document.pcb.pads

    assert.deepEqual(
        {
            frontTop: Math.round(frontPad.sizeTopX),
            frontBottom: Math.round(frontPad.sizeBottomX),
            backTop: Math.round(backPad.sizeTopX),
            backBottom: Math.round(backPad.sizeBottomX),
            throughTop: Math.round(throughPad.sizeTopX),
            throughBottom: Math.round(throughPad.sizeBottomX)
        },
        {
            frontTop: 39,
            frontBottom: 0,
            backTop: 0,
            backBottom: 39,
            throughTop: 47,
            throughBottom: 47
        }
    )
})

test('KicadParser builds BOM rows from KiCad footprint BOM attributes', () => {
    const document = KicadParser.parseArrayBuffer(
        'footprint-attributes.kicad_pcb',
        bytesFor(footprintAttributePcbSource())
    )
    const componentByDesignator = new Map(
        document.pcb.components.map((component) => [
            component.designator,
            component
        ])
    )

    assert.deepEqual(
        document.bom.map((row) => ({
            designators: row.designators,
            pattern: row.pattern,
            source: row.source,
            value: row.value
        })),
        [
            {
                designators: ['C1'],
                pattern: 'Capacitor_SMD:C_0603',
                source: 'Capacitor_SMD:C_0603',
                value: '100n'
            },
            {
                designators: ['D1'],
                pattern: 'LED_SMD:LED_0603',
                source: 'LED_SMD:LED_0603',
                value: 'RED'
            },
            {
                designators: ['J1'],
                pattern: 'Connector:Pin_1x02',
                source: 'Connector:Pin_1x02',
                value: ''
            },
            {
                designators: ['R1'],
                pattern: 'Resistor_SMD:R_0603',
                source: 'Resistor_SMD:R_0603',
                value: '10k'
            },
            {
                designators: ['TP1'],
                pattern: 'TestPoint:Pad_1mm',
                source: 'TestPoint:Pad_1mm',
                value: 'TEST'
            }
        ]
    )
    assert.equal(document.summary.bomRowCount, 5)
    assert.equal(componentByDesignator.get('C1').excludeFromPositionFiles, true)
    assert.equal(componentByDesignator.get('U2').excludeFromBom, true)
    assert.equal(componentByDesignator.get('D1').doNotPopulate, true)
    assert.equal(componentByDesignator.get('TP1').boardOnly, true)
    assert.equal(componentByDesignator.get('R1').value, '10k')
    assert.equal(componentByDesignator.get('J1').value, '')
    assert.equal(
        componentByDesignator.get('R1').properties.Manufacturer,
        'Example Parts'
    )
})

test('KicadParser parses .kicad_sch files into schematic document models', () => {
    const document = KicadParser.parseArrayBuffer(
        'root.kicad_sch',
        bytesFor(rootSchematicSource())
    )

    assert.equal(document.sourceFormat, 'kicad')
    assert.equal(document.schema, NormalizedModelSchema.CURRENT_SCHEMA_ID)
    assert.equal(document.kind, 'schematic')
    assert.equal(document.fileType, 'kicad_sch')
    assert.equal(document.summary.title, 'Root Sheet')
    assert.equal(document.schematic.lines.length, 2)
    assert.equal(document.schematic.sheet.titleBlock.drawnBy, 'Fixture Author')
    assert.equal(document.schematic.lines[0].sourceType, 'wire')
    assert.equal(document.schematic.lines[1].sourceType, 'bus')
    assert.equal(document.schematic.components[0].designator, 'U1')
    assert.equal(document.schematic.pins.length, 2)
    assert.equal(document.schematic.rectangles[0].fill, 'background')
    assert.equal(document.schematic.sheetSymbols.length, 1)
    assert.equal(document.schematic.sheetEntries[0].name, 'CHILD_SIG')
    assert.ok(
        document.schematic.nets.some((net) => net.name === 'ROOT_SIG'),
        'expected local label to name a recovered schematic net'
    )
    assert.deepEqual(document.bom[0].designators, ['U1'])
})

test('KicadParser mirrors symbol property justification and pin-number visibility', () => {
    const document = KicadParser.parseArrayBuffer(
        'mirrored-symbol.kicad_sch',
        bytesFor(mirroredSymbolTextSource())
    )
    const reference = document.schematic.texts.find(
        (text) => text.propertyName === 'Reference'
    )

    assert.equal(reference.anchor, 'end')
    assert.equal(reference.fontSize, 1.1)
    assert.equal(reference.font.width, 1.7)
    assert.equal(reference.font.height, 1.1)
    assert.equal(document.schematic.pins[0].numberVisible, false)
    assert.equal(document.schematic.pins[0].numberFontSize, 0)
    assert.equal(document.schematic.pins[1].numberVisible, false)
})

test('KicadParser applies rotated symbol orientation to unrotated property fields', () => {
    const document = KicadParser.parseArrayBuffer(
        'rotated-symbol-field.kicad_sch',
        bytesFor(rotatedSymbolFieldSource())
    )
    const reference = document.schematic.texts.find(
        (text) => text.propertyName === 'Reference'
    )
    const value = document.schematic.texts.find(
        (text) => text.propertyName === 'Value'
    )

    assert.equal(reference.rotation, 90)
    assert.equal(value.rotation, 90)
})

test('KicadParser applies clockwise symbol orientation as KiCad vertical field text', () => {
    const document = KicadParser.parseArrayBuffer(
        'clockwise-rotated-symbol-field.kicad_sch',
        bytesFor(clockwiseRotatedSymbolFieldSource())
    )
    const reference = document.schematic.texts.find(
        (text) => text.propertyName === 'Reference'
    )
    const value = document.schematic.texts.find(
        (text) => text.propertyName === 'Value'
    )

    assert.equal(reference.rotation, 90)
    assert.equal(value.rotation, 90)
})

test('KicadParser combines placed symbol and explicit property rotations', () => {
    const document = KicadParser.parseArrayBuffer(
        'counter-rotated-symbol-field.kicad_sch',
        bytesFor(counterRotatedSymbolFieldSource())
    )
    const reference = document.schematic.texts.find(
        (text) => text.propertyName === 'Reference'
    )
    const value = document.schematic.texts.find(
        (text) => text.propertyName === 'Value'
    )

    assert.equal(reference.rotation, 0)
    assert.equal(value.rotation, 0)
    assert.equal(reference.anchor, 'middle')
    assert.equal(value.anchor, 'middle')
})

test('KicadParser centers schematic text when vertical justification is omitted', () => {
    const document = KicadParser.parseArrayBuffer(
        'implicit-center-field.kicad_sch',
        bytesFor(implicitCenterFieldSource())
    )
    const reference = document.schematic.texts.find(
        (text) => text.propertyName === 'Reference'
    )

    assert.equal(reference.anchor, 'end')
    assert.equal(reference.vAlign, 'center')
})

test('KicadParser only marks generic connector pins for endpoint circles', () => {
    const document = KicadParser.parseArrayBuffer(
        'pin-endpoint-markers.kicad_sch',
        bytesFor(pinEndpointMarkerSource())
    )
    const connector = document.schematic.components.find(
        (component) => component.source === 'Connector_Generic:Conn_01x02'
    )
    const resistor = document.schematic.components.find(
        (component) => component.source === 'Device:R'
    )
    const connectorPins = document.schematic.pins.filter(
        (pin) => pin.ownerIndex === connector.ownerIndex
    )
    const resistorPins = document.schematic.pins.filter(
        (pin) => pin.ownerIndex === resistor.ownerIndex
    )

    assert.equal(connectorPins[0].endpointVisible, true)
    assert.equal(resistorPins[0].endpointVisible, false)
})

test('KicadParser maps vertical library pins to their KiCad sheet side', () => {
    const document = KicadParser.parseArrayBuffer(
        'vertical-pin-symbol.kicad_sch',
        bytesFor(verticalPinSymbolSource())
    )
    const pin = document.schematic.pins[0]

    assert.equal(pin.orientation, 'top')
    assert.deepEqual(
        {
            x: pin.x,
            y: pin.y,
            length: pin.length
        },
        {
            x: 50,
            y: 45,
            length: 5
        }
    )
    assert.ok(
        document.schematic.nets.some((net) => net.name === 'TOP_SIG'),
        'expected the top-side symbol pin to connect to the vertical wire'
    )
})

test('KicadParser parses KiCad schematic graphical and metadata item families', () => {
    const document = KicadParser.parseArrayBuffer(
        'schematic-gaps.kicad_sch',
        bytesFor(schematicGapsSource())
    )
    const schematic = document.schematic

    assert.equal(schematic.images.length, 1)
    assert.deepEqual(
        {
            x: schematic.images[0].x,
            y: schematic.images[0].y,
            scale: schematic.images[0].scale,
            data: schematic.images[0].data
        },
        { x: 20, y: 20, scale: 0.5, data: 'ZmFrZQ==' }
    )
    assert.deepEqual(schematic.busAliases, [
        { name: 'ADDR', members: ['A0', 'A1'] }
    ])
    assert.deepEqual(
        schematic.busEntries.map((entry) => ({
            x1: entry.x1,
            y1: entry.y1,
            x2: entry.x2,
            y2: entry.y2
        })),
        [{ x1: 15, y1: 15, x2: 17.54, y2: 12.46 }]
    )
    assert.equal(schematic.directives.length, 1)
    assert.equal(schematic.directives[0].text, 'NO_ERC')
    assert.equal(schematic.textBoxes.length, 1)
    assert.equal(schematic.textBoxes[0].text, 'Keep traces short')
    assert.equal(schematic.textBoxes[0].font.bold, true)
    assert.equal(schematic.tables.length, 1)
    assert.deepEqual(
        schematic.tables[0].cells.map((cell) => cell.text),
        ['Name', 'Value']
    )
    assert.equal(
        schematic.arcs.some((arc) => arc.sourceType === 'arc'),
        true
    )
    assert.equal(
        schematic.ellipses.some((item) => item.sourceType === 'circle'),
        true
    )
    assert.equal(
        schematic.rectangles.some((item) => item.sourceType === 'rectangle'),
        true
    )
    assert.equal(schematic.beziers.length, 1)
    assert.equal(schematic.regions.length, 1)
    assert.equal(schematic.sheetInstances.length, 1)
    assert.equal(schematic.symbolInstances.length, 1)
    assert.equal(schematic.embeddedFonts, true)
    assert.deepEqual(schematic.embeddedFiles, [
        { name: 'font.ttf', data: 'Zm9udA==' }
    ])
})

test('KicadParser honors KiCad schematic symbol unit and convert selection', () => {
    const document = KicadParser.parseArrayBuffer(
        'schematic-unit-selection.kicad_sch',
        bytesFor(schematicUnitSelectionSource())
    )
    const schematic = document.schematic

    assert.deepEqual(
        schematic.pins.map((pin) => pin.designator),
        ['2']
    )
    assert.equal(
        schematic.pins.some((pin) => pin.designator === '1'),
        false
    )
    assert.equal(
        schematic.pins.some((pin) => pin.designator === 'ALT'),
        false
    )
    assert.equal(
        schematic.rectangles.filter(
            (rectangle) => rectangle.ownerIndex === 'placed-opamp'
        ).length,
        2
    )
    assert.equal(schematic.components[0].unit, 2)
    assert.equal(schematic.components[0].convert, 1)
    assert.equal(schematic.components[0].mirror, 'x')
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
 * Builds a minimal board fixture.
 * @returns {string}
 */
function minimalPcbSource() {
    return `(kicad_pcb
        (version 20241229)
        (title_block (title "Panel"))
        (gr_poly
            (pts (xy 0 0) (xy 30 0) (xy 30 20) (xy 0 20))
            (stroke (width 0.15) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
        (footprint "Package_SO:SOIC-8"
            (layer "F.Cu")
            (at 10 10 0)
            (property "Reference" "U1"
                (at 0 -3 0)
                (layer "F.SilkS")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (property "Value" "MCU"
                (at 0 3 0)
                (layer "F.Fab")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (pad "1" smd rect
                (at 0 0 0)
                (size 1 1)
                (layers "F.Cu" "F.Mask" "F.Paste")
                (net 1 "GND")
            )
        )
    )`
}

/**
 * Builds a PCB fixture with declared layers and legacy module syntax.
 * @returns {string}
 */
function metadataPcbSource() {
    return `(kicad_pcb
        (version 20250101)
        (layers
            (0 "F.Cu" signal)
            (31 "B.Cu" signal)
            (32 "B.User" user "Back user")
        )
        (setup
            (pcbplotparams
                (layerselection 0x03)
            )
        )
        (gr_rect
            (start 0 0)
            (end 10 8)
            (stroke (width 0.1) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
        (module "Package:Metadata"
            (layer "F.Cu")
            (at 5 4 0)
            (fp_text reference "M1"
                (at 0 -2 0)
                (layer "F.SilkS")
                (effects (font (size 1 1)))
            )
            (pad "1" smd rect
                (at 0 0 0)
                (size 1 1)
                (layers "F.Cu" "F.Mask" "F.Paste")
            )
        )
    )`
}

/**
 * Builds a minimal board fixture with one footprint 3D model.
 * @returns {string}
 */
function modelPcbSource() {
    return `(kicad_pcb
        (version 20241229)
        (gr_poly
            (pts (xy 0 0) (xy 30 0) (xy 30 20) (xy 0 20))
            (stroke (width 0.15) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
        (footprint "Fixture:Body"
            (layer "F.Cu")
            (at 10 10 0)
            (property "Reference" "U1"
                (at 0 -3 0)
                (layer "F.SilkS")
                (effects (font (size 1 1)))
            )
            (property "Value" "Body"
                (at 0 3 0)
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
 * Builds a minimal board fixture with footprint BOM attributes.
 * @returns {string}
 */
function footprintAttributePcbSource() {
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
 * Builds a minimal board fixture with declared and named nets.
 * @returns {string}
 */
function netPcbSource() {
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
 * Builds a minimal board fixture with a routed copper arc.
 * @returns {string}
 */
function copperArcPcbSource() {
    return `(kicad_pcb
        (version 20250101)
        (net 1 "GND")
        (gr_poly
            (pts (xy 0 0) (xy 8 0) (xy 8 6) (xy 0 6))
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
    )`
}

/**
 * Builds a board fixture with pads on explicit KiCad copper layer sets.
 * @returns {string}
 */
function oneSidedPadPcbSource() {
    return `(kicad_pcb
        (version 20250101)
        (gr_rect
            (start 0 0)
            (end 12 8)
            (stroke (width 0.1) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
        (footprint "Package:PadSides"
            (layer "F.Cu")
            (at 6 4 0)
            (property "Reference" "U1"
                (at 0 -2 0)
                (layer "F.SilkS")
                (effects (font (size 1 1) (thickness 0.15)))
            )
            (pad "1" smd rect
                (at -2 0 0)
                (size 1 1)
                (layers "F.Cu" "F.Mask" "F.Paste")
            )
            (pad "2" smd rect
                (at 0 0 0)
                (size 1 1)
                (layers "B.Cu" "B.Mask" "B.Paste")
            )
            (pad "3" thru_hole circle
                (at 2 0 0)
                (size 1.2 1.2)
                (drill 0.5)
                (layers "*.Cu" "*.Mask")
            )
        )
    )`
}

/**
 * Builds a minimal board fixture with a detailed pad.
 * @returns {string}
 */
function padDetailPcbSource() {
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
                (drill oval 0.45 0.9 (offset 0.1 -0.05))
                (layers "F.Cu" "In1.Cu" "B.Cu" "F.Mask" "B.Mask")
                (net 1 "GPIO0")
                (pinfunction "GPIO0")
                (pintype "bidirectional")
                (solder_mask_margin 0.05)
                (solder_paste_margin -0.02)
                (clearance 0.15)
                (zone_connect 2)
                (thermal_bridge_width 0.35)
                (thermal_gap 0.22)
                (property pad_prop_testpoint)
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
                (padstack
                    (mode custom)
                    (layer "F.Cu"
                        (shape roundrect)
                        (size 1.8 1.1)
                        (offset 0.04 0.05)
                        (roundrect_rratio 0.2)
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
 * Builds a schematic fixture with embedded symbol and sheet content.
 * @returns {string}
 */
function rootSchematicSource() {
    return `(kicad_sch
        (version 20250114)
        (generator "eeschema")
        (uuid "root-uuid")
        (paper "A4")
        (title_block
            (title "Root Sheet")
            (date "2026-01-02")
            (rev "A")
            (company "Fixture Org")
            (comment 1 "Fixture Author")
        )
        (lib_symbols
            (symbol "Device:R"
                (pin passive line (at -2.54 0 0) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "1" (effects (font (size 1.27 1.27))))
                )
                (pin passive line (at 2.54 0 180) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "2" (effects (font (size 1.27 1.27))))
                )
                (rectangle (start -1.27 -2.54) (end 1.27 2.54)
                    (stroke (width 0.15) (type solid))
                    (fill (type background))
                )
            )
        )
        (wire (pts (xy 7.46 20) (xy 20 20)) (stroke (width 0.15) (type solid)))
        (bus (pts (xy 20 24) (xy 40 24)) (stroke (width 0.15) (type solid)))
        (label "ROOT_SIG" (at 14 20 0)
            (effects (font (size 1.27 1.27)) (justify left bottom))
        )
        (junction (at 20 20) (diameter 0.9))
        (sheet (at 30 30) (size 20 12)
            (property "Sheet name" "Child" (at 30 28 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Sheet file" "child.kicad_sch" (at 30 44 0)
                (effects (font (size 1.27 1.27)))
            )
            (pin "CHILD_SIG" input (at 30 36 180)
                (effects (font (size 1.27 1.27)))
                (uuid "sheet-pin")
            )
            (uuid "sheet-uuid")
        )
        (symbol "Device:R" (at 5 20 0) (unit 1)
            (property "Reference" "U1" (at 5 16 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "10k" (at 5 24 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Footprint" "Resistor_SMD:R_0603" (at 5 26 0)
                (effects (font (size 1.27 1.27)) hide)
            )
            (uuid "symbol-uuid")
        )
    )`
}

/**
 * Builds a schematic fixture with mirrored symbol text and hidden pin numbers.
 * @returns {string}
 */
function mirroredSymbolTextSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Test:MIRROR"
                (pin passive line (at 0 2.54 270) (length 2.54)
                    (name "~" (effects (font (size 0 0))))
                    (number "1" (effects (font (size 0 0))))
                )
                (pin power_in line (at 2.54 0 180) (length 0)
                    (name "~" (effects (font (size 1.27 1.27))))
                )
            )
        )
        (symbol "Test:MIRROR"
            (at 20 20 0)
            (mirror y)
            (property "Reference" "R1" (at 21 20 0)
                (effects (font (size 1.7 1.1)) (justify left bottom))
            )
            (property "Value" "10k" (at 21 22 0)
                (effects (font (size 1.27 1.27)) hide)
            )
            (uuid "mirrored-symbol")
        )
    )`
}

/**
 * Builds a schematic fixture with a rotated symbol and unrotated fields.
 * @returns {string}
 */
function rotatedSymbolFieldSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Device:R"
                (pin passive line (at 0 -2.54 90) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "1" (effects (font (size 1.27 1.27))))
                )
                (pin passive line (at 0 2.54 270) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "2" (effects (font (size 1.27 1.27))))
                )
                (rectangle (start -1.27 -2.54) (end 1.27 2.54)
                    (stroke (width 0.15) (type solid))
                    (fill (type none))
                )
            )
        )
        (symbol "Device:R"
            (at 40 30 90)
            (property "Reference" "R2" (at 38 30 0)
                (effects (font (size 1.27 1.27)) (justify center bottom))
            )
            (property "Value" "8.2K" (at 42 30 0)
                (effects (font (size 1.27 1.27)) (justify center bottom))
            )
            (uuid "rotated-symbol-field")
        )
    )`
}

/**
 * Builds a schematic fixture with a clockwise-rotated symbol and unrotated fields.
 * @returns {string}
 */
function clockwiseRotatedSymbolFieldSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Device:R"
                (pin passive line (at 0 -2.54 90) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "1" (effects (font (size 1.27 1.27))))
                )
                (pin passive line (at 0 2.54 270) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "2" (effects (font (size 1.27 1.27))))
                )
                (rectangle (start -1.27 -2.54) (end 1.27 2.54)
                    (stroke (width 0.15) (type solid))
                    (fill (type none))
                )
            )
        )
        (symbol "Device:R"
            (at 40 30 270)
            (property "Reference" "R2" (at 38 30 0)
                (effects (font (size 1.27 1.27)) (justify center bottom))
            )
            (property "Value" "8.2K" (at 42 30 0)
                (effects (font (size 1.27 1.27)) (justify center bottom))
            )
            (uuid "clockwise-rotated-symbol-field")
        )
    )`
}

/**
 * Builds a schematic fixture with a rotated symbol and counter-rotated fields.
 * @returns {string}
 */
function counterRotatedSymbolFieldSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Test:COUNTER_FIELD"
                (pin passive line (at -2.54 0 0) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "1" (effects (font (size 1.27 1.27))))
                )
                (pin passive line (at 2.54 0 180) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "2" (effects (font (size 1.27 1.27))))
                )
                (rectangle (start -1.27 -2.54) (end 1.27 2.54)
                    (stroke (width 0.15) (type solid))
                    (fill (type none))
                )
            )
        )
        (symbol "Test:COUNTER_FIELD"
            (at 40 30 270)
            (property "Reference" "X1" (at 40 24.7 90)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "42" (at 40 27 90)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "counter-rotated-symbol-field")
        )
    )`
}

/**
 * Builds a schematic fixture with a field that omits vertical justification.
 * @returns {string}
 */
function implicitCenterFieldSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Device:D"
                (pin passive line (at 0 -2.54 90) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "1" (effects (font (size 1.27 1.27))))
                )
                (pin passive line (at 0 2.54 270) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "2" (effects (font (size 1.27 1.27))))
                )
            )
        )
        (symbol "Device:D"
            (at 50 50 90)
            (property "Reference" "D1" (at 51 52 0)
                (effects (font (size 1.27 1.27)) (justify right))
            )
            (uuid "implicit-center-field")
        )
    )`
}

/**
 * Builds a schematic fixture with connector and non-connector pins.
 * @returns {string}
 */
function pinEndpointMarkerSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Connector_Generic:Conn_01x02"
                (pin passive line (at 0 0 180) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "1" (effects (font (size 1.27 1.27))))
                )
                (pin passive line (at 0 2.54 180) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "2" (effects (font (size 1.27 1.27))))
                )
            )
            (symbol "Device:R"
                (pin passive line (at -2.54 0 0) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "1" (effects (font (size 1.27 1.27))))
                )
                (pin passive line (at 2.54 0 180) (length 2.54)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "2" (effects (font (size 1.27 1.27))))
                )
            )
        )
        (symbol "Connector_Generic:Conn_01x02"
            (at 20 20 0)
            (property "Reference" "J1" (at 20 16 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "Conn_01x02" (at 20 24 0)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "connector-symbol")
        )
        (symbol "Device:R"
            (at 40 20 0)
            (property "Reference" "R1" (at 40 16 0)
                (effects (font (size 1.27 1.27)))
            )
            (property "Value" "10k" (at 40 24 0)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "resistor-symbol")
        )
    )`
}

/**
 * Builds a schematic fixture with a top-side library pin.
 * @returns {string}
 */
function verticalPinSymbolSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Test:VERTICAL"
                (pin passive line (at 0 10 270) (length 5)
                    (name "~" (effects (font (size 1.27 1.27))))
                    (number "1" (effects (font (size 1.27 1.27))))
                )
            )
        )
        (wire (pts (xy 50 40) (xy 50 35)) (stroke (width 0.15) (type solid)))
        (label "TOP_SIG" (at 50 35 0)
            (effects (font (size 1.27 1.27)) (justify left bottom))
        )
        (symbol "Test:VERTICAL"
            (at 50 50 0)
            (property "Reference" "U1" (at 50 47 0)
                (effects (font (size 1.27 1.27)))
            )
            (uuid "vertical-symbol")
        )
    )`
}

/**
 * Builds a schematic fixture with currently unsupported KiCad item families.
 * @returns {string}
 */
function schematicGapsSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (title_block (title "Schematic Gaps"))
        (bus_alias "ADDR" (members "A0" "A1"))
        (bus_entry
            (at 15 15)
            (size 2.54 -2.54)
            (stroke (width 0.15) (type solid))
            (uuid "bus-entry")
        )
        (image
            (at 20 20)
            (scale 0.5)
            (uuid "image-uuid")
            (data "ZmFrZQ==")
        )
        (directive_label "NO_ERC"
            (at 30 20 0)
            (length 2.54)
            (effects
                (font (face "Inter") (size 1.27 1.27) bold italic)
                (justify left top)
            )
            (uuid "directive-uuid")
        )
        (text_box "Keep traces short"
            (at 10 30 0)
            (size 30 8)
            (margins 1 1 1 1)
            (stroke (width 0.1) (type solid))
            (fill (type none))
            (effects (font (size 1.2 1.2) bold) (justify left top))
            (uuid "text-box-uuid")
        )
        (table
            (column_count 2)
            (column_widths 20 30)
            (row_heights 6)
            (cells
                (table_cell "Name"
                    (at 5 50 0)
                    (size 20 6)
                    (effects (font (size 1 1)))
                    (uuid "cell-a")
                )
                (table_cell "Value"
                    (at 25 50 0)
                    (size 30 6)
                    (effects (font (size 1 1)))
                    (uuid "cell-b")
                )
            )
            (uuid "table-uuid")
        )
        (polyline
            (pts (xy 5 70) (xy 15 70))
            (stroke (width 0.1) (type solid))
            (uuid "line-uuid")
        )
        (arc
            (start 20 70)
            (mid 25 65)
            (end 30 70)
            (stroke (width 0.1) (type solid))
            (fill (type none))
            (uuid "arc-uuid")
        )
        (circle
            (center 40 70)
            (radius 3)
            (stroke (width 0.1) (type solid))
            (fill (type none))
            (uuid "circle-uuid")
        )
        (rectangle
            (start 50 65)
            (end 60 75)
            (stroke (width 0.1) (type solid))
            (fill (type background))
            (uuid "rectangle-uuid")
        )
        (bezier
            (pts (xy 65 70) (xy 68 65) (xy 72 75) (xy 75 70))
            (stroke (width 0.1) (type solid))
            (fill (type none))
            (uuid "bezier-uuid")
        )
        (rule_area
            (polyline
                (pts (xy 80 65) (xy 90 65) (xy 90 75) (xy 80 75))
                (stroke (width 0.1) (type solid))
                (fill (type none))
                (uuid "rule-poly")
            )
            (exclude_from_sim yes)
            (dnp yes)
            (uuid "rule-uuid")
        )
        (sheet_instances
            (path "/" (page "1"))
        )
        (symbol_instances
            (path "/placed" (reference "U1") (unit 1) (value "Logic") (footprint "Package:SOIC"))
        )
        (embedded_fonts yes)
        (embedded_files
            (file "font.ttf" (data "Zm9udA=="))
        )
    )`
}

/**
 * Builds a schematic fixture with multiple symbol units and body styles.
 * @returns {string}
 */
function schematicUnitSelectionSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (lib_symbols
            (symbol "Test:DUAL"
                (symbol "DUAL_0_1"
                    (rectangle (start -1 -1) (end 1 1)
                        (stroke (width 0.1) (type solid))
                        (fill (type none))
                    )
                )
                (symbol "DUAL_1_1"
                    (pin input line (at -5 0 0) (length 2.54)
                        (name "IN1" (effects (font (size 1 1))))
                        (number "1" (effects (font (size 1 1))))
                    )
                    (rectangle (start -2 -2) (end 2 2)
                        (stroke (width 0.1) (type solid))
                        (fill (type none))
                    )
                )
                (symbol "DUAL_1_2"
                    (pin input line (at -5 5 0) (length 2.54)
                        (name "ALT" (effects (font (size 1 1))))
                        (number "ALT" (effects (font (size 1 1))))
                    )
                )
                (symbol "DUAL_2_1"
                    (pin output line (at 5 0 180) (length 2.54)
                        (name "OUT2" (effects (font (size 1 1))))
                        (number "2" (effects (font (size 1 1))))
                    )
                    (rectangle (start 3 -2) (end 7 2)
                        (stroke (width 0.1) (type solid))
                        (fill (type none))
                    )
                )
            )
        )
        (symbol "Test:DUAL"
            (at 50 50 0)
            (unit 2)
            (convert 1)
            (mirror x)
            (property "Reference" "U1" (at 50 45 0) (effects (font (size 1 1))))
            (property "Value" "DUAL" (at 50 55 0) (effects (font (size 1 1))))
            (uuid "placed-opamp")
        )
    )`
}
