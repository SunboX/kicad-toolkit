// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbSvgRenderer } from '../../src/ui/PcbSvgRenderer.mjs'

test('PcbSvgRenderer rotates badge annotations', () => {
    const svg = PcbSvgRenderer.render(
        {
            title: 'Rotated Badge',
            bounds: {
                minX: 0,
                minY: 0,
                maxX: 20,
                maxY: 10,
                width: 20,
                height: 10
            },
            outlines: [],
            drawings: [],
            pads: [],
            texts: [],
            footprints: []
        },
        {
            side: 'front',
            badges: [
                {
                    id: 'badge-rotated',
                    text: 'A1',
                    x: 4,
                    y: 5,
                    rotation: 45,
                    side: 'front'
                }
            ]
        }
    )

    assert.match(
        svg,
        /class="pcb-badge"(?=[^>]+data-badge-id="badge-rotated")(?=[^>]+transform="translate\(4 5\) rotate\(45\)")/
    )
})
