// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { Geometry } from '../../src/core/kicad/Geometry.mjs'
import { KicadLayerResolver } from '../../src/core/kicad/KicadLayerResolver.mjs'
import { KicadPcbLayerMetadata } from '../../src/core/kicad/KicadPcbLayerMetadata.mjs'
import { KicadPcbPadParser } from '../../src/core/kicad/KicadPcbPadParser.mjs'

test('KicadLayerResolver resolves standard layer aliases, classes, and sides', () => {
    assert.equal(
        KicadLayerResolver.normalizeLayerName('F.Silkscreen'),
        'F.SilkS'
    )
    assert.equal(
        KicadLayerResolver.normalizeLayerName('B.Courtyard'),
        'B.CrtYd'
    )

    assert.deepEqual(KicadLayerResolver.metadataForLayer('In2.Cu'), {
        name: 'In2.Cu',
        originalName: 'In2.Cu',
        ordinal: 2,
        side: 'both',
        layerClass: 'inner_copper',
        isCopper: true,
        isTechnical: false,
        isWildcard: false,
        isKnownStandard: true
    })
    assert.deepEqual(KicadLayerResolver.metadataForLayer('B.Courtyard'), {
        name: 'B.CrtYd',
        originalName: 'B.Courtyard',
        ordinal: 46,
        side: 'back',
        layerClass: 'courtyard',
        isCopper: false,
        isTechnical: true,
        isWildcard: false,
        isKnownStandard: true
    })
    assert.equal(KicadLayerResolver.sideFromLayers(['*.Mask']), 'both')
    assert.equal(KicadLayerResolver.layerClass('User.9'), 'user')
})

test('KicadPcbLayerMetadata enriches primitive layers with canonical metadata', () => {
    const layers = KicadPcbLayerMetadata.primitiveLayers({
        drawings: [{ layer: 'B.Courtyard' }],
        outlines: [{ layer: 'Edge.Cuts' }],
        pads: [{ layers: ['*.Cu', 'F.Mask'] }]
    })
    const byName = new Map(layers.map((layer) => [layer.name, layer]))

    assert.equal(byName.get('B.Courtyard').canonicalName, 'B.CrtYd')
    assert.equal(byName.get('B.Courtyard').ordinal, 46)
    assert.equal(byName.get('B.Courtyard').layerClass, 'courtyard')
    assert.equal(byName.get('B.Courtyard').side, 'back')
    assert.equal(byName.get('*.Cu').side, 'both')
    assert.equal(byName.get('*.Cu').isCopper, true)
    assert.equal(byName.get('Edge.Cuts').layerId, 44)
})

test('Geometry resolves rotated rectangles and analytic clearances', () => {
    assert.deepEqual(
        Geometry.rotatedRectanglePoints({
            x: 0,
            y: 0,
            width: 2,
            height: 4,
            rotation: 90
        }).map(roundPoint),
        [
            { x: 2, y: -1 },
            { x: 2, y: 1 },
            { x: -2, y: 1 },
            { x: -2, y: -1 }
        ]
    )

    const clearance = Geometry.clearanceBetweenGeometries(
        Geometry.segmentGeometry({ x: 0, y: 0 }, { x: 4, y: 0 }, 0.5),
        Geometry.circleGeometry({ x: 6, y: 0 }, 1)
    )

    assert.deepEqual(clearance, {
        clearance: 0.5,
        method: 'analytic'
    })
})

test('KicadPcbPadParser exposes geometry-aware pad bounds points', () => {
    const rectBounds = Geometry.boundsFromPoints(
        KicadPcbPadParser.pointsForPad({
            x: 0,
            y: 0,
            width: 2,
            height: 4,
            rotation: 90,
            shape: 'rect'
        })
    )
    const ovalBounds = Geometry.boundsFromPoints(
        KicadPcbPadParser.pointsForPad({
            x: 0,
            y: 0,
            width: 4,
            height: 2,
            rotation: 90,
            shape: 'oval'
        })
    )

    assert.deepEqual(roundBounds(rectBounds), {
        minX: -2,
        minY: -1,
        maxX: 2,
        maxY: 1,
        width: 4,
        height: 2
    })
    assert.deepEqual(roundBounds(ovalBounds), {
        minX: -1,
        minY: -2,
        maxX: 1,
        maxY: 2,
        width: 2,
        height: 4
    })
})

/**
 * Rounds a point for stable floating-point assertions.
 * @param {{ x: number, y: number }} point Point.
 * @returns {{ x: number, y: number }}
 */
function roundPoint(point) {
    return {
        x: Number(point.x.toFixed(6)),
        y: Number(point.y.toFixed(6))
    }
}

/**
 * Rounds bounds for stable floating-point assertions.
 * @param {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }} bounds Bounds.
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }}
 */
function roundBounds(bounds) {
    return {
        minX: Number(bounds.minX.toFixed(6)),
        minY: Number(bounds.minY.toFixed(6)),
        maxX: Number(bounds.maxX.toFixed(6)),
        maxY: Number(bounds.maxY.toFixed(6)),
        width: Number(bounds.width.toFixed(6)),
        height: Number(bounds.height.toFixed(6))
    }
}
