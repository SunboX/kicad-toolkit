import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadScene3dCopperTrackCutoutBuilder } from '../src/scene3d.mjs'

/**
 * Builds one horizontal top-copper track.
 * @returns {object}
 */
function createHorizontalTrack() {
    return {
        x1: 0,
        y1: 0,
        x2: 200,
        y2: 0,
        width: 10,
        layerId: 1,
        netName: 'TEST_NET'
    }
}

/**
 * Extracts rounded X endpoints from split track rows.
 * @param {object[]} tracks Split tracks.
 * @returns {number[][]}
 */
function trackXEndpoints(tracks) {
    return tracks.map((track) => [
        Math.round(Number(track.x1 || 0)),
        Math.round(Number(track.x2 || 0))
    ])
}

test('KicadScene3dCopperTrackCutoutBuilder keeps tracks continuous under pad faces', () => {
    const tracks = KicadScene3dCopperTrackCutoutBuilder.splitTracks(
        [createHorizontalTrack()],
        [
            {
                x: 100,
                y: 0,
                sizeTopX: 40,
                sizeTopY: 120,
                shapeTop: 2,
                hasTopSolderMaskOpening: true
            }
        ],
        []
    )

    assert.deepEqual(trackXEndpoints(tracks), [[0, 200]])
})

test('KicadScene3dCopperTrackCutoutBuilder keeps tracks continuous under rotated pad faces', () => {
    const tracks = KicadScene3dCopperTrackCutoutBuilder.splitTracks(
        [createHorizontalTrack()],
        [
            {
                x: 100,
                y: 0,
                sizeTopX: 40,
                sizeTopY: 120,
                shapeTop: 2,
                rotation: 90,
                hasTopSolderMaskOpening: true
            }
        ],
        []
    )

    assert.deepEqual(trackXEndpoints(tracks), [[0, 200]])
})

test('KicadScene3dCopperTrackCutoutBuilder clips plated via apertures inside annuli', () => {
    const tracks = KicadScene3dCopperTrackCutoutBuilder.splitTracks(
        [createHorizontalTrack()],
        [],
        [
            {
                x: 100,
                y: 0,
                diameter: 60,
                holeDiameter: 40
            }
        ]
    )

    assert.deepEqual(trackXEndpoints(tracks), [
        [0, 80],
        [120, 200]
    ])
})

test('KicadScene3dCopperTrackCutoutBuilder keeps physical drill clearance expanded', () => {
    const tracks = KicadScene3dCopperTrackCutoutBuilder.splitTracks(
        [createHorizontalTrack()],
        [
            {
                x: 100,
                y: 0,
                holeDiameter: 40,
                hasTopSolderMaskOpening: false,
                hasBottomSolderMaskOpening: false
            }
        ],
        []
    )

    assert.deepEqual(trackXEndpoints(tracks), [
        [0, 75],
        [125, 200]
    ])
})
