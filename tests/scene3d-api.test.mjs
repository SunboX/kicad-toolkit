// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    PcbScene3dBuilder,
    PcbScene3dModelRegistry,
    PcbScene3dPackages,
    PcbScene3dScenePreparator,
    PcbScene3dSummaryRenderer
} from '../src/scene3d.mjs'

test('PcbScene3dBuilder emits data-only scene description for KiCad PCB models', () => {
    const scene = PcbScene3dBuilder.build({
        pcb: {
            boardOutline: {
                widthMil: 1000,
                heightMil: 500,
                segments: []
            },
            components: [{ designator: 'U1', x: 100, y: 200 }],
            pads: [{ x: 100, y: 200, sizeTopX: 40, sizeTopY: 40 }],
            tracks: [],
            vias: []
        }
    })

    assert.equal(scene.coordinateSystem, 'kicad-3d-y-up')
    assert.equal(scene.board.widthMil, 1000)
    assert.equal(scene.components[0].designator, 'U1')
    assert.equal(scene.pads.length, 1)
})

test('PcbScene3dBuilder exposes KiCad silkscreen drawings without copper zones', () => {
    const scene = PcbScene3dBuilder.build({
        pcb: {
            boardOutline: { widthMil: 1000, heightMil: 500, segments: [] },
            components: [],
            pads: [],
            tracks: [],
            vias: [],
            kicadBoard: {
                drawings: [
                    {
                        type: 'line',
                        layer: 'F.SilkS',
                        side: 'front',
                        strokeWidth: 0.2,
                        start: { x: 1, y: 2 },
                        end: { x: 4, y: 2 }
                    },
                    {
                        type: 'polygon',
                        layer: 'B.SilkS',
                        side: 'back',
                        fill: true,
                        points: [
                            { x: 5, y: 5 },
                            { x: 6, y: 5 },
                            { x: 6, y: 7 },
                            { x: 5, y: 7 }
                        ]
                    },
                    {
                        type: 'zone',
                        layer: 'F.Cu',
                        side: 'front',
                        fill: true,
                        points: [
                            { x: 0, y: 0 },
                            { x: 20, y: 0 },
                            { x: 20, y: 10 },
                            { x: 0, y: 10 }
                        ]
                    }
                ]
            }
        }
    })

    assert.deepEqual(scene.detail.silkscreen.top.tracks, [
        {
            x1: 39.37007874015748,
            y1: 421.25984251968504,
            x2: 157.48031496062993,
            y2: 421.25984251968504,
            width: 7.874015748031496
        }
    ])
    assert.deepEqual(scene.detail.silkscreen.top.fills, [])
    assert.deepEqual(scene.detail.silkscreen.bottom.fills, [
        {
            points: [
                { x: 196.8503937007874, y: 303.14960629921256 },
                { x: 236.2204724409449, y: 303.14960629921256 },
                { x: 236.2204724409449, y: 224.40944881889766 },
                { x: 196.8503937007874, y: 224.40944881889766 }
            ]
        }
    ])
})

test('PcbScene3dBuilder converts visible KiCad silkscreen text to 3D strokes', () => {
    const scene = PcbScene3dBuilder.build({
        pcb: {
            boardOutline: { widthMil: 1000, heightMil: 500, segments: [] },
            components: [],
            pads: [],
            tracks: [],
            vias: [],
            kicadBoard: {
                drawings: [],
                texts: [
                    {
                        value: 'T1',
                        layer: 'F.SilkS',
                        side: 'front',
                        x: 1,
                        y: 2,
                        rotation: 0,
                        hAlign: 'left',
                        vAlign: 'bottom',
                        sizeX: 1,
                        sizeY: 1,
                        thickness: 0.15,
                        visible: true
                    },
                    {
                        value: 'HIDE',
                        layer: 'F.SilkS',
                        side: 'front',
                        x: 5,
                        y: 5,
                        visible: false
                    },
                    {
                        value: 'CU',
                        layer: 'F.Cu',
                        side: 'front',
                        x: 5,
                        y: 5,
                        visible: true
                    }
                ]
            }
        }
    })

    assert.equal(scene.detail.silkscreen.bottom.tracks.length, 0)
    assert.ok(scene.detail.silkscreen.top.tracks.length > 0)
    assert.equal(scene.detail.silkscreen.top.tracks[0].width, 5.905511811023622)
    assert.ok(
        Math.min(
            ...scene.detail.silkscreen.top.tracks.flatMap((track) => [
                track.y1,
                track.y2
            ])
        ) > scene.board.centerY
    )
    assert.ok(
        scene.detail.silkscreen.top.tracks.every((track) => {
            return (
                Number.isFinite(track.x1) &&
                Number.isFinite(track.y1) &&
                Number.isFinite(track.x2) &&
                Number.isFinite(track.y2)
            )
        })
    )
})

test('PcbScene3dBuilder maps PCB primitives into KiCad 3D layer space', () => {
    const scene = PcbScene3dBuilder.build({
        pcb: {
            boardOutline: {
                widthMil: 1000,
                heightMil: 500,
                minX: 0,
                minY: 0,
                segments: [{ type: 'line', x1: 10, y1: 20, x2: 90, y2: 120 }]
            },
            components: [{ designator: 'U1', x: 125, y: 200 }],
            pads: [
                {
                    x: 100,
                    y: 150,
                    sizeTopX: 40,
                    sizeTopY: 20,
                    offsetTopX: 3,
                    offsetTopY: 7
                }
            ],
            tracks: [{ x1: 20, y1: 40, x2: 80, y2: 90, layerId: 1 }],
            arcs: [
                {
                    x: 70,
                    y: 100,
                    radius: 25,
                    startAngle: 15,
                    endAngle: 85,
                    layerId: 1
                }
            ],
            fills: [{ x1: 30, y1: 50, x2: 70, y2: 110, layerId: 1 }],
            vias: [{ x: 55, y: 75, diameter: 25 }],
            polygons: [
                {
                    layer: 'F.Cu',
                    segments: [
                        { type: 'line', x1: 10, y1: 20, x2: 90, y2: 120 }
                    ]
                }
            ],
            texts: [{ x: 44, y: 66, value: 'TOP', layer: 'F.SilkS' }]
        }
    })

    assert.equal(scene.board.segments[0].y1, 480)
    assert.equal(scene.board.segments[0].y2, 380)
    assert.equal(scene.components[0].positionMil.y, 50)
    assert.equal(scene.pads[0].y, 350)
    assert.equal(scene.pads[0].offsetTopY, -7)
    assert.equal(scene.detail.tracks[0].y1, 460)
    assert.equal(scene.detail.tracks[0].y2, 410)
    assert.equal(scene.detail.arcs[0].y, 400)
    assert.equal(scene.detail.arcs[0].startAngle, -15)
    assert.equal(scene.detail.arcs[0].endAngle, -85)
    assert.equal(scene.detail.fills[0].y1, 390)
    assert.equal(scene.detail.fills[0].y2, 450)
    assert.equal(scene.detail.vias[0].y, 425)
    assert.equal(scene.detail.polygons[0].segments[0].y1, 480)
    assert.equal(scene.detail.polygons[0].segments[0].y2, 380)
    assert.equal(scene.texts[0].y, 434)
})

test('PcbScene3dScenePreparator exposes async scene preparation', async () => {
    const scene = await PcbScene3dScenePreparator.prepare({
        pcb: {
            boardOutline: { widthMil: 100, heightMil: 50, segments: [] },
            components: [],
            pads: [],
            tracks: [],
            vias: []
        }
    })

    assert.equal(scene.board.heightMil, 50)
})

test('PcbScene3dModelRegistry and summary renderer provide parity APIs', () => {
    const registry = new PcbScene3dModelRegistry({
        sessionAssets: [{ name: 'part.step', format: 'step' }]
    })
    const summary = PcbScene3dSummaryRenderer.render({
        pcb: {
            boardOutline: { widthMil: 100, heightMil: 50, segments: [] },
            components: [{ designator: 'U1' }]
        }
    })

    assert.equal(
        registry.resolveForComponent({ pattern: 'part' })?.name,
        'part.step'
    )
    assert.match(summary, /KiCad 3D scene/)
})

test('PcbScene3dPackages mirrors procedural body package usage', () => {
    const packageBody = PcbScene3dPackages.resolve(
        { pattern: 'Resistor_SMD:R_0603' },
        { width: 80, depth: 30 }
    )
    const scene = PcbScene3dBuilder.build({
        pcb: {
            boardOutline: { widthMil: 1000, heightMil: 500, segments: [] },
            components: [
                {
                    designator: 'U2',
                    x: 100,
                    y: 200,
                    layer: 'BOTTOM',
                    pattern: 'Package_SO:SOIC-8'
                }
            ],
            pads: [],
            tracks: [],
            vias: []
        }
    })

    assert.equal(packageBody.family, 'chip')
    assert.equal(scene.components[0].mountSide, 'bottom')
    assert.equal(scene.components[0].positionMil.z < 0, true)
})
