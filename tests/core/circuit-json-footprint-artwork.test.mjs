// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { CircuitJsonDocument } from 'circuitjson-toolkit'
import {
    CircuitJsonConformanceChecker,
    KicadParser
} from '../../src/legacy-parser.mjs'

/**
 * Encodes fixture text as an ArrayBuffer.
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
 * Returns Circuit JSON elements of one type.
 * @param {object[]} circuitJson Circuit JSON element array.
 * @param {string} type Element type.
 * @returns {object[]}
 */
function elementsOf(circuitJson, type) {
    return circuitJson.filter((element) => element.type === type)
}

/**
 * Returns the first Circuit JSON element matching a type and predicate.
 * @param {object[]} circuitJson Circuit JSON element array.
 * @param {string} type Element type.
 * @param {(element: Record<string, unknown>) => boolean} [predicate] Matcher.
 * @returns {Record<string, unknown>}
 */
function findElement(circuitJson, type, predicate = () => true) {
    const element = circuitJson.find((candidate) => {
        return candidate.type === type && predicate(candidate)
    })

    assert.ok(element, `Expected ${type} element.`)
    return element
}

/**
 * Builds a fake standalone footprint fixture with pads, texts, and artwork.
 * @returns {string}
 */
function standaloneFootprintSource() {
    return `
        (footprint "Fake:Pad_Artwork"
            (version 20240108)
            (generator "kicad-toolkit-test")
            (layer "F.Cu")
            (descr "Fake standalone footprint")
            (tags "fake regression")
            (property "Reference" "REF**"
                (at 0 -1 0)
                (layer "F.SilkS")
                (effects (font (size 1 0.8) (thickness 0.15)))
            )
            (property "Value" "Pad_Artwork"
                (at 0 1 0)
                (layer "F.Fab")
                (effects
                    (font (size 1 0.8) (thickness 0.12))
                    (justify left)
                )
            )
            (fp_line
                (start -1 -1)
                (end 1 -1)
                (stroke (width 0.12) (type solid))
                (layer "F.SilkS")
            )
            (fp_rect
                (start -1.2 -0.8)
                (end 1.2 0.8)
                (stroke (width 0.1) (type solid))
                (fill none)
                (layer "F.Fab")
            )
            (fp_circle
                (center 0 0)
                (end 0.8 0)
                (stroke (width 0.05) (type solid))
                (fill none)
                (layer "F.CrtYd")
            )
            (pad "1" smd rect
                (at -0.8 0 0)
                (size 1.2 0.8)
                (layers "F.Cu" "F.Mask" "F.Paste")
            )
            (pad "2" thru_hole circle
                (at 0.8 0 0)
                (size 1.3 1.3)
                (drill 0.7)
                (layers "*.Cu" "*.Mask")
            )
            (pad "3" thru_hole oval
                (at 2.4 0 30)
                (size 2.4 1.2)
                (drill oval 1.6 0.6)
                (layers "*.Cu" "*.Mask")
            )
        )
    `
}

/**
 * Builds a fake PCB fixture with board-owned silkscreen, fab, and courtyard
 * artwork.
 * @returns {string}
 */
function artworkBoardSource() {
    return `
        (kicad_pcb
            (version 20241229)
            (layers
                (0 "F.Cu" signal)
                (31 "B.Cu" signal)
                (37 "F.SilkS" user)
                (39 "F.Fab" user)
                (41 "F.CrtYd" user)
                (44 "Edge.Cuts" user)
            )
            (gr_line
                (start 0 0)
                (end 10 0)
                (stroke (width 0.1) (type solid))
                (layer "Edge.Cuts")
            )
            (gr_line
                (start 10 0)
                (end 10 6)
                (stroke (width 0.1) (type solid))
                (layer "Edge.Cuts")
            )
            (gr_line
                (start 10 6)
                (end 0 6)
                (stroke (width 0.1) (type solid))
                (layer "Edge.Cuts")
            )
            (gr_line
                (start 0 6)
                (end 0 0)
                (stroke (width 0.1) (type solid))
                (layer "Edge.Cuts")
            )
            (gr_line
                (start 1 1)
                (end 3 1)
                (stroke (width 0.2) (type solid))
                (layer "F.SilkS")
            )
            (gr_arc
                (start 4 1)
                (mid 5 2)
                (end 6 1)
                (stroke (width 0.15) (type solid))
                (layer "F.Fab")
            )
            (gr_rect
                (start 1 2)
                (end 3 4)
                (stroke (width 0.05) (type solid))
                (fill none)
                (layer "F.CrtYd")
            )
        )
    `
}

/**
 * Builds a fake PCB fixture whose only outline lives inside a footprint.
 * @returns {string}
 */
function footprintOutlineBoardSource() {
    return `
        (kicad_pcb
            (version 20241229)
            (layers
                (0 "F.Cu" signal)
                (31 "B.Cu" signal)
                (44 "Edge.Cuts" user)
            )
            (footprint "Fake:OutlineCarrier"
                (layer "F.Cu")
                (at 5 5 0)
                (property "Reference" "U1"
                    (at 0 0 0)
                    (layer "F.SilkS")
                    (effects (font (size 1 1) (thickness 0.12)))
                )
                (property "Value" "OutlineCarrier"
                    (at 0 1 0)
                    (layer "F.Fab")
                    (effects (font (size 1 1) (thickness 0.12)))
                )
                (fp_line
                    (start -2 -1)
                    (end 2 -1)
                    (stroke (width 0.1) (type solid))
                    (layer "Edge.Cuts")
                )
                (fp_line
                    (start 2 -1)
                    (end 2 1)
                    (stroke (width 0.1) (type solid))
                    (layer "Edge.Cuts")
                )
                (fp_line
                    (start 2 1)
                    (end -2 1)
                    (stroke (width 0.1) (type solid))
                    (layer "Edge.Cuts")
                )
                (fp_line
                    (start -2 1)
                    (end -2 -1)
                    (stroke (width 0.1) (type solid))
                    (layer "Edge.Cuts")
                )
                (pad "1" smd rect
                    (at 15 15 0)
                    (size 1 1)
                    (layers "F.Cu" "F.Mask" "F.Paste")
                )
            )
        )
    `
}

test('KicadParser projects standalone footprint pads, text, and artwork into Circuit JSON', () => {
    const circuitJson = KicadParser.parseArrayBuffer(
        'Pad_Artwork.kicad_mod',
        bytesFor(standaloneFootprintSource())
    )
    const conformance = CircuitJsonConformanceChecker.check(circuitJson)
    const smtPad = findElement(circuitJson, 'pcb_smtpad')
    const platedHoles = elementsOf(circuitJson, 'pcb_plated_hole')
    const platedHole = platedHoles.find((element) => element.shape === 'circle')
    const platedSlot = platedHoles.find((element) =>
        String(element.shape).includes('pill_hole_with_rect_pad')
    )
    const silkText = findElement(circuitJson, 'pcb_silkscreen_text')
    const fabText = findElement(circuitJson, 'pcb_fabrication_note_text')
    const silkPath = findElement(circuitJson, 'pcb_silkscreen_path')
    const fabPath = findElement(circuitJson, 'pcb_fabrication_note_path')
    const courtyard = findElement(circuitJson, 'pcb_courtyard_circle')

    assert.equal(conformance.valid, true)
    assert.equal(elementsOf(circuitJson, 'source_component').length, 1)
    assert.equal(elementsOf(circuitJson, 'pcb_component').length, 1)
    assert.equal(elementsOf(circuitJson, 'source_port').length, 3)
    assert.equal(elementsOf(circuitJson, 'pcb_port').length, 3)
    assert.equal(smtPad.shape, 'rect')
    assert.equal(smtPad.width, 1.2)
    assert.equal(smtPad.height, 0.8)
    assert.equal(platedHole.outer_diameter, 1.3)
    assert.equal(platedHole.hole_diameter, 0.7)
    assert.ok(platedSlot)
    assert.equal(platedSlot.rect_pad_width, 2.4)
    assert.equal(platedSlot.rect_pad_height, 1.2)
    assert.equal(platedSlot.hole_width, 1.6)
    assert.equal(platedSlot.hole_height, 0.6)
    assert.equal(platedSlot.rect_ccw_rotation, 30)
    assert.equal(platedSlot.hole_ccw_rotation, 30)
    assert.equal(silkText.text, 'REF**')
    assert.equal(fabText.text, 'Pad_Artwork')
    assert.equal(fabText.anchor_alignment, 'center')
    assert.equal(fabText.source_anchor_alignment, 'center_left')
    assert.deepEqual(CircuitJsonDocument.validateModel([...circuitJson]), [])
    assert.equal(silkPath.width, 0.12)
    assert.equal(fabPath.points.length, 5)
    assert.equal(courtyard.shape, 'circle')
    assert.equal(courtyard.radius, 0.8)
})

test('KicadParser emits Circuit JSON artwork paths for board graphics', () => {
    const circuitJson = KicadParser.parseArrayBuffer(
        'artwork-board.kicad_pcb',
        bytesFor(artworkBoardSource())
    )
    const conformance = CircuitJsonConformanceChecker.check(circuitJson)
    const silkPath = findElement(
        circuitJson,
        'pcb_note_path',
        (element) => element.source_layer === 'F.SilkS'
    )
    const fabPath = findElement(
        circuitJson,
        'pcb_note_path',
        (element) => element.source_layer === 'F.Fab'
    )
    const courtyard = findElement(
        circuitJson,
        'pcb_note_path',
        (element) => element.source_layer === 'F.CrtYd'
    )

    assert.equal(conformance.valid, true)
    assert.deepEqual(silkPath.start, { x: 1, y: 1 })
    assert.deepEqual(silkPath.end, { x: 3, y: 1 })
    assert.equal(silkPath.width, 0.2)
    assert.equal(silkPath.route.length, 2)
    assert.equal(fabPath.shape, 'arc')
    assert.equal(fabPath.points.length, 3)
    assert.equal(fabPath.route.length > 3, true)
    assert.equal(
        fabPath.route.some(
            (point) => Math.abs(point.y - fabPath.start.y) > Number.EPSILON
        ),
        true
    )
    assert.equal(courtyard.shape, 'polygon')
    assert.equal(courtyard.points.length, 5)
    assert.equal(courtyard.route.length, 5)
})

test('KicadParser includes footprint-owned Edge.Cuts in recovered board outlines', () => {
    const circuitJson = KicadParser.parseArrayBuffer(
        'footprint-outline.kicad_pcb',
        bytesFor(footprintOutlineBoardSource())
    )
    const board = findElement(circuitJson, 'pcb_board')

    assert.equal(board.width, 4)
    assert.equal(board.height, 2)
    assert.deepEqual(board.center, { x: 5, y: 5 })
    assert.equal(board.outline.length, 5)
})
