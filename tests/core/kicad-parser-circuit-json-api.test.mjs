// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadParser } from '../../src/parser.mjs'

/**
 * Encodes fixture text as an ArrayBuffer.
 * @param {string} source
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
 * Builds a minimal KiCad PCB fixture.
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
 * Builds a KiCad PCB fixture with one internal Edge.Cuts contour.
 * @returns {string}
 */
function pcbWithCutoutSource() {
    return `(kicad_pcb
        (version 20241229)
        (layers
            (0 "F.Cu" signal)
            (31 "B.Cu" signal)
            (44 "Edge.Cuts" user)
        )
        (gr_line
            (start 0 0)
            (end 20 0)
            (stroke (width 0.1) (type solid))
            (layer "Edge.Cuts")
        )
        (gr_line
            (start 20 0)
            (end 20 10)
            (stroke (width 0.1) (type solid))
            (layer "Edge.Cuts")
        )
        (gr_line
            (start 20 10)
            (end 0 10)
            (stroke (width 0.1) (type solid))
            (layer "Edge.Cuts")
        )
        (gr_line
            (start 0 10)
            (end 0 0)
            (stroke (width 0.1) (type solid))
            (layer "Edge.Cuts")
        )
        (gr_line
            (start 8 4)
            (end 12 4)
            (stroke (width 0.1) (type solid))
            (layer "Edge.Cuts")
        )
        (gr_line
            (start 12 4)
            (end 12 6)
            (stroke (width 0.1) (type solid))
            (layer "Edge.Cuts")
        )
        (gr_line
            (start 12 6)
            (end 8 6)
            (stroke (width 0.1) (type solid))
            (layer "Edge.Cuts")
        )
        (gr_line
            (start 8 6)
            (end 8 4)
            (stroke (width 0.1) (type solid))
            (layer "Edge.Cuts")
        )
    )`
}

/**
 * Builds a KiCad PCB fixture with non-line Edge.Cuts primitives.
 * @returns {string}
 */
function pcbWithCurvedCutoutSource() {
    return `(kicad_pcb
        (version 20241229)
        (layers
            (0 "F.Cu" signal)
            (31 "B.Cu" signal)
            (44 "Edge.Cuts" user)
        )
        (gr_rect
            (start 0 0)
            (end 20 10)
            (stroke (width 0.1) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
        (gr_circle
            (center 10 5)
            (end 12 5)
            (stroke (width 0.1) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
    )`
}

/**
 * Builds a KiCad PCB fixture with function and sourcing metadata.
 * @returns {string}
 */
function pcbWithFunctionMetadataSource() {
    return `(kicad_pcb
        (version 20241229)
        (title_block (title "Function Metadata"))
        (layers
            (0 "F.Cu" signal)
            (31 "B.Cu" signal)
            (44 "Edge.Cuts" user)
        )
        (gr_rect
            (start 0 0)
            (end 20 12)
            (stroke (width 0.1) (type solid))
            (fill no)
            (layer "Edge.Cuts")
        )
        (footprint "Connector_PinHeader_1x02"
            (layer "F.Cu")
            (at 2 2 0)
            (property "Reference" "J1" (at 0 -1 0))
            (property "Value" "Header" (at 0 1 0))
            (pad "11" smd rect
                (at 0 0 0)
                (size 1 1)
                (layers "F.Cu" "F.Mask" "F.Paste")
            )
            (pad "R" smd rect
                (at 1.27 0 0)
                (size 1 1)
                (layers "F.Cu" "F.Mask" "F.Paste")
            )
        )
        (footprint "Switch_Tactile"
            (layer "F.Cu")
            (at 6 2 0)
            (property "Reference" "SW1" (at 0 -1 0))
            (property "Value" "Button" (at 0 1 0))
        )
        (footprint "Fiducial_1mm"
            (layer "F.Cu")
            (at 8 2 0)
            (property "Reference" "FID1" (at 0 -1 0))
            (property "Value" "Fiducial" (at 0 1 0))
        )
        (footprint "TestPoint_Pad_1mm"
            (layer "F.Cu")
            (at 10 2 0)
            (property "Reference" "TP1" (at 0 -1 0))
            (property "Value" "Test point" (at 0 1 0))
        )
        (footprint "Package_Metadata"
            (layer "F.Cu")
            (at 10 6 0)
            (property "Reference" "U1" (at 0 -1 0))
            (property "Value" "Driver" (at 0 1 0))
            (property "Manufacturer Part Number" "MP-42" (at 0 2 0))
            (property "Alpha Supply Part #" "AS-100, AS-200" (at 0 3 0))
            (property "Beta Supply Part Number" "BS-300" (at 0 4 0))
            (pad "1" smd roundrect
                (at 0 0 0)
                (size 2 1)
                (layers "F.Cu" "F.Mask" "F.Paste")
                (roundrect_rratio 0.25)
            )
        )
    )`
}

/**
 * Verifies the breaking parser root returns Circuit JSON directly.
 */
test('KicadParser.parseArrayBuffer returns a Circuit JSON array', () => {
    const circuitJson = KicadParser.parseArrayBuffer(
        'panel.kicad_pcb',
        bytesFor(minimalPcbSource())
    )

    assert.equal(Array.isArray(circuitJson), true)
    assert.equal(circuitJson.kind, 'pcb')
    assert.equal(circuitJson.fileType, 'kicad_pcb')
    assert.equal(
        circuitJson.some(
            (element) => element.type === 'source_project_metadata'
        ),
        true
    )
    assert.equal(
        circuitJson.some((element) => element.type === 'pcb_board'),
        true
    )
    assert.equal(
        JSON.parse(JSON.stringify(circuitJson)).every(
            (element) => element.type
        ),
        true
    )
})

/**
 * Verifies the compatibility API keeps returning the renderer model.
 */
test('KicadParser.parseArrayBufferToRendererModel keeps renderer output', () => {
    const rendererModel = KicadParser.parseArrayBufferToRendererModel(
        'panel.kicad_pcb',
        bytesFor(minimalPcbSource())
    )

    assert.equal(Array.isArray(rendererModel), false)
    assert.equal(rendererModel.kind, 'pcb')
    assert.equal(rendererModel.fileType, 'kicad_pcb')
    assert.equal(rendererModel.pcb.components[0].designator, 'U1')
})

/**
 * Verifies disconnected Edge.Cuts contours are exposed as board cutouts.
 */
test('KicadParser.parseArrayBuffer emits Circuit JSON board cutouts', () => {
    const circuitJson = KicadParser.parseArrayBuffer(
        'board-cutout.kicad_pcb',
        bytesFor(pcbWithCutoutSource())
    )
    const rendererModel = KicadParser.parseArrayBufferToRendererModel(
        'board-cutout.kicad_pcb',
        bytesFor(pcbWithCutoutSource())
    )
    const board = circuitJson.find((element) => element.type === 'pcb_board')
    const cutouts = circuitJson.filter((element) => {
        return element.type === 'pcb_cutout'
    })

    assert.equal(board.width, 20)
    assert.equal(board.height, 10)
    assert.equal(board.outline.length, 5)
    assert.equal(cutouts.length, 1)
    assert.equal(cutouts[0].shape, 'polygon')
    assert.equal(cutouts[0].points.length, 5)
    assert.equal(rendererModel.pcb.boardOutline.cutouts.length, 1)
})

/**
 * Verifies parsed PCB metadata is preserved in Circuit JSON output.
 */
test('KicadParser.parseArrayBuffer emits rich component metadata', () => {
    const circuitJson = KicadParser.parseArrayBuffer(
        'function-metadata.kicad_pcb',
        bytesFor(pcbWithFunctionMetadataSource())
    )
    const sourceComponents = new Map(
        circuitJson
            .filter((element) => element.type === 'source_component')
            .map((component) => [component.name, component])
    )
    const sourcePorts = circuitJson.filter((element) => {
        return element.type === 'source_port'
    })
    const numericPort = sourcePorts.find((port) => port.pin_number === 11)
    const namedPort = sourcePorts.find((port) => port.name === 'R')
    const roundRectPad = circuitJson.find((element) => {
        return (
            element.type === 'pcb_smtpad' && element.x === 10 && element.y === 6
        )
    })

    assert.equal(sourceComponents.get('J1').ftype, 'simple_pin_header')
    assert.equal(sourceComponents.get('SW1').ftype, 'simple_switch')
    assert.equal(sourceComponents.get('FID1').ftype, 'simple_fiducial')
    assert.equal(sourceComponents.get('TP1').ftype, 'simple_test_point')
    assert.equal(sourceComponents.get('U1').manufacturer_part_number, 'MP-42')
    assert.deepEqual(sourceComponents.get('U1').supplier_part_numbers, {
        alpha_supply: ['AS-100', 'AS-200'],
        beta_supply: ['BS-300']
    })
    assert.equal(numericPort.name, 'pin11')
    assert.deepEqual(numericPort.port_hints, ['pin11', '11'])
    assert.equal(namedPort.pin_number, undefined)
    assert.deepEqual(namedPort.port_hints, ['R'])
    assert.equal(roundRectPad.shape, 'rect')
    assert.equal(roundRectPad.corner_radius, 0.25)
    assert.equal(Object.hasOwn(roundRectPad, 'radius'), false)
})

/**
 * Verifies non-line Edge.Cuts primitives are exposed as board contours.
 */
test('KicadParser.parseArrayBuffer emits curved board cutouts', () => {
    const circuitJson = KicadParser.parseArrayBuffer(
        'curved-cutout.kicad_pcb',
        bytesFor(pcbWithCurvedCutoutSource())
    )
    const rendererModel = KicadParser.parseArrayBufferToRendererModel(
        'curved-cutout.kicad_pcb',
        bytesFor(pcbWithCurvedCutoutSource())
    )
    const board = circuitJson.find((element) => element.type === 'pcb_board')
    const cutouts = circuitJson.filter((element) => {
        return element.type === 'pcb_cutout'
    })

    assert.equal(board.width, 20)
    assert.equal(board.height, 10)
    assert.equal(cutouts.length, 1)
    assert.equal(cutouts[0].shape, 'polygon')
    assert.ok(cutouts[0].points.length > 12)
    assert.equal(rendererModel.pcb.boardOutline.cutouts.length, 1)
})
