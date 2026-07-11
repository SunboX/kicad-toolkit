// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadJavaScriptContractAnalyzer } from './KicadJavaScriptContractAnalyzer.mjs'
import { KicadDelegatedCallAnalyzer } from './KicadDelegatedCallAnalyzer.mjs'
import { KicadStylesheetContract } from './KicadStylesheetContract.mjs'
import { KicadWorkerProtocolContract } from './KicadWorkerProtocolContract.mjs'

const IGNORED_FUNCTION_MEMBERS = new Set(['length', 'name', 'prototype'])
const CONTROL_KEYWORDS = new Set([
    'catch',
    'for',
    'if',
    'switch',
    'while',
    'with'
])

/**
 * Captures runtime API contracts for reuse by baseline capture and strict checks.
 */
export class KicadApiContractInspector {
    /**
     * Captures one module namespace.
     * @param {string} entrypoint Package export key.
     * @param {string} target Relative package target.
     * @param {Record<string, any>} api Imported namespace.
     * @param {Record<string, any>} [delegates] Reachable internal values.
     * @returns {Record<string, any>} Entrypoint contract.
     */
    static entrypoint(entrypoint, target, api, delegates = api) {
        const registry =
            typeof delegates?.contextFor === 'function' ? delegates : null
        const runtimeValues = {
            ...(registry?.values || delegates),
            ...api
        }
        const contracts = new Map(
            Object.keys(runtimeValues)
                .sort()
                .map((name) => [
                    name,
                    KicadApiContractInspector.exported(
                        name,
                        runtimeValues[name]
                    )
                ])
        )
        const exports = Object.keys(api)
            .sort()
            .map((name) => contracts.get(name))
        extendDelegatedContracts(
            [...contracts.values()],
            runtimeValues,
            registry
        )
        return { entrypoint, target, kind: 'module', exports }
    }

    /**
     * Captures one exported runtime value.
     * @param {string} name Export name.
     * @param {unknown} value Exported value.
     * @returns {Record<string, any>} Export contract.
     */
    static exported(name, value) {
        const staticNames = staticMethods(value)
        const instanceNames = instanceMethods(value)
        const staticDescriptors = Object.getOwnPropertyDescriptors(value)
        const instanceDescriptors = Object.getOwnPropertyDescriptors(
            value?.prototype || {}
        )
        const classValue = isClass(value)
        const ownerSource = classValue
            ? Function.prototype.toString.call(value)
            : ''
        return {
            name,
            type: typeof value,
            valueContract: valueContract(value),
            staticMethods: staticNames,
            instanceMethods: instanceNames,
            staticAccessors: accessors(value, 'static', ownerSource),
            instanceAccessors: accessors(value, 'instance', ownerSource),
            staticProperties: staticProperties(value),
            callables: [
                ...(typeof value === 'function' && !classValue
                    ? [
                          {
                              name: '',
                              ...callableContract(value, 'function', '', '')
                          }
                      ]
                    : []),
                ...(classValue
                    ? [
                          {
                              name: 'constructor',
                              ...constructorContract(value, ownerSource)
                          }
                      ]
                    : []),
                ...staticNames.map((method) => ({
                    name: method,
                    ...callableContract(
                        staticDescriptors[method].value,
                        'static',
                        ownerSource,
                        method
                    )
                })),
                ...instanceNames.map((method) => ({
                    name: method,
                    ...callableContract(
                        instanceDescriptors[method].value,
                        'instance',
                        ownerSource,
                        method
                    )
                }))
            ]
        }
    }

    /**
     * Captures exact and structural stylesheet behavior.
     * @param {string} source Stylesheet source.
     * @returns {{ sha256: string, rules: object[] }} Stylesheet contract.
     */
    static stylesheet(source) {
        return KicadStylesheetContract.capture(source)
    }

    /**
     * Captures worker request and response message fields from source.
     * @param {string} source Worker module source.
     * @param {string} entrypoint Worker package entrypoint.
     * @returns {Record<string, any>} Worker protocol contract.
     */
    static workerProtocol(source, entrypoint) {
        return KicadWorkerProtocolContract.capture(source, entrypoint)
    }
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
 * @param {string} ownerSource Full class source.
 * @returns {object[]} Accessor contracts.
 */
function accessors(value, accessorType, ownerSource) {
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
        .map((name) => {
            const hasGetter = typeof descriptors[name].get === 'function'
            const contract = {
                name,
                get: hasGetter,
                set: typeof descriptors[name].set === 'function'
            }
            if (hasGetter) {
                contract.getContract = {
                    returnType:
                        KicadJavaScriptContractAnalyzer.accessorReturnType(
                            ownerSource,
                            name,
                            accessorType === 'static'
                        ),
                    value:
                        accessorType === 'static'
                            ? staticAccessorValue(value, name)
                            : null
                }
            }
            if (contract.set) {
                contract.setContract =
                    KicadJavaScriptContractAnalyzer.accessorSetterContract(
                        ownerSource,
                        name,
                        accessorType === 'static'
                    )
            }
            return contract
        })
}

/**
 * Reads a static accessor without allowing capture failures to abort inventory.
 * @param {Function} value Exported class.
 * @param {string} name Accessor name.
 * @returns {Record<string, any> | null} Value contract.
 */
function staticAccessorValue(value, name) {
    try {
        return deepValueContract(Reflect.get(value, name))
    } catch {
        return null
    }
}

/**
 * Produces a bounded deep contract for an observable accessor value.
 * @param {unknown} value Public value.
 * @param {number} [depth] Current depth.
 * @param {WeakSet<object>} [seen] Visited objects.
 * @returns {Record<string, any>} Deep value contract.
 */
function deepValueContract(value, depth = 0, seen = new WeakSet()) {
    if (
        value === null ||
        ['boolean', 'number', 'string', 'undefined'].includes(typeof value)
    ) {
        return valueContract(value)
    }
    if (typeof value !== 'object') return { type: typeof value }
    if (seen.has(value)) return { type: 'circular' }
    if (depth >= 6) {
        return {
            type: Array.isArray(value) ? 'array' : 'object',
            truncated: true
        }
    }
    seen.add(value)
    if (Array.isArray(value)) {
        const rows = value
            .slice(0, 32)
            .map((row) => deepValueContract(row, depth + 1, seen))
        seen.delete(value)
        return {
            type: 'array',
            length: value.length,
            value: rows,
            ...(value.length > rows.length ? { truncated: true } : {})
        }
    }
    const keys = Object.keys(value).sort()
    const capturedKeys = keys.slice(0, 64)
    const captured = Object.fromEntries(
        capturedKeys.map((key) => [
            key,
            deepValueContract(value[key], depth + 1, seen)
        ])
    )
    seen.delete(value)
    return {
        type: 'object',
        value: captured,
        ...(keys.length > capturedKeys.length
            ? { keyCount: keys.length, truncated: true }
            : {})
    }
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
 * Captures one public callable contract from runtime and class source.
 * @param {Function} callable Public callable.
 * @param {'function' | 'static' | 'instance'} methodType Method type.
 * @param {string} ownerSource Full class source when available.
 * @param {string} methodName Method name.
 * @returns {Record<string, any>} Callable contract.
 */
function callableContract(callable, methodType, ownerSource, methodName) {
    const source = Function.prototype.toString.call(callable)
    const opening = source.indexOf('(')
    const closing =
        opening < 0 ? -1 : closingDelimiter(source, opening, '(', ')')
    const parameterSource =
        opening >= 0 && closing > opening
            ? source.slice(opening + 1, closing)
            : ''
    const parameters = splitTopLevel(parameterSource)
    const analyzed = KicadJavaScriptContractAnalyzer.callable({
        ownerSource,
        callableSource: source,
        methodName
    })
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
        options: analyzed.options,
        resultFields: analyzed.resultFields
    }
}

/**
 * Captures one class constructor contract.
 * @param {Function} value Exported class.
 * @param {string} ownerSource Full class source.
 * @returns {Record<string, any>} Constructor contract.
 */
function constructorContract(value, ownerSource) {
    const definitions = methodDefinitions(ownerSource)
    const definition = definitions.get('constructor')
    const parameters = definition?.parameters || []
    const analyzed = KicadJavaScriptContractAnalyzer.callable({
        ownerSource,
        callableSource: definition?.source || '',
        methodName: 'constructor'
    })
    return {
        type: 'method',
        methodType: 'constructor',
        signature: definition
            ? definition.header.replace(/\s+/gu, ' ').trim()
            : 'constructor()',
        arity: value.length,
        parameters,
        options: analyzed.options,
        resultFields: []
    }
}

/**
 * Parses top-level class method definitions, including private delegates.
 * @param {string} source Full class source.
 * @returns {Map<string, Record<string, any>>} Definitions by method name.
 */
function methodDefinitions(source) {
    const definitions = new Map()
    if (!source) return definitions
    const pattern =
        /(?:^|\n)[\t ]*(?:static\s+)?(?:async\s+)?(?:\*\s*)?(constructor|#?[A-Za-z_$][\w$]*)\s*\(/gu
    for (const match of source.matchAll(pattern)) {
        const name = match[1]
        if (CONTROL_KEYWORDS.has(name)) continue
        const opening = match.index + match[0].lastIndexOf('(')
        const closing = closingDelimiter(source, opening, '(', ')')
        if (closing < 0) continue
        let brace = closing + 1
        while (/\s/u.test(source[brace] || '')) brace += 1
        if (source[brace] !== '{') continue
        const end = closingDelimiter(source, brace, '{', '}')
        if (end < 0) continue
        const start = match.index + (match[0].startsWith('\n') ? 1 : 0)
        definitions.set(name, {
            name,
            parameters: splitTopLevel(source.slice(opening + 1, closing)),
            header: source.slice(start, closing + 1).trim(),
            source: source.slice(start, end + 1),
            body: source.slice(brace + 1, end),
            jsdoc: precedingJsdoc(source, start)
        })
    }
    return definitions
}

/**
 * Extends wrapper callables with contracts delegated to other public exports.
 * @param {Record<string, any>[]} exports Captured export contracts.
 * @param {Record<string, any>} runtimeValues Runtime values by source name.
 * @param {object | null} registry Exact module registry.
 * @returns {void}
 */
function extendDelegatedContracts(exports, runtimeValues, registry) {
    if (!registry) return
    const contractsByValue = new Map()
    for (const exported of exports) {
        const value = runtimeValues[exported.name]
        if (!contractsByValue.has(value)) {
            contractsByValue.set(value, exported)
        }
    }
    const edgesByCallable = new Map()
    for (const exported of exports) {
        const value = runtimeValues[exported.name]
        for (const callable of exported.callables) {
            edgesByCallable.set(
                callable,
                KicadDelegatedCallAnalyzer.capture(registry, value, callable)
            )
        }
    }
    let changed = true
    while (changed) {
        changed = false
        for (const exported of exports) {
            for (const callable of exported.callables) {
                for (const edge of edgesByCallable.get(callable) || []) {
                    const delegateOwner = contractsByValue.get(edge.targetValue)
                    const delegate = delegateOwner?.callables.find(
                        (candidate) => candidate.name === edge.methodName
                    )
                    if (!delegate) continue
                    if (
                        mergeFields(
                            callable.options,
                            delegatedOptionFields(edge, delegate)
                        )
                    ) {
                        changed = true
                    }
                    if (!edge.returned) continue
                    const returnedFields = edge.contextResolved
                        ? edge.returnedFields
                        : delegate.resultFields
                    if (mergeFields(callable.resultFields, returnedFields)) {
                        changed = true
                    }
                }
            }
        }
    }
}

/**
 * Returns delegated options whose target parameter receives wrapper options.
 * @param {object} edge Exact delegated call edge.
 * @param {Record<string, any>} delegate Delegated callable contract.
 * @returns {string[]} Delegated option fields.
 */
function delegatedOptionFields(edge, delegate) {
    const fields = []
    delegate.parameters.forEach((parameter, index) => {
        if (!isOptionParameter(parameter)) return
        for (const origin of edge.argumentOrigins[index] || []) {
            for (const option of delegate.options) {
                if (origin.excluded.has(option.split('.')[0])) continue
                fields.push([...origin.path, option].filter(Boolean).join('.'))
            }
        }
    })
    return fields
}

/**
 * Merges sorted unique fields into a captured contract list.
 * @param {string[]} target Mutable target list.
 * @param {string[]} additions Candidate fields.
 * @returns {boolean} Whether the target changed.
 */
function mergeFields(target, additions) {
    const merged = [...new Set([...target, ...additions])].sort()
    if (merged.length === target.length) return false
    target.splice(0, target.length, ...merged)
    return true
}

/**
 * Returns whether one parameter carries named options.
 * @param {string} parameter Parameter source.
 * @returns {boolean} Option-bearing flag.
 */
function isOptionParameter(parameter) {
    const source = String(parameter || '').trim()
    if (source.startsWith('{')) return true
    const name = source.match(/^(?:\.\.\.)?([A-Za-z_$][\w$]*)/u)?.[1] || ''
    return /(?:args|config|options?|request|settings)$/iu.test(name)
}

/**
 * Splits comma-delimited source at top-level nesting.
 * @param {string} source Delimited source.
 * @returns {string[]} Trimmed entries.
 */
function splitTopLevel(source) {
    const entries = []
    let start = 0
    let round = 0
    let square = 0
    let curly = 0
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
        if (character === '(') round += 1
        else if (character === ')') round -= 1
        else if (character === '[') square += 1
        else if (character === ']') square -= 1
        else if (character === '{') curly += 1
        else if (character === '}') curly -= 1
        else if (
            character === ',' &&
            round === 0 &&
            square === 0 &&
            curly === 0
        ) {
            entries.push(source.slice(start, index).trim())
            start = index + 1
        }
    }
    const finalEntry = source.slice(start).trim()
    if (finalEntry) entries.push(finalEntry)
    return entries
}

/**
 * Finds a matching closing delimiter while respecting quoted strings.
 * @param {string} source Source text.
 * @param {number} opening Opening index.
 * @param {string} open Opening delimiter.
 * @param {string} close Closing delimiter.
 * @returns {number} Closing index or -1.
 */
function closingDelimiter(source, opening, open, close) {
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
        else if (character === open) depth += 1
        else if (character === close && --depth === 0) return index
    }
    return -1
}

/**
 * Returns the JSDoc block immediately before one class method.
 * @param {string} source Class source.
 * @param {number} start Method start.
 * @returns {string} JSDoc block or empty string.
 */
function precedingJsdoc(source, start) {
    const end = source.lastIndexOf('*/', start)
    if (end < 0 || source.slice(end + 2, start).trim()) return ''
    const opening = source.lastIndexOf('/**', end)
    return opening < 0 ? '' : source.slice(opening, end + 2)
}
