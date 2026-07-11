// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Executes option-analysis control flow that needs abrupt-path semantics.
 */
export class KicadOptionControlFlow {
    /**
     * Executes reachable switch paths with literal selection and fallthrough.
     * @param {object} context Execution context and callbacks.
     * @returns {boolean} Whether any switch path completes normally.
     */
    static executeSwitch(context) {
        const { node, scope, model, fields, invoke, visit, execute } = context
        visit(node.discriminant, scope, model, fields, invoke)
        const plan = KicadOptionControlFlow.switchPlan(node)
        for (const index of plan.testIndexes) {
            visit(node.cases[index].test, scope, model, fields, invoke)
        }
        const normal = []
        for (const start of plan.starts) {
            const branch = scope.fork()
            if (
                KicadOptionControlFlow.#executeSwitchPath(
                    node.cases,
                    start,
                    branch,
                    context
                )
            ) {
                normal.push(branch)
            }
        }
        if (plan.noMatch) {
            normal.push(scope.fork())
        }
        if (normal.length) scope.merge(normal)
        void execute
        return normal.length > 0
    }

    /**
     * Plans reachable case-test evaluation and possible selected case starts.
     * Later labels are unreachable after an earlier guaranteed literal match.
     * @param {object} node Switch statement.
     * @returns {{ starts: number[], testIndexes: number[], noMatch: boolean }} Switch plan.
     */
    static switchPlan(node) {
        const discriminant = KicadOptionControlFlow.staticValue(
            node.discriminant
        )
        const defaultIndex = node.cases.findIndex((row) => row.test === null)
        if (!discriminant.known) {
            return {
                starts: node.cases.map((_, index) => index),
                testIndexes: node.cases
                    .map((row, index) => (row.test ? index : -1))
                    .filter((index) => index >= 0),
                noMatch: defaultIndex < 0
            }
        }

        const starts = []
        const testIndexes = []
        let unmatched = true
        for (let index = 0; index < node.cases.length; index += 1) {
            const testNode = node.cases[index].test
            if (!testNode) continue
            testIndexes.push(index)
            const test = KicadOptionControlFlow.staticValue(testNode)
            if (!test.known) {
                starts.push(index)
                continue
            }
            if (test.value === discriminant.value) {
                starts.push(index)
                unmatched = false
                break
            }
        }
        if (unmatched && defaultIndex >= 0) starts.push(defaultIndex)
        return {
            starts,
            testIndexes,
            noMatch: unmatched && defaultIndex < 0
        }
    }

    /**
     * Returns a constant boolean when known.
     * @param {object | null} node Expression.
     * @returns {boolean | null} Constant.
     */
    static booleanValue(node) {
        const value = KicadOptionControlFlow.staticValue(node)
        return value.known ? Boolean(value.value) : null
    }

    /**
     * Returns a literal loop condition, including an omitted for-test.
     * @param {object} node Loop statement.
     * @returns {boolean | null} Literal condition or unknown.
     */
    static loopCondition(node) {
        if (node.type === 'ForInStatement' || node.type === 'ForOfStatement') {
            return null
        }
        if (node.type === 'ForStatement' && !node.test) return true
        return KicadOptionControlFlow.booleanValue(node.test)
    }

    /**
     * Returns whether control can reach the statement after one loop.
     * @param {object} node Loop statement.
     * @param {string} [label] Optional loop label.
     * @returns {boolean} Whether the loop can complete normally.
     */
    static loopCanFallThrough(node, label = '') {
        const condition = KicadOptionControlFlow.loopCondition(node)
        if (node.type !== 'DoWhileStatement' && condition !== true) return true
        const completions = KicadOptionControlFlow.#statementCompletions(
            node.body
        )
        const breaks = ['break:', ...(label ? [`break:${label}`] : [])]
        const continues = ['continue:', ...(label ? [`continue:${label}`] : [])]
        if (breaks.some((completion) => completions.has(completion))) {
            return true
        }
        return (
            condition !== true &&
            (completions.has('normal') ||
                continues.some((completion) => completions.has(completion)))
        )
    }

    /**
     * Returns whether a loop body can reach its update or trailing test.
     * @param {object} node Loop statement.
     * @param {string} [label] Optional loop label.
     * @returns {boolean} Whether iteration can continue.
     */
    static loopReachesUpdate(node, label = '') {
        const completions = KicadOptionControlFlow.#statementCompletions(
            node.body
        )
        return (
            completions.has('normal') ||
            completions.has('continue:') ||
            Boolean(label && completions.has(`continue:${label}`))
        )
    }

    /**
     * Returns whether one statement can complete normally.
     * @param {object} node Statement.
     * @returns {boolean} Whether control can fall through.
     */
    static statementCanFallThrough(node) {
        return KicadOptionControlFlow.#statementCompletions(node).has('normal')
    }

    /**
     * Returns whether a logical expression can evaluate its right operand.
     * @param {object} node Logical expression.
     * @returns {boolean | null} Reachability or unknown.
     */
    static logicalRightReachability(node) {
        const left = KicadOptionControlFlow.staticValue(node.left)
        if (!left.known) return null
        if (node.operator === '&&') return Boolean(left.value)
        if (node.operator === '||') return !left.value
        if (node.operator === '??') {
            return left.value === null || left.value === undefined
        }
        return null
    }

    /**
     * Returns whether evaluating an expression can invoke user or host code.
     * @param {object | null} node Expression.
     * @returns {boolean} Whether evaluation has a throwing completion.
     */
    static expressionMayThrow(node) {
        if (!node || typeof node !== 'object') return false
        if (/^(?:ArrowFunction|Function)Expression$/u.test(node.type || '')) {
            return false
        }
        if (
            [
                'AwaitExpression',
                'CallExpression',
                'ImportExpression',
                'NewExpression',
                'TaggedTemplateExpression',
                'YieldExpression'
            ].includes(node.type)
        ) {
            return true
        }
        return Object.entries(node).some(
            ([name, value]) =>
                !['end', 'loc', 'range', 'start'].includes(name) &&
                (Array.isArray(value)
                    ? value.some((entry) =>
                          KicadOptionControlFlow.expressionMayThrow(entry)
                      )
                    : KicadOptionControlFlow.expressionMayThrow(value))
        )
    }

    /**
     * Evaluates side-effect-free literal syntax used for reachability.
     * @param {object | null} node Expression.
     * @returns {{ known: boolean, value?: unknown }} Static value.
     */
    static staticValue(node) {
        if (!node) return { known: false }
        if (node.type === 'Literal') return { known: true, value: node.value }
        if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
            return { known: true, value: node.quasis[0]?.value?.cooked || '' }
        }
        if (node.type !== 'UnaryExpression') return { known: false }
        const argument = KicadOptionControlFlow.staticValue(node.argument)
        if (!argument.known) return { known: false }
        if (node.operator === '!') {
            return { known: true, value: !argument.value }
        }
        if (node.operator === 'void') {
            return { known: true, value: undefined }
        }
        if (node.operator === '+') {
            return { known: true, value: Number(argument.value) }
        }
        if (node.operator === '-') {
            return { known: true, value: -Number(argument.value) }
        }
        return { known: false }
    }

    /**
     * Computes reachable completion kinds for one statement.
     * @param {object | null} node Statement.
     * @returns {Set<string>} Completion kinds.
     */
    static #statementCompletions(node) {
        if (!node) return new Set(['normal'])
        if (node.type === 'BlockStatement') {
            return KicadOptionControlFlow.#statementListCompletions(node.body)
        }
        if (node.type === 'ReturnStatement') return new Set(['return'])
        if (node.type === 'ThrowStatement') return new Set(['throw'])
        if (node.type === 'BreakStatement') {
            return new Set([`break:${node.label?.name || ''}`])
        }
        if (node.type === 'ContinueStatement') {
            return new Set([`continue:${node.label?.name || ''}`])
        }
        if (node.type === 'IfStatement') {
            const condition = KicadOptionControlFlow.booleanValue(node.test)
            if (condition === true) {
                return KicadOptionControlFlow.#statementCompletions(
                    node.consequent
                )
            }
            if (condition === false) {
                return KicadOptionControlFlow.#statementCompletions(
                    node.alternate
                )
            }
            return KicadOptionControlFlow.#unionCompletions(
                KicadOptionControlFlow.#statementCompletions(node.consequent),
                KicadOptionControlFlow.#statementCompletions(node.alternate)
            )
        }
        if (node.type === 'TryStatement') {
            return KicadOptionControlFlow.#tryCompletions(node)
        }
        if (node.type === 'SwitchStatement') {
            return KicadOptionControlFlow.#switchCompletions(node)
        }
        if (node.type === 'LabeledStatement') {
            if (KicadOptionControlFlow.#isLoop(node.body)) {
                return KicadOptionControlFlow.#loopCompletions(
                    node.body,
                    node.label.name
                )
            }
            const completions = KicadOptionControlFlow.#statementCompletions(
                node.body
            )
            const labeledBreak = `break:${node.label.name}`
            if (completions.delete(labeledBreak)) completions.add('normal')
            return completions
        }
        if (KicadOptionControlFlow.#isLoop(node)) {
            return KicadOptionControlFlow.#loopCompletions(node)
        }
        return new Set(['normal'])
    }

    /**
     * Computes sequential statement-list completions.
     * @param {object[]} statements Statements.
     * @returns {Set<string>} Completion kinds.
     */
    static #statementListCompletions(statements) {
        let completions = new Set(['normal'])
        for (const statement of statements) {
            if (!completions.has('normal')) break
            completions.delete('normal')
            for (const completion of KicadOptionControlFlow.#statementCompletions(
                statement
            )) {
                completions.add(completion)
            }
        }
        return completions
    }

    /**
     * Computes completions for try, catch, and finally paths.
     * @param {object} node Try statement.
     * @returns {Set<string>} Completion kinds.
     */
    static #tryCompletions(node) {
        let pending = KicadOptionControlFlow.#statementCompletions(node.block)
        if (node.handler && pending.has('throw')) {
            pending = new Set(pending)
            pending.delete('throw')
            for (const completion of KicadOptionControlFlow.#statementCompletions(
                node.handler.body
            )) {
                pending.add(completion)
            }
        }
        if (!node.finalizer) return pending
        const finalizer = KicadOptionControlFlow.#statementCompletions(
            node.finalizer
        )
        const result = new Set(
            [...finalizer].filter((completion) => completion !== 'normal')
        )
        if (finalizer.has('normal')) {
            for (const completion of pending) result.add(completion)
        }
        return result
    }

    /**
     * Computes completions for every statically possible switch path.
     * @param {object} node Switch statement.
     * @returns {Set<string>} Completion kinds.
     */
    static #switchCompletions(node) {
        const plan = KicadOptionControlFlow.switchPlan(node)
        const result = new Set(plan.noMatch ? ['normal'] : [])
        for (const start of plan.starts) {
            const path = KicadOptionControlFlow.#statementListCompletions(
                node.cases.slice(start).flatMap((row) => row.consequent)
            )
            if (path.delete('break:')) path.add('normal')
            for (const completion of path) result.add(completion)
        }
        return result
    }

    /**
     * Computes nested-loop completions while consuming local control flow.
     * @param {object} node Loop statement.
     * @param {string} [label] Optional loop label.
     * @returns {Set<string>} Completion kinds.
     */
    static #loopCompletions(node, label = '') {
        const condition = KicadOptionControlFlow.loopCondition(node)
        const body = KicadOptionControlFlow.#statementCompletions(node.body)
        const breaks = new Set(['break:', ...(label ? [`break:${label}`] : [])])
        const continues = new Set([
            'continue:',
            ...(label ? [`continue:${label}`] : [])
        ])
        const result = new Set(
            [...body].filter(
                (completion) =>
                    completion !== 'normal' &&
                    !breaks.has(completion) &&
                    !continues.has(completion)
            )
        )
        if (
            (node.type !== 'DoWhileStatement' && condition !== true) ||
            [...breaks].some((completion) => body.has(completion)) ||
            (condition !== true &&
                (body.has('normal') ||
                    [...continues].some((completion) => body.has(completion))))
        ) {
            result.add('normal')
        }
        return result
    }

    /**
     * Unions completion sets.
     * @param {...Set<string>} groups Completion groups.
     * @returns {Set<string>} Combined completions.
     */
    static #unionCompletions(...groups) {
        return new Set(groups.flatMap((group) => [...group]))
    }

    /**
     * Returns whether a statement is a loop.
     * @param {object | null} node Candidate statement.
     * @returns {boolean} Whether the node is a loop.
     */
    static #isLoop(node) {
        return Boolean(
            node &&
            /^(?:For(?:In|Of)?|While|DoWhile)Statement$/u.test(node.type)
        )
    }

    /**
     * Executes one selected switch path.
     * @param {object[]} cases Switch cases.
     * @param {number} start First case index.
     * @param {object} scope Branch scope.
     * @param {object} context Execution context.
     * @returns {boolean} Whether the path exits normally.
     */
    static #executeSwitchPath(cases, start, scope, context) {
        const { model, fields, invoke, execute } = context
        for (let index = start; index < cases.length; index += 1) {
            for (const statement of cases[index].consequent) {
                if (statement.type === 'BreakStatement' && !statement.label) {
                    return true
                }
                if (!execute(statement, scope, model, fields, invoke)) {
                    return KicadOptionControlFlow.#containsSwitchBreak(
                        statement,
                        context
                    )
                }
            }
        }
        return true
    }

    /**
     * Returns whether a statement can break the current switch.
     * @param {object} node Statement.
     * @param {object} context Execution context.
     * @returns {boolean} Break flag.
     */
    static #containsSwitchBreak(node, context) {
        if (context.isFunction(node)) return false
        if (node.type === 'BreakStatement') return !node.label
        if (
            node.type === 'SwitchStatement' ||
            /^(?:For|While|DoWhile)Statement$/u.test(node.type)
        ) {
            return false
        }
        return context
            .childNodes(node)
            .some((child) =>
                KicadOptionControlFlow.#containsSwitchBreak(child, context)
            )
    }
}
