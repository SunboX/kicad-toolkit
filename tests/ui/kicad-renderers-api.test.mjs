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
            sheet: {
                width: 100,
                height: 80,
                borderOn: true,
                titleBlockOn: true,
                marginWidth: 5,
                xZones: 2,
                yZones: 2,
                titleBlock: {
                    title: 'Demo sheet',
                    revision: 'A',
                    date: '2026-01-02',
                    documentNumber: 'Demo Org',
                    drawnBy: 'Demo Author'
                }
            },
            lines: [{ x1: 1, y1: 2, x2: 20, y2: 2, width: 0.2 }],
            rectangles: [
                { x: 10, y: 10, width: 20, height: 10 },
                { x: 12, y: 12, width: 2, height: 1, fill: 'outline' }
            ],
            pins: [
                {
                    x: 20,
                    y: 2,
                    length: 2.54,
                    orientation: 'left',
                    designator: '1'
                },
                {
                    x: 30,
                    y: 4,
                    length: 2.54,
                    orientation: 'right',
                    designator: '2',
                    numberVisible: false
                },
                {
                    x: 40,
                    y: 10,
                    length: 2.54,
                    orientation: 'top',
                    designator: '3'
                }
            ],
            texts: [
                {
                    value: 'SIG',
                    x: 5,
                    y: 5,
                    size: 2,
                    labelKind: 'local',
                    rotation: 90,
                    anchor: 'middle',
                    vAlign: 'center'
                },
                {
                    value: 'LEFT',
                    x: 8,
                    y: 7,
                    size: 2,
                    labelKind: 'local',
                    rotation: 180,
                    anchor: 'end',
                    vAlign: 'bottom'
                }
            ],
            junctions: [{ x: 20, y: 2, diameter: 1 }]
        }
    })

    assert.match(markup, /schematic-svg/)
    assert.match(markup, /SIG/)
    assert.match(markup, /<line/)
    assert.match(markup, /sheet-backdrop/)
    assert.match(markup, /sheet-frame/)
    assert.match(markup, /sheet-zone-label/)
    assert.match(markup, /sheet-title-block/)
    assert.match(markup, /Demo sheet/)
    assert.match(markup, /Demo Org/)
    assert.match(markup, /Demo Author/)
    assert.match(markup, /viewBox="0 0 1000 800"/)
    assert.match(markup, /class="svg-panel"/)
    assert.match(markup, /transform="scale\(10\)"/)
    assert.match(markup, /stroke="var\(--schematic-default-ink-color\)"/)
    assert.match(
        markup,
        /x1="30" y1="4" x2="32.54" y2="4" stroke="var\(--schematic-power-color\)" stroke-width="0.08"/
    )
    assert.match(
        markup,
        /x1="40" y1="10" x2="40" y2="7.46" stroke="var\(--schematic-power-color\)" stroke-width="0.08"/
    )
    assert.match(markup, /fill="var\(--schematic-text-color\)"/)
    assert.match(
        markup,
        /x="12" y="12" width="2" height="1" fill="var\(--schematic-power-color\)"/
    )
    assert.match(markup, /class="schematic-pin-number"/)
    assert.match(markup, /font-size="0.85"/)
    assert.match(markup, /transform="rotate\(-90 5 5\)"/)
    assert.doesNotMatch(markup, /rotate\(180 8 7\)/)
    assert.match(markup, /dominant-baseline="alphabetic"/)
    assert.doesNotMatch(markup, /#1f2430/)
    assert.doesNotMatch(markup, /#840000/)
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
