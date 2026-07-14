// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { CircuitJsonModelAdapter } from '../../src/legacy-parser.mjs'

/**
 * Verifies filled silkscreen intent survives schema-safe artwork projection.
 */
test('CircuitJsonModelAdapter preserves filled board and footprint silkscreen paths', () => {
    const rendererModel = {
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileType: 'kicad_pcb',
        fileName: 'filled-artwork.kicad_pcb',
        summary: {
            title: 'Filled Artwork',
            boardWidthMil: 1000,
            boardHeightMil: 500,
            layerCount: 2
        },
        diagnostics: [],
        pcb: {
            boardOutline: {
                widthMil: 1000,
                heightMil: 500,
                minX: 0,
                minY: 0
            },
            components: [
                {
                    componentIndex: 1,
                    footprintId: 'footprint:U1:1',
                    designator: 'U1',
                    x: 0,
                    y: 0,
                    layer: 'TOP'
                }
            ],
            pads: [],
            tracks: [],
            vias: [],
            kicadBoard: {
                drawings: [
                    {
                        id: 'board-fill',
                        ownerId: 'board',
                        sourceType: 'gr_poly',
                        type: 'polygon',
                        layer: 'F.SilkS',
                        fill: true,
                        strokeWidth: -0.000001,
                        points: [
                            { x: 1, y: 1 },
                            { x: 4, y: 1 },
                            { x: 2, y: 3 }
                        ]
                    },
                    {
                        id: 'footprint-fill',
                        ownerId: 'footprint:U1:1',
                        sourceType: 'fp_poly',
                        type: 'polygon',
                        layer: 'B.SilkS',
                        fill: true,
                        strokeWidth: 0.12,
                        points: [
                            { x: 6, y: 1 },
                            { x: 8, y: 1 },
                            { x: 7, y: 2 }
                        ]
                    }
                ]
            }
        }
    }

    const circuitJson = CircuitJsonModelAdapter.fromRendererModel(rendererModel)
    const boardFill = circuitJson.find(
        (element) =>
            element.type === 'pcb_note_path' &&
            element.source_type === 'gr_poly'
    )
    const footprintFill = circuitJson.find(
        (element) =>
            element.type === 'pcb_silkscreen_path' &&
            element.source_type === 'fp_poly'
    )

    assert.equal(boardFill.source_layer, 'F.SilkS')
    assert.equal(boardFill.fill, true)
    assert.equal(boardFill.route.length, 4)
    assert.equal(footprintFill.source_layer, 'B.SilkS')
    assert.equal(footprintFill.fill, true)
    assert.equal(footprintFill.route.length, 4)
})
