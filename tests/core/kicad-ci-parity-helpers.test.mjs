// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    KicadCiArtifactBundleBuilder,
    KicadContractGateReportBuilder,
    KicadParserCompatibilityFuzzer,
    KicadProjectDocumentGraphBuilder,
    KicadSvgModelCrossLinkValidator
} from '../../src/parser.mjs'
import { SchematicSvgRenderer } from '../../src/renderers.mjs'

test('KicadProjectDocumentGraphBuilder indexes project documents libraries jobsets and outputs', () => {
    const graph = KicadProjectDocumentGraphBuilder.build(createProjectModel(), {
        documentModels: [createSchematicDocument(), createPcbDocument()],
        availablePaths: [
            'demo/root.kicad_sch',
            'demo/demo.kicad_pcb',
            'libraries/Device.kicad_sym',
            'blocks/regulator.kicad_block',
            'fab.kicad_jobset'
        ],
        generatedOutputs: [
            {
                sourceFileName: 'demo/demo.kicad_pcb',
                type: 'gerber',
                path: 'fab/demo-F_Cu.gbr'
            }
        ],
        jobsets: [createJobsetDocument()]
    })

    assert.equal(graph.schema, 'kicad-toolkit.project.document-graph.a1')
    assert.deepEqual(graph.summary, {
        documentCount: 2,
        sourceSheetCount: 1,
        pcbDocumentCount: 1,
        linkedLibraryCount: 1,
        jobsetCount: 1,
        designBlockCount: 1,
        generatedOutputCount: 1,
        assetCount: 1,
        missingPathCount: 0
    })
    assert.deepEqual(graph.groups.sourceSheets, ['demo/root.kicad_sch'])
    assert.deepEqual(graph.groups.pcbs, ['demo/demo.kicad_pcb'])
    assert.deepEqual(graph.groups.linkedLibraries, [
        'libraries/Device.kicad_sym'
    ])
    assert.deepEqual(graph.groups.designBlocks, [
        'blocks/regulator.kicad_block'
    ])
    assert.deepEqual(graph.groups.jobsets, ['fab.kicad_jobset'])
    assert.deepEqual(graph.groups.generatedOutputs, ['fab/demo-F_Cu.gbr'])
    assert.equal(graph.indexes.byKind.schematic[0], 'demo/root.kicad_sch')
    assert.equal(graph.indexes.byPath['demo/demo.kicad_pcb'].kind, 'pcb')
})

test('KicadCiArtifactBundleBuilder builds deterministic parser renderer and report artifacts', () => {
    const artifact = KicadCiArtifactBundleBuilder.build({
        projectModel: createProjectModel(),
        documentModels: [createSchematicDocument(), createPcbDocument()],
        generatedOutputs: [
            {
                sourceFileName: 'demo/demo.kicad_pcb',
                type: 'gerber',
                path: 'fab/demo-F_Cu.gbr'
            }
        ],
        assets: [{ name: 'models/u1.step', bytes: new Uint8Array([1, 2]) }],
        jobsets: [createJobsetDocument()]
    })

    assert.equal(artifact.schema, 'kicad-toolkit.ci.artifact-bundle.a1')
    assert.deepEqual(artifact.summary, {
        normalizedModelCount: 2,
        schematicSvgCount: 1,
        pcbLayerSvgCount: 3,
        netCount: 1,
        bomRowCount: 1,
        pnpCount: 1,
        diagnosticCount: 0,
        readinessReportCount: 1,
        schematicQaReportCount: 1,
        contractGateStatus: 'pass'
    })
    assert.equal(artifact.designBundle.kind, 'design-bundle')
    assert.equal(
        artifact.documentGraph.schema,
        'kicad-toolkit.project.document-graph.a1'
    )
    assert.equal(artifact.netlist.json.schema, 'kicad-toolkit.netlist.a1')
    assert.match(artifact.netlist.wirelist, /net SIG_A/)
    assert.match(artifact.schematicSvgs[0].svg, /schematic-svg/)
    assert.deepEqual(
        artifact.pcbLayerSvgs[0].layers.map((layer) => layer.layerKey),
        ['F.Cu', 'B.Cu', 'F.SilkS']
    )
    assert.equal(artifact.readiness.pcb[0].readiness, 'ready')
    assert.equal(artifact.schematicQa[0].summary.findingCount, 0)
    assert.equal(artifact.assetInventory.summary.externalAssetCount, 1)
    assert.equal(artifact.contractGate.schema, 'kicad-toolkit.contract-gate.a1')
    assert.equal(artifact.contractGate.status, 'pass')
})

test('KicadContractGateReportBuilder validates CI artifact contracts', () => {
    const artifact = KicadCiArtifactBundleBuilder.build({
        projectModel: createProjectModel(),
        documentModels: [createSchematicDocument(), createPcbDocument()],
        jobsets: [createJobsetDocument()]
    })
    const gate = KicadContractGateReportBuilder.build({
        documentModels: artifact.normalizedModels,
        netlist: artifact.netlist,
        schematicSvgs: artifact.schematicSvgs,
        pcbLayerSvgs: artifact.pcbLayerSvgs,
        diagnostics: artifact.diagnostics
    })

    assert.equal(gate.schema, 'kicad-toolkit.contract-gate.a1')
    assert.equal(gate.status, 'pass')
    assert.deepEqual(gate.summary, {
        gateCount: 5,
        failingGateCount: 0,
        documentCount: 2,
        svgLinkReportCount: 2,
        diagnosticCount: 0
    })
    assert.deepEqual(
        gate.gates.map((entry) => ({
            key: entry.key,
            status: entry.status,
            failureCount: entry.failureCount
        })),
        [
            { key: 'normalized-models', status: 'pass', failureCount: 0 },
            { key: 'netlist-json', status: 'pass', failureCount: 0 },
            { key: 'wirelist', status: 'pass', failureCount: 0 },
            { key: 'svg-model-links', status: 'pass', failureCount: 0 },
            { key: 'diagnostics', status: 'pass', failureCount: 0 }
        ]
    )

    const failed = KicadContractGateReportBuilder.build({
        documentModels: artifact.normalizedModels,
        netlist: { json: {}, wirelist: null },
        schematicSvgs: artifact.schematicSvgs,
        pcbLayerSvgs: artifact.pcbLayerSvgs,
        diagnostics: [
            {
                severity: 'error',
                code: 'fixture.error',
                message: 'Synthetic failure'
            }
        ]
    })

    assert.equal(failed.status, 'fail')
    assert.deepEqual(
        failed.gates
            .filter((entry) => entry.status === 'fail')
            .map((entry) => entry.key),
        ['netlist-json', 'wirelist', 'diagnostics']
    )
})

test('KicadSvgModelCrossLinkValidator validates rendered schematic semantic links', () => {
    const documentModel = createSchematicDocument()
    const svg = SchematicSvgRenderer.render(documentModel)
    const report = KicadSvgModelCrossLinkValidator.validate(documentModel, svg)

    assert.equal(report.schema, 'kicad-toolkit.svg-model-cross-link.a1')
    assert.equal(report.documentKind, 'schematic')
    assert.equal(report.summary.expectedElementCount, 3)
    assert.equal(report.summary.missingElementCount, 0)
    assert.equal(report.summary.orphanElementCount, 0)
    assert.equal(report.summary.unresolvedReferenceCount, 0)
    assert.equal(report.summary.metadataElementCount, 2)

    const broken = KicadSvgModelCrossLinkValidator.validate(
        documentModel,
        svg.replace(
            'data-element-key="schematic-line-0"',
            'data-element-key="schematic-line-9"'
        )
    )

    assert.deepEqual(broken.missingElements, [
        {
            elementKey: 'schematic-line-0',
            collectionKey: 'lines',
            primitiveKind: 'line',
            recordId: 'wire-1'
        }
    ])
    assert.equal(broken.orphanElements[0].elementKey, 'schematic-line-9')
})

test('KicadParserCompatibilityFuzzer runs deterministic KiCad parser smoke cases', () => {
    const report = KicadParserCompatibilityFuzzer.run()

    assert.equal(report.schema, 'kicad-toolkit.parser-compatibility-fuzz.a1')
    assert.equal(report.summary.failureCount, 0)
    assert.deepEqual(
        report.cases.map((entry) => entry.key),
        [
            'schematic-empty',
            'pcb-minimal',
            'project-metadata-sparse',
            'jobset-empty'
        ]
    )
    assert.deepEqual(
        report.cases.map((entry) => entry.status),
        ['pass', 'pass', 'pass', 'pass']
    )
})

/**
 * Builds a fake KiCad project loader summary with library and asset metadata.
 * @returns {object}
 */
function createProjectModel() {
    return {
        project: {
            name: 'demo',
            fileName: 'demo/demo.kicad_pro',
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
                    kind: 'pcb',
                    fileName: 'demo/demo.kicad_pcb',
                    title: 'Demo Board',
                    path: '',
                    page: '',
                    root: false
                }
            ]
        },
        libraries: {
            libraries: [
                {
                    name: 'Device',
                    kind: 'symbol',
                    path: 'libraries/Device.kicad_sym'
                }
            ],
            items: [
                {
                    kind: 'design-block',
                    name: 'Regulator',
                    fileName: 'blocks/regulator.kicad_block'
                }
            ]
        },
        assets: [{ name: 'models/u1.step', bytes: new Uint8Array([1, 2]) }]
    }
}

/**
 * Builds a renderer-compatible KiCad schematic document.
 * @returns {object}
 */
function createSchematicDocument() {
    const line = {
        id: 'wire-1',
        x1: 10,
        y1: 20,
        x2: 30,
        y2: 20,
        width: 0.15
    }
    const label = {
        id: 'label-1',
        x: 20,
        y: 20,
        text: 'SIG_A',
        labelKind: 'local'
    }
    const pin = {
        id: 'pin-1',
        ownerIndex: 'symbol:U1:0',
        x: 40,
        y: 20,
        length: 5,
        name: 'IN',
        designator: '1',
        orientation: 'left'
    }

    return {
        kind: 'schematic',
        fileName: 'demo/root.kicad_sch',
        summary: { title: 'Root' },
        schematic: {
            sheet: {
                width: 60,
                height: 40,
                titleBlock: { title: 'Root' }
            },
            lines: [line],
            texts: [label],
            components: [
                {
                    id: 'symbol:U1:0',
                    ownerIndex: 'symbol:U1:0',
                    designator: 'U1',
                    libId: 'Device:R',
                    value: '10k'
                }
            ],
            pins: [pin],
            junctions: [],
            crosses: [],
            sheetSymbols: [],
            nets: [
                {
                    name: 'SIG_A',
                    segments: [line],
                    labels: [label],
                    pins: [pin]
                }
            ]
        },
        bom: [
            {
                designators: ['U1'],
                quantity: 1,
                value: '10k',
                pattern: 'Device:R',
                source: 'Device:R'
            }
        ]
    }
}

/**
 * Builds a renderer-compatible KiCad PCB document with raw board details.
 * @returns {object}
 */
function createPcbDocument() {
    const board = {
        fileName: 'demo/demo.kicad_pcb',
        title: 'Demo Board',
        bounds: {
            minX: 0,
            minY: 0,
            maxX: 50,
            maxY: 30,
            width: 50,
            height: 30
        },
        layers: [{ name: 'F.Cu' }, { name: 'B.Cu' }, { name: 'F.SilkS' }],
        outlines: [
            {
                layer: 'Edge.Cuts',
                points: [
                    { x: 0, y: 0 },
                    { x: 50, y: 0 },
                    { x: 50, y: 30 },
                    { x: 0, y: 30 }
                ]
            }
        ],
        drawings: [
            {
                type: 'segment',
                layer: 'F.Cu',
                start: { x: 10, y: 10 },
                end: { x: 20, y: 10 },
                strokeWidth: 0.25,
                netName: 'SIG_A'
            }
        ],
        pads: [],
        texts: [
            {
                text: 'REF**',
                layer: 'F.SilkS',
                x: 10,
                y: 8,
                sizeX: 1,
                sizeY: 1,
                thickness: 0.15
            }
        ],
        footprints: [{ reference: 'U1', side: 'front', models: [] }],
        nets: [{ index: 1, name: 'SIG_A' }]
    }

    return {
        kind: 'pcb',
        fileName: 'demo/demo.kicad_pcb',
        summary: { title: 'Demo Board' },
        pcb: {
            kicadBoard: board,
            components: [
                {
                    designator: 'U1',
                    componentIndex: 0,
                    pattern: 'Package:R_0603'
                }
            ],
            nets: [{ netIndex: 1, name: 'SIG_A' }]
        },
        pnp: {
            positionMode: 'board-origin',
            entries: [
                {
                    designator: 'U1',
                    x: 1000,
                    y: 2000,
                    layer: 'TOP'
                }
            ]
        }
    }
}

/**
 * Builds a fake parsed KiCad jobset model.
 * @returns {object}
 */
function createJobsetDocument() {
    return {
        kind: 'jobset',
        fileName: 'fab.kicad_jobset',
        jobs: [{ id: 'plot', type: 'plot', output: 'gerbers' }],
        outputs: [
            {
                id: 'gerbers',
                type: 'folder',
                description: 'Gerbers',
                settings: { output_path: 'fab' }
            }
        ]
    }
}
