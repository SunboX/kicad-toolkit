// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    CircuitJsonConformanceChecker,
    KicadParser,
    CircuitJsonModelAdapter
} from '../../src/legacy-parser.mjs'

/**
 * Returns the first Circuit JSON element matching a type and predicate.
 * @param {object[]} circuitJson Circuit JSON elements.
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
 * Encodes source text as an exact ArrayBuffer window.
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
 * Verifies ownerless PCB text rows survive as canonical note text.
 */
test('CircuitJsonModelAdapter emits PCB note text with layer and visibility metadata', () => {
    const rendererModel = {
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileType: 'kicad_pcb',
        fileName: 'board-text.kicad_pcb',
        summary: {
            title: 'Board Text',
            boardWidthMil: 1000,
            boardHeightMil: 500,
            layerCount: 2
        },
        diagnostics: [],
        pcb: {
            boardOutline: {
                widthMil: 1000,
                heightMil: 500,
                minX: 0,
                minY: 0
            },
            components: [],
            pads: [],
            tracks: [],
            vias: [],
            texts: [
                {
                    text: 'REF**',
                    x: 100,
                    y: 200,
                    layer: 'F.SilkS',
                    rotation: 90,
                    sizeX: 0.8,
                    sizeY: 1.2,
                    thickness: 0.15,
                    mirrored: true,
                    hAlign: 'left',
                    vAlign: 'center',
                    ownerId: 'board',
                    visible: true
                },
                {
                    text: 'ASSEMBLY',
                    x: 300,
                    y: 250,
                    layer: 'B.Fab',
                    rotation: -45,
                    fontSize: 1,
                    hidden: true
                }
            ]
        }
    }

    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(rendererModel)
    const silkscreenText = findElement(
        circuitJson,
        'pcb_note_text',
        (element) => element.text === 'REF**'
    )
    const fabricationText = findElement(
        circuitJson,
        'pcb_note_text',
        (element) => element.text === 'ASSEMBLY'
    )
    const report = CircuitJsonConformanceChecker.check(circuitJson)

    assert.equal(silkscreenText.pcb_note_text_id.length > 0, true)
    assert.equal(Object.hasOwn(silkscreenText, 'x'), false)
    assert.equal(Object.hasOwn(silkscreenText, 'y'), false)
    assert.deepEqual(silkscreenText.anchor_position, { x: 2.54, y: 5.08 })
    assert.equal(silkscreenText.layer, 'top')
    assert.equal(silkscreenText.ccw_rotation, 90)
    assert.equal(silkscreenText.font_size, 1.2)
    assert.equal(silkscreenText.font_width, 0.8)
    assert.equal(silkscreenText.font_height, 1.2)
    assert.equal(silkscreenText.stroke_width, 0.15)
    assert.equal(silkscreenText.anchor_alignment, 'center')
    assert.equal(silkscreenText.source_anchor_alignment, 'center_left')
    assert.equal(silkscreenText.is_mirrored_from_top_view, true)
    assert.equal(silkscreenText.source_layer, 'F.SilkS')
    assert.equal(silkscreenText.source_type, 'gr_text')
    assert.equal(silkscreenText.is_hidden, false)
    assert.equal(fabricationText.pcb_note_text_id.length > 0, true)
    assert.equal(fabricationText.layer, 'bottom')
    assert.equal(fabricationText.ccw_rotation, 315)
    assert.equal(fabricationText.font_size, 1)
    assert.equal(fabricationText.is_hidden, true)
    assert.equal(report.valid, true)
})

test('KiCad board text keeps default vertical centering with left mirror rotation', () => {
    const source = `
        (kicad_pcb
            (version 20241229)
            (layers
                (0 "F.Cu" signal)
                (31 "B.Cu" signal)
                (37 "F.SilkS" user)
                (44 "Edge.Cuts" user)
            )
            (gr_rect
                (start 0 0)
                (end 20 10)
                (stroke (width 0.1) (type solid))
                (fill none)
                (layer "Edge.Cuts")
            )
            (gr_text "MARK"
                (at 15 8 330)
                (layer "B.SilkS")
                (effects
                    (font (size 1.2 0.8) (thickness 0.12))
                    (justify left mirror)
                )
            )
        )
    `
    const rendererModel = KicadParser.parseArrayBufferToRendererModel(
        'neutral-board.kicad_pcb',
        bytesFor(source)
    )
    const nativeText = rendererModel.pcb.texts.find(
        (text) => text.text === 'MARK'
    )
    const circuitJson = KicadParser.parseArrayBuffer(
        'neutral-board.kicad_pcb',
        bytesFor(source)
    )
    const canonicalText = findElement(
        circuitJson,
        'pcb_note_text',
        (element) => element.text === 'MARK'
    )

    assert.equal(nativeText.hAlign, 'left')
    assert.equal(nativeText.vAlign, 'center')
    assert.equal(nativeText.mirrored, true)
    assert.equal(nativeText.rotation, 30)
    assert.deepEqual(canonicalText.anchor_position, { x: 15, y: 8 })
    assert.equal(canonicalText.anchor_alignment, 'center')
    assert.equal(canonicalText.source_anchor_alignment, 'center_left')
    assert.equal(canonicalText.is_mirrored_from_top_view, true)
    assert.equal(canonicalText.ccw_rotation, 30)
})

/**
 * Verifies named schematic nets without drawn wire segments still get source
 * and schematic trace records linked to their source ports.
 */
test('CircuitJsonModelAdapter emits traces for segmentless named schematic nets', () => {
    const powerPin = {
        ownerDesignator: '#PWR01',
        pinNumber: '1',
        name: 'VCC',
        x: 10,
        y: 12,
        orientation: 'down',
        symbolKind: 'power'
    }
    const rendererModel = {
        sourceFormat: 'kicad',
        kind: 'schematic',
        fileType: 'kicad_sch',
        fileName: 'segmentless-power.kicad_sch',
        summary: { title: 'Segmentless Power' },
        diagnostics: [],
        schematic: {
            components: [
                {
                    designator: '#PWR01',
                    value: 'VCC',
                    x: 10,
                    y: 10,
                    width: 2,
                    height: 2,
                    source: 'power:VCC'
                }
            ],
            pins: [powerPin],
            nets: [
                {
                    name: 'VCC',
                    segments: [],
                    labels: [{ text: 'VCC', x: 10, y: 12 }],
                    powerPorts: [powerPin]
                }
            ],
            lines: [],
            texts: [
                {
                    role: 'power',
                    text: 'VCC',
                    x: 10,
                    y: 12
                }
            ]
        }
    }

    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(rendererModel)
    const sourceNet = findElement(circuitJson, 'source_net', (element) => {
        return element.name === 'VCC'
    })
    const sourcePort = findElement(circuitJson, 'source_port', (element) => {
        return element.pin_number === 1
    })
    const sourceTrace = findElement(circuitJson, 'source_trace')
    const schematicTrace = findElement(circuitJson, 'schematic_trace')
    const netLabel = findElement(circuitJson, 'schematic_net_label')
    const report = CircuitJsonConformanceChecker.check(circuitJson)

    assert.deepEqual(sourceTrace.connected_source_net_ids, [
        sourceNet.source_net_id
    ])
    assert.deepEqual(sourceTrace.connected_source_port_ids, [
        sourcePort.source_port_id
    ])
    assert.equal(schematicTrace.source_trace_id, sourceTrace.source_trace_id)
    assert.deepEqual(schematicTrace.edges, [])
    assert.deepEqual(schematicTrace.junctions, [])
    assert.equal(netLabel.source_net_id, sourceNet.source_net_id)
    assert.equal(report.valid, true)
})

/**
 * Verifies parsed power symbols create Circuit JSON connectivity without a
 * drawn wire segment.
 */
test('KicadParser emits Circuit JSON connectivity for segmentless power symbols', () => {
    const circuitJson = KicadParser.parseArrayBuffer(
        'parser-power.kicad_sch',
        Buffer.from(`
            (kicad_sch
                (version 20250114)
                (uuid "parser-power")
                (paper "A4")
                (lib_symbols
                    (symbol "power:VCC" (power)
                        (pin power_in line (at 0 0 90) (length 0)
                            (name "VCC" (effects (font (size 1.27 1.27))))
                            (number "1" (effects (font (size 1.27 1.27))))
                        )
                    )
                )
                (symbol "power:VCC" (at 10 10 0) (unit 1)
                    (property "Reference" "#PWR01" (at 10 8 0)
                        (effects (font (size 1.27 1.27)) hide)
                    )
                    (property "Value" "VCC" (at 10 10 0)
                        (effects (font (size 1.27 1.27)))
                    )
                    (uuid "parser-power-symbol")
                )
            )
        `)
    )
    const sourcePort = findElement(circuitJson, 'source_port', (element) => {
        return element.pin_number === 1
    })
    const sourceTrace = findElement(circuitJson, 'source_trace')
    const schematicTrace = findElement(circuitJson, 'schematic_trace')
    const netLabel = findElement(
        circuitJson,
        'schematic_net_label',
        (label) => {
            return label.text === 'VCC'
        }
    )
    const report = CircuitJsonConformanceChecker.check(circuitJson)

    assert.deepEqual(sourceTrace.connected_source_port_ids, [
        sourcePort.source_port_id
    ])
    assert.deepEqual(schematicTrace.edges, [])
    assert.equal(netLabel.text, 'VCC')
    assert.equal(report.valid, true)
})
