// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbSvgRenderer } from '../../src/ui/PcbSvgRenderer.mjs'

/**
 * Creates a minimal KiCad board with rounded Edge.Cuts primitives.
 * @returns {object}
 */
function createRoundedOutlineBoard() {
    return {
        title: 'Rounded fake board',
        bounds: {
            minX: 0,
            minY: 0,
            maxX: 12,
            maxY: 8,
            width: 12,
            height: 8
        },
        outlines: [
            {
                type: 'line',
                layer: 'Edge.Cuts',
                strokeWidth: 0.4,
                start: { x: 10, y: 8 },
                end: { x: 2, y: 8 }
            },
            {
                type: 'arc',
                layer: 'Edge.Cuts',
                strokeWidth: 0.4,
                start: { x: 2, y: 8 },
                mid: { x: 0.5858, y: 7.4142 },
                end: { x: 0, y: 6 }
            },
            {
                type: 'line',
                layer: 'Edge.Cuts',
                strokeWidth: 0.4,
                start: { x: 0, y: 6 },
                end: { x: 0, y: 2 }
            },
            {
                type: 'arc',
                layer: 'Edge.Cuts',
                strokeWidth: 0.4,
                start: { x: 0, y: 2 },
                mid: { x: 0.5858, y: 0.5858 },
                end: { x: 2, y: 0 }
            },
            {
                type: 'line',
                layer: 'Edge.Cuts',
                strokeWidth: 0.4,
                start: { x: 2, y: 0 },
                end: { x: 10, y: 0 }
            },
            {
                type: 'arc',
                layer: 'Edge.Cuts',
                strokeWidth: 0.4,
                start: { x: 10, y: 0 },
                mid: { x: 11.4142, y: 0.5858 },
                end: { x: 12, y: 2 }
            },
            {
                type: 'line',
                layer: 'Edge.Cuts',
                strokeWidth: 0.4,
                start: { x: 12, y: 2 },
                end: { x: 12, y: 6 }
            },
            {
                type: 'arc',
                layer: 'Edge.Cuts',
                strokeWidth: 0.4,
                start: { x: 12, y: 6 },
                mid: { x: 11.4142, y: 7.4142 },
                end: { x: 10, y: 8 }
            }
        ],
        drawings: [],
        texts: [],
        footprints: [],
        pads: []
    }
}

/**
 * Creates a minimal board with front and back copper traces.
 * @returns {object}
 */
function createTwoLayerCopperBoard() {
    return {
        title: 'Layered fake board',
        bounds: {
            minX: 0,
            minY: 0,
            maxX: 10,
            maxY: 10,
            width: 10,
            height: 10
        },
        outlines: [],
        drawings: [
            {
                type: 'segment',
                layer: 'F.Cu',
                material: 'copper',
                side: 'front',
                start: { x: 1, y: 2 },
                end: { x: 4, y: 2 },
                strokeWidth: 0.4
            },
            {
                type: 'segment',
                layer: 'B.Cu',
                material: 'copper',
                side: 'back',
                start: { x: 1, y: 4 },
                end: { x: 4, y: 4 },
                strokeWidth: 0.4
            }
        ],
        texts: [],
        footprints: [],
        pads: []
    }
}

/**
 * Creates a minimal board with thick routed copper.
 * @returns {object}
 */
function createRoutedCopperBoard() {
    return {
        title: 'Routed fake board',
        bounds: {
            minX: 0,
            minY: 0,
            maxX: 10,
            maxY: 10,
            width: 10,
            height: 10
        },
        outlines: [],
        drawings: [
            {
                type: 'segment',
                layer: 'F.Cu',
                material: 'copper',
                side: 'front',
                start: { x: 1, y: 2 },
                end: { x: 4, y: 2 },
                strokeWidth: 0.8
            },
            {
                type: 'arc',
                sourceType: 'arc',
                layer: 'F.Cu',
                material: 'copper',
                side: 'front',
                start: { x: 5, y: 2 },
                mid: { x: 6, y: 3 },
                end: { x: 7, y: 2 },
                strokeWidth: 0.6
            }
        ],
        texts: [],
        footprints: [],
        pads: []
    }
}

test('PcbSvgRenderer follows rounded Edge.Cuts when drawing the board shape', () => {
    const svg = PcbSvgRenderer.render(createRoundedOutlineBoard())
    const boardShape = svg.match(/<path class="pcb-board"[^>]+>/u)?.[0] || ''

    assert.match(boardShape, /^<path class="pcb-board"/)
    assert.match(boardShape, /d="M 10 8 L 2 8 A /)
    assert.match(boardShape, / Z"/)
    assert.match(boardShape, /stroke-width="0\.4"/)
    assert.doesNotMatch(svg, /<rect class="pcb-board"/)
})

test('PcbSvgRenderer can include opposite-side copper without mirroring it', () => {
    const frontOnly = PcbSvgRenderer.render(createTwoLayerCopperBoard(), {
        side: 'front'
    })
    const layered = PcbSvgRenderer.render(createTwoLayerCopperBoard(), {
        side: 'front',
        includeOppositeCopper: true
    })

    assert.match(frontOnly, /data-layer="F\.Cu"/)
    assert.doesNotMatch(frontOnly, /data-layer="B\.Cu"/)
    assert.match(layered, /data-layer="F\.Cu"/)
    assert.match(layered, /data-layer="B\.Cu"[^>]+x1="1" y1="4" x2="4" y2="4"/)
})

test('PcbSvgRenderer lets routed copper widths scale with board geometry', () => {
    const svg = PcbSvgRenderer.render(createRoutedCopperBoard())
    const segment = svg.match(/<line class="pcb-segment"[^>]+>/u)?.[0] || ''
    const arc = svg.match(/<path class="pcb-arc"[^>]+>/u)?.[0] || ''

    assert.match(segment, /stroke-width="0\.8"/)
    assert.match(arc, /stroke-width="0\.6"/)
    assert.doesNotMatch(segment, /vector-effect="non-scaling-stroke"/)
    assert.doesNotMatch(arc, /vector-effect="non-scaling-stroke"/)
})
