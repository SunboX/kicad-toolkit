// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadAbstractScope as AbstractScope } from './KicadContractFlowScopes.mjs'
import { KicadOptionControlFlow } from './KicadOptionControlFlow.mjs'

/**
 * Executes delegated-call statements with typed ECMAScript completions.
 */
export class KicadDelegatedControlFlow {
    /**
     * Executes a function body.
     * @param {object} body Function body or expression.
     * @param {AbstractScope} scope Function scope.
     * @param {object} module Module record.
     * @param {object} hooks Delegated analyzer hooks.
     * @returns {{ normal: AbstractScope[], abrupt: object[] }} Outcome.
     */
    static executeFunctionBody(body, scope, module, hooks) {
        if (body.type !== 'BlockStatement') {
            return {
                normal: [],
                abrupt: [
                    KicadDelegatedControlFlow.#completion(
                        'return',
                        scope,
                        hooks.evaluate(body, scope, module)
                    )
                ]
            }
        }
        return KicadDelegatedControlFlow.#executeStatements(
            body.body,
            [scope],
            module,
            hooks
        )
    }

    /**
     * Executes statements for every normal input scope.
     * @param {object[]} statements Statements.
     * @param {AbstractScope[]} initialScopes Input scopes.
     * @param {object} module Module record.
     * @param {object} hooks Delegated analyzer hooks.
     * @returns {{ normal: AbstractScope[], abrupt: object[] }} Outcome.
     */
    static #executeStatements(statements, initialScopes, module, hooks) {
        let scopes = initialScopes
        const abrupt = []
        for (const scope of scopes) {
            for (const statement of statements) {
                if (statement.type === 'FunctionDeclaration' && statement.id) {
                    scope.declare(
                        statement.id.name,
                        hooks.functionValue(statement, scope, module)
                    )
                }
            }
        }
        for (const statement of statements) {
            if (!scopes.length) break
            const next = []
            for (const scope of scopes) {
                const outcome = KicadDelegatedControlFlow.#executeStatement(
                    statement,
                    scope,
                    module,
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
     * @param {AbstractScope} scope Scope.
     * @param {object} module Module record.
     * @param {object} hooks Delegated analyzer hooks.
     * @returns {{ normal: AbstractScope[], abrupt: object[] }} Outcome.
     */
    static #executeStatement(node, scope, module, hooks) {
        if (node.type === 'BlockStatement') {
            return KicadDelegatedControlFlow.#leaveOutcomeScope(
                KicadDelegatedControlFlow.#executeStatements(
                    node.body,
                    [new AbstractScope(scope)],
                    module,
                    hooks
                )
            )
        }
        if (node.type === 'VariableDeclaration') {
            for (const declaration of node.declarations) {
                hooks.bindPattern(
                    declaration.id,
                    hooks.evaluate(declaration.init, scope, module),
                    scope
                )
            }
            return KicadDelegatedControlFlow.#continued(scope)
        }
        if (node.type === 'ExpressionStatement') {
            hooks.evaluate(node.expression, scope, module)
            return KicadDelegatedControlFlow.#continued(scope)
        }
        if (node.type === 'ReturnStatement') {
            return {
                normal: [],
                abrupt: [
                    KicadDelegatedControlFlow.#completion(
                        'return',
                        scope,
                        hooks.evaluate(node.argument, scope, module)
                    )
                ]
            }
        }
        if (node.type === 'ThrowStatement') {
            return {
                normal: [],
                abrupt: [
                    KicadDelegatedControlFlow.#completion(
                        'throw',
                        scope,
                        hooks.evaluate(node.argument, scope, module)
                    )
                ]
            }
        }
        if (node.type === 'IfStatement') {
            hooks.evaluate(node.test, scope, module)
            const constant = KicadOptionControlFlow.booleanValue(node.test)
            if (constant === true) {
                return KicadDelegatedControlFlow.#executeStatement(
                    node.consequent,
                    scope,
                    module,
                    hooks
                )
            }
            if (constant === false) {
                return node.alternate
                    ? KicadDelegatedControlFlow.#executeStatement(
                          node.alternate,
                          scope,
                          module,
                          hooks
                      )
                    : KicadDelegatedControlFlow.#continued(scope)
            }
            return KicadDelegatedControlFlow.#combine(
                KicadDelegatedControlFlow.#executeStatement(
                    node.consequent,
                    scope.fork(),
                    module,
                    hooks
                ),
                node.alternate
                    ? KicadDelegatedControlFlow.#executeStatement(
                          node.alternate,
                          scope.fork(),
                          module,
                          hooks
                      )
                    : KicadDelegatedControlFlow.#continued(scope.fork())
            )
        }
        if (node.type === 'TryStatement') {
            return KicadDelegatedControlFlow.#executeTry(
                node,
                scope,
                module,
                hooks
            )
        }
        if (
            node.type === 'ForStatement' ||
            node.type === 'ForInStatement' ||
            node.type === 'ForOfStatement' ||
            node.type === 'WhileStatement' ||
            node.type === 'DoWhileStatement'
        ) {
            return KicadDelegatedControlFlow.#executeLoop(
                node,
                scope,
                module,
                hooks
            )
        }
        if (node.type === 'SwitchStatement') {
            return KicadDelegatedControlFlow.#executeSwitch(
                node,
                scope,
                module,
                hooks
            )
        }
        if (node.type === 'BreakStatement') {
            return {
                normal: [],
                abrupt: [
                    KicadDelegatedControlFlow.#completion(
                        'break',
                        scope,
                        null,
                        node.label?.name || ''
                    )
                ]
            }
        }
        if (node.type === 'ContinueStatement') {
            return {
                normal: [],
                abrupt: [
                    KicadDelegatedControlFlow.#completion(
                        'continue',
                        scope,
                        null,
                        node.label?.name || ''
                    )
                ]
            }
        }
        if (node.type === 'LabeledStatement') {
            const outcome = KicadDelegatedControlFlow.#executeStatement(
                node.body,
                scope,
                module,
                hooks
            )
            const consumed = outcome.abrupt.filter(
                (row) => row.type === 'break' && row.label === node.label.name
            )
            return {
                normal: [
                    ...outcome.normal,
                    ...consumed.map((row) => row.scope)
                ],
                abrupt: outcome.abrupt.filter(
                    (row) =>
                        row.type !== 'break' || row.label !== node.label.name
                )
            }
        }
        return KicadDelegatedControlFlow.#continued(scope)
    }

    /**
     * Executes catch and finally semantics for typed pending completions.
     * @param {object} node Try statement.
     * @param {AbstractScope} scope Scope.
     * @param {object} module Module record.
     * @param {object} hooks Delegated analyzer hooks.
     * @returns {{ normal: AbstractScope[], abrupt: object[] }} Outcome.
     */
    static #executeTry(node, scope, module, hooks) {
        const tried = KicadDelegatedControlFlow.#executeStatement(
            node.block,
            scope.fork(),
            module,
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
                const catchScope = new AbstractScope(pending.scope)
                hooks.bindPattern(
                    node.handler.param,
                    pending.value || hooks.unknownValue(),
                    catchScope
                )
                KicadDelegatedControlFlow.#mergeInto(
                    outcome,
                    KicadDelegatedControlFlow.#leaveOutcomeScope(
                        KicadDelegatedControlFlow.#executeStatement(
                            node.handler.body,
                            catchScope,
                            module,
                            hooks
                        )
                    )
                )
            }
        }
        return node.finalizer
            ? KicadDelegatedControlFlow.#executeFinalizer(
                  outcome,
                  node.finalizer,
                  module,
                  hooks
              )
            : outcome
    }

    /**
     * Executes zero or one loop iteration and consumes local loop completions.
     * @param {object} node Loop statement.
     * @param {AbstractScope} scope Scope.
     * @param {object} module Module record.
     * @param {object} hooks Delegated analyzer hooks.
     * @returns {{ normal: AbstractScope[], abrupt: object[] }} Outcome.
     */
    static #executeLoop(node, scope, module, hooks) {
        const loop = new AbstractScope(scope)
        if (node.init?.type === 'VariableDeclaration') {
            KicadDelegatedControlFlow.#executeStatement(
                node.init,
                loop,
                module,
                hooks
            )
        } else {
            hooks.evaluate(node.init, loop, module)
        }
        if (node.left) {
            if (node.left.type === 'VariableDeclaration') {
                KicadDelegatedControlFlow.#executeStatement(
                    node.left,
                    loop,
                    module,
                    hooks
                )
            } else {
                hooks.bindPattern(node.left, hooks.unknownValue(), loop)
            }
            hooks.evaluate(node.right, loop, module)
        }
        hooks.evaluate(node.test, loop, module)
        if (
            node.type !== 'DoWhileStatement' &&
            KicadOptionControlFlow.booleanValue(node.test) === false
        ) {
            return KicadDelegatedControlFlow.#continued(scope)
        }
        const body = KicadDelegatedControlFlow.#executeStatement(
            node.body,
            loop,
            module,
            hooks
        )
        const iterating = [
            ...body.normal,
            ...body.abrupt
                .filter((row) => row.type === 'continue' && !row.label)
                .map((row) => row.scope)
        ]
        for (const next of iterating) hooks.evaluate(node.update, next, module)
        return KicadDelegatedControlFlow.#leaveOutcomeScope({
            normal: [
                loop,
                ...iterating,
                ...body.abrupt
                    .filter((row) => row.type === 'break' && !row.label)
                    .map((row) => row.scope)
            ],
            abrupt: body.abrupt.filter(
                (row) =>
                    (row.type !== 'break' && row.type !== 'continue') ||
                    row.label
            )
        })
    }

    /**
     * Executes possible switch starts with source-ordered label evaluation.
     * @param {object} node Switch statement.
     * @param {AbstractScope} scope Scope.
     * @param {object} module Module record.
     * @param {object} hooks Delegated analyzer hooks.
     * @returns {{ normal: AbstractScope[], abrupt: object[] }} Outcome.
     */
    static #executeSwitch(node, scope, module, hooks) {
        hooks.evaluate(node.discriminant, scope, module)
        const plan = KicadOptionControlFlow.switchPlan(node)
        for (const index of plan.testIndexes) {
            hooks.evaluate(node.cases[index].test, scope, module)
        }
        const outcomes = plan.starts.map((start) =>
            KicadDelegatedControlFlow.#executeSwitchPath(
                node.cases,
                start,
                scope.fork(),
                module,
                hooks
            )
        )
        if (plan.noMatch) {
            outcomes.push(KicadDelegatedControlFlow.#continued(scope.fork()))
        }
        return outcomes.length
            ? outcomes.reduce(KicadDelegatedControlFlow.#combine)
            : KicadDelegatedControlFlow.#continued(scope)
    }

    /**
     * Executes one selected switch path including fallthrough.
     * @param {object[]} cases Switch cases.
     * @param {number} start Selected index.
     * @param {AbstractScope} scope Scope.
     * @param {object} module Module record.
     * @param {object} hooks Delegated analyzer hooks.
     * @returns {{ normal: AbstractScope[], abrupt: object[] }} Outcome.
     */
    static #executeSwitchPath(cases, start, scope, module, hooks) {
        let normal = [scope]
        const exits = []
        const abrupt = []
        for (
            let index = start;
            index < cases.length && normal.length;
            index += 1
        ) {
            const outcome = KicadDelegatedControlFlow.#executeStatements(
                cases[index].consequent,
                normal,
                module,
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
     * Runs a finalizer for normal and pending abrupt paths.
     * @param {{ normal: AbstractScope[], abrupt: object[] }} outcome Pending outcome.
     * @param {object} finalizer Finalizer block.
     * @param {object} module Module record.
     * @param {object} hooks Delegated analyzer hooks.
     * @returns {{ normal: AbstractScope[], abrupt: object[] }} Outcome.
     */
    static #executeFinalizer(outcome, finalizer, module, hooks) {
        const finalized = { normal: [], abrupt: [] }
        for (const scope of outcome.normal) {
            KicadDelegatedControlFlow.#mergeInto(
                finalized,
                KicadDelegatedControlFlow.#executeStatement(
                    finalizer,
                    scope,
                    module,
                    hooks
                )
            )
        }
        for (const pending of outcome.abrupt) {
            const result = KicadDelegatedControlFlow.#executeStatement(
                finalizer,
                pending.scope,
                module,
                hooks
            )
            finalized.abrupt.push(...result.abrupt)
            for (const scope of result.normal) {
                finalized.abrupt.push({ ...pending, scope })
            }
        }
        return finalized
    }

    /** @param {AbstractScope} scope Scope. @returns {{ normal: AbstractScope[], abrupt: object[] }} Normal outcome. */
    static #continued(scope) {
        return { normal: [scope], abrupt: [] }
    }

    /**
     * Creates one typed abrupt completion.
     * @param {'return' | 'throw' | 'break' | 'continue'} type Completion type.
     * @param {AbstractScope} scope Scope.
     * @param {object | null} [value] Completion value.
     * @param {string} [label] Optional label.
     * @returns {object} Completion.
     */
    static #completion(type, scope, value = null, label = '') {
        return { type, scope, value, label }
    }

    /** @param {object} left Left outcome. @param {object} right Right outcome. @returns {object} Combined outcome. */
    static #combine(left, right) {
        return {
            normal: [...left.normal, ...right.normal],
            abrupt: [...left.abrupt, ...right.abrupt]
        }
    }

    /** @param {object} target Target outcome. @param {object} source Source outcome. @returns {void} */
    static #mergeInto(target, source) {
        target.normal.push(...source.normal)
        target.abrupt.push(...source.abrupt)
    }

    /**
     * Leaves one lexical scope for every carried path.
     * @param {{ normal: AbstractScope[], abrupt: object[] }} outcome Outcome.
     * @returns {{ normal: AbstractScope[], abrupt: object[] }} Parent-scope outcome.
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
}

Object.freeze(KicadDelegatedControlFlow.prototype)
Object.freeze(KicadDelegatedControlFlow)
