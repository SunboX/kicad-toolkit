// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual, promisify } from 'node:util'

import { KicadApiContractInspector } from './KicadApiContractInspector.mjs'

const execFileAsync = promisify(execFile)
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
 * Validates packed API namespaces against the immutable entrypoint snapshot.
 * @param {Record<string, any>} baseline API baseline.
 * @param {Map<string, Record<string, any> | null>} modules Imported modules.
 * @returns {void}
 */
function validatePackedApi(baseline, modules) {
    for (const entrypoint of baseline.entrypoints || []) {
        if (entrypoint.kind === 'asset') continue
        const module = modules.get(entrypoint.entrypoint)
        if (!module) {
            throw new Error(
                `Packed entrypoint is missing: ${entrypoint.entrypoint}`
            )
        }
        const actual = KicadApiContractInspector.entrypoint(
            entrypoint.entrypoint,
            entrypoint.target,
            module
        )
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
        resolve(packageRoot, entrypoint.target),
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
 * @returns {Promise<void>}
 */
async function validateEvidence(ledger, repositoryRoot) {
    const cache = new Map()
    for (const row of ledger) {
        const evidencePaths = [...row.tests, ...row.documentation]
        for (const relativePath of evidencePaths) {
            const path = resolve(repositoryRoot, relativePath.split('#')[0])
            await access(path).catch(() => {
                throw new Error(`Missing evidence path: ${relativePath}`)
            })
        }
        const references = await Promise.all(
            evidencePaths.map(async (relativePath) => {
                const path = resolve(repositoryRoot, relativePath.split('#')[0])
                if (!cache.has(path))
                    cache.set(path, await readFile(path, 'utf8'))
                return cache.get(path).includes(row.evidenceToken)
            })
        )
        if (!references.some(Boolean)) {
            throw new Error(
                `Evidence tests do not reference ${row.evidenceToken} for ${row.feature}`
            )
        }
    }
}

/**
 * Imports the JavaScript entrypoints from one package root.
 * @param {Record<string, any>} baseline API baseline.
 * @param {string} packageRoot Extracted package root.
 * @returns {Promise<Map<string, Record<string, any> | null>>} Module namespaces.
 */
async function importEntrypoints(baseline, packageRoot) {
    const modules = new Map()
    for (const entrypoint of baseline.entrypoints || []) {
        if (entrypoint.kind === 'asset') {
            await access(resolve(packageRoot, entrypoint.target))
            modules.set(entrypoint.entrypoint, null)
            continue
        }
        const url = pathToFileURL(resolve(packageRoot, entrypoint.target))
        modules.set(entrypoint.entrypoint, await import(url.href))
    }
    return modules
}

/**
 * Packs and extracts the current repository for strict entrypoint checks.
 * @param {string} repositoryRoot Repository root.
 * @returns {Promise<{ packageRoot: string, cleanup: () => Promise<void> }>} Packed fixture.
 */
async function packRepository(repositoryRoot) {
    const directory = await mkdtemp(join(tmpdir(), 'kicad-toolkit-pack-'))
    try {
        const { stdout } = await execFileAsync(
            'npm',
            ['pack', '--json', '--pack-destination', directory],
            { cwd: repositoryRoot, maxBuffer: 16 * 1024 * 1024 }
        )
        const report = JSON.parse(stdout)
        const tarball = resolve(directory, report[0].filename)
        await execFileAsync('tar', ['-xzf', tarball, '-C', directory])
        const packageRoot = resolve(directory, 'package')
        await execFileAsync(
            'npm',
            [
                'install',
                '--ignore-scripts',
                '--omit=dev',
                '--no-audit',
                '--no-fund'
            ],
            { cwd: packageRoot, maxBuffer: 16 * 1024 * 1024 }
        )
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
        if (options.repositoryRoot) {
            await validateEvidence(ledger, options.repositoryRoot)
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
