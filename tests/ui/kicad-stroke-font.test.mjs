// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'

import { KicadStrokeFont } from '../../src/renderers.mjs'

test('KicadStrokeFont renders Latin-1 glyphs instead of fallback question marks', () => {
    const attrs = { x: 0, y: 0, sizeX: 1, sizeY: 1 }
    const accented = KicadStrokeFont.strokeLine('é', attrs)
    const fallback = KicadStrokeFont.strokeLine('?', attrs)
    const plain = KicadStrokeFont.strokeLine('e', attrs)

    assert.notDeepEqual(accented, fallback)
    assert.ok(accented.length > plain.length)
})
