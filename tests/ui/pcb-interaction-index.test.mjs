// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    PcbInteractionIndex,
    PcbInteractionLayerModel
} from '../../src/legacy-renderers.mjs'

test('PcbInteractionIndex returns overlapping KiCad board items by selection priority', () => {
    const board = createBoard()
    const candidates = PcbInteractionIndex.hitTest(
        board,
        { x: 5, y: 5 },
        {
            side: 'front'
        }
    )
    const candidatesFromItems = PcbInteractionIndex.hitTestItems(
        PcbInteractionIndex.build(board),
        { x: 5, y: 5 },
        {
            side: 'front'
        }
    )

    assert.deepEqual(
        candidates.map((item) => item.type),
        ['track', 'pad', 'via', 'component', 'zone']
    )
    assert.deepEqual(
        candidatesFromItems.map((item) => item.type),
        candidates.map((item) => item.type)
    )
    assert.equal(PcbInteractionIndex.pick(board, { x: 5, y: 5 })?.type, 'track')
    assert.equal(candidates[0].netName, 'CLK')
    assert.equal(candidates[1].componentKey, 'U1')
})

test('PcbInteractionIndex respects hidden object categories before choosing a KiCad candidate', () => {
    const board = createBoard()
    const candidate = PcbInteractionIndex.pick(
        board,
        { x: 5, y: 5 },
        {
            hiddenObjects: ['tracks'],
            side: 'front'
        }
    )

    assert.equal(candidate?.type, 'pad')
    assert.equal(candidate?.componentKey, 'U1')
})

test('PcbInteractionLayerModel separates physical KiCad layers from virtual controls', () => {
    const model = PcbInteractionLayerModel.resolve(createBoard())

    assert.deepEqual(
        model.physicalLayers.map((layer) => layer.key),
        ['F.Cu', 'B.Cu', 'F.SilkS']
    )
    assert.deepEqual(
        model.virtualLayers.map((layer) => layer.key),
        ['tracks', 'vias', 'pads', 'holes', 'zones', 'footprint-text']
    )
    assert.equal(
        model.virtualLayers[2].physicalLayerKeys.includes('F.Cu'),
        true
    )
})

/**
 * Builds a fake KiCad board with intentionally overlapping selectable items.
 * @returns {object}
 */
function createBoard() {
    return {
        title: 'Interaction Board',
        bounds: {
            minX: 0,
            minY: 0,
            maxX: 10,
            maxY: 10,
            width: 10,
            height: 10
        },
        layers: [
            { name: 'F.Cu', type: 'signal' },
            { name: 'B.Cu', type: 'signal' },
            { name: 'F.SilkS', type: 'user' }
        ],
        outlines: [],
        drawings: [
            {
                id: 'zone-1',
                type: 'zone',
                sourceType: 'zone',
                material: 'copper',
                layer: 'F.Cu',
                side: 'front',
                netName: 'CLK',
                points: [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 10, y: 10 },
                    { x: 0, y: 10 }
                ]
            },
            {
                id: 'track-1',
                type: 'segment',
                sourceType: 'segment',
                material: 'copper',
                layer: 'F.Cu',
                side: 'front',
                netName: 'CLK',
                strokeWidth: 1,
                start: { x: 0, y: 5 },
                end: { x: 10, y: 5 }
            },
            {
                id: 'via-1',
                type: 'via',
                sourceType: 'via',
                material: 'copper',
                layer: 'F.Cu,B.Cu',
                side: 'both',
                netName: 'CLK',
                x: 5,
                y: 5,
                size: 2,
                drill: 0.6
            }
        ],
        pads: [
            {
                id: 'pad-1',
                footprintId: 'footprint:U1:0',
                footprintReference: 'U1',
                number: '1',
                shape: 'rect',
                x: 5,
                y: 5,
                width: 3,
                height: 3,
                rotation: 0,
                layers: ['F.Cu', 'F.Mask'],
                side: 'front',
                netName: 'CLK'
            }
        ],
        footprints: [
            {
                id: 'footprint:U1:0',
                reference: 'U1',
                layer: 'F.Cu',
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
        texts: [
            {
                id: 'text-1',
                ownerId: 'footprint:U1:0',
                value: 'U1',
                layer: 'F.SilkS',
                side: 'front',
                visible: true,
                x: 5,
                y: 7
            }
        ]
    }
}
