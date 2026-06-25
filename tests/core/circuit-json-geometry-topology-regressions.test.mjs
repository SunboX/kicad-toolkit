// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    CircuitJsonConformanceChecker,
    CircuitJsonModelAdapter,
    KicadParser
} from '../../src/parser.mjs'

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
 * Returns a source net by its display or raw name.
 * @param {object[]} circuitJson Circuit JSON element array.
 * @param {string} name Source net name.
 * @returns {Record<string, unknown>}
 */
function sourceNetByName(circuitJson, name) {
    return findElement(circuitJson, 'source_net', (sourceNet) => {
        return sourceNet.name === name || sourceNet.raw_name === name
    })
}

/**
 * Returns a sorted copy of a string array.
 * @param {string[]} values Values to sort.
 * @returns {string[]}
 */
function sorted(values) {
    return [...values].sort((left, right) => left.localeCompare(right))
}

/**
 * Builds a stable key for a physical via point.
 * @param {Record<string, unknown>} via Via-like object.
 * @returns {string}
 */
function viaKey(via) {
    return [via.x, via.y, via.outer_diameter, via.hole_diameter].join(':')
}

/**
 * Returns true when a port and route point occupy the same layer point.
 * @param {Record<string, unknown>} pcbPort PCB port element.
 * @param {Record<string, unknown>} point Route point.
 * @returns {boolean}
 */
function portTouchesRoutePoint(pcbPort, point) {
    if (point.route_type !== 'wire') return false
    if (
        Array.isArray(pcbPort.layers) &&
        pcbPort.layers.length > 0 &&
        !pcbPort.layers.includes(point.layer)
    ) {
        return false
    }

    return (
        Math.abs(Number(pcbPort.x || 0) - Number(point.x || 0)) < 1e-6 &&
        Math.abs(Number(pcbPort.y || 0) - Number(point.y || 0)) < 1e-6
    )
}

/**
 * Returns source port ids physically touched by a trace route.
 * @param {object[]} circuitJson Circuit JSON element array.
 * @param {Record<string, unknown>} pcbTrace PCB trace element.
 * @returns {string[]}
 */
function sourcePortIdsTouchedByTrace(circuitJson, pcbTrace) {
    const ports = elementsOf(circuitJson, 'pcb_port')
    const touched = new Set()

    for (const point of pcbTrace.route || []) {
        for (const port of ports) {
            if (portTouchesRoutePoint(port, point)) {
                touched.add(port.source_port_id)
            }
        }
    }

    return sorted([...touched])
}

/**
 * Builds a renderer PCB fixture with a routed net that crosses an internal pad,
 * a branch, a via, and a separate copper-only net.
 * @returns {Record<string, unknown>}
 */
function topologyRendererModel() {
    return {
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileType: 'kicad_pcb',
        fileName: 'topology-regression.kicad_pcb',
        summary: {
            title: 'Topology Regression',
            boardWidthMil: 800,
            boardHeightMil: 500,
            layerCount: 2
        },
        diagnostics: [],
        pcb: {
            boardOutline: {
                widthMil: 800,
                heightMil: 500,
                minX: 0,
                minY: 0
            },
            nets: [{ name: 'MAIN' }],
            components: [
                { componentIndex: 1, designator: 'J1', x: 0, y: 0 },
                { componentIndex: 2, designator: 'J2', x: 100, y: 0 },
                { componentIndex: 3, designator: 'J3', x: 160, y: 0 },
                { componentIndex: 4, designator: 'J4', x: 100, y: 60 }
            ],
            pads: [
                routingPad(1, 0, 0, 'F.Cu'),
                routingPad(2, 100, 0, 'B.Cu'),
                routingPad(3, 160, 0, 'B.Cu'),
                routingPad(4, 100, 60, 'B.Cu')
            ],
            tracks: [
                routingTrack(0, 0, 50, 0, 'F.Cu', 'MAIN'),
                routingTrack(50, 0, 100, 0, 'B.Cu', 'MAIN'),
                routingTrack(100, 0, 160, 0, 'B.Cu', 'MAIN'),
                routingTrack(100, 0, 100, 60, 'B.Cu', 'MAIN'),
                routingTrack(20, 140, 120, 140, 'F.Cu', 'FLOAT_NET')
            ],
            vias: [
                {
                    x: 50,
                    y: 0,
                    diameter: 32,
                    holeDiameter: 14,
                    layers: ['F.Cu', 'B.Cu'],
                    netName: 'MAIN'
                }
            ]
        }
    }
}

/**
 * Builds a fake routed pad.
 * @param {number} componentIndex Component index.
 * @param {number} x X coordinate in mils.
 * @param {number} y Y coordinate in mils.
 * @param {string} layer KiCad layer.
 * @returns {Record<string, unknown>}
 */
function routingPad(componentIndex, x, y, layer) {
    return {
        componentIndex,
        number: '1',
        x,
        y,
        sizeTopX: 40,
        sizeTopY: 40,
        shapeTopName: 'rect',
        layer,
        netName: 'MAIN'
    }
}

/**
 * Builds a fake routed track.
 * @param {number} x1 Start X coordinate in mils.
 * @param {number} y1 Start Y coordinate in mils.
 * @param {number} x2 End X coordinate in mils.
 * @param {number} y2 End Y coordinate in mils.
 * @param {string} layer KiCad layer.
 * @param {string} netName Net name.
 * @returns {Record<string, unknown>}
 */
function routingTrack(x1, y1, x2, y2, layer, netName) {
    return {
        x1,
        y1,
        x2,
        y2,
        width: 10,
        layer,
        netName
    }
}

/**
 * Builds a fake KiCad PCB fixture with a nearly closed outline and a curved
 * disconnected Edge.Cuts contour.
 * @returns {string}
 */
function curvedContourPcbSource() {
    return `
        (kicad_pcb
            (version 20241229)
            (layers
                (0 "F.Cu" signal)
                (31 "B.Cu" signal)
                (44 "Edge.Cuts" user)
            )
            (gr_line
                (start 0 0)
                (end 30 0)
                (stroke (width 0.1) (type solid))
                (layer "Edge.Cuts")
            )
            (gr_line
                (start 30 0)
                (end 30 20)
                (stroke (width 0.1) (type solid))
                (layer "Edge.Cuts")
            )
            (gr_line
                (start 30 20)
                (end 0 20)
                (stroke (width 0.1) (type solid))
                (layer "Edge.Cuts")
            )
            (gr_line
                (start 0 20)
                (end 0 0.0000004)
                (stroke (width 0.1) (type solid))
                (layer "Edge.Cuts")
            )
            (gr_curve
                (pts (xy 10 8) (xy 12 6) (xy 14 8))
                (stroke (width 0.1) (type solid))
                (layer "Edge.Cuts")
            )
            (gr_line
                (start 14 8)
                (end 14 12)
                (stroke (width 0.1) (type solid))
                (layer "Edge.Cuts")
            )
            (gr_line
                (start 14 12)
                (end 10 12)
                (stroke (width 0.1) (type solid))
                (layer "Edge.Cuts")
            )
            (gr_line
                (start 10 12)
                (end 10 8)
                (stroke (width 0.1) (type solid))
                (layer "Edge.Cuts")
            )
        )
    `
}

/**
 * Builds a fake standalone footprint fixture with rotated text.
 * @returns {string}
 */
function rotatedFootprintTextSource() {
    return `
        (footprint "Fake:Text_Primitive"
            (version 20240108)
            (generator "kicad-toolkit-test")
            (layer "F.Cu")
            (property "Reference" "REF**"
                (at 0 -1 180)
                (layer "F.SilkS")
                (effects (font (size 1.2 0.8) (thickness 0.16)))
            )
            (property "Value" "Text_Primitive"
                (at 0 1 0)
                (layer "F.Fab")
                (effects (font (size 1.1 0.9) (thickness 0.12)))
            )
            (fp_text user "LOCKED"
                (at 1 0 180 unlocked)
                (layer "F.Fab")
                (effects (font (size 0.9 0.7) (thickness 0.1)))
            )
            (pad "1" smd rect
                (at 0 0 0)
                (size 1 1)
                (layers "F.Cu" "F.Mask" "F.Paste")
            )
        )
    `
}

test('Circuit JSON PCB trace topology references nets, ports, and vias consistently', () => {
    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(
        topologyRendererModel()
    )
    const conformance = CircuitJsonConformanceChecker.check(circuitJson)
    const sourceTracesById = new Map(
        elementsOf(circuitJson, 'source_trace').map((sourceTrace) => [
            sourceTrace.source_trace_id,
            sourceTrace
        ])
    )
    const pcbTraces = elementsOf(circuitJson, 'pcb_trace')
    const standaloneViaKeys = new Set(
        elementsOf(circuitJson, 'pcb_via').map(viaKey)
    )
    const routeViaKeys = new Set(
        pcbTraces.flatMap((trace) => {
            return (trace.route || [])
                .filter((point) => point.route_type === 'via')
                .map(viaKey)
        })
    )
    const mainSourceNet = sourceNetByName(circuitJson, 'MAIN')
    const floatingSourceNet = sourceNetByName(circuitJson, 'FLOAT_NET')
    const floatingSourceTrace = [...sourceTracesById.values()].find(
        (sourceTrace) => {
            return sourceTrace.connected_source_net_ids.includes(
                floatingSourceNet.source_net_id
            )
        }
    )

    assert.equal(conformance.valid, true)
    assert.ok(pcbTraces.length >= 2)
    assert.equal(
        pcbTraces.every((trace) => sourceTracesById.has(trace.source_trace_id)),
        true
    )
    assert.equal(
        [...sourceTracesById.values()].every((sourceTrace) => {
            return sourceTrace.connected_source_net_ids.length === 1
        }),
        true
    )
    assert.deepEqual(routeViaKeys, standaloneViaKeys)
    assert.deepEqual(floatingSourceTrace.connected_source_port_ids, [])

    for (const pcbTrace of pcbTraces) {
        const sourceTrace = sourceTracesById.get(pcbTrace.source_trace_id)
        if (
            !sourceTrace.connected_source_net_ids.includes(
                mainSourceNet.source_net_id
            )
        ) {
            continue
        }

        assert.deepEqual(
            sorted(sourceTrace.connected_source_port_ids),
            sourcePortIdsTouchedByTrace(circuitJson, pcbTrace)
        )
    }
})

test('KicadParser keeps the largest Edge.Cuts contour as the board outline', () => {
    const circuitJson = KicadParser.parseArrayBuffer(
        'curved-contours.kicad_pcb',
        bytesFor(curvedContourPcbSource())
    )
    const rendererModel = KicadParser.parseArrayBufferToRendererModel(
        'curved-contours.kicad_pcb',
        bytesFor(curvedContourPcbSource())
    )
    const board = findElement(circuitJson, 'pcb_board')
    const cutout = findElement(circuitJson, 'pcb_cutout')

    assert.equal(board.width, 30)
    assert.equal(board.height, 20)
    assert.equal(board.outline.length, 5)
    assert.equal(cutout.shape, 'polygon')
    assert.ok(cutout.points.length > 5)
    assert.deepEqual(cutout.points[0], cutout.points.at(-1))
    assert.equal(rendererModel.pcb.boardOutline.cutouts.length, 1)
})

test('KicadParser preserves standalone footprint text rotation and font metadata', () => {
    const model = KicadParser.parseArrayBufferToRendererModel(
        'Text_Primitive.kicad_mod',
        bytesFor(rotatedFootprintTextSource())
    )
    const referenceText = model.texts.find((text) => {
        return text.propertyName === 'Reference'
    })
    const valueText = model.texts.find((text) => {
        return text.propertyName === 'Value'
    })
    const userText = model.texts.find((text) => text.value === 'LOCKED')

    assert.equal(model.kind, 'footprint-library')
    assert.equal(model.summary.textCount, 3)
    assert.equal(referenceText.rotation, 0)
    assert.equal(referenceText.sizeX, 1.2)
    assert.equal(referenceText.sizeY, 0.8)
    assert.equal(referenceText.thickness, 0.16)
    assert.equal(valueText.rotation, 0)
    assert.equal(valueText.sizeX, 1.1)
    assert.equal(valueText.sizeY, 0.9)
    assert.equal(userText.rotation, 180)
    assert.equal(userText.sizeX, 0.9)
    assert.equal(userText.sizeY, 0.7)
})
