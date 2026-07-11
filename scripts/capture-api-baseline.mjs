// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rename,
    rm,
    symlink,
    writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual, promisify } from 'node:util'
import { format } from 'prettier'

import { KicadApiContractInspector } from './KicadApiContractInspector.mjs'
import { KicadBaselineMappingCatalog } from './KicadBaselineMappingCatalog.mjs'
import { KicadFeatureEvidence } from './KicadFeatureEvidence.mjs'
import { KicadModuleContractRegistry } from './KicadModuleContractRegistry.mjs'

const execFileAsync = promisify(execFile)
const repositoryRoot = new URL('../', import.meta.url)
const refreshBaselines = process.argv.includes('--refresh')
const BASE_VERSION = '1.0.29'
const BASE_GIT_REF = 'c71c88d69d236accce123656dfa66914c0d5489c'
const ENTRYPOINT_EVIDENCE = Object.freeze({
    '.': ['tests/package-layout.test.mjs'],
    './netlist-query': ['tests/core/netlist-query.test.mjs'],
    './node': ['tests/project-structure.test.mjs'],
    './parser': ['tests/package-layout.test.mjs'],
    './renderers': ['tests/package-layout.test.mjs'],
    './scene3d': ['tests/package-layout.test.mjs'],
    './styles/kicad-renderers.css': ['tests/project-structure.test.mjs'],
    './workers/kicad-parser.worker.mjs': [
        'tests/workers/kicad-parser-worker.test.mjs'
    ]
})

/**
 * Runs Git relative to the repository root.
 * @param {string[]} args Git arguments.
 * @returns {Promise<string>} Trimmed stdout.
 */
async function git(args) {
    const { stdout } = await execFileAsync('git', args, {
        cwd: repositoryRoot,
        maxBuffer: 8 * 1024 * 1024
    })
    return stdout.trim()
}

/**
 * Reads a repository-relative JSON file.
 * @param {string} relativePath Repository-relative path.
 * @param {URL} [root] Source root.
 * @returns {Promise<Record<string, any>>} Parsed JSON.
 */
async function readJson(relativePath, root = repositoryRoot) {
    return JSON.parse(await readFile(new URL(relativePath, root), 'utf8'))
}

/**
 * Writes one JSON artifact once and rejects semantic drift.
 * @param {string} relativePath Repository-relative output path.
 * @param {unknown} value JSON value.
 * @returns {Promise<void>}
 */
async function writeImmutableJson(relativePath, value) {
    const url = new URL(relativePath, repositoryRoot)
    try {
        const current = JSON.parse(await readFile(url, 'utf8'))
        if (refreshBaselines) {
            await writeFile(url, await formattedJson(value))
            return
        }
        if (!isDeepStrictEqual(current, value)) {
            throw new Error(`Immutable baseline differs: ${relativePath}`)
        }
        return
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error
    }
    await mkdir(new URL('./', url), { recursive: true })
    await writeFile(url, await formattedJson(value))
}

/**
 * Formats generated JSON with the repository's checked style.
 * @param {unknown} value JSON value.
 * @returns {Promise<string>} Formatted JSON source.
 */
async function formattedJson(value) {
    return format(JSON.stringify(value), {
        parser: 'json',
        tabWidth: 4,
        trailingComma: 'none'
    })
}

/**
 * Creates an idempotent cleanup that atomically removes a temporary path.
 * @param {string} directory Temporary directory.
 * @returns {() => Promise<void>} Cleanup callback.
 */
function atomicTreeCleanup(directory) {
    let cleanupPromise = null
    return () => {
        cleanupPromise ||= (async () => {
            const removedPath = `${directory}.removing-${randomUUID()}`
            try {
                await rename(directory, removedPath)
            } catch (error) {
                if (error?.code === 'ENOENT') return
                throw error
            }
            await rm(removedPath, { force: true, recursive: true })
        })()
        return cleanupPromise
    }
}

/**
 * Extracts the fixed baseline Git tree beside installed dependencies.
 * @returns {Promise<{ root: URL, cleanup: () => Promise<void> }>} Temporary source tree.
 */
async function extractBaselineSource() {
    const directory = await mkdtemp(
        join(tmpdir(), 'kicad-toolkit-baseline-source-')
    )
    const cleanup = atomicTreeCleanup(directory)
    const archive = join(directory, 'baseline.tar')
    try {
        await symlink(
            fileURLToPath(new URL('node_modules/', repositoryRoot)),
            join(directory, 'node_modules'),
            'dir'
        )
        await execFileAsync(
            'git',
            ['archive', '--format=tar', '--output', archive, BASE_GIT_REF],
            { cwd: repositoryRoot, maxBuffer: 8 * 1024 * 1024 }
        )
        await execFileAsync('tar', ['-xf', archive, '-C', directory])
        return {
            root: pathToFileURL(`${directory}/`),
            cleanup
        }
    } catch (error) {
        await cleanup()
        throw error
    }
}

/**
 * Resolves one package-export definition to its import target.
 * @param {string | Record<string, string>} definition Export definition.
 * @returns {string} Relative target.
 */
function exportTarget(definition) {
    if (typeof definition === 'string') return definition
    const target = definition?.import || definition?.default
    if (typeof target !== 'string') {
        throw new Error('Package export lacks a deterministic import target.')
    }
    return target
}

/**
 * Captures one JavaScript entrypoint namespace.
 * @param {string} entrypoint Package export key.
 * @param {string} target Relative module target.
 * @param {URL} [sourceRoot] Baseline source root.
 * @returns {Promise<Record<string, any>>} Entrypoint snapshot.
 */
async function captureEntrypoint(
    entrypoint,
    target,
    sourceRoot = repositoryRoot
) {
    if (target.endsWith('.css')) {
        const source = await readFile(new URL(target, sourceRoot), 'utf8')
        return {
            entrypoint,
            target,
            kind: 'asset',
            exports: [],
            assetContract: KicadApiContractInspector.stylesheet(source)
        }
    }
    const [api, delegates] = await Promise.all([
        import(new URL(target, sourceRoot)),
        KicadModuleContractRegistry.load(target, sourceRoot)
    ])
    return KicadApiContractInspector.entrypoint(
        entrypoint,
        target,
        api,
        delegates
    )
}

/**
 * Recursively reads repository test files.
 * @param {URL} directory Test directory.
 * @param {string} relativeDirectory Relative directory.
 * @returns {Promise<{ path: string, source: string, cases: string[], tokens: Set<string> }[]>} Test sources.
 */
async function readTests(directory, relativeDirectory = 'tests') {
    const tests = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = `${relativeDirectory}/${entry.name}`
        if (entry.isDirectory()) {
            if (path === 'tests/conformance') continue
            tests.push(
                ...(await readTests(new URL(`${entry.name}/`, directory), path))
            )
            continue
        }
        if (!entry.name.endsWith('.test.mjs')) continue
        const source = await readFile(new URL(entry.name, directory), 'utf8')
        const cases = Array.from(
            source.matchAll(
                /\btest(?:\.(?:only|skip|todo))?\(\s*(['"`])([\s\S]*?)\1\s*,/gu
            ),
            (match) => match[2].replace(/\s+/gu, ' ').trim()
        )
        tests.push({
            path,
            source,
            cases,
            tokens: KicadFeatureEvidence.executableTokens(source)
        })
    }
    return tests.sort((left, right) => left.path.localeCompare(right.path))
}

/**
 * Finds tests that reference one evidence token.
 * @param {string} token Evidence token.
 * @param {{ path: string, source: string }[]} tests Test sources.
 * @returns {string[]} Matching test paths.
 */
function evidenceTests(token, tests) {
    return tests
        .filter((test) => test.tokens.has(token))
        .map((test) => test.path)
}

/**
 * Creates one complete baseline feature row.
 * @param {Record<string, any>} fields Feature fields.
 * @param {{ path: string, source: string }[]} tests Test sources.
 * @returns {Record<string, any>} Mapped feature.
 */
function featureRow(fields, tests) {
    const mapping =
        fields.mapping || KicadBaselineMappingCatalog.owner(fields.owner)
    const testPaths =
        fields.tests ||
        evidenceTests(fields.evidenceToken, tests).concat(
            ENTRYPOINT_EVIDENCE[fields.entrypoint] || []
        )
    if (!testPaths.length) {
        throw new Error(
            `No repository test references ${fields.evidenceToken} for ${fields.feature}`
        )
    }
    const row = {
        feature: fields.feature,
        kind: fields.kind,
        ...mapping,
        sourceContract: fields.sourceContract || null,
        tests: [...new Set(testPaths)].sort(),
        documentation: [
            ...new Set(fields.documentation || ['docs/api.md'])
        ].sort()
    }
    return {
        ...row,
        evidenceToken: KicadFeatureEvidence.token(row, {
            mode: row.kind === 'behavior' ? 'inventory' : 'packed'
        })
    }
}

/**
 * Flattens runtime entrypoints into source-derived public contract rows.
 * @param {Record<string, any>[]} entrypoints Entrypoint snapshots.
 * @param {{ path: string, source: string }[]} tests Test sources.
 * @returns {Record<string, any>[]} API feature rows.
 */
function entrypointFeatures(entrypoints, tests) {
    const rows = []
    for (const entrypoint of entrypoints) {
        if (entrypoint.kind === 'asset') {
            rows.push(
                featureRow(
                    {
                        feature: `${entrypoint.entrypoint}#asset`,
                        kind: 'export',
                        owner: 'KicadRendererStyles',
                        entrypoint: entrypoint.entrypoint,
                        evidenceToken: 'kicad-renderers.css',
                        sourceContract: {
                            type: 'asset',
                            target: entrypoint.target,
                            ...entrypoint.assetContract
                        }
                    },
                    tests
                )
            )
            continue
        }
        for (const exported of entrypoint.exports) {
            const prefix = `${entrypoint.entrypoint}#${exported.name}`
            const common = {
                owner: exported.name,
                entrypoint: entrypoint.entrypoint,
                evidenceToken: exported.name
            }
            rows.push(
                featureRow(
                    {
                        ...common,
                        feature: prefix,
                        kind: 'export',
                        sourceContract: {
                            type: exported.type,
                            value: exported.valueContract
                        }
                    },
                    tests
                )
            )
            for (const property of exported.staticProperties) {
                rows.push(
                    featureRow(
                        {
                            ...common,
                            feature: `${prefix}.${property.name}`,
                            kind: 'field',
                            sourceContract: {
                                type: 'static-property',
                                name: property.name,
                                value: property.value
                            }
                        },
                        tests
                    )
                )
            }
            for (const accessor of [
                ...exported.staticAccessors.map((row) => ({
                    ...row,
                    accessorType: 'static'
                })),
                ...exported.instanceAccessors.map((row) => ({
                    ...row,
                    accessorType: 'instance'
                }))
            ]) {
                rows.push(
                    featureRow(
                        {
                            ...common,
                            feature: `${prefix}.${
                                accessor.accessorType === 'instance'
                                    ? 'prototype.'
                                    : ''
                            }${accessor.name}`,
                            kind: 'field',
                            sourceContract: {
                                type: 'accessor',
                                accessorType: accessor.accessorType,
                                get: accessor.get,
                                set: accessor.set,
                                ...(accessor.getContract
                                    ? {
                                          getContract: accessor.getContract
                                      }
                                    : {}),
                                ...(accessor.setContract
                                    ? {
                                          setContract: accessor.setContract
                                      }
                                    : {})
                            }
                        },
                        tests
                    )
                )
            }
            for (const callable of exported.callables) {
                const methodPrefix =
                    callable.methodType === 'function'
                        ? `${prefix}()`
                        : `${prefix}.${
                              callable.methodType === 'instance'
                                  ? 'prototype.'
                                  : ''
                          }${callable.name}()`
                rows.push(
                    featureRow(
                        {
                            ...common,
                            feature: methodPrefix,
                            kind: 'method',
                            sourceContract: callable
                        },
                        tests
                    )
                )
                callable.parameters.forEach((parameter, index) => {
                    rows.push(
                        featureRow(
                            {
                                ...common,
                                feature: `${methodPrefix}.argument.${index}`,
                                kind: 'option',
                                sourceContract: {
                                    type: 'argument',
                                    index,
                                    parameter
                                }
                            },
                            tests
                        )
                    )
                })
                for (const option of callable.options) {
                    rows.push(
                        featureRow(
                            {
                                ...common,
                                feature: `${methodPrefix}.option.${option}`,
                                kind: 'option',
                                sourceContract: { type: 'option', name: option }
                            },
                            tests
                        )
                    )
                }
                for (const field of callable.resultFields) {
                    rows.push(
                        featureRow(
                            {
                                ...common,
                                feature: `${methodPrefix}.result.${field}`,
                                kind: 'field',
                                sourceContract: {
                                    type: 'result-field',
                                    name: field
                                }
                            },
                            tests
                        )
                    )
                }
            }
        }
    }
    return rows
}

/**
 * Captures legacy worker messages and every request/response field.
 * @param {{ path: string, source: string }[]} tests Test sources.
 * @param {URL} sourceRoot Baseline source root.
 * @returns {Promise<{ protocol: Record<string, any>, features: Record<string, any>[] }>} Worker contract.
 */
async function workerFeatures(tests, sourceRoot) {
    const entrypoint = './workers/kicad-parser.worker.mjs'
    const source = await readFile(
        new URL('src/workers/kicad-parser.worker.mjs', sourceRoot),
        'utf8'
    )
    const protocol = KicadApiContractInspector.workerProtocol(
        source,
        entrypoint
    )
    const evidence = [
        'tests/conformance/convergence-baselines.test.mjs',
        'tests/workers/kicad-parser-worker.test.mjs'
    ]
    const features = protocol.messages.flatMap((message) => [
        featureRow(
            {
                feature: `${entrypoint}#message.${message.type}`,
                kind: 'worker-message',
                owner: 'KicadParserWorker',
                entrypoint,
                evidenceToken: message.type,
                sourceContract: {
                    type: 'worker-message',
                    value: message.type,
                    direction: message.direction
                },
                tests: evidence,
                documentation: ['docs/api.md']
            },
            tests
        ),
        ...message.fields.map((field) =>
            featureRow(
                {
                    feature: `${entrypoint}#message.${message.type}.field.${field.name}`,
                    kind: 'field',
                    owner: 'KicadParserWorker',
                    entrypoint,
                    evidenceToken: field.name,
                    sourceContract: {
                        type: 'worker-message-field',
                        messageType: message.type,
                        direction: message.direction,
                        name: field.name,
                        required: field.required
                    },
                    tests: evidence,
                    documentation: ['docs/api.md']
                },
                tests
            )
        )
    ])
    return { protocol, features }
}

/**
 * Captures current capability and parity inventories as observable behaviors.
 * @param {Record<string, any>} rootApi Root module namespace.
 * @param {{ path: string, source: string }[]} tests Test sources.
 * @returns {Record<string, any>[]} Inventory feature rows.
 */
function inventoryFeatures(rootApi, tests) {
    const capabilityRows =
        rootApi.KicadToolkitCapabilities.inventory().capabilities
    const parityRows = rootApi.KicadFeatureParity.inventory().features
    return [
        ...capabilityRows.map((capability) =>
            featureRow(
                {
                    feature: `capability#${capability.id}`,
                    kind: 'behavior',
                    mapping: KicadBaselineMappingCatalog.capability(
                        capability.id
                    ),
                    owner: 'KicadToolkitCapabilities',
                    evidenceToken: 'KicadToolkitCapabilities',
                    sourceContract: capability,
                    documentation: ['docs/capabilities.md']
                },
                tests
            )
        ),
        ...parityRows.map((feature) =>
            featureRow(
                {
                    feature: `parity#${feature.id}`,
                    kind: 'behavior',
                    owner: feature.id,
                    mapping: KicadBaselineMappingCatalog.parity(feature.id),
                    evidenceToken: 'KicadFeatureParity',
                    sourceContract: feature,
                    tests: [
                        ...feature.tests,
                        'tests/core/kicad-feature-parity.test.mjs'
                    ],
                    documentation: feature.docs.map(
                        (path) => path.split('#')[0]
                    )
                },
                tests
            )
        )
    ]
}

/**
 * Creates the immutable API and preservation baselines.
 * @returns {Promise<{ baseline: Record<string, any>, ledger: Record<string, any>[] }>} Artifacts.
 */
export async function captureApiBaseline() {
    const baselineSource = await extractBaselineSource()
    try {
        return await captureBaselineSource(baselineSource.root)
    } finally {
        await baselineSource.cleanup()
    }
}

/**
 * Captures one validated baseline source tree into the active output tree.
 * @param {URL} sourceRoot Extracted baseline source root.
 * @returns {Promise<{ baseline: Record<string, any>, ledger: Record<string, any>[] }>} Artifacts.
 */
async function captureBaselineSource(sourceRoot) {
    const pkg = await readJson('package.json', sourceRoot)
    if (pkg.version !== BASE_VERSION) {
        throw new Error(`Expected kicad-toolkit@${BASE_VERSION}.`)
    }
    const sourceTree = await git(['rev-parse', `${BASE_GIT_REF}^{tree}`])
    const entrypoints = await Promise.all(
        Object.entries(pkg.exports)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([entrypoint, definition]) =>
                captureEntrypoint(
                    entrypoint,
                    exportTarget(definition),
                    sourceRoot
                )
            )
    )
    const tests = await readTests(new URL('tests/', sourceRoot))
    const rootApi = await import(new URL('src/index.mjs', sourceRoot))
    const capabilityInventory = rootApi.KicadToolkitCapabilities.inventory()
    const capabilityIds = capabilityInventory.capabilities.map((row) => row.id)
    const featureInventory = rootApi.KicadFeatureParity.inventory()
    KicadBaselineMappingCatalog.assertComplete({
        owners: [
            ...new Set(
                entrypoints.flatMap((entrypoint) =>
                    entrypoint.exports.map((exported) => exported.name)
                )
            ),
            'KicadParserWorker',
            'KicadRendererStyles'
        ],
        capabilityIds,
        parityIds: featureInventory.features.map((row) => row.id)
    })
    const worker = await workerFeatures(tests, sourceRoot)
    const features = [
        ...entrypointFeatures(entrypoints, tests),
        ...worker.features,
        ...inventoryFeatures(rootApi, tests)
    ].sort((left, right) => left.feature.localeCompare(right.feature))
    const repeated = features
        .map((row) => row.feature)
        .filter((feature, index, all) => all.indexOf(feature) !== index)
    if (repeated.length) {
        throw new Error(
            `Duplicate captured features: ${[...new Set(repeated)].join(', ')}`
        )
    }
    const testDefinitions = tests.flatMap((file) =>
        file.cases.map((name) => ({ file: file.path, name }))
    )
    const baseline = {
        schema: 'kicad-toolkit.api-baseline.v1',
        package: pkg.name,
        packageVersion: pkg.version,
        gitRef: BASE_GIT_REF,
        sourceTree,
        packageExports: pkg.exports,
        packageExportsChecksum: createHash('sha256')
            .update(JSON.stringify(pkg.exports))
            .digest('hex'),
        entrypoints,
        workerProtocol: worker.protocol,
        capabilityInventory,
        featureInventory,
        testBaseline: {
            command: 'npm test',
            total: 382,
            passing: 382,
            sourceDefinitions: testDefinitions.length,
            files: tests.map((file) => file.path),
            definitions: testDefinitions
        },
        features
    }
    const ledger = features.map((feature) => ({
        package: `${pkg.name}@${pkg.version}`,
        ...Object.fromEntries(
            [
                'feature',
                'kind',
                'capabilityId',
                'disposition',
                'replacement',
                'availability',
                'reason',
                'evidenceToken',
                'sourceContract',
                'tests',
                'documentation'
            ].map((field) => [field, feature[field]])
        )
    }))
    await writeImmutableJson('spec/api-baseline-v1.0.29.json', baseline)
    await writeImmutableJson('spec/feature-preservation.json', ledger)
    return { baseline, ledger }
}

/**
 * Returns whether this module is the active script.
 * @returns {boolean} Whether this module is directly executed.
 */
function isMain() {
    return Boolean(
        process.argv[1] &&
        basename(process.argv[1]) === 'capture-api-baseline.mjs'
    )
}

if (isMain()) {
    const { baseline } = await captureApiBaseline()
    process.stdout.write(
        `Captured ${baseline.features.length} KiCad API features across ${baseline.entrypoints.length} entrypoints.\n`
    )
}
