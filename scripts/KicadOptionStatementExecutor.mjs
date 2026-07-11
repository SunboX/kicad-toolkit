// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadOptionControlFlow } from './KicadOptionControlFlow.mjs'
import { KicadOptionScope as Scope } from './KicadOptionScope.mjs'

/**
 * Executes option-analysis statements with typed ECMAScript completions.
 */
export class KicadOptionStatementExecutor {
    /**
     * Executes a callable body.
     * @param {object[]} statements Callable statements.
     * @param {Scope} scope Callable scope.
     * @param {object} hooks Analyzer hooks.
     * @returns {{ normal: Scope[], abrupt: object[] }} Execution outcome.
     */
    static execute(statements, scope, hooks) {
        return KicadOptionStatementExecutor.#executeStatements(
            statements,
            [scope],
            hooks
        )
    }

    /**
     * Executes statements for every normally completing input scope.
     * @param {object[]} statements Statements.
     * @param {Scope[]} initialScopes Input scopes.
     * @param {object} hooks Analyzer hooks.
     * @returns {{ normal: Scope[], abrupt: object[] }} Outcome.
     */
    static #executeStatements(statements, initialScopes, hooks) {
        let scopes = initialScopes
        const abrupt = []
        for (const scope of scopes) {
            for (const statement of statements) {
                if (statement.type === 'FunctionDeclaration' && statement.id) {
                    hooks.declareFunction(statement, scope)
                }
            }
        }
        for (const statement of statements) {
            if (!scopes.length) break
            const next = []
            for (const scope of scopes) {
                const outcome = KicadOptionStatementExecutor.#executeStatement(
                    statement,
                    scope,
                    hooks
                )
                next.push(...outcome.normal)
                abrupt.push(...outcome.abrupt)
            }
            scopes = next
        }
        return { normal: scopes, abrupt }
    }

    /**
     * Executes one statement.
     * @param {object} node Statement.
     * @param {Scope} scope Current scope.
     * @param {object} hooks Analyzer hooks.
     * @returns {{ normal: Scope[], abrupt: object[] }} Outcome.
     */
    static #executeStatement(node, scope, hooks) {
        if (node.type === 'BlockStatement') {
            return KicadOptionStatementExecutor.#leaveOutcomeScope(
                KicadOptionStatementExecutor.#executeStatements(
                    node.body,
                    [new Scope(scope)],
                    hooks
                )
            )
        }
        if (node.type === 'VariableDeclaration') {
            const abrupt = []
            for (const declaration of node.declarations) {
                const before = scope.fork()
                hooks.declareVariable(declaration, scope)
                if (hooks.mayThrow(declaration.init)) {
                    abrupt.push(
                        KicadOptionStatementExecutor.#completion(
                            'throw',
                            before
                        )
                    )
                }
            }
            return { normal: [scope], abrupt }
        }
        if (node.type === 'ExpressionStatement') {
            const before = scope.fork()
            hooks.visit(node.expression, scope)
            return {
                normal: [scope],
                abrupt: hooks.mayThrow(node.expression)
                    ? [
                          KicadOptionStatementExecutor.#completion(
                              'throw',
                              before
                          )
                      ]
                    : []
            }
        }
        if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') {
            const before = scope.fork()
            hooks.visit(node.argument, scope)
            const abrupt = [
                KicadOptionStatementExecutor.#completion(
                    node.type === 'ReturnStatement' ? 'return' : 'throw',
                    scope
                )
            ]
            if (
                node.type === 'ReturnStatement' &&
                hooks.mayThrow(node.argument)
            ) {
                abrupt.push(
                    KicadOptionStatementExecutor.#completion('throw', before)
                )
            }
            return {
                normal: [],
                abrupt
            }
        }
        if (node.type === 'IfStatement') {
            const before = scope.fork()
            hooks.visit(node.test, scope)
            const condition = KicadOptionControlFlow.booleanValue(node.test)
            let outcome
            if (condition === true) {
                outcome = KicadOptionStatementExecutor.#executeStatement(
                    node.consequent,
                    scope,
                    hooks
                )
            } else if (condition === false) {
                outcome = node.alternate
                    ? KicadOptionStatementExecutor.#executeStatement(
                          node.alternate,
                          scope,
                          hooks
                      )
                    : KicadOptionStatementExecutor.#continued(scope)
            } else {
                outcome = KicadOptionStatementExecutor.#combine(
                    KicadOptionStatementExecutor.#executeStatement(
                        node.consequent,
                        scope.fork(),
                        hooks
                    ),
                    node.alternate
                        ? KicadOptionStatementExecutor.#executeStatement(
                              node.alternate,
                              scope.fork(),
                              hooks
                          )
                        : KicadOptionStatementExecutor.#continued(scope.fork())
                )
            }
            if (hooks.mayThrow(node.test)) {
                outcome.abrupt.push(
                    KicadOptionStatementExecutor.#completion('throw', before)
                )
            }
            return outcome
        }
        if (node.type === 'TryStatement') {
            return KicadOptionStatementExecutor.#executeTry(node, scope, hooks)
        }
        if (KicadOptionStatementExecutor.#isLoop(node)) {
            return KicadOptionStatementExecutor.#executeLoop(node, scope, hooks)
        }
        if (node.type === 'SwitchStatement') {
            return KicadOptionStatementExecutor.#executeSwitch(
                node,
                scope,
                hooks
            )
        }
        if (node.type === 'BreakStatement') {
            return {
                normal: [],
                abrupt: [
                    KicadOptionStatementExecutor.#completion(
                        'break',
                        scope,
                        node.label?.name || ''
                    )
                ]
            }
        }
        if (node.type === 'ContinueStatement') {
            return {
                normal: [],
                abrupt: [
                    KicadOptionStatementExecutor.#completion(
                        'continue',
                        scope,
                        node.label?.name || ''
                    )
                ]
            }
        }
        if (node.type === 'LabeledStatement') {
            return KicadOptionStatementExecutor.#executeLabeled(
                node,
                scope,
                hooks
            )
        }
        if (
            node.type === 'FunctionDeclaration' ||
            node.type === 'EmptyStatement'
        ) {
            return KicadOptionStatementExecutor.#continued(scope)
        }
        hooks.visitUnknown(node, scope)
        return KicadOptionStatementExecutor.#continued(scope)
    }

    /**
     * Executes catch only for throws and applies finally to every completion.
     * @param {object} node Try statement.
     * @param {Scope} scope Current scope.
     * @param {object} hooks Analyzer hooks.
     * @returns {{ normal: Scope[], abrupt: object[] }} Outcome.
     */
    static #executeTry(node, scope, hooks) {
        const tried = KicadOptionStatementExecutor.#executeStatement(
            node.block,
            scope.fork(),
            hooks
        )
        let outcome = tried
        if (node.handler) {
            outcome = {
                normal: [...tried.normal],
                abrupt: tried.abrupt.filter((row) => row.type !== 'throw')
            }
            for (const pending of tried.abrupt.filter(
                (row) => row.type === 'throw'
            )) {
                const catchScope = new Scope(pending.scope)
                hooks.bindUnknown(node.handler.param, catchScope)
                KicadOptionStatementExecutor.#mergeInto(
                    outcome,
                    KicadOptionStatementExecutor.#leaveOutcomeScope(
                        KicadOptionStatementExecutor.#executeStatement(
                            node.handler.body,
                            catchScope,
                            hooks
                        )
                    )
                )
            }
        }
        return node.finalizer
            ? KicadOptionStatementExecutor.#executeFinalizer(
                  outcome,
                  node.finalizer,
                  hooks
              )
            : outcome
    }

    /**
     * Executes zero or one loop iteration with local completion consumption.
     * @param {object} node Loop statement.
     * @param {Scope} scope Current scope.
     * @param {object} hooks Analyzer hooks.
     * @param {string} [label] Optional loop label.
     * @returns {{ normal: Scope[], abrupt: object[] }} Outcome.
     */
    static #executeLoop(node, scope, hooks, label = '') {
        const loop = new Scope(scope)
        if (node.init?.type === 'VariableDeclaration') {
            KicadOptionStatementExecutor.#executeStatement(
                node.init,
                loop,
                hooks
            )
        } else {
            hooks.visit(node.init, loop)
        }
        if (node.left) {
            if (node.left.type === 'VariableDeclaration') {
                KicadOptionStatementExecutor.#executeStatement(
                    node.left,
                    loop,
                    hooks
                )
            } else {
                hooks.bindUnknown(node.left, loop)
            }
            hooks.visit(node.right, loop)
        }
        const condition = KicadOptionControlFlow.loopCondition(node)
        if (node.type !== 'DoWhileStatement') {
            hooks.visit(node.test, loop)
            if (condition === false) {
                return KicadOptionStatementExecutor.#continued(scope)
            }
        }
        const body = KicadOptionStatementExecutor.#executeStatement(
            node.body,
            loop,
            hooks
        )
        const localContinue = (row) =>
            row.type === 'continue' && (!row.label || row.label === label)
        const localBreak = (row) =>
            row.type === 'break' && (!row.label || row.label === label)
        const iterating = [
            ...body.normal,
            ...body.abrupt.filter(localContinue).map((row) => row.scope)
        ]
        for (const next of iterating) {
            hooks.visit(node.update, next)
            if (node.type === 'DoWhileStatement') hooks.visit(node.test, next)
        }
        const normal = body.abrupt
            .filter(localBreak)
            .map((row) => row.scope.parent || row.scope)
        if (node.type !== 'DoWhileStatement' && condition !== true) {
            normal.push(scope)
        }
        if (condition !== true) {
            normal.push(...iterating.map((next) => next.parent || next))
        }
        return {
            normal,
            abrupt: body.abrupt
                .filter((row) => !localBreak(row) && !localContinue(row))
                .map((row) => ({
                    ...row,
                    scope: row.scope.parent || row.scope
                }))
        }
    }

    /**
     * Executes all statically possible switch paths.
     * @param {object} node Switch statement.
     * @param {Scope} scope Current scope.
     * @param {object} hooks Analyzer hooks.
     * @returns {{ normal: Scope[], abrupt: object[] }} Outcome.
     */
    static #executeSwitch(node, scope, hooks) {
        hooks.visit(node.discriminant, scope)
        const plan = KicadOptionControlFlow.switchPlan(node)
        for (const index of plan.testIndexes) {
            hooks.visit(node.cases[index].test, scope)
        }
        const outcomes = plan.starts.map((start) =>
            KicadOptionStatementExecutor.#executeSwitchPath(
                node.cases,
                start,
                scope.fork(),
                hooks
            )
        )
        if (plan.noMatch) {
            outcomes.push(KicadOptionStatementExecutor.#continued(scope.fork()))
        }
        return outcomes.length
            ? outcomes.reduce(KicadOptionStatementExecutor.#combine)
            : KicadOptionStatementExecutor.#continued(scope)
    }

    /**
     * Executes one selected switch path with fallthrough.
     * @param {object[]} cases Switch cases.
     * @param {number} start First selected case.
     * @param {Scope} scope Branch scope.
     * @param {object} hooks Analyzer hooks.
     * @returns {{ normal: Scope[], abrupt: object[] }} Outcome.
     */
    static #executeSwitchPath(cases, start, scope, hooks) {
        let normal = [scope]
        const exits = []
        const abrupt = []
        for (
            let index = start;
            index < cases.length && normal.length;
            index += 1
        ) {
            const outcome = KicadOptionStatementExecutor.#executeStatements(
                cases[index].consequent,
                normal,
                hooks
            )
            normal = outcome.normal
            for (const row of outcome.abrupt) {
                if (row.type === 'break' && !row.label) exits.push(row.scope)
                else abrupt.push(row)
            }
        }
        return { normal: [...exits, ...normal], abrupt }
    }

    /**
     * Executes a labeled statement and consumes matching break completions.
     * @param {object} node Labeled statement.
     * @param {Scope} scope Current scope.
     * @param {object} hooks Analyzer hooks.
     * @returns {{ normal: Scope[], abrupt: object[] }} Outcome.
     */
    static #executeLabeled(node, scope, hooks) {
        if (KicadOptionStatementExecutor.#isLoop(node.body)) {
            return KicadOptionStatementExecutor.#executeLoop(
                node.body,
                scope,
                hooks,
                node.label.name
            )
        }
        const outcome = KicadOptionStatementExecutor.#executeStatement(
            node.body,
            scope,
            hooks
        )
        const matching = outcome.abrupt.filter(
            (row) => row.type === 'break' && row.label === node.label.name
        )
        return {
            normal: [...outcome.normal, ...matching.map((row) => row.scope)],
            abrupt: outcome.abrupt.filter(
                (row) => row.type !== 'break' || row.label !== node.label.name
            )
        }
    }

    /**
     * Applies a finalizer while preserving or replacing pending completions.
     * @param {{ normal: Scope[], abrupt: object[] }} outcome Pending outcome.
     * @param {object} finalizer Finalizer block.
     * @param {object} hooks Analyzer hooks.
     * @returns {{ normal: Scope[], abrupt: object[] }} Finalized outcome.
     */
    static #executeFinalizer(outcome, finalizer, hooks) {
        const finalized = { normal: [], abrupt: [] }
        for (const scope of outcome.normal) {
            KicadOptionStatementExecutor.#mergeInto(
                finalized,
                KicadOptionStatementExecutor.#executeStatement(
                    finalizer,
                    scope,
                    hooks
                )
            )
        }
        for (const pending of outcome.abrupt) {
            const result = KicadOptionStatementExecutor.#executeStatement(
                finalizer,
                pending.scope,
                hooks
            )
            finalized.abrupt.push(...result.abrupt)
            for (const scope of result.normal) {
                finalized.abrupt.push({ ...pending, scope })
            }
        }
        return finalized
    }

    /**
     * Creates a normal outcome.
     * @param {Scope} scope Scope.
     * @returns {{ normal: Scope[], abrupt: object[] }} Outcome.
     */
    static #continued(scope) {
        return { normal: [scope], abrupt: [] }
    }

    /**
     * Creates an abrupt completion.
     * @param {'return' | 'throw' | 'break' | 'continue'} type Type.
     * @param {Scope} scope Scope.
     * @param {string} [label] Optional label.
     * @returns {object} Completion.
     */
    static #completion(type, scope, label = '') {
        return { type, scope, label }
    }

    /**
     * Combines outcomes.
     * @param {object} left Left outcome.
     * @param {object} right Right outcome.
     * @returns {object} Combined outcome.
     */
    static #combine(left, right) {
        return {
            normal: [...left.normal, ...right.normal],
            abrupt: [...left.abrupt, ...right.abrupt]
        }
    }

    /**
     * Merges an outcome into a target.
     * @param {object} target Target outcome.
     * @param {object} source Source outcome.
     * @returns {void}
     */
    static #mergeInto(target, source) {
        target.normal.push(...source.normal)
        target.abrupt.push(...source.abrupt)
    }

    /**
     * Leaves one child lexical scope for every carried path.
     * @param {{ normal: Scope[], abrupt: object[] }} outcome Outcome.
     * @returns {{ normal: Scope[], abrupt: object[] }} Parent outcome.
     */
    static #leaveOutcomeScope(outcome) {
        return {
            normal: outcome.normal.map((scope) => scope.parent || scope),
            abrupt: outcome.abrupt.map((row) => ({
                ...row,
                scope: row.scope.parent || row.scope
            }))
        }
    }

    /**
     * Returns whether one statement is a loop.
     * @param {object | null} node Candidate node.
     * @returns {boolean} Whether the node is a loop.
     */
    static #isLoop(node) {
        return Boolean(
            node &&
            /^(?:For(?:In|Of)?|While|DoWhile)Statement$/u.test(node.type)
        )
    }
}

Object.freeze(KicadOptionStatementExecutor.prototype)
Object.freeze(KicadOptionStatementExecutor)
