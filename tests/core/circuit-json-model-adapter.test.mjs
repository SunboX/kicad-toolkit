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
        diagnostics: [
            {
                severity: 'warning',
                message: 'Fake parser warning'
            }
        ],
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
    const projectMetadata = findElement(circuitJson, 'source_project_metadata')
    assert.equal(projectMetadata.conversion_stats?.summary?.componentCount, 1)
    assert.equal(projectMetadata.conversion_stats?.summary?.layerCount, 2)
    assert.equal(projectMetadata.conversion_stats?.elements?.pcb_trace, 1)
    assert.deepEqual(projectMetadata.diagnostics, [
        {
            severity: 'warning',
            message: 'Fake parser warning'
        }
    ])
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
                    x2: 120,
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
    const pcbPorts = circuitJson.filter((element) => {
        return element.type === 'pcb_port'
    })
    const smtPad = findElement(circuitJson, 'pcb_smtpad')
    const platedHole = findElement(circuitJson, 'pcb_plated_hole')
    const sourceTrace = findElement(circuitJson, 'source_trace')
    const pcbTrace = findElement(circuitJson, 'pcb_trace')
    const startPort = pcbPorts.find((port) => port.x === smtPad.x)
    const endPort = pcbPorts.find((port) => port.x === platedHole.x)

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
    assert.deepEqual(sourceTrace.connected_source_port_ids, [
        startPort.source_port_id,
        endPort.source_port_id
    ])
    assert.equal(pcbTrace.route[0].start_pcb_port_id, startPort.pcb_port_id)
    assert.equal(pcbTrace.route[1].end_pcb_port_id, endPort.pcb_port_id)
})

/**
 * Verifies connected copper primitives are exported as one contiguous route.
 */
test('CircuitJsonModelAdapter stitches connected PCB traces through vias', () => {
    const rendererModel = {
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileType: 'kicad_pcb',
        fileName: 'stitched-route.kicad_pcb',
        summary: {
            title: 'Stitched Route',
            boardWidthMil: 500,
            boardHeightMil: 300,
            layerCount: 2
        },
        diagnostics: [],
        pcb: {
            boardOutline: {
                widthMil: 500,
                heightMil: 300,
                minX: 0,
                minY: 0
            },
            nets: [{ name: 'NET_A' }],
            components: [
                { componentIndex: 1, designator: 'J1', x: 0, y: 0 },
                { componentIndex: 2, designator: 'J2', x: 300, y: 0 }
            ],
            pads: [
                {
                    componentIndex: 1,
                    name: '1',
                    x: 0,
                    y: 0,
                    sizeTopX: 40,
                    sizeTopY: 40,
                    shapeTopName: 'rect',
                    layer: 'F.Cu',
                    netName: 'NET_A'
                },
                {
                    componentIndex: 2,
                    name: '1',
                    x: 300,
                    y: 0,
                    sizeTopX: 40,
                    sizeTopY: 40,
                    shapeTopName: 'rect',
                    layer: 'B.Cu',
                    netName: 'NET_A'
                }
            ],
            tracks: [
                {
                    x1: 0,
                    y1: 0,
                    x2: 100,
                    y2: 0,
                    width: 10,
                    layer: 'F.Cu',
                    netName: 'NET_A'
                },
                {
                    x1: 100,
                    y1: 0,
                    x2: 300,
                    y2: 0,
                    width: 10,
                    layer: 'B.Cu',
                    netName: 'NET_A'
                }
            ],
            vias: [
                {
                    x: 100,
                    y: 0,
                    diameter: 30,
                    holeDiameter: 12,
                    layers: ['F.Cu', 'B.Cu'],
                    netName: 'NET_A'
                }
            ]
        }
    }

    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(rendererModel)
    const traces = circuitJson.filter((element) => {
        return element.type === 'pcb_trace'
    })
    const route = traces[0].route
    const sourceTrace = findElement(circuitJson, 'source_trace')
    const sourcePorts = circuitJson.filter((element) => {
        return element.type === 'source_port'
    })

    assert.equal(traces.length, 1)
    assert.equal(route.length, 4)
    assert.equal(route[0].route_type, 'wire')
    assert.equal(route[0].layer, 'top')
    assert.equal(route[1].route_type, 'wire')
    assert.equal(route[1].layer, 'top')
    assert.equal(route[2].route_type, 'via')
    assert.equal(route[2].from_layer, 'top')
    assert.equal(route[2].to_layer, 'bottom')
    assert.equal(route[3].route_type, 'wire')
    assert.equal(route[3].layer, 'bottom')
    assert.deepEqual(
        sourceTrace.connected_source_port_ids.toSorted(),
        sourcePorts.map((port) => port.source_port_id).toSorted()
    )
    assert.equal(
        circuitJson.filter((element) => element.type === 'pcb_via').length,
        1
    )
})

/**
 * Verifies PCB arcs are represented as sampled Circuit JSON routes.
 */
test('CircuitJsonModelAdapter emits PCB arc routes', () => {
    const rendererModel = {
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileType: 'kicad_pcb',
        fileName: 'arc-route.kicad_pcb',
        summary: {
            title: 'Arc Route',
            boardWidthMil: 300,
            boardHeightMil: 300,
            layerCount: 2
        },
        diagnostics: [],
        pcb: {
            boardOutline: {
                widthMil: 300,
                heightMil: 300,
                minX: 0,
                minY: 0
            },
            components: [
                { componentIndex: 1, designator: 'J1', x: 100, y: 0 },
                { componentIndex: 2, designator: 'J2', x: 0, y: 100 }
            ],
            pads: [
                {
                    componentIndex: 1,
                    name: '1',
                    x: 100,
                    y: 0,
                    sizeTopX: 40,
                    sizeTopY: 40,
                    shapeTopName: 'circle',
                    layer: 'F.Cu',
                    netName: 'ARC'
                },
                {
                    componentIndex: 2,
                    name: '1',
                    x: 0,
                    y: 100,
                    sizeTopX: 40,
                    sizeTopY: 40,
                    shapeTopName: 'circle',
                    layer: 'F.Cu',
                    netName: 'ARC'
                }
            ],
            tracks: [],
            arcs: [
                {
                    x: 0,
                    y: 0,
                    radius: 100,
                    startAngle: 0,
                    sweepAngle: 90,
                    width: 8,
                    layer: 'F.Cu',
                    netName: 'ARC'
                }
            ],
            vias: []
        }
    }

    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(rendererModel)
    const pcbTrace = findElement(circuitJson, 'pcb_trace')
    const sourceTrace = findElement(circuitJson, 'source_trace')

    assert.ok(pcbTrace.route.length > 2)
    assert.deepEqual(
        pcbTrace.route.map((point) => point.route_type),
        Array.from({ length: pcbTrace.route.length }, () => 'wire')
    )
    assert.equal(pcbTrace.route[0].layer, 'top')
    assert.equal(sourceTrace.connected_source_port_ids.length, 2)
})

/**
 * Verifies zones, component function types, and via layer spans are preserved.
 */
test('CircuitJsonModelAdapter emits copper pours and richer metadata', () => {
    const rendererModel = {
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileType: 'kicad_pcb',
        fileName: 'metadata.kicad_pcb',
        summary: {
            title: 'Metadata',
            boardWidthMil: 500,
            boardHeightMil: 500,
            layerCount: 4
        },
        diagnostics: [],
        pcb: {
            boardOutline: {
                widthMil: 500,
                heightMil: 500,
                minX: 0,
                minY: 0
            },
            components: [
                {
                    componentIndex: 1,
                    designator: 'R1',
                    x: 100,
                    y: 100,
                    pattern: 'R_0603',
                    value: '10k'
                }
            ],
            pads: [],
            tracks: [],
            vias: [
                {
                    x: 250,
                    y: 250,
                    diameter: 28,
                    holeDiameter: 10,
                    layers: ['F.Cu', 'In1.Cu'],
                    netName: 'GND'
                }
            ],
            polygons: [
                {
                    layer: 'B.Cu',
                    netName: 'GND',
                    segments: [
                        { x1: 10, y1: 10, x2: 100, y2: 10 },
                        { x1: 100, y1: 10, x2: 100, y2: 100 },
                        { x1: 100, y1: 100, x2: 10, y2: 100 },
                        { x1: 10, y1: 100, x2: 10, y2: 10 }
                    ]
                }
            ]
        }
    }

    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(rendererModel)
    const sourceComponent = findElement(circuitJson, 'source_component')
    const copperPour = findElement(circuitJson, 'pcb_copper_pour')
    const via = findElement(circuitJson, 'pcb_via')

    assert.equal(sourceComponent.ftype, 'simple_resistor')
    assert.equal(copperPour.shape, 'polygon')
    assert.equal(copperPour.layer, 'bottom')
    assert.equal(copperPour.net_name, 'GND')
    assert.equal(copperPour.points.length, 5)
    assert.deepEqual(via.layers, ['top', 'inner1'])
})

/**
 * Verifies component typing, supplier metadata, port labels, and pad shapes.
 */
test('CircuitJsonModelAdapter emits richer source component metadata', () => {
    const rendererModel = {
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileType: 'kicad_pcb',
        fileName: 'function-metadata.kicad_pcb',
        summary: {
            title: 'Function Metadata',
            boardWidthMil: 800,
            boardHeightMil: 400,
            layerCount: 2
        },
        diagnostics: [],
        pcb: {
            boardOutline: {
                widthMil: 800,
                heightMil: 400,
                minX: 0,
                minY: 0
            },
            components: [
                {
                    componentIndex: 1,
                    designator: 'J1',
                    x: 50,
                    y: 50,
                    pattern: 'Connector_PinHeader_1x02',
                    value: 'Header'
                },
                {
                    componentIndex: 2,
                    designator: 'SW1',
                    x: 150,
                    y: 50,
                    pattern: 'Switch_Tactile',
                    value: 'Button'
                },
                {
                    componentIndex: 3,
                    designator: 'FID1',
                    x: 250,
                    y: 50,
                    pattern: 'Fiducial_1mm',
                    value: 'Fiducial'
                },
                {
                    componentIndex: 4,
                    designator: 'TP1',
                    x: 350,
                    y: 50,
                    pattern: 'TestPoint_Pad_1mm',
                    value: 'Test point'
                },
                {
                    componentIndex: 5,
                    designator: 'U1',
                    x: 450,
                    y: 50,
                    pattern: 'Package_Metadata',
                    value: 'Driver',
                    properties: {
                        'Manufacturer Part Number': 'MP-42',
                        'Alpha Supply Part #': 'AS-100, AS-200',
                        'Beta Supply Part Number': 'BS-300'
                    }
                }
            ],
            pads: [
                {
                    componentIndex: 1,
                    number: '11',
                    x: 40,
                    y: 50,
                    sizeTopX: 40,
                    sizeTopY: 40,
                    shapeTopName: 'rect',
                    layer: 'F.Cu'
                },
                {
                    componentIndex: 1,
                    number: 'R',
                    x: 60,
                    y: 50,
                    sizeTopX: 40,
                    sizeTopY: 40,
                    shapeTopName: 'rect',
                    layer: 'F.Cu'
                },
                {
                    componentIndex: 5,
                    number: '1',
                    x: 450,
                    y: 50,
                    sizeTopX: 80,
                    sizeTopY: 40,
                    shapeTopName: 'roundrect',
                    layer: 'F.Cu'
                }
            ],
            tracks: [],
            vias: []
        }
    }

    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(rendererModel)
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
    const metadataComponent = sourceComponents.get('U1')
    const roundRectPad = findElement(circuitJson, 'pcb_smtpad', (pad) => {
        return pad.pcb_component_id.endsWith('_5') && pad.x === 11.43
    })

    assert.equal(sourceComponents.get('J1').ftype, 'simple_pin_header')
    assert.equal(sourceComponents.get('SW1').ftype, 'simple_switch')
    assert.equal(sourceComponents.get('FID1').ftype, 'simple_fiducial')
    assert.equal(sourceComponents.get('TP1').ftype, 'simple_test_point')
    assert.equal(metadataComponent.manufacturer_part_number, 'MP-42')
    assert.deepEqual(metadataComponent.supplier_part_numbers, {
        alpha_supply: ['AS-100', 'AS-200'],
        beta_supply: ['BS-300']
    })
    assert.equal(numericPort.name, 'pin11')
    assert.deepEqual(numericPort.port_hints, ['pin11', '11'])
    assert.equal(namedPort.pin_number, undefined)
    assert.deepEqual(namedPort.port_hints, ['R'])
    assert.equal(roundRectPad.shape, 'rect')
    assert.equal(Object.hasOwn(roundRectPad, 'radius'), false)
    assert.equal(typeof roundRectPad.width, 'number')
    assert.equal(typeof roundRectPad.height, 'number')
})

/**
 * Verifies pad geometry normalization preserves rounded and rotated SMT detail.
 */
test('CircuitJsonModelAdapter preserves rounded and rotated SMT pad geometry', () => {
    const rendererModel = {
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileType: 'kicad_pcb',
        fileName: 'pad-fidelity.kicad_pcb',
        summary: {
            title: 'Pad Fidelity',
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
            components: [
                {
                    componentIndex: 1,
                    designator: 'U1',
                    x: 0,
                    y: 0,
                    layer: 'TOP'
                }
            ],
            pads: [
                {
                    componentIndex: 1,
                    number: '1',
                    x: 100,
                    y: 100,
                    sizeTopX: 80,
                    sizeTopY: 40,
                    shapeTopName: 'roundrect',
                    roundrectRatio: 0.25,
                    rotation: 90,
                    layer: 'F.Cu'
                },
                {
                    componentIndex: 1,
                    number: '2',
                    x: 200,
                    y: 100,
                    sizeTopX: 100,
                    sizeTopY: 40,
                    shapeTopName: 'oval',
                    rotation: 45,
                    layer: 'F.Cu'
                }
            ],
            tracks: [],
            vias: []
        }
    }

    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(rendererModel)
    const pads = circuitJson.filter((element) => {
        return element.type === 'pcb_smtpad'
    })
    const roundRectPad = pads.find((pad) => pad.port_hints.includes('pin1'))
    const rotatedPillPad = pads.find((pad) => pad.port_hints.includes('pin2'))

    assert.equal(roundRectPad.shape, 'rect')
    assert.equal(roundRectPad.width, 1.016)
    assert.equal(roundRectPad.height, 2.032)
    assert.equal(roundRectPad.corner_radius, 0.254)
    assert.equal(Object.hasOwn(roundRectPad, 'ccw_rotation'), false)
    assert.equal(rotatedPillPad.shape, 'rotated_pill')
    assert.equal(rotatedPillPad.ccw_rotation, 45)
    assert.equal(rotatedPillPad.radius, 0.508)
})

/**
 * Verifies custom pad primitive polygons survive renderer-model adaptation.
 */
test('CircuitJsonModelAdapter projects custom SMT pad polygons', () => {
    const rendererModel = {
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileType: 'kicad_pcb',
        fileName: 'custom-pad.kicad_pcb',
        summary: {
            title: 'Custom Pad',
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
            components: [
                {
                    componentIndex: 1,
                    designator: 'U1',
                    x: 0,
                    y: 0,
                    layer: 'TOP'
                }
            ],
            pads: [
                {
                    componentIndex: 1,
                    number: '1',
                    x: 300,
                    y: 200,
                    sizeTopX: 40,
                    sizeTopY: 40,
                    shapeTopName: 'custom',
                    layer: 'F.Cu',
                    customPrimitives: [
                        {
                            type: 'polygon',
                            points: [
                                { x: -0.5, y: -0.25 },
                                { x: 0.5, y: -0.25 },
                                { x: 0, y: 0.5 }
                            ]
                        }
                    ]
                },
                {
                    componentIndex: 1,
                    number: '2',
                    x: 400,
                    y: 200,
                    sizeTopX: 60,
                    sizeTopY: 40,
                    shapeTopName: 'custom',
                    layer: 'F.Cu',
                    customPrimitives: []
                }
            ],
            tracks: [],
            vias: []
        }
    }

    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(rendererModel)
    const customPad = findElement(circuitJson, 'pcb_smtpad', (pad) => {
        return pad.port_hints.includes('pin1')
    })
    const fallbackPad = findElement(circuitJson, 'pcb_smtpad', (pad) => {
        return pad.port_hints.includes('pin2')
    })

    assert.equal(customPad.shape, 'polygon')
    assert.deepEqual(customPad.points, [
        { x: 7.12, y: 4.83 },
        { x: 8.12, y: 4.83 },
        { x: 7.62, y: 5.58 }
    ])
    assert.equal(Object.hasOwn(customPad, 'width'), false)
    assert.equal(Object.hasOwn(customPad, 'height'), false)
    assert.equal(fallbackPad.shape, 'rect')
    assert.equal(fallbackPad.width, 1.524)
    assert.equal(fallbackPad.height, 1.016)
    assert.equal(Object.hasOwn(fallbackPad, 'points'), false)
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

/**
 * Verifies schematic nets are emitted as grouped traces with linked ports.
 */
test('CircuitJsonModelAdapter emits grouped schematic traces from parsed nets', () => {
    const leftPin = {
        ownerDesignator: 'R1',
        pinNumber: '1',
        name: 'A',
        x: 10,
        y: 10,
        orientation: 'right'
    }
    const rightPin = {
        ownerDesignator: 'R2',
        pinNumber: '2',
        name: 'B',
        x: 30,
        y: 10,
        orientation: 'left'
    }
    const rendererModel = {
        sourceFormat: 'kicad',
        kind: 'schematic',
        fileType: 'kicad_sch',
        fileName: 'grouped-trace.kicad_sch',
        summary: { title: 'Grouped Trace' },
        diagnostics: [],
        schematic: {
            components: [
                {
                    designator: 'R1',
                    value: '1k',
                    x: 8,
                    y: 10,
                    width: 4,
                    height: 2
                },
                {
                    designator: 'R2',
                    value: '2k',
                    x: 32,
                    y: 10,
                    width: 4,
                    height: 2
                }
            ],
            pins: [leftPin, rightPin],
            nets: [
                {
                    name: 'NET_A',
                    segments: [
                        { x1: 10, y1: 10, x2: 20, y2: 10 },
                        { x1: 20, y1: 10, x2: 30, y2: 10 }
                    ],
                    junctions: [{ x: 20, y: 10 }],
                    pins: [leftPin, rightPin]
                }
            ],
            lines: [
                {
                    kind: 'wire',
                    netName: 'NET_A',
                    x1: 10,
                    y1: 10,
                    x2: 20,
                    y2: 10,
                    width: 0.15
                },
                {
                    kind: 'wire',
                    netName: 'NET_A',
                    x1: 20,
                    y1: 10,
                    x2: 30,
                    y2: 10,
                    width: 0.15
                }
            ],
            texts: [
                {
                    role: 'label',
                    text: 'NET_A',
                    x: 20,
                    y: 10
                }
            ]
        }
    }

    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(rendererModel)
    const sourceNet = findElement(circuitJson, 'source_net', (element) => {
        return element.name === 'NET_A'
    })
    const sourcePorts = circuitJson.filter((element) => {
        return element.type === 'source_port'
    })
    const traces = circuitJson.filter((element) => {
        return element.type === 'schematic_trace'
    })
    const trace = traces[0]
    const sourceTrace = findElement(circuitJson, 'source_trace')

    assert.equal(traces.length, 1)
    assert.deepEqual(sourceTrace.connected_source_net_ids, [
        sourceNet.source_net_id
    ])
    assert.deepEqual(
        sourceTrace.connected_source_port_ids.toSorted(),
        sourcePorts.map((port) => port.source_port_id).toSorted()
    )
    assert.deepEqual(trace.junctions, [{ x: 20, y: 10 }])
    assert.deepEqual(trace.edges, [
        {
            from: { x: 10, y: 10 },
            to: { x: 20, y: 10 }
        },
        {
            from: { x: 20, y: 10 },
            to: { x: 30, y: 10 }
        }
    ])
})
