// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import * as rootApi from '../src/index.mjs'
import * as parserApi from '../src/parser.mjs'
import * as rendererApi from '../src/renderers.mjs'

/**
 * Verifies the root entrypoint exposes parser and renderer APIs.
 */
test('root entrypoint exports parser and renderer classes', () => {
    assert.equal(typeof rootApi.KicadPcbParser.parse, 'function')
    assert.equal(typeof rootApi.KicadProjectLoader.loadEntries, 'function')
    assert.equal(typeof rootApi.SExpressionParser.parse, 'function')
    assert.equal(typeof rootApi.PcbSvgRenderer.render, 'function')
    assert.equal(typeof rootApi.RenderPalette, 'undefined')
    assert.equal(typeof rootApi.BadgeStyle, 'undefined')
    assert.equal(typeof rootApi.BadgeRenderer, 'undefined')
    assert.equal(typeof rootApi.ComponentHighlight, 'undefined')
})

/**
 * Verifies specialized parser and renderer entrypoints stay separated.
 */
test('specialized entrypoints expose their intended API groups', () => {
    assert.equal(typeof parserApi.KicadPcbParser.parse, 'function')
    assert.equal(typeof parserApi.PcbSvgRenderer, 'undefined')
    assert.equal(typeof rendererApi.PcbSvgRenderer.render, 'function')
    assert.equal(typeof rendererApi.KicadPcbParser, 'undefined')
    assert.deepEqual(
        ['BadgeRenderer', 'BadgeStyle', 'ComponentHighlight', 'RenderPalette']
            .map((name) => rendererApi[name])
            .filter(Boolean),
        []
    )
})
