// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { isDeepStrictEqual, promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repositoryRoot = new URL('../', import.meta.url)
const BASE_VERSION = '1.0.29'
const BASE_GIT_REF = 'c71c88d69d236accce123656dfa66914c0d5489c'
const TOOLKITS = [
    'altium-toolkit',
    'circuitjson-toolkit',
    'gerber-toolkit',
    'kicad-toolkit'
]
const SHARED_CAPABILITIES = new Set([
    'bom_table_renderer',
    'circuit_json_adapter',
    'geometry_helpers',
    'kicad_report_normalization',
    'layer_metadata',
    'net_resolution',
    'pcb_layer_svg_exports',
    'pcb_scene3d_description',
    'pcb_svg_renderer',
    'project_netlist_exporter',
    'project_zip_loader',
    'renderer_helper_api',
    'schematic_svg_renderer',
    'semantic_svg_metadata'
])
const IGNORED_FUNCTION_MEMBERS = new Set(['length', 'name', 'prototype'])
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
 * @returns {Promise<Record<string, any>>} Parsed JSON.
 */
async function readJson(relativePath) {
    return JSON.parse(
        await readFile(new URL(relativePath, repositoryRoot), 'utf8')
    )
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
        if (!isDeepStrictEqual(current, value)) {
            throw new Error(`Immutable baseline differs: ${relativePath}`)
        }
        return
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error
    }
    await mkdir(new URL('./', url), { recursive: true })
    await writeFile(url, JSON.stringify(value, null, 4) + '\n')
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
 * Lists public static methods on one exported function.
 * @param {unknown} value Exported value.
 * @returns {string[]} Sorted method names.
 */
function staticMethods(value) {
    if (typeof value !== 'function') return []
    const descriptors = Object.getOwnPropertyDescriptors(value)
    return Object.keys(descriptors)
        .filter(
            (name) =>
                !IGNORED_FUNCTION_MEMBERS.has(name) &&
                typeof descriptors[name].value === 'function'
        )
        .sort()
}

/**
 * Lists public instance methods on one exported function.
 * @param {unknown} value Exported value.
 * @returns {string[]} Sorted method names.
 */
function instanceMethods(value) {
    if (typeof value !== 'function' || !value.prototype) return []
    const descriptors = Object.getOwnPropertyDescriptors(value.prototype)
    return Object.keys(descriptors)
        .filter(
            (name) =>
                name !== 'constructor' &&
                typeof descriptors[name].value === 'function'
        )
        .sort()
}

/**
 * Lists public accessor properties without invoking them.
 * @param {unknown} value Exported value.
 * @param {'static' | 'instance'} accessorType Accessor owner.
 * @returns {{ name: string, get: boolean, set: boolean }[]} Accessor contracts.
 */
function accessors(value, accessorType) {
    if (typeof value !== 'function') return []
    const owner = accessorType === 'static' ? value : value.prototype
    if (!owner) return []
    const descriptors = Object.getOwnPropertyDescriptors(owner)
    return Object.keys(descriptors)
        .filter(
            (name) =>
                !IGNORED_FUNCTION_MEMBERS.has(name) &&
                name !== 'constructor' &&
                (typeof descriptors[name].get === 'function' ||
                    typeof descriptors[name].set === 'function')
        )
        .sort()
        .map((name) => ({
            name,
            get: typeof descriptors[name].get === 'function',
            set: typeof descriptors[name].set === 'function'
        }))
}

/**
 * Returns whether an exported function is an ECMAScript class.
 * @param {unknown} value Exported value.
 * @returns {boolean} Whether the value is class syntax.
 */
function isClass(value) {
    return (
        typeof value === 'function' &&
        Function.prototype.toString.call(value).startsWith('class ')
    )
}

/**
 * Captures public static data properties without invoking accessors.
 * @param {unknown} value Exported value.
 * @returns {{ name: string, value: Record<string, any> }[]} Static properties.
 */
function staticProperties(value) {
    if (typeof value !== 'function') return []
    return Object.entries(Object.getOwnPropertyDescriptors(value))
        .filter(
            ([name, descriptor]) =>
                !IGNORED_FUNCTION_MEMBERS.has(name) &&
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
 * Produces a bounded clone-safe contract for one exported data value.
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
    if (Array.isArray(value)) {
        return { type: 'array', length: value.length }
    }
    return {
        type: typeof value,
        keys:
            value && typeof value === 'object' ? Object.keys(value).sort() : []
    }
}

/**
 * Splits a JavaScript parameter list at top-level commas.
 * @param {string} source Parameter source.
 * @returns {string[]} Parameter declarations.
 */
function splitParameters(source) {
    const parameters = []
    let start = 0
    let depth = 0
    let quote = ''
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index]
        if (quote) {
            if (character === '\\') index += 1
            else if (character === quote) quote = ''
            continue
        }
        if (`'\"\``.includes(character)) {
            quote = character
            continue
        }
        if ('([{'.includes(character)) depth += 1
        else if (')]}'.includes(character)) depth -= 1
        else if (character === ',' && depth === 0) {
            parameters.push(source.slice(start, index).trim())
            start = index + 1
        }
    }
    const finalParameter = source.slice(start).trim()
    if (finalParameter) parameters.push(finalParameter)
    return parameters
}

/**
 * Finds the closing parenthesis matching one opening parenthesis.
 * @param {string} source Function source.
 * @param {number} opening Opening-parenthesis index.
 * @returns {number} Closing index or -1.
 */
function closingParenthesis(source, opening) {
    let depth = 0
    let quote = ''
    for (let index = opening; index < source.length; index += 1) {
        const character = source[index]
        if (quote) {
            if (character === '\\') index += 1
            else if (character === quote) quote = ''
            continue
        }
        if (`'\"\``.includes(character)) quote = character
        else if (character === '(') depth += 1
        else if (character === ')' && --depth === 0) return index
    }
    return -1
}

/**
 * Extracts option-property reads from callable source.
 * @param {string} source Callable source.
 * @returns {string[]} Sorted option names.
 */
function optionNames(source) {
    return [
        ...new Set(
            Array.from(
                source.matchAll(
                    /\b(?:args|config|options|request)\s*(?:\?\.)?\.\s*([A-Za-z_$][\w$]*)/gu
                ),
                (match) => match[1]
            )
        )
    ].sort()
}

/**
 * Extracts direct object-return field names from callable source.
 * @param {string} source Callable source.
 * @returns {string[]} Sorted field names.
 */
function resultFields(source) {
    const fields = new Set()
    for (const match of source.matchAll(/\breturn\s*\{([^{}]*)\}/gu)) {
        for (const field of match[1].matchAll(
            /(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?=:|,|$)/gu
        )) {
            fields.add(field[1])
        }
    }
    return [...fields].sort()
}

/**
 * Captures one public callable contract from runtime source.
 * @param {Function} callable Public callable.
 * @param {'constructor' | 'function' | 'static' | 'instance'} methodType Method type.
 * @returns {Record<string, any>} Source-derived callable contract.
 */
function callableContract(callable, methodType) {
    const source = Function.prototype.toString.call(callable)
    const opening = source.indexOf('(')
    const closing = opening < 0 ? -1 : closingParenthesis(source, opening)
    const parameterSource =
        opening >= 0 && closing > opening
            ? source.slice(opening + 1, closing)
            : ''
    const parameters = splitParameters(parameterSource)
    return {
        type: 'method',
        methodType,
        signature:
            opening >= 0 && closing > opening
                ? source
                      .slice(0, closing + 1)
                      .replace(/\s+/gu, ' ')
                      .trim()
                : source.split('{')[0].trim(),
        arity: callable.length,
        parameters,
        options: optionNames(source),
        resultFields: resultFields(source)
    }
}

/**
 * Captures one class constructor signature without evaluating the class.
 * @param {Function} value Exported class.
 * @returns {Record<string, any>} Constructor contract.
 */
function constructorContract(value) {
    const source = Function.prototype.toString.call(value)
    const marker = source.indexOf('constructor')
    const opening = marker < 0 ? -1 : source.indexOf('(', marker)
    const closing = opening < 0 ? -1 : closingParenthesis(source, opening)
    const parameters =
        opening >= 0 && closing > opening
            ? splitParameters(source.slice(opening + 1, closing))
            : []
    return {
        type: 'method',
        methodType: 'constructor',
        signature:
            opening >= 0 && closing > opening
                ? source
                      .slice(marker, closing + 1)
                      .replace(/\s+/gu, ' ')
                      .trim()
                : 'constructor()',
        arity: value.length,
        parameters,
        options: [],
        resultFields: []
    }
}

/**
 * Captures one JavaScript entrypoint namespace.
 * @param {string} entrypoint Package export key.
 * @param {string} target Relative module target.
 * @returns {Promise<Record<string, any>>} Entrypoint snapshot.
 */
async function captureEntrypoint(entrypoint, target) {
    if (target.endsWith('.css')) {
        await readFile(new URL(target, repositoryRoot), 'utf8')
        return { entrypoint, target, kind: 'asset', exports: [] }
    }
    const api = await import(new URL(target, repositoryRoot))
    const exports = Object.keys(api)
        .sort()
        .map((name) => {
            const value = api[name]
            const staticNames = staticMethods(value)
            const instanceNames = instanceMethods(value)
            const staticDescriptors = Object.getOwnPropertyDescriptors(value)
            const instanceDescriptors = Object.getOwnPropertyDescriptors(
                value.prototype || {}
            )
            const classValue = isClass(value)
            return {
                name,
                type: typeof value,
                valueContract: valueContract(value),
                staticMethods: staticNames,
                instanceMethods: instanceNames,
                staticAccessors: accessors(value, 'static'),
                instanceAccessors: accessors(value, 'instance'),
                staticProperties: staticProperties(value),
                callables: [
                    ...(typeof value === 'function' && !classValue
                        ? [
                              {
                                  name: '',
                                  ...callableContract(value, 'function')
                              }
                          ]
                        : []),
                    ...(classValue
                        ? [
                              {
                                  name: 'constructor',
                                  ...constructorContract(value)
                              }
                          ]
                        : []),
                    ...staticNames.map((method) => ({
                        name: method,
                        ...callableContract(
                            staticDescriptors[method].value,
                            'static'
                        )
                    })),
                    ...instanceNames.map((method) => ({
                        name: method,
                        ...callableContract(
                            instanceDescriptors[method].value,
                            'instance'
                        )
                    }))
                ]
            }
        })
    return { entrypoint, target, kind: 'module', exports }
}

/**
 * Recursively reads repository test files.
 * @param {URL} directory Test directory.
 * @param {string} relativeDirectory Relative directory.
 * @returns {Promise<{ path: string, source: string, cases: string[] }[]>} Test sources.
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
        tests.push({ path, source, cases })
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
        .filter((test) => test.source.includes(token))
        .map((test) => test.path)
}

/**
 * Converts a symbol-like name to lower snake case.
 * @param {string} value Symbol name.
 * @returns {string} Snake-case name.
 */
function snakeCase(value) {
    return String(value)
        .replace(/([a-z\d])([A-Z])/gu, '$1_$2')
        .replace(/[^A-Za-z\d]+/gu, '_')
        .replace(/^_|_$/gu, '')
        .toLowerCase()
}

/**
 * Resolves the closest current capability id for one symbol or feature id.
 * @param {string} value Symbol or feature name.
 * @param {string[]} capabilityIds Current capability ids.
 * @param {string} [entrypoint] Owning entrypoint.
 * @returns {string} Current capability id.
 */
function capabilityFor(value, capabilityIds, entrypoint = '') {
    if (entrypoint.includes('scene3d')) return 'pcb_scene3d_description'
    if (entrypoint.includes('netlist-query')) return 'project_netlist_exporter'
    if (entrypoint.includes('styles')) return 'renderer_helper_api'
    if (entrypoint.includes('workers')) return 'kicad_pcb_parser'
    const normalized = snakeCase(value)
    const candidates = [
        normalized,
        normalized.replace(/^kicad_/u, ''),
        normalized.replace(
            /_(adapter|builder|model|resolver|service|utils)$/u,
            ''
        ),
        normalized
            .replace(/^kicad_/u, '')
            .replace(/_(adapter|builder|model|resolver|service|utils)$/u, '')
    ]
    for (const candidate of candidates) {
        if (capabilityIds.includes(candidate)) return candidate
    }
    const tokens = new Set(normalized.split('_'))
    let best = 'circuit_json_adapter'
    let bestScore = -Infinity
    for (const capabilityId of capabilityIds) {
        const capabilityTokens = capabilityId.split('_')
        const shared = capabilityTokens.filter((token) => tokens.has(token))
        const score =
            shared.length * 8 - Math.abs(capabilityTokens.length - tokens.size)
        if (score > bestScore) {
            best = capabilityId
            bestScore = score
        }
    }
    return best
}

/**
 * Creates a future-preservation decision for one current feature.
 * @param {string} capabilityId Current capability id.
 * @param {string} owner Public owner name.
 * @returns {Record<string, any>} Mapping fields.
 */
function preservation(capabilityId, owner) {
    const shared = SHARED_CAPABILITIES.has(capabilityId)
    return {
        disposition: shared ? 'shared' : 'native-extension',
        replacement: shared
            ? `Canonical ${capabilityId.replaceAll('_', ' ')} service`
            : `kicad-toolkit/extensions#${owner}`,
        availability: Object.fromEntries(
            TOOLKITS.map((toolkit) => [
                toolkit,
                shared
                    ? toolkit === 'circuitjson-toolkit'
                        ? 'shared'
                        : 'derived'
                    : toolkit === 'kicad-toolkit'
                      ? 'native'
                      : 'unavailable'
            ])
        ),
        reason: shared
            ? 'The capability converges on the common CircuitJSON contract while KiCad derives source-specific values.'
            : 'The capability preserves source-native KiCad syntax or fidelity behind an explicit extension.'
    }
}

/**
 * Creates one complete baseline feature row.
 * @param {Record<string, any>} fields Feature fields.
 * @param {{ path: string, source: string }[]} tests Test sources.
 * @param {string[]} capabilityIds Current capability ids.
 * @returns {Record<string, any>} Mapped feature.
 */
function featureRow(fields, tests, capabilityIds) {
    const capabilityId =
        fields.capabilityId ||
        capabilityFor(fields.owner, capabilityIds, fields.entrypoint)
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
    return {
        feature: fields.feature,
        kind: fields.kind,
        capabilityId,
        ...preservation(capabilityId, fields.owner),
        evidenceToken: fields.evidenceToken,
        sourceContract: fields.sourceContract || null,
        tests: [...new Set(testPaths)].sort(),
        documentation: [
            ...new Set(fields.documentation || ['docs/api.md'])
        ].sort()
    }
}

/**
 * Flattens runtime entrypoints into source-derived public contract rows.
 * @param {Record<string, any>[]} entrypoints Entrypoint snapshots.
 * @param {{ path: string, source: string }[]} tests Test sources.
 * @param {string[]} capabilityIds Capability ids.
 * @returns {Record<string, any>[]} API feature rows.
 */
function entrypointFeatures(entrypoints, tests, capabilityIds) {
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
                            target: entrypoint.target
                        }
                    },
                    tests,
                    capabilityIds
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
                    tests,
                    capabilityIds
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
                        tests,
                        capabilityIds
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
                                set: accessor.set
                            }
                        },
                        tests,
                        capabilityIds
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
                        tests,
                        capabilityIds
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
                            tests,
                            capabilityIds
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
                            tests,
                            capabilityIds
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
                            tests,
                            capabilityIds
                        )
                    )
                }
            }
        }
    }
    return rows
}

/**
 * Captures legacy worker message discriminants as public behavior.
 * @param {{ path: string, source: string }[]} tests Test sources.
 * @param {string[]} capabilityIds Capability ids.
 * @returns {Promise<Record<string, any>[]>} Worker message features.
 */
async function workerFeatures(tests, capabilityIds) {
    const source = await readFile(
        new URL('src/workers/kicad-parser.worker.mjs', repositoryRoot),
        'utf8'
    )
    const messages = [
        ...new Set(
            Array.from(
                source.matchAll(/['"]((?:parse|parser):[A-Za-z]+)['"]/gu),
                (match) => match[1]
            )
        )
    ].sort()
    return messages.map((message) =>
        featureRow(
            {
                feature: `./workers/kicad-parser.worker.mjs#message.${message}`,
                kind: 'worker-message',
                owner: 'KicadParserWorker',
                entrypoint: './workers/kicad-parser.worker.mjs',
                evidenceToken: message,
                sourceContract: { type: 'worker-message', value: message },
                tests: [
                    'tests/conformance/convergence-baselines.test.mjs',
                    'tests/workers/kicad-parser-worker.test.mjs'
                ],
                documentation: ['docs/api.md']
            },
            tests,
            capabilityIds
        )
    )
}

/**
 * Captures current capability and parity inventories as observable behaviors.
 * @param {Record<string, any>} rootApi Root module namespace.
 * @param {{ path: string, source: string }[]} tests Test sources.
 * @param {string[]} capabilityIds Capability ids.
 * @returns {Record<string, any>[]} Inventory feature rows.
 */
function inventoryFeatures(rootApi, tests, capabilityIds) {
    const capabilityRows =
        rootApi.KicadToolkitCapabilities.inventory().capabilities
    const parityRows = rootApi.KicadFeatureParity.inventory().features
    return [
        ...capabilityRows.map((capability) =>
            featureRow(
                {
                    feature: `capability#${capability.id}`,
                    kind: 'behavior',
                    capabilityId: capability.id,
                    owner: 'KicadToolkitCapabilities',
                    evidenceToken: 'KicadToolkitCapabilities',
                    sourceContract: capability,
                    documentation: ['docs/capabilities.md']
                },
                tests,
                capabilityIds
            )
        ),
        ...parityRows.map((feature) =>
            featureRow(
                {
                    feature: `parity#${feature.id}`,
                    kind: 'behavior',
                    owner: feature.id,
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
                tests,
                capabilityIds
            )
        )
    ]
}

/**
 * Creates the immutable API and preservation baselines.
 * @returns {Promise<{ baseline: Record<string, any>, ledger: Record<string, any>[] }>} Artifacts.
 */
export async function captureApiBaseline() {
    const pkg = await readJson('package.json')
    if (pkg.version !== BASE_VERSION) {
        throw new Error(`Expected kicad-toolkit@${BASE_VERSION}.`)
    }
    const head = await git(['rev-parse', 'HEAD'])
    if (head !== BASE_GIT_REF) {
        throw new Error(
            `Baseline capture requires ${BASE_GIT_REF}; found ${head}.`
        )
    }
    const sourceTree = await git(['rev-parse', `${BASE_GIT_REF}^{tree}`])
    const entrypoints = await Promise.all(
        Object.entries(pkg.exports)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([entrypoint, definition]) =>
                captureEntrypoint(entrypoint, exportTarget(definition))
            )
    )
    const tests = await readTests(new URL('tests/', repositoryRoot))
    const rootApi = await import(new URL('src/index.mjs', repositoryRoot))
    const capabilityInventory = rootApi.KicadToolkitCapabilities.inventory()
    const capabilityIds = capabilityInventory.capabilities.map((row) => row.id)
    const featureInventory = rootApi.KicadFeatureParity.inventory()
    const features = [
        ...entrypointFeatures(entrypoints, tests, capabilityIds),
        ...(await workerFeatures(tests, capabilityIds)),
        ...inventoryFeatures(rootApi, tests, capabilityIds)
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
        packageExportsChecksum: createHash('sha256')
            .update(JSON.stringify(pkg.exports))
            .digest('hex'),
        entrypoints,
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
