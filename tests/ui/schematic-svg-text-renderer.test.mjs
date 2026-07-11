// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadParser } from '../../src/legacy-parser.mjs'
import { SchematicSvgRenderer } from '../../src/legacy-renderers.mjs'

/**
 * Encodes fixture source to an ArrayBuffer-like byte view.
 * @param {string} source Source fixture.
 * @returns {Uint8Array}
 */
function bytesFor(source) {
    return new TextEncoder().encode(source)
}

/**
 * Extracts one rendered stroke text group by label.
 * @param {string} markup Rendered SVG markup.
 * @param {string} label Aria label.
 * @returns {string}
 */
function renderedTextGroup(markup, label) {
    const safeLabel = escapeRegExp(label)
    const pattern = new RegExp(
        `<g class="[^"]*schematic-text[^"]*"[^>]*aria-label="${safeLabel}"[^>]*>[\\s\\S]*?<\\/g>`
    )
    return markup.match(pattern)?.[0] || ''
}

/**
 * Escapes text for literal RegExp matching.
 * @param {string} value Text to escape.
 * @returns {string}
 */
function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Formats a test number like the SVG renderer.
 * @param {number} value Number.
 * @returns {string}
 */
function formatSvgNumber(value) {
    return value.toFixed(3).replace(/\.?0+$/, '')
}

/**
 * Calculates the expected baseline for bottom-aligned test text.
 * @param {number} y Anchor y.
 * @param {number} size Text size.
 * @returns {number}
 */
function bottomTextBaseline(y, size) {
    return y + size - 0.12 * 0.052 - size * 1.17
}

/**
 * Builds a fake schematic with trailing newline text.
 * @returns {string}
 */
function trailingNewlineTextSource() {
    return `(kicad_sch
        (version 20250114)
        (paper "A4")
        (text "TOP" (at 20 16 0)
            (effects (font (size 1.27 1.27)) (justify left bottom))
            (uuid "fake-top-text")
        )
        (text "BOTTOM\\n" (at 20 20 0)
            (effects (font (size 1.27 1.27)) (justify left bottom))
            (uuid "fake-bottom-text")
        )
    )`
}

test('SchematicSvgRenderer ignores trailing empty schematic text lines for placement', () => {
    const document = KicadParser.parseArrayBuffer(
        'fake-trailing-newline-text.kicad_sch',
        bytesFor(trailingNewlineTextSource())
    )
    const markup = SchematicSvgRenderer.render(document)
    const bottomText = renderedTextGroup(markup, 'BOTTOM\n')

    assert.match(
        bottomText,
        new RegExp(`data-y="${formatSvgNumber(bottomTextBaseline(20, 1.27))}"`)
    )
    assert.doesNotMatch(markup, /data-line=""/)
})
