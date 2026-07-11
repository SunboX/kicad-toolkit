// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    KicadFootprintLibraryParityReportBuilder,
    KicadHostCapabilityDiagnosticsBuilder,
    KicadImagePayloadManifestBuilder,
    KicadParser,
    KicadPcbComponentParticipationPolicy,
    KicadPcbOwnershipGraphBuilder,
    KicadPcbPickPlacePositionResolver,
    KicadPcbPlacedFootprintManifestBuilder,
    KicadPcbReviewMetadataBuilder,
    KicadPcbRouteAnalysisBuilder,
    KicadPcbStatisticsBuilder,
    KicadSchematicHierarchyGraphBuilder
} from '../../src/legacy-parser.mjs'

test('KicadPcbRouteAnalysisBuilder groups routed copper by net and layer', () => {
    const report = KicadPcbRouteAnalysisBuilder.build(createPcbModel().pcb)

    assert.equal(report.schema, 'kicad-toolkit.pcb.route-analysis.a1')
    assert.deepEqual(report.summary, {
        netCount: 2,
        routedNetCount: 1,
        routePrimitiveCount: 2,
        viaCount: 1,
        totalLengthMil: 178.54,
        connectedRouteGroupCount: 3,
        differentialPairCount: 0
    })
    assert.deepEqual(report.byNet, [
        {
            name: 'GND',
            netName: 'GND',
            routed: true,
            routePrimitiveCount: 2,
            viaCount: 1,
            totalLengthMil: 178.54,
            trackLengthMil: 100,
            arcLengthMil: 78.54,
            layers: ['F.Cu', 'B.Cu'],
            layerParticipation: [
                {
                    layerKey: 'B.Cu',
                    primitiveKeys: ['arc-0'],
                    routePrimitiveCount: 1,
                    viaCount: 0,
                    totalLengthMil: 78.54
                },
                {
                    layerKey: 'F.Cu',
                    primitiveKeys: ['track-0'],
                    routePrimitiveCount: 1,
                    viaCount: 0,
                    totalLengthMil: 100
                },
                {
                    layerKey: 'via',
                    primitiveKeys: ['via-0'],
                    routePrimitiveCount: 0,
                    viaCount: 1,
                    totalLengthMil: 0
                }
            ],
            connectedRouteGroups: [
                {
                    key: 'route-gnd-b-cu',
                    layerKeys: ['B.Cu'],
                    primitiveKeys: ['arc-0'],
                    totalLengthMil: 78.54
                },
                {
                    key: 'route-gnd-f-cu',
                    layerKeys: ['F.Cu'],
                    primitiveKeys: ['track-0'],
                    totalLengthMil: 100
                },
                {
                    key: 'route-gnd-via',
                    layerKeys: ['via'],
                    primitiveKeys: ['via-0'],
                    totalLengthMil: 0
                }
            ],
            primitives: [
                {
                    primitiveKey: 'track-0',
                    kind: 'track',
                    netName: 'GND',
                    layerKey: 'F.Cu',
                    layerDisplayName: 'F.Cu',
                    lengthMil: 100,
                    endpoints: [
                        { x: 0, y: 0 },
                        { x: 100, y: 0 }
                    ]
                },
                {
                    primitiveKey: 'arc-0',
                    kind: 'arc',
                    netName: 'GND',
                    layerKey: 'B.Cu',
                    layerDisplayName: 'B.Cu',
                    lengthMil: 78.54,
                    endpoints: [
                        { x: 25, y: -25 },
                        { x: -25, y: 25 }
                    ]
                }
            ],
            vias: [
                {
                    primitiveKey: 'via-0',
                    kind: 'via',
                    netName: 'GND',
                    layerKey: 'via',
                    layerDisplayName: 'via',
                    point: { x: 50, y: 0 }
                }
            ]
        },
        {
            name: 'SIG_A',
            netName: 'SIG_A',
            routed: false,
            routePrimitiveCount: 0,
            viaCount: 0,
            totalLengthMil: 0,
            trackLengthMil: 0,
            arcLengthMil: 0,
            layers: [],
            layerParticipation: [],
            connectedRouteGroups: [],
            primitives: [],
            vias: []
        }
    ])
    assert.deepEqual(report.differentialPairs, [])
})

test('KicadPcbStatisticsBuilder builds deterministic board QA summaries', () => {
    const report = KicadPcbStatisticsBuilder.build(createPcbModel().pcb)

    assert.equal(report.schema, 'kicad-toolkit.pcb.statistics.a1')
    assert.deepEqual(report.board, {
        widthMil: 1000,
        heightMil: 500,
        centroidMil: { x: 500, y: 250 },
        outlineSegmentCount: 4,
        cutoutCount: 0
    })
    assert.deepEqual(report.drills, {
        totalHoleCount: 3,
        padHoleCount: 2,
        viaHoleCount: 1,
        platedHoleCount: 3,
        nonPlatedHoleCount: 0,
        slotCount: 1,
        holeDiameterMil: { 20: 2, 30: 1 },
        slotLengthMil: { 60: 1 }
    })
    assert.deepEqual(report.primitiveWidths, {
        tracksMil: { 8: 1 },
        arcsMil: { 6: 1 },
        viasMil: { 50: 1 },
        padsTopXMil: { 80: 1, 100: 1 }
    })
    assert.deepEqual(
        report.layers.entries.map((entry) => entry.layerKey),
        ['F.Cu', 'B.Cu', 'F.SilkS']
    )
})

test('KicadPcbPickPlacePositionResolver exposes footprint-origin and pad-anchor modes', () => {
    const pcb = createPcbModel().pcb
    const pnp = KicadPcbPickPlacePositionResolver.buildModel(
        pcb.components,
        pcb.pads
    )

    assert.equal(pnp.positionMode, 'kicad-footprint-origin')
    assert.deepEqual(pnp.entries, [
        {
            designator: 'U1',
            pattern: 'Device:R_0603',
            layer: 'TOP',
            rotation: 90,
            x: 100,
            y: 200,
            footprintOriginX: 100,
            footprintOriginY: 200,
            padAnchorCount: 2,
            positionSource: 'footprint-origin'
        }
    ])
    assert.deepEqual(pnp.modes.padAnchorCenter.entries[0], {
        designator: 'U1',
        pattern: 'Device:R_0603',
        layer: 'TOP',
        rotation: 90,
        x: 115,
        y: 200,
        footprintOriginX: 100,
        footprintOriginY: 200,
        padAnchorCount: 2,
        positionSource: 'pad-anchor-center'
    })
})

test('KicadPcbOwnershipGraphBuilder indexes component net and group ownership', () => {
    const graph = KicadPcbOwnershipGraphBuilder.build(createPcbModel().pcb)

    assert.equal(graph.schema, 'kicad-toolkit.pcb.ownership-graph.a1')
    assert.deepEqual(graph.summary, {
        componentCount: 1,
        primitiveCount: 6,
        netCount: 2,
        groupCount: 1
    })
    assert.deepEqual(graph.primitivesByComponent.U1, [
        'pad-0',
        'pad-1',
        'text-0'
    ])
    assert.deepEqual(graph.primitivesByNet.GND, ['track-0', 'arc-0', 'via-0'])
    assert.deepEqual(graph.primitivesByGroup.mounting, ['text-0'])
})

test('KicadSchematicHierarchyGraphBuilder indexes sheet pages and child sheets', () => {
    const graph = KicadSchematicHierarchyGraphBuilder.build(
        createProjectModel(),
        {
            documentModels: [createRootSchematic(), createChildSchematic()]
        }
    )

    assert.equal(graph.schema, 'kicad-toolkit.schematic.hierarchy-graph.a1')
    assert.deepEqual(graph.summary, {
        sheetCount: 2,
        edgeCount: 1,
        rootCount: 1,
        missingSheetCount: 0
    })
    assert.deepEqual(graph.roots, ['demo/root.kicad_sch'])
    assert.deepEqual(graph.edges, [
        {
            from: 'demo/root.kicad_sch',
            to: 'demo/child.kicad_sch',
            sheetName: 'Child Sheet',
            sheetPath: '/child',
            sheetUuid: 'sheet-child',
            resolved: true
        }
    ])
    assert.equal(
        graph.indexes.byFileName['demo/child.kicad_sch'].title,
        'Child'
    )
})

test('KicadHostCapabilityDiagnosticsBuilder reports unavailable host fallbacks', () => {
    const report = KicadHostCapabilityDiagnosticsBuilder.build({
        host: { name: 'demo-host', version: '1.0.0' },
        capabilities: {
            webgl: true,
            fontMetrics: false,
            stepBounds: false
        },
        fallbacks: [{ code: 'renderer.font.fallback' }]
    })

    assert.equal(report.schema, 'kicad-toolkit.host-capabilities.a1')
    assert.deepEqual(report.host, { name: 'demo-host', version: '1.0.0' })
    assert.deepEqual(report.summary, {
        capabilityCount: 3,
        unsupportedCapabilityCount: 2,
        fallbackCount: 1,
        warningCount: 2
    })
    assert.deepEqual(report.capabilities, [
        {
            key: 'fontMetrics',
            supported: false,
            diagnosticCode: 'host.capability.fontMetrics.unsupported'
        },
        {
            key: 'stepBounds',
            supported: false,
            diagnosticCode: 'host.capability.stepBounds.unsupported'
        },
        { key: 'webgl', supported: true }
    ])
    assert.equal(report.diagnostics[2].code, 'renderer.font.fallback')
    assert.equal(
        report.diagnostics[2].message,
        'Host fallback renderer.font.fallback was used.'
    )
})

test('KicadPcbReviewMetadataBuilder adapts KiCad PCB review sidecars', () => {
    const pcb = createPcbModel().pcb
    pcb.polygons = [
        {
            netName: 'GND',
            layerKey: 'F.Cu',
            points: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
                { x: 100, y: 100 },
                { x: 0, y: 100 }
            ]
        }
    ]
    const routeAnalysis = KicadPcbRouteAnalysisBuilder.build(pcb)
    const report = KicadPcbReviewMetadataBuilder.build({
        ...pcb,
        routeAnalysis
    })

    assert.equal(report.schema, 'kicad-toolkit.pcb.review-metadata.a1')
    assert.deepEqual(report.summary, {
        routeGroupCount: 1,
        boardAssemblyViewCount: 0,
        polygonRealizationCount: 1,
        routeHighlightProfileCount: 3,
        drillOverlayCount: 3
    })
    assert.deepEqual(report.routeGroups, [
        {
            key: 'route-class-default',
            kind: 'net-class',
            name: 'Default',
            netNames: ['GND', 'SIG_A'],
            layerKeys: ['B.Cu', 'F.Cu'],
            primitiveKeys: ['arc-0', 'track-0', 'via-0'],
            totalLengthMil: 178.54
        }
    ])
    assert.deepEqual(
        report.routeHighlightProfiles.map((profile) => ({
            selectorKind: profile.selectorKind,
            name: profile.name,
            netNames: profile.netNames,
            layerGroupCount: profile.layerGroups.length
        })),
        [
            {
                selectorKind: 'net-class',
                name: 'Default',
                netNames: ['GND', 'SIG_A'],
                layerGroupCount: 3
            },
            {
                selectorKind: 'net',
                name: 'GND',
                netNames: ['GND'],
                layerGroupCount: 3
            },
            {
                selectorKind: 'net',
                name: 'SIG_A',
                netNames: ['SIG_A'],
                layerGroupCount: 0
            }
        ]
    )
    assert.deepEqual(report.polygonRealizations, [
        {
            key: 'polygon-realization-0',
            polygonIndex: 0,
            classification: 'copper-pour',
            layerKeys: ['F.Cu'],
            netName: 'GND',
            primitiveKeys: ['polygon-0'],
            realizedPrimitiveKinds: ['polygon']
        }
    ])
    assert.deepEqual(
        report.drillReview.overlays.map((overlay) => ({
            ownerKind: overlay.ownerKind,
            ownerKey: overlay.ownerKey,
            holeKind: overlay.holeKind,
            plating: overlay.plating,
            overlayKind: overlay.overlayKind
        })),
        [
            {
                ownerKind: 'via',
                ownerKey: 'via-0',
                holeKind: 'round',
                plating: 'plated',
                overlayKind: 'plated-hole'
            },
            {
                ownerKind: 'pad',
                ownerKey: 'pad-0',
                holeKind: 'round',
                plating: 'plated',
                overlayKind: 'plated-hole'
            },
            {
                ownerKind: 'pad',
                ownerKey: 'pad-1',
                holeKind: 'slot',
                plating: 'plated',
                overlayKind: 'plated-slot'
            }
        ]
    )
    assert.deepEqual(report.indexes, {
        routeGroupsByName: { Default: 0 },
        routeHighlightProfilesByName: { Default: 0, GND: 1, SIG_A: 2 },
        primitiveKeysByNet: {
            GND: ['arc-0', 'track-0', 'via-0'],
            SIG_A: []
        },
        polygonRealizationsByKey: { 'polygon-realization-0': 0 },
        drillOverlaysByOwnerKey: { 'via-0': 0, 'pad-0': 1, 'pad-1': 2 },
        boardAssemblyViewsByName: {}
    })
})

test('KicadPcbComponentParticipationPolicy normalizes footprint attributes', () => {
    assert.deepEqual(
        KicadPcbComponentParticipationPolicy.resolve({
            attributes: ['smd', 'exclude_from_bom'],
            reference: 'U1'
        }),
        {
            designator: 'U1',
            name: 'smd',
            displayName: 'SMD',
            mountKind: 'smd',
            includeInBom: false,
            includeInNetlist: true,
            includeInPnp: true,
            flags: {
                boardOnly: false,
                doNotPopulate: false,
                excludeFromBom: true,
                excludeFromPositionFiles: false,
                throughHole: false,
                virtual: false
            }
        }
    )
    assert.deepEqual(
        KicadPcbComponentParticipationPolicy.resolve({
            designator: 'LOGO1',
            attributes: ['virtual']
        }),
        {
            designator: 'LOGO1',
            name: 'virtual',
            displayName: 'Virtual',
            mountKind: 'virtual',
            includeInBom: false,
            includeInNetlist: false,
            includeInPnp: false,
            flags: {
                boardOnly: false,
                doNotPopulate: false,
                excludeFromBom: true,
                excludeFromPositionFiles: true,
                throughHole: false,
                virtual: true
            }
        }
    )
})

test('KicadPcbPlacedFootprintManifestBuilder describes extractable KiCad footprints', () => {
    const model = createPcbModel()
    model.pcb.pads[0].layers = ['F.Cu', 'F.Mask']
    model.pcb.pads[1].layers = ['F.Cu', 'F.Mask']

    const manifest = KicadPcbPlacedFootprintManifestBuilder.build(model)

    assert.equal(
        manifest.schema,
        'kicad-toolkit.pcb.placed-footprint-extraction.a1'
    )
    assert.deepEqual(manifest.summary, {
        componentCount: 1,
        extractableFootprintCount: 1,
        embeddedAssetCount: 0
    })
    assert.deepEqual(manifest.outputs[0], {
        kind: 'placed-footprint',
        footprintKey: 'footprint-extract-0-u1-device-r-0603',
        designator: 'U1',
        pattern: 'Device:R_0603',
        componentIndex: 0,
        outputLibraryKey:
            'pcb-extract/footprint-extract-0-u1-device-r-0603.kicad_mod',
        renderManifestKey:
            'pcb-extract/footprint-extract-0-u1-device-r-0603.render.json',
        primitiveCounts: {
            pads: 2,
            tracks: 0,
            arcs: 0,
            drawings: 0,
            vias: 0,
            zones: 0,
            texts: 1,
            models: 0
        },
        layers: [
            { layerKey: 'F.Cu', displayName: 'F.Cu' },
            { layerKey: 'F.Mask', displayName: 'F.Mask' },
            { layerKey: 'F.SilkS', displayName: 'F.SilkS' }
        ],
        embeddedAssets: [],
        diagnostics: []
    })
    assert.deepEqual(manifest.indexes.outputsByDesignator, { U1: 0 })
    assert.deepEqual(manifest.indexes.outputsByPattern, {
        'Device:R_0603': [0]
    })
})

test('KicadFootprintLibraryParityReportBuilder counts advanced KiCad footprint fields', () => {
    const report = KicadFootprintLibraryParityReportBuilder.build({
        footprints: [
            {
                name: 'R_0603',
                pads: [
                    {
                        shape: 'custom',
                        layers: ['F.Cu', 'F.Mask'],
                        customPrimitives: [{ type: 'polygon' }],
                        padstack: {
                            mode: 'custom',
                            layers: [{ layer: 'F.Cu' }]
                        },
                        drill: 0.3,
                        options: { clearance: 'outline' }
                    }
                ],
                drawings: [
                    { type: 'image', layer: 'F.SilkS' },
                    { type: 'barcode', layer: 'F.SilkS' },
                    { type: 'line', layer: 'F.Fab', private: true }
                ],
                models: [{ path: '${KIPRJMOD}/body.step' }]
            }
        ]
    })

    assert.equal(report.schema, 'kicad-toolkit.footprint-library.parity.a1')
    assert.deepEqual(report.summary, {
        footprintCount: 1,
        footprintWithAdvancedFieldsCount: 1,
        customPadPrimitiveCount: 1,
        padLayerSetCount: 1,
        padOptionCount: 1,
        drilledPadCount: 1,
        modelReferenceFootprintCount: 1,
        imageGraphicCount: 1,
        barcodeGraphicCount: 1,
        privateGraphicCount: 1,
        diagnosticCount: 0,
        unknownLayerCount: 0,
        unknownPadShapeCount: 0,
        unknownPadTypeCount: 0,
        padDrillTypeMismatchCount: 0
    })
    assert.deepEqual(report.footprints[0].advancedFields, {
        customPadPrimitives: 1,
        padLayerSets: 1,
        padOptions: 1,
        drilledPads: 1,
        modelReferences: 1,
        imageGraphics: 1,
        barcodeGraphics: 1,
        privateGraphics: 1
    })
})

test('KicadFootprintLibraryParityReportBuilder reports footprint fidelity diagnostics', () => {
    const report = KicadFootprintLibraryParityReportBuilder.build({
        footprints: [
            {
                name: 'EDGE_CASE_FOOTPRINT',
                pads: [
                    {
                        number: '1',
                        type: 'smd',
                        shape: 'hexagon',
                        drill: 0.3,
                        layers: ['F.Cu', 'Mechanical.1']
                    },
                    {
                        number: '2',
                        type: 'press_fit',
                        shape: 'rect',
                        layers: ['F.Cu']
                    }
                ],
                drawings: [{ type: 'line', layer: 'Documentation' }],
                texts: [{ value: 'REF**', layer: 'F.SilkS' }]
            }
        ]
    })

    assert.equal(report.summary.diagnosticCount, 5)
    assert.equal(report.summary.unknownLayerCount, 2)
    assert.equal(report.summary.unknownPadShapeCount, 1)
    assert.equal(report.summary.unknownPadTypeCount, 1)
    assert.equal(report.summary.padDrillTypeMismatchCount, 1)
    assert.deepEqual(
        report.diagnostics.map((diagnostic) => diagnostic.code),
        [
            'kicad.footprint-library.fidelity.unknown-layer',
            'kicad.footprint-library.fidelity.unknown-layer',
            'kicad.footprint-library.fidelity.unknown-pad-shape',
            'kicad.footprint-library.fidelity.unknown-pad-type',
            'kicad.footprint-library.fidelity.pad-drill-type-mismatch'
        ]
    )
    assert.deepEqual(report.indexes.diagnosticsByCode, {
        'kicad.footprint-library.fidelity.pad-drill-type-mismatch': [
            'footprint-fidelity-4'
        ],
        'kicad.footprint-library.fidelity.unknown-layer': [
            'footprint-fidelity-0',
            'footprint-fidelity-1'
        ],
        'kicad.footprint-library.fidelity.unknown-pad-shape': [
            'footprint-fidelity-2'
        ],
        'kicad.footprint-library.fidelity.unknown-pad-type': [
            'footprint-fidelity-3'
        ]
    })
})

test('KicadImagePayloadManifestBuilder checksums KiCad image payloads', () => {
    const manifest = KicadImagePayloadManifestBuilder.build([
        {
            kind: 'schematic',
            fileName: 'demo/root.kicad_sch',
            schematic: {
                images: [
                    {
                        uuid: 'image-uuid',
                        data: 'RkFLRVBORw==',
                        format: 'png'
                    }
                ],
                embeddedFiles: [{ name: 'symbol-cache.lib', data: 'QUJD' }]
            }
        },
        {
            kind: 'worksheet',
            fileName: 'demo/page.kicad_wks',
            bitmaps: [
                {
                    name: 'logo',
                    format: 'png',
                    data: 'ZmFrZS13b3Jrc2hlZXQ='
                },
                { name: 'missing-logo', format: 'png' }
            ]
        }
    ])

    assert.equal(manifest.schema, 'kicad-toolkit.image-payloads.a1')
    assert.deepEqual(manifest.summary, {
        imageCount: 4,
        payloadCount: 3,
        diagnosticCount: 1
    })
    assert.deepEqual(
        manifest.payloads.map((payload) => ({
            kind: payload.kind,
            sourceDocument: payload.sourceDocument,
            imageId: payload.imageId,
            name: payload.name,
            nativeFormat: payload.nativeFormat,
            byteSize: payload.byteSize,
            checksum: payload.checksum.value
        })),
        [
            {
                kind: 'schematic-image',
                sourceDocument: 'demo/root.kicad_sch',
                imageId: 'image-uuid',
                name: 'schematic-image-0',
                nativeFormat: 'png',
                byteSize: 7,
                checksum: '67ffa6b3'
            },
            {
                kind: 'schematic-embedded-file',
                sourceDocument: 'demo/root.kicad_sch',
                imageId: 'embedded-file-0',
                name: 'symbol-cache.lib',
                nativeFormat: 'lib',
                byteSize: 3,
                checksum: '5c842f6b'
            },
            {
                kind: 'worksheet-bitmap',
                sourceDocument: 'demo/page.kicad_wks',
                imageId: 'worksheet-bitmap-0',
                name: 'logo',
                nativeFormat: 'png',
                byteSize: 14,
                checksum: '82186b01'
            }
        ]
    )
    assert.deepEqual(manifest.diagnostics, [
        {
            code: 'kicad.image-payload.missing-bytes',
            severity: 'warning',
            sourceDocument: 'demo/page.kicad_wks',
            kind: 'worksheet-bitmap',
            imageId: 'worksheet-bitmap-1',
            name: 'missing-logo',
            message: 'KiCad image payload did not include payload bytes.'
        }
    ])
})

test('KicadParser attaches PCB review and footprint extraction sidecars', () => {
    const model = KicadParser.parseArrayBufferToRendererModel(
        'demo.kicad_pcb',
        encodeSource(`
            (kicad_pcb
                (version 20240108)
                (generator "kicad-toolkit-test")
                (layers
                    (0 "F.Cu" signal)
                    (31 "B.Cu" signal)
                    (37 "F.SilkS" user)
                    (44 "Edge.Cuts" user)
                )
                (net 0 "")
                (net 1 "GND")
                (footprint "Device:R_0603"
                    (layer "F.Cu")
                    (uuid "footprint-u1")
                    (at 10 20 90)
                    (property "Reference" "U1" (at 0 0 0) (layer "F.SilkS"))
                    (property "Value" "R" (at 0 1 0) (layer "F.Fab"))
                    (pad "1" smd rect
                        (at 0 0)
                        (size 1 1)
                        (layers "F.Cu" "F.Mask")
                        (net 1 "GND")
                    )
                )
                (segment
                    (start 0 0)
                    (end 5 0)
                    (width 0.2)
                    (layer "F.Cu")
                    (net 1)
                )
            )
        `)
    )

    assert.equal(
        model.pcb.reviewMetadata.schema,
        'kicad-toolkit.pcb.review-metadata.a1'
    )
    assert.equal(
        model.pcb.footprintExtractionManifest.schema,
        'kicad-toolkit.pcb.placed-footprint-extraction.a1'
    )
    assert.equal(
        model.pcb.footprintExtractionManifest.summary.extractableFootprintCount,
        1
    )
})

/**
 * Builds a PCB renderer model with routed copper and placement metadata.
 * @returns {object}
 */
function createPcbModel() {
    return {
        kind: 'pcb',
        fileName: 'demo/demo.kicad_pcb',
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
            layers: [
                { layerKey: 'F.Cu', displayName: 'F.Cu', role: 'copper' },
                { layerKey: 'B.Cu', displayName: 'B.Cu', role: 'copper' },
                {
                    layerKey: 'F.SilkS',
                    displayName: 'F.SilkS',
                    role: 'silkscreen'
                }
            ],
            primitiveLayers: [
                { layerKey: 'F.Cu', displayName: 'F.Cu', role: 'copper' },
                { layerKey: 'B.Cu', displayName: 'B.Cu', role: 'copper' },
                {
                    layerKey: 'F.SilkS',
                    displayName: 'F.SilkS',
                    role: 'silkscreen'
                }
            ],
            nets: [
                { netIndex: 1, name: 'GND' },
                { netIndex: 2, name: 'SIG_A' }
            ],
            classes: [{ name: 'Default', nets: ['GND', 'SIG_A'] }],
            components: [
                {
                    componentIndex: 0,
                    designator: 'U1',
                    pattern: 'Device:R_0603',
                    x: 100,
                    y: 200,
                    layer: 'TOP',
                    rotation: 90
                }
            ],
            pads: [
                {
                    id: 'pad:U1:1:0:0',
                    componentIndex: 0,
                    footprintId: 'footprint:U1:0',
                    footprintReference: 'U1',
                    number: '1',
                    x: 100,
                    y: 200,
                    sizeTopX: 80,
                    sizeTopY: 60,
                    holeDiameter: 20,
                    netName: 'GND',
                    isPlated: true
                },
                {
                    id: 'pad:U1:2:0:1',
                    componentIndex: 0,
                    footprintId: 'footprint:U1:0',
                    footprintReference: 'U1',
                    number: '2',
                    x: 130,
                    y: 200,
                    sizeTopX: 100,
                    sizeTopY: 60,
                    holeDiameter: 30,
                    holeSlotLength: 60,
                    netName: 'SIG_A',
                    isPlated: true
                }
            ],
            tracks: [
                {
                    x1: 0,
                    y1: 0,
                    x2: 100,
                    y2: 0,
                    width: 8,
                    layerKey: 'F.Cu',
                    netName: 'GND'
                }
            ],
            arcs: [
                {
                    x: 25,
                    y: 25,
                    radius: 50,
                    startAngle: -90,
                    endAngle: -180,
                    width: 6,
                    layerKey: 'B.Cu',
                    netName: 'GND'
                }
            ],
            vias: [
                {
                    x: 50,
                    y: 0,
                    diameter: 50,
                    holeDiameter: 20,
                    netName: 'GND'
                }
            ],
            texts: [
                {
                    id: 'text:U1:ref',
                    text: 'U1',
                    ownerId: 'footprint:U1:0',
                    ownerIndex: 'footprint:U1:0',
                    groupId: 'mounting',
                    layer: 'F.SilkS'
                }
            ],
            polygons: [],
            fills: [],
            regions: [],
            boardRegions: []
        }
    }
}

/**
 * Builds a fake KiCad project model with hierarchy pages.
 * @returns {object}
 */
function createProjectModel() {
    return {
        project: {
            rootSchematic: 'demo/root.kicad_sch',
            pages: [
                {
                    kind: 'schematic',
                    fileName: 'demo/root.kicad_sch',
                    title: 'Root',
                    path: '/',
                    page: '1',
                    root: true
                },
                {
                    kind: 'schematic',
                    fileName: 'demo/child.kicad_sch',
                    title: 'Child',
                    path: '/child',
                    page: '2',
                    root: false
                }
            ]
        }
    }
}

/**
 * Builds a root schematic fixture.
 * @returns {object}
 */
function createRootSchematic() {
    return {
        kind: 'schematic',
        fileName: 'demo/root.kicad_sch',
        schematic: {
            sheet: { title: 'Root' },
            sheetSymbols: [
                {
                    id: 'sheet-child',
                    uuid: 'sheet-child',
                    name: 'Child Sheet',
                    path: '/child',
                    fileName: 'child.kicad_sch'
                }
            ]
        }
    }
}

/**
 * Builds a child schematic fixture.
 * @returns {object}
 */
function createChildSchematic() {
    return {
        kind: 'schematic',
        fileName: 'demo/child.kicad_sch',
        schematic: {
            sheet: { title: 'Child' },
            sheetSymbols: []
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
