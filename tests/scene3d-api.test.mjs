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

    assert.equal(scene.board.widthMil, 1000)
    assert.equal(scene.components[0].designator, 'U1')
    assert.equal(scene.pads.length, 1)
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
