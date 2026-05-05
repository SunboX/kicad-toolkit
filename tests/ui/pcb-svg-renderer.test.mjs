// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { KicadPcbParser } from '../../src/core/KicadPcbParser.mjs'
import { PcbSvgRenderer } from '../../src/ui/PcbSvgRenderer.mjs'

const fixtureUrl = new URL('../fixtures/minimal.kicad_pcb', import.meta.url)

test('PcbSvgRenderer shows a centered board drop prompt when no board is loaded', () => {
    const svg = PcbSvgRenderer.render(null)

    assert.match(svg, /class="pcb-svg pcb-svg--empty"/)
    assert.match(svg, /viewBox="0 0 100 60"/)
    assert.match(svg, /aria-label="Drop board file"/)
    assert.match(svg, /Drop board file/)
    assert.match(svg, /\.kicad_pcb or project \.zip/)
    assert.match(svg, /stroke-dasharray=/)
    assert.doesNotMatch(svg, /Open a KiCad PCB/)
    assert.doesNotMatch(svg, /fill="#000000"/)
})

test('PcbSvgRenderer draws manual-style black board and grey pads without markers', async () => {
    const source = await readFile(fixtureUrl, 'utf8')
    const board = KicadPcbParser.parse(source, {
        fileName: 'minimal.kicad_pcb'
    })
    const svg = PcbSvgRenderer.render(board, {
        side: 'front'
    })

    assert.match(svg, /^<svg/)
    assert.match(svg, /class="pcb-board"/)
    assert.match(svg, /fill="#000000"/)
    assert.match(svg, /class="pcb-pad"/)
    assert.match(svg, /fill="#cfd1d4"/)
    assert.doesNotMatch(svg, /marker-badge/)
    assert.doesNotMatch(svg, /#ff3b2b/)
})

test('PcbSvgRenderer keeps rectangular pads square-cornered', () => {
    const svg = PcbSvgRenderer.render({
        title: 'Rectangular pads',
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
                shape: 'rect',
                x: 5,
                y: 5,
                width: 2.1844,
                height: 3,
                rotation: 270,
                drill: 0,
                roundrectRatio: 0.25,
                side: 'front'
            }
        ]
    })

    const padRect = svg.match(/<rect class="pcb-pad"[^>]+>/)?.[0] || ''

    assert.match(padRect, /width="2\.1844"/)
    assert.match(padRect, /height="3"/)
    assert.doesNotMatch(padRect, /\srx="/)
    assert.doesNotMatch(padRect, /\sry="/)
})

test('PcbSvgRenderer applies custom render layer styles', () => {
    const svg = PcbSvgRenderer.render(
        {
            title: 'Custom styles',
            bounds: {
                minX: 0,
                minY: 0,
                maxX: 10,
                maxY: 10,
                width: 10,
                height: 10
            },
            outlines: [
                {
                    type: 'polygon',
                    strokeWidth: 0.1,
                    points: [
                        { x: 0, y: 0 },
                        { x: 10, y: 0 },
                        { x: 10, y: 10 },
                        { x: 0, y: 10 }
                    ]
                }
            ],
            drawings: [
                {
                    type: 'segment',
                    side: 'front',
                    layer: 'F.Cu',
                    start: { x: 1, y: 1 },
                    end: { x: 2, y: 1 },
                    strokeWidth: 0.2
                },
                {
                    type: 'zone',
                    side: 'front',
                    layer: 'F.Cu',
                    points: [
                        { x: 3, y: 3 },
                        { x: 4, y: 3 },
                        { x: 4, y: 4 }
                    ]
                },
                {
                    type: 'line',
                    side: 'front',
                    layer: 'F.SilkS',
                    material: 'silk',
                    strokeWidth: 0.1,
                    start: { x: 5, y: 5 },
                    end: { x: 6, y: 5 }
                }
            ],
            pads: [
                {
                    number: '1',
                    shape: 'circle',
                    x: 5,
                    y: 5,
                    width: 1,
                    height: 1,
                    rotation: 0,
                    drill: 0,
                    side: 'front'
                }
            ],
            texts: [textOnly('SILK', { x: 5, y: 9 })],
            footprints: []
        },
        {
            side: 'front',
            layerStyles: {
                board: { fillColor: '#112233' },
                edgeCuts: { borderColor: '#223344', borderWidth: 0.44 },
                pads: {
                    fillColor: '#334455',
                    borderColor: '#667788',
                    borderWidth: 0.33
                },
                traces: { borderColor: '#445566', borderWidth: 0.66 },
                zones: {
                    fillColor: '#556677',
                    borderColor: '#556688',
                    borderWidth: 0.11
                },
                silkscreen: {
                    fillColor: '#778899',
                    borderColor: '#8899aa',
                    borderWidth: 0.22
                }
            }
        }
    )

    assert.match(svg, /class="pcb-board"[^>]+fill="#112233"/)
    assert.match(svg, /class="pcb-board"[^>]+stroke="#223344"/)
    assert.match(svg, /class="pcb-board"[^>]+stroke-width="0\.44"/)
    assert.match(svg, /class="pcb-pad"[^>]+fill="#334455"/)
    assert.match(svg, /class="pcb-pad"[^>]+stroke="#667788"/)
    assert.match(svg, /class="pcb-pad"[^>]+stroke-width="0\.33"/)
    assert.match(svg, /class="pcb-segment"[^>]+stroke="#445566"/)
    assert.match(svg, /class="pcb-segment"[^>]+stroke-width="0\.66"/)
    assert.match(svg, /class="pcb-zone"[^>]+fill="#556677"/)
    assert.match(svg, /class="pcb-zone"[^>]+stroke="#556688"/)
    assert.match(svg, /class="pcb-zone"[^>]+stroke-width="0\.11"/)
    assert.match(svg, /class="pcb-label"[^>]+stroke="#8899aa"/)
    assert.match(svg, /class="pcb-label"[^>]+stroke-width="0\.22"/)
})

test('PcbSvgRenderer rounds caps and joins for line artwork', () => {
    const svg = PcbSvgRenderer.render(
        {
            title: 'Rounded line ends',
            bounds: {
                minX: 0,
                minY: 0,
                maxX: 10,
                maxY: 10,
                width: 10,
                height: 10
            },
            outlines: [
                {
                    type: 'polygon',
                    strokeWidth: 0.4,
                    points: [
                        { x: 0, y: 0 },
                        { x: 10, y: 0 },
                        { x: 10, y: 10 },
                        { x: 0, y: 10 }
                    ]
                }
            ],
            drawings: [
                {
                    type: 'line',
                    side: 'front',
                    layer: 'F.SilkS',
                    material: 'silk',
                    strokeWidth: 0.8,
                    start: { x: 1, y: 2 },
                    end: { x: 4, y: 2 }
                },
                {
                    type: 'arc',
                    side: 'front',
                    layer: 'F.SilkS',
                    material: 'silk',
                    strokeWidth: 0.8,
                    start: { x: 5, y: 2 },
                    mid: { x: 6, y: 1 },
                    end: { x: 7, y: 2 }
                },
                {
                    type: 'segment',
                    side: 'front',
                    layer: 'F.Cu',
                    start: { x: 1, y: 5 },
                    end: { x: 4, y: 5 },
                    strokeWidth: 0.8
                }
            ],
            pads: [],
            texts: [],
            footprints: []
        },
        {
            side: 'front'
        }
    )

    const board = svg.match(/class="pcb-board"[^>]+/)?.[0] || ''
    const silkDrawings = Array.from(
        svg.matchAll(
            /<(?:line|path) class="pcb-drawing pcb-drawing--silk"[^>]+>/gu
        )
    ).map((match) => match[0])
    const segment = svg.match(/class="pcb-segment"[^>]+/)?.[0] || ''

    assert.match(board, /stroke-linecap="round"/)
    assert.match(board, /stroke-linejoin="round"/)
    assert.equal(silkDrawings.length, 2)
    silkDrawings.forEach((drawing) => {
        assert.match(drawing, /stroke-linecap="round"/)
        assert.match(drawing, /stroke-linejoin="round"/)
    })
    assert.match(segment, /stroke-linecap="round"/)
    assert.match(segment, /stroke-linejoin="round"/)
})

test('PcbSvgRenderer hides disabled render layers completely', () => {
    const svg = PcbSvgRenderer.render(
        {
            title: 'Hidden layers',
            bounds: {
                minX: 0,
                minY: 0,
                maxX: 10,
                maxY: 10,
                width: 10,
                height: 10
            },
            outlines: [
                {
                    type: 'polygon',
                    strokeWidth: 0.1,
                    points: [
                        { x: 0, y: 0 },
                        { x: 10, y: 0 },
                        { x: 10, y: 10 },
                        { x: 0, y: 10 }
                    ]
                }
            ],
            drawings: [
                {
                    type: 'segment',
                    side: 'front',
                    layer: 'F.Cu',
                    start: { x: 1, y: 1 },
                    end: { x: 2, y: 1 },
                    strokeWidth: 0.2
                },
                {
                    type: 'zone',
                    side: 'front',
                    layer: 'F.Cu',
                    points: [
                        { x: 3, y: 3 },
                        { x: 4, y: 3 },
                        { x: 4, y: 4 }
                    ]
                },
                {
                    type: 'via',
                    side: 'both',
                    layer: 'F.Cu,B.Cu',
                    x: 5,
                    y: 5,
                    size: 1,
                    drill: 0.4
                },
                {
                    type: 'line',
                    side: 'front',
                    layer: 'F.SilkS',
                    material: 'silk',
                    strokeWidth: 0.1,
                    start: { x: 5, y: 5 },
                    end: { x: 6, y: 5 }
                }
            ],
            pads: [
                {
                    number: '1',
                    shape: 'circle',
                    x: 5,
                    y: 5,
                    width: 1,
                    height: 1,
                    rotation: 0,
                    drill: 0.4,
                    side: 'front'
                }
            ],
            texts: [textOnly('SILK', { x: 5, y: 9 })],
            footprints: []
        },
        {
            side: 'front',
            layerStyles: {
                board: { visible: false },
                edgeCuts: { visible: false },
                pads: { visible: false },
                traces: { visible: false },
                zones: { visible: false },
                vias: { visible: false },
                drills: { visible: false },
                silkscreen: { visible: false }
            }
        }
    )

    assert.doesNotMatch(svg, /class="pcb-board"/)
    assert.doesNotMatch(svg, /class="pcb-pad"/)
    assert.doesNotMatch(svg, /class="pcb-segment"/)
    assert.doesNotMatch(svg, /class="pcb-zone"/)
    assert.doesNotMatch(svg, /class="pcb-via"/)
    assert.doesNotMatch(svg, /class="pcb-via-drill"/)
    assert.doesNotMatch(svg, /class="pcb-label"/)
})

test('PcbSvgRenderer renders zero-opacity layer fills without hiding borders', () => {
    const svg = PcbSvgRenderer.render(
        {
            title: 'Zero-opacity fills',
            bounds: {
                minX: 0,
                minY: 0,
                maxX: 10,
                maxY: 10,
                width: 10,
                height: 10
            },
            outlines: [
                {
                    type: 'polygon',
                    strokeWidth: 0.1,
                    points: [
                        { x: 0, y: 0 },
                        { x: 10, y: 0 },
                        { x: 10, y: 10 },
                        { x: 0, y: 10 }
                    ]
                }
            ],
            drawings: [
                {
                    type: 'zone',
                    side: 'front',
                    layer: 'F.Cu',
                    points: [
                        { x: 3, y: 3 },
                        { x: 4, y: 3 },
                        { x: 4, y: 4 }
                    ]
                },
                {
                    type: 'via',
                    side: 'both',
                    layer: 'F.Cu,B.Cu',
                    x: 6,
                    y: 6,
                    size: 1,
                    drill: 0
                }
            ],
            pads: [
                {
                    number: '1',
                    shape: 'circle',
                    x: 5,
                    y: 5,
                    width: 1,
                    height: 1,
                    rotation: 0,
                    drill: 0,
                    side: 'front'
                }
            ],
            texts: [],
            footprints: []
        },
        {
            side: 'front',
            layerStyles: {
                board: { fillOpacity: 0 },
                pads: { fillOpacity: 0 },
                zones: { fillOpacity: 0, borderWidth: 0.12 },
                vias: { fillOpacity: 0 }
            }
        }
    )

    assert.match(svg, /class="pcb-board"[^>]+fill="#000000"/)
    assert.match(svg, /class="pcb-board"[^>]+fill-opacity="0"/)
    assert.match(svg, /class="pcb-board"[^>]+stroke="#8e929c"/)
    assert.match(svg, /class="pcb-pad"[^>]+fill="#cfd1d4"/)
    assert.match(svg, /class="pcb-pad"[^>]+fill-opacity="0"/)
    assert.match(svg, /class="pcb-pad"[^>]+stroke="#50545f"/)
    assert.match(svg, /class="pcb-zone"[^>]+fill="#3c3f46"/)
    assert.match(svg, /class="pcb-zone"[^>]+fill-opacity="0"/)
    assert.match(svg, /class="pcb-zone"[^>]+stroke="#50545f"/)
    assert.match(svg, /class="pcb-via"[^>]+fill="#70747d"/)
    assert.match(svg, /class="pcb-via"[^>]+fill-opacity="0"/)
    assert.match(svg, /class="pcb-via"[^>]+stroke="#50545f"/)
})

test('PcbSvgRenderer applies fill opacity to fill-capable layers', () => {
    const svg = PcbSvgRenderer.render(
        {
            title: 'Fill opacity',
            bounds: {
                minX: 0,
                minY: 0,
                maxX: 10,
                maxY: 10,
                width: 10,
                height: 10
            },
            outlines: [
                {
                    type: 'polygon',
                    strokeWidth: 0.1,
                    points: [
                        { x: 0, y: 0 },
                        { x: 10, y: 0 },
                        { x: 10, y: 10 },
                        { x: 0, y: 10 }
                    ]
                }
            ],
            drawings: [
                {
                    type: 'zone',
                    side: 'front',
                    layer: 'F.Cu',
                    points: [
                        { x: 3, y: 3 },
                        { x: 4, y: 3 },
                        { x: 4, y: 4 }
                    ]
                },
                {
                    type: 'via',
                    side: 'both',
                    layer: 'F.Cu,B.Cu',
                    x: 6,
                    y: 6,
                    size: 1,
                    drill: 0
                }
            ],
            pads: [
                {
                    number: '1',
                    shape: 'circle',
                    x: 5,
                    y: 5,
                    width: 1,
                    height: 1,
                    rotation: 0,
                    drill: 0,
                    side: 'front'
                }
            ],
            texts: [],
            footprints: []
        },
        {
            side: 'front',
            layerStyles: {
                board: { fillOpacity: 0.25 },
                pads: { fillOpacity: 0.5 },
                zones: { fillOpacity: 0.35 },
                vias: { fillOpacity: 0.75 }
            }
        }
    )

    assert.match(svg, /class="pcb-board"[^>]+fill-opacity="0\.25"/)
    assert.match(svg, /class="pcb-pad"[^>]+fill-opacity="0\.5"/)
    assert.match(svg, /class="pcb-zone"[^>]+fill-opacity="0\.35"/)
    assert.match(svg, /class="pcb-via"[^>]+fill-opacity="0\.75"/)
})

test('PcbSvgRenderer highlights selected and hovered footprint artwork', () => {
    const svg = PcbSvgRenderer.render(
        {
            title: 'Component highlights',
            bounds: {
                minX: 0,
                minY: 0,
                maxX: 20,
                maxY: 10,
                width: 20,
                height: 10
            },
            outlines: [],
            drawings: [
                {
                    id: 'line-u1',
                    ownerId: 'footprint:U1:0',
                    type: 'line',
                    side: 'front',
                    layer: 'F.SilkS',
                    material: 'silk',
                    strokeWidth: 0.2,
                    fill: false,
                    start: { x: 1, y: 2 },
                    end: { x: 3, y: 2 }
                }
            ],
            pads: [
                {
                    id: 'pad-u1',
                    footprintId: 'footprint:U1:0',
                    footprintReference: 'U1',
                    number: '1',
                    shape: 'rect',
                    x: 2,
                    y: 5,
                    width: 1,
                    height: 1,
                    rotation: 0,
                    drill: 0,
                    side: 'front'
                },
                {
                    id: 'pad-r1',
                    footprintId: 'footprint:R1:1',
                    footprintReference: 'R1',
                    number: '1',
                    shape: 'circle',
                    x: 8,
                    y: 5,
                    width: 1,
                    height: 1,
                    rotation: 0,
                    drill: 0,
                    side: 'front'
                }
            ],
            texts: [
                {
                    id: 'text-u1',
                    ownerId: 'footprint:U1:0',
                    value: 'U1',
                    x: 2,
                    y: 7,
                    rotation: 0,
                    layer: 'F.SilkS',
                    side: 'front',
                    mirrored: false,
                    hAlign: 'center',
                    vAlign: 'center',
                    sizeX: 1,
                    sizeY: 1,
                    thickness: 0.12,
                    visible: true
                }
            ],
            footprints: [
                {
                    id: 'footprint:U1:0',
                    reference: 'U1',
                    side: 'front',
                    bounds: {
                        minX: 1,
                        minY: 2,
                        maxX: 3,
                        maxY: 7,
                        width: 2,
                        height: 5
                    }
                },
                {
                    id: 'footprint:R1:1',
                    reference: 'R1',
                    side: 'front',
                    bounds: {
                        minX: 7,
                        minY: 4,
                        maxX: 9,
                        maxY: 6,
                        width: 2,
                        height: 2
                    }
                }
            ]
        },
        {
            side: 'front',
            highlightedFootprints: ['footprint:U1:0'],
            hoveredFootprintId: 'footprint:R1:1',
            highlightColor: '#ff3b2b'
        }
    )

    assert.match(
        svg,
        /class="pcb-pad[^"]*"(?=[^>]+data-footprint-id="footprint:U1:0")(?=[^>]+data-highlight-state="selected")(?=[^>]+fill="#ff3b2b")/
    )
    assert.match(
        svg,
        /class="pcb-drawing[^"]*"(?=[^>]+data-footprint-id="footprint:U1:0")(?=[^>]+data-highlight-state="selected")(?=[^>]+stroke="#ff3b2b")/
    )
    assert.match(
        svg,
        /class="pcb-label[^"]*"(?=[^>]+data-footprint-id="footprint:U1:0")(?=[^>]+data-highlight-state="selected")(?=[^>]+stroke="#ff3b2b")/
    )
    assert.match(
        svg,
        /class="pcb-pad[^"]*"(?=[^>]+data-footprint-id="footprint:R1:1")(?=[^>]+data-highlight-state="hover")(?=[^>]+fill="#e58e88")/
    )
    assert.match(
        svg,
        /class="pcb-component-hit-area"(?=[^>]+data-footprint-id="footprint:U1:0")/
    )
    assert.match(
        svg,
        /class="pcb-component-hit-area"(?=[^>]+data-footprint-id="footprint:R1:1")/
    )
    assert.doesNotMatch(svg, /marker-badge/)
})

test('PcbSvgRenderer draws current-side badges with highlight color', () => {
    const svg = PcbSvgRenderer.render(
        {
            title: 'Badges',
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
            highlightColor: '#ff3b2b',
            badges: [
                { id: 'badge-1', text: '1', x: 4, y: 5, side: 'front' },
                { id: 'badge-2', text: 'A', x: 8, y: 5, side: 'back' }
            ]
        }
    )

    assert.match(svg, /class="pcb-badge"(?=[^>]+data-badge-id="badge-1")/)
    assert.match(svg, /class="pcb-badge-fill"[^>]+fill="#ff3b2b"/)
    assert.match(svg, /class="pcb-badge-fill"[^>]+stroke="#000000"/)
    assert.match(
        svg,
        /class="pcb-badge-text"[^>]+fill="#000000"[^>]*>1<\/text>/
    )
    assert.doesNotMatch(svg, /pcb-badge-shadow/)
    assert.doesNotMatch(svg, /badge-2/)
})

test('PcbSvgRenderer applies badge foreground, scale, and shadow styles', () => {
    const svg = PcbSvgRenderer.render(
        {
            title: 'Styled Badges',
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
            highlightColor: '#ff3b2b',
            badgeStyle: {
                foregroundColor: '#112233',
                scale: 1.5,
                shadowColor: '#445566',
                shadowOpacity: 0.6,
                shadowBlur: 0.9,
                shadowOffsetX: 0.4,
                shadowOffsetY: 0.5
            },
            badges: [{ id: 'badge-1', text: 'A1', x: 4, y: 5, side: 'front' }]
        }
    )

    assert.match(svg, /id="pcb-badge-shadow"/)
    assert.match(svg, /dx="0.4"/)
    assert.match(svg, /dy="0.5"/)
    assert.match(svg, /stdDeviation="0.9"/)
    assert.match(svg, /flood-color="#445566"/)
    assert.match(svg, /flood-opacity="0.6"/)
    assert.match(
        svg,
        /class="pcb-badge"(?=[^>]+data-badge-id="badge-1")(?=[^>]+scale\(1.5\))/
    )
    assert.match(svg, /class="pcb-badge-fill"[^>]+stroke="#112233"/)
    assert.match(
        svg,
        /class="pcb-badge-fill"[^>]+filter="url\(#pcb-badge-shadow\)"/
    )
    assert.match(
        svg,
        /class="pcb-badge-text"[^>]+fill="#112233"[^>]*>A1<\/text>/
    )
})

test('PcbSvgRenderer renders longer badge text as a pill', () => {
    const svg = PcbSvgRenderer.render(
        {
            title: 'Pill Badge',
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
            highlightColor: '#ff3b2b',
            badges: [
                {
                    id: 'badge-long',
                    text: 'Text 123',
                    x: 4,
                    y: 5,
                    side: 'front'
                }
            ]
        }
    )

    assert.match(
        svg,
        /<rect class="pcb-badge-fill"(?=[^>]+width="10.8")(?=[^>]+height="4.4")(?=[^>]+rx="2.2")/
    )
    assert.match(svg, /class="pcb-badge-text"[^>]*>Text 123<\/text>/)
    assert.doesNotMatch(svg, /<circle class="pcb-badge-fill"/)
})

test('PcbSvgRenderer draws pad drill cutouts above overlapping pads', () => {
    const svg = PcbSvgRenderer.render({
        title: 'Overlapping pads',
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
                number: '-',
                footprintId: 'footprint:J1:0',
                shape: 'circle',
                x: 5,
                y: 5,
                width: 2,
                height: 2,
                rotation: 0,
                drill: 1,
                roundrectRatio: 0.25,
                side: 'front'
            },
            {
                number: '2',
                shape: 'rect',
                x: 5,
                y: 5.5,
                width: 2,
                height: 3,
                rotation: 0,
                drill: 0,
                roundrectRatio: 0.25,
                side: 'front'
            }
        ]
    })

    const rectIndex = svg.indexOf('<rect class="pcb-pad"')
    const drillIndex = svg.indexOf('class="pcb-pad-drill"')

    assert.ok(rectIndex >= 0)
    assert.ok(drillIndex > rectIndex)
    assert.match(
        svg,
        /class="pcb-pad-drill"(?=[^>]+data-footprint-id="footprint:J1:0")/
    )
})

test('PcbSvgRenderer mirrors KiCad bottom-side text when justify mirror is set', async () => {
    const source = await readFile(fixtureUrl, 'utf8')
    const board = KicadPcbParser.parse(source, {
        fileName: 'minimal.kicad_pcb'
    })
    const svg = PcbSvgRenderer.render(board, { side: 'back' })

    assert.match(svg, /aria-label="BACK"/)
    assert.match(svg, /data-line="BACK"/)
    assert.match(svg, /scale\(-1 1\)/)
})

test('PcbSvgRenderer mirrors the complete back-side scene like KiCad back exports', async () => {
    const source = await readFile(fixtureUrl, 'utf8')
    const board = KicadPcbParser.parse(source, {
        fileName: 'minimal.kicad_pcb'
    })
    const svg = PcbSvgRenderer.render(board, { side: 'back' })

    assert.match(
        svg,
        /class="pcb-scene" transform="translate\(30 0\) scale\(-1 1\)"/
    )
})

test('PcbSvgRenderer draws filled silkscreen polygons and copper primitives', async () => {
    const source = await readFile(fixtureUrl, 'utf8')
    const board = KicadPcbParser.parse(source, {
        fileName: 'minimal.kicad_pcb'
    })
    const frontSvg = PcbSvgRenderer.render(board, { side: 'front' })
    const backSvg = PcbSvgRenderer.render(board, { side: 'back' })

    assert.match(frontSvg, /class="pcb-drawing pcb-drawing--silk"/)
    assert.match(frontSvg, /fill="#aeb3bd"/)
    assert.match(frontSvg, /class="pcb-segment"/)
    assert.match(frontSvg, /stroke-linecap="round"/)
    assert.match(frontSvg, /class="pcb-via"/)
    assert.match(backSvg, /class="pcb-zone"/)
})

test('PcbSvgRenderer skips fabrication and courtyard drawing layers', () => {
    const svg = PcbSvgRenderer.render({
        title: 'Drawing layer filter',
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 },
        outlines: [],
        drawings: [
            {
                type: 'line',
                side: 'front',
                layer: 'F.SilkS',
                material: 'silk',
                strokeWidth: 0.1,
                start: { x: 1, y: 1 },
                end: { x: 2, y: 1 }
            },
            {
                type: 'line',
                side: 'front',
                layer: 'F.Fab',
                material: 'silk',
                strokeWidth: 0.1,
                start: { x: 3, y: 3 },
                end: { x: 4, y: 3 }
            },
            {
                type: 'line',
                side: 'front',
                layer: 'F.CrtYd',
                material: 'silk',
                strokeWidth: 0.1,
                start: { x: 5, y: 5 },
                end: { x: 6, y: 5 }
            }
        ],
        pads: [],
        texts: []
    })

    assert.match(svg, /x1="1" y1="1" x2="2" y2="1"/)
    assert.doesNotMatch(svg, /x1="3" y1="3" x2="4" y2="3"/)
    assert.doesNotMatch(svg, /x1="5" y1="5" x2="6" y2="5"/)
})

test('PcbSvgRenderer draws component outlines with board-file stroke thickness', () => {
    const svg = PcbSvgRenderer.render({
        title: 'Component outline thickness',
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 },
        outlines: [],
        drawings: [
            {
                type: 'line',
                side: 'front',
                layer: 'F.SilkS',
                material: 'silk',
                strokeWidth: 0.03,
                start: { x: 1, y: 1 },
                end: { x: 2, y: 1 }
            }
        ],
        pads: [],
        texts: []
    })

    assert.match(
        svg,
        /class="pcb-drawing pcb-drawing--silk"[^>]+stroke-width="0\.03"/
    )
    assert.doesNotMatch(svg, /class="pcb-drawing[^>]+vector-effect=/)
})

test('PcbSvgRenderer renders KiCad arcs as circular SVG arcs', () => {
    const svg = PcbSvgRenderer.render({
        title: 'Circular arc',
        bounds: { minX: -2, minY: -1, maxX: 2, maxY: 2, width: 4, height: 3 },
        outlines: [],
        drawings: [
            {
                type: 'arc',
                side: 'front',
                layer: 'F.SilkS',
                material: 'silk',
                strokeWidth: 0.2,
                start: { x: 1, y: 0 },
                mid: { x: 0, y: 1 },
                end: { x: -1, y: 0 }
            }
        ],
        pads: [],
        texts: []
    })

    assert.match(svg, /d="M 1 0 A 1 1 0 0 1 -1 0"/)
    assert.doesNotMatch(svg, / Q /)
})

test('PcbSvgRenderer draws via drill cutouts above filled silkscreen', () => {
    const board = {
        title: 'Cutout test',
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 },
        outlines: [],
        drawings: [
            {
                type: 'via',
                side: 'both',
                layer: 'F.Cu,B.Cu',
                x: 5,
                y: 5,
                size: 3,
                drill: 2
            },
            {
                type: 'polygon',
                side: 'front',
                layer: 'F.SilkS',
                material: 'silk',
                strokeWidth: 0,
                fill: true,
                points: [
                    { x: 3, y: 3 },
                    { x: 7, y: 3 },
                    { x: 7, y: 7 },
                    { x: 3, y: 7 }
                ]
            }
        ],
        pads: [],
        texts: []
    }
    const svg = PcbSvgRenderer.render(board, { side: 'front' })
    const silkscreenIndex = svg.indexOf('M 3 3 L 7 3 L 7 7 L 3 7 Z')
    const drillIndex = svg.indexOf('class="pcb-via-drill" cx="5" cy="5"')

    assert.ok(silkscreenIndex >= 0)
    assert.ok(drillIndex > silkscreenIndex)
})

test('PcbSvgRenderer respects KiCad text justification anchors', async () => {
    const source = await readFile(fixtureUrl, 'utf8')
    const board = KicadPcbParser.parse(source, {
        fileName: 'minimal.kicad_pcb'
    })
    const svg = PcbSvgRenderer.render(board, { side: 'back' })

    assert.match(svg, /aria-label="BACK"/)
    assert.match(svg, /data-line="BACK" data-x="24\.0987"/)
})

test('PcbSvgRenderer applies KiCad stroke-font bottom text offset', async () => {
    const source = await readFile(fixtureUrl, 'utf8')
    const board = KicadPcbParser.parse(source, {
        fileName: 'minimal.kicad_pcb'
    })
    const svg = PcbSvgRenderer.render(board, { side: 'front' })

    assert.match(svg, /data-line="TOP" data-x="5\.0987" data-y="13\.2122"/)
    assert.match(svg, /data-line="BOTTOM" data-x="5\.0987" data-y="14\.8222"/)
})

test('PcbSvgRenderer renders labels as KiCad stroke geometry', () => {
    const svg = PcbSvgRenderer.render(
        textOnlyBoard('CLKI\n+VCC', {
            x: 5,
            y: 10,
            hAlign: 'left',
            vAlign: 'bottom',
            sizeX: 1.6,
            sizeY: 1.2,
            thickness: 0.2
        })
    )

    assert.doesNotMatch(svg, /<text\b/)
    assert.match(svg, /class="pcb-label-stroke"/)
    assert.match(svg, /stroke-width="0\.2"/)
    assert.match(svg, /data-line="CLKI" data-x="5\.1316" data-y="7\.1416"/)
    assert.match(svg, /data-line="\+VCC" data-x="5\.1316" data-y="9\.7176"/)
})

test('PcbSvgRenderer uses KiCad text height for multiline row spacing', () => {
    const svg = PcbSvgRenderer.render(
        textOnlyBoard('WIDE\nROWS', {
            x: 5,
            y: 10,
            hAlign: 'left',
            vAlign: 'bottom',
            sizeX: 2,
            sizeY: 1,
            thickness: 0.2
        })
    )

    assert.match(svg, /data-line="WIDE" data-x="5\.1316" data-y="6\.4296"/)
    assert.match(svg, /data-line="ROWS" data-x="5\.1316" data-y="9\.6496"/)
})

test('PcbSvgRenderer uses KiCad horizontal stroke size for right alignment', () => {
    const svg = PcbSvgRenderer.render(
        textOnlyBoard('MISO', {
            x: 10,
            y: 10,
            hAlign: 'right',
            vAlign: 'bottom',
            sizeX: 1.6,
            sizeY: 1.2,
            thickness: 0.2
        })
    )

    assert.match(svg, /data-line="MISO" data-x="5\.5256" data-y="9\.7176"/)
})

test('PcbSvgRenderer preserves KiCad text sizes below 0.6 mm', () => {
    const svg = PcbSvgRenderer.render(
        textOnlyBoard('SMALL', {
            x: 10,
            y: 10,
            hAlign: 'right',
            vAlign: 'bottom',
            sizeX: 0.4,
            sizeY: 0.4,
            thickness: 0.06
        })
    )

    assert.match(svg, /data-line="SMALL" data-x="8\.132" data-y="9\.9289"/)
})

test('PcbSvgRenderer places center-justified text on KiCad baseline', () => {
    const svg = PcbSvgRenderer.render(
        textOnlyBoard('CENTER', {
            x: 5,
            y: 10,
            hAlign: 'center',
            vAlign: 'center',
            sizeX: 1,
            sizeY: 2,
            thickness: 0.2
        })
    )

    assert.match(svg, /data-line="CENTER" data-x="-0\.619" data-y="10\.4046"/)
})

test('PcbSvgRenderer uses KiCad text thickness for stroke width', async () => {
    const source = await readFile(fixtureUrl, 'utf8')
    const board = KicadPcbParser.parse(source, {
        fileName: 'minimal.kicad_pcb'
    })
    const svg = PcbSvgRenderer.render(board, { side: 'front' })

    assert.match(svg, /aria-label="TOP\nBOTTOM"[^>]+stroke-width="0\.15"/)
    assert.doesNotMatch(svg, /font-size=/)
})

test('PcbSvgRenderer renders footprint-owned silkscreen text unless KiCad hides it', async () => {
    const source = await readFile(fixtureUrl, 'utf8')
    const board = KicadPcbParser.parse(source, {
        fileName: 'minimal.kicad_pcb'
    })
    const svg = PcbSvgRenderer.render(board, { side: 'front' })

    assert.match(svg, /aria-label="TOP\nBOTTOM"/)
    assert.match(svg, /aria-label="U1"/)
    assert.match(svg, /aria-label="&lt; Pin 1"/)
})

test('PcbSvgRenderer hides text marked hidden by KiCad visibility', () => {
    const svg = PcbSvgRenderer.render({
        title: 'Text visibility filter',
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 12, width: 10, height: 12 },
        outlines: [],
        drawings: [],
        pads: [],
        texts: [
            textOnly('VISIBLE', { layer: 'F.SilkS' }),
            textOnly('HIDDEN_NAME', {
                layer: 'F.SilkS',
                visible: false
            })
        ]
    })

    assert.match(svg, /aria-label="VISIBLE"/)
    assert.doesNotMatch(svg, /HIDDEN_NAME/)
})

test('PcbSvgRenderer skips fabrication text layers', () => {
    const svg = PcbSvgRenderer.render({
        title: 'Text layer filter',
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 12, width: 10, height: 12 },
        outlines: [],
        drawings: [],
        pads: [],
        texts: [
            textOnly('VISIBLE_SILK', { layer: 'F.SilkS' }),
            textOnly('VISIBLE_FAB', { layer: 'F.Fab' }),
            textOnly('VISIBLE_COURTYARD', { layer: 'F.CrtYd' })
        ]
    })

    assert.match(svg, /aria-label="VISIBLE_SILK"/)
    assert.doesNotMatch(svg, /VISIBLE_FAB/)
    assert.doesNotMatch(svg, /VISIBLE_COURTYARD/)
})

test('PcbSvgRenderer skips reference labels for position-file-excluded footprints', () => {
    const svg = PcbSvgRenderer.render(
        {
            title: 'Excluded footprint references',
            bounds: {
                minX: 0,
                minY: 0,
                maxX: 10,
                maxY: 12,
                width: 10,
                height: 12
            },
            outlines: [],
            drawings: [],
            pads: [],
            texts: [
                textOnly('JP1', {
                    layer: 'B.SilkS',
                    side: 'back',
                    mirrored: true,
                    propertyName: 'Reference',
                    excludeFromPositionFiles: true
                }),
                textOnly('LEGEND', {
                    layer: 'B.SilkS',
                    side: 'back',
                    mirrored: true,
                    propertyName: 'User',
                    excludeFromPositionFiles: true
                })
            ]
        },
        { side: 'back' }
    )

    assert.doesNotMatch(svg, /aria-label="JP1"/)
    assert.match(svg, /aria-label="LEGEND"/)
})

test('PcbSvgRenderer keeps visible copper, mask, and footprint text artwork', () => {
    const svg = PcbSvgRenderer.render({
        title: 'Text artwork filter',
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 12, width: 10, height: 12 },
        outlines: [],
        drawings: [],
        pads: [],
        texts: [
            textOnly('IN FAIRYDUST', { layer: 'F.Cu', ownerId: 'board' }),
            textOnly('WE TRUST..', { layer: 'F.Mask', ownerId: 'board' }),
            textOnly('FOOTPRINT_REF', {
                layer: 'F.SilkS',
                ownerId: 'footprint:J1:0'
            })
        ]
    })

    assert.match(svg, /IN FAIRYDUST/)
    assert.match(svg, /WE TRUST/)
    assert.match(svg, /FOOTPRINT_REF/)
})

function textOnlyBoard(value, overrides) {
    return {
        title: 'Text test',
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 12, width: 10, height: 12 },
        outlines: [],
        drawings: [],
        pads: [],
        texts: [
            {
                value,
                side: 'front',
                mirrored: false,
                rotation: 0,
                layer: 'F.SilkS',
                ...overrides
            }
        ]
    }
}

function textOnly(value, overrides) {
    return {
        value,
        side: 'front',
        mirrored: false,
        rotation: 0,
        layer: 'F.SilkS',
        x: 5,
        y: 10,
        hAlign: 'left',
        vAlign: 'bottom',
        sizeX: 1,
        sizeY: 1,
        thickness: 0.1,
        ...overrides
    }
}
