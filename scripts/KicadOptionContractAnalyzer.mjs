// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { parse } from 'acorn'
import { KicadOptionControlFlow } from './KicadOptionControlFlow.mjs'
import { KicadOptionStatementExecutor } from './KicadOptionStatementExecutor.mjs'
import {
    KicadOptionScope as Scope,
    cloneOrigins,
    originSignature
} from './KicadOptionScope.mjs'
import { KicadOptionValueResolver } from './KicadOptionValueResolver.mjs'

const OPTION_NAME = /(?:args|config|options?|request|settings)$/iu
const ARRAY_CALLBACK_ARGUMENTS = new Map([
    ['every', [0]],
    ['filter', [0]],
    ['find', [0]],
    ['findIndex', [0]],
    ['flatMap', [0]],
    ['forEach', [0]],
    ['map', [0]],
    ['reduce', [0]],
    ['reduceRight', [0]],
    ['some', [0]],
    ['sort', [0]]
])
const OPTION_VALUES = new KicadOptionValueResolver({
    booleanValue: (node) => KicadOptionControlFlow.booleanValue(node),
    callableValue: (node, scope, model) => callableValue(node, scope, model),
    expressionOrigins: (node, scope) => expressionOrigins(node, scope),
    propertyName: (node) => propertyName(node),
    staticValue: (node) => KicadOptionControlFlow.staticValue(node)
})

/**
 * Extracts reachable option reads with lexical binding semantics.
 */
export class KicadOptionContractAnalyzer {
    /**
     * Captures option paths for one callable.
     * @param {object} input Analysis input.
     * @param {string} input.ownerSource Full class source.
     * @param {string} input.callableSource Standalone callable source.
     * @param {string} input.methodName Callable name.
     * @returns {string[]} Sorted option paths.
     */
    static capture({ ownerSource, callableSource, methodName }) {
        const model = sourceModel(ownerSource, callableSource, methodName)
        const initial = model.definitions.get(methodName)
        if (!initial) return []
        return captureOptions(model, initial)
    }

    /**
     * Determines whether one expression directly forwards an option object.
     * @param {string} source Expression source.
     * @param {string} parameter Parameter name.
     * @returns {string[] | null} Overridden fields or null.
     */
    static forwardedExclusions(source, parameter) {
        try {
            const expression = parseProgram(`(${source})`).body[0]?.expression
            const scope = new Scope()
            scope.declare(parameter, { origins: [optionOrigin()] })
            const origins = expressionOrigins(expression, scope)
            const root = origins.find((origin) => origin.path.length === 0)
            return root ? [...root.excluded].sort() : null
        } catch {
            return null
        }
    }
}

/**
 * Captures one initial callable and every reachable internal callable.
 * @param {object} model Parsed source model.
 * @param {object} initial Initial callable.
 * @returns {string[]} Sorted fields.
 */
function captureOptions(model, initial) {
    const fields = new Set()
    const active = new Set()

    /**
     * Invokes one callable with abstract option origins.
     * @param {object} callable Callable definition.
     * @param {object[]} argumentValues Abstract values by argument index.
     * @param {Scope | null} [closureScope] Closure scope.
     * @returns {void}
     */
    function invoke(callable, argumentValues, closureScope = null) {
        const signature = `${callable.id}:${argumentValues
            .map(valueSignature)
            .join('|')}`
        if (active.has(signature)) return
        active.add(signature)
        const scope = new Scope(closureScope)
        callable.parameters.forEach((parameter, index) => {
            const value = argumentValues[index] || emptyValue()
            bindPattern(
                parameter,
                value.origins,
                scope,
                fields,
                true,
                value.callable,
                value
            )
        })
        for (const [index, value] of argumentValues.entries()) {
            const origins = value.origins
            if (!origins.length) continue
            const name = firstPatternName(callable.parameters[index])
            for (const field of documentedParameterFields(
                callable.jsdoc,
                name
            )) {
                addDocumentedField(fields, origins, field)
            }
        }
        if (callable.node.body.type === 'BlockStatement') {
            KicadOptionStatementExecutor.execute(
                callable.node.body.body,
                scope,
                executionHooks(model, fields, invoke)
            )
        } else {
            visitExpression(callable.node.body, scope, model, fields, invoke)
        }
        active.delete(signature)
    }

    const initialValues = initial.parameters.map((parameter) => {
        const target = unwrapAssignment(parameter)
        const name = firstPatternName(parameter)
        const arrayLike = documentedParameterIsArray(initial.jsdoc, name)
        if (target?.type === 'ObjectPattern') {
            return { ...emptyValue(), origins: [optionOrigin()], arrayLike }
        }
        return OPTION_NAME.test(name)
            ? { ...emptyValue(), origins: [optionOrigin()], arrayLike }
            : { ...emptyValue(), arrayLike }
    })
    if (!initialValues.some((value) => value.origins.length)) return []
    invoke(initial, initialValues)
    return [...fields].sort()
}

/**
 * Creates typed-statement execution hooks for the option analyzer.
 * @param {object} model Source model.
 * @param {Set<string>} fields Collected fields.
 * @param {Function} invoke Callable invoker.
 * @returns {object} Executor hooks.
 */
function executionHooks(model, fields, invoke) {
    return {
        bindUnknown: (pattern, scope) =>
            bindPattern(pattern, [], scope, fields, false),
        declareFunction: (statement, scope) => {
            scope.declare(statement.id.name, {
                callable: {
                    definition: localCallable(statement, scope, model.source),
                    closureScope: scope
                }
            })
        },
        declareVariable: (declaration, scope) => {
            const value = OPTION_VALUES.value(declaration.init, scope, model)
            bindPattern(
                declaration.id,
                value.origins,
                scope,
                fields,
                value.origins.length > 0,
                value.callable,
                value
            )
            visitExpression(
                declaration.init,
                scope,
                model,
                fields,
                invoke,
                true
            )
        },
        mayThrow: (node) => KicadOptionControlFlow.expressionMayThrow(node),
        visit: (node, scope) =>
            visitExpression(node, scope, model, fields, invoke),
        visitUnknown: (node, scope) => {
            for (const child of childNodes(node)) {
                if (isExpression(child)) {
                    visitExpression(child, scope, model, fields, invoke)
                }
            }
        }
    }
}

/**
 * Visits one reachable expression without entering uncalled closures.
 * @param {object | null} node Expression.
 * @param {Scope} scope Current scope.
 * @param {object} model Source model.
 * @param {Set<string>} fields Collected fields.
 * @param {Function} invoke Callable invoker.
 * @param {boolean} [skipCallable] Skip a just-bound callable body.
 * @returns {void}
 */
function visitExpression(
    node,
    scope,
    model,
    fields,
    invoke,
    skipCallable = false
) {
    if (!node) return
    if (node.type === 'ChainExpression') {
        visitExpression(node.expression, scope, model, fields, invoke)
        return
    }
    if (isFunction(node)) {
        if (skipCallable) return
        return
    }
    if (node.type === 'MemberExpression') {
        for (const origin of expressionOrigins(node, scope)) {
            addOriginField(fields, origin)
        }
        if (
            ![
                'Identifier',
                'MemberExpression',
                'Super',
                'ThisExpression'
            ].includes(node.object.type)
        ) {
            visitExpression(node.object, scope, model, fields, invoke)
        }
        if (node.computed) {
            visitExpression(node.property, scope, model, fields, invoke)
        }
        return
    }
    if (node.type === 'CallExpression') {
        visitExpression(node.callee, scope, model, fields, invoke)
        for (const argument of node.arguments) {
            visitExpression(argument, scope, model, fields, invoke)
        }
        const callable = callableValue(node.callee, scope, model)
        if (callable) {
            const values = node.arguments.map((argument) =>
                OPTION_VALUES.value(argument, scope, model)
            )
            invoke(callable.definition, values, callable.closureScope)
        }
        invokeArrayCallbacks(node, scope, model, invoke)
        return
    }
    if (node.type === 'LogicalExpression') {
        visitExpression(node.left, scope, model, fields, invoke)
        const decision = KicadOptionControlFlow.logicalRightReachability(node)
        if (decision !== false) {
            visitExpression(node.right, scope, model, fields, invoke)
        }
        return
    }
    if (
        node.type === 'AssignmentExpression' &&
        node.left.type === 'Identifier'
    ) {
        const binding = scope.resolve(node.left.name)
        if (binding) {
            const value = OPTION_VALUES.value(node.right, scope, model)
            Object.assign(binding, value)
        }
    }
    for (const child of childNodes(node)) {
        visitExpression(child, scope, model, fields, invoke)
    }
}

/**
 * Invokes callbacks passed to synchronous Array iteration methods.
 * @param {object} node Call expression.
 * @param {Scope} scope Current scope.
 * @param {object} model Source model.
 * @param {Function} invoke Callable invoker.
 * @returns {void}
 */
function invokeArrayCallbacks(node, scope, model, invoke) {
    const callee =
        node.callee.type === 'ChainExpression'
            ? node.callee.expression
            : node.callee
    if (callee.type !== 'MemberExpression') return
    if (!OPTION_VALUES.arrayLike(callee.object, scope, model)) return
    const callbackIndexes = ARRAY_CALLBACK_ARGUMENTS.get(
        propertyName(callee.property)
    )
    if (!callbackIndexes) return
    for (const index of callbackIndexes) {
        const callable = callableValue(node.arguments[index], scope, model)
        if (!callable) continue
        invoke(
            callable.definition,
            callable.definition.parameters.map(() => emptyValue()),
            callable.closureScope
        )
    }
}

/**
 * Resolves a callable expression exactly within the current lexical model.
 * @param {object | null} node Expression.
 * @param {Scope} scope Current scope.
 * @param {object} model Source model.
 * @returns {{ definition: object, closureScope: Scope | null } | null} Callable.
 */
function callableValue(node, scope, model) {
    if (!node) return null
    if (isFunction(node)) {
        return {
            definition: localCallable(node, scope, model.source),
            closureScope: scope
        }
    }
    if (node.type === 'Identifier') {
        return scope.resolve(node.name)?.callable || null
    }
    const callee = node.type === 'ChainExpression' ? node.expression : node
    if (callee.type !== 'MemberExpression') return null
    const methodName = propertyName(callee.property)
    const sameOwner =
        callee.object.type === 'ThisExpression' ||
        (callee.object.type === 'Identifier' &&
            callee.object.name === model.className)
    if (sameOwner && methodName && model.definitions.has(methodName)) {
        return {
            definition: model.definitions.get(methodName),
            closureScope: null
        }
    }
    return (
        OPTION_VALUES.members(callee.object, scope, model).get(methodName) ||
        null
    )
}

/**
 * Resolves option origins for identifiers, member paths, and object spreads.
 * @param {object | null} node Expression.
 * @param {Scope} scope Current scope.
 * @returns {object[]} Option origins.
 */
function expressionOrigins(node, scope) {
    if (!node) return []
    if (node.type === 'ChainExpression') {
        return expressionOrigins(node.expression, scope)
    }
    if (node.type === 'Identifier') {
        return cloneOrigins(scope.resolve(node.name)?.origins || [])
    }
    if (node.type === 'MemberExpression') {
        const base = expressionOrigins(node.object, scope)
        const name = propertyName(node.property)
        return name
            ? base.map((origin) => ({
                  ...origin,
                  path: [...origin.path, name],
                  excluded: new Set(origin.excluded)
              }))
            : []
    }
    if (node.type !== 'ObjectExpression') return []
    let origins = []
    for (const property of node.properties) {
        if (property.type === 'SpreadElement') {
            origins = expressionOrigins(property.argument, scope)
            continue
        }
        const name = propertyName(property.key)
        for (const origin of origins) {
            if (origin.path.length === 0 && name) origin.excluded.add(name)
        }
    }
    return origins
}

/**
 * Binds one declaration pattern and records destructuring reads.
 * @param {object | null} pattern Binding pattern.
 * @param {object[]} origins Option origins.
 * @param {Scope} scope Current scope.
 * @param {Set<string>} fields Collected fields.
 * @param {boolean} recordReads Whether destructuring performs public reads.
 * @param {object | null} [callable] Callable value.
 * @param {object} [metadata] Additional abstract value metadata.
 * @returns {void}
 */
function bindPattern(
    pattern,
    origins,
    scope,
    fields,
    recordReads,
    callable = null,
    metadata = emptyValue()
) {
    if (!pattern) return
    if (pattern.type === 'AssignmentPattern') {
        bindPattern(
            pattern.left,
            origins,
            scope,
            fields,
            recordReads,
            callable,
            metadata
        )
        return
    }
    if (pattern.type === 'Identifier') {
        scope.declare(pattern.name, {
            origins: cloneOrigins(origins),
            callable,
            members: metadata.members,
            arrayLike: metadata.arrayLike
        })
        return
    }
    if (pattern.type === 'RestElement') {
        bindPattern(
            pattern.argument,
            origins,
            scope,
            fields,
            false,
            callable,
            metadata
        )
        return
    }
    if (pattern.type !== 'ObjectPattern') return
    const consumed = []
    for (const property of pattern.properties) {
        if (property.type === 'RestElement') {
            const rest = cloneOrigins(origins)
            for (const origin of rest) {
                if (origin.path.length === 0) {
                    for (const name of consumed) origin.excluded.add(name)
                }
            }
            bindPattern(property.argument, rest, scope, fields, false)
            continue
        }
        const name = propertyName(property.key)
        if (!name) continue
        consumed.push(name)
        const childOrigins = origins.map((origin) => ({
            ...origin,
            path: [...origin.path, name],
            excluded: new Set(origin.excluded)
        }))
        if (recordReads) {
            for (const origin of childOrigins) addOriginField(fields, origin)
        }
        bindPattern(property.value, childOrigins, scope, fields, false)
    }
}

/**
 * Adds one option origin unless its root field was overridden.
 * @param {Set<string>} fields Collected fields.
 * @param {object} origin Option origin.
 * @returns {void}
 */
function addOriginField(fields, origin) {
    if (!origin.path.length || origin.excluded.has(origin.path[0])) return
    fields.add(origin.path.join('.'))
}

/**
 * Adds a documented path beneath every forwarded origin.
 * @param {Set<string>} fields Collected fields.
 * @param {object[]} origins Origins.
 * @param {string} field Documented path.
 * @returns {void}
 */
function addDocumentedField(fields, origins, field) {
    for (const origin of origins) {
        const path = [...origin.path, ...field.split('.')]
        addOriginField(fields, { ...origin, path })
    }
}

/**
 * Creates one option provenance value.
 * @returns {object} Root option origin.
 */
function optionOrigin() {
    return { path: [], excluded: new Set() }
}

/**
 * Creates an empty option-analysis abstract value.
 * @returns {object} Empty value.
 */
function emptyValue() {
    return {
        origins: [],
        callable: null,
        members: new Map(),
        arrayLike: false
    }
}

/**
 * Returns a stable abstract-value invocation signature.
 * @param {object} value Abstract value.
 * @returns {string} Signature.
 */
function valueSignature(value) {
    const members = [...(value.members || new Map())]
        .map(([name, callable]) => `${name}:${callable.definition.id}`)
        .sort()
        .join(',')
    return [
        originSignature(value.origins || []),
        value.callable?.definition?.id || '',
        members,
        value.arrayLike ? 'array' : ''
    ].join(':')
}

/**
 * Parses class or standalone function syntax.
 * @param {string} ownerSource Class source.
 * @param {string} callableSource Standalone function source.
 * @param {string} methodName Callable name.
 * @returns {object} Source model.
 */
function sourceModel(ownerSource, callableSource, methodName) {
    if (ownerSource) {
        const program = parseProgram(ownerSource)
        const classNode = program.body.find((node) =>
            ['ClassDeclaration', 'ClassExpression'].includes(node.type)
        )
        const definitions = new Map()
        for (const element of classNode?.body?.body || []) {
            if (element.type !== 'MethodDefinition') continue
            const name = propertyName(element.key)
            if (!name || !['method', 'constructor'].includes(element.kind)) {
                continue
            }
            definitions.set(
                name,
                definition(
                    name,
                    element.value,
                    precedingJsdoc(ownerSource, element.start),
                    ownerSource
                )
            )
        }
        return {
            source: ownerSource,
            className: propertyName(classNode?.id),
            definitions
        }
    }
    try {
        const source = `(${callableSource})`
        const node = parseProgram(source).body[0]?.expression
        return {
            source,
            className: '',
            definitions: isFunction(node)
                ? new Map([
                      [methodName, definition(methodName, node, '', source)]
                  ])
                : new Map()
        }
    } catch {
        return { source: '', className: '', definitions: new Map() }
    }
}

/**
 * Creates a callable definition.
 * @param {string} name Callable name.
 * @param {object} node Function node.
 * @param {string} jsdoc JSDoc.
 * @param {string} source Full source.
 * @returns {object} Definition.
 */
function definition(name, node, jsdoc, source) {
    return {
        id: `${name}:${node.start}:${node.end}`,
        name,
        node,
        parameters: node.params || [],
        jsdoc,
        source
    }
}

/**
 * Creates a local callable definition.
 * @param {object} node Function node.
 * @param {Scope} scope Closure scope.
 * @param {string} source Full source.
 * @returns {object} Definition.
 */
function localCallable(node, scope, source) {
    const name = node.id?.name || '<closure>'
    return {
        ...definition(name, node, '', source),
        closureScope: scope
    }
}

/**
 * Parses modern JavaScript.
 * @param {string} source Source.
 * @returns {object} Program.
 */
function parseProgram(source) {
    return parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowHashBang: true
    })
}

/**
 * Returns one static property name.
 * @param {object | null} node Property node.
 * @returns {string} Name.
 */
function propertyName(node) {
    if (!node) return ''
    if (node.type === 'Identifier') return node.name
    if (node.type === 'PrivateIdentifier') return `#${node.name}`
    if (node.type === 'Literal') return String(node.value)
    return ''
}

/**
 * Returns whether a node is a function expression or declaration.
 * @param {object | null} node Node.
 * @returns {boolean} Function flag.
 */
function isFunction(node) {
    return [
        'ArrowFunctionExpression',
        'FunctionDeclaration',
        'FunctionExpression'
    ].includes(node?.type)
}

/**
 * Returns whether a node is an expression.
 * @param {object} node Node.
 * @returns {boolean} Expression flag.
 */
function isExpression(node) {
    return /Expression$/u.test(node.type) || node.type === 'Identifier'
}

/**
 * Returns child syntax nodes.
 * @param {object} node Parent.
 * @returns {object[]} Children.
 */
function childNodes(node) {
    const children = []
    for (const [key, value] of Object.entries(node)) {
        if (['start', 'end', 'loc', 'range'].includes(key)) continue
        if (Array.isArray(value)) {
            children.push(
                ...value.filter((item) => item && typeof item.type === 'string')
            )
        } else if (value && typeof value.type === 'string') {
            children.push(value)
        }
    }
    return children
}

/**
 * Unwraps a defaulted binding pattern.
 * @param {object | null} pattern Pattern.
 * @returns {object | null} Unwrapped pattern.
 */
function unwrapAssignment(pattern) {
    return pattern?.type === 'AssignmentPattern' ? pattern.left : pattern
}

/**
 * Returns the first identifier in a binding pattern.
 * @param {object | null} pattern Pattern.
 * @returns {string} Name.
 */
function firstPatternName(pattern) {
    const target = unwrapAssignment(pattern)
    if (target?.type === 'Identifier') return target.name
    if (target?.type === 'ObjectPattern') {
        for (const property of target.properties) {
            const name = firstPatternName(property.value || property.argument)
            if (name) return name
        }
    }
    return ''
}

/**
 * Returns the JSDoc immediately before a node.
 * @param {string} source Source.
 * @param {number} start Node start.
 * @returns {string} JSDoc.
 */
function precedingJsdoc(source, start) {
    const end = source.lastIndexOf('*/', start)
    if (end < 0 || source.slice(end + 2, start).trim()) return ''
    const opening = source.lastIndexOf('/**', end)
    return opening < 0 ? '' : source.slice(opening, end + 2)
}

/**
 * Returns documented object fields for one parameter.
 * @param {string} jsdoc JSDoc.
 * @param {string} parameter Parameter name.
 * @returns {string[]} Fields.
 */
function documentedParameterFields(jsdoc, parameter) {
    const pattern = /@param\s*\{([^\n]+)\}\s*\[?([\w$]+)/gu
    for (const match of jsdoc.matchAll(pattern)) {
        if (match[2] === parameter) return objectTypePaths(match[1])
    }
    return []
}

/**
 * Returns whether JSDoc declares one parameter as an Array value.
 * @param {string} jsdoc JSDoc.
 * @param {string} parameter Parameter name.
 * @returns {boolean} Array flag.
 */
function documentedParameterIsArray(jsdoc, parameter) {
    const pattern = /@param\s*\{([^\n]+)\}\s*\[?([\w$]+)/gu
    for (const match of jsdoc.matchAll(pattern)) {
        if (match[2] !== parameter) continue
        return /(?:\[\]|\bArray\s*<)/u.test(match[1])
    }
    return false
}

/**
 * Expands object-shaped type fields.
 * @param {string} type Type source.
 * @param {string} [prefix] Parent path.
 * @returns {string[]} Paths.
 */
function objectTypePaths(type, prefix = '') {
    const opening = type.indexOf('{')
    const closing = type.lastIndexOf('}')
    if (opening < 0 || closing <= opening) return []
    return type
        .slice(opening + 1, closing)
        .split(',')
        .flatMap((row) => {
            const match = row.match(/^\s*([\w$]+)(?:\?)?\s*:/u)
            if (!match) return []
            return [prefix ? `${prefix}.${match[1]}` : match[1]]
        })
}
