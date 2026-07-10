// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { KicadBenchmarkFixtureFactory } from '../../benchmarks/KicadBenchmarkFixtureFactory.mjs'
import { KicadConvergenceBenchmark } from '../../benchmarks/KicadConvergenceBenchmark.mjs'
import {
    reportChecksum,
    validateExistingReport
} from '../../scripts/run-benchmarks.mjs'

const repositoryRoot = new URL('../../', import.meta.url)

/**
 * Reads one repository-relative JSON artifact.
 * @param {string} relativePath Repository-relative path.
 * @returns {Promise<Record<string, any> | Record<string, any>[]>} Parsed JSON.
 */
async function readJson(relativePath) {
    return JSON.parse(
        await readFile(new URL(relativePath, repositoryRoot), 'utf8')
    )
}

test('KiCad baselines identify every public feature and fixed primary cases', async () => {
    const api = await readJson('spec/api-baseline-v1.0.29.json')
    const ledger = await readJson('spec/feature-preservation.json')
    const benchmark = await readJson('benchmarks/baseline-v1.0.29.json')

    assert.equal(api.gitRef, 'c71c88d69d236accce123656dfa66914c0d5489c')
    assert.equal(ledger.length >= api.features.length, true)
    assert.deepEqual(
        benchmark.cases.filter((row) => row.primary).map((row) => row.id),
        ['parse.large-board', 'render.multi-layer', 'worker.clone']
    )
})

test('API baseline freezes every entrypoint, inventory, method contract, and baseline test', async () => {
    const api = await readJson('spec/api-baseline-v1.0.29.json')
    const ledger = await readJson('spec/feature-preservation.json')

    assert.equal(api.schema, 'kicad-toolkit.api-baseline.v1')
    assert.equal(api.package, 'kicad-toolkit')
    assert.equal(api.packageVersion, '1.0.29')
    assert.equal(api.entrypoints.length, 8)
    assert.deepEqual(
        api.entrypoints.map((entrypoint) => entrypoint.entrypoint),
        [
            '.',
            './netlist-query',
            './node',
            './parser',
            './renderers',
            './scene3d',
            './styles/kicad-renderers.css',
            './workers/kicad-parser.worker.mjs'
        ]
    )
    assert.equal(
        api.entrypoints.find((entrypoint) => entrypoint.entrypoint === '.')
            .exports.length,
        126
    )
    assert.equal(api.capabilityInventory.total, 74)
    assert.equal(api.featureInventory.total, 75)
    assert.deepEqual(api.testBaseline, {
        ...api.testBaseline,
        command: 'npm test',
        total: 382,
        passing: 382,
        sourceDefinitions: 382
    })
    assert.equal(api.features.length, 3320)
    assert.equal(ledger.length, api.features.length)
    assert.equal(
        new Set(api.features.map((feature) => feature.feature)).size,
        api.features.length
    )
    assert.equal(
        api.features.some((feature) => feature.kind === 'option'),
        true
    )
    assert.equal(
        api.features.some((feature) => feature.kind === 'field'),
        true
    )
    assert.deepEqual(
        api.features
            .filter((feature) => feature.kind === 'worker-message')
            .map((feature) => feature.sourceContract.value),
        ['parse:file', 'parser:error', 'parser:success']
    )
    assert.equal(
        api.features.every(
            (feature) =>
                feature.sourceContract !== undefined &&
                feature.tests.length > 0 &&
                feature.documentation.length > 0
        ),
        true
    )
})

test('benchmark baseline reconciles fixture, case, measurement, and checksum contracts', async () => {
    const benchmark = await readJson('benchmarks/baseline-v1.0.29.json')
    const { reportChecksum: checksum, ...body } = benchmark

    assert.deepEqual(benchmark.fixture, KicadBenchmarkFixtureFactory.manifest())
    assert.equal(benchmark.fixtureChecksum, benchmark.fixture.checksum)
    assert.equal(benchmark.caseContractChecksum, await caseContractChecksum())
    assert.deepEqual(
        benchmark.cases.map((row) => row.id),
        KicadConvergenceBenchmark.cases().map((row) => row.id)
    )
    assert.equal(
        benchmark.cases.every(
            (row) =>
                row.sampleCount === row.samples.length &&
                row.samples.every((sample) => sample >= 0) &&
                row.cloneBytes >= 0 &&
                row.retainedHeap.gcControlled === true
        ),
        true
    )
    assert.equal(checksum, reportChecksum(body))
    assert.doesNotThrow(() =>
        validateExistingReport(benchmark, {
            packageVersion: '1.0.29',
            gitRef: 'c71c88d69d236accce123656dfa66914c0d5489c',
            sourceTree: benchmark.sourceTree
        })
    )
    assert.throws(
        () =>
            validateExistingReport(
                {
                    ...benchmark,
                    cases: benchmark.cases.map((row) => ({
                        ...row,
                        primary: row.id === 'project.multi-entry'
                    }))
                },
                {
                    packageVersion: '1.0.29',
                    gitRef: 'c71c88d69d236accce123656dfa66914c0d5489c',
                    sourceTree: benchmark.sourceTree
                }
            ),
        /differs from the approved contract/u
    )
})

/**
 * Returns the SHA-256 checksum of the immutable benchmark case definitions.
 * @returns {Promise<string>} Case contract checksum.
 */
async function caseContractChecksum() {
    const { createHash } = await import('node:crypto')
    return createHash('sha256')
        .update(JSON.stringify(KicadConvergenceBenchmark.cases()))
        .digest('hex')
}
