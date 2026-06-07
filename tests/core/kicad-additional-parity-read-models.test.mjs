// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    KicadParser,
    KicadPcbDimensionReadModelBuilder,
    KicadPcbLayerStackReadModelBuilder,
    KicadPcbRegionSemanticsBuilder,
    KicadSchematicOwnershipGraphBuilder
} from '../../src/parser.mjs'

test('KicadPcbLayerStackReadModelBuilder summarizes KiCad stackup material layers', () => {
    const report = KicadPcbLayerStackReadModelBuilder.build(createPcb())

    assert.equal(report.schema, 'kicad-toolkit.pcb.layer-stack.a1')
    assert.deepEqual(report.summary, {
        layerCount: 3,
        copperLayerCount: 2,
        dielectricLayerCount: 1,
        materialCount: 2,
        totalThicknessMm: 1.67,
        totalThicknessMil: 65.748,
        stackupDeclared: true,
        dielectricConstraints: true,
        edgeConnector: 'bevelled',
        castellatedPads: false,
        edgePlating: true,
        diagnosticCount: 0
    })
    assert.deepEqual(report.layers, [
        {
            index: 0,
            name: 'F.Cu',
            layerKey: 'F.Cu',
            type: 'copper',
            role: 'copper',
            material: 'Copper',
            color: '#c83434',
            thicknessMm: 0.035,
            thicknessMil: 1.378,
            epsilonR: 0,
            lossTangent: 0,
            uuid: 'stack-front'
        },
        {
            index: 1,
            name: 'dielectric',
            layerKey: 'dielectric-1',
            type: 'core',
            role: 'dielectric',
            material: 'FR4',
            color: '',
            thicknessMm: 1.6,
            thicknessMil: 62.992,
            epsilonR: 4.2,
            lossTangent: 0.02,
            uuid: 'stack-core'
        },
        {
            index: 2,
            name: 'B.Cu',
            layerKey: 'B.Cu',
            type: 'copper',
            role: 'copper',
            material: 'Copper',
            color: '#c83434',
            thicknessMm: 0.035,
            thicknessMil: 1.378,
            epsilonR: 0,
            lossTangent: 0,
            uuid: 'stack-back'
        }
    ])
    assert.deepEqual(report.indexes.layersByName, {
        'B.Cu': 2,
        'F.Cu': 0,
        dielectric: 1
    })
})

test('KicadPcbDimensionReadModelBuilder promotes dimension graphics to read model rows', () => {
    const report = KicadPcbDimensionReadModelBuilder.build(createPcb())

    assert.equal(report.schema, 'kicad-toolkit.pcb.dimensions.a1')
    assert.deepEqual(report.summary, {
        dimensionCount: 1,
        measuredDimensionCount: 1,
        textCount: 1,
        layerCount: 1
    })
    assert.deepEqual(report.dimensions, [
        {
            dimensionIndex: 0,
            key: 'dimension-0',
            kind: 'aligned',
            layerKey: 'Dwgs.User',
            ownerId: 'board',
            sourceType: 'dimension',
            pointCount: 2,
            points: [
                { x: 0, y: 0 },
                { x: 25.4, y: 0 }
            ],
            measuredValue: 25.4,
            unit: 'mm',
            text: '25.4 mm',
            textLocation: { x: 12.7, y: -2 },
            strokeWidth: 0.15
        }
    ])
    assert.deepEqual(report.indexes.dimensionsByLayer, {
        'Dwgs.User': ['dimension-0']
    })
})

test('KicadPcbRegionSemanticsBuilder reports KiCad keepout zones and board regions', () => {
    const pcb = createPcb()
    pcb.boardRegions = [
        {
            name: 'Flex tail',
            layerStackId: 'substack-flex',
            isFlexRegion: true,
            bendingLineCount: 2
        }
    ]

    const report = KicadPcbRegionSemanticsBuilder.build(pcb)

    assert.equal(report.schema, 'kicad-toolkit.pcb.region-semantics.a1')
    assert.deepEqual(report.summary, {
        zoneCount: 2,
        keepoutZoneCount: 1,
        copperZoneCount: 1,
        boardRegionCount: 1,
        flexRegionCount: 1,
        rigidRegionCount: 0,
        keepoutTargetCount: 3,
        layerCount: 2
    })
    assert.deepEqual(report.zones, [
        {
            key: 'zone-0',
            zoneIndex: 0,
            kind: 'keepout-zone',
            name: 'Antenna keepout',
            layerKey: 'F.Cu',
            netName: '',
            priority: 2,
            pointCount: 4,
            keepoutTargets: {
                tracks: true,
                vias: false,
                pads: true,
                copperpour: true,
                footprints: false
            }
        },
        {
            key: 'zone-1',
            zoneIndex: 1,
            kind: 'copper-zone',
            name: 'GND pour',
            layerKey: 'B.Cu',
            netName: 'GND',
            priority: 0,
            pointCount: 4,
            keepoutTargets: {}
        }
    ])
    assert.deepEqual(report.boardRegions, [
        {
            key: 'board-region-0',
            name: 'Flex tail',
            layerStackId: 'substack-flex',
            isFlexRegion: true,
            bendingLineCount: 2
        }
    ])
    assert.deepEqual(report.indexes.zonesByLayer, {
        'B.Cu': ['zone-1'],
        'F.Cu': ['zone-0']
    })
})

test('KicadSchematicOwnershipGraphBuilder indexes schematic owner-child links', () => {
    const report = KicadSchematicOwnershipGraphBuilder.build({
        schematic: {
            components: [
                {
                    ownerIndex: 'symbol-u1',
                    designator: 'U1',
                    source: 'Device:R'
                }
            ],
            pins: [
                {
                    ownerIndex: 'symbol-u1',
                    name: 'IN',
                    number: '1'
                }
            ],
            texts: [
                {
                    ownerIndex: 'symbol-u1',
                    propertyName: 'Reference',
                    text: 'U1'
                },
                {
                    recordType: '25',
                    labelKind: 'global',
                    text: 'SIG_IN'
                }
            ],
            sheetSymbols: [
                {
                    ownerIndex: 'sheet-child',
                    name: 'Child',
                    fileName: 'child.kicad_sch'
                }
            ],
            sheetEntries: [
                {
                    ownerIndex: 'sheet-child',
                    name: 'SIG_IN',
                    kind: 'input'
                }
            ],
            directives: [
                {
                    uuid: 'directive-no-erc',
                    text: 'NO_ERC'
                }
            ],
            regions: [
                {
                    uuid: 'rule-area-dnp',
                    doNotPopulate: true
                }
            ],
            nets: [{ name: 'SIG_IN' }]
        }
    })

    assert.equal(report.schema, 'kicad-toolkit.schematic.ownership-graph.a1')
    assert.deepEqual(report.summary, {
        ownerCount: 2,
        recordCount: 7,
        componentCount: 1,
        sheetSymbolCount: 1,
        netCount: 1
    })
    assert.deepEqual(report.childrenByOwnerKey, {
        'sheet-child': ['sheet-entry-0'],
        'symbol-u1': ['pin-0', 'text-0']
    })
    assert.deepEqual(report.parentsByChildKey, {
        'pin-0': { parentKey: 'symbol-u1', ownerKind: 'component' },
        'sheet-entry-0': {
            parentKey: 'sheet-child',
            ownerKind: 'sheet-symbol'
        },
        'text-0': { parentKey: 'symbol-u1', ownerKind: 'component' }
    })
    assert.deepEqual(report.indexes.componentsByDesignator, {
        U1: 'symbol-u1'
    })
})

test('KicadParser attaches stackup dimensions and region semantics sidecars', () => {
    const model = KicadParser.parseArrayBufferToRendererModel(
        'demo.kicad_pcb',
        encodeSource(`
            (kicad_pcb
                (version 20240108)
                (generator "kicad-toolkit-test")
                (layers
                    (0 "F.Cu" signal)
                    (31 "B.Cu" signal)
                    (44 "Edge.Cuts" user)
                    (47 "Dwgs.User" user)
                )
                (setup
                    (stackup
                        (layer "F.Cu" 0
                            (type "copper")
                            (color "#c83434")
                            (thickness 0.035)
                            (material "Copper")
                            (uuid "stack-front")
                        )
                        (layer dielectric 1
                            (type "core")
                            (thickness 1.6)
                            (material "FR4")
                            (epsilon_r 4.2)
                            (loss_tangent 0.02)
                            (uuid "stack-core")
                        )
                        (layer "B.Cu" 2
                            (type "copper")
                            (color "#c83434")
                            (thickness 0.035)
                            (material "Copper")
                            (uuid "stack-back")
                        )
                        (dielectric_constraints yes)
                        (edge_connector bevelled)
                        (edge_plating yes)
                    )
                )
                (net 0 "")
                (net 1 "GND")
                (dimension
                    (type aligned)
                    (layer "Dwgs.User")
                    (pts
                        (xy 0 0)
                        (xy 25.4 0)
                    )
                    (gr_text "25.4 mm"
                        (at 12.7 -2 0)
                        (layer "Dwgs.User")
                    )
                )
                (zone
                    (net 0)
                    (net_name "")
                    (layer "F.Cu")
                    (uuid "keepout-zone")
                    (name "Antenna keepout")
                    (hatch edge 0.5)
                    (priority 2)
                    (keepout
                        (tracks not_allowed)
                        (vias allowed)
                        (pads not_allowed)
                        (copperpour not_allowed)
                        (footprints allowed)
                    )
                    (fill (thermal_gap 0.4) (thermal_bridge_width 0.3))
                    (polygon
                        (pts
                            (xy 0 0)
                            (xy 10 0)
                            (xy 10 10)
                            (xy 0 10)
                        )
                    )
                )
            )
        `)
    )

    assert.equal(model.pcb.layerStack.summary.layerCount, 3)
    assert.equal(model.pcb.dimensions.summary.dimensionCount, 1)
    assert.equal(model.pcb.regionSemantics.summary.keepoutZoneCount, 1)
})

/**
 * Builds a fake normalized PCB with KiCad stackup, dimension, and zone fields.
 * @returns {object}
 */
function createPcb() {
    return {
        setup: createSetup(),
        drawings: [
            {
                id: 'board:dimension:0',
                ownerId: 'board',
                sourceType: 'dimension',
                type: 'dimension',
                dimensionKind: 'aligned',
                layer: 'Dwgs.User',
                strokeWidth: 0.15,
                points: [
                    { x: 0, y: 0 },
                    { x: 25.4, y: 0 }
                ]
            }
        ],
        texts: [
            {
                id: 'board:dimension-text:0',
                ownerId: 'board',
                sourceType: 'dimension',
                value: '25.4 mm',
                x: 12.7,
                y: -2,
                layer: 'Dwgs.User'
            }
        ],
        zoneSemantics: [
            {
                zoneIndex: 0,
                name: 'Antenna keepout',
                layerKey: 'F.Cu',
                netName: '',
                priority: 2,
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 10, y: 10 },
                    { x: 0, y: 10 }
                ],
                keepoutTargets: {
                    tracks: true,
                    vias: false,
                    pads: true,
                    copperpour: true,
                    footprints: false
                }
            },
            {
                zoneIndex: 1,
                name: 'GND pour',
                layerKey: 'B.Cu',
                netName: 'GND',
                priority: 0,
                points: [
                    { x: 0, y: 0 },
                    { x: 20, y: 0 },
                    { x: 20, y: 20 },
                    { x: 0, y: 20 }
                ],
                keepoutTargets: {}
            }
        ],
        boardRegions: []
    }
}

/**
 * Builds KiCad stackup setup metadata.
 * @returns {object}
 */
function createSetup() {
    return {
        stackup: {
            dielectricConstraints: true,
            edgeConnector: 'bevelled',
            castellatedPads: false,
            edgePlating: true,
            layers: [
                {
                    name: 'F.Cu',
                    type: 'copper',
                    color: '#c83434',
                    thickness: 0.035,
                    material: 'Copper',
                    epsilonR: 0,
                    lossTangent: 0,
                    uuid: 'stack-front'
                },
                {
                    name: 'dielectric',
                    type: 'core',
                    color: '',
                    thickness: 1.6,
                    material: 'FR4',
                    epsilonR: 4.2,
                    lossTangent: 0.02,
                    uuid: 'stack-core'
                },
                {
                    name: 'B.Cu',
                    type: 'copper',
                    color: '#c83434',
                    thickness: 0.035,
                    material: 'Copper',
                    epsilonR: 0,
                    lossTangent: 0,
                    uuid: 'stack-back'
                }
            ]
        }
    }
}

/**
 * Encodes a source fixture as UTF-8 bytes.
 * @param {string} source Fixture source.
 * @returns {Uint8Array}
 */
function encodeSource(source) {
    return new TextEncoder().encode(source)
}
