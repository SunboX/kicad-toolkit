// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const ARRAY_RESULT_METHODS = new Set([
    'concat',
    'filter',
    'flat',
    'flatMap',
    'map',
    'slice',
    'splice',
    'toReversed',
    'toSorted',
    'toSpliced',
    'with'
])

/**
 * Resolves callable members and intrinsic Array identity for option analysis.
 */
export class KicadOptionValueResolver {
    /**
     * Creates a resolver bound to the owning analyzer's syntax operations.
     * @param {object} operations Resolver operations.
     */
    constructor(operations) {
        this.operations = operations
    }

    /**
     * Resolves all metadata for one expression.
     * @param {object | null} node Expression.
     * @param {object} scope Current scope.
     * @param {object} model Source model.
     * @returns {object} Abstract value.
     */
    value(node, scope, model) {
        return {
            origins: this.operations.expressionOrigins(node, scope),
            callable: this.operations.callableValue(node, scope, model),
            members: this.members(node, scope, model),
            arrayLike: this.arrayLike(node, scope, model)
        }
    }

    /**
     * Resolves callable members on bound or literal objects.
     * @param {object | null} node Expression.
     * @param {object} scope Current scope.
     * @param {object} model Source model.
     * @returns {Map<string, object>} Member callables.
     */
    members(node, scope, model) {
        if (!node) return new Map()
        if (node.type === 'ChainExpression') {
            return this.members(node.expression, scope, model)
        }
        if (node.type === 'Identifier') {
            return new Map(scope.resolve(node.name)?.members || [])
        }
        if (node.type !== 'ObjectExpression') return new Map()
        const members = new Map()
        for (const property of node.properties) {
            if (property.type === 'SpreadElement') continue
            const name = this.operations.propertyName(property.key)
            const callable = this.operations.callableValue(
                property.value,
                scope,
                model
            )
            if (name && callable) members.set(name, callable)
        }
        return members
    }

    /**
     * Returns whether an expression is statically known to produce an Array.
     * @param {object | null} node Expression.
     * @param {object} scope Current scope.
     * @param {object} model Source model.
     * @returns {boolean} Array flag.
     */
    arrayLike(node, scope, model) {
        if (!node) return false
        if (node.type === 'ChainExpression') {
            return this.arrayLike(node.expression, scope, model)
        }
        if (node.type === 'ArrayExpression') return true
        if (node.type === 'Identifier') {
            return scope.resolve(node.name)?.arrayLike === true
        }
        if (node.type === 'LogicalExpression') {
            const left = this.arrayLike(node.left, scope, model)
            const right = this.arrayLike(node.right, scope, model)
            const literal = this.operations.staticValue(node.left)
            if (literal.known) {
                if (node.operator === '&&') {
                    return literal.value ? right : left
                }
                if (node.operator === '||') {
                    return literal.value ? left : right
                }
                if (node.operator === '??') {
                    return literal.value === null || literal.value === undefined
                        ? right
                        : left
                }
            }
            if (node.operator === '&&' && left) return right
            return left && right
        }
        if (node.type === 'ConditionalExpression') {
            const selected = this.operations.booleanValue(node.test)
            if (selected !== null) {
                return this.arrayLike(
                    selected ? node.consequent : node.alternate,
                    scope,
                    model
                )
            }
            return (
                (this.#guardMatches(node.test, node.consequent) &&
                    this.arrayLike(node.alternate, scope, model)) ||
                (this.#guardMatches(node.test, node.alternate) &&
                    this.arrayLike(node.consequent, scope, model)) ||
                (this.arrayLike(node.consequent, scope, model) &&
                    this.arrayLike(node.alternate, scope, model))
            )
        }
        if (node.type !== 'CallExpression') return false
        const callee =
            node.callee.type === 'ChainExpression'
                ? node.callee.expression
                : node.callee
        if (callee.type !== 'MemberExpression') return false
        const name = this.operations.propertyName(callee.property)
        if (
            callee.object.type === 'Identifier' &&
            callee.object.name === 'Array' &&
            ['from', 'of'].includes(name)
        ) {
            return true
        }
        return (
            ARRAY_RESULT_METHODS.has(name) &&
            this.arrayLike(callee.object, scope, model)
        )
    }

    /**
     * Matches an Array.isArray guard to one conditional branch.
     * @param {object} test Conditional test.
     * @param {object} branch Conditional branch.
     * @returns {boolean} Guard match.
     */
    #guardMatches(test, branch) {
        const callee = test?.type === 'CallExpression' ? test.callee : null
        return Boolean(
            callee?.type === 'MemberExpression' &&
            callee.object.type === 'Identifier' &&
            callee.object.name === 'Array' &&
            this.operations.propertyName(callee.property) === 'isArray' &&
            test.arguments.length === 1 &&
            this.#sameExpression(test.arguments[0], branch)
        )
    }

    /**
     * Compares simple identifier/member syntax used by guards.
     * @param {object} left Left expression.
     * @param {object} right Right expression.
     * @returns {boolean} Structural equality.
     */
    #sameExpression(left, right) {
        if (left?.type !== right?.type) return false
        if (left.type === 'Identifier') return left.name === right.name
        if (left.type !== 'MemberExpression') return false
        return (
            left.computed === right.computed &&
            this.operations.propertyName(left.property) ===
                this.operations.propertyName(right.property) &&
            this.#sameExpression(left.object, right.object)
        )
    }
}
