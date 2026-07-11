// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { parse } from 'acorn'

/**
 * Captures worker request and response contracts from executable syntax.
 */
export class KicadWorkerProtocolContract {
    /**
     * Captures one worker module protocol.
     * @param {string} source Worker module source.
     * @param {string} entrypoint Worker package entrypoint.
     * @returns {Record<string, any>} Worker protocol contract.
     */
    static capture(source, entrypoint) {
        const program = parse(source, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            allowHashBang: true
        })
        const requests = requestContracts(program)
        const responses = responseContracts(program)
        return {
            entrypoint,
            messages: [...requests, ...responses].sort((left, right) =>
                left.type.localeCompare(right.type)
            )
        }
    }
}

/**
 * Captures request discriminators and fields from function parameters.
 * @param {object} program Parsed module.
 * @returns {object[]} Request contracts.
 */
function requestContracts(program) {
    const requests = []
    for (const callable of functionNodes(program)) {
        const bindings = analyzeCallable(callable)
        for (const binding of bindings) {
            if (!binding.types.size) continue
            const fields = [...binding.fields]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([name, access]) => ({
                    name,
                    required: name === 'type' || access.required
                }))
            for (const type of binding.types) {
                requests.push({ type, direction: 'request', fields })
            }
        }
    }
    return mergeMessageContracts(requests)
}

/**
 * Analyzes one callable without entering nested callable bodies.
 * @param {object} callable Function node.
 * @returns {object[]} Parameter binding analyses.
 */
function analyzeCallable(callable) {
    const scope = new LexicalScope()
    const parameters = []
    for (const parameter of callable.params || []) {
        declarePattern(parameter, scope, true, parameters)
    }
    visit(callable.body, scope, null, callable)
    return parameters
}

/**
 * Visits executable syntax with lexical binding identity.
 * @param {object | null} node Syntax node.
 * @param {LexicalScope} scope Current scope.
 * @param {object | null} parent Parent node.
 * @param {object} rootCallable Callable currently being analyzed.
 * @returns {void}
 */
function visit(node, scope, parent, rootCallable) {
    if (!node) return
    if (isFunction(node) && node !== rootCallable) return
    if (node.type === 'BlockStatement' || node.type === 'Program') {
        const block = new LexicalScope(scope)
        predeclareStatements(node.body, block)
        for (const statement of node.body) {
            visit(statement, block, node, rootCallable)
        }
        return
    }
    if (node.type === 'CatchClause') {
        const caught = new LexicalScope(scope)
        declarePattern(node.param, caught)
        visit(node.body, caught, node, rootCallable)
        return
    }
    if (node.type === 'VariableDeclaration') {
        for (const declaration of node.declarations) {
            declarePattern(declaration.id, scope)
            visit(declaration.init, scope, declaration, rootCallable)
        }
        return
    }
    if (node.type === 'BinaryExpression') {
        recordDiscriminator(node, scope)
    }
    if (node.type === 'MemberExpression') {
        recordField(node, scope, parent)
    }
    for (const child of childNodes(node)) {
        visit(child, scope, node, rootCallable)
    }
}

/**
 * Records a literal type comparison on a parameter object.
 * @param {object} node Binary expression.
 * @param {LexicalScope} scope Current scope.
 * @returns {void}
 */
function recordDiscriminator(node, scope) {
    if (!['===', '!==', '==', '!='].includes(node.operator)) return
    const pairs = [
        [node.left, node.right],
        [node.right, node.left]
    ]
    for (const [member, literal] of pairs) {
        const access = memberAccess(member, scope)
        if (
            access?.name === 'type' &&
            access.binding.parameter &&
            literal.type === 'Literal' &&
            typeof literal.value === 'string'
        ) {
            access.binding.types.add(literal.value)
        }
    }
}

/**
 * Records one first-level field read from a parameter object.
 * @param {object} node Member expression.
 * @param {LexicalScope} scope Current scope.
 * @param {object | null} parent Parent node.
 * @returns {void}
 */
function recordField(node, scope, parent) {
    const access = memberAccess(node, scope)
    if (!access?.binding.parameter) return
    const existing = access.binding.fields.get(access.name) || {
        required: false
    }
    if (!optionalAccess(node, parent)) existing.required = true
    access.binding.fields.set(access.name, existing)
}

/**
 * Resolves a direct object field and its lexical root binding.
 * @param {object} node Expression.
 * @param {LexicalScope} scope Current scope.
 * @returns {{ binding: object, name: string } | null} Access descriptor.
 */
function memberAccess(node, scope) {
    const member = node.type === 'ChainExpression' ? node.expression : node
    if (member?.type !== 'MemberExpression') return null
    if (member.object.type !== 'Identifier') return null
    const name = propertyName(member.property)
    const binding = scope.resolve(member.object.name)
    return name && binding ? { binding, name } : null
}

/**
 * Returns whether an access is guarded by optional chaining or a fallback.
 * @param {object} node Member expression.
 * @param {object | null} parent Parent node.
 * @returns {boolean} Optional flag.
 */
function optionalAccess(node, parent) {
    return Boolean(
        node.optional ||
        parent?.type === 'ChainExpression' ||
        (parent?.type === 'LogicalExpression' &&
            ['||', '??'].includes(parent.operator) &&
            parent.left === node)
    )
}

/**
 * Captures literal response object fields from actual return syntax.
 * @param {object} program Parsed module.
 * @returns {object[]} Response contracts.
 */
function responseContracts(program) {
    const rows = []
    walkSyntax(program, (node, parent) => {
        const returned =
            parent?.type === 'ReturnStatement' ||
            (isFunction(parent) && parent.body === node)
        if (!returned || node.type !== 'ObjectExpression') return
        const properties = new Map(
            node.properties
                .filter((property) => property.type === 'Property')
                .map((property) => [propertyName(property.key), property.value])
                .filter(([name]) => name)
        )
        const type = properties.get('type')
        if (
            type?.type !== 'Literal' ||
            typeof type.value !== 'string' ||
            !type.value.startsWith('parser:')
        ) {
            return
        }
        rows.push({
            type: type.value,
            direction: 'response',
            fields: [...properties.keys()]
                .sort()
                .map((name) => ({ name, required: true }))
        })
    })
    return mergeMessageContracts(rows)
}

/**
 * Merges repeated message discoveries by type and direction.
 * @param {object[]} rows Candidate contracts.
 * @returns {object[]} Merged contracts.
 */
function mergeMessageContracts(rows) {
    const merged = new Map()
    for (const row of rows) {
        const key = `${row.direction}:${row.type}`
        const fields = merged.get(key)?.fields || new Map()
        for (const field of row.fields) {
            fields.set(field.name, {
                name: field.name,
                required: Boolean(
                    fields.get(field.name)?.required || field.required
                )
            })
        }
        merged.set(key, { ...row, fields })
    }
    return [...merged.values()].map((row) => ({
        ...row,
        fields: [...row.fields.values()].sort((left, right) =>
            left.name.localeCompare(right.name)
        )
    }))
}

/**
 * Predeclares block bindings so later declarations shadow earlier names.
 * @param {object[]} statements Statements.
 * @param {LexicalScope} scope Block scope.
 * @returns {void}
 */
function predeclareStatements(statements, scope) {
    for (const statement of statements) {
        if (statement.type === 'FunctionDeclaration' && statement.id) {
            scope.declare(statement.id.name)
        }
        if (statement.type !== 'VariableDeclaration') continue
        for (const declaration of statement.declarations) {
            declarePattern(declaration.id, scope)
        }
    }
}

/**
 * Declares every identifier in a binding pattern.
 * @param {object | null} pattern Binding pattern.
 * @param {LexicalScope} scope Target scope.
 * @param {boolean} [parameter] Parameter flag.
 * @param {object[]} [parameters] Parameter binding output.
 * @returns {void}
 */
function declarePattern(pattern, scope, parameter = false, parameters = []) {
    if (!pattern) return
    if (pattern.type === 'Identifier') {
        const binding = scope.declare(pattern.name, parameter)
        if (parameter) parameters.push(binding)
        return
    }
    if (pattern.type === 'AssignmentPattern') {
        declarePattern(pattern.left, scope, parameter, parameters)
        return
    }
    if (pattern.type === 'RestElement') {
        declarePattern(pattern.argument, scope, parameter, parameters)
        return
    }
    for (const child of childNodes(pattern)) {
        declarePattern(child, scope, parameter, parameters)
    }
}

/**
 * Lists every function syntax node in a module.
 * @param {object} program Parsed module.
 * @returns {object[]} Function nodes.
 */
function functionNodes(program) {
    const rows = []
    walkSyntax(program, (node) => {
        if (isFunction(node)) rows.push(node)
    })
    return rows
}

/**
 * Walks parsed syntax, which inherently excludes comments and string contents.
 * @param {object} node Root node.
 * @param {Function} visitor Visitor.
 * @param {object | null} [parent] Parent node.
 * @returns {void}
 */
function walkSyntax(node, visitor, parent = null) {
    visitor(node, parent)
    for (const child of childNodes(node)) walkSyntax(child, visitor, node)
}

/**
 * Returns syntax children.
 * @param {object} node Parent node.
 * @returns {object[]} Child nodes.
 */
function childNodes(node) {
    const children = []
    for (const [key, value] of Object.entries(node)) {
        if (['start', 'end', 'loc', 'range'].includes(key)) continue
        const rows = Array.isArray(value) ? value : [value]
        children.push(
            ...rows.filter((row) => row && typeof row.type === 'string')
        )
    }
    return children
}

/**
 * Returns one static property name.
 * @param {object | null} node Property node.
 * @returns {string} Name.
 */
function propertyName(node) {
    if (!node) return ''
    if (node.type === 'Identifier') return node.name
    if (node.type === 'Literal') return String(node.value)
    return ''
}

/**
 * Returns whether one node is function syntax.
 * @param {object | null} node Syntax node.
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
 * One lexical binding scope.
 */
class LexicalScope {
    /**
     * Creates one scope.
     * @param {LexicalScope | null} [parent] Parent scope.
     */
    constructor(parent = null) {
        this.parent = parent
        this.bindings = new Map()
    }

    /**
     * Declares or returns one binding.
     * @param {string} name Binding name.
     * @param {boolean} [parameter] Parameter flag.
     * @returns {object} Binding.
     */
    declare(name, parameter = false) {
        if (!this.bindings.has(name)) {
            this.bindings.set(name, {
                parameter,
                types: new Set(),
                fields: new Map()
            })
        }
        return this.bindings.get(name)
    }

    /**
     * Resolves one visible binding.
     * @param {string} name Binding name.
     * @returns {object | null} Binding.
     */
    resolve(name) {
        return this.bindings.get(name) || this.parent?.resolve(name) || null
    }
}
