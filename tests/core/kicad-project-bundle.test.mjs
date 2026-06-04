// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    ProjectDesignBundleBuilder,
    ProjectNetlistExporter,
    ProjectVariantViewBuilder
} from '../../src/parser.mjs'

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
