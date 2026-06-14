// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbSvgRenderer } from '../../src/ui/PcbSvgRenderer.mjs'

test('PcbSvgRenderer draws pads above silkscreen so copper masks ink', () => {
    const svg = PcbSvgRenderer.render({
        title: 'Layered silkscreen',
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 },
        outlines: [],
        drawings: [
            {
                type: 'line',
                side: 'front',
                layer: 'F.SilkS',
                material: 'silk',
                strokeWidth: 0.2,
                start: { x: 1, y: 5 },
                end: { x: 9, y: 5 }
            }
        ],
        pads: [
            {
                number: '1',
                shape: 'rect',
                x: 5,
                y: 5,
                width: 2,
                height: 2,
                rotation: 0,
                drill: 0,
                side: 'front'
            }
        ],
        texts: []
    })
    const padIndex = svg.indexOf('class="pcb-pad"')
    const silkscreenIndex = svg.indexOf('class="pcb-drawing pcb-drawing--silk"')

    assert.ok(padIndex >= 0)
    assert.ok(silkscreenIndex >= 0)
    assert.ok(padIndex > silkscreenIndex)
})

test('PcbSvgRenderer renders copper arcs and visible graphic placeholders', () => {
    const svg = PcbSvgRenderer.render(
        {
            title: 'Visible graphics',
            bounds: {
                minX: 0,
                minY: 0,
                maxX: 24,
                maxY: 14,
                width: 24,
                height: 14
            },
            outlines: [],
            drawings: [
                {
                    type: 'arc',
                    sourceType: 'arc',
                    side: 'front',
                    layer: 'F.Cu',
                    material: 'copper',
                    strokeWidth: 0.25,
                    start: { x: 1, y: 1 },
                    mid: { x: 3, y: 3 },
                    end: { x: 5, y: 1 }
                },
                {
                    type: 'curve',
                    sourceType: 'gr_curve',
                    side: 'front',
                    layer: 'F.SilkS',
                    material: 'silk',
                    strokeWidth: 0.15,
                    points: [
                        { x: 6, y: 1 },
                        { x: 7, y: 0 },
                        { x: 8, y: 0 },
                        { x: 9, y: 1 }
                    ]
                },
                {
                    type: 'barcode',
                    side: 'front',
                    layer: 'F.SilkS',
                    material: 'silk',
                    text: 'LOT-1',
                    x: 10,
                    y: 2,
                    width: 3,
                    height: 2,
                    rotation: 0
                },
                {
                    type: 'target',
                    side: 'front',
                    layer: 'F.SilkS',
                    material: 'silk',
                    shape: 'plus',
                    x: 16,
                    y: 2,
                    size: 2,
                    strokeWidth: 0.1
                },
                {
                    type: 'point',
                    side: 'front',
                    layer: 'F.SilkS',
                    material: 'silk',
                    x: 20,
                    y: 2,
                    size: 0.8
                }
            ],
            pads: [],
            texts: []
        },
        { side: 'front' }
    )

    assert.match(svg, /class="pcb-arc"/)
    assert.match(svg, /class="pcb-drawing pcb-drawing--silk"[^>]+C 7 0 8 0 9 1/)
    assert.match(svg, /class="pcb-barcode"/)
    assert.match(svg, /aria-label="LOT-1"/)
    assert.match(svg, /class="pcb-target"/)
    assert.match(svg, /class="pcb-point"/)
})
