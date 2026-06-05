// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { CircuitJsonModelAdapter } from '../../src/parser.mjs'

/**
 * Verifies renderer models convert to Circuit JSON arrays while preserving
 * compatibility fields used by existing renderers.
 */
test('CircuitJsonModelAdapter converts PCB renderer models to Circuit JSON arrays', () => {
    const rendererModel = {
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileType: 'kicad_pcb',
        fileName: 'neutral-board.kicad_pcb',
        summary: {
            title: 'Neutral Board',
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
                minY: 0,
                segments: [
                    { x1: 0, y1: 0, x2: 1000, y2: 0 },
                    { x1: 1000, y1: 0, x2: 1000, y2: 500 },
                    { x1: 1000, y1: 500, x2: 0, y2: 500 },
                    { x1: 0, y1: 500, x2: 0, y2: 0 }
                ]
            },
            components: [
                {
                    componentIndex: 1,
                    designator: 'U1',
                    x: 100,
                    y: 200,
                    layer: 'TOP',
                    rotation: 90,
                    pattern: 'SOIC',
                    source: 'SOIC',
                    value: 'DRV'
                }
            ],
            pads: [
                {
                    componentIndex: 1,
                    name: '1',
                    x: 90,
                    y: 200,
                    sizeTopX: 50,
                    sizeTopY: 30,
                    holeDiameter: 0,
                    shapeTopName: 'rect',
                    layer: 'TOP',
                    netName: 'GND',
                    netIndex: 1
                }
            ],
            tracks: [
                {
                    x1: 90,
                    y1: 200,
                    x2: 150,
                    y2: 200,
                    width: 10,
                    layerId: 1,
                    netName: 'GND',
                    netIndex: 1
                }
            ],
            vias: []
        },
        bom: [{ designators: ['U1'], quantity: 1, value: 'DRV' }]
    }

    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(rendererModel)

    assert.equal(Array.isArray(circuitJson), true)
    assert.equal(circuitJson.kind, 'pcb')
    assert.equal(circuitJson.pcb.components.length, 1)
    assert.equal(
        circuitJson.some(
            (element) => element.type === 'source_project_metadata'
        ),
        true
    )
    assert.equal(
        circuitJson.some((element) => element.type === 'source_component'),
        true
    )
    assert.equal(
        circuitJson.some((element) => element.type === 'pcb_component'),
        true
    )
    assert.equal(
        circuitJson.some((element) => element.type === 'pcb_smtpad'),
        true
    )
    assert.equal(
        circuitJson.some((element) => element.type === 'pcb_trace'),
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
 * Returns the first Circuit JSON element matching a type and predicate.
 * @param {object[]} circuitJson
 * @param {string} type
 * @param {(element: Record<string, unknown>) => boolean} [predicate]
 * @returns {Record<string, unknown>}
 */
function findElement(circuitJson, type, predicate = () => true) {
    const element = circuitJson.find(
        (candidate) => candidate.type === type && predicate(candidate)
    )

    assert.ok(element, `Expected ${type} element.`)
    return element
}

/**
 * Verifies PCB pads and traces use upstream Circuit JSON field names.
 */
test('CircuitJsonModelAdapter emits schema-shaped PCB connectivity elements', () => {
    const rendererModel = {
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileType: 'kicad_pcb',
        fileName: 'connectivity.kicad_pcb',
        summary: {
            title: 'Connectivity',
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
            nets: [{ name: 'GND' }],
            components: [
                {
                    componentIndex: 1,
                    designator: 'U1',
                    x: 100,
                    y: 200,
                    layer: 'TOP',
                    rotation: 0
                }
            ],
            pads: [
                {
                    componentIndex: 1,
                    name: '1',
                    x: 90,
                    y: 200,
                    sizeTopX: 50,
                    sizeTopY: 30,
                    holeDiameter: 0,
                    shapeTopName: 'rect',
                    layer: 'TOP',
                    netName: 'GND'
                },
                {
                    componentIndex: 1,
                    name: '2',
                    x: 120,
                    y: 200,
                    sizeTopX: 50,
                    sizeTopY: 50,
                    holeDiameter: 20,
                    shapeTopName: 'circle',
                    layer: 'TOP',
                    netName: 'GND'
                }
            ],
            tracks: [
                {
                    x1: 90,
                    y1: 200,
                    x2: 150,
                    y2: 200,
                    width: 10,
                    layerId: 1,
                    netName: 'GND'
                }
            ],
            vias: []
        }
    }

    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(rendererModel)
    const sourceNet = findElement(circuitJson, 'source_net')
    const sourcePort = findElement(circuitJson, 'source_port')
    const pcbPort = findElement(circuitJson, 'pcb_port')
    const smtPad = findElement(circuitJson, 'pcb_smtpad')
    const platedHole = findElement(circuitJson, 'pcb_plated_hole')
    const sourceTrace = findElement(circuitJson, 'source_trace')

    assert.deepEqual(sourceNet.member_source_group_ids, [])
    assert.equal(typeof sourcePort.pin_number, 'number')
    assert.equal(typeof pcbPort.x, 'number')
    assert.equal(typeof pcbPort.y, 'number')
    assert.deepEqual(pcbPort.layers, ['top'])
    assert.equal(Object.hasOwn(pcbPort, 'center'), false)
    assert.equal(Object.hasOwn(pcbPort, 'layer'), false)
    assert.equal(typeof smtPad.x, 'number')
    assert.equal(typeof smtPad.y, 'number')
    assert.equal(Object.hasOwn(smtPad, 'center'), false)
    assert.equal(Object.hasOwn(smtPad, 'rotation'), false)
    assert.equal(typeof platedHole.pcb_plated_hole_id, 'string')
    assert.equal(typeof platedHole.x, 'number')
    assert.equal(typeof platedHole.y, 'number')
    assert.deepEqual(platedHole.layers, ['top', 'bottom'])
    assert.deepEqual(sourceTrace.connected_source_net_ids, [
        sourceNet.source_net_id
    ])
    assert.deepEqual(sourceTrace.connected_source_port_ids, [])
})

/**
 * Verifies schematic traces and text use upstream Circuit JSON field names.
 */
test('CircuitJsonModelAdapter emits schema-shaped schematic elements', () => {
    const rendererModel = {
        sourceFormat: 'kicad',
        kind: 'schematic',
        fileType: 'kicad_sch',
        fileName: 'connectivity.kicad_sch',
        summary: { title: 'Connectivity' },
        diagnostics: [],
        schematic: {
            components: [
                {
                    designator: 'U1',
                    value: 'MCU',
                    x: 10,
                    y: 20,
                    width: 4,
                    height: 6
                }
            ],
            pins: [
                {
                    ownerDesignator: 'U1',
                    name: 'GND',
                    pinNumber: '1',
                    x: 12,
                    y: 20,
                    orientation: 'left'
                }
            ],
            nets: [{ name: 'GND' }],
            lines: [
                {
                    kind: 'wire',
                    netName: 'GND',
                    x1: 12,
                    y1: 20,
                    x2: 16,
                    y2: 20,
                    width: 0.15
                }
            ],
            texts: [
                {
                    role: 'label',
                    text: 'GND',
                    x: 16,
                    y: 20
                },
                {
                    role: 'note',
                    text: 'Power return',
                    x: 4,
                    y: 8
                }
            ]
        }
    }

    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(rendererModel)
    const sourceNet = findElement(circuitJson, 'source_net')
    const sourcePort = findElement(circuitJson, 'source_port')
    const sourceTrace = findElement(circuitJson, 'source_trace')
    const schematicTrace = findElement(circuitJson, 'schematic_trace')
    const netLabel = findElement(circuitJson, 'schematic_net_label')
    const schematicText = findElement(circuitJson, 'schematic_text')

    assert.deepEqual(sourceNet.member_source_group_ids, [])
    assert.equal(typeof sourcePort.pin_number, 'number')
    assert.deepEqual(sourceTrace.connected_source_net_ids, [
        sourceNet.source_net_id
    ])
    assert.deepEqual(sourceTrace.connected_source_port_ids, [])
    assert.deepEqual(schematicTrace.junctions, [])
    assert.deepEqual(schematicTrace.edges, [
        {
            from: { x: 12, y: 20 },
            to: { x: 16, y: 20 }
        }
    ])
    assert.deepEqual(netLabel.center, { x: 16, y: 20 })
    assert.equal(netLabel.anchor_side, 'top')
    assert.equal(Object.hasOwn(netLabel, 'anchor_alignment'), false)
    assert.deepEqual(schematicText.position, { x: 4, y: 8 })
    assert.equal(schematicText.anchor, 'center')
    assert.equal(Object.hasOwn(schematicText, 'anchor_position'), false)
})
