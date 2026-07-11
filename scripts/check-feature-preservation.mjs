// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
    access,
    lstat,
    mkdtemp,
    readFile,
    realpath,
    rm,
    writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import {
    basename,
    isAbsolute,
    join,
    relative as relativePath,
    resolve
} from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual, promisify } from 'node:util'

import { KicadApiContractInspector } from './KicadApiContractInspector.mjs'
import { KicadApprovedBaselineProvenance } from './KicadApprovedBaselineProvenance.mjs'
import { KicadFeatureEvidence } from './KicadFeatureEvidence.mjs'
import { KicadModuleContractRegistry } from './KicadModuleContractRegistry.mjs'

const execFileAsync = promisify(execFile)
const moduleDelegates = new WeakMap()
const inspectedEntrypoints = new WeakMap()
const packedJavascript = new Map()
const TOOLKITS = [
    'altium-toolkit',
    'circuitjson-toolkit',
    'gerber-toolkit',
    'kicad-toolkit'
]
const AVAILABILITY = new Set(['shared', 'derived', 'native', 'unavailable'])
const DISPOSITIONS = new Set(['shared', 'native-extension', 'unavailable'])
const FEATURE_KINDS = new Set([
    'behavior',
    'export',
    'field',
    'method',
    'option',
    'worker-message'
])
const CONVERGED_PACKAGE_EXPORTS = Object.freeze({
    '.': './src/index.mjs',
    './parser': './src/parser.mjs',
    './project': './src/project.mjs',
    './renderers': './src/renderers.mjs',
    './interaction': './src/interaction.mjs',
    './query': './src/query.mjs',
    './manufacturing': './src/manufacturing.mjs',
    './simulation': './src/simulation.mjs',
    './scene3d': './src/scene3d.mjs',
    './capabilities': './src/capabilities.mjs',
    './extensions': './src/extensions.mjs',
    './testing': './src/testing.mjs',
    './workers/parser.worker.mjs': './src/workers/parser.worker.mjs',
    './styles/renderers.css': './src/styles/renderers.css',
    './extensions/node': './src/legacy-node.mjs',
    './extensions/netlist-query': './src/legacy-netlist-query.mjs',
    './extensions/workers/kicad-parser.worker.mjs':
        './src/workers/kicad-parser.worker.mjs',
    './extensions/styles/kicad-renderers.css':
        './src/styles/kicad-renderers.css'
})
const LEGACY_TARGETS = Object.freeze({
    '.': './src/legacy-index.mjs',
    './parser': './src/legacy-parser.mjs',
    './node': './src/legacy-node.mjs',
    './netlist-query': './src/legacy-netlist-query.mjs',
    './renderers': './src/legacy-renderers.mjs',
    './scene3d': './src/legacy-scene3d.mjs',
    './workers/kicad-parser.worker.mjs':
        './src/workers/kicad-parser.worker.mjs',
    './styles/kicad-renderers.css': './src/styles/kicad-renderers.css'
})
const MAPPING_FIELDS = [
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
]

/**
 * Returns duplicate non-empty values.
 * @param {unknown[]} values Candidate values.
 * @returns {string[]} Sorted duplicate values.
 */
function duplicates(values) {
    const seen = new Set()
    const repeated = new Set()
    for (const value of values.map(String)) {
        if (seen.has(value)) repeated.add(value)
        seen.add(value)
    }
    return [...repeated].filter(Boolean).sort()
}

/**
 * Returns whether a value is a non-empty string.
 * @param {unknown} value Candidate value.
 * @returns {boolean} Whether the string is non-empty.
 */
function isText(value) {
    return typeof value === 'string' && value.trim().length > 0
}

/**
 * Returns whether a value is a non-empty string array.
 * @param {unknown} value Candidate value.
 * @returns {boolean} Whether every entry is a non-empty string.
 */
function isTextArray(value) {
    return Array.isArray(value) && value.length > 0 && value.every(isText)
}

/**
 * Returns whether a mapping row has the exact availability vocabulary.
 * @param {unknown} value Availability map.
 * @returns {boolean} Whether the map is complete.
 */
function isAvailability(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false
    }
    return (
        isDeepStrictEqual(Object.keys(value).sort(), TOOLKITS) &&
        TOOLKITS.every((toolkit) => AVAILABILITY.has(value[toolkit]))
    )
}

/**
 * Returns whether a baseline or ledger mapping is complete.
 * @param {Record<string, any>} row Mapping candidate.
 * @returns {boolean} Whether required mapping fields are valid.
 */
function isCompleteMapping(row) {
    return (
        isText(row?.feature) &&
        FEATURE_KINDS.has(row.kind) &&
        isText(row.capabilityId) &&
        DISPOSITIONS.has(row.disposition) &&
        isText(row.replacement) &&
        isAvailability(row.availability) &&
        isText(row.reason) &&
        isText(row.evidenceToken) &&
        row.sourceContract !== undefined &&
        isTextArray(row.tests) &&
        isTextArray(row.documentation)
    )
}

/**
 * Selects the preservation fields shared by a feature and ledger row.
 * @param {Record<string, any>} row Mapping row.
 * @returns {Record<string, any>} Comparable mapping fields.
 */
function mappingOf(row) {
    return Object.fromEntries(
        MAPPING_FIELDS.map((field) => [field, row[field]])
    )
}

/**
 * Computes the deterministic checksum for one package export map.
 * @param {Record<string, any>} packageExports Package export definitions.
 * @returns {string} SHA-256 checksum.
 */
function packageExportsChecksum(packageExports) {
    return createHash('sha256')
        .update(JSON.stringify(packageExports))
        .digest('hex')
}

/**
 * Resolves one package export definition to its import target.
 * @param {string | Record<string, string>} definition Export definition.
 * @returns {string} Relative target.
 */
function packageExportTarget(definition) {
    if (typeof definition === 'string') return definition
    const target = definition?.import || definition?.default
    return typeof target === 'string' ? target : ''
}

/**
 * Returns a sorted export-to-target inventory for one package export map.
 * @param {Record<string, any>} packageExports Package export definitions.
 * @returns {{ entrypoint: string, target: string }[]} Export inventory.
 */
function packageExportInventory(packageExports) {
    return Object.entries(packageExports)
        .map(([entrypoint, definition]) => ({
            entrypoint,
            target: packageExportTarget(definition)
        }))
        .sort((left, right) => left.entrypoint.localeCompare(right.entrypoint))
}

/**
 * Validates the packed manifest and captured export-map provenance.
 * @param {Record<string, any>} baseline API baseline.
 * @param {string} packageRoot Extracted package root.
 * @returns {Promise<void>}
 */
async function validatePackedManifest(baseline, packageRoot) {
    const packageExports = baseline.packageExports
    if (!packageExports || typeof packageExports !== 'object') {
        throw new Error('Baseline package exports are missing.')
    }
    const baselineChecksum = packageExportsChecksum(packageExports)
    if (baselineChecksum !== baseline.packageExportsChecksum) {
        throw new Error(
            'Baseline package exports checksum differs from captured map.'
        )
    }
    const entrypointInventory = (baseline.entrypoints || [])
        .map(({ entrypoint, target }) => ({ entrypoint, target }))
        .sort((left, right) => left.entrypoint.localeCompare(right.entrypoint))
    const baselineInventory = packageExportInventory(packageExports)
    if (!isDeepStrictEqual(baselineInventory, entrypointInventory)) {
        throw new Error(
            'Baseline package export inventory differs from entrypoints.'
        )
    }

    const packedPackage = JSON.parse(
        await readFile(resolve(packageRoot, 'package.json'), 'utf8')
    )
    if (
        packedPackage.name !== baseline.package ||
        !isConvergedVersion(packedPackage.version, baseline.packageVersion)
    ) {
        throw new Error('Packed package identity differs from baseline.')
    }
    if (!isDeepStrictEqual(packedPackage.exports, CONVERGED_PACKAGE_EXPORTS)) {
        throw new Error('Packed package exports differ from convergence map.')
    }
}

/**
 * Requires one same-major minor-version convergence bump.
 * @param {string} candidate Candidate package version.
 * @param {string} baseline Historical package version.
 * @returns {boolean} Whether the candidate is a valid convergence version.
 */
function isConvergedVersion(candidate, baseline) {
    const current = String(candidate).split('.').map(Number)
    const historical = String(baseline).split('.').map(Number)
    return (
        current.length === 3 &&
        historical.length === 3 &&
        current.every(Number.isSafeInteger) &&
        historical.every(Number.isSafeInteger) &&
        current[0] === historical[0] &&
        (current[1] > historical[1] ||
            (current[1] === historical[1] && current[2] > historical[2]))
    )
}

/**
 * Validates packed API namespaces against the immutable entrypoint snapshot.
 * @param {Record<string, any>} baseline API baseline.
 * @param {Map<string, Record<string, any> | null>} modules Imported modules.
 * @returns {void}
 */
function validatePackedApi(baseline, modules) {
    for (const entrypoint of baseline.entrypoints || []) {
        if (entrypoint.kind === 'asset') {
            const current = modules.get(entrypoint.entrypoint)
            if (
                !isDeepStrictEqual(
                    current?.assetContract,
                    entrypoint.assetContract
                )
            ) {
                throw new Error(
                    `Packed asset contract differs for ${entrypoint.entrypoint}`
                )
            }
            continue
        }
        const module = modules.get(entrypoint.entrypoint)
        if (!module) {
            throw new Error(
                `Packed entrypoint is missing: ${entrypoint.entrypoint}`
            )
        }
        let actual = inspectedEntrypoints.get(module)
        if (!actual) {
            actual = KicadApiContractInspector.entrypoint(
                entrypoint.entrypoint,
                entrypoint.target,
                module,
                moduleDelegates.get(modules)?.get(entrypoint.entrypoint) ||
                    module
            )
            inspectedEntrypoints.set(module, actual)
        }
        const actualNames = actual.exports.map((row) => row.name)
        const expectedNames = entrypoint.exports.map((row) => row.name)
        if (!isDeepStrictEqual(actualNames, expectedNames)) {
            throw new Error(`Packed API differs for ${entrypoint.entrypoint}`)
        }
        for (let index = 0; index < actual.exports.length; index += 1) {
            const expected = entrypoint.exports[index]
            const current = actual.exports[index]
            if (
                !isDeepStrictEqual(current.callables, expected.callables || [])
            ) {
                throw new Error(
                    `Packed callable contract differs for ${entrypoint.entrypoint}#${expected.name}`
                )
            }
            const { callables: currentCallables, ...currentExport } = current
            const { callables: expectedCallables, ...expectedExport } = expected
            if (
                currentCallables === undefined ||
                expectedCallables === undefined ||
                !isDeepStrictEqual(currentExport, expectedExport)
            ) {
                throw new Error(
                    `Packed API differs for ${entrypoint.entrypoint}#${expected.name}`
                )
            }
        }
    }
}

/**
 * Validates complete packed capability and parity inventories.
 * @param {Record<string, any>} baseline API baseline.
 * @param {Map<string, Record<string, any> | null>} modules Imported modules.
 * @returns {Set<string>} Capability ids.
 */
function validatePackedInventories(baseline, modules) {
    const root = modules.get('.')
    if (
        typeof root?.KicadToolkitCapabilities?.inventory !== 'function' ||
        typeof root?.KicadFeatureParity?.inventory !== 'function'
    ) {
        throw new Error(
            'Packed root does not expose complete capability and parity inventories.'
        )
    }
    const capabilityInventory = root.KicadToolkitCapabilities.inventory()
    const parityInventory = root.KicadFeatureParity.inventory()
    if (!isDeepStrictEqual(capabilityInventory, baseline.capabilityInventory)) {
        throw new Error('Packed capability inventory differs from baseline.')
    }
    if (!isDeepStrictEqual(parityInventory, baseline.featureInventory)) {
        throw new Error('Packed parity inventory differs from baseline.')
    }
    const rows = Array.isArray(capabilityInventory?.capabilities)
        ? capabilityInventory.capabilities
        : []
    const ids = rows.map((row) => String(row.id || ''))
    const repeated = duplicates(ids)
    if (repeated.length) {
        throw new Error(
            `Duplicate capability inventory ids: ${repeated.join(', ')}`
        )
    }
    return new Set(ids)
}

/**
 * Validates the packed worker request and response protocol.
 * @param {Record<string, any>} baseline API baseline.
 * @param {string} packageRoot Packed package root.
 * @returns {Promise<void>}
 */
async function validatePackedWorkerProtocol(baseline, packageRoot) {
    if (!baseline.workerProtocol) return
    const entrypoint = (baseline.entrypoints || []).find(
        (row) => row.entrypoint === baseline.workerProtocol.entrypoint
    )
    if (!entrypoint) {
        throw new Error('Worker protocol entrypoint is missing from baseline.')
    }
    const source = await readFile(
        resolve(packageRoot, legacyTarget(entrypoint)),
        'utf8'
    )
    const actual = KicadApiContractInspector.workerProtocol(
        source,
        entrypoint.entrypoint
    )
    if (!isDeepStrictEqual(actual, baseline.workerProtocol)) {
        throw new Error('Packed worker protocol differs from baseline.')
    }
}

/**
 * Validates every strict evidence path and source token.
 * @param {Record<string, any>[]} ledger Preservation ledger.
 * @param {string} repositoryRoot Repository root.
 * @param {boolean} packageValidated Whether packed source contracts were checked.
 * @returns {Promise<void>}
 */
async function validateEvidence(ledger, repositoryRoot, packageValidated) {
    const root = resolve(repositoryRoot)
    const actualRoot = await realpath(root)
    for (const row of ledger) {
        const declaration = KicadFeatureEvidence.verify(row)
        const expectedMode = row.kind === 'behavior' ? 'inventory' : 'packed'
        if (declaration.mode !== expectedMode) {
            throw new Error(`Evidence mode differs for ${row.feature}`)
        }
        const evidencePaths = [...row.tests, ...row.documentation]
        for (const relativePath of evidencePaths) {
            await confinedEvidencePath(root, actualRoot, relativePath)
        }
        if (!packageValidated) {
            throw new Error(
                `Packed contract validation is required for ${row.feature}`
            )
        }
    }
}

/**
 * Binds every behavior row to its exact captured capability or parity record.
 * @param {Record<string, any>} baseline API baseline.
 * @param {Record<string, any>[]} ledger Preservation ledger.
 * @returns {void}
 */
function validateBehaviorEvidence(baseline, ledger) {
    const capabilities = new Map(
        (baseline.capabilityInventory?.capabilities || []).map((row) => [
            `capability#${row.id}`,
            row
        ])
    )
    const parity = new Map(
        (baseline.featureInventory?.features || []).map((row) => [
            `parity#${row.id}`,
            row
        ])
    )
    const expected = new Map([...capabilities, ...parity])
    const behaviors = ledger.filter((row) => row.kind === 'behavior')
    if (
        !isDeepStrictEqual(
            behaviors.map((row) => row.feature).sort(),
            [...expected.keys()].sort()
        )
    ) {
        throw new Error('Behavior evidence inventory differs from baseline.')
    }
    for (const row of behaviors) {
        if (!isDeepStrictEqual(row.sourceContract, expected.get(row.feature))) {
            throw new Error(`Behavior evidence differs for ${row.feature}`)
        }
    }
}

/**
 * Resolves one evidence path without allowing lexical or symlink escapes.
 * @param {string} root Lexical repository root.
 * @param {string} actualRoot Canonical repository root.
 * @param {string} evidencePath Repository-relative evidence path.
 * @returns {Promise<string>} Canonical evidence file path.
 */
async function confinedEvidencePath(root, actualRoot, evidencePath) {
    const pathWithoutAnchor = evidencePath.split('#')[0]
    if (!pathWithoutAnchor || isAbsolute(pathWithoutAnchor)) {
        throw new Error(`Evidence path escapes repository: ${evidencePath}`)
    }
    const lexicalPath = resolve(root, pathWithoutAnchor)
    const lexicalRelative = relativePath(root, lexicalPath)
    if (
        lexicalRelative === '..' ||
        lexicalRelative.startsWith(
            `..${process.platform === 'win32' ? '\\' : '/'}`
        ) ||
        isAbsolute(lexicalRelative)
    ) {
        throw new Error(`Evidence path escapes repository: ${evidencePath}`)
    }
    await access(lexicalPath).catch(() => {
        throw new Error(`Missing evidence path: ${evidencePath}`)
    })
    const actualPath = await realpath(lexicalPath)
    const actualRelative = relativePath(actualRoot, actualPath)
    if (
        actualRelative === '..' ||
        actualRelative.startsWith(
            `..${process.platform === 'win32' ? '\\' : '/'}`
        ) ||
        isAbsolute(actualRelative)
    ) {
        throw new Error(`Evidence path escapes repository: ${evidencePath}`)
    }
    return actualPath
}

/**
 * Imports the JavaScript entrypoints from one package root.
 * @param {Record<string, any>} baseline API baseline.
 * @param {string} packageRoot Extracted package root.
 * @returns {Promise<Map<string, Record<string, any> | null>>} Module namespaces.
 */
async function importEntrypoints(baseline, packageRoot) {
    const modules = new Map()
    const delegates = new Map()
    const packageUrl = pathToFileURL(`${resolve(packageRoot)}/`)
    for (const entrypoint of baseline.entrypoints || []) {
        const target = legacyTarget(entrypoint)
        if (entrypoint.kind === 'asset') {
            const source = await readFile(resolve(packageRoot, target), 'utf8')
            modules.set(entrypoint.entrypoint, {
                assetContract: KicadApiContractInspector.stylesheet(source)
            })
            continue
        }
        const key = `${resolve(packageRoot)}:${entrypoint.entrypoint}`
        let cached = packedJavascript.get(key)
        if (!cached) {
            const url = pathToFileURL(resolve(packageRoot, target))
            cached = {
                imported: await import(url.href),
                delegates: await KicadModuleContractRegistry.load(
                    target,
                    packageUrl
                )
            }
            packedJavascript.set(key, cached)
        }
        const expectedNames = new Set(
            (entrypoint.exports || []).map((row) => row.name)
        )
        cached.module ||= Object.fromEntries(
            Object.entries(cached.imported).filter(([name]) =>
                expectedNames.has(name)
            )
        )
        modules.set(entrypoint.entrypoint, cached.module)
        delegates.set(entrypoint.entrypoint, cached.delegates)
    }
    moduleDelegates.set(modules, delegates)
    return modules
}

/**
 * Resolves a historical entrypoint to its explicit native compatibility file.
 * @param {Record<string, any>} entrypoint Historical entrypoint row.
 * @returns {string} Packed compatibility target.
 */
function legacyTarget(entrypoint) {
    return LEGACY_TARGETS[entrypoint.entrypoint] || entrypoint.target
}

/**
 * Packs and extracts the current repository for strict entrypoint checks.
 * @param {string} repositoryRoot Repository root.
 * @returns {Promise<{ packageRoot: string, cleanup: () => Promise<void> }>} Packed fixture.
 */
async function packRepository(repositoryRoot) {
    const directory = await mkdtemp(join(tmpdir(), 'kicad-toolkit-pack-'))
    try {
        const manifest = JSON.parse(
            await readFile(resolve(repositoryRoot, 'package.json'), 'utf8')
        )
        const { stdout } = await execFileAsync(
            'npm',
            ['pack', '--json', '--pack-destination', directory],
            { cwd: repositoryRoot, maxBuffer: 16 * 1024 * 1024 }
        )
        const report = JSON.parse(stdout)
        const tarball = resolve(directory, report[0].filename)
        await writeFile(
            resolve(directory, 'package.json'),
            JSON.stringify({ private: true })
        )
        const dependencies = await packLinkedDependencies(
            repositoryRoot,
            directory,
            manifest
        )
        if (dependencies.length) {
            await execFileAsync(
                'npm',
                [
                    'install',
                    '--ignore-scripts',
                    '--no-audit',
                    '--no-fund',
                    '--package-lock=false',
                    ...dependencies
                ],
                { cwd: directory, maxBuffer: 16 * 1024 * 1024 }
            )
        }
        await execFileAsync(
            'npm',
            [
                'install',
                '--ignore-scripts',
                '--no-audit',
                '--no-fund',
                '--package-lock=false',
                tarball
            ],
            { cwd: directory, maxBuffer: 16 * 1024 * 1024 }
        )
        const packageRoot = resolve(directory, 'node_modules', manifest.name)
        return {
            packageRoot,
            cleanup: () => rm(directory, { force: true, recursive: true })
        }
    } catch (error) {
        await rm(directory, { force: true, recursive: true })
        throw error
    }
}

/**
 * Packs linked sibling release candidates before their consuming package.
 * @param {string} repositoryRoot Repository root.
 * @param {string} destination Pack destination.
 * @param {Record<string, any>} manifest Package manifest.
 * @returns {Promise<string[]>} Local dependency tarballs.
 */
async function packLinkedDependencies(repositoryRoot, destination, manifest) {
    const tarballs = []
    for (const name of Object.keys(manifest.dependencies || {}).sort()) {
        const packageRoot = resolve(repositoryRoot, 'node_modules', name)
        let statistics
        try {
            statistics = await lstat(packageRoot)
        } catch (error) {
            if (error?.code === 'ENOENT') continue
            throw error
        }
        if (!statistics.isSymbolicLink()) continue
        const { stdout } = await execFileAsync(
            'npm',
            ['pack', '--json', '--pack-destination', destination],
            { cwd: packageRoot, maxBuffer: 16 * 1024 * 1024 }
        )
        const filename = JSON.parse(stdout)?.[0]?.filename
        if (typeof filename !== 'string' || !filename) {
            throw new Error(
                `npm pack did not report a tarball for dependency ${name}.`
            )
        }
        tarballs.push(resolve(destination, filename))
    }
    return tarballs
}

/**
 * Validates exact baseline-to-ledger preservation coverage.
 * @param {{ apiBaseline: Record<string, any>, ledger: Record<string, any>[], strict?: boolean, capabilityIds?: Set<string>, packageRoot?: string, repositoryRoot?: string }} options Validation inputs.
 * @returns {Promise<{ featureCount: number }>} Validation summary.
 */
export async function validateFeaturePreservation(options) {
    const baselineFeatures = Array.isArray(options.apiBaseline?.features)
        ? options.apiBaseline.features
        : []
    const ledger = Array.isArray(options.ledger) ? options.ledger : []
    const duplicateBaseline = duplicates(
        baselineFeatures.map((row) => row.feature)
    )
    if (duplicateBaseline.length) {
        throw new Error(
            `Duplicate baseline features: ${duplicateBaseline.join(', ')}`
        )
    }
    const duplicateLedger = duplicates(ledger.map((row) => row.feature))
    if (duplicateLedger.length) {
        throw new Error(
            `Duplicate ledger features: ${duplicateLedger.join(', ')}`
        )
    }

    const baselineNames = new Set(baselineFeatures.map((row) => row.feature))
    const ledgerNames = new Set(ledger.map((row) => row.feature))
    const missing = [...baselineNames].filter((name) => !ledgerNames.has(name))
    if (missing.length) {
        throw new Error(
            `Missing feature-preservation mappings: ${missing.join(', ')}`
        )
    }
    const stale = [...ledgerNames].filter((name) => !baselineNames.has(name))
    if (stale.length) {
        throw new Error(
            `Stale feature-preservation mappings: ${stale.join(', ')}`
        )
    }
    const invalidFeature = baselineFeatures.find(
        (row) => !isCompleteMapping(row)
    )
    if (invalidFeature) {
        throw new Error(
            `Invalid API baseline feature: ${invalidFeature.feature}`
        )
    }
    const invalidRow = ledger.find(
        (row) => !isText(row.package) || !isCompleteMapping(row)
    )
    if (invalidRow) {
        throw new Error(
            `Invalid feature-preservation row: ${invalidRow.feature}`
        )
    }
    const ledgerByFeature = new Map(ledger.map((row) => [row.feature, row]))
    const mismatch = baselineFeatures.find(
        (feature) =>
            !isDeepStrictEqual(
                mappingOf(feature),
                mappingOf(ledgerByFeature.get(feature.feature))
            )
    )
    if (mismatch) {
        throw new Error(
            `Baseline and ledger mapping differ for ${mismatch.feature}`
        )
    }
    const expectedPackage = `${options.apiBaseline.package}@${options.apiBaseline.packageVersion}`
    const wrongPackage = ledger.find((row) => row.package !== expectedPackage)
    if (wrongPackage) {
        throw new Error(`Ledger package differs for ${wrongPackage.feature}`)
    }

    if (options.strict) {
        if (options.packageRoot) {
            await validatePackedManifest(
                options.apiBaseline,
                options.packageRoot
            )
        }
        const modules = options.packageRoot
            ? await importEntrypoints(options.apiBaseline, options.packageRoot)
            : null
        if (modules) validatePackedApi(options.apiBaseline, modules)
        if (options.packageRoot) {
            await validatePackedWorkerProtocol(
                options.apiBaseline,
                options.packageRoot
            )
        }
        const inventoryIds =
            modules?.has('.') && options.apiBaseline.capabilityInventory
                ? validatePackedInventories(options.apiBaseline, modules)
                : null
        const capabilityIds = options.capabilityIds || inventoryIds
        if (!capabilityIds) {
            throw new Error('Strict validation requires live capability ids.')
        }
        const fictitious = [
            ...new Set(
                ledger
                    .map((row) => row.capabilityId)
                    .filter((id) => !capabilityIds.has(id))
            )
        ].sort()
        if (fictitious.length) {
            throw new Error(
                `Fictitious capabilityId mappings: ${fictitious.join(', ')}`
            )
        }
        validateBehaviorEvidence(options.apiBaseline, ledger)
        KicadApprovedBaselineProvenance.assert(options.apiBaseline, ledger)
        if (options.repositoryRoot) {
            await validateEvidence(
                ledger,
                options.repositoryRoot,
                Boolean(options.packageRoot)
            )
        }
    }
    return { featureCount: baselineFeatures.length }
}

/**
 * Loads baseline files and performs preservation validation.
 * @param {{ apiPath?: string, ledgerPath?: string, strict?: boolean, packageRoot?: string, repositoryRoot?: string }} [options] File-backed options.
 * @returns {Promise<{ featureCount: number }>} Validation summary.
 */
export async function checkFeaturePreservation(options = {}) {
    const repositoryRoot = resolve(options.repositoryRoot || process.cwd())
    const [apiBaseline, ledger] = await Promise.all([
        readFile(
            resolve(
                repositoryRoot,
                options.apiPath || 'spec/api-baseline-v1.0.29.json'
            ),
            'utf8'
        ).then(JSON.parse),
        readFile(
            resolve(
                repositoryRoot,
                options.ledgerPath || 'spec/feature-preservation.json'
            ),
            'utf8'
        ).then(JSON.parse)
    ])
    const packed =
        options.strict && !options.packageRoot
            ? await packRepository(repositoryRoot)
            : null
    try {
        return await validateFeaturePreservation({
            apiBaseline,
            ledger,
            strict: options.strict,
            packageRoot: options.packageRoot || packed?.packageRoot,
            repositoryRoot
        })
    } finally {
        await packed?.cleanup()
    }
}

/**
 * Returns the value after one command-line flag.
 * @param {string[]} args Command arguments.
 * @param {string} flag Flag name.
 * @returns {string | undefined} Flag value.
 */
function flagValue(args, flag) {
    const index = args.indexOf(flag)
    return index < 0 ? undefined : args[index + 1]
}

/**
 * Returns whether this module is the active script.
 * @returns {boolean} Whether the module is the entry script.
 */
function isMain() {
    return Boolean(
        process.argv[1] &&
        basename(process.argv[1]) === 'check-feature-preservation.mjs'
    )
}

if (isMain()) {
    const args = process.argv.slice(2)
    const result = await checkFeaturePreservation({
        apiPath: flagValue(args, '--api'),
        ledgerPath: flagValue(args, '--ledger'),
        packageRoot: flagValue(args, '--package-root'),
        repositoryRoot: flagValue(args, '--repository-root'),
        strict: args.includes('--strict')
    })
    process.stdout.write(
        `Validated ${result.featureCount} feature-preservation mappings.\n`
    )
}
