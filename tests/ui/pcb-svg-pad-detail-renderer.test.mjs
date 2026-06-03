// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbSvgRenderer } from '../../src/ui/PcbSvgRenderer.mjs'

test('PcbSvgRenderer offsets pad drills and renders custom arc and curve primitives', () => {
    const svg = PcbSvgRenderer.render({
        title: 'Custom pad drill and curves',
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 },
        outlines: [],
        drawings: [],
        texts: [],
        footprints: [],
        pads: [
            {
                number: '1',
                type: 'thru_hole',
                shape: 'custom',
                x: 5,
                y: 5,
                width: 1,
                height: 1,
                rotation: 0,
                drill: 0.6,
                drillWidth: 0.6,
                drillHeight: 1.2,
                drillShape: 'oval',
                drillOffset: { x: 0.2, y: -0.1 },
                side: 'front',
                customPrimitives: [
                    {
                        type: 'arc',
                        fill: false,
                        strokeWidth: 0.2,
                        start: { x: -1, y: 0 },
                        mid: { x: 0, y: -1 },
                        end: { x: 1, y: 0 }
                    },
                    {
                        type: 'curve',
                        fill: false,
                        strokeWidth: 0.1,
                        points: [
                            { x: -1, y: 0 },
                            { x: -0.5, y: 0.8 },
                            { x: 0.5, y: -0.8 },
                            { x: 1, y: 0 }
                        ]
                    }
                ]
            }
        ]
    })

    assert.match(
        svg,
        /<rect class="pcb-pad-drill"(?=[^>]+x="4\.9")(?=[^>]+y="4\.3")(?=[^>]+width="0\.6")(?=[^>]+height="1\.2")(?=[^>]+transform="rotate\(0 5\.2 4\.9\)")/
    )
    assert.match(
        svg,
        /<path class="pcb-pad-primitive pcb-pad-primitive--arc"[^>]+d="M -1 0 A 1 1 0 0 1 1 0"/
    )
    assert.match(
        svg,
        /<path class="pcb-pad-primitive pcb-pad-primitive--curve"[^>]+d="M -1 0 C -0\.5 0\.8 0\.5 -0\.8 1 0"/
    )
    assert.match(svg, /stroke-width="0\.2"/)
    assert.match(svg, /stroke-width="0\.1"/)
})
