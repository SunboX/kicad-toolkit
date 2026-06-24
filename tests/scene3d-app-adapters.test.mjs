import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dBuilder } from '../src/scene3d.mjs'

/**
 * Builds a minimal KiCad PCB document with a rectangular normalized fallback
 * and a rounded native Edge.Cuts outline.
 * @returns {object}
 */
function createRoundedOutlineDocument() {
    return {
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileName: 'sample-board.kicad_pcb',
        pcb: {
            layers: [],
            components: [],
            pads: [],
            tracks: [],
            vias: [],
            polygons: [],
            texts: [],
            boardOutline: {
                minX: 0,
                minY: 0,
                widthMil: 2000,
                heightMil: 1000,
                segments: [
                    { type: 'line', x1: 0, y1: 0, x2: 2000, y2: 0 },
                    { type: 'line', x1: 2000, y1: 0, x2: 2000, y2: 1000 },
                    { type: 'line', x1: 2000, y1: 1000, x2: 0, y2: 1000 },
                    { type: 'line', x1: 0, y1: 1000, x2: 0, y2: 0 }
                ]
            },
            kicadBoard: {
                bounds: {
                    minX: 0,
                    minY: 0,
                    maxX: 20,
                    maxY: 10,
                    width: 20,
                    height: 10
                },
                outlines: [
                    {
                        type: 'line',
                        layer: 'Edge.Cuts',
                        start: { x: 0, y: 0 },
                        end: { x: 15, y: 0 }
                    },
                    {
                        type: 'arc',
                        layer: 'Edge.Cuts',
                        start: { x: 15, y: 0 },
                        mid: { x: 20, y: 5 },
                        end: { x: 15, y: 10 }
                    },
                    {
                        type: 'line',
                        layer: 'Edge.Cuts',
                        start: { x: 15, y: 10 },
                        end: { x: 0, y: 10 }
                    },
                    {
                        type: 'line',
                        layer: 'Edge.Cuts',
                        start: { x: 0, y: 10 },
                        end: { x: 0, y: 0 }
                    }
                ]
            }
        }
    }
}

/**
 * Builds a minimal KiCad PCB document whose native Edge.Cuts arc must be
 * reversed while connecting the board outline.
 * @returns {object}
 */
function createReversedArcOutlineDocument() {
    const documentModel = createRoundedOutlineDocument()
    documentModel.pcb.kicadBoard.outlines = [
        {
            type: 'line',
            layer: 'Edge.Cuts',
            start: { x: 0, y: 0 },
            end: { x: 0, y: 10 }
        },
        {
            type: 'line',
            layer: 'Edge.Cuts',
            start: { x: 0, y: 10 },
            end: { x: 15, y: 10 }
        },
        {
            type: 'arc',
            layer: 'Edge.Cuts',
            start: { x: 15, y: 0 },
            mid: { x: 20, y: 5 },
            end: { x: 15, y: 10 }
        },
        {
            type: 'line',
            layer: 'Edge.Cuts',
            start: { x: 15, y: 0 },
            end: { x: 0, y: 0 }
        }
    ]

    return documentModel
}

/**
 * Builds a minimal KiCad PCB document with one explicit model reference.
 * @param {string} [extension] Model file extension.
 * @returns {object}
 */
function createModelReferenceDocument(extension = 'wrl') {
    const modelName = 'body.' + extension
    return {
        sourceFormat: 'kicad',
        kind: 'pcb',
        fileName: 'sample-board.kicad_pcb',
        pcb: {
            layers: [],
            pads: [],
            tracks: [],
            vias: [],
            polygons: [],
            texts: [],
            boardOutline: {
                minX: 0,
                minY: 0,
                widthMil: 1000,
                heightMil: 1000,
                segments: [
                    { type: 'line', x1: 0, y1: 0, x2: 1000, y2: 0 },
                    { type: 'line', x1: 1000, y1: 0, x2: 1000, y2: 1000 },
                    { type: 'line', x1: 1000, y1: 1000, x2: 0, y2: 1000 },
                    { type: 'line', x1: 0, y1: 1000, x2: 0, y2: 0 }
                ]
            },
            components: [
                {
                    designator: 'J1',
                    layer: 'TOP',
                    x: 500,
                    y: 500,
                    width: 100,
                    depth: 100,
                    rotation: 0,
                    pattern: 'CONN_FAKE',
                    source: 'CONN_FAKE',
                    modelName,
                    modelPath: '${KIPRJMOD}/parts/' + modelName,
                    modelTransform: null
                }
            ]
        }
    }
}

test('PcbScene3dBuilder preserves KiCad Edge.Cuts arcs in board outlines', () => {
    const scene = PcbScene3dBuilder.build(createRoundedOutlineDocument())

    assert.equal(scene.board.segments.length, 4)
    assert.equal(
        scene.board.segments.some((segment) => segment.type === 'arc'),
        true
    )
    assert.notDeepEqual(
        scene.board.segments.map((segment) => segment.type),
        ['line', 'line', 'line', 'line']
    )
})

test('PcbScene3dBuilder preserves KiCad Edge.Cuts arc sweep angles', () => {
    const scene = PcbScene3dBuilder.build(createRoundedOutlineDocument())
    const arc = scene.board.segments.find((segment) => segment.type === 'arc')

    assert.equal(Math.round(arc.y1), 394)
    assert.equal(Math.round(arc.y2), 0)
    assert.equal(Math.round(arc.startAngle), -270)
    assert.equal(Math.round(arc.endAngle), -90)
    assert.equal(Math.round(arc.sweepAngle), -180)
})

test('PcbScene3dBuilder realigns reversed KiCad Edge.Cuts arc angles', () => {
    const scene = PcbScene3dBuilder.build(createReversedArcOutlineDocument())
    const arc = scene.board.segments.find((segment) => segment.type === 'arc')

    assertPointClose(pointOnArc(arc, arc.startAngle), {
        x: arc.x1,
        y: arc.y1
    })
    assertPointClose(pointOnArc(arc, arc.startAngle + arc.sweepAngle), {
        x: arc.x2,
        y: arc.y2
    })
})

/**
 * Resolves an arc point at an absolute angle.
 * @param {object} arc Arc segment.
 * @param {number} angleDeg Angle in degrees.
 * @returns {{ x: number, y: number }}
 */
function pointOnArc(arc, angleDeg) {
    const angleRad = (Number(angleDeg || 0) * Math.PI) / 180

    return {
        x: Number(arc.cx || 0) + Math.cos(angleRad) * Number(arc.radius || 0),
        y: Number(arc.cy || 0) + Math.sin(angleRad) * Number(arc.radius || 0)
    }
}

/**
 * Asserts two points are nearly equal.
 * @param {{ x: number, y: number }} actual Actual point.
 * @param {{ x: number, y: number }} expected Expected point.
 * @returns {void}
 */
function assertPointClose(actual, expected) {
    assert.ok(Math.abs(actual.x - expected.x) < 0.001)
    assert.ok(Math.abs(actual.y - expected.y) < 0.001)
}

test('PcbScene3dBuilder prefers exact KiCad model file extensions', () => {
    const scene = PcbScene3dBuilder.build(createModelReferenceDocument(), {
        sessionAssets: [
            {
                name: 'body.step',
                relativePath: 'sample/parts/body.step',
                file: new Blob([new Uint8Array([1])]),
                format: 'step'
            },
            {
                name: 'body.wrl',
                relativePath: 'sample/parts/body.wrl',
                file: new Blob([new Uint8Array([2])]),
                format: 'wrl'
            }
        ]
    })

    assert.equal(scene.externalModels.length, 1)
    assert.equal(scene.externalModels[0].name, 'body.wrl')
})

test('PcbScene3dBuilder resolves exact GLB model references', () => {
    const scene = PcbScene3dBuilder.build(createModelReferenceDocument('glb'), {
        sessionAssets: [
            {
                name: 'body.glb',
                relativePath: 'sample/parts/body.glb',
                file: new Blob([new Uint8Array([3])]),
                format: 'glb'
            }
        ]
    })

    assert.equal(scene.externalModels.length, 1)
    assert.equal(scene.externalModels[0].name, 'body.glb')
    assert.equal(scene.components[0].externalModel.format, 'glb')
})

test('PcbScene3dBuilder scales KiCad WRL model units into mil scene units', () => {
    const scene = PcbScene3dBuilder.build(createModelReferenceDocument(), {
        sessionAssets: [
            {
                name: 'body.wrl',
                relativePath: 'sample/parts/body.wrl',
                file: new Blob([new Uint8Array([2])]),
                format: 'wrl'
            }
        ]
    })
    const modelPlacement =
        scene.externalPlacements[0] ||
        scene.components.find(
            (component) => component?.externalModel?.format === 'wrl'
        )
    const scale = modelPlacement?.modelTransform?.scale

    assert.equal(modelPlacement.externalModel.format, 'wrl')
    assert.equal(scale.x, 100)
    assert.equal(scale.y, 100)
    assert.equal(scale.z, 100)
})
