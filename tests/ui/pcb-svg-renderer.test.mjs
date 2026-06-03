// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { KicadPcbParser } from '../../src/core/kicad/KicadPcbParser.mjs'
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

test('PcbSvgRenderer renders oval pad drills as slots', () => {
    const svg = PcbSvgRenderer.render({
        title: 'Oval drill pad',
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
                footprintId: 'footprint:J1:0',
                shape: 'oval',
                x: 5,
                y: 5,
                width: 1.4,
                height: 3,
                rotation: 0,
                drill: 0.6,
                drillWidth: 0.6,
                drillHeight: 1.6,
                drillShape: 'oval',
                roundrectRatio: 0.25,
                side: 'front'
            }
        ]
    })

    const drill = svg.match(/<rect class="pcb-pad-drill"[^>]+>/u)?.[0] || ''

    assert.match(drill, /x="4\.7"/u)
    assert.match(drill, /y="4\.2"/u)
    assert.match(drill, /width="0\.6"/u)
    assert.match(drill, /height="1\.6"/u)
    assert.match(drill, /rx="0\.3"/u)
    assert.match(drill, /ry="0\.3"/u)
})

test('PcbSvgRenderer emits layer and pad metadata for styled primitives', () => {
    const svg = PcbSvgRenderer.render(
        {
            title: 'Layer metadata',
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
                    side: 'front',
                    layer: 'F.Cu',
                    material: 'copper',
                    start: { x: 1, y: 1 },
                    end: { x: 3, y: 1 },
                    strokeWidth: 0.2
                },
                {
                    type: 'line',
                    side: 'front',
                    layer: 'F.SilkS',
                    material: 'silk',
                    start: { x: 1, y: 2 },
                    end: { x: 3, y: 2 },
                    strokeWidth: 0.12
                },
                {
                    type: 'via',
                    side: 'front',
                    layer: 'F.Cu,B.Cu',
                    material: 'copper',
                    x: 5,
                    y: 5,
                    size: 1,
                    drill: 0.4
                },
                {
                    type: 'zone',
                    side: 'front',
                    layer: 'F.Cu',
                    material: 'copper',
                    points: [
                        { x: 6, y: 1 },
                        { x: 8, y: 1 },
                        { x: 8, y: 3 }
                    ]
                }
            ],
            pads: [
                {
                    number: '1',
                    footprintId: 'footprint:J1:0',
                    type: 'smd',
                    shape: 'rect',
                    x: 4,
                    y: 4,
                    width: 1,
                    height: 1,
                    rotation: 0,
                    drill: 0.4,
                    layers: ['F.Cu', 'F.Mask', 'F.Paste'],
                    side: 'front'
                }
            ],
            texts: [],
            footprints: []
        },
        { side: 'front' }
    )

    assert.match(
        svg,
        /class="pcb-segment"(?=[^>]+data-layer="F\.Cu")(?=[^>]+data-material="copper")/
    )
    assert.match(
        svg,
        /class="pcb-drawing pcb-drawing--silk"(?=[^>]+data-layer="F\.SilkS")(?=[^>]+data-material="silk")/
    )
    assert.match(
        svg,
        /class="pcb-via"(?=[^>]+data-layer="F\.Cu,B\.Cu")(?=[^>]+data-material="copper")/
    )
    assert.match(svg, /class="pcb-zone"(?=[^>]+data-layer="F\.Cu")/)
    assert.match(
        svg,
        /class="pcb-pad"(?=[^>]+data-pad-number="1")(?=[^>]+data-pad-type="smd")(?=[^>]+data-pad-layers="F\.Cu F\.Mask F\.Paste")/
    )
    assert.match(
        svg,
        /class="pcb-pad-drill"(?=[^>]+data-pad-number="1")(?=[^>]+data-pad-layers="F\.Cu F\.Mask F\.Paste")/
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

test('PcbSvgRenderer renders multi-contour zones with even-odd fill', () => {
    const svg = PcbSvgRenderer.render(
        {
            title: 'Zone contours',
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
                    type: 'zone',
                    side: 'front',
                    layer: 'F.Cu',
                    material: 'copper',
                    fill: true,
                    contours: [
                        [
                            { x: 1, y: 1 },
                            { x: 9, y: 1 },
                            { x: 9, y: 9 },
                            { x: 1, y: 9 }
                        ],
                        [
                            { x: 4, y: 4 },
                            { x: 6, y: 4 },
                            { x: 6, y: 6 },
                            { x: 4, y: 6 }
                        ]
                    ]
                }
            ],
            pads: [],
            texts: [],
            footprints: []
        },
        { side: 'front' }
    )
    const zone = svg.match(/<path class="pcb-zone"[^>]+>/u)?.[0] || ''

    assert.match(zone, /fill-rule="evenodd"/)
    assert.match(
        zone,
        /d="M 1 1 L 9 1 L 9 9 L 1 9 Z M 4 4 L 6 4 L 6 6 L 4 6 Z"/
    )
})

test('PcbSvgRenderer renders trapezoid and chamfered pads as paths', () => {
    const svg = PcbSvgRenderer.render({
        title: 'Detailed pad shapes',
        bounds: { minX: 0, minY: 0, maxX: 12, maxY: 10, width: 12, height: 10 },
        outlines: [],
        drawings: [],
        texts: [],
        footprints: [],
        pads: [
            {
                number: '1',
                type: 'smd',
                shape: 'trapezoid',
                x: 5,
                y: 3,
                width: 4,
                height: 2,
                rotation: 0,
                drill: 0,
                rectDelta: { x: 1, y: 0 },
                side: 'front'
            },
            {
                number: '2',
                type: 'smd',
                shape: 'roundrect',
                x: 5,
                y: 7,
                width: 4,
                height: 2,
                rotation: 0,
                drill: 0,
                chamferRatio: 0.25,
                chamfers: ['top_left', 'bottom_right'],
                side: 'front'
            }
        ]
    })

    assert.match(
        svg,
        /<path class="pcb-pad"(?=[^>]+data-pad-number="1")(?=[^>]+d="M 2\.5 2 L 7\.5 2 L 6\.5 4 L 3\.5 4 Z")/
    )
    assert.match(
        svg,
        /<path class="pcb-pad"(?=[^>]+data-pad-number="2")(?=[^>]+d="M 3\.5 6 L 7 6 L 7 7\.5 L 6\.5 8 L 3 8 L 3 6\.5 Z")/
    )
})

test('PcbSvgRenderer renders custom pad primitives in pad-local coordinates', () => {
    const svg = PcbSvgRenderer.render({
        title: 'Custom pad',
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 },
        outlines: [],
        drawings: [],
        texts: [],
        footprints: [],
        pads: [
            {
                number: '1',
                type: 'smd',
                shape: 'custom',
                x: 5,
                y: 5,
                width: 1,
                height: 1,
                rotation: 90,
                drill: 0,
                side: 'front',
                customPrimitives: [
                    {
                        type: 'polygon',
                        fill: true,
                        points: [
                            { x: -0.5, y: -0.5 },
                            { x: 0.5, y: -0.5 },
                            { x: 0.5, y: 0.5 },
                            { x: -0.5, y: 0.5 }
                        ]
                    }
                ]
            }
        ]
    })

    assert.match(
        svg,
        /<g class="pcb-pad pcb-pad--custom"(?=[^>]+data-pad-number="1")(?=[^>]+transform="translate\(5 5\) rotate\(90\)")/
    )
    assert.match(
        svg,
        /<path class="pcb-pad-primitive pcb-pad-primitive--polygon" d="M -0\.5 -0\.5 L 0\.5 -0\.5 L 0\.5 0\.5 L -0\.5 0\.5 Z"/
    )
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
    const drillIndex = svg.search(
        /class="pcb-via-drill"[^>]+cx="5"[^>]+cy="5"/u
    )

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
