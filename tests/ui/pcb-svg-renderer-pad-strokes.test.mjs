// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbSvgRenderer } from '../../src/ui/PcbSvgRenderer.mjs'

test('PcbSvgRenderer keeps thin SMD pads visibly filled', () => {
    const svg = PcbSvgRenderer.render({
        title: 'Thin SMD pads',
        bounds: {
            minX: 0,
            minY: 0,
            maxX: 10,
            maxY: 10,
            width: 10,
            height: 10
        },
        outlines: [],
        drawings: [],
        texts: [],
        footprints: [],
        pads: [
            {
                number: '1',
                footprintId: 'footprint:U2:0',
                shape: 'roundrect',
                x: 2,
                y: 2,
                width: 1.6,
                height: 0.35,
                rotation: 0,
                drill: 0,
                roundrectRatio: 0.25,
                side: 'front'
            },
            {
                number: '2',
                footprintId: 'footprint:J1:0',
                shape: 'rect',
                x: 6,
                y: 6,
                width: 2,
                height: 2,
                rotation: 0,
                drill: 0,
                side: 'front'
            }
        ]
    })

    const thinPad = svg.match(
        /<rect class="pcb-pad"(?=[^>]+data-footprint-id="footprint:U2:0")[^>]+>/u
    )?.[0]
    const normalPad = svg.match(
        /<rect class="pcb-pad"(?=[^>]+data-footprint-id="footprint:J1:0")[^>]+>/u
    )?.[0]

    assert.match(thinPad || '', /stroke-width="0\.07"/)
    assert.match(normalPad || '', /stroke-width="0\.16"/)
})
