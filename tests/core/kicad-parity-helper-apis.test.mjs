// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { strToU8 } from 'fflate'
import {
    KicadEmbeddedAssetInventoryBuilder,
    KicadJobsetDigestBuilder,
    KicadLibraryQaReportBuilder,
    KicadLibraryRenderManifestBuilder,
    KicadLibrarySearchIndex,
    KicadSchematicConnectivityQaBuilder,
    KicadSchematicQaReportBuilder
} from '../../src/parser.mjs'

test('KicadLibrarySearchIndex searches footprint, symbol, and design-block items', () => {
    const index = libraryIndexFixture()

    assert.deepEqual(
        KicadLibrarySearchIndex.searchPcbFootprints(
            index,
            'precision'
        ).matches.map((match) => ({
            kind: match.kind,
            name: match.name,
            matchKind: match.matchKind,
            libraryName: match.libraryName
        })),
        [
            {
                kind: 'footprint',
                name: 'R_0603',
                matchKind: 'keyword',
                libraryName: 'Passives'
            }
        ]
    )
    assert.deepEqual(
        KicadLibrarySearchIndex.searchSchematicSymbols(
            index,
            'pwrflg'
        ).matches.map((match) => ({
            kind: match.kind,
            name: match.name,
            matchKind: match.matchKind
        })),
        [{ kind: 'symbol', name: 'Power:PWR_FLAG', matchKind: 'fuzzy' }]
    )
    assert.deepEqual(
        KicadLibrarySearchIndex.searchDesignBlocks(
            index,
            'buck regulator'
        ).matches.map((match) => ({
            kind: match.kind,
            name: match.name,
            matchKind: match.matchKind
        })),
        [{ kind: 'design-block', name: 'Power Stage', matchKind: 'keyword' }]
    )
})

test('KicadLibraryRenderManifestBuilder builds deterministic library manifests', () => {
    const pcbManifest =
        KicadLibraryRenderManifestBuilder.buildPcbLibraryManifest({
            pcbLibrary: {
                footprints: [
                    {
                        name: 'R_0603',
                        libraryName: 'Passives',
                        fileName: 'Passives.pretty/R_0603.kicad_mod',
                        pads: [{ layer: 'F.Cu' }],
                        drawings: [{ layer: 'F.SilkS' }],
                        texts: [{ layer: 'F.Fab' }],
                        models: [{ path: 'models/R_0603.step' }]
                    }
                ]
            }
        })

    assert.deepEqual(pcbManifest.outputs, [
        {
            kind: 'footprint',
            footprintKey: 'footprint-0-r-0603',
            name: 'R_0603',
            libraryName: 'Passives',
            sourceFile: 'Passives.pretty/R_0603.kicad_mod',
            outputSvgKey: 'pcb-library/footprint-0-r-0603.svg',
            layerSvgs: [
                {
                    layerKey: 'f-cu',
                    layerId: 'F.Cu',
                    displayName: 'F.Cu',
                    outputSvgKey: 'pcb-library/footprint-0-r-0603/f-cu.svg'
                },
                {
                    layerKey: 'f-fab',
                    layerId: 'F.Fab',
                    displayName: 'F.Fab',
                    outputSvgKey: 'pcb-library/footprint-0-r-0603/f-fab.svg'
                },
                {
                    layerKey: 'f-silks',
                    layerId: 'F.SilkS',
                    displayName: 'F.SilkS',
                    outputSvgKey: 'pcb-library/footprint-0-r-0603/f-silks.svg'
                }
            ],
            assets: [
                {
                    kind: 'model',
                    path: 'models/R_0603.step'
                }
            ],
            embeddedAssets: []
        }
    ])

    const symbolManifest =
        KicadLibraryRenderManifestBuilder.buildSchematicLibraryManifest({
            schematicLibrary: {
                symbols: [
                    {
                        name: 'Device:R',
                        units: [{ name: 'Device:R_0_1' }],
                        pins: [{ number: '1' }]
                    }
                ]
            }
        })

    assert.deepEqual(symbolManifest.outputs, [
        {
            kind: 'symbol',
            symbolKey: 'symbol-0-device-r',
            name: 'Device:R',
            unitKey: 'symbol-0-device-r/unit-0',
            unitName: 'Device:R_0_1',
            outputSvgKey: 'schematic-library/symbol-0-device-r/unit-0.svg',
            embeddedAssets: []
        }
    ])
})

test('KicadLibraryQaReportBuilder emits symbol library merge-plan diagnostics', () => {
    const report = KicadLibraryQaReportBuilder.build({
        schematicLibraries: [
            {
                fileName: 'first.kicad_sym',
                schematicLibrary: {
                    fonts: [{ name: 'KiCad Font A' }],
                    symbols: [
                        {
                            name: 'Device:CTRL_CORE',
                            units: [{ unitId: 1 }],
                            pins: [{ number: '1' }, { number: '2' }],
                            graphics: {
                                lines: [{ id: 'line-a' }]
                            },
                            embeddedAssets: [
                                {
                                    key: 'logo-a',
                                    format: 'png',
                                    source: 'image-a'
                                }
                            ]
                        }
                    ]
                }
            },
            {
                fileName: 'second.kicad_sym',
                schematicLibrary: {
                    fonts: [{ name: 'KiCad Font B' }],
                    symbols: [
                        {
                            name: 'Device:CTRL_CORE',
                            units: [{ unitId: 1 }, { unitId: 2 }],
                            pins: [{ number: '1' }],
                            graphics: {
                                rectangles: [{ id: 'rect-b' }],
                                circles: [{ id: 'circle-b' }]
                            },
                            embeddedAssets: [
                                {
                                    key: 'logo-b',
                                    format: 'jpg',
                                    source: 'image-b'
                                }
                            ]
                        }
                    ]
                }
            }
        ]
    })

    assert.equal(report.summary.mergePlanConflictCount, 1)
    assert.deepEqual(report.mergePlan, {
        schema: 'kicad-toolkit.library.merge-plan.a1',
        strategy: 'read-only-analysis',
        summary: {
            duplicateNameCount: 1,
            conflictCount: 1,
            renameSuggestionCount: 1,
            embeddedAssetCount: 2,
            fontDependencyCount: 2
        },
        duplicateSymbols: [
            {
                name: 'Device:CTRL_CORE',
                conflictKind: 'conflicting-symbol',
                suggestedNames: [
                    {
                        libraryFileName: 'first.kicad_sym',
                        index: 0,
                        currentName: 'Device:CTRL_CORE',
                        suggestedName: 'Device:CTRL_CORE'
                    },
                    {
                        libraryFileName: 'second.kicad_sym',
                        index: 0,
                        currentName: 'Device:CTRL_CORE',
                        suggestedName: 'Device:CTRL_CORE_2'
                    }
                ],
                differences: {
                    pinCounts: [2, 1],
                    unitCounts: [1, 2],
                    graphicCounts: [1, 2]
                },
                occurrences: [
                    {
                        libraryFileName: 'first.kicad_sym',
                        index: 0,
                        pinCount: 2,
                        unitCount: 1,
                        graphicCount: 1
                    },
                    {
                        libraryFileName: 'second.kicad_sym',
                        index: 0,
                        pinCount: 1,
                        unitCount: 2,
                        graphicCount: 2
                    }
                ]
            }
        ],
        embeddedAssets: [
            {
                libraryFileName: 'first.kicad_sym',
                symbolName: 'Device:CTRL_CORE',
                key: 'logo-a',
                format: 'png',
                source: 'image-a'
            },
            {
                libraryFileName: 'second.kicad_sym',
                symbolName: 'Device:CTRL_CORE',
                key: 'logo-b',
                format: 'jpg',
                source: 'image-b'
            }
        ],
        fontDependencies: [
            {
                libraryFileName: 'first.kicad_sym',
                name: 'KiCad Font A'
            },
            {
                libraryFileName: 'second.kicad_sym',
                name: 'KiCad Font B'
            }
        ],
        diagnostics: [
            {
                code: 'library.merge-plan.conflicting-symbol',
                severity: 'warning',
                symbolName: 'Device:CTRL_CORE'
            }
        ]
    })
})

test('KicadJobsetDigestBuilder indexes jobs by destination', () => {
    const digest = KicadJobsetDigestBuilder.build(jobsetFixture())

    assert.deepEqual(digest.summary, {
        title: 'KiCad jobset digest',
        jobsetCount: 1,
        jobCount: 2,
        destinationCount: 2,
        linkedJobCount: 2,
        expectedArtifactCount: 2
    })
    assert.deepEqual(
        digest.jobs.map((job) => ({
            id: job.id,
            type: job.type,
            destinationId: job.destinationId,
            destinationType: job.destinationType,
            outputPath: job.outputPath
        })),
        [
            {
                id: 'plot-job',
                type: 'pcb_export_gerbers',
                destinationId: 'fab-folder',
                destinationType: 'folder',
                outputPath: 'fab'
            },
            {
                id: 'bom-job',
                type: 'sch_export_bom',
                destinationId: 'archive',
                destinationType: 'archive',
                outputPath: 'fab.zip'
            }
        ]
    )
    assert.deepEqual(digest.jobsByDestination['fab-folder'], ['plot-job'])
    assert.deepEqual(digest.jobsByDestination.archive, ['bom-job'])
    assert.deepEqual(digest.expectedArtifacts, {
        schema: 'kicad-toolkit.project.expected-artifacts.a1',
        summary: {
            outputCount: 2,
            unsupportedOutputCount: 0
        },
        manifest: {
            outputs: [
                {
                    key: 'fabrication/00-plot-gerbers',
                    sourceFileName: 'fabrication.kicad_jobset',
                    destinationId: 'fab-folder',
                    destinationType: 'folder',
                    destinationDescription: 'Fabrication folder',
                    outputPath: 'fab',
                    jobId: 'plot-job',
                    jobType: 'pcb_export_gerbers',
                    jobDescription: 'Plot Gerbers',
                    normalizedType: 'gerber',
                    category: 'fabrication',
                    format: 'gerber',
                    unsupported: false
                },
                {
                    key: 'fabrication/01-bom',
                    sourceFileName: 'fabrication.kicad_jobset',
                    destinationId: 'archive',
                    destinationType: 'archive',
                    destinationDescription: 'Archive',
                    outputPath: 'fab.zip',
                    jobId: 'bom-job',
                    jobType: 'sch_export_bom',
                    jobDescription: 'BOM',
                    normalizedType: 'bom',
                    category: 'report',
                    format: 'bom',
                    unsupported: false
                }
            ]
        }
    })
})

test('KicadEmbeddedAssetInventoryBuilder inventories embedded and companion assets', () => {
    const inventory = KicadEmbeddedAssetInventoryBuilder.build({
        documents: [
            schematicDocumentFixture(),
            pcbDocumentFixture(),
            worksheetDocumentFixture()
        ],
        assets: [
            {
                name: 'models/R_0603.step',
                bytes: strToU8('fake-step')
            }
        ]
    })

    assert.deepEqual(inventory.summary, {
        title: 'KiCad asset inventory',
        assetCount: 5,
        embeddedFileCount: 1,
        imageCount: 1,
        modelCount: 1,
        worksheetBitmapCount: 1,
        externalAssetCount: 1
    })
    assert.deepEqual(
        inventory.assets.map((asset) => ({
            kind: asset.kind,
            name: asset.name,
            fileName: asset.fileName,
            available: asset.available
        })),
        [
            {
                kind: 'embedded-file',
                name: 'font.ttf',
                fileName: 'main.kicad_sch',
                available: true
            },
            {
                kind: 'schematic-image',
                name: 'schematic-image-0',
                fileName: 'main.kicad_sch',
                available: true
            },
            {
                kind: 'model-ref',
                name: 'models/R_0603.step',
                fileName: 'board.kicad_pcb',
                available: true
            },
            {
                kind: 'worksheet-bitmap',
                name: 'logo',
                fileName: 'page.kicad_wks',
                available: false
            },
            {
                kind: 'external-asset',
                name: 'models/R_0603.step',
                fileName: 'models/R_0603.step',
                available: true
            }
        ]
    )
})

test('KicadSchematicConnectivityQaBuilder reports schematic-local connectivity findings', () => {
    const report = KicadSchematicConnectivityQaBuilder.build({
        nets: [
            {
                name: 'UnknownNet0',
                labels: [{ text: 'SIG', x: 0, y: 0 }],
                pins: [{ ownerIndex: 'U1', designator: '1', x: 1, y: 0 }],
                sheetEntries: [{ name: 'IN', x: 2, y: 0 }],
                junctions: [{ x: 3, y: 0 }]
            }
        ],
        texts: [
            { recordType: '25', text: 'SIG', x: 0, y: 0 },
            { recordType: '25', text: 'LOST', x: 10, y: 10 }
        ],
        pins: [
            { ownerIndex: 'U1', designator: '1', x: 1, y: 0 },
            { ownerIndex: 'U2', designator: '2', x: 20, y: 20 }
        ],
        sheetEntries: [
            { name: 'IN', x: 2, y: 0 },
            { name: 'ORPHAN', x: 30, y: 30 }
        ],
        junctions: [
            { x: 3, y: 0 },
            { x: 40, y: 40 }
        ]
    })

    assert.deepEqual(report.summary, {
        netCount: 1,
        findingCount: 5,
        danglingLabelCount: 1,
        orphanSheetEntryCount: 1,
        unconnectedPinCount: 1,
        implicitNetCount: 1,
        ambiguousJunctionCount: 1
    })
    assert.deepEqual(
        report.findings.map((finding) => finding.code),
        [
            'schematic.connectivity.implicit-net-name',
            'schematic.connectivity.dangling-label',
            'schematic.connectivity.orphan-sheet-entry',
            'schematic.connectivity.unconnected-pin',
            'schematic.connectivity.ambiguous-junction'
        ]
    )
})

test('KicadSchematicQaReportBuilder summarizes document-level QA findings', () => {
    const report = KicadSchematicQaReportBuilder.build({
        schematic: {
            sheet: {
                titleBlock: {
                    title: '${TITLE}',
                    documentNumber: 'SCH-001',
                    revision: '',
                    date: '',
                    comments: {
                        1: '${UNKNOWN_COMMENT}'
                    }
                }
            },
            texts: [
                {
                    text: '${TITLE}',
                    fontFamily: 'KiCad Font',
                    strokeWidth: 0.1
                },
                {
                    text: '${MISSING_TEXT}',
                    fontFamily: 'Courier New',
                    strokeWidth: 0.2
                }
            ],
            drawings: [{ strokeWidth: 0.15 }]
        },
        projectParameters: {
            TITLE: 'QA fixture'
        }
    })

    assert.equal(report.schema, 'kicad-toolkit.schematic.qa.a1')
    assert.deepEqual(report.summary, {
        textCount: 2,
        fontFamilyCount: 2,
        lineWidthCount: 3,
        unresolvedParameterCount: 2,
        titleBlockGapCount: 2,
        findingCount: 4
    })
    assert.deepEqual(report.unresolvedParameters, [
        'MISSING_TEXT',
        'UNKNOWN_COMMENT'
    ])
    assert.deepEqual(
        report.findings.map((finding) => finding.code),
        [
            'schematic.text.unresolved-parameter',
            'schematic.text.unresolved-parameter',
            'schematic.title-block.missing-field',
            'schematic.title-block.missing-field'
        ]
    )
})

test('KicadLibraryQaReportBuilder reports library collection drift', () => {
    const report = KicadLibraryQaReportBuilder.build({
        schematicLibraries: [
            {
                fileName: 'Device.kicad_sym',
                schematicLibrary: {
                    symbols: [
                        {
                            name: 'Device:R',
                            units: [{ name: 'Device:R_0_1' }],
                            properties: {
                                Footprint: 'Passives:R_0603'
                            }
                        },
                        {
                            name: 'Device:Missing',
                            units: [
                                { unitId: 1, name: 'A' },
                                { unitId: 3, name: 'C' }
                            ],
                            properties: {
                                Footprint: 'Missing:Nope'
                            }
                        }
                    ]
                }
            },
            {
                fileName: 'Duplicate.kicad_sym',
                schematicLibrary: {
                    symbols: [
                        {
                            name: 'Device:R',
                            units: [{ name: 'Device:R_0_1' }]
                        }
                    ]
                }
            }
        ],
        pcbLibraries: [
            {
                fileName: 'Passives.pretty',
                pcbLibrary: {
                    footprints: [
                        {
                            name: 'R_0603',
                            pads: [{ number: '1' }],
                            models: [{ path: 'models/R_0603.step' }]
                        }
                    ]
                }
            },
            {
                fileName: 'Other.pretty',
                pcbLibrary: {
                    footprints: [
                        {
                            name: 'R_0603',
                            pads: [{ number: '1' }, { number: '2' }]
                        }
                    ]
                }
            }
        ],
        availableAssets: ['models/Present.step']
    })

    assert.equal(report.schema, 'kicad-toolkit.library.qa.a1')
    assert.deepEqual(report.summary, {
        schematicLibraryCount: 2,
        pcbLibraryCount: 2,
        duplicateSymbolCount: 1,
        mergePlanConflictCount: 0,
        duplicateFootprintCount: 1,
        unresolvedFootprintReferenceCount: 1,
        missingModelCount: 1,
        unitMismatchCount: 1,
        issueCount: 5
    })
    assert.deepEqual(
        report.issues.map((issue) => issue.code),
        [
            'library.duplicate-symbol',
            'library.duplicate-footprint',
            'library.unresolved-footprint-reference',
            'library.missing-model',
            'library.unit-mismatch'
        ]
    )
    assert.equal(report.duplicates.footprints[0].collisionKind, 'conflicting')
})

/**
 * Builds a normalized library index fixture.
 * @returns {object}
 */
function libraryIndexFixture() {
    return {
        kind: 'library-index',
        items: [
            {
                kind: 'footprint',
                name: 'R_0603',
                libraryName: 'Passives',
                fileName: 'Passives.pretty/R_0603.kicad_mod',
                item: {
                    name: 'R_0603',
                    footprintName: 'R_0603',
                    properties: {
                        Description: 'precision resistor footprint'
                    }
                }
            },
            {
                kind: 'symbol',
                name: 'Power:PWR_FLAG',
                libraryName: 'Power',
                fileName: 'Power.kicad_sym',
                item: {
                    name: 'Power:PWR_FLAG',
                    itemName: 'PWR_FLAG',
                    properties: {
                        Description: 'power flag symbol'
                    }
                }
            },
            {
                kind: 'design-block',
                name: 'Power Stage',
                libraryName: 'blocks',
                fileName: 'blocks.kicad_blocks/Power Stage.kicad_block',
                item: {
                    name: 'Power Stage',
                    description: 'Reusable buck converter',
                    keywords: 'buck regulator power'
                }
            }
        ]
    }
}

/**
 * Builds a parsed KiCad jobset fixture.
 * @returns {object}
 */
function jobsetFixture() {
    return {
        kind: 'jobset',
        fileName: 'fabrication.kicad_jobset',
        jobs: [
            {
                id: 'plot-job',
                type: 'pcb_export_gerbers',
                description: 'Plot Gerbers',
                output: 'fab-folder'
            },
            {
                id: 'bom-job',
                type: 'sch_export_bom',
                description: 'BOM',
                output: 'archive'
            }
        ],
        outputs: [
            {
                id: 'fab-folder',
                type: 'folder',
                description: 'Fabrication folder',
                settings: {
                    output_path: 'fab'
                }
            },
            {
                id: 'archive',
                type: 'archive',
                description: 'Archive',
                settings: {
                    output_path: 'fab.zip'
                }
            }
        ]
    }
}

/**
 * Builds a schematic document fixture with embedded assets.
 * @returns {object}
 */
function schematicDocumentFixture() {
    return {
        kind: 'schematic',
        fileName: 'main.kicad_sch',
        schematic: {
            embeddedFiles: [{ name: 'font.ttf', data: 'Zm9udA==' }],
            images: [{ data: 'iVBORw0KGgo=', uuid: 'image-1' }]
        }
    }
}

/**
 * Builds a PCB document fixture with a model reference.
 * @returns {object}
 */
function pcbDocumentFixture() {
    return {
        kind: 'pcb',
        fileName: 'board.kicad_pcb',
        pcb: {
            components: [
                {
                    designator: 'R1',
                    models: [{ path: 'models/R_0603.step' }]
                }
            ],
            kicadBoard: {
                footprints: [
                    {
                        reference: 'R1',
                        models: [{ path: 'models/R_0603.step' }]
                    }
                ]
            }
        }
    }
}

/**
 * Builds a worksheet document fixture with a bitmap placeholder.
 * @returns {object}
 */
function worksheetDocumentFixture() {
    return {
        kind: 'worksheet',
        fileName: 'page.kicad_wks',
        bitmaps: [{ name: 'logo' }]
    }
}
