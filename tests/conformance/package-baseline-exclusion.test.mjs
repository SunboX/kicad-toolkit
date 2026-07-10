// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repositoryRoot = new URL('../../', import.meta.url)

test('npm package excludes development baselines and preserves scope docs', async () => {
    const pkg = JSON.parse(
        await readFile(new URL('package.json', repositoryRoot), 'utf8')
    )
    const report = await packDryRun()
    const paths = report.files.map((file) => file.path)

    assert.equal(pkg.files.includes('spec'), false)
    assert.equal(pkg.files.includes('spec/library-scope.md'), true)
    assert.equal(paths.includes('spec/library-scope.md'), true)
    assert.equal(paths.includes('spec/api-baseline-v1.0.29.json'), false)
    assert.equal(paths.includes('spec/feature-preservation.json'), false)
    assert.equal(paths.includes('benchmarks/baseline-v1.0.29.json'), false)
    assert.equal(report.unpackedSize < 3_000_000, true)
    assert.equal(report.size < 550_000, true)
})

/**
 * Returns the npm dry-run package report.
 * @returns {Promise<Record<string, any>>} Package report.
 */
async function packDryRun() {
    const { stdout } = await execFileAsync(
        'npm',
        ['pack', '--json', '--dry-run'],
        { cwd: repositoryRoot, maxBuffer: 16 * 1024 * 1024 }
    )
    return JSON.parse(stdout)[0]
}
