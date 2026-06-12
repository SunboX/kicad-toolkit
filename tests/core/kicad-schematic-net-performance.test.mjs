// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { Geometry } from '../../src/core/kicad/Geometry.mjs'
import { KicadParser } from '../../src/core/kicad/KicadParser.mjs'

/**
 * Verifies schematic net recovery avoids generic distance calculations in
 * point-on-wire checks.
 */
test('KicadParser recovers schematic nets without distance-heavy point checks', () => {
    const originalDistance = Geometry.distance
    let distanceCallCount = 0
    Geometry.distance = (...args) => {
        distanceCallCount += 1
        return originalDistance(...args)
    }

    try {
        const document = KicadParser.parseArrayBuffer(
            'synthetic-nets.kicad_sch',
            bytesFor(denseSchematicSource())
        )

        assert.equal(document.kind, 'schematic')
        assert.ok(document.schematic.nets.length > 0)
        assert.equal(distanceCallCount, 0)
    } finally {
        Geometry.distance = originalDistance
    }
})

/**
 * Encodes a source string as an ArrayBuffer.
 * @param {string} source Source text.
 * @returns {ArrayBuffer}
 */
function bytesFor(source) {
    return new TextEncoder().encode(source).buffer
}

/**
 * Builds a schematic with many wire/junction point checks.
 * @returns {string}
 */
function denseSchematicSource() {
    const wires = Array.from({ length: 32 }, (_value, index) => {
        const y = 10 + index
        return (
            '(wire (pts (xy 0 ' +
            y +
            ') (xy 100 ' +
            y +
            ')) (stroke (width 0.15) (type solid)))'
        )
    })
    const junctions = Array.from({ length: 32 }, (_value, index) => {
        const y = 10 + index
        return '(junction (at 50 ' + y + ') (diameter 0.9))'
    })

    return (
        '(kicad_sch (version 20250114) (generator "fixture") ' +
        '(uuid "synthetic-net-load") (paper "A4") ' +
        wires.join(' ') +
        ' ' +
        junctions.join(' ') +
        ')'
    )
}
