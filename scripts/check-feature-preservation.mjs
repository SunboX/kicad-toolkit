// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual, promisify } from 'node:util'

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
 * Produces the bounded public value contract used by API capture.
 * @param {unknown} value Public value.
 * @returns {Record<string, any>} Value contract.
 */
function valueContract(value) {
    if (
        value === null ||
        ['boolean', 'number', 'string', 'undefined'].includes(typeof value)
    ) {
        return { type: typeof value, value: value === undefined ? null : value }
    }
    if (Array.isArray(value)) return { type: 'array', length: value.length }
    return {
        type: typeof value,
        keys:
            value && typeof value === 'object' ? Object.keys(value).sort() : []
    }
}

/**
 * Captures accessor descriptors without invoking them.
 * @param {object | Function | undefined} owner Property owner.
 * @param {string[]} ignored Ignored property names.
 * @returns {{ name: string, get: boolean, set: boolean }[]} Accessor rows.
 */
function accessorRows(owner, ignored) {
    return Object.entries(Object.getOwnPropertyDescriptors(owner || {}))
        .filter(
            ([name, descriptor]) =>
                !ignored.includes(name) &&
                (typeof descriptor.get === 'function' ||
                    typeof descriptor.set === 'function')
        )
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, descriptor]) => ({
            name,
            get: typeof descriptor.get === 'function',
            set: typeof descriptor.set === 'function'
        }))
}

/**
 * Captures public static data-property contracts.
 * @param {Function} value Exported function or class.
 * @returns {{ name: string, value: Record<string, any> }[]} Static properties.
 */
function staticPropertyRows(value) {
    return Object.entries(Object.getOwnPropertyDescriptors(value))
        .filter(
            ([name, descriptor]) =>
                !['length', 'name', 'prototype'].includes(name) &&
                Object.hasOwn(descriptor, 'value') &&
                typeof descriptor.value !== 'function'
        )
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, descriptor]) => ({
            name,
            value: valueContract(descriptor.value)
        }))
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
        const actualNames = Object.keys(module).sort()
        const expectedNames = entrypoint.exports.map((row) => row.name).sort()
        if (!isDeepStrictEqual(actualNames, expectedNames)) {
            throw new Error(`Packed API differs for ${entrypoint.entrypoint}`)
        }
        const expectedByName = new Map(
            entrypoint.exports.map((row) => [row.name, row])
        )
        for (const name of actualNames) {
            const expected = expectedByName.get(name)
            const value = module[name]
            if (typeof value !== expected.type) {
                throw new Error(
                    `Packed export type differs for ${entrypoint.entrypoint}#${name}`
                )
            }
            if (
                !isDeepStrictEqual(valueContract(value), expected.valueContract)
            ) {
                throw new Error(
                    `Packed export value differs for ${entrypoint.entrypoint}#${name}`
                )
            }
            if (typeof value !== 'function') continue
            const staticMethods = Object.getOwnPropertyNames(value)
                .filter(
                    (member) =>
                        !['length', 'name', 'prototype'].includes(member) &&
                        typeof Object.getOwnPropertyDescriptor(value, member)
                            ?.value === 'function'
                )
                .sort()
            const instanceMethods = Object.getOwnPropertyNames(
                value.prototype || {}
            )
                .filter(
                    (member) =>
                        member !== 'constructor' &&
                        typeof Object.getOwnPropertyDescriptor(
                            value.prototype,
                            member
                        )?.value === 'function'
                )
                .sort()
            const staticAccessors = accessorRows(value, [
                'length',
                'name',
                'prototype'
            ])
            const instanceAccessors = accessorRows(value.prototype, [
                'constructor'
            ])
            const staticProperties = staticPropertyRows(value)
            const callableArity = expected.callables
                .filter((callable) =>
                    ['constructor', 'function'].includes(callable.methodType)
                )
                .map((callable) => callable.arity)
            if (
                !isDeepStrictEqual(staticMethods, expected.staticMethods) ||
                !isDeepStrictEqual(instanceMethods, expected.instanceMethods) ||
                !isDeepStrictEqual(
                    staticAccessors,
                    expected.staticAccessors || []
                ) ||
                !isDeepStrictEqual(
                    instanceAccessors,
                    expected.instanceAccessors || []
                ) ||
                !isDeepStrictEqual(
                    staticProperties,
                    expected.staticProperties || []
                ) ||
                (callableArity.length > 0 &&
                    !callableArity.every((arity) => arity === value.length))
            ) {
                throw new Error(
                    `Packed callable API differs for ${entrypoint.entrypoint}#${name}`
                )
            }
        }
    }
}

/**
 * Reads live capability ids from a packed root namespace.
 * @param {Map<string, Record<string, any> | null>} modules Imported modules.
 * @returns {Set<string>} Capability ids.
 */
function packedCapabilityIds(modules) {
    const root = modules.get('.')
    if (typeof root?.KicadToolkitCapabilities?.inventory !== 'function') {
        throw new Error(
            'Packed root does not expose KicadToolkitCapabilities.inventory().'
        )
    }
    const inventory = root.KicadToolkitCapabilities.inventory()
    const rows = Array.isArray(inventory?.capabilities)
        ? inventory.capabilities
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
        const capabilityIds =
            options.capabilityIds ||
            (modules ? packedCapabilityIds(modules) : null)
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
