// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    CircuitJsonConformanceChecker,
    CircuitJsonModelAdapter
} from '../../src/parser.mjs'

/**
 * Returns Circuit JSON source nets keyed by their preserved source label.
 * @param {object[]} circuitJson Circuit JSON element array.
 * @returns {Map<string, Record<string, unknown>>}
 */
function sourceNetsByRawName(circuitJson) {
    return new Map(
        circuitJson
            .filter((element) => element.type === 'source_net')
            .map((element) => [element.raw_name || element.name, element])
    )
}

/**
 * Verifies source net names become stable identifiers while raw labels remain
 * available for display and round-trip workflows.
 */
test('CircuitJsonModelAdapter canonicalizes source net names and preserves raw labels', () => {
    const rendererModel = {
        sourceFormat: 'kicad',
        kind: 'project',
        fileType: 'kicad_project',
        fileName: 'canonical-net-names.kicad_pro',
        summary: {
            title: 'Canonical Net Names',
            boardWidthMil: 100,
            boardHeightMil: 100
        },
        diagnostics: [],
        pcb: {
            boardOutline: {
                widthMil: 100,
                heightMil: 100,
                minX: 0,
                minY: 0
            },
            nets: [
                { name: '+5V' },
                { name: 'Net-(D5-A)' },
                { name: 'Net:D5/A' }
            ],
            components: [],
            pads: [],
            tracks: [],
            vias: [],
            polygons: [
                {
                    layer: 'F.Cu',
                    netName: 'Net-(D5-A)',
                    points: [
                        { x: 10, y: 10 },
                        { x: 30, y: 10 },
                        { x: 30, y: 30 },
                        { x: 10, y: 30 }
                    ]
                }
            ]
        },
        schematic: {
            components: [],
            pins: [],
            nets: [{ name: '1V8' }],
            lines: [],
            texts: [
                {
                    role: 'label',
                    text: 'VCC+',
                    x: 0,
                    y: 0
                }
            ]
        }
    }

    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(rendererModel)
    const sourceNets = sourceNetsByRawName(circuitJson)
    const sourceNetNames = circuitJson
        .filter((element) => element.type === 'source_net')
        .map((element) => element.name)
    const copperPour = circuitJson.find(
        (element) => element.type === 'pcb_copper_pour'
    )

    assert.equal(sourceNets.get('+5V').name, 'P5V')
    assert.equal(sourceNets.get('+5V').raw_name, '+5V')
    assert.equal(sourceNets.get('Net-(D5-A)').name, 'Net_D5_A')
    assert.equal(sourceNets.get('Net:D5/A').name, 'Net_D5_A_2')
    assert.equal(sourceNets.get('1V8').name, 'net_1V8')
    assert.equal(sourceNets.get('VCC+').name, 'VCC_P')
    assert.equal(copperPour.net_name, 'Net_D5_A')
    assert.equal(copperPour.raw_net_name, 'Net-(D5-A)')
    assert.equal(new Set(sourceNetNames).size, sourceNetNames.length)
})

/**
 * Builds a small valid PCB renderer model with source-port and source-trace
 * references for conformance checks.
 * @returns {Record<string, unknown>}
 */
function validPcbRendererModel() {
    return {
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileType: 'kicad_pcb',
        fileName: 'conformance.kicad_pcb',
        summary: {
            title: 'Conformance',
            boardWidthMil: 200,
            boardHeightMil: 100,
            layerCount: 2
        },
        diagnostics: [],
        pcb: {
            boardOutline: {
                widthMil: 200,
                heightMil: 100,
                minX: 0,
                minY: 0
            },
            nets: [{ name: 'GND' }],
            components: [
                { componentIndex: 1, designator: 'J1', x: 0, y: 0 },
                { componentIndex: 2, designator: 'J2', x: 100, y: 0 }
            ],
            pads: [
                {
                    componentIndex: 1,
                    name: '1',
                    x: 0,
                    y: 0,
                    sizeTopX: 20,
                    sizeTopY: 20,
                    shapeTopName: 'rect',
                    layer: 'F.Cu',
                    netName: 'GND'
                },
                {
                    componentIndex: 2,
                    name: '1',
                    x: 100,
                    y: 0,
                    sizeTopX: 20,
                    sizeTopY: 20,
                    shapeTopName: 'rect',
                    layer: 'F.Cu',
                    netName: 'GND'
                }
            ],
            tracks: [
                {
                    x1: 0,
                    y1: 0,
                    x2: 100,
                    y2: 0,
                    width: 8,
                    layer: 'F.Cu',
                    netName: 'GND'
                }
            ],
            vias: []
        }
    }
}

/**
 * Verifies the conformance checker reports clean generated output and catches
 * broken source-trace and PCB-port references.
 */
test('CircuitJsonConformanceChecker validates generated reference integrity', () => {
    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(
        validPcbRendererModel()
    )
    const metadata = circuitJson.find(
        (element) => element.type === 'source_project_metadata'
    )
    const report = CircuitJsonConformanceChecker.check(circuitJson)
    const brokenReport = CircuitJsonConformanceChecker.check([
        ...circuitJson,
        {
            type: 'pcb_trace',
            pcb_trace_id: 'pcb_trace_orphan',
            source_trace_id: 'missing_source_trace',
            route: [
                {
                    route_type: 'wire',
                    x: 0,
                    y: 0,
                    width: 0.2,
                    layer: 'top',
                    start_pcb_port_id: 'missing_pcb_port'
                }
            ]
        }
    ])

    assert.equal(metadata.conversion_stats.conformance.valid, true)
    assert.equal(metadata.conversion_stats.conformance.errorCount, 0)
    assert.equal(
        metadata.conversion_stats.conformance.checkedReferenceCount > 0,
        true
    )
    assert.equal(report.valid, true)
    assert.equal(report.errorCount, 0)
    assert.equal(brokenReport.valid, false)
    assert.deepEqual(
        brokenReport.diagnostics.map((diagnostic) => diagnostic.code).sort(),
        ['missing_pcb_port', 'missing_source_trace']
    )
})
