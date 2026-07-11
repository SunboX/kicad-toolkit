// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'

import { KicadCanonicalBenchmark } from '../../benchmarks/KicadCanonicalBenchmark.mjs'

test('canonical parser and project paths satisfy absolute speed ceilings', async () => {
    const report = await KicadCanonicalBenchmark.run()

    assert.equal(report.schema, 'kicad-toolkit.canonical-benchmark.v1')
    assert.equal(report.passed, true)
    assert.deepEqual(
        report.cases.map((row) => row.id),
        ['canonical.parse.large-board', 'canonical.project.multi-entry']
    )
    assert.equal(
        report.cases.every(
            (row) =>
                row.samples.length === row.sampleCount &&
                row.samples.every((sample) => sample > 0) &&
                row.medianMilliseconds <= row.maximumMedianMilliseconds &&
                row.passed
        ),
        true
    )
    assert.equal(report.cases[0].result.documentCount, 1)
    assert.equal(report.cases[0].result.elementCount > 1_000, true)
    assert.equal(report.cases[1].result.documentCount, 2)
    assert.equal(report.cases[1].result.assetCount, 2)
})
