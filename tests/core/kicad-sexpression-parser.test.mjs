// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { SExpressionParser } from '../../src/core/kicad/SExpressionParser.mjs'
import { SExpressionSchema } from '../../src/core/kicad/SExpressionSchema.mjs'
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

test('SExpressionParser returns opt-in structured parse metadata', () => {
    const source = `
        (board
            (version 20240101)
            (property "Reference" "U1")
            (property "Value" "MCU")
            (layers
                (layer "F.Cu")
                (layer "B.Cu")
            )
            locked
        )
    `

    const parsed = SExpressionParser.parseWithMetadata(source)

    assert.deepEqual(parsed.root, SExpressionParser.parse(source))
    assert.equal(parsed.metadata.rootName, 'board')
    assert.equal(parsed.metadata.tokenCount, 29)
    assert.equal(parsed.metadata.nodeCount, 7)
    assert.equal(parsed.metadata.maxDepth, 3)
    assert.deepEqual(parsed.metadata.childNameCounts, {
        version: 1,
        property: 2,
        layers: 1
    })
    assert.deepEqual(parsed.metadata.duplicateChildNames, ['property'])
    assert.deepEqual(parsed.metadata.scalarTypeCounts, {
        string: 14,
        number: 1
    })
})

test('SExpressionTree describes generic S-expression node structure', () => {
    const parsed = SExpressionParser.parse(`
        (root
            (child "one")
            (child "two")
            (nested (leaf 1))
            2
        )
    `)

    assert.deepEqual(SExpressionTree.childNameCounts(parsed), {
        child: 2,
        nested: 1
    })
    assert.deepEqual(SExpressionTree.duplicateChildNames(parsed), ['child'])
    assert.deepEqual(SExpressionTree.describe(parsed), {
        rootName: 'root',
        nodeCount: 5,
        maxDepth: 3,
        childNameCounts: {
            child: 2,
            nested: 1
        },
        duplicateChildNames: ['child'],
        scalarTypeCounts: {
            string: 7,
            number: 2
        }
    })
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

test('SExpressionTree reads properties through case-insensitive lookup helpers', () => {
    const parsed = SExpressionParser.parse(`
        (root
            (property "Manufacturer" "Fake Parts")
            (property "VALUE" "10k")
        )
    `)

    assert.equal(
        SExpressionTree.propertyValue(parsed, 'value', '', {
            caseInsensitive: true
        }),
        '10k'
    )
    assert.equal(
        SExpressionTree.propertyValue(parsed, 'value', 'missing'),
        'missing'
    )
    assert.deepEqual(
        SExpressionTree.caseInsensitiveProperties(parsed).get('manufacturer'),
        {
            key: 'Manufacturer',
            value: 'Fake Parts'
        }
    )
})

test('SExpressionSchema maps common node fields and reports unknown children', () => {
    const parsed = SExpressionParser.parse(`
        (pad "1" smd rect
            (locked)
            (size 1.2 2.4)
            (property "Net" "GND")
            (property "Kind" "signal")
            (unknown 42)
        )
    `)
    const result = SExpressionSchema.parse(
        parsed,
        SExpressionSchema.node('pad', [
            SExpressionSchema.positional('number', SExpressionSchema.string()),
            SExpressionSchema.positional('type', SExpressionSchema.string()),
            SExpressionSchema.positional('shape', SExpressionSchema.string()),
            SExpressionSchema.flag('locked'),
            SExpressionSchema.child('size', 'size', SExpressionSchema.vec2()),
            SExpressionSchema.properties('properties')
        ])
    )

    assert.deepEqual(result.value, {
        number: '1',
        type: 'smd',
        shape: 'rect',
        locked: true,
        size: { x: 1.2, y: 2.4 },
        properties: {
            Net: 'GND',
            Kind: 'signal'
        }
    })
    assert.deepEqual(
        result.diagnostics.map((diagnostic) => ({
            severity: diagnostic.severity,
            code: diagnostic.code,
            path: diagnostic.path
        })),
        [
            {
                severity: 'warning',
                code: 'unknown_child',
                path: 'pad.unknown'
            }
        ]
    )
})
