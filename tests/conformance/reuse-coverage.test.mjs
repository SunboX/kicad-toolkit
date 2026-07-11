// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const repositoryRoot = new URL('../../', import.meta.url)

test('generated convergence baselines use one complete REUSE configuration', async () => {
    await assert.rejects(access(new URL('.reuse/dep5', repositoryRoot)), {
        code: 'ENOENT'
    })

    const reuse = await readFile(new URL('REUSE.toml', repositoryRoot), 'utf8')
    for (const path of [
        'benchmarks/baseline-v1.0.29.json',
        'spec/api-baseline-v1.0.29.json',
        'spec/feature-preservation.json'
    ]) {
        assert.match(reuse, new RegExp(`"${escapeRegExp(path)}"`, 'u'))
    }
})

/**
 * Escapes one literal path for a regular expression.
 * @param {string} value Literal value.
 * @returns {string} Escaped value.
 */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}
