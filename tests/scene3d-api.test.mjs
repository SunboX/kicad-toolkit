// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    PcbScene3dBuilder,
    PcbScene3dModelRegistry,
    PcbScene3dPackages,
    PcbScene3dScenePreparator,
    PcbScene3dSummaryRenderer,
    PcbScene3dTextBoxLayoutResolver
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
            components: [
                { designator: 'U1', x: 125, y: 200, rotation: 90 },
                {
                    designator: 'U2',
                    x: 225,
                    y: 220,
                    layer: 'BOTTOM',
                    rotation: -45
                }
            ],
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
            texts: [
                { x: 44, y: 66, value: 'TOP', layer: 'F.SilkS' },
                {
                    x: 120,
                    y: 50,
                    value: 'COPPER',
                    layer: 'F.Cu',
                    rotation: 30
                }
            ]
        }
    })

    assert.equal(scene.board.segments[0].y1, 480)
    assert.equal(scene.board.segments[0].y2, 380)
    assert.equal(scene.components[0].positionMil.y, 50)
    assert.equal(scene.components[0].rotationDeg, 90)
    assert.equal(scene.components[1].rotationDeg, -45)
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
    assert.equal(scene.detail.copperTexts[0].y, 450)
    assert.equal(scene.detail.copperTexts[0].rotation, 330)
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

test('PcbScene3dBuilder omits hole-only footprints from fallback components', () => {
    const scene = PcbScene3dBuilder.build({
        pcb: {
            boardOutline: { widthMil: 1000, heightMil: 500, segments: [] },
            components: [
                {
                    designator: 'H1',
                    footprintId: 'footprint:H1:1',
                    x: 100,
                    y: 200,
                    pattern: 'Fixture:DrillOnly'
                },
                {
                    designator: 'U1',
                    footprintId: 'footprint:U1:2',
                    x: 300,
                    y: 200,
                    pattern: 'Package_SO:SOIC-8'
                }
            ],
            pads: [
                {
                    footprintId: 'footprint:H1:1',
                    footprintReference: 'H1',
                    type: 'np_thru_hole',
                    x: 100,
                    y: 200,
                    sizeTopX: 100,
                    sizeTopY: 100,
                    sizeMidX: 100,
                    sizeMidY: 100,
                    sizeBottomX: 100,
                    sizeBottomY: 100,
                    holeDiameter: 100,
                    shapeTop: 1,
                    shapeMid: 1,
                    shapeBottom: 1,
                    isPlated: false
                },
                {
                    footprintId: 'footprint:U1:2',
                    footprintReference: 'U1',
                    type: 'smd',
                    x: 300,
                    y: 200,
                    sizeTopX: 80,
                    sizeTopY: 40,
                    shapeTop: 2
                }
            ],
            tracks: [],
            vias: []
        }
    })

    assert.deepEqual(
        scene.components.map((component) => component.designator),
        ['U1']
    )
    assert.equal(
        scene.detail.pads.some((pad) => pad.footprintReference === 'H1'),
        true
    )
})

test('PcbScene3dBuilder carries KiCad model metadata onto scene components', () => {
    const scene = PcbScene3dBuilder.build(
        {
            pcb: {
                boardOutline: { widthMil: 1000, heightMil: 500, segments: [] },
                components: [
                    {
                        designator: 'U1',
                        x: 100,
                        y: 200,
                        layer: 'TOP',
                        pattern: 'Fixture:Body',
                        modelName: 'body.step',
                        modelPath: '${KIPRJMOD}/parts/body.step',
                        modelTransform: {
                            rotationDeg: { x: -90, y: 0, z: 90 },
                            dxMil: 10,
                            dyMil: -20,
                            dzMil: 30,
                            scale: { x: 2, y: 3, z: 4 }
                        }
                    }
                ],
                pads: [],
                tracks: [],
                vias: []
            }
        },
        {
            sessionAssets: [
                {
                    name: 'body.step',
                    relativePath: 'parts/body.step',
                    format: 'step'
                }
            ]
        }
    )

    assert.equal(scene.components[0].modelName, 'body.step')
    assert.equal(scene.components[0].modelPath, '${KIPRJMOD}/parts/body.step')
    assert.deepEqual(scene.components[0].modelTransform, {
        rotationDeg: { x: -90, y: 0, z: 90 },
        dxMil: 10,
        dyMil: -20,
        dzMil: 30,
        scale: { x: 2, y: 3, z: 4 }
    })
    assert.equal(scene.components[0].externalModel.name, 'body.step')
})

test('PcbScene3dBuilder exposes KiCad external model placements', () => {
    const scene = PcbScene3dBuilder.build(
        {
            sourceFormat: 'kicad',
            kind: 'pcb',
            fileName: 'model-board.kicad_pcb',
            pcb: {
                boardOutline: {
                    minX: 0,
                    minY: 0,
                    widthMil: 1000,
                    heightMil: 800,
                    segments: []
                },
                components: [
                    {
                        designator: 'LED1',
                        x: 400,
                        y: 300,
                        layer: 'TOP',
                        pattern: 'Fixture:Matrix',
                        rotation: 90,
                        modelName: 'matrix.step',
                        modelPath: '${KIPRJMOD}/parts/matrix.step',
                        modelTransform: {
                            rotationDeg: { x: -90, y: 0, z: -90 },
                            offsetMil: { x: 10, y: -20, z: 30 },
                            dxMil: 10,
                            dyMil: -20,
                            dzMil: 30,
                            scale: { x: 1.5, y: 2, z: 0.5 }
                        }
                    }
                ],
                pads: [],
                tracks: [],
                vias: [],
                kicadBoard: {
                    title: 'KiCad Board',
                    bounds: { minX: 0, minY: 0, width: 25.4, height: 20.32 },
                    outlines: [],
                    pads: [],
                    drawings: [],
                    texts: []
                }
            },
            bom: []
        },
        {
            sessionAssets: [
                {
                    name: 'matrix.step',
                    relativePath: 'parts/matrix.step',
                    format: 'step',
                    source: 'model-search'
                }
            ]
        }
    )

    assert.equal(scene.externalPlacements.length, 1)
    assert.equal(scene.externalPlacements[0].designator, 'LED1')
    assert.deepEqual(scene.externalPlacements[0].modelTransform, {
        rotationDeg: { x: -90, y: 0, z: -90 },
        offsetMil: { x: 10, y: -20, z: 30 },
        dxMil: 10,
        dyMil: -20,
        dzMil: 30,
        scale: { x: 1.5, y: 2, z: 0.5 }
    })
    assert.equal(
        scene.externalPlacements[0].externalModel.source,
        'model-search'
    )
})

test('PcbScene3dBuilder anchors external model placements on board faces', () => {
    const scene = PcbScene3dBuilder.build(
        {
            sourceFormat: 'kicad',
            kind: 'pcb',
            fileName: 'model-face-board.kicad_pcb',
            pcb: {
                boardOutline: {
                    minX: 0,
                    minY: 0,
                    widthMil: 1000,
                    heightMil: 800,
                    segments: []
                },
                components: [
                    {
                        designator: 'U1',
                        x: 400,
                        y: 300,
                        layer: 'TOP',
                        pattern: 'Package_SO:SOIC-8',
                        modelName: 'body.step',
                        modelPath: '${KIPRJMOD}/parts/body.step',
                        modelTransform: {
                            rotationDeg: { x: -90, y: 0, z: 0 }
                        }
                    },
                    {
                        designator: 'U2',
                        x: 500,
                        y: 350,
                        layer: 'BOTTOM',
                        pattern: 'Package_SO:SOIC-8',
                        modelName: 'body.step',
                        modelPath: '${KIPRJMOD}/parts/body.step',
                        modelTransform: {
                            rotationDeg: { x: -90, y: 0, z: 0 }
                        }
                    }
                ],
                pads: [],
                tracks: [],
                vias: [],
                kicadBoard: {
                    title: 'KiCad Board',
                    bounds: { minX: 0, minY: 0, width: 25.4, height: 20.32 },
                    outlines: [],
                    pads: [],
                    drawings: [],
                    texts: []
                }
            },
            bom: []
        },
        {
            sessionAssets: [
                {
                    name: 'body.step',
                    relativePath: 'parts/body.step',
                    format: 'step'
                }
            ],
            boardThicknessMil: 80
        }
    )

    assert.equal(scene.components[0].positionMil.z > 40, true)
    assert.equal(scene.components[1].positionMil.z < -40, true)
    assert.deepEqual(
        scene.externalPlacements.map((placement) => placement.positionMil.z),
        [40, -40]
    )
})

test('PcbScene3dBuilder exposes KiCad copper text detail', () => {
    const scene = PcbScene3dBuilder.build({
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileName: 'copper-text-board.kicad_pcb',
        pcb: {
            boardOutline: { widthMil: 1000, heightMil: 500, segments: [] },
            components: [],
            pads: [],
            tracks: [],
            vias: [],
            kicadBoard: {
                title: 'Copper Text Board',
                bounds: { minX: 0, minY: 0, width: 25.4, height: 12.7 },
                outlines: [],
                pads: [],
                drawings: [],
                texts: [
                    {
                        value: 'COPPER',
                        x: 2,
                        y: 3,
                        rotation: 15,
                        layer: 'F.Cu',
                        side: 'front',
                        hAlign: 'left',
                        vAlign: 'bottom',
                        sizeX: 0.5,
                        sizeY: 0.6,
                        thickness: 0.12,
                        visible: true
                    },
                    {
                        value: 'MASK',
                        x: 2,
                        y: 3,
                        layer: 'F.Mask',
                        side: 'front',
                        visible: true
                    }
                ]
            }
        },
        bom: []
    })

    assert.deepEqual(scene.detail.copperTexts, [
        {
            x: 78.74015748031496,
            y: 381.8897637795276,
            value: 'COPPER',
            layer: 'F.Cu',
            side: 'front',
            layerId: 1,
            rotation: 345,
            mirrored: false,
            hAlign: 'left',
            vAlign: 'bottom',
            sizeX: 19.68503937007874,
            sizeY: 23.62204724409449,
            thickness: 4.724409448818898
        }
    ])
})

test('PcbScene3dTextBoxLayoutResolver resolves KiCad text-box geometry', () => {
    const layout = PcbScene3dTextBoxLayoutResolver.resolve({
        sourceType: 'gr_text_box',
        textBox: {
            points: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
                { x: 10, y: 4 },
                { x: 0, y: 4 }
            ],
            border: true,
            margins: {
                left: 0.5,
                top: 0.25,
                right: 0.75,
                bottom: 0.25
            }
        },
        hAlign: 'right',
        vAlign: 'top'
    })

    assert.deepEqual(layout, {
        source: 'kicad-textbox',
        mode: 'polygon',
        border: true,
        widthMil: 393.7007874015748,
        heightMil: 157.48031496062993,
        marginMil: {
            left: 19.68503937007874,
            top: 9.84251968503937,
            right: 29.52755905511811,
            bottom: 9.84251968503937
        },
        renderWidthMil: 442.9133858267717,
        renderHeightMil: 177.16535433070868,
        justification: {
            column: 2,
            row: 0
        }
    })
})

test('PcbScene3dBuilder carries KiCad text-box layout onto scene text rows', () => {
    const scene = PcbScene3dBuilder.build({
        pcb: {
            boardOutline: { widthMil: 1000, heightMil: 500, segments: [] },
            components: [],
            pads: [],
            tracks: [],
            vias: [],
            texts: [
                {
                    value: 'NOTE',
                    x: 25,
                    y: 50,
                    layer: 'F.SilkS',
                    sourceType: 'gr_text_box',
                    textBox: {
                        points: [
                            { x: 0, y: 0 },
                            { x: 2, y: 0 },
                            { x: 2, y: 1 },
                            { x: 0, y: 1 }
                        ],
                        border: false
                    }
                }
            ]
        }
    })

    assert.equal(scene.texts[0].textBoxLayout.source, 'kicad-textbox')
    assert.equal(scene.texts[0].textBoxLayout.border, false)
})
