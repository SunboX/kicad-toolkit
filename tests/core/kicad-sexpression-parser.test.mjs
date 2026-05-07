// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { SExpressionParser } from '../../src/core/kicad/SExpressionParser.mjs'

test('SExpressionParser parses KiCad atoms, strings, comments, and nested lists', () => {
    const parsed = SExpressionParser.parse(`
        ; Legacy semicolon comments remain supported.
        # KiCad hash comments are line based.
        (root
            (property "Reference" "U1")
            (at -1.5 2 90)
            # Comments may be indented before a list.
            (effects (font (size 1 1) (thickness 0.15)))
        )
    `)

    assert.equal(parsed[0], 'root')
    assert.deepEqual(parsed[1], ['property', 'Reference', 'U1'])
    assert.deepEqual(parsed[2], ['at', -1.5, 2, 90])
    assert.equal(parsed[3][0], 'effects')
})

test('SExpressionParser decodes KiCad quoted string escapes', () => {
    const parsed = SExpressionParser.parse(String.raw`
        (root
            "alert\a backspace\b formfeed\f newline\n return\r tab\t vertical\v"
            "quote\" slash\\ hex\x41 octal\101 unknown\q"
            "empty-hex\xZ"
        )
    `)

    assert.equal(
        parsed[1],
        'alert\u0007 backspace\b formfeed\f newline\n return\r tab\t vertical\v'
    )
    assert.equal(parsed[2], 'quote" slash\\ hexA octalA unknown\\q')
    assert.equal(parsed[3], 'empty-hexxZ')
})

test('SExpressionParser tokenizes KiCad bar tokens separately', () => {
    const parsed = SExpressionParser.parse('(root A|B | C)')

    assert.deepEqual(parsed, ['root', 'A', '|', 'B', '|', 'C'])
})
