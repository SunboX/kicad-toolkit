// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { PcbScene3dBuilder } from '../src/legacy-scene3d.mjs'

test('PcbScene3dBuilder maps saved copper B-Rep rings into 3D layer space', () => {
    const scene = PcbScene3dBuilder.build({
        pcb: {
            boardOutline: {
                widthMil: 100,
                heightMil: 100,
                minX: 0,
                minY: 0,
                segments: []
            },
            components: [],
            pads: [],
            tracks: [],
            vias: [],
            polygons: [
                {
                    layerId: 0,
                    brep_shape: {
                        outer_ring: {
                            vertices: rectanglePoints(10, 20, 20, 30)
                        }
                    }
                },
                {
                    layerId: 31,
                    brep_shapes: [
                        {
                            outer_ring: {
                                vertices: rectanglePoints(60, 10, 90, 40)
                            },
                            inner_rings: [
                                {
                                    vertices: rectanglePoints(70, 20, 80, 30)
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    })

    assert.equal(scene.detail.polygons[0].layerId, 1)
    assert.equal(scene.detail.polygons[0].sourceLayerId, 0)
    assert.deepEqual(scene.detail.polygons[0].brep_shape.outer_ring.vertices, [
        { x: 10, y: 80 },
        { x: 20, y: 80 },
        { x: 20, y: 70 },
        { x: 10, y: 70 }
    ])

    assert.equal(scene.detail.polygons[1].layerId, 32)
    assert.equal(scene.detail.polygons[1].sourceLayerId, 31)
    assert.deepEqual(
        scene.detail.polygons[1].brep_shapes[0].inner_rings[0].vertices,
        [
            { x: 70, y: 80 },
            { x: 80, y: 80 },
            { x: 80, y: 70 },
            { x: 70, y: 70 }
        ]
    )
    assert.equal(scene.zones[1].layerId, 32)
})

/**
 * Builds rectangle corner points.
 * @param {number} minX Minimum X.
 * @param {number} minY Minimum Y.
 * @param {number} maxX Maximum X.
 * @param {number} maxY Maximum Y.
 * @returns {{ x: number, y: number }[]}
 */
function rectanglePoints(minX, minY, maxX, maxY) {
    return [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
    ]
}
