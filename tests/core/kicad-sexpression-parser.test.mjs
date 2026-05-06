// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { SExpressionParser } from '../../src/core/kicad/SExpressionParser.mjs'

test('SExpressionParser parses KiCad atoms, strings, comments, and nested lists', () => {
    const parsed = SExpressionParser.parse(`
        ; KiCad comments are line based.
        (root
            (property "Reference" "U1")
            (at -1.5 2 90)
            (effects (font (size 1 1) (thickness 0.15)))
        )
    `)

    assert.equal(parsed[0], 'root')
    assert.deepEqual(parsed[1], ['property', 'Reference', 'U1'])
    assert.deepEqual(parsed[2], ['at', -1.5, 2, 90])
    assert.equal(parsed[3][0], 'effects')
})
