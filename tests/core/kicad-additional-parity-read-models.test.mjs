// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    KicadParser,
    KicadPcb3dModelReadinessReportBuilder,
    KicadPcbDimensionReadModelBuilder,
    KicadPcbFidelityDiagnosticsBuilder,
    KicadPcbLayerUsageReportBuilder,
    KicadPcbLayerStackReadModelBuilder,
    KicadPcbRegionSemanticsBuilder,
    KicadSchematicOwnershipGraphBuilder
} from '../../src/legacy-parser.mjs'

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

test('KicadPcbLayerUsageReportBuilder compares declared and used PCB layers', () => {
    const report = KicadPcbLayerUsageReportBuilder.build({
        layerDefinitions: [
            { ordinal: 0, name: 'F.Cu', type: 'signal', userName: '' },
            { ordinal: 31, name: 'B.Cu', type: 'signal', userName: '' },
            { ordinal: 44, name: 'Edge.Cuts', type: 'user', userName: '' },
            { ordinal: 47, name: 'Dwgs.User', type: 'user', userName: '' },
            { ordinal: 48, name: 'F.Fab', type: 'user', userName: '' }
        ],
        tracks: [{ layer: 'F.Cu' }],
        vias: [{ layers: ['F.Cu', 'B.Cu'] }],
        pads: [{ layers: ['F.Cu', 'B.Cu'] }],
        polygons: [{ layer: 'F.Cu' }, { layer: 'User.Drawings' }],
        drawings: [{ type: 'line', layer: 'Edge.Cuts' }],
        texts: [{ layer: 'Dwgs.User' }]
    })

    assert.equal(report.schema, 'kicad-toolkit.pcb.layer-usage.a1')
    assert.deepEqual(report.summary, {
        declaredLayerCount: 5,
        usedLayerCount: 5,
        declaredUsedLayerCount: 4,
        declaredUnusedLayerCount: 1,
        undeclaredUsedLayerCount: 1,
        useRecordCount: 9,
        diagnosticCount: 1
    })
    assert.deepEqual(report.layersByKey['F.Cu'], {
        layerKey: 'F.Cu',
        ordinal: 0,
        declared: true,
        used: true,
        useCount: 4,
        useKinds: ['pad', 'polygon', 'track', 'via'],
        type: 'signal',
        userName: '',
        side: 'front',
        layerClass: 'copper',
        isCopper: true,
        isTechnical: false
    })
    assert.deepEqual(report.layersByKey['F.Fab'], {
        layerKey: 'F.Fab',
        ordinal: 48,
        declared: true,
        used: false,
        useCount: 0,
        useKinds: [],
        type: 'user',
        userName: '',
        side: 'front',
        layerClass: 'fabrication',
        isCopper: false,
        isTechnical: true
    })
    assert.deepEqual(report.diagnostics, [
        {
            code: 'kicad.pcb.layer-usage.undeclared-used-layer',
            severity: 'warning',
            layerKey: 'User.Drawings',
            message:
                'KiCad PCB uses a layer that is not present in the declared layer table.'
        }
    ])
    assert.deepEqual(report.indexes.layersByUse.undeclaredUsed, [
        'User.Drawings'
    ])
    assert.deepEqual(report.indexes.layerKeysByKind.pad, ['B.Cu', 'F.Cu'])
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
        zoneWithFillPolicyCount: 2,
        zoneWithConnectPolicyCount: 1,
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
            hatch: { style: 'edge', pitch: 0.5 },
            connectPads: {
                mode: 'thru_hole_only',
                clearance: 0.09144
            },
            minThickness: 0.2,
            fillPolicy: {
                mode: 'solid',
                thermalGap: 0.4,
                thermalBridgeWidth: 0.3,
                smoothing: 'fillet',
                islandRemovalMode: 'minimum_area',
                islandAreaMin: 1.25
            },
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
            fillPolicy: {
                mode: 'hatched',
                thermalGap: 0.5,
                thermalBridgeWidth: 0.25
            },
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

test('KicadPcbFidelityDiagnosticsBuilder flags complex parsed PCB constructs', () => {
    const report = KicadPcbFidelityDiagnosticsBuilder.build(createRiskyPcb())

    assert.equal(report.schema, 'kicad-toolkit.pcb.fidelity-diagnostics.a1')
    assert.deepEqual(report.summary, {
        diagnosticCount: 7,
        warningCount: 5,
        infoCount: 2,
        complexPadCount: 1,
        customPadPrimitiveCount: 2,
        missingFontFaceCount: 0,
        suspiciousTextPayloadCount: 0,
        zonePolicyCount: 2,
        highRiskConstructCount: 3
    })
    assert.deepEqual(
        report.diagnostics.map((diagnostic) => diagnostic.code),
        [
            'kicad.pcb.fidelity.complex-pad',
            'kicad.pcb.fidelity.custom-pad-primitives',
            'kicad.pcb.fidelity.pad-local-policy',
            'kicad.pcb.fidelity.zone-fill-policy',
            'kicad.pcb.fidelity.zone-connect-policy',
            'kicad.pcb.fidelity.thick-arc',
            'kicad.pcb.fidelity.unknown-source-node'
        ]
    )
    assert.deepEqual(report.indexes.diagnosticsBySeverity.warning, [
        'fidelity-0',
        'fidelity-1',
        'fidelity-2',
        'fidelity-5',
        'fidelity-6'
    ])
    assert.deepEqual(report.indexes.diagnosticsByConstruct.pad, [
        'fidelity-0',
        'fidelity-1',
        'fidelity-2'
    ])
})

test('KicadPcbFidelityDiagnosticsBuilder flags suspicious text payloads', () => {
    const report = KicadPcbFidelityDiagnosticsBuilder.build({
        texts: [
            {
                id: 'board-text-replacement',
                value: 'Label\uFFFDBad'
            },
            {
                id: 'board-text-control',
                value: 'Label\u0000Bad\u0001'
            },
            {
                id: 'board-text-ok',
                value: 'Line A\nLine B\tTabbed'
            }
        ],
        footprints: [
            {
                id: 'footprint-u1',
                reference: 'U\uFFFD1',
                value: 'MCU'
            }
        ]
    })

    assert.equal(report.summary.suspiciousTextPayloadCount, 3)
    assert.deepEqual(
        report.diagnostics.map((diagnostic) => ({
            code: diagnostic.code,
            construct: diagnostic.construct,
            sourceKey: diagnostic.sourceKey,
            issues: diagnostic.issues
        })),
        [
            {
                code: 'kicad.pcb.fidelity.suspicious-text-payload',
                construct: 'text',
                sourceKey: 'board-text-replacement',
                issues: ['replacement-character']
            },
            {
                code: 'kicad.pcb.fidelity.suspicious-text-payload',
                construct: 'text',
                sourceKey: 'board-text-control',
                issues: ['null-character', 'control-character']
            },
            {
                code: 'kicad.pcb.fidelity.suspicious-text-payload',
                construct: 'footprint-field',
                sourceKey: 'footprint-u1:reference',
                issues: ['replacement-character']
            }
        ]
    )
})

test('KicadPcb3dModelReadinessReportBuilder summarizes model references and fallbacks', () => {
    const report = KicadPcb3dModelReadinessReportBuilder.build(
        createRiskyPcb(),
        {
            assets: [
                {
                    name: 'body.step',
                    relativePath: 'models/body.step',
                    format: 'step'
                }
            ]
        }
    )

    assert.equal(report.schema, 'kicad-toolkit.pcb.3d-model-readiness.a1')
    assert.deepEqual(report.summary, {
        componentCount: 3,
        componentWithModelCount: 2,
        modelReferenceCount: 3,
        resolvedModelCount: 1,
        unresolvedModelCount: 2,
        fallbackComponentCount: 1,
        formatCount: 3,
        diagnosticCount: 3
    })
    assert.deepEqual(report.indexes.modelsByFormat, {
        package: ['model-2'],
        step: ['model-0'],
        wrl: ['model-1']
    })
    assert.deepEqual(report.indexes.unresolvedModels, ['model-1', 'model-2'])
    assert.deepEqual(
        report.diagnostics.map((diagnostic) => diagnostic.code),
        [
            'kicad.pcb.3d-model.unresolved-reference',
            'kicad.pcb.3d-model.procedural-fallback',
            'kicad.pcb.3d-model.component-without-model'
        ]
    )
})

test('KicadPcb3dModelReadinessReportBuilder suggests deterministic model lookup hints', () => {
    const report = KicadPcb3dModelReadinessReportBuilder.build({
        components: [
            {
                componentIndex: 0,
                designator: 'U1',
                footprintId: 'Package_QFN:QFN-32-1EP_5x5mm_P0.5mm',
                pattern: 'Package_QFN:QFN-32-1EP_5x5mm_P0.5mm',
                x: 10,
                y: 20,
                pads: [
                    {
                        number: '1',
                        x: 9,
                        y: 21
                    },
                    {
                        number: '2',
                        x: 11,
                        y: 19
                    }
                ],
                models: []
            }
        ]
    })

    assert.deepEqual(report.models[0].searchKeys, [
        'PACKAGE',
        'QFN',
        'QFN-32-1EP',
        '32',
        '1EP',
        'EP',
        '5X5MM',
        'P0.5MM',
        '05P'
    ])
    assert.deepEqual(report.models[0].pad1Orientation, {
        padNumber: '1',
        relativeX: -1,
        relativeY: 1,
        suggestedRotationZ: -90
    })
    assert.deepEqual(report.diagnostics[0].suggestedSearchKeys, [
        'PACKAGE',
        'QFN',
        'QFN-32-1EP',
        '32',
        '1EP',
        'EP',
        '5X5MM',
        'P0.5MM',
        '05P'
    ])
    assert.equal(report.diagnostics[0].suggestedRotationZ, -90)
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
                (gr_line
                    (start 0 0)
                    (end 10 0)
                    (stroke (width 0.15) (type solid))
                    (layer "Edge.Cuts")
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
                    (connect_pads thru_hole_only (clearance 0.09144))
                    (min_thickness 0.2)
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
    assert.equal(model.pcb.layerUsage.summary.declaredUnusedLayerCount, 1)
    assert.equal(model.pcb.fidelityDiagnostics.summary.diagnosticCount, 2)
    assert.equal(model.pcb.geometryReadiness.summary.findingCount, 0)
    assert.equal(model.pcb.modelReadiness.summary.componentCount, 0)
    assert.deepEqual(model.pcb.layerUsage.indexes.layersByUse.unusedDeclared, [
        'B.Cu'
    ])
    assert.deepEqual(model.pcb.kicadBoard.zoneSemantics[0].fillPolicy, {
        mode: 'solid',
        thermalGap: 0.4,
        thermalBridgeWidth: 0.3
    })
    assert.deepEqual(model.pcb.regionSemantics.zones[0].connectPads, {
        mode: 'thru_hole_only',
        clearance: 0.09144
    })
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
                hatch: { style: 'edge', pitch: 0.5 },
                connectPads: {
                    mode: 'thru_hole_only',
                    clearance: 0.09144
                },
                minThickness: 0.2,
                fillPolicy: {
                    mode: 'solid',
                    thermalGap: 0.4,
                    thermalBridgeWidth: 0.3,
                    smoothing: 'fillet',
                    islandRemovalMode: 'minimum_area',
                    islandAreaMin: 1.25
                },
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
                fillPolicy: {
                    mode: 'hatched',
                    thermalGap: 0.5,
                    thermalBridgeWidth: 0.25
                },
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
 * Builds a fake PCB with rendering and readiness edge cases.
 * @returns {object}
 */
function createRiskyPcb() {
    return {
        fileName: 'risky-board.kicad_pcb',
        components: [
            {
                componentIndex: 0,
                designator: 'U1',
                footprintId: 'fp-u1',
                modelName: 'body.step',
                modelPath: '${KIPRJMOD}/models/body.step',
                modelTransform: {
                    offset: { x: 0, y: 0, z: 1 },
                    rotate: { x: 0, y: 0, z: 90 },
                    scale: { x: 1, y: 1, z: 1 }
                }
            },
            {
                componentIndex: 1,
                designator: 'J1',
                footprintId: 'fp-j1',
                modelName: 'missing.wrl',
                modelPath: '${KIPRJMOD}/models/missing.wrl'
            },
            {
                componentIndex: 2,
                designator: 'TP1',
                footprintId: 'fp-tp1'
            }
        ],
        pads: [
            {
                id: 'pad-u1-1',
                footprintId: 'fp-u1',
                ownerId: 'fp-u1',
                name: '1',
                shape: 'custom',
                layers: ['F.Cu', 'F.Mask'],
                solderMaskMargin: 0.05,
                solderPasteMargin: -0.02,
                clearance: 0.15,
                zoneConnect: 2,
                thermalBridgeWidth: 0.35,
                thermalGap: 0.22,
                customPrimitives: [
                    {
                        type: 'curve',
                        points: [
                            { x: -0.5, y: 0 },
                            { x: -0.25, y: 0.4 },
                            { x: 0.25, y: -0.4 },
                            { x: 0.5, y: 0 }
                        ]
                    },
                    {
                        type: 'arc',
                        start: { x: -0.5, y: 0 },
                        mid: { x: 0, y: 0.4 },
                        end: { x: 0.5, y: 0 }
                    }
                ]
            }
        ],
        arcs: [
            {
                id: 'arc-0',
                layer: 'F.Cu',
                width: 2.4,
                radius: 1,
                sourceType: 'arc'
            }
        ],
        drawings: [
            {
                id: 'curve-0',
                type: 'curve',
                sourceType: 'gr_curve',
                layer: 'F.SilkS',
                points: [
                    { x: 0, y: 0 },
                    { x: 1, y: 1 },
                    { x: 2, y: -1 },
                    { x: 3, y: 0 }
                ]
            },
            {
                id: 'text-box-0',
                type: 'text_box',
                sourceType: 'gr_text_box',
                layer: 'F.SilkS',
                value: 'BOX'
            }
        ],
        polygons: [
            {
                id: 'zone-0',
                type: 'zone',
                layer: 'F.Cu',
                contours: [[{ x: 0, y: 0 }], [{ x: 1, y: 1 }]]
            }
        ],
        zoneSemantics: [
            {
                zoneIndex: 0,
                layerKey: 'F.Cu',
                fillPolicy: {
                    mode: 'hatched',
                    thermalGap: 0.4,
                    thermalBridgeWidth: 0.3
                },
                connectPads: { mode: 'thru_hole_only', clearance: 0.09144 }
            }
        ],
        kicadBoard: {
            sourceCoverage: {
                nodesByName: {
                    mystery_node: {
                        name: 'mystery_node',
                        known: false,
                        typed: false,
                        count: 1
                    }
                }
            }
        }
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
