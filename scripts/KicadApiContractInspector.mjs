// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

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
     * @returns {Record<string, any>} Entrypoint contract.
     */
    static entrypoint(entrypoint, target, api) {
        const exports = Object.keys(api)
            .sort()
            .map((name) => KicadApiContractInspector.exported(name, api[name]))
        extendDelegatedContracts(exports, api)
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
            staticAccessors: accessors(value, 'static'),
            instanceAccessors: accessors(value, 'instance'),
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
     * Captures worker request and response message fields from source.
     * @param {string} source Worker module source.
     * @param {string} entrypoint Worker package entrypoint.
     * @returns {Record<string, any>} Worker protocol contract.
     */
    static workerProtocol(source, entrypoint) {
        const requestTypes = [
            ...new Set(
                Array.from(
                    source.matchAll(
                        /\bmessage\s*(?:\?\.\s*|\.\s*)type\s*(?:===|!==)\s*['"]([^'"]+)['"]/gu
                    ),
                    (match) => match[1]
                )
            )
        ]
        const requestFieldNames = [
            ...new Set(
                Array.from(
                    source.matchAll(
                        /\bmessage\s*(?:\?\.\s*|\.\s*)([A-Za-z_$][\w$]*)/gu
                    ),
                    (match) => match[1]
                )
            )
        ].sort()
        const requests = requestTypes.map((type) => ({
            type,
            direction: 'request',
            fields: requestFieldNames.map((name) => ({
                name,
                required: workerRequestFieldRequired(source, name)
            }))
        }))
        const responses = returnObjectContracts(source)
            .filter((row) => row.literalType?.startsWith('parser:'))
            .map((row) => ({
                type: row.literalType,
                direction: 'response',
                fields: row.fields.map((name) => ({ name, required: true }))
            }))
        return {
            entrypoint,
            messages: [...requests, ...responses].sort((left, right) =>
                left.type.localeCompare(right.type)
            )
        }
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
    const definitions = methodDefinitions(ownerSource)
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
        options: optionNames(source, parameters, definitions, methodName),
        resultFields: resultFields(source, definitions, methodName)
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
    return {
        type: 'method',
        methodType: 'constructor',
        signature: definition
            ? definition.header.replace(/\s+/gu, ' ').trim()
            : 'constructor()',
        arity: value.length,
        parameters,
        options: optionNames(
            definition?.source || '',
            parameters,
            definitions,
            'constructor'
        ),
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
 * Collects option paths directly and through internal method delegation.
 * @param {string} source Callable source.
 * @param {string[]} parameters Callable parameters.
 * @param {Map<string, Record<string, any>>} definitions Class definitions.
 * @param {string} methodName Initial method name.
 * @returns {string[]} Sorted option paths.
 */
function optionNames(source, parameters, definitions, methodName) {
    const initial = optionParameterNames(parameters)
    if (!initial.length) return []
    const options = new Set()
    const visited = new Set()
    const fallback = {
        name: methodName,
        parameters,
        source,
        body: source,
        jsdoc: ''
    }

    /**
     * Visits one internal callable with the option-bearing parameter names.
     * @param {Record<string, any>} definition Method definition.
     * @param {Set<string>} tainted Option-bearing parameter names.
     * @returns {void}
     */
    function visit(definition, tainted) {
        const key = `${definition.name}:${[...tainted].sort().join(',')}`
        if (visited.has(key)) return
        visited.add(key)
        for (const parameter of tainted) {
            for (const name of propertyReads(definition.source, parameter)) {
                options.add(name)
            }
            for (const name of documentedParameterFields(
                definition.jsdoc,
                parameter
            )) {
                options.add(name)
            }
        }
        for (const call of methodCalls(definition.body)) {
            const callee = definitions.get(call.name)
            if (!callee) continue
            const nextTainted = new Set()
            call.arguments.forEach((argument, index) => {
                if (![...tainted].some((name) => references(argument, name))) {
                    return
                }
                const calleeName = parameterName(callee.parameters[index])
                if (calleeName) nextTainted.add(calleeName)
                for (const field of objectExpressionFields(argument)) {
                    options.add(field)
                }
            })
            if (nextTainted.size) visit(callee, nextTainted)
        }
    }

    visit(definitions.get(methodName) || fallback, new Set(initial))
    return [...options].sort()
}

/**
 * Collects direct, documented, and delegated result field paths.
 * @param {string} source Callable source.
 * @param {Map<string, Record<string, any>>} definitions Class definitions.
 * @param {string} methodName Initial method name.
 * @returns {string[]} Sorted result paths.
 */
function resultFields(source, definitions, methodName) {
    const fields = new Set()
    const visited = new Set()
    const fallback = {
        name: methodName,
        source,
        body: source,
        jsdoc: ''
    }

    /**
     * Visits one result-producing method.
     * @param {Record<string, any>} definition Method definition.
     * @returns {void}
     */
    function visit(definition) {
        if (visited.has(definition.name)) return
        visited.add(definition.name)
        for (const field of returnObjectPaths(definition.source)) {
            fields.add(field)
        }
        for (const field of documentedReturnFields(definition.jsdoc)) {
            fields.add(field)
        }
        for (const call of methodCalls(definition.body)) {
            const prefix = definition.body.slice(
                Math.max(0, call.index - 48),
                call.index
            )
            if (!/\breturn\s*(?:await\s*)?$/u.test(prefix)) continue
            const callee = definitions.get(call.name)
            if (callee) visit(callee)
        }
    }

    visit(definitions.get(methodName) || fallback)
    return [...fields].sort()
}

/**
 * Extends wrapper callables with contracts delegated to other public exports.
 * @param {Record<string, any>[]} exports Captured export contracts.
 * @param {Record<string, any>} api Imported module namespace.
 * @returns {void}
 */
function extendDelegatedContracts(exports, api) {
    const exportsByName = new Map(
        exports.map((exported) => [exported.name, exported])
    )
    let changed = true
    while (changed) {
        changed = false
        for (const exported of exports) {
            for (const callable of exported.callables) {
                const source = exportedCallableSource(
                    api[exported.name],
                    callable
                )
                const optionParameters = optionParameterNames(
                    callable.parameters
                )
                for (const call of methodCalls(source)) {
                    const delegate = exportsByName
                        .get(call.owner)
                        ?.callables.find(
                            (candidate) => candidate.name === call.name
                        )
                    if (!delegate) continue
                    const delegatedOptions = delegatedOptionFields(
                        call,
                        optionParameters,
                        delegate
                    )
                    if (mergeFields(callable.options, delegatedOptions)) {
                        changed = true
                    }
                    if (
                        returnedCall(source, call.index) &&
                        mergeFields(
                            callable.resultFields,
                            delegate.resultFields
                        )
                    ) {
                        changed = true
                    }
                }
            }
        }
    }
}

/**
 * Returns source for one callable belonging to an exported runtime value.
 * @param {unknown} value Exported runtime value.
 * @param {Record<string, any>} callable Captured callable contract.
 * @returns {string} Callable source or an empty string.
 */
function exportedCallableSource(value, callable) {
    if (typeof value !== 'function') return ''
    if (callable.methodType === 'function') {
        return Function.prototype.toString.call(value)
    }
    if (callable.methodType === 'constructor') {
        return (
            methodDefinitions(Function.prototype.toString.call(value)).get(
                'constructor'
            )?.source || ''
        )
    }
    const owner = callable.methodType === 'static' ? value : value.prototype
    const method = Object.getOwnPropertyDescriptor(owner, callable.name)?.value
    return typeof method === 'function'
        ? Function.prototype.toString.call(method)
        : ''
}

/**
 * Returns delegated options whose target parameter receives wrapper options.
 * @param {{ owner: string, name: string, arguments: string[], index: number }} call Parsed method call.
 * @param {string[]} callerOptions Option-bearing wrapper parameters.
 * @param {Record<string, any>} delegate Delegated callable contract.
 * @returns {string[]} Delegated option fields.
 */
function delegatedOptionFields(call, callerOptions, delegate) {
    const delegatedParameters = new Set(
        optionParameterNames(delegate.parameters)
    )
    const receivesOptions = delegate.parameters.some((parameter, index) => {
        const delegatedName = parameterName(parameter)
        if (!delegatedParameters.has(delegatedName)) return false
        const argument = call.arguments[index] || ''
        return callerOptions.some((name) => forwardsParameter(argument, name))
    })
    return receivesOptions ? delegate.options : []
}

/**
 * Returns whether an argument forwards a parameter without narrowing fields.
 * @param {string} argument Call argument source.
 * @param {string} parameter Caller parameter name.
 * @returns {boolean} Whether the full parameter contract is forwarded.
 */
function forwardsParameter(argument, parameter) {
    const value = argument.trim()
    if (value === parameter) return true
    if (!value.startsWith('{')) return false
    const spread = new RegExp(`\\.\\.\\.\\s*${escapeRegExp(parameter)}\\b`, 'u')
    return spread.test(value)
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
 * Returns whether a parsed call is the value of a return statement.
 * @param {string} source Callable source.
 * @param {number} index Call start index.
 * @returns {boolean} Whether the call is returned directly.
 */
function returnedCall(source, index) {
    const prefix = source.slice(Math.max(0, index - 48), index)
    return /\breturn\s*(?:await\s*)?$/u.test(prefix)
}

/**
 * Parses class method calls and their arguments.
 * @param {string} source Method body.
 * @returns {{ owner: string, name: string, arguments: string[], index: number }[]} Calls.
 */
function methodCalls(source) {
    const calls = []
    const pattern =
        /\b(this|[A-Za-z_$][\w$]*)\s*(?:\?\.)?\.\s*(#?[A-Za-z_$][\w$]*)\s*\(/gu
    for (const match of source.matchAll(pattern)) {
        const opening = match.index + match[0].lastIndexOf('(')
        const closing = closingDelimiter(source, opening, '(', ')')
        if (closing < 0) continue
        calls.push({
            owner: match[1],
            name: match[2],
            arguments: splitTopLevel(source.slice(opening + 1, closing)),
            index: match.index
        })
    }
    return calls
}

/**
 * Returns option-like parameter identifiers.
 * @param {string[]} parameters Parameter declarations.
 * @returns {string[]} Option parameter names.
 */
function optionParameterNames(parameters) {
    return parameters
        .map(parameterName)
        .filter((name) =>
            /(?:args|config|options?|request|settings)$/iu.test(name)
        )
}

/**
 * Returns one simple identifier from a parameter declaration.
 * @param {string | undefined} parameter Parameter declaration.
 * @returns {string} Identifier or empty string.
 */
function parameterName(parameter) {
    const match = String(parameter || '')
        .trim()
        .match(/^(?:\.\.\.)?([A-Za-z_$][\w$]*)/u)
    return match?.[1] || ''
}

/**
 * Finds property reads rooted at one identifier.
 * @param {string} source Source text.
 * @param {string} identifier Root identifier.
 * @returns {string[]} Property names.
 */
function propertyReads(source, identifier) {
    const pattern = new RegExp(
        `\\b${escapeRegExp(identifier)}\\s*(?:\\?\\.\\s*|\\.\\s*)([A-Za-z_$][\\w$]*)`,
        'gu'
    )
    return Array.from(source.matchAll(pattern), (match) => match[1])
}

/**
 * Returns documented object fields for one JSDoc parameter.
 * @param {string} jsdoc JSDoc block.
 * @param {string} parameter Parameter name.
 * @returns {string[]} Field paths.
 */
function documentedParameterFields(jsdoc, parameter) {
    const rows = jsdocTags(jsdoc, 'param')
    const row = rows.find((entry) => entry.name === parameter)
    return row ? objectTypePaths(row.type) : []
}

/**
 * Returns documented JSDoc result field paths.
 * @param {string} jsdoc JSDoc block.
 * @returns {string[]} Result paths.
 */
function documentedReturnFields(jsdoc) {
    const row = jsdocTags(jsdoc, 'returns')[0]
    return row ? objectTypePaths(row.type) : []
}

/**
 * Parses JSDoc tags with balanced type braces.
 * @param {string} jsdoc JSDoc block.
 * @param {'param' | 'returns'} tag Tag name.
 * @returns {{ type: string, name: string }[]} Parsed tags.
 */
function jsdocTags(jsdoc, tag) {
    const rows = []
    const pattern = new RegExp(`@${tag}\\s*\\{`, 'gu')
    for (const match of jsdoc.matchAll(pattern)) {
        const opening = match.index + match[0].lastIndexOf('{')
        const closing = closingDelimiter(jsdoc, opening, '{', '}')
        if (closing < 0) continue
        const remainder = jsdoc.slice(closing + 1).match(/^\s*\[?([\w$]+)/u)
        rows.push({
            type: jsdoc.slice(opening + 1, closing).trim(),
            name: tag === 'param' ? remainder?.[1] || '' : ''
        })
    }
    return rows
}

/**
 * Expands a JSDoc object type to nested field paths.
 * @param {string} type JSDoc type expression.
 * @param {string} [prefix] Parent path.
 * @returns {string[]} Field paths.
 */
function objectTypePaths(type, prefix = '') {
    const start = type.indexOf('{')
    if (start < 0) return []
    const end = closingDelimiter(type, start, '{', '}')
    if (end < 0) return []
    const fields = []
    for (const declaration of splitTopLevel(type.slice(start + 1, end))) {
        const match = declaration.match(
            /^\s*([A-Za-z_$][\w$]*)(?:\?)?\s*:\s*([\s\S]+)$/u
        )
        if (!match) continue
        const path = prefix ? `${prefix}.${match[1]}` : match[1]
        fields.push(path)
        fields.push(...objectTypePaths(match[2], path))
    }
    return fields
}

/**
 * Collects nested paths from returned object literals.
 * @param {string} source Callable source.
 * @returns {string[]} Result paths.
 */
function returnObjectPaths(source) {
    return returnObjectContracts(source).flatMap((row) => row.paths)
}

/**
 * Parses returned object literals with literal message types.
 * @param {string} source Source text.
 * @returns {{ fields: string[], paths: string[], literalType: string }[]} Object contracts.
 */
function returnObjectContracts(source) {
    const rows = []
    for (const match of source.matchAll(/\breturn\s*\{/gu)) {
        const opening = match.index + match[0].lastIndexOf('{')
        const closing = closingDelimiter(source, opening, '{', '}')
        if (closing < 0) continue
        const parsed = objectLiteralPaths(source.slice(opening + 1, closing))
        const literalType = source
            .slice(opening + 1, closing)
            .match(/(?:^|,)\s*type\s*:\s*['"]([^'"]+)['"]/u)?.[1]
        rows.push({
            fields: parsed.filter((path) => !path.includes('.')).sort(),
            paths: parsed,
            literalType: literalType || ''
        })
    }
    return rows
}

/**
 * Expands one object-literal body to nested field paths.
 * @param {string} source Object body.
 * @param {string} [prefix] Parent path.
 * @returns {string[]} Field paths.
 */
function objectLiteralPaths(source, prefix = '') {
    const fields = []
    for (const declaration of splitTopLevel(source)) {
        const match = declaration.match(
            /^\s*([A-Za-z_$][\w$]*)\s*(?::\s*([\s\S]+))?$/u
        )
        if (!match) continue
        const path = prefix ? `${prefix}.${match[1]}` : match[1]
        fields.push(path)
        const value = match[2]?.trim() || ''
        if (value.startsWith('{')) {
            const closing = closingDelimiter(value, 0, '{', '}')
            if (closing >= 0) {
                fields.push(
                    ...objectLiteralPaths(value.slice(1, closing), path)
                )
            }
        }
    }
    return fields
}

/**
 * Returns object-literal keys from an option-bearing call argument.
 * @param {string} argument Call argument.
 * @returns {string[]} Literal option fields.
 */
function objectExpressionFields(argument) {
    const value = argument.trim()
    if (!value.startsWith('{')) return []
    const closing = closingDelimiter(value, 0, '{', '}')
    return closing < 0 ? [] : objectLiteralPaths(value.slice(1, closing))
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

/**
 * Returns whether source references one identifier.
 * @param {string} source Source expression.
 * @param {string} identifier Identifier.
 * @returns {boolean} Whether the identifier is referenced.
 */
function references(source, identifier) {
    return new RegExp(`\\b${escapeRegExp(identifier)}\\b`, 'u').test(source)
}

/**
 * Escapes a string for a regular expression.
 * @param {string} value Literal value.
 * @returns {string} Escaped value.
 */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

/**
 * Determines whether a worker request field is required.
 * @param {string} source Worker source.
 * @param {string} name Field name.
 * @returns {boolean} Required-field flag.
 */
function workerRequestFieldRequired(source, name) {
    if (name === 'type') return true
    const access = `message\\s*(?:\\?\\.\\s*|\\.\\s*)${escapeRegExp(name)}`
    const fallback = new RegExp(`${access}\\s*(?:\\|\\||\\?\\?)`, 'u')
    if (fallback.test(source)) return false
    return new RegExp(`message\\s*\\.\\s*${escapeRegExp(name)}`, 'u').test(
        source
    )
}
