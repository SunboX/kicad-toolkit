// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    BomTableRenderer,
    PcbSideResolvedRenderModel,
    PcbSvgRenderer,
    SchematicSvgRenderer,
    isCopperPrimitive,
    preparePcbSideResolvedRenderModel
} from '../../src/renderers.mjs'

test('PcbSvgRenderer accepts an ECAD Forge KiCad document wrapper', () => {
    const markup = PcbSvgRenderer.render({
        sourceFormat: 'kicad',
        pcb: {
            kicadBoard: {
                fileName: 'wrapped.kicad_pcb',
                title: 'Wrapped',
                bounds: {
                    minX: 0,
                    minY: 0,
                    maxX: 10,
                    maxY: 5,
                    width: 10,
                    height: 5
                },
                outlines: [],
                pads: [],
                drawings: [],
                texts: []
            }
        }
    })

    assert.match(markup, /Wrapped/)
    assert.match(markup, /pcb-svg/)
})

test('SchematicSvgRenderer emits deterministic schematic SVG markup', () => {
    const markup = SchematicSvgRenderer.render({
        schematic: {
            sheet: { width: 100, height: 80 },
            lines: [{ x1: 1, y1: 2, x2: 20, y2: 2, width: 0.2 }],
            rectangles: [{ x: 10, y: 10, width: 20, height: 10 }],
            texts: [{ value: 'SIG', x: 5, y: 5, size: 2 }],
            junctions: [{ x: 20, y: 2, diameter: 1 }]
        }
    })

    assert.match(markup, /schematic-svg/)
    assert.match(markup, /SIG/)
    assert.match(markup, /<line/)
})

test('BomTableRenderer renders grouped KiCad BOM rows', () => {
    const markup = BomTableRenderer.render([
        {
            designators: ['U1'],
            quantity: 1,
            value: '100n',
            pattern: 'Device:C',
            source: 'KiCad schematic'
        }
    ])

    assert.match(markup, /bom-table/)
    assert.match(markup, /100n/)
    assert.match(markup, /U1/)
})

test('preparePcbSideResolvedRenderModel supports Altium-style PCB renderer usage', () => {
    const documentModel = {
        sourceFormat: 'kicad',
        pcb: {
            components: [
                { designator: 'U1', layer: 'TOP' },
                { designator: 'U2', layer: 'BOTTOM' }
            ],
            pads: [
                { id: 'top', side: 'front', layerId: 1 },
                { id: 'bottom', side: 'back', layerId: 32 },
                { id: 'through', side: 'both' }
            ],
            tracks: [{ id: 'front-track', layerId: 1 }],
            arcs: [{ id: 'back-arc', layerId: 32 }],
            vias: [{ id: 'via' }],
            texts: [{ id: 'bottom-text', side: 'back' }],
            kicadBoard: {
                fileName: 'resolved.kicad_pcb',
                title: 'Resolved',
                bounds: {
                    minX: 0,
                    minY: 0,
                    maxX: 10,
                    maxY: 5,
                    width: 10,
                    height: 5
                },
                outlines: [],
                footprints: [
                    { reference: 'U1', side: 'front' },
                    { reference: 'U2', side: 'back' }
                ],
                pads: [
                    { id: 'top', side: 'front' },
                    { id: 'bottom', side: 'back' },
                    { id: 'through', side: 'both' }
                ],
                drawings: [
                    { id: 'front-drawing', side: 'front' },
                    { id: 'back-drawing', side: 'back' }
                ],
                texts: [{ id: 'back-text', side: 'back' }]
            }
        }
    }

    const resolved = preparePcbSideResolvedRenderModel(documentModel, {
        side: 'back'
    })
    const markup = PcbSvgRenderer.render(resolved)

    assert.equal(resolved.renderSide, 'back')
    assert.deepEqual(
        resolved.pcb.components.map((component) => component.designator),
        ['U2']
    )
    assert.deepEqual(
        resolved.pcb.kicadBoard.footprints.map(
            (footprint) => footprint.reference
        ),
        ['U2']
    )
    assert.equal(
        PcbSideResolvedRenderModel.isCopperPrimitive({ layerId: 1 }),
        true
    )
    assert.equal(isCopperPrimitive({ layer: 'F.Cu' }), true)
    assert.match(markup, /scale\(-1 1\)/)
})
