// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import test from 'node:test'

import * as packageApi from '../src/index.mjs'
import * as parserApi from '../src/parser.mjs'
import * as rendererApi from '../src/renderers.mjs'
import * as scene3dApi from '../src/scene3d.mjs'

test('package exposes Altium-style parser and renderer entrypoints', async () => {
    const packageConfig = JSON.parse(
        await readFile(new URL('../package.json', import.meta.url), 'utf8')
    )

    assert.equal(packageConfig.exports['.'], './src/index.mjs')
    assert.equal(packageConfig.exports['./parser'], './src/parser.mjs')
    assert.equal(packageConfig.exports['./renderers'], './src/renderers.mjs')
    assert.equal(packageConfig.exports['./scene3d'], './src/scene3d.mjs')
    assert.equal(
        packageConfig.exports['./workers/kicad-parser.worker.mjs'],
        './src/workers/kicad-parser.worker.mjs'
    )
    assert.equal(
        packageConfig.exports['./styles/kicad-renderers.css'],
        './src/styles/kicad-renderers.css'
    )

    assertPublicApi(parserApi, [
        'CircuitJsonModelAdapter',
        'CircuitJsonModelSchema',
        'Geometry',
        'KicadArcGeometry',
        'KicadLayerResolver',
        'KicadNetResolver',
        'KicadParser',
        'KicadPcbDrawingParser',
        'KicadPcbLayerMetadata',
        'KicadPcbPadParser',
        'KicadPcbParser',
        'KicadProjectLoader',
        'KicadReadinessReport',
        'KicadSchematicGraphicParser',
        'KicadSchematicParser',
        'KicadSchematicSymbolParser',
        'KicadToolkitCapabilities',
        'NormalizedModelSchema',
        'SExpressionParser',
        'SExpressionTree'
    ])
    assertPublicApi(rendererApi, [
        'BomTableRenderer',
        'KicadStrokeFont',
        'PcbSideResolvedRenderModel',
        'PcbSvgRenderer',
        'SchematicSvgRenderer',
        'isCopperPrimitive',
        'preparePcbSideResolvedRenderModel'
    ])
    assertPublicApi(scene3dApi, [
        'PcbScene3dBuilder',
        'PcbScene3dModelRegistry',
        'PcbScene3dPackages',
        'PcbScene3dScenePreparator',
        'PcbScene3dSummaryRenderer'
    ])

    for (const exportName of Object.keys(parserApi)) {
        assert.equal(packageApi[exportName], parserApi[exportName])
    }

    for (const exportName of Object.keys(rendererApi)) {
        assert.equal(packageApi[exportName], rendererApi[exportName])
    }

    for (const exportName of Object.keys(scene3dApi)) {
        assert.equal(packageApi[exportName], scene3dApi[exportName])
    }
})

test('package keeps KiCad parser internals in a format-specific core folder', async () => {
    await assertFileExists('../src/core/kicad/Geometry.mjs')
    await assertFileExists('../src/core/kicad/KicadArcGeometry.mjs')
    await assertFileExists('../src/core/kicad/KicadParser.mjs')
    await assertFileExists('../src/core/kicad/KicadLayerResolver.mjs')
    await assertFileExists('../src/core/kicad/KicadNetResolver.mjs')
    await assertFileExists('../src/core/kicad/KicadPcbDrawingParser.mjs')
    await assertFileExists('../src/core/kicad/KicadPcbLayerMetadata.mjs')
    await assertFileExists('../src/core/kicad/KicadPcbPadParser.mjs')
    await assertFileExists('../src/core/kicad/KicadPcbParser.mjs')
    await assertFileExists('../src/core/kicad/KicadProjectLoader.mjs')
    await assertFileExists('../src/core/kicad/KicadReadinessReport.mjs')
    await assertFileExists('../src/core/kicad/KicadSchematicGraphicParser.mjs')
    await assertFileExists('../src/core/kicad/KicadSchematicParser.mjs')
    await assertFileExists('../src/core/kicad/KicadSchematicSymbolParser.mjs')
    await assertFileExists('../src/core/kicad/KicadToolkitCapabilities.mjs')
    await assertFileExists('../src/core/kicad/NormalizedModelSchema.mjs')
    await assertFileExists('../src/core/kicad/SExpressionParser.mjs')
    await assertFileExists('../src/core/kicad/SExpressionTree.mjs')
    await assertFileExists(
        '../src/core/circuit-json/CircuitJsonModelAdapter.mjs'
    )
    await assertFileExists(
        '../src/core/circuit-json/CircuitJsonModelSchema.mjs'
    )
    await assertFileExists('../src/ui/PcbSideResolvedRenderModel.mjs')
    await assertFileExists('../src/scene3d.mjs')
    await assertFileExists('../src/workers/kicad-parser.worker.mjs')
    await assertFileMissing('../src/ui/BadgeRenderer.mjs')
    await assertFileMissing('../src/ui/BadgeStyle.mjs')
    await assertFileMissing('../src/ui/ComponentHighlight.mjs')
    await assertFileMissing('../src/ui/RenderPalette.mjs')

    await assertFileMissing('../src/core/Geometry.mjs')
    await assertFileMissing('../src/core/KicadLayerResolver.mjs')
    await assertFileMissing('../src/core/KicadPcbParser.mjs')
    await assertFileMissing('../src/core/KicadProjectLoader.mjs')
    await assertFileMissing('../src/core/ProjectArchive.mjs')
    await assertFileMissing('../src/core/kicad/ProjectArchive.mjs')
    await assertFileMissing('../src/core/SExpressionParser.mjs')
    await assertFileMissing('../src/core/BadgeStyle.mjs')
    await assertFileMissing('../src/core/RenderPalette.mjs')
})

/**
 * Asserts a module exposes exactly the expected named API.
 *
 * @param {Record<string, unknown>} api Module namespace to inspect.
 * @param {string[]} expectedNames Expected named exports.
 */
function assertPublicApi(api, expectedNames) {
    assert.deepEqual(Object.keys(api).sort(), expectedNames.sort())
}

/**
 * Asserts a package-relative file exists.
 *
 * @param {string} path Package-relative file path.
 */
async function assertFileExists(path) {
    await access(new URL(path, import.meta.url), constants.R_OK)
}

/**
 * Asserts a package-relative file is absent.
 *
 * @param {string} path Package-relative file path.
 */
async function assertFileMissing(path) {
    await assert.rejects(
        access(new URL(path, import.meta.url), constants.R_OK),
        { code: 'ENOENT' }
    )
}
