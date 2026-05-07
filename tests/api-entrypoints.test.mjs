// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import * as rootApi from '../src/index.mjs'
import * as parserApi from '../src/parser.mjs'
import * as rendererApi from '../src/renderers.mjs'
import * as scene3dApi from '../src/scene3d.mjs'

/**
 * Verifies the root entrypoint exposes parser and renderer APIs.
 */
test('root entrypoint exports parser and renderer classes', () => {
    assert.match(
        rootApi.NormalizedModelSchema.CURRENT_SCHEMA_ID,
        /^urn:kicad-toolkit:normalized-model:/
    )
    assert.equal(typeof rootApi.KicadArcGeometry.fromThreePoints, 'function')
    assert.equal(typeof rootApi.KicadNetResolver.fromNodes, 'function')
    assert.equal(typeof rootApi.KicadParser.parseArrayBuffer, 'function')
    assert.equal(
        typeof rootApi.KicadPcbDrawingParser.parseBoardItems,
        'function'
    )
    assert.equal(typeof rootApi.KicadPcbPadParser.parsePad, 'function')
    assert.equal(typeof rootApi.KicadPcbParser.parse, 'function')
    assert.equal(typeof rootApi.KicadSchematicGraphicParser.parse, 'function')
    assert.equal(typeof rootApi.KicadSchematicParser.parse, 'function')
    assert.equal(
        typeof rootApi.KicadSchematicSymbolParser.parsePins,
        'function'
    )
    assert.equal(typeof rootApi.KicadProjectLoader.loadEntries, 'function')
    assert.equal(typeof rootApi.SExpressionParser.parse, 'function')
    assert.equal(typeof rootApi.BomTableRenderer.render, 'function')
    assert.equal(typeof rootApi.PcbSvgRenderer.render, 'function')
    assert.equal(typeof rootApi.PcbSideResolvedRenderModel.resolve, 'function')
    assert.equal(typeof rootApi.preparePcbSideResolvedRenderModel, 'function')
    assert.equal(typeof rootApi.isCopperPrimitive, 'function')
    assert.equal(typeof rootApi.SchematicSvgRenderer.render, 'function')
    assert.equal(typeof rootApi.PcbScene3dBuilder.build, 'function')
    assert.equal(typeof rootApi.PcbScene3dPackages.resolve, 'function')
    assert.equal(typeof rootApi.PcbScene3dScenePreparator.prepare, 'function')
    assert.equal(typeof rootApi.RenderPalette, 'undefined')
    assert.equal(typeof rootApi.BadgeStyle, 'undefined')
    assert.equal(typeof rootApi.BadgeRenderer, 'undefined')
    assert.equal(typeof rootApi.ComponentHighlight, 'undefined')
})

/**
 * Verifies specialized parser and renderer entrypoints stay separated.
 */
test('specialized entrypoints expose their intended API groups', () => {
    assert.equal(typeof parserApi.NormalizedModelSchema.attach, 'function')
    assert.equal(typeof parserApi.KicadParser.parseArrayBuffer, 'function')
    assert.equal(typeof parserApi.KicadPcbPadParser.parsePad, 'function')
    assert.equal(typeof parserApi.KicadPcbParser.parse, 'function')
    assert.equal(typeof parserApi.KicadSchematicParser.parse, 'function')
    assert.equal(typeof parserApi.PcbSvgRenderer, 'undefined')
    assert.equal(typeof rendererApi.PcbSvgRenderer.render, 'function')
    assert.equal(typeof rendererApi.SchematicSvgRenderer.render, 'function')
    assert.equal(typeof rendererApi.BomTableRenderer.render, 'function')
    assert.equal(
        typeof rendererApi.PcbSideResolvedRenderModel.resolve,
        'function'
    )
    assert.equal(
        typeof rendererApi.preparePcbSideResolvedRenderModel,
        'function'
    )
    assert.equal(typeof rendererApi.isCopperPrimitive, 'function')
    assert.equal(typeof rendererApi.KicadPcbParser, 'undefined')
    assert.equal(typeof scene3dApi.PcbScene3dBuilder.build, 'function')
    assert.equal(typeof scene3dApi.PcbScene3dPackages.resolve, 'function')
    assert.equal(typeof scene3dApi.PcbSvgRenderer, 'undefined')
    assert.deepEqual(
        ['BadgeRenderer', 'BadgeStyle', 'ComponentHighlight', 'RenderPalette']
            .map((name) => rendererApi[name])
            .filter(Boolean),
        []
    )
})
