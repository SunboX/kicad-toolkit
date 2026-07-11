// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    PcbSvgRenderer,
    SchematicRenderOpsSidecarBuilder,
    SchematicSvgRenderer
} from '../../src/legacy-renderers.mjs'

/**
 * Decodes one SVG metadata JSON block.
 * @param {string} markup SVG markup.
 * @param {string} id Metadata element id.
 * @returns {object}
 */
function readMetadata(markup, id) {
    const match = markup.match(
        new RegExp('<metadata id="' + id + '"[^>]*>([^<]+)</metadata>', 'u')
    )
    assert.ok(match, 'metadata block is present')

    return JSON.parse(
        match[1]
            .replace(/&quot;/gu, '"')
            .replace(/&amp;/gu, '&')
            .replace(/&lt;/gu, '<')
            .replace(/&gt;/gu, '>')
    )
}

test('PcbSvgRenderer emits KiCad semantic data attributes and metadata sidecar', () => {
    const markup = PcbSvgRenderer.render(createPcbBoard())

    assert.match(
        markup,
        /<metadata id="pcb-semantic-metadata" data-schema="kicad-toolkit\.pcb\.svg\.semantics\.a1">/
    )
    assert.match(
        markup,
        /data-semantic-schema="kicad-toolkit\.pcb\.svg\.semantics\.a1"/
    )
    assert.match(markup, /data-feature="board-outline"/)
    assert.match(markup, /data-primitive="track"/)
    assert.match(markup, /data-element-key="pcb-track-0"/)
    assert.match(markup, /data-layer-key="F\.Cu"/)
    assert.match(markup, /data-layer-display-name="F\.Cu"/)
    assert.match(markup, /data-net="SIG_A"/)
    assert.match(markup, /data-component="U1"/)
    assert.match(markup, /data-pad-number="1"/)
    assert.match(markup, /data-hole-owner="pad"/)
    assert.match(markup, /data-hole-owner="via"/)

    const metadata = readMetadata(markup, 'pcb-semantic-metadata')
    assert.equal(metadata.schema, 'kicad-toolkit.pcb.svg.semantics.a1')
    assert.deepEqual(metadata.view.layerSet.includedLayerKeys, [
        'F.Cu',
        'F.SilkS'
    ])
    assert.deepEqual(metadata.nets, [
        {
            name: 'SIG_A',
            elementKeys: ['pcb-track-0', 'pcb-via-0', 'pcb-pad-0'],
            components: ['U1'],
            pads: ['U1:1']
        }
    ])
    assert.deepEqual(metadata.components, [
        {
            designator: 'U1',
            elementKeys: ['pcb-component-0', 'pcb-pad-0'],
            pads: ['1'],
            nets: ['SIG_A']
        }
    ])
})

test('PcbSvgRenderer renders deterministic KiCad per-layer SVG exports', () => {
    const layerSvgs = PcbSvgRenderer.renderLayerSvgs(createPcbBoard())

    assert.deepEqual(
        layerSvgs.map((entry) => ({
            layerKey: entry.layerKey,
            displayName: entry.displayName,
            role: entry.role
        })),
        [
            {
                layerKey: 'F.Cu',
                displayName: 'F.Cu',
                role: 'copper'
            },
            {
                layerKey: 'F.SilkS',
                displayName: 'F.SilkS',
                role: 'silkscreen'
            }
        ]
    )
    assert.match(layerSvgs[0].svg, /data-view-kind="layer"/)
    assert.match(layerSvgs[0].svg, /data-layer-view-key="F\.Cu"/)
    assert.match(layerSvgs[0].svg, /data-included-layer-keys="F\.Cu"/)
    assert.match(layerSvgs[0].svg, /data-primitive="track"/)
    assert.doesNotMatch(layerSvgs[0].svg, /REF_A/)
    assert.match(layerSvgs[1].svg, /data-layer-view-key="F\.SilkS"/)
    assert.match(layerSvgs[1].svg, /REF_A/)
    assert.doesNotMatch(layerSvgs[1].svg, /data-primitive="track"/)
})

test('SchematicSvgRenderer emits KiCad semantic metadata and resolves project parameters', () => {
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
    const documentModel = {
        fileName: 'semantic.kicad_sch',
        summary: { title: 'Semantic schematic' },
        schematic: {
            sheet: {
                width: 60,
                height: 40,
                titleBlock: {
                    title: '${ProjectTitle}',
                    documentNumber: '${DocumentNumber}'
                }
            },
            lines: [line],
            texts: [label, { x: 15, y: 30, text: '${ProjectTitle}' }],
            components: [
                {
                    id: 'symbol:U1:0',
                    ownerIndex: 'symbol:U1:0',
                    designator: 'U1',
                    libId: 'Device:R'
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
        }
    }

    const markup = SchematicSvgRenderer.render(documentModel, {
        projectParameters: {
            ProjectTitle: 'KiCad Parity',
            DocumentNumber: 'SCH-42'
        }
    })

    assert.match(
        markup,
        /data-semantic-schema="kicad-toolkit\.schematic\.svg\.semantics\.a1"/
    )
    assert.match(
        markup,
        /<metadata id="schematic-semantic-metadata" data-schema="kicad-toolkit\.schematic\.svg\.semantics\.a1">/
    )
    assert.match(
        markup,
        /<metadata id="schematic-render-ops-metadata" data-schema="kicad-toolkit\.schematic\.render-ops\.a1">/
    )
    assert.match(markup, /data-record-id="wire-1"/)
    assert.match(markup, /data-element-key="schematic-line-0"/)
    assert.match(markup, /data-record-id="pin-1"/)
    assert.match(markup, /data-element-key="schematic-pin-0"/)
    assert.match(markup, /data-component="U1"/)
    assert.match(markup, /data-pin="1"/)
    assert.match(markup, /data-net="SIG_A"/)
    assert.match(markup, /aria-label="KiCad Parity"/)
    assert.match(markup, /data-line="KiCad Parity"/)
    assert.match(markup, /aria-label="SCH-42"/)
    assert.match(markup, /data-line="SCH-42"/)
    assert.equal(
        documentModel.schematic.sheet.titleBlock.title,
        '${ProjectTitle}'
    )

    const metadata = readMetadata(markup, 'schematic-semantic-metadata')
    assert.equal(metadata.schema, 'kicad-toolkit.schematic.svg.semantics.a1')
    assert.deepEqual(metadata.nets, [
        {
            name: 'SIG_A',
            elementKeys: [
                'schematic-line-0',
                'schematic-text-0',
                'schematic-pin-0'
            ],
            components: ['U1'],
            pins: ['U1:1']
        }
    ])

    const renderOps = readMetadata(markup, 'schematic-render-ops-metadata')
    assert.equal(renderOps.schema, 'kicad-toolkit.schematic.render-ops.a1')
    assert.deepEqual(renderOps.summary, {
        recordCount: 4,
        operationCount: 4,
        failedRecordCount: 0
    })
    assert.deepEqual(
        renderOps.records.map((record) => ({
            elementKey: record.elementKey,
            recordId: record.recordId,
            primitive: record.primitive,
            operationTypes: record.operations.map((operation) => operation.type)
        })),
        [
            {
                elementKey: 'schematic-line-0',
                recordId: 'wire-1',
                primitive: 'line',
                operationTypes: ['line']
            },
            {
                elementKey: 'schematic-pin-0',
                recordId: 'pin-1',
                primitive: 'pin',
                operationTypes: ['pin']
            },
            {
                elementKey: 'schematic-text-0',
                recordId: 'label-1',
                primitive: 'text',
                operationTypes: ['stroke-text']
            },
            {
                elementKey: 'schematic-text-1',
                recordId: 'schematic-text-1',
                primitive: 'text',
                operationTypes: ['stroke-text']
            }
        ]
    )
})

test('SchematicRenderOpsSidecarBuilder builds deterministic operation rows', () => {
    const sidecar = SchematicRenderOpsSidecarBuilder.build({
        lines: [
            {
                id: 'wire-a',
                x1: 1,
                y1: 2,
                x2: 3,
                y2: 4,
                width: 0.15,
                isBus: true
            }
        ],
        pins: [
            {
                id: 'pin-a',
                x: 5,
                y: 6,
                length: 2.54,
                orientation: 'left',
                designator: '1'
            }
        ],
        texts: [
            {
                id: 'text-a',
                x: 7,
                y: 8,
                text: 'SIG',
                font: { height: 1.27, width: 1.27 }
            }
        ]
    })

    assert.equal(sidecar.profile, 'kicad-default')
    assert.deepEqual(sidecar.coordinateSpace, {
        x: 'kicad-schematic',
        y: 'kicad-schematic',
        units: 'millimeters'
    })
    assert.deepEqual(
        sidecar.records.map((record) => record.operations[0]),
        [
            {
                type: 'line',
                x1: 1,
                y1: 2,
                x2: 3,
                y2: 4,
                stroke: undefined,
                width: 0.15,
                isBus: true
            },
            {
                type: 'pin',
                x: 5,
                y: 6,
                length: 2.54,
                orientation: 'left',
                number: '1'
            },
            {
                type: 'stroke-text',
                x: 7,
                y: 8,
                text: 'SIG',
                fontSize: 1.27,
                rotation: undefined
            }
        ]
    )
})

/**
 * Creates a compact raw KiCad board model for renderer contract tests.
 * @returns {object}
 */
function createPcbBoard() {
    return {
        title: 'Semantic board',
        fileName: 'semantic.kicad_pcb',
        bounds: { minX: 0, minY: 0, maxX: 20, maxY: 12, width: 20, height: 12 },
        layers: [
            { name: 'F.Cu', type: 'signal' },
            { name: 'F.SilkS', type: 'user' }
        ],
        nets: [{ index: 1, name: 'SIG_A' }],
        footprints: [
            {
                id: 'footprint:U1:0',
                reference: 'U1',
                libraryName: 'Package_QFN:QFN-FAKE',
                side: 'front',
                x: 5,
                y: 5,
                rotation: 0,
                bounds: {
                    minX: 3,
                    minY: 3,
                    maxX: 7,
                    maxY: 7,
                    width: 4,
                    height: 4
                }
            }
        ],
        outlines: [
            {
                type: 'line',
                layer: 'Edge.Cuts',
                start: { x: 0, y: 0 },
                end: { x: 20, y: 0 },
                strokeWidth: 0.1
            },
            {
                type: 'line',
                layer: 'Edge.Cuts',
                start: { x: 20, y: 0 },
                end: { x: 20, y: 12 },
                strokeWidth: 0.1
            },
            {
                type: 'line',
                layer: 'Edge.Cuts',
                start: { x: 20, y: 12 },
                end: { x: 0, y: 12 },
                strokeWidth: 0.1
            },
            {
                type: 'line',
                layer: 'Edge.Cuts',
                start: { x: 0, y: 12 },
                end: { x: 0, y: 0 },
                strokeWidth: 0.1
            }
        ],
        drawings: [
            {
                type: 'segment',
                layer: 'F.Cu',
                side: 'front',
                material: 'copper',
                start: { x: 2, y: 5 },
                end: { x: 12, y: 5 },
                strokeWidth: 0.25,
                netIndex: 1,
                netName: 'SIG_A'
            },
            {
                type: 'via',
                layer: 'F.Cu,B.Cu',
                side: 'both',
                material: 'copper',
                x: 12,
                y: 5,
                size: 0.9,
                drill: 0.35,
                netIndex: 1,
                netName: 'SIG_A'
            }
        ],
        pads: [
            {
                number: '1',
                type: 'smd',
                shape: 'rect',
                x: 5,
                y: 5,
                width: 1.2,
                height: 0.8,
                rotation: 0,
                layers: ['F.Cu', 'F.Mask', 'F.Paste'],
                side: 'front',
                netIndex: 1,
                netName: 'SIG_A',
                footprintId: 'footprint:U1:0',
                drill: 0.2
            }
        ],
        texts: [
            {
                value: 'REF_A',
                layer: 'F.SilkS',
                side: 'front',
                material: 'silk',
                x: 5,
                y: 8,
                sizeX: 1,
                sizeY: 1,
                rotation: 0,
                hAlign: 'center',
                vAlign: 'center',
                thickness: 0.12,
                ownerId: 'footprint:U1:0'
            }
        ]
    }
}
