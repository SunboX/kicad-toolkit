// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    KicadProjectBomPnpReconciliationBuilder,
    ProjectDesignBundleBuilder,
    ProjectNetlistExporter,
    ProjectVariantViewBuilder
} from '../../src/legacy-parser.mjs'

test('ProjectDesignBundleBuilder composes KiCad design bundle API rows', () => {
    const bundle = ProjectDesignBundleBuilder.build({
        projectModel: createProjectModel(),
        documentModels: [createSchematicDocument(), createPcbDocument()],
        variantName: 'Production'
    })

    assert.equal(bundle.kind, 'design-bundle')
    assert.equal(bundle.fileType, 'KicadProjectDesignBundle')
    assert.equal(bundle.sourceFormat, 'kicad')
    assert.deepEqual(bundle.summary, {
        title: 'demo',
        sheetCount: 1,
        componentCount: 2,
        netCount: 1,
        pnpCount: 2,
        variantCount: 1
    })
    assert.deepEqual(
        bundle.sheets.map((sheet) => ({
            fileName: sheet.fileName,
            title: sheet.title,
            path: sheet.path,
            page: sheet.page
        })),
        [
            {
                fileName: 'demo/root.kicad_sch',
                title: 'Root',
                path: '/',
                page: '1'
            }
        ]
    )
    assert.deepEqual(
        bundle.components.map((component) => ({
            designator: component.designator,
            schematicValue: component.schematic?.value,
            pcbPattern: component.pcb?.pattern,
            doNotPopulate: component.doNotPopulate
        })),
        [
            {
                designator: 'U1',
                schematicValue: '10k',
                pcbPattern: 'Package:R_0603',
                doNotPopulate: false
            },
            {
                designator: 'U2',
                schematicValue: '100n',
                pcbPattern: 'Package:C_0603',
                doNotPopulate: true
            }
        ]
    )
    assert.deepEqual(bundle.indexes.componentsByDesignator.U1, {
        bundleIndex: 0
    })
    assert.deepEqual(
        bundle.nets.map((net) => ({
            name: net.name,
            pins: net.pins.map((pin) => ({
                componentDesignator: pin.componentDesignator,
                designator: pin.designator,
                name: pin.name
            })),
            pcb: net.pcb
        })),
        [
            {
                name: 'SIG_A',
                pins: [
                    {
                        componentDesignator: 'U1',
                        designator: '1',
                        name: 'A'
                    },
                    {
                        componentDesignator: 'U2',
                        designator: '1',
                        name: 'B'
                    }
                ],
                pcb: [
                    {
                        fileName: 'demo/demo.kicad_pcb',
                        netIndex: 1
                    }
                ]
            }
        ]
    )
    assert.deepEqual(bundle.effectiveVariant.dnp, ['U2'])
    assert.deepEqual(
        bundle.effectiveVariant.bom.map((row) => ({
            designators: row.designators,
            quantity: row.quantity,
            value: row.value
        })),
        [
            {
                designators: ['U1'],
                quantity: 1,
                value: '10k 1%'
            }
        ]
    )
})

test('ProjectNetlistExporter builds KiCad JSON and wirelist exports', () => {
    const bundle = ProjectDesignBundleBuilder.build({
        projectModel: createProjectModel(),
        documentModels: [createSchematicDocument(), createPcbDocument()]
    })
    const variant = ProjectVariantViewBuilder.build(bundle, {
        variantName: 'Production'
    })
    const netlist = ProjectNetlistExporter.buildNetlistJson(variant)

    assert.equal(netlist.schema, 'kicad-toolkit.netlist.a1')
    assert.equal(netlist.project, 'demo')
    assert.deepEqual(
        netlist.nets.map((net) => ({
            name: net.name,
            pins: net.pins.map((pin) => ({
                component: pin.component,
                pin: pin.pin,
                name: pin.name
            })),
            excludedDesignators: net.excludedDesignators
        })),
        [
            {
                name: 'SIG_A',
                pins: [
                    {
                        component: 'U1',
                        pin: '1',
                        name: 'A'
                    }
                ],
                excludedDesignators: ['U2']
            }
        ]
    )
    assert.equal(
        ProjectNetlistExporter.buildWirelist(variant),
        '# kicad-toolkit wirelist v1\nproject demo\nnet SIG_A\n  U1.1\n'
    )
})

test('KicadProjectBomPnpReconciliationBuilder reports BOM and PnP drift', () => {
    const schematicDocument = createSchematicDocument()
    schematicDocument.bom = [
        ...schematicDocument.bom,
        {
            designators: ['U5'],
            quantity: 1,
            value: 'DNP jumper',
            pattern: 'Device:Jumper'
        }
    ]
    const pcbDocument = createPcbDocument()
    pcbDocument.bom = [
        {
            designators: ['U1'],
            quantity: 1,
            value: '10k',
            pattern: 'Package:R_0603'
        },
        {
            designator: 'U3',
            quantity: 1,
            value: 'test point',
            pattern: 'TestPoint:TP'
        },
        {
            designator: 'U5',
            quantity: 1,
            value: 'DNP jumper',
            pattern: 'Connector:Jumper'
        }
    ]
    pcbDocument.pcb.components.push(
        {
            designator: 'U3',
            componentIndex: 2,
            pattern: 'TestPoint:TP',
            excludeFromBom: true
        },
        {
            designator: 'U4',
            componentIndex: 3,
            pattern: 'Fixture:Optical',
            excludeFromPositionFiles: true
        },
        {
            designator: 'U5',
            componentIndex: 4,
            pattern: 'Connector:Jumper',
            doNotPopulate: true
        }
    )
    pcbDocument.pnp.entries = [
        { designator: 'U1', x: 1000, y: 2000, layer: 'TOP' },
        { designator: 'U4', x: 1100, y: 2100, layer: 'TOP' },
        { designator: 'U5', x: 1300, y: 2300, layer: 'TOP' }
    ]
    const bundle = ProjectDesignBundleBuilder.build({
        projectModel: createProjectModel(),
        documentModels: [schematicDocument, pcbDocument]
    })
    const report = KicadProjectBomPnpReconciliationBuilder.build({
        bundle,
        documentModels: [schematicDocument, pcbDocument]
    })

    assert.equal(
        report.schema,
        'kicad-toolkit.project.bom-pnp-reconciliation.a1'
    )
    assert.deepEqual(report.summary, {
        schematicBomDesignatorCount: 3,
        pcbBomDesignatorCount: 3,
        pnpDesignatorCount: 3,
        effectiveBomDesignatorCount: 3,
        noBomComponentCount: 2,
        doNotPopulateComponentCount: 2,
        positionExcludedComponentCount: 1,
        issueCount: 8
    })
    assert.deepEqual(report.schematicBomDesignators, ['U1', 'U2', 'U5'])
    assert.deepEqual(report.pcbBomDesignators, ['U1', 'U3', 'U5'])
    assert.deepEqual(report.pnpDesignators, ['U1', 'U4', 'U5'])
    assert.deepEqual(
        report.issues.map((issue) => issue.code),
        [
            'reconciliation.schematic-bom-without-pcb-bom',
            'reconciliation.pcb-bom-without-schematic-bom',
            'reconciliation.bom-without-pnp',
            'reconciliation.pnp-without-bom',
            'reconciliation.no-bom-component-in-pcb-bom',
            'reconciliation.dnp-component-in-bom',
            'reconciliation.dnp-component-in-pnp',
            'reconciliation.position-excluded-component-in-pnp'
        ]
    )
})

/**
 * Builds a fake KiCad project loader summary.
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
            ],
            variants: [
                {
                    description: 'Production',
                    uniqueId: 'variant-production',
                    dnp: ['U2'],
                    parameterOverrides: {
                        U1: {
                            Value: '10k 1%'
                        }
                    }
                }
            ]
        }
    }
}

/**
 * Builds a renderer-compatible KiCad schematic document.
 * @returns {object}
 */
function createSchematicDocument() {
    return {
        kind: 'schematic',
        fileName: 'demo/root.kicad_sch',
        summary: { title: 'Root' },
        schematic: {
            sheet: { title: 'Root' },
            components: [
                {
                    designator: 'U1',
                    ownerIndex: 'symbol:U1:0',
                    libId: 'Device:R',
                    value: '10k'
                },
                {
                    designator: 'U2',
                    ownerIndex: 'symbol:U2:0',
                    libId: 'Device:C',
                    value: '100n',
                    doNotPopulate: true,
                    excludeFromBom: true
                }
            ],
            nets: [
                {
                    name: 'SIG_A',
                    pins: [
                        {
                            ownerIndex: 'symbol:U1:0',
                            designator: '1',
                            name: 'A'
                        },
                        {
                            ownerIndex: 'symbol:U2:0',
                            designator: '1',
                            name: 'B'
                        }
                    ],
                    labels: [{ text: 'SIG_A', x: 10, y: 10 }],
                    segments: [{ x1: 0, y1: 0, x2: 10, y2: 0 }]
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
            },
            {
                designators: ['U2'],
                quantity: 1,
                value: '100n',
                pattern: 'Device:C',
                source: 'Device:C',
                doNotPopulate: true
            }
        ]
    }
}

/**
 * Builds a renderer-compatible KiCad PCB document.
 * @returns {object}
 */
function createPcbDocument() {
    return {
        kind: 'pcb',
        fileName: 'demo/demo.kicad_pcb',
        summary: { title: 'Demo Board' },
        pcb: {
            components: [
                {
                    designator: 'U1',
                    componentIndex: 0,
                    pattern: 'Package:R_0603'
                },
                {
                    designator: 'U2',
                    componentIndex: 1,
                    pattern: 'Package:C_0603',
                    doNotPopulate: true,
                    excludeFromBom: true
                }
            ],
            nets: [
                {
                    netIndex: 1,
                    name: 'SIG_A'
                }
            ]
        },
        pnp: {
            positionMode: 'board-origin',
            entries: [
                {
                    designator: 'U1',
                    x: 1000,
                    y: 2000,
                    layer: 'TOP'
                },
                {
                    designator: 'U2',
                    x: 1200,
                    y: 2200,
                    layer: 'TOP'
                }
            ]
        }
    }
}
