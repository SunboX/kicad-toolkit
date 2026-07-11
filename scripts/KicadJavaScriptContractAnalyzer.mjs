// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { parse } from 'acorn'
import { KicadOptionContractAnalyzer } from './KicadOptionContractAnalyzer.mjs'
import { KicadResultContractAnalyzer } from './KicadResultContractAnalyzer.mjs'

const OPTION_PARAMETER_PATTERN = /(?:args|config|options?|request|settings)$/iu

/**
 * Extracts callable contracts from JavaScript syntax with lexical scope.
 */
export class KicadJavaScriptContractAnalyzer {
    /**
     * Captures options and returned object fields for one callable.
     * @param {object} input Analysis input.
     * @param {string} input.ownerSource Full class source when available.
     * @param {string} input.callableSource Standalone callable source.
     * @param {string} input.methodName Method name or an empty string.
     * @returns {{ options: string[], resultFields: string[] }} Contract fields.
     */
    static callable({ ownerSource, callableSource, methodName }) {
        const model = sourceModel(ownerSource, callableSource, methodName)
        const definition = model.definitions.get(methodName)
        if (!definition) return { options: [], resultFields: [] }
        return {
            options: KicadOptionContractAnalyzer.capture({
                ownerSource,
                callableSource,
                methodName
            }),
            resultFields: KicadResultContractAnalyzer.capture({
                ownerSource,
                callableSource,
                methodName
            })
        }
    }

    /**
     * Returns the documented type of one accessor getter.
     * @param {string} ownerSource Full class source.
     * @param {string} name Accessor name.
     * @param {boolean} isStatic Whether the accessor is static.
     * @returns {string} Documented return type or an empty string.
     */
    static accessorReturnType(ownerSource, name, isStatic) {
        const model = sourceModel(ownerSource, '', '')
        const definition = [...model.definitions.values()].find(
            (row) =>
                row.name === name &&
                row.kind === 'get' &&
                row.static === isStatic
        )
        return jsdocTags(definition?.jsdoc || '', 'returns')[0]?.type || ''
    }

    /**
     * Captures one setter parameter and its documented type.
     * @param {string} ownerSource Full class source.
     * @param {string} name Accessor name.
     * @param {boolean} isStatic Whether the accessor is static.
     * @returns {{ parameter: string, parameterType: string } | null} Setter contract.
     */
    static accessorSetterContract(ownerSource, name, isStatic) {
        const model = sourceModel(ownerSource, '', '')
        const definition = [...model.definitions.values()].find(
            (row) =>
                row.name === name &&
                row.kind === 'set' &&
                row.static === isStatic
        )
        const parameter = definition?.parameters[0]
        if (!definition || !parameter) return null
        const parameterSource = ownerSource.slice(
            parameter.start,
            parameter.end
        )
        const parameterName = patternNames(parameter)[0] || parameterSource
        const documented = jsdocTags(definition.jsdoc, 'param')
        const row =
            documented.find((entry) => entry.name === parameterName) ||
            documented[0]
        return {
            parameter: parameterSource,
            parameterType: row?.type || ''
        }
    }

    /**
     * Determines whether an expression forwards an option object and which
     * fields are replaced after its final spread.
     * @param {string} source Expression source.
     * @param {string} parameter Option parameter name.
     * @returns {string[] | null} Overridden fields, or null when not forwarded.
     */
    static forwardedOptionExclusions(source, parameter) {
        return KicadOptionContractAnalyzer.forwardedExclusions(
            source,
            parameter
        )
    }
}

/**
 * Parses a class or standalone callable into method definitions.
 * @param {string} ownerSource Class source.
 * @param {string} callableSource Standalone callable source.
 * @param {string} methodName Callable name.
 * @returns {{ source: string, definitions: Map<string, object> }} Source model.
 */
function sourceModel(ownerSource, callableSource, methodName) {
    if (ownerSource) return classModel(ownerSource)
    if (!callableSource) return { source: '', definitions: new Map() }
    const wrapped = `(${callableSource})`
    try {
        const program = parseProgram(wrapped)
        const expression = program.body[0]?.expression
        if (!isFunction(expression)) {
            return { source: wrapped, definitions: new Map() }
        }
        return {
            source: wrapped,
            definitions: new Map([
                [
                    methodName,
                    definitionFromFunction(
                        methodName,
                        expression,
                        wrapped,
                        '',
                        false,
                        'method'
                    )
                ]
            ])
        }
    } catch {
        return { source: wrapped, definitions: new Map() }
    }
}

/**
 * Parses class methods and accessors.
 * @param {string} source Class source.
 * @returns {{ source: string, definitions: Map<string, object> }} Source model.
 */
function classModel(source) {
    try {
        const program = parseProgram(source)
        const classNode = program.body.find(
            (node) =>
                node.type === 'ClassDeclaration' ||
                node.type === 'ClassExpression'
        )
        const definitions = new Map()
        for (const element of classNode?.body?.body || []) {
            if (element.type !== 'MethodDefinition') continue
            const name = propertyName(element.key)
            if (!name) continue
            const key =
                element.kind === 'method' || element.kind === 'constructor'
                    ? name
                    : `${element.static ? 'static' : 'instance'}:${element.kind}:${name}`
            definitions.set(
                key,
                definitionFromFunction(
                    name,
                    element.value,
                    source,
                    precedingJsdoc(source, element.start),
                    element.static,
                    element.kind
                )
            )
        }
        return { source, definitions }
    } catch {
        return { source, definitions: new Map() }
    }
}

/**
 * Parses modern JavaScript without executing it.
 * @param {string} source JavaScript source.
 * @returns {import('acorn').Node} Program node.
 */
function parseProgram(source) {
    return parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowHashBang: true
    })
}

/**
 * Creates one normalized method definition.
 * @param {string} name Method name.
 * @param {object} node Function node.
 * @param {string} source Full source.
 * @param {string} jsdoc Preceding JSDoc.
 * @param {boolean} isStatic Static flag.
 * @param {string} kind Method kind.
 * @returns {object} Definition.
 */
function definitionFromFunction(name, node, source, jsdoc, isStatic, kind) {
    return {
        name,
        node,
        source,
        jsdoc,
        static: isStatic,
        kind,
        parameters: node.params || []
    }
}

/**
 * Collects option fields through lexical and internal-call data flow.
 * @param {{ definitions: Map<string, object> }} model Source model.
 * @param {object} initial Initial definition.
 * @returns {string[]} Sorted option fields.
 */
function optionFields(model, initial) {
    const fields = new Set()
    const visited = new Set()

    /**
     * Visits one method with option-bearing parameter indexes.
     * @param {object} definition Method definition.
     * @param {Map<number, Set<string>>} taintedParameters Tainted params.
     * @returns {void}
     */
    function visit(definition, taintedParameters) {
        const visitKey = `${definition.name}:${[...taintedParameters]
            .map(([index, excluded]) => `${index}:${[...excluded].sort()}`)
            .join('|')}`
        if (visited.has(visitKey)) return
        visited.add(visitKey)

        const scope = new Scope()
        definition.parameters.forEach((parameter, index) => {
            for (const name of patternNames(parameter)) {
                scope.declare(
                    name,
                    taintedParameters.has(index)
                        ? optionOrigin(taintedParameters.get(index))
                        : null
                )
            }
        })
        for (const [index] of taintedParameters) {
            const name = patternNames(definition.parameters[index])[0]
            if (!name) continue
            for (const field of documentedParameterFields(
                definition.jsdoc,
                name
            )) {
                if (!taintedParameters.get(index).has(field.split('.')[0])) {
                    fields.add(field)
                }
            }
        }
        walkOptions(definition.node.body, scope, model, fields, visit)
    }

    const initialTaint = new Map()
    initial.parameters.forEach((parameter, index) => {
        const name = patternNames(parameter)[0] || ''
        if (OPTION_PARAMETER_PATTERN.test(name)) {
            initialTaint.set(index, new Set())
        }
    })
    if (!initialTaint.size) return []
    visit(initial, initialTaint)
    return [...fields].sort()
}

/**
 * Walks one syntax subtree while maintaining lexical bindings.
 * @param {object | null} node Syntax node.
 * @param {Scope} scope Lexical scope.
 * @param {{ definitions: Map<string, object> }} model Source model.
 * @param {Set<string>} fields Collected fields.
 * @param {Function} visitMethod Internal-method visitor.
 * @returns {void}
 */
function walkOptions(node, scope, model, fields, visitMethod) {
    if (!node) return
    if (node.type === 'ChainExpression') {
        walkOptions(node.expression, scope, model, fields, visitMethod)
        return
    }
    if (node.type === 'BlockStatement') {
        const block = new Scope(scope)
        for (const statement of node.body) {
            walkOptions(statement, block, model, fields, visitMethod)
        }
        return
    }
    if (node.type === 'VariableDeclaration') {
        for (const declaration of node.declarations) {
            const origin = expressionOrigin(declaration.init, scope)
            for (const name of patternNames(declaration.id)) {
                scope.declare(name, origin)
            }
            walkOptions(declaration.init, scope, model, fields, visitMethod)
        }
        return
    }
    if (node.type === 'ForOfStatement' || node.type === 'ForInStatement') {
        walkOptions(node.right, scope, model, fields, visitMethod)
        const loop = new Scope(scope)
        declareLoopBinding(node.left, loop)
        walkOptions(node.body, loop, model, fields, visitMethod)
        return
    }
    if (isFunction(node)) {
        const child = new Scope(scope)
        for (const parameter of node.params || []) {
            for (const name of patternNames(parameter))
                child.declare(name, null)
        }
        walkOptions(node.body, child, model, fields, visitMethod)
        return
    }
    if (node.type === 'MemberExpression') {
        const root = memberRoot(node)
        const binding = root ? scope.resolve(root.name) : null
        const field = root ? firstMemberAfterRoot(node, root.node) : ''
        if (
            binding?.origin?.type === 'options' &&
            field &&
            !binding.origin.excluded.has(field)
        ) {
            fields.add(field)
        }
    }
    if (
        node.type === 'AssignmentExpression' &&
        node.left.type === 'Identifier'
    ) {
        const binding = scope.resolve(node.left.name)
        if (binding) binding.origin = expressionOrigin(node.right, scope)
    }
    if (node.type === 'CallExpression') {
        const called = internalCall(node, model.definitions)
        if (called) {
            const tainted = new Map()
            node.arguments.forEach((argument, index) => {
                const origin = expressionOrigin(argument, scope)
                if (origin?.type === 'options') {
                    tainted.set(index, new Set(origin.excluded))
                }
            })
            if (tainted.size) visitMethod(called, tainted)
        }
    }
    for (const child of childNodes(node)) {
        walkOptions(child, scope, model, fields, visitMethod)
    }
}

/**
 * Collects returned object paths, excluding nested callback returns.
 * @param {{ definitions: Map<string, object> }} model Source model.
 * @param {object} initial Initial definition.
 * @returns {string[]} Sorted result paths.
 */
function returnedFields(model, initial) {
    const fields = new Set()
    const visited = new Set()

    /**
     * Visits one result-producing method.
     * @param {object} definition Method definition.
     * @returns {void}
     */
    function visit(definition) {
        if (visited.has(definition)) return
        visited.add(definition)
        for (const field of documentedReturnFields(definition.jsdoc)) {
            fields.add(field)
        }
        const bindings = new Map()
        collectMethodReturns(
            definition.node.body,
            bindings,
            model.definitions,
            fields,
            visit
        )
    }

    visit(initial)
    return [...fields].sort()
}

/**
 * Visits statements in one method only.
 * @param {object | null} node Syntax node.
 * @param {Map<string, object>} bindings Bound expressions.
 * @param {Map<string, object>} definitions Internal definitions.
 * @param {Set<string>} fields Collected fields.
 * @param {Function} visitMethod Internal-method visitor.
 * @returns {void}
 */
function collectMethodReturns(
    node,
    bindings,
    definitions,
    fields,
    visitMethod
) {
    if (!node || isFunction(node)) return
    if (node.type === 'VariableDeclarator') {
        if (node.id.type === 'Identifier' && node.init) {
            bindings.set(node.id.name, {
                expression: node.init,
                assignedPaths: new Set()
            })
        }
        return
    }
    if (node.type === 'AssignmentExpression') {
        if (node.left.type === 'Identifier') {
            bindings.set(node.left.name, {
                expression: node.right,
                assignedPaths: new Set()
            })
        } else {
            const assignment = assignedObjectPath(node.left, bindings)
            if (assignment) {
                bindings
                    .get(assignment.binding)
                    .assignedPaths.add(assignment.path)
            }
        }
        return
    }
    if (node.type === 'ReturnStatement') {
        collectExpressionFields(
            node.argument,
            '',
            bindings,
            definitions,
            fields,
            visitMethod,
            new Set()
        )
        return
    }
    for (const child of childNodes(node)) {
        collectMethodReturns(child, bindings, definitions, fields, visitMethod)
    }
}

/**
 * Extracts paths from an expression that contributes to a return value.
 * @param {object | null} expression Value expression.
 * @param {string} prefix Parent path.
 * @param {Map<string, object>} bindings Bound expressions.
 * @param {Map<string, object>} definitions Internal definitions.
 * @param {Set<string>} fields Collected fields.
 * @param {Function} visitMethod Internal-method visitor.
 * @param {Set<object>} seen Expressions already resolved.
 * @returns {void}
 */
function collectExpressionFields(
    expression,
    prefix,
    bindings,
    definitions,
    fields,
    visitMethod,
    seen
) {
    if (!expression || seen.has(expression)) return
    seen.add(expression)
    if (
        expression.type === 'AwaitExpression' ||
        expression.type === 'ChainExpression'
    ) {
        collectExpressionFields(
            expression.argument || expression.expression,
            prefix,
            bindings,
            definitions,
            fields,
            visitMethod,
            seen
        )
        return
    }
    if (expression.type === 'Identifier') {
        const binding = bindings.get(expression.name)
        if (!binding) return
        for (const assignedPath of binding.assignedPaths) {
            fields.add(prefix ? `${prefix}.${assignedPath}` : assignedPath)
        }
        collectExpressionFields(
            binding.expression,
            prefix,
            bindings,
            definitions,
            fields,
            visitMethod,
            seen
        )
        return
    }
    if (expression.type === 'ObjectExpression') {
        for (const property of expression.properties) {
            if (property.type === 'SpreadElement') {
                collectExpressionFields(
                    property.argument,
                    prefix,
                    bindings,
                    definitions,
                    fields,
                    visitMethod,
                    seen
                )
                continue
            }
            const name = propertyName(property.key)
            if (!name) continue
            const path = prefix ? `${prefix}.${name}` : name
            fields.add(path)
            collectExpressionFields(
                property.value,
                path,
                bindings,
                definitions,
                fields,
                visitMethod,
                seen
            )
        }
        return
    }
    if (expression.type === 'ArrayExpression') {
        for (const element of expression.elements) {
            collectExpressionFields(
                element,
                prefix ? `${prefix}[]` : '',
                bindings,
                definitions,
                fields,
                visitMethod,
                seen
            )
        }
        return
    }
    if (expression.type === 'CallExpression') {
        const called = internalCall(expression, definitions)
        if (called) {
            visitMethod(called)
            return
        }
        for (const argument of expression.arguments) {
            collectExpressionFields(
                argument,
                prefix,
                bindings,
                definitions,
                fields,
                visitMethod,
                seen
            )
        }
        return
    }
    if (
        expression.type === 'ConditionalExpression' ||
        expression.type === 'LogicalExpression'
    ) {
        for (const branch of [
            expression.consequent || expression.left,
            expression.alternate || expression.right
        ]) {
            collectExpressionFields(
                branch,
                prefix,
                bindings,
                definitions,
                fields,
                visitMethod,
                seen
            )
        }
    }
}

/**
 * Finds an internal same-class call.
 * @param {object} call Call expression.
 * @param {Map<string, object>} definitions Method definitions.
 * @returns {object | null} Called definition.
 */
function internalCall(call, definitions) {
    const callee =
        call.callee?.type === 'ChainExpression'
            ? call.callee.expression
            : call.callee
    if (callee?.type !== 'MemberExpression') return null
    const name = propertyName(callee.property)
    if (!name) return null
    if (
        callee.object.type !== 'ThisExpression' &&
        callee.object.type !== 'Identifier'
    ) {
        return null
    }
    return definitions.get(name) || null
}

/**
 * Resolves option provenance for directly forwarded expressions.
 * @param {object | null} expression Expression node.
 * @param {Scope} scope Lexical scope.
 * @returns {{ type: 'options', excluded: Set<string> } | null} Origin.
 */
function expressionOrigin(expression, scope) {
    if (!expression) return null
    if (expression.type === 'ChainExpression') {
        return expressionOrigin(expression.expression, scope)
    }
    if (expression.type === 'Identifier') {
        const origin = scope.resolve(expression.name)?.origin
        return origin?.type === 'options' ? optionOrigin(origin.excluded) : null
    }
    if (expression.type !== 'ObjectExpression') return null
    let origin = null
    for (const property of expression.properties) {
        if (property.type === 'SpreadElement') {
            const spread = expressionOrigin(property.argument, scope)
            if (spread?.type === 'options')
                origin = optionOrigin(spread.excluded)
            continue
        }
        if (!origin) continue
        const name = propertyName(property.key)
        if (name) origin.excluded.add(name)
    }
    return origin
}

/**
 * Creates an immutable-by-convention option origin.
 * @param {Iterable<string>} [excluded] Overridden fields.
 * @returns {{ type: 'options', excluded: Set<string> }} Origin.
 */
function optionOrigin(excluded = []) {
    return { type: 'options', excluded: new Set(excluded) }
}

/**
 * Declares a loop binding as a new untainted lexical binding.
 * @param {object} left Loop left-hand side.
 * @param {Scope} scope Loop scope.
 * @returns {void}
 */
function declareLoopBinding(left, scope) {
    const pattern =
        left.type === 'VariableDeclaration' ? left.declarations[0]?.id : left
    for (const name of patternNames(pattern)) scope.declare(name, null)
}

/**
 * Returns identifier names declared by one binding pattern.
 * @param {object | null} pattern Binding pattern.
 * @returns {string[]} Names.
 */
function patternNames(pattern) {
    if (!pattern) return []
    if (pattern.type === 'Identifier') return [pattern.name]
    if (pattern.type === 'AssignmentPattern') return patternNames(pattern.left)
    if (pattern.type === 'RestElement') return patternNames(pattern.argument)
    if (pattern.type === 'ArrayPattern') {
        return pattern.elements.flatMap(patternNames)
    }
    if (pattern.type === 'ObjectPattern') {
        return pattern.properties.flatMap((property) =>
            patternNames(property.value || property.argument)
        )
    }
    return []
}

/**
 * Returns enumerable child syntax nodes.
 * @param {object} node Parent node.
 * @returns {object[]} Child nodes.
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
 * Returns whether a node introduces function parameter scope.
 * @param {object | null} node Syntax node.
 * @returns {boolean} Function-node flag.
 */
function isFunction(node) {
    return [
        'ArrowFunctionExpression',
        'FunctionDeclaration',
        'FunctionExpression'
    ].includes(node?.type)
}

/**
 * Resolves a static property name.
 * @param {object | null} node Property node.
 * @returns {string} Property name.
 */
function propertyName(node) {
    if (!node) return ''
    if (node.type === 'Identifier' || node.type === 'PrivateIdentifier') {
        return node.type === 'PrivateIdentifier' ? `#${node.name}` : node.name
    }
    if (node.type === 'Literal') return String(node.value)
    return ''
}

/**
 * Finds the identifier at the root of a member chain.
 * @param {object} member Member expression.
 * @returns {{ name: string, node: object } | null} Root identifier.
 */
function memberRoot(member) {
    let current = member
    while (current?.type === 'MemberExpression') current = current.object
    return current?.type === 'Identifier'
        ? { name: current.name, node: current }
        : null
}

/**
 * Returns the first property after a member-chain root.
 * @param {object} member Member expression.
 * @param {object} root Root identifier node.
 * @returns {string} First property.
 */
function firstMemberAfterRoot(member, root) {
    let current = member
    let candidate = ''
    while (current?.type === 'MemberExpression') {
        candidate = propertyName(current.property)
        if (current.object === root) return candidate
        current = current.object
    }
    return ''
}

/**
 * Resolves a member assignment rooted at a bound returned object.
 * @param {object} left Assignment target.
 * @param {Map<string, object>} bindings Bound expressions.
 * @returns {{ binding: string, path: string } | null} Assigned field path.
 */
function assignedObjectPath(left, bindings) {
    if (left.type !== 'MemberExpression') return null
    const parts = []
    let current = left
    while (current.type === 'MemberExpression') {
        const name = propertyName(current.property)
        if (!name) return null
        parts.unshift(name)
        current = current.object
    }
    return current.type === 'Identifier' && bindings.has(current.name)
        ? { binding: current.name, path: parts.join('.') }
        : null
}

/**
 * Returns the JSDoc immediately before a syntax node.
 * @param {string} source Source text.
 * @param {number} start Node start.
 * @returns {string} JSDoc block.
 */
function precedingJsdoc(source, start) {
    const end = source.lastIndexOf('*/', start)
    if (end < 0 || source.slice(end + 2, start).trim()) return ''
    const opening = source.lastIndexOf('/**', end)
    return opening < 0 ? '' : source.slice(opening, end + 2)
}

/**
 * Returns documented object fields for one parameter.
 * @param {string} jsdoc JSDoc block.
 * @param {string} parameter Parameter name.
 * @returns {string[]} Field paths.
 */
function documentedParameterFields(jsdoc, parameter) {
    const row = jsdocTags(jsdoc, 'param').find(
        (entry) => entry.name === parameter
    )
    return row ? objectTypePaths(row.type) : []
}

/**
 * Returns documented object fields for a return value.
 * @param {string} jsdoc JSDoc block.
 * @returns {string[]} Field paths.
 */
function documentedReturnFields(jsdoc) {
    const row = jsdocTags(jsdoc, 'returns')[0]
    return row ? objectTypePaths(row.type) : []
}

/**
 * Parses balanced JSDoc type tags.
 * @param {string} jsdoc JSDoc block.
 * @param {'param' | 'returns'} tag Tag name.
 * @returns {{ type: string, name: string }[]} Tags.
 */
function jsdocTags(jsdoc, tag) {
    const rows = []
    const pattern = new RegExp(`@${tag}\\s*\\{`, 'gu')
    for (const match of jsdoc.matchAll(pattern)) {
        const opening = match.index + match[0].lastIndexOf('{')
        const closing = closingDelimiter(jsdoc, opening)
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
 * Expands object-shaped JSDoc types into paths.
 * @param {string} type Type expression.
 * @param {string} [prefix] Parent path.
 * @returns {string[]} Paths.
 */
function objectTypePaths(type, prefix = '') {
    const opening = type.indexOf('{')
    if (opening < 0) return []
    const closing = closingDelimiter(type, opening)
    if (closing < 0) return []
    const fields = []
    for (const declaration of splitTopLevel(type.slice(opening + 1, closing))) {
        const match = declaration.match(
            /^\s*([A-Za-z_$][\w$]*)(?:\?)?\s*:\s*([\s\S]+)$/u
        )
        if (!match) continue
        const path = prefix ? `${prefix}.${match[1]}` : match[1]
        fields.push(path, ...objectTypePaths(match[2], path))
    }
    return fields
}

/**
 * Splits a comma-delimited type expression at top level.
 * @param {string} source Source text.
 * @returns {string[]} Entries.
 */
function splitTopLevel(source) {
    const entries = []
    let start = 0
    let depth = 0
    for (let index = 0; index < source.length; index += 1) {
        if ('{[('.includes(source[index])) depth += 1
        else if ('}])'.includes(source[index])) depth -= 1
        else if (source[index] === ',' && depth === 0) {
            entries.push(source.slice(start, index).trim())
            start = index + 1
        }
    }
    const tail = source.slice(start).trim()
    if (tail) entries.push(tail)
    return entries
}

/**
 * Finds a matching JSDoc/type closing brace.
 * @param {string} source Source text.
 * @param {number} opening Opening brace index.
 * @returns {number} Closing brace index.
 */
function closingDelimiter(source, opening) {
    let depth = 0
    for (let index = opening; index < source.length; index += 1) {
        if (source[index] === '{') depth += 1
        else if (source[index] === '}' && --depth === 0) return index
    }
    return -1
}

/**
 * One lexical scope with mutable binding origins.
 */
class Scope {
    /**
     * Creates a scope.
     * @param {Scope | null} [parent] Parent scope.
     */
    constructor(parent = null) {
        this.parent = parent
        this.bindings = new Map()
    }

    /**
     * Declares a binding.
     * @param {string} name Binding name.
     * @param {object | null} origin Option origin.
     * @returns {void}
     */
    declare(name, origin) {
        this.bindings.set(name, { origin })
    }

    /**
     * Resolves a binding through parent scopes.
     * @param {string} name Binding name.
     * @returns {{ origin: object | null } | null} Binding.
     */
    resolve(name) {
        return this.bindings.get(name) || this.parent?.resolve(name) || null
    }
}
