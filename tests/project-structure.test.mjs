// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = new URL('../', import.meta.url)

/**
 * Checks whether a project-relative file exists.
 * @param {string} relativePath
 * @returns {Promise<boolean>}
 */
async function exists(relativePath) {
    try {
        await access(new URL(relativePath, root), constants.F_OK)
        return true
    } catch {
        return false
    }
}

/**
 * Verifies mandatory library files.
 */
test('required project files exist', async () => {
    const required = [
        'README.md',
        'AGENTS.md',
        'LICENSE',
        'LICENSES/GPL-3.0-or-later.txt',
        'LICENSES/CC-BY-SA-4.0.txt',
        'COMMERCIAL-LICENSE.md',
        'NOTICE.md',
        'CONTRIBUTING.md',
        'REUSE.toml',
        'package.json',
        'spec/library-scope.md',
        'docs/api.md',
        'docs/model-format.md',
        'docs/testing.md',
        'examples/server.mjs',
        'examples/minimal-board/index.html',
        'examples/minimal-board/example.mjs',
        'src/index.mjs',
        'src/parser.mjs',
        'src/renderers.mjs',
        'src/styles/kicad-renderers.css',
        'src/core/BadgeStyle.mjs',
        'src/core/Geometry.mjs',
        'src/core/KicadLayerResolver.mjs',
        'src/core/KicadPcbParser.mjs',
        'src/core/KicadProjectLoader.mjs',
        'src/core/ProjectArchive.mjs',
        'src/core/RenderPalette.mjs',
        'src/core/SExpressionParser.mjs',
        'src/ui/BadgeRenderer.mjs',
        'src/ui/ComponentHighlight.mjs',
        'src/ui/KicadStrokeFont.mjs',
        'src/ui/PcbSvgRenderer.mjs',
        'tests/core/kicad-pcb-parser.test.mjs',
        'tests/core/kicad-project-loader.test.mjs',
        'tests/core/kicad-sexpression-parser.test.mjs',
        'tests/core/project-archive.test.mjs',
        'tests/ui/pcb-svg-renderer.test.mjs',
        'tests/ui/pcb-svg-renderer-badges.test.mjs',
        'tests/ui/pcb-svg-renderer-pad-strokes.test.mjs',
        'tests/api-entrypoints.test.mjs',
        'tests/project-structure.test.mjs',
        'tests/mjs-line-limit.test.mjs',
        'tests/fixtures/minimal.kicad_pcb'
    ]

    for (const relativePath of required) {
        assert.equal(
            await exists(relativePath),
            true,
            'Missing file: ' + relativePath
        )
    }
})

/**
 * Verifies package metadata follows the SunboX dual-license policy.
 */
test('package declares GPL and commercial licensing notices', async () => {
    const pkg = JSON.parse(
        await readFile(new URL('package.json', root), 'utf8')
    )
    const readme = await readFile(new URL('README.md', root), 'utf8')
    const commercial = await readFile(
        new URL('COMMERCIAL-LICENSE.md', root),
        'utf8'
    )
    const notice = await readFile(new URL('NOTICE.md', root), 'utf8')
    const contributing = await readFile(
        new URL('CONTRIBUTING.md', root),
        'utf8'
    )

    assert.equal(pkg.name, '@sunbox/kicad-toolkit')
    assert.equal(pkg.license, 'GPL-3.0-or-later')
    assert.match(readme, /GPL-3\.0-or-later/)
    assert.match(readme, /CC-BY-SA-4\.0/)
    assert.match(readme, /Commercial licensing contact/)
    assert.match(commercial, /not itself a commercial license grant/)
    assert.match(notice, /https:\/\/github\.com\/SunboX\/kicad-toolkit/)
    assert.match(contributing, /commercial\/proprietary license offerings/)
})

/**
 * Verifies public exports mirror the Altium Toolkit entrypoint shape.
 */
test('package exposes root parser renderer and style entrypoints', async () => {
    const pkg = JSON.parse(
        await readFile(new URL('package.json', root), 'utf8')
    )

    assert.equal(pkg.exports['.'], './src/index.mjs')
    assert.equal(pkg.exports['./parser'], './src/parser.mjs')
    assert.equal(pkg.exports['./renderers'], './src/renderers.mjs')
    assert.equal(
        pkg.exports['./styles/kicad-renderers.css'],
        './src/styles/kicad-renderers.css'
    )
})

/**
 * Verifies the repository folder has the requested library slug.
 */
test('project folder is named kicad-toolkit', () => {
    assert.equal(basename(fileURLToPath(root)), 'kicad-toolkit')
})

/**
 * Verifies docs describe library rather than app responsibilities.
 */
test('documentation keeps host app behavior out of library scope', async () => {
    const scope = await readFile(new URL('spec/library-scope.md', root), 'utf8')
    const agents = await readFile(new URL('AGENTS.md', root), 'utf8')

    assert.match(scope, /Application state management/)
    assert.match(scope, /Out Of Scope/)
    assert.match(agents, /no file picker wiring/i)
    assert.doesNotMatch(
        scope,
        /WebMCP bridge and external app integrations.*In Scope/s
    )
})
