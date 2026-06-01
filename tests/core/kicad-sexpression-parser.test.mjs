// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { SExpressionParser } from '../../src/core/kicad/SExpressionParser.mjs'
import { SExpressionTree } from '../../src/core/kicad/SExpressionTree.mjs'

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

test('SExpressionParser normalizes KiCad hexadecimal integer atoms', () => {
    const parsed = SExpressionParser.parse('(root 0x1f 0X0A 0x0000_00ff)')

    assert.deepEqual(parsed, ['root', 31, 10, 255])
})

test('SExpressionTree reads nested KiCad list values predictably', () => {
    const parsed = SExpressionParser.parse(`
        (root
            (enabled yes)
            (disabled no)
            (layer 31 "B.Cu" signal "Back copper")
            (point (xy 1.25 -2.5))
            (color 255 128 0 0.5)
            (property "Sheet" "Main")
            (property "Revision" "A")
        )
    `)

    assert.equal(SExpressionTree.nodeName(parsed), 'root')
    assert.equal(SExpressionTree.booleanValue('yes', false), true)
    assert.equal(SExpressionTree.booleanValue('no', true), false)
    assert.equal(
        SExpressionTree.textValue(SExpressionTree.child(parsed, 'enabled')),
        'yes'
    )
    assert.equal(SExpressionTree.numberValue(2.5, 0), 2.5)
    assert.deepEqual(
        SExpressionTree.vec2(SExpressionTree.child(parsed, 'point')),
        {
            x: 1.25,
            y: -2.5
        }
    )
    assert.deepEqual(
        SExpressionTree.color(SExpressionTree.child(parsed, 'color')),
        {
            r: 1,
            g: 128 / 255,
            b: 0,
            a: 0.5
        }
    )
    assert.deepEqual(
        SExpressionTree.properties(parsed),
        new Map([
            ['Sheet', 'Main'],
            ['Revision', 'A']
        ])
    )
    assert.deepEqual(SExpressionTree.children(parsed, ['layer', 'missing']), [
        ['layer', 31, 'B.Cu', 'signal', 'Back copper']
    ])
})
