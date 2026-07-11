// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const COMMON_EXPORTS = [
    '.',
    './parser',
    './project',
    './renderers',
    './interaction',
    './query',
    './manufacturing',
    './simulation',
    './scene3d',
    './capabilities',
    './extensions',
    './testing',
    './workers/parser.worker.mjs',
    './styles/renderers.css'
]

test('package exposes the complete common layout', async () => {
    const pkg = JSON.parse(
        await readFile(new URL('../package.json', import.meta.url), 'utf8')
    )
    assert.deepEqual(
        Object.keys(pkg.exports).filter(
            (entry) => !entry.startsWith('./extensions/')
        ),
        COMMON_EXPORTS
    )
})

for (const subpath of [
    'parser',
    'project',
    'renderers',
    'interaction',
    'query',
    'manufacturing',
    'simulation',
    'scene3d',
    'testing'
]) {
    test(`common ${subpath} subpath forwards exact CircuitJSON identities`, async () => {
        const [actual, expected, root] = await Promise.all([
            import(`../src/${subpath}.mjs`),
            import(`circuitjson-toolkit/${subpath}`),
            import('../src/index.mjs')
        ])
        assert.deepEqual(
            Object.keys(actual).sort(),
            Object.keys(expected).sort(),
            subpath
        )
        for (const name of Object.keys(expected)) {
            const packageOwned =
                (subpath === 'parser' && name === 'Parser') ||
                (subpath === 'project' && name === 'ProjectLoader')
            assert.equal(
                actual[name],
                packageOwned ? root[name] : expected[name],
                `${subpath}:${name}`
            )
        }
    })
}

test('extensions preserve all browser-native and shared exports', async () => {
    const [actual, shared, parser, renderers, scene3d, query] =
        await Promise.all([
            import('../src/extensions.mjs'),
            import('circuitjson-toolkit/extensions'),
            import('../src/legacy-parser.mjs'),
            import('../src/legacy-renderers.mjs'),
            import('../src/legacy-scene3d.mjs'),
            import('../src/legacy-netlist-query.mjs')
        ])
    const native = new Set(
        [parser, renderers, scene3d, query].flatMap((namespace) =>
            Object.keys(namespace)
        )
    )
    assert.deepEqual(
        Object.keys(shared).filter((name) => native.has(name)),
        []
    )
    assert.deepEqual(
        Object.keys(actual).sort(),
        [...native, ...Object.keys(shared)].sort()
    )
})

test('Node-only native helpers remain in the explicit extension subpath', async () => {
    const node = await import('../src/legacy-node.mjs')
    assert.equal(typeof node.KicadCliVisualSnapshotHarness, 'function')
})
