// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'

import { KicadStrokeFont } from '../../src/legacy-renderers.mjs'

test('KicadStrokeFont renders Latin-1 glyphs instead of fallback question marks', () => {
    const attrs = { x: 0, y: 0, sizeX: 1, sizeY: 1 }
    const accented = KicadStrokeFont.strokeLine('é', attrs)
    const fallback = KicadStrokeFont.strokeLine('?', attrs)
    const plain = KicadStrokeFont.strokeLine('e', attrs)

    assert.notDeepEqual(accented, fallback)
    assert.ok(accented.length > plain.length)
})

test('KicadStrokeFont lays out width and strokes in one pass', () => {
    const attrs = { x: 10, y: 20, sizeX: 1.5, sizeY: 1.25 }
    const layout = KicadStrokeFont.layoutLine('V_{1}^{2}', attrs)

    assert.equal(layout.width, KicadStrokeFont.measureLine('V_{1}^{2}', 1.5))
    assert.deepEqual(
        layout.strokes,
        KicadStrokeFont.strokeLine('V_{1}^{2}', attrs)
    )
})
