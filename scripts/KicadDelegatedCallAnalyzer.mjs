// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadAbstractScope as AbstractScope } from './KicadContractFlowScopes.mjs'
import { KicadDelegatedControlFlow } from './KicadDelegatedControlFlow.mjs'
import { KicadOptionControlFlow } from './KicadOptionControlFlow.mjs'

const OPTION_NAME = /(?:args|config|options?|request|settings)$/iu

/**
 * Resolves reachable delegated calls through exact module and lexical symbols.
 */
export class KicadDelegatedCallAnalyzer {
    /**
     * Captures transitive call edges for one runtime callable.
     * @param {object} registry Module contract registry.
     * @param {Function} ownerValue Runtime owner.
     * @param {object} callable Public callable contract.
     * @returns {object[]} Exact delegated call edges.
     */
    static capture(registry, ownerValue, callable) {
        const context = registry?.contextFor(ownerValue)
        if (!context) return []
        const analyzer = new DelegatedAnalyzer(registry)
        return analyzer.capture(context, callable)
    }
}

/**
 * One graph-aware abstract interpreter.
 */
class DelegatedAnalyzer {
    /**
     * Creates an analyzer.
     * @param {object} registry Module registry.
     */
    constructor(registry) {
        this.registry = registry
        this.edges = []
        this.active = new Set()
        this.flowHooks = {
            bindPattern,
            evaluate: (node, scope, module) =>
                this.#evaluate(node, scope, module),
            functionValue,
            unknownValue
        }
    }

    /**
     * Captures one root callable.
     * @param {object} context Runtime symbol context.
     * @param {object} callable Callable contract.
     * @returns {object[]} Call edges.
     */
    capture(context, callable) {
        const definition = callableDefinition(context, callable)
        if (!definition) return []
        const moduleScope = this.#moduleScope(context.module)
        const scope = new AbstractScope(moduleScope)
        definition.params.forEach((parameter, index) => {
            bindPattern(parameter, rootParameterValue(parameter, index), scope)
        })
        const outcome = KicadDelegatedControlFlow.executeFunctionBody(
            definition.body,
            scope,
            context.module,
            this.flowHooks
        )
        for (const row of outcome.abrupt) {
            if (row.type === 'return') markReturned(row.value)
        }
        return this.edges
    }

    /**
     * Builds the exact top-level symbol scope for a module.
     * @param {object} module Module record.
     * @returns {AbstractScope} Module scope.
     */
    #moduleScope(module) {
        const scope = new AbstractScope()
        scope.declare('Object', intrinsicNamespaceValue('Object'))
        scope.declare('JSON', intrinsicNamespaceValue('JSON'))
        for (const [name, value] of module.imports) scope.declare(name, value)
        for (const [name, declaration] of module.declarations) {
            if (declaration.type === 'FunctionDeclaration') {
                scope.declare(name, functionValue(declaration, scope, module))
                continue
            }
            if (declaration.type === 'ClassDeclaration') {
                const runtime = this.registry.valueFor(module, name)
                scope.declare(
                    name,
                    runtime
                        ? runtimeValue(runtime, sourceMethodNames(declaration))
                        : classValue(declaration, scope, module)
                )
            }
        }
        for (const [name, declaration] of module.declarations) {
            if (declaration.type !== 'VariableDeclarator') continue
            scope.declare(
                name,
                this.#evaluate(declaration.init, scope, module, false)
            )
        }
        return scope
    }

    /**
     * Evaluates one expression.
     * @param {object | null} node Expression.
     * @param {AbstractScope} scope Scope.
     * @param {object} module Module record.
     * @param {boolean} [recordEdges] Whether runtime calls become edges.
     * @returns {object} Abstract value.
     */
    #evaluate(node, scope, module, recordEdges = true) {
        if (!node) return unknownValue()
        if (node.type === 'ChainExpression') {
            return this.#evaluate(node.expression, scope, module, recordEdges)
        }
        if (node.type === 'Identifier') {
            return scope.resolve(node.name) || unknownValue()
        }
        if (node.type === 'Literal' || node.type === 'TemplateLiteral') {
            return primitiveValue()
        }
        if (isFunction(node)) return functionValue(node, scope, module)
        if (node.type === 'ObjectExpression') {
            return this.#objectExpression(node, scope, module, recordEdges)
        }
        if (node.type === 'ArrayExpression') {
            return arrayValue(
                node.elements.map((row) =>
                    this.#evaluate(row, scope, module, recordEdges)
                )
            )
        }
        if (node.type === 'MemberExpression') {
            return memberValue(
                this.#evaluate(node.object, scope, module, recordEdges),
                propertyName(node.property)
            )
        }
        if (node.type === 'CallExpression') {
            const callee = this.#evaluate(
                node.callee,
                scope,
                module,
                recordEdges
            )
            const args = node.arguments.map((row) =>
                this.#evaluate(row, scope, module, recordEdges)
            )
            return this.#invoke(callee, args, recordEdges)
        }
        if (node.type === 'AssignmentExpression') {
            const value = this.#evaluate(node.right, scope, module, recordEdges)
            if (node.left.type === 'Identifier') {
                scope.assign(node.left.name, value)
            }
            return value
        }
        if (node.type === 'ConditionalExpression') {
            this.#evaluate(node.test, scope, module, recordEdges)
            const constant = booleanValue(node.test)
            if (constant === true) {
                return this.#evaluate(
                    node.consequent,
                    scope,
                    module,
                    recordEdges
                )
            }
            if (constant === false) {
                return this.#evaluate(
                    node.alternate,
                    scope,
                    module,
                    recordEdges
                )
            }
            return unionValue([
                this.#evaluate(
                    node.consequent,
                    scope.fork(),
                    module,
                    recordEdges
                ),
                this.#evaluate(
                    node.alternate,
                    scope.fork(),
                    module,
                    recordEdges
                )
            ])
        }
        if (node.type === 'LogicalExpression') {
            const left = this.#evaluate(node.left, scope, module, recordEdges)
            const decision =
                KicadOptionControlFlow.logicalRightReachability(node)
            if (decision === false) return left
            if (decision === true) {
                return this.#evaluate(node.right, scope, module, recordEdges)
            }
            return unionValue([
                left,
                this.#evaluate(node.right, scope.fork(), module, recordEdges)
            ])
        }
        if (node.type === 'SequenceExpression') {
            let value = unknownValue()
            for (const expression of node.expressions) {
                value = this.#evaluate(expression, scope, module, recordEdges)
            }
            return value
        }
        for (const child of childExpressions(node)) {
            this.#evaluate(child, scope, module, recordEdges)
        }
        return unknownValue()
    }

    /**
     * Evaluates an object literal.
     * @param {object} node Object expression.
     * @param {AbstractScope} scope Scope.
     * @param {object} module Module.
     * @param {boolean} recordEdges Edge flag.
     * @returns {object} Object value.
     */
    #objectExpression(node, scope, module, recordEdges) {
        const properties = new Map()
        let origins = []
        for (const property of node.properties) {
            if (property.type === 'SpreadElement') {
                const spread = this.#evaluate(
                    property.argument,
                    scope,
                    module,
                    recordEdges
                )
                for (const [name, value] of objectProperties(spread)) {
                    properties.set(name, value)
                }
                origins = cloneOrigins(spread.origins || [])
                continue
            }
            const name = propertyName(property.key)
            if (!name) continue
            properties.set(
                name,
                property.method
                    ? functionValue(property.value, scope, module)
                    : this.#evaluate(property.value, scope, module, recordEdges)
            )
            for (const origin of origins) {
                if (!origin.path.length) origin.excluded.add(name)
            }
        }
        return objectValue(properties, origins)
    }

    /**
     * Invokes abstract callable values.
     * @param {object} callee Callable value.
     * @param {object[]} args Arguments.
     * @param {boolean} recordEdges Edge flag.
     * @returns {object} Return value.
     */
    #invoke(callee, args, recordEdges) {
        if (callee.kind === 'union') {
            return unionValue(
                callee.values.map((row) => this.#invoke(row, args, recordEdges))
            )
        }
        if (callee.kind === 'intrinsic') {
            if (callee.name === 'Object.freeze')
                return args[0] || unknownValue()
            if (callee.name === 'Array.find') {
                return unionValue(callee.receiver.values)
            }
            return primitiveValue()
        }
        if (callee.kind === 'function') {
            return this.#invokeLocal(callee, args)
        }
        if (callee.kind !== 'runtime-callable') return unknownValue()
        const edge = {
            targetValue: callee.owner,
            methodName: callee.name,
            argumentOrigins: args.map((row) => cloneOrigins(row.origins || [])),
            contextResolved: false,
            returned: false,
            returnedFields: []
        }
        if (recordEdges) this.edges.push(edge)
        const invocation = this.#invokeRuntime(callee, args)
        edge.contextResolved = invocation.resolved
        return delegatedValue(edge, invocation.value)
    }

    /**
     * Invokes one local closure.
     * @param {object} callable Callable value.
     * @param {object[]} args Arguments.
     * @returns {{ resolved: boolean, value: object }} Return value.
     */
    #invokeLocal(callable, args) {
        const key = `${callable.module.url.href}:${callable.node.start}:${callable.node.end}`
        if (this.active.has(key)) return unknownValue()
        this.active.add(key)
        const scope = new AbstractScope(callable.scope)
        callable.node.params.forEach((parameter, index) => {
            bindPattern(parameter, args[index] || unknownValue(), scope)
        })
        const outcome = KicadDelegatedControlFlow.executeFunctionBody(
            callable.node.body,
            scope,
            callable.module,
            this.flowHooks
        )
        this.active.delete(key)
        return unionValue(
            outcome.abrupt
                .filter((row) => row.type === 'return')
                .map((row) => row.value)
        )
    }

    /**
     * Invokes one exact runtime method through its defining source.
     * @param {object} callable Runtime callable value.
     * @param {object[]} args Arguments.
     * @returns {object} Return value.
     */
    #invokeRuntime(callable, args) {
        const context = this.registry.contextFor(callable.owner)
        if (!context) return { resolved: false, value: unknownValue() }
        const definition = runtimeMethod(context, callable.name)
        if (!definition) return { resolved: false, value: unknownValue() }
        const key = `${context.module.url.href}:${definition.start}:${definition.end}`
        if (this.active.has(key)) {
            return { resolved: true, value: unknownValue() }
        }
        this.active.add(key)
        const scope = new AbstractScope(this.#moduleScope(context.module))
        definition.params.forEach((parameter, index) => {
            bindPattern(parameter, args[index] || unknownValue(), scope)
        })
        const outcome = KicadDelegatedControlFlow.executeFunctionBody(
            definition.body,
            scope,
            context.module,
            this.flowHooks
        )
        this.active.delete(key)
        return {
            resolved: true,
            value: unionValue(
                outcome.abrupt
                    .filter((row) => row.type === 'return')
                    .map((row) => row.value)
            )
        }
    }
}

/**
 * Returns a callable AST node for a public contract.
 * @param {object} context Runtime context.
 * @param {object} callable Callable contract.
 * @returns {object | null} Function node.
 */
function callableDefinition(context, callable) {
    if (callable.methodType === 'function') return context.declaration
    const name =
        callable.methodType === 'constructor' ? 'constructor' : callable.name
    return runtimeMethod(context, name)
}

/**
 * Returns one class method function node.
 * @param {object} context Runtime context.
 * @param {string} name Method name.
 * @returns {object | null} Function node.
 */
function runtimeMethod(context, name) {
    if (context.declaration.type !== 'ClassDeclaration') return null
    const row = context.declaration.body.body.find(
        (element) =>
            element.type === 'MethodDefinition' &&
            propertyName(element.key) === name
    )
    return row?.value || null
}

/**
 * Creates root parameter option provenance.
 * @param {object} parameter Parameter pattern.
 * @param {number} index Parameter index.
 * @returns {object} Parameter value.
 */
function rootParameterValue(parameter, index) {
    const target =
        parameter.type === 'AssignmentPattern' ? parameter.left : parameter
    const name = target.type === 'Identifier' ? target.name : ''
    const optionBearing =
        target.type === 'ObjectPattern' || OPTION_NAME.test(name)
    return unknownValue(
        optionBearing
            ? [{ parameterIndex: index, path: [], excluded: new Set() }]
            : []
    )
}

/**
 * Binds identifier and object patterns.
 * @param {object | null} pattern Pattern.
 * @param {object} value Abstract value.
 * @param {AbstractScope} scope Scope.
 * @returns {void}
 */
function bindPattern(pattern, value, scope) {
    if (!pattern) return
    if (pattern.type === 'AssignmentPattern') {
        bindPattern(pattern.left, value, scope)
        return
    }
    if (pattern.type === 'RestElement') {
        bindPattern(pattern.argument, value, scope)
        return
    }
    if (pattern.type === 'Identifier') {
        scope.declare(pattern.name, value)
        return
    }
    if (pattern.type !== 'ObjectPattern') return
    for (const property of pattern.properties) {
        if (property.type === 'RestElement') {
            bindPattern(property.argument, unknownValue(), scope)
            continue
        }
        bindPattern(
            property.value,
            memberValue(value, propertyName(property.key)),
            scope
        )
    }
}

/**
 * Marks delegated provenance contributing to a root return.
 * @param {object} value Abstract value.
 * @param {string} [prefix] Result prefix.
 * @returns {void}
 */
function markReturned(value, prefix = '') {
    if (value.kind === 'union') {
        for (const row of value.values) markReturned(row, prefix)
        return
    }
    if (value.kind === 'delegated') {
        value.edge.returned = true
        const fields = new Set()
        collectValuePaths(value.value, prefix, fields)
        value.edge.returnedFields = [...fields].sort()
        markReturned(value.value, prefix)
        return
    }
    if (value.kind === 'object') {
        for (const [name, row] of value.properties) {
            markReturned(row, prefix ? `${prefix}.${name}` : name)
        }
    }
    if (value.kind === 'array') {
        for (const row of value.values) {
            markReturned(row, prefix ? `${prefix}[]` : '')
        }
    }
}

/**
 * Collects abstract object paths.
 * @param {object} value Value.
 * @param {string} prefix Parent path.
 * @param {Set<string>} fields Fields.
 * @returns {void}
 */
function collectValuePaths(value, prefix, fields) {
    if (value.kind === 'union') {
        for (const row of value.values) collectValuePaths(row, prefix, fields)
        return
    }
    if (value.kind === 'delegated') {
        collectValuePaths(value.value, prefix, fields)
        return
    }
    if (value.kind === 'object') {
        for (const [name, row] of value.properties) {
            const path = prefix ? `${prefix}.${name}` : name
            fields.add(path)
            collectValuePaths(row, path, fields)
        }
    }
    if (value.kind === 'array') {
        for (const row of value.values) {
            collectValuePaths(row, prefix ? `${prefix}[]` : '', fields)
        }
    }
}

/**
 * Resolves a member value exactly.
 * @param {object} value Object value.
 * @param {string} name Property name.
 * @returns {object} Member value.
 */
function memberValue(value, name) {
    if (!name) return unknownValue()
    if (value.kind === 'union') {
        return unionValue(value.values.map((row) => memberValue(row, name)))
    }
    if (value.kind === 'namespace') {
        const member = value.namespace[name]
        return member === undefined ? unknownValue() : runtimeValue(member)
    }
    if (value.kind === 'intrinsic-namespace') {
        return intrinsicValue(`${value.name}.${name}`)
    }
    if (value.kind === 'array' && name === 'find') {
        return intrinsicValue('Array.find', value)
    }
    if (value.kind === 'runtime') {
        const descriptor = Object.getOwnPropertyDescriptor(value.value, name)
        return typeof descriptor?.value === 'function' ||
            value.sourceMethods?.has(name)
            ? runtimeCallableValue(value.value, name)
            : unknownValue()
    }
    if (value.kind === 'class') {
        const method = value.node.body.body.find(
            (row) =>
                row.type === 'MethodDefinition' &&
                propertyName(row.key) === name
        )
        return method
            ? functionValue(method.value, value.scope, value.module)
            : unknownValue()
    }
    if (value.kind === 'object') {
        const child = value.properties.get(name) || unknownValue()
        return withOrigins(
            child,
            (value.origins || []).map((origin) => ({
                ...origin,
                path: [...origin.path, name],
                excluded: new Set(origin.excluded)
            }))
        )
    }
    return unknownValue()
}

/**
 * Returns properties across object unions.
 * @param {object} value Abstract value.
 * @returns {Map<string, object>} Properties.
 */
function objectProperties(value) {
    if (value.kind === 'object') return value.properties
    if (value.kind !== 'union') return new Map()
    const properties = new Map()
    for (const row of value.values) {
        for (const [name, child] of objectProperties(row)) {
            properties.set(
                name,
                properties.has(name)
                    ? unionValue([properties.get(name), child])
                    : child
            )
        }
    }
    return properties
}

/** @param {object[]} [origins] Option origins. @returns {object} Unknown value. */
function unknownValue(origins = []) {
    return { kind: 'unknown', origins: cloneOrigins(origins) }
}

/** @returns {object} Primitive value. */
function primitiveValue() {
    return { kind: 'primitive', origins: [] }
}

/** @param {unknown} value Runtime value. @param {Set<string>} [sourceMethods] Source-visible methods. @returns {object} Runtime value. */
function runtimeValue(value, sourceMethods = new Set()) {
    return { kind: 'runtime', value, sourceMethods, origins: [] }
}

/** @param {object} node Class declaration. @returns {Set<string>} Source-visible method names. */
function sourceMethodNames(node) {
    return new Set(
        node.body.body
            .filter((row) => row.type === 'MethodDefinition')
            .map((row) => propertyName(row.key))
            .filter(Boolean)
    )
}

/** @param {object} node Class node. @param {AbstractScope} scope Scope. @param {object} module Module. @returns {object} Local class value. */
function classValue(node, scope, module) {
    return { kind: 'class', node, scope, module, origins: [] }
}

/** @param {object} node Function node. @param {AbstractScope} scope Scope. @param {object} module Module. @returns {object} Local function value. */
function functionValue(node, scope, module) {
    return { kind: 'function', node, scope, module, origins: [] }
}

/** @param {Map<string, object>} properties Properties. @param {object[]} [origins] Origins. @returns {object} Object value. */
function objectValue(properties, origins = []) {
    return { kind: 'object', properties, origins: cloneOrigins(origins) }
}

/** @param {object[]} values Items. @returns {object} Array value. */
function arrayValue(values) {
    return { kind: 'array', values, origins: [] }
}

/**
 * Creates a flattened union.
 * @param {object[]} values Values.
 * @returns {object} Value.
 */
function unionValue(values) {
    const rows = values.flatMap((row) =>
        row?.kind === 'union' ? row.values : [row || unknownValue()]
    )
    if (!rows.length) return unknownValue()
    if (rows.length === 1) return rows[0]
    return {
        kind: 'union',
        values: rows,
        origins: cloneOrigins(rows.flatMap((row) => row.origins || []))
    }
}

/** @param {Function} owner Owner. @param {string} name Method name. @returns {object} Runtime method value. */
function runtimeCallableValue(owner, name) {
    return { kind: 'runtime-callable', owner, name, origins: [] }
}

/** @param {object} edge Call edge. @param {object} value Contextual return value. @returns {object} Delegated result value. */
function delegatedValue(edge, value) {
    return { kind: 'delegated', edge, value, origins: [] }
}

/** @param {string} name Namespace name. @returns {object} Intrinsic namespace value. */
function intrinsicNamespaceValue(name) {
    return { kind: 'intrinsic-namespace', name, origins: [] }
}

/** @param {string} name Intrinsic name. @param {object | null} [receiver] Receiver. @returns {object} Intrinsic value. */
function intrinsicValue(name, receiver = null) {
    return { kind: 'intrinsic', name, receiver, origins: [] }
}

/** @param {object} value Value. @param {object[]} origins Origins. @returns {object} Value with replaced origins. */
function withOrigins(value, origins) {
    return { ...value, origins: cloneOrigins(origins) }
}

/** @param {object[]} origins Origins. @returns {object[]} Cloned origins. */
function cloneOrigins(origins) {
    return origins.map((origin) => ({
        parameterIndex: origin.parameterIndex,
        path: [...origin.path],
        excluded: new Set(origin.excluded)
    }))
}

/** @param {object | null} node Property node. @returns {string} Static property name. */
function propertyName(node) {
    if (!node) return ''
    if (node.type === 'Identifier') return node.name
    if (node.type === 'PrivateIdentifier') return `#${node.name}`
    if (node.type === 'Literal') return String(node.value)
    return ''
}

/** @param {object | null} node Expression. @returns {boolean | null} Statically known boolean. */
function booleanValue(node) {
    if (!node) return null
    if (node.type === 'Literal') return Boolean(node.value)
    if (node.type === 'UnaryExpression' && node.operator === '!') {
        const value = booleanValue(node.argument)
        return value === null ? null : !value
    }
    return null
}

/** @param {object | null} node Node. @returns {boolean} Whether the node is function syntax. */
function isFunction(node) {
    return [
        'ArrowFunctionExpression',
        'FunctionDeclaration',
        'FunctionExpression'
    ].includes(node?.type)
}

/** @param {object} node Parent node. @returns {object[]} Direct expression children. */
function childExpressions(node) {
    const rows = []
    for (const [key, value] of Object.entries(node)) {
        if (['start', 'end', 'loc', 'range'].includes(key)) continue
        for (const child of Array.isArray(value) ? value : [value]) {
            if (
                child &&
                (child.type === 'Identifier' || /Expression$/u.test(child.type))
            ) {
                rows.push(child)
            }
        }
    }
    return rows
}
