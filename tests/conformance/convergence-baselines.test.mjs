// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { promisify } from 'node:util'

import { KicadBenchmarkFixtureFactory } from '../../benchmarks/KicadBenchmarkFixtureFactory.mjs'
import { KicadConvergenceBenchmark } from '../../benchmarks/KicadConvergenceBenchmark.mjs'
import {
    compareBenchmarkReports,
    reportChecksum,
    validateExistingReport
} from '../../scripts/run-benchmarks.mjs'
import {
    KicadFeatureParity,
    KicadToolkitCapabilities
} from '../../src/extensions.mjs'

const repositoryRoot = new URL('../../', import.meta.url)
const execFileAsync = promisify(execFile)

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

test('API baseline freezes the package export manifest and checksum', async () => {
    const api = await readJson('spec/api-baseline-v1.0.29.json')

    assert.deepEqual(api.packageExports, {
        '.': './src/index.mjs',
        './parser': './src/parser.mjs',
        './node': './src/node.mjs',
        './netlist-query': './src/netlist-query.mjs',
        './renderers': './src/renderers.mjs',
        './scene3d': './src/scene3d.mjs',
        './workers/kicad-parser.worker.mjs':
            './src/workers/kicad-parser.worker.mjs',
        './styles/kicad-renderers.css': './src/styles/kicad-renderers.css'
    })
    assert.equal(
        api.packageExportsChecksum,
        '486405f7518d9811eb7ca9f97c882f15e103821b7f05f267ab062a4c3c819a30'
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
    assert.equal(api.features.length, 9020)
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

test('preservation mappings use audited shared and native ownership decisions', async () => {
    const ledger = await readJson('spec/feature-preservation.json')
    const byFeature = new Map(ledger.map((row) => [row.feature, row]))

    assert.deepEqual(selectMapping(byFeature.get('.#PcbInteractionIndex')), {
        capabilityId: 'geometry_helpers',
        disposition: 'shared',
        replacement: 'circuitjson-toolkit/interaction#PcbInteractionIndex'
    })
    for (const owner of [
        'SExpressionParser',
        'SExpressionSchema',
        'SExpressionSerializer',
        'SExpressionTree'
    ]) {
        assert.deepEqual(selectMapping(byFeature.get(`.#${owner}`)), {
            capabilityId: 's_expression_parser',
            disposition: 'native-extension',
            replacement: `kicad-toolkit/extensions#${owner}`
        })
    }
    assert.deepEqual(
        selectMapping(
            byFeature.get('./scene3d#KicadScene3dBoardOutlineAdapter')
        ),
        {
            capabilityId: 'pcb_scene3d_description',
            disposition: 'native-extension',
            replacement:
                'kicad-toolkit/extensions#KicadScene3dBoardOutlineAdapter'
        }
    )
    assert.deepEqual(
        selectMapping(byFeature.get('./scene3d#PcbScene3dBuilder')),
        {
            capabilityId: 'pcb_scene3d_description',
            disposition: 'shared',
            replacement: 'circuitjson-toolkit/scene3d#PcbScene3dBuilder'
        }
    )
})

test('behavior evidence asserts each exact live capability and parity record', async () => {
    const ledger = await readJson('spec/feature-preservation.json')
    const expected = new Map([
        ...KicadToolkitCapabilities.inventory().capabilities.map((row) => [
            `capability#${row.id}`,
            row
        ]),
        ...KicadFeatureParity.inventory().features.map((row) => [
            `parity#${row.id}`,
            row
        ])
    ])
    const behaviors = ledger.filter((row) => row.kind === 'behavior')

    assert.deepEqual(
        behaviors.map((row) => row.feature).sort(),
        [...expected.keys()].sort()
    )
    for (const row of behaviors) {
        assert.deepEqual(row.sourceContract, expected.get(row.feature))
        assert.match(row.evidenceToken, /^inventory-contract:sha256:/u)
    }
})

test('callable capture follows delegated options and documented nested results', async () => {
    const api = await readJson('spec/api-baseline-v1.0.29.json')
    const renderers = api.entrypoints.find(
        (entrypoint) => entrypoint.entrypoint === './renderers'
    )
    const interaction = renderers.exports.find(
        (exported) => exported.name === 'PcbInteractionIndex'
    )
    for (const methodName of ['hitTest', 'hitTestItems', 'pick']) {
        const callable = interaction.callables.find(
            (row) => row.name === methodName
        )
        assert.deepEqual(callable.options, [
            'hiddenLayers',
            'hiddenObjects',
            'side',
            'tolerance'
        ])
    }

    const root = api.entrypoints.find(
        (entrypoint) => entrypoint.entrypoint === '.'
    )
    const query = api.entrypoints.find(
        (entrypoint) => entrypoint.entrypoint === './netlist-query'
    )
    const loadedDesign = query.exports.find(
        (exported) => exported.name === 'LoadedDesignNetlistService'
    )
    assert.deepEqual(
        loadedDesign.callables.find((row) => row.name === 'listDesigns')
            .options,
        ['max_results', 'pattern']
    )
    const packages = root.exports.find(
        (exported) => exported.name === 'PcbScene3dPackages'
    )
    const resolveContract = packages.callables.find(
        (row) => row.name === 'resolve'
    )
    assert.deepEqual(resolveContract.resultFields, [
        'family',
        'sizeMil',
        'sizeMil.depth',
        'sizeMil.height',
        'sizeMil.width'
    ])
})

test('standalone side resolver wrapper preserves its cross-class contract', async () => {
    const api = await readJson('spec/api-baseline-v1.0.29.json')
    const ledger = await readJson('spec/feature-preservation.json')
    const resultFields = [
        'drawings',
        'footprints',
        'outlines',
        'pads',
        'pcb',
        'pcb.arcs',
        'pcb.boardRegions',
        'pcb.components',
        'pcb.fills',
        'pcb.kicadBoard',
        'pcb.kicadBoard.drawings',
        'pcb.kicadBoard.footprints',
        'pcb.kicadBoard.outlines',
        'pcb.kicadBoard.pads',
        'pcb.kicadBoard.renderSide',
        'pcb.kicadBoard.texts',
        'pcb.pads',
        'pcb.polygons',
        'pcb.regions',
        'pcb.shapeBasedRegions',
        'pcb.texts',
        'pcb.tracks',
        'pcb.vias',
        'renderSide',
        'texts'
    ]

    for (const entrypointName of ['.', './renderers']) {
        const entrypoint = api.entrypoints.find(
            (row) => row.entrypoint === entrypointName
        )
        const exported = entrypoint.exports.find(
            (row) => row.name === 'preparePcbSideResolvedRenderModel'
        )
        const callable = exported.callables[0]
        assert.deepEqual(callable.options, ['side'])
        assert.deepEqual(callable.resultFields, resultFields)

        const prefix = `${entrypointName}#preparePcbSideResolvedRenderModel()`
        assert.deepEqual(
            ledger
                .filter(
                    (row) =>
                        row.feature.startsWith(`${prefix}.option.`) ||
                        row.feature.startsWith(`${prefix}.result.`)
                )
                .map((row) => row.feature),
            [
                `${prefix}.option.side`,
                ...resultFields.map((field) => `${prefix}.result.${field}`)
            ]
        )
    }
})

test('parser facade options and wrapped results exclude transformed internals', async () => {
    const api = await readJson('spec/api-baseline-v1.0.29.json')
    const parser = api.entrypoints
        .find((row) => row.entrypoint === './parser')
        .exports.find((row) => row.name === 'KicadParser')
    const parse = parser.callables.find(
        (row) => row.name === 'parseArrayBufferToRendererModel'
    )
    const wrap = parser.callables.find((row) => row.name === 'wrapBoard')

    assert.deepEqual(parse.options, ['variables'])
    for (const field of [
        'bom',
        'diagnostics',
        'fileName',
        'fileType',
        'kind',
        'pcb',
        'pnp',
        'schema',
        'sourceFormat',
        'summary'
    ]) {
        assert.equal(wrap.resultFields.includes(field), true, field)
    }
    assert.equal(wrap.resultFields.includes('componentIndex'), false)
})

test('accessor and stylesheet entrypoints freeze their observable values', async () => {
    const api = await readJson('spec/api-baseline-v1.0.29.json')
    const ledger = await readJson('spec/feature-preservation.json')
    const metadata = api.entrypoints
        .find((row) => row.entrypoint === './renderers')
        .exports.find((row) => row.name === 'PcbSvgSemanticMetadata')
    const styles = api.entrypoints.find(
        (row) => row.entrypoint === './styles/kicad-renderers.css'
    )

    assert.deepEqual(metadata.staticAccessors, [
        {
            name: 'schema',
            get: true,
            set: false,
            getContract: {
                returnType: 'string',
                value: {
                    type: 'string',
                    value: 'kicad-toolkit.pcb.svg.semantics.a1'
                }
            }
        }
    ])
    assert.deepEqual(
        ledger.find(
            (row) => row.feature === './renderers#PcbSvgSemanticMetadata.schema'
        ).sourceContract.getContract,
        metadata.staticAccessors[0].getContract
    )
    assert.deepEqual(styles.assetContract.rules, [
        {
            selectors: ['.pcb-svg'],
            declarations: [
                { property: 'display', value: 'block' },
                { property: 'height', value: 'auto' },
                { property: 'max-width', value: '100%' }
            ]
        }
    ])
    assert.match(styles.assetContract.sha256, /^[a-f\d]{64}$/u)
})

test('worker capture freezes every request and response field', async () => {
    const api = await readJson('spec/api-baseline-v1.0.29.json')
    const ledger = await readJson('spec/feature-preservation.json')

    assert.deepEqual(api.workerProtocol, {
        entrypoint: './workers/kicad-parser.worker.mjs',
        messages: [
            {
                type: 'parse:file',
                direction: 'request',
                fields: [
                    { name: 'buffer', required: true },
                    { name: 'fileName', required: true },
                    { name: 'options', required: false },
                    { name: 'requestId', required: false },
                    { name: 'type', required: true }
                ]
            },
            {
                type: 'parser:error',
                direction: 'response',
                fields: [
                    { name: 'message', required: true },
                    { name: 'requestId', required: true },
                    { name: 'type', required: true }
                ]
            },
            {
                type: 'parser:success',
                direction: 'response',
                fields: [
                    { name: 'documentModel', required: true },
                    { name: 'requestId', required: true },
                    { name: 'type', required: true }
                ]
            }
        ]
    })
    assert.deepEqual(
        ledger
            .filter(
                (row) => row.sourceContract?.type === 'worker-message-field'
            )
            .map((row) => row.feature),
        [
            './workers/kicad-parser.worker.mjs#message.parse:file.field.buffer',
            './workers/kicad-parser.worker.mjs#message.parse:file.field.fileName',
            './workers/kicad-parser.worker.mjs#message.parse:file.field.options',
            './workers/kicad-parser.worker.mjs#message.parse:file.field.requestId',
            './workers/kicad-parser.worker.mjs#message.parse:file.field.type',
            './workers/kicad-parser.worker.mjs#message.parser:error.field.message',
            './workers/kicad-parser.worker.mjs#message.parser:error.field.requestId',
            './workers/kicad-parser.worker.mjs#message.parser:error.field.type',
            './workers/kicad-parser.worker.mjs#message.parser:success.field.documentModel',
            './workers/kicad-parser.worker.mjs#message.parser:success.field.requestId',
            './workers/kicad-parser.worker.mjs#message.parser:success.field.type'
        ]
    )
})

test('baseline provenance comes only from the fixed source commit', async () => {
    const api = await readJson('spec/api-baseline-v1.0.29.json')
    const testNames = api.testBaseline.definitions.map((row) => row.name)

    assert.equal(
        testNames.includes('project folder is named kicad-toolkit'),
        true
    )
    assert.equal(
        testNames.includes(
            'project root identifies the kicad-toolkit package in any checkout'
        ),
        false
    )
})

test('capture reproduces the immutable baseline away from the baseline HEAD', async () => {
    const child = spawn(
        process.execPath,
        ['scripts/capture-api-baseline.mjs'],
        {
            cwd: repositoryRoot,
            stdio: ['ignore', 'pipe', 'pipe']
        }
    )
    let stdout = ''
    let stderr = ''
    const observedRepositoryExtractions = new Set()
    let scan = Promise.resolve()
    const observe = () => {
        scan = scan.then(async () => {
            for (const name of await readdir(repositoryRoot)) {
                if (name.startsWith('.baseline-source-')) {
                    observedRepositoryExtractions.add(name)
                }
            }
        })
    }
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    const timer = setInterval(observe, 1)
    const [code] = await once(child, 'close')
    clearInterval(timer)
    observe()
    await scan

    assert.equal(code, 0, stderr)
    assert.deepEqual([...observedRepositoryExtractions], [])

    assert.match(
        stdout,
        /Captured \d+ KiCad API features across 8 entrypoints/u
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
                row.samples.every((sample) => sample > 0) &&
                row.cloneBytes > 0 &&
                row.retainedHeap.gcControlled === true &&
                row.retainedHeap.beforeBytes > 0 &&
                row.retainedHeap.afterBytes > 0
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
        /differs from the approved benchmark/u
    )
})

test('benchmark readback independently authenticates package, fixture, and case contracts', async () => {
    const benchmark = await readJson('benchmarks/baseline-v1.0.29.json')
    const identity = {
        packageVersion: '1.0.29',
        gitRef: 'c71c88d69d236accce123656dfa66914c0d5489c',
        sourceTree: benchmark.sourceTree
    }
    const fixture = structuredClone(benchmark.fixture)
    fixture.footprintCount += 1
    const mutations = [
        { ...benchmark, package: 'substituted-toolkit' },
        { ...benchmark, fixture },
        { ...benchmark, fixtureChecksum: '0'.repeat(64) },
        { ...benchmark, caseContractChecksum: 'f'.repeat(64) }
    ]

    for (const mutation of mutations) {
        const { reportChecksum: ignoredChecksum, ...body } = mutation
        void ignoredChecksum
        const resealed = {
            ...body,
            reportChecksum: reportChecksum(body)
        }
        assert.throws(
            () => validateExistingReport(resealed, identity),
            /differs from the approved benchmark/u
        )
    }
})

test('benchmark approval rejects self-resealed measurements and results', async () => {
    const benchmark = await readJson('benchmarks/baseline-v1.0.29.json')
    const identity = {
        packageVersion: '1.0.29',
        gitRef: 'c71c88d69d236accce123656dfa66914c0d5489c',
        sourceTree: benchmark.sourceTree
    }
    const mutations = [
        (row) => {
            row.samples = row.samples.map(() => 0)
            row.medianMilliseconds = 0
            row.cloneBytes = 0
            row.retainedHeap = {
                gcControlled: true,
                beforeBytes: 0,
                afterBytes: 0,
                retainedBytes: 0
            }
        },
        (row) => {
            row.samples = row.samples.map(() => 1_000_000_000)
            row.medianMilliseconds = 1_000_000_000
        },
        (row) => {
            row.result = { fabricated: true }
        }
    ]

    for (const mutate of mutations) {
        const changed = structuredClone(benchmark)
        for (const row of changed.cases) {
            mutate(row)
            row.resultChecksum = resultChecksum(row.result)
        }
        const { reportChecksum: ignored, ...body } = changed
        void ignored
        changed.reportChecksum = reportChecksum(body)
        assert.throws(
            () => validateExistingReport(changed, identity),
            /approved benchmark/u
        )
    }
})

test('candidate benchmark runs current HEAD and enforces baseline comparison', async () => {
    const { stdout } = await execFileAsync('npm', ['run', 'benchmark'], {
        cwd: repositoryRoot,
        maxBuffer: 16 * 1024 * 1024
    })
    const output = JSON.parse(stdout.slice(stdout.indexOf('{')))

    assert.equal(output.comparison.passed, true)
    assert.equal(output.canonical.passed, true)
    assert.notEqual(output.current.gitRef, output.baseline.gitRef)
    assert.equal(
        output.comparison.cases.every((row) => row.passed),
        true
    )
})

test('benchmark comparison rejects a resealed copy of baseline measurements', async () => {
    const baseline = await readJson('benchmarks/baseline-v1.0.29.json')
    const current = structuredClone(baseline)
    current.gitRef = '1'.repeat(40)
    current.sourceTree = '2'.repeat(40)
    const { reportChecksum: ignored, ...body } = current
    void ignored
    current.reportChecksum = reportChecksum(body)

    assert.throws(
        () => compareBenchmarkReports(current, baseline),
        /reuses historical measurements/u
    )
})

/**
 * Returns the SHA-256 checksum of the immutable benchmark case definitions.
 * @returns {Promise<string>} Case contract checksum.
 */
async function caseContractChecksum() {
    return createHash('sha256')
        .update(JSON.stringify(KicadConvergenceBenchmark.cases()))
        .digest('hex')
}

/**
 * Returns a deterministic result checksum.
 * @param {unknown} value Result summary.
 * @returns {string} SHA-256 checksum.
 */
function resultChecksum(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/**
 * Selects the audited ownership fields from one preservation row.
 * @param {Record<string, any> | undefined} row Preservation row.
 * @returns {Record<string, any>} Comparable ownership fields.
 */
function selectMapping(row) {
    return {
        capabilityId: row?.capabilityId,
        disposition: row?.disposition,
        replacement: row?.replacement
    }
}
