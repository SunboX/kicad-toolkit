// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { parse } from 'acorn'
import { KicadResultExecutionState as ExecutionState } from './KicadContractFlowScopes.mjs'
import { KicadOptionControlFlow } from './KicadOptionControlFlow.mjs'
import {
    arrayValue,
    callableDescriptor,
    callableValue,
    collectPaths,
    memberAssignment,
    objectProperties,
    objectValue,
    pathsValue,
    primitiveValue,
    propertyValue,
    setObjectPath,
    unionValue,
    unknownValue
} from './KicadResultAbstractValue.mjs'

/**
 * Extracts result fields from reachable return-value provenance.
 */
export class KicadResultContractAnalyzer {
    /**
     * Captures returned field paths for one callable.
     * @param {object} input Analysis input.
     * @param {string} input.ownerSource Full class source.
     * @param {string} input.callableSource Standalone callable source.
     * @param {string} input.methodName Callable name.
     * @returns {string[]} Sorted result paths.
     */
    static capture({ ownerSource, callableSource, methodName }) {
        const model = sourceModel(ownerSource, callableSource, methodName)
        const initial = model.definitions.get(methodName)
        if (!initial) return []
        return captureResults(model, initial)
    }
}

/**
 * Captures all reachable return shapes.
 * @param {object} model Source model.
 * @param {object} initial Initial callable.
 * @returns {string[]} Sorted paths.
 */
function captureResults(model, initial) {
    const active = new Set()

    /**
     * Invokes one local or same-class callable.
     * @param {object} callable Callable definition.
     * @param {object[]} argumentsList Abstract arguments.
     * @param {ExecutionState | null} [closureState] Closure state.
     * @returns {object} Union return value.
     */
    function invoke(callable, argumentsList, closureState = null) {
        if (active.has(callable.id)) return unknownValue()
        active.add(callable.id)
        const state = closureState
            ? closureState.forkWithChildScope()
            : new ExecutionState()
        callable.parameters.forEach((parameter, index) => {
            declarePattern(
                parameter,
                argumentsList[index] || unknownValue(),
                state
            )
        })
        const outcome =
            callable.node.body.type === 'BlockStatement'
                ? executeStatements(
                      callable.node.body.body,
                      [state],
                      model,
                      invoke
                  )
                : {
                      normal: [],
                      abrupt: [
                          completion(
                              'return',
                              state,
                              evaluate(callable.node.body, state, model, invoke)
                          )
                      ]
                  }
        active.delete(callable.id)
        const documented = documentedReturnFields(callable.jsdoc)
        const values = outcome.abrupt
            .filter((row) => row.type === 'return')
            .map((row) => row.value)
        if (documented.length) values.push(pathsValue(documented))
        return unionValue(values)
    }

    const fields = new Set()
    collectPaths(invoke(initial, []), '', fields)
    return [...fields].sort()
}

/**
 * Executes a statement list for every reachable state.
 * @param {object[]} statements Statements.
 * @param {ExecutionState[]} initialStates Initial states.
 * @param {object} model Source model.
 * @param {Function} invoke Callable invoker.
 * @returns {{ normal: ExecutionState[], abrupt: object[] }} Outcome.
 */
function executeStatements(statements, initialStates, model, invoke) {
    let states = initialStates
    const abrupt = []
    for (const statement of statements) {
        if (!states.length) break
        const next = []
        for (const state of states) {
            if (statement.type === 'FunctionDeclaration' && statement.id) {
                state.declare(
                    statement.id.name,
                    callableValue(
                        localDefinition(statement, model.source),
                        state
                    )
                )
            }
        }
        for (const state of states) {
            const outcome = executeStatement(statement, state, model, invoke)
            next.push(...outcome.normal)
            abrupt.push(...outcome.abrupt)
        }
        states = next
    }
    return { normal: states, abrupt }
}

/**
 * Executes one statement.
 * @param {object} node Statement.
 * @param {ExecutionState} state State.
 * @param {object} model Source model.
 * @param {Function} invoke Callable invoker.
 * @returns {{ normal: ExecutionState[], abrupt: object[] }} Outcome.
 */
function executeStatement(node, state, model, invoke) {
    if (node.type === 'BlockStatement') {
        const child = state.forkWithChildScope()
        const outcome = executeStatements(node.body, [child], model, invoke)
        leaveOutcomeScope(outcome)
        return outcome
    }
    if (node.type === 'VariableDeclaration') {
        const abrupt = []
        for (const declaration of node.declarations) {
            const before = state.fork()
            declarePattern(
                declaration.id,
                evaluate(declaration.init, state, model, invoke),
                state
            )
            if (KicadOptionControlFlow.expressionMayThrow(declaration.init)) {
                abrupt.push(completion('throw', before, unknownValue()))
            }
        }
        return { normal: [state], abrupt }
    }
    if (node.type === 'ExpressionStatement') {
        const before = state.fork()
        evaluate(node.expression, state, model, invoke)
        return {
            normal: [state],
            abrupt: KicadOptionControlFlow.expressionMayThrow(node.expression)
                ? [completion('throw', before, unknownValue())]
                : []
        }
    }
    if (node.type === 'ReturnStatement') {
        const before = state.fork()
        const value = evaluate(node.argument, state, model, invoke)
        const abrupt = [completion('return', state, value)]
        if (KicadOptionControlFlow.expressionMayThrow(node.argument)) {
            abrupt.push(completion('throw', before, unknownValue()))
        }
        return {
            normal: [],
            abrupt
        }
    }
    if (node.type === 'ThrowStatement') {
        const value = evaluate(node.argument, state, model, invoke)
        return {
            normal: [],
            abrupt: [completion('throw', state, value)]
        }
    }
    if (node.type === 'IfStatement') {
        const before = state.fork()
        evaluate(node.test, state, model, invoke)
        const constant = booleanValue(node.test)
        let outcome
        if (constant === true) {
            outcome = executeStatement(node.consequent, state, model, invoke)
        } else if (constant === false) {
            outcome = node.alternate
                ? executeStatement(node.alternate, state, model, invoke)
                : continued(state)
        } else {
            const consequent = executeStatement(
                node.consequent,
                state.fork(),
                model,
                invoke
            )
            const alternate = node.alternate
                ? executeStatement(node.alternate, state.fork(), model, invoke)
                : continued(state.fork())
            outcome = combineOutcomes(consequent, alternate)
        }
        if (KicadOptionControlFlow.expressionMayThrow(node.test)) {
            outcome.abrupt.push(completion('throw', before, unknownValue()))
        }
        return outcome
    }
    if (node.type === 'TryStatement') {
        const tried = executeStatement(node.block, state.fork(), model, invoke)
        let outcome = tried
        if (node.handler) {
            outcome = {
                normal: [...tried.normal],
                abrupt: tried.abrupt.filter((row) => row.type !== 'throw')
            }
            for (const pending of tried.abrupt.filter(
                (row) => row.type === 'throw'
            )) {
                const catchState = pending.state.forkWithChildScope()
                declarePattern(
                    node.handler.param,
                    pending.value || unknownValue(),
                    catchState
                )
                const caught = executeStatement(
                    node.handler.body,
                    catchState,
                    model,
                    invoke
                )
                leaveOutcomeScope(caught)
                mergeInto(outcome, caught)
            }
        }
        if (node.finalizer) {
            outcome = executeFinalizer(outcome, node.finalizer, model, invoke)
        }
        return outcome
    }
    if (node.type === 'FunctionDeclaration' || node.type === 'EmptyStatement') {
        return continued(state)
    }
    if (
        node.type === 'ForStatement' ||
        node.type === 'ForInStatement' ||
        node.type === 'ForOfStatement' ||
        node.type === 'WhileStatement' ||
        node.type === 'DoWhileStatement'
    ) {
        return executeLoop(node, state, model, invoke)
    }
    if (node.type === 'SwitchStatement') {
        return executeSwitch(node, state, model, invoke)
    }
    if (node.type === 'BreakStatement') {
        return {
            normal: [],
            abrupt: [completion('break', state, null, node.label?.name || '')]
        }
    }
    if (node.type === 'ContinueStatement') {
        return {
            normal: [],
            abrupt: [
                completion('continue', state, null, node.label?.name || '')
            ]
        }
    }
    if (node.type === 'LabeledStatement') {
        if (
            /^(?:For(?:In|Of)?|While|DoWhile)Statement$/u.test(node.body.type)
        ) {
            return executeLoop(node.body, state, model, invoke, node.label.name)
        }
        const outcome = executeStatement(node.body, state, model, invoke)
        const matchingBreaks = outcome.abrupt.filter(
            (row) => row.type === 'break' && row.label === node.label.name
        )
        return {
            normal: [
                ...outcome.normal,
                ...matchingBreaks.map((row) => row.state)
            ],
            abrupt: outcome.abrupt.filter(
                (row) => row.type !== 'break' || row.label !== node.label.name
            )
        }
    }
    return continued(state)
}

/**
 * Executes zero or one loop iteration conservatively.
 * @param {object} node Loop statement.
 * @param {ExecutionState} state State.
 * @param {object} model Source model.
 * @param {Function} invoke Callable invoker.
 * @param {string} [label] Optional loop label.
 * @returns {{ states: ExecutionState[], returns: object[] }} Outcome.
 */
function executeLoop(node, state, model, invoke, label = '') {
    const loopState = state.forkWithChildScope()
    if (node.init?.type === 'VariableDeclaration') {
        executeStatement(node.init, loopState, model, invoke)
    } else {
        evaluate(node.init, loopState, model, invoke)
    }
    if (node.left) {
        if (node.left.type === 'VariableDeclaration') {
            executeStatement(node.left, loopState, model, invoke)
        } else {
            declarePattern(node.left, unknownValue(), loopState)
        }
        evaluate(node.right, loopState, model, invoke)
    }
    evaluate(node.test, loopState, model, invoke)
    const condition = KicadOptionControlFlow.loopCondition(node)
    if (node.type !== 'DoWhileStatement' && condition === false) {
        return continued(state)
    }
    const body = executeStatement(node.body, loopState, model, invoke)
    const loopStates = [
        ...body.normal,
        ...body.abrupt
            .filter(
                (row) =>
                    row.type === 'continue' &&
                    (!row.label || row.label === label)
            )
            .map((row) => row.state)
    ]
    for (const next of loopStates) {
        evaluate(node.update, next, model, invoke)
        next.leaveScope()
    }
    const breakStates = body.abrupt
        .filter(
            (row) => row.type === 'break' && (!row.label || row.label === label)
        )
        .map((row) => row.state)
    for (const next of breakStates) next.leaveScope()
    const normal = [...breakStates]
    if (node.type !== 'DoWhileStatement' && condition !== true) {
        normal.push(state)
    }
    if (condition !== true) normal.push(...loopStates)
    return {
        normal,
        abrupt: body.abrupt.filter(
            (row) =>
                (row.type !== 'break' && row.type !== 'continue') ||
                (row.label && row.label !== label)
        )
    }
}

/**
 * Executes a switch from each semantically possible matching case.
 * @param {object} node Switch statement.
 * @param {ExecutionState} state State.
 * @param {object} model Source model.
 * @param {Function} invoke Callable invoker.
 * @returns {{ normal: ExecutionState[], abrupt: object[] }} Outcome.
 */
function executeSwitch(node, state, model, invoke) {
    evaluate(node.discriminant, state, model, invoke)
    const plan = KicadOptionControlFlow.switchPlan(node)
    for (const index of plan.testIndexes) {
        evaluate(node.cases[index].test, state, model, invoke)
    }
    const outcomes = plan.starts.map((start) =>
        executeSwitchPath(node.cases, start, state.fork(), model, invoke)
    )
    if (plan.noMatch) {
        outcomes.push(continued(state.fork()))
    }
    return outcomes.length ? outcomes.reduce(combineOutcomes) : continued(state)
}

/**
 * Executes a selected switch case including fallthrough.
 * @param {object[]} cases Switch cases.
 * @param {number} start First selected case.
 * @param {ExecutionState} state State.
 * @param {object} model Source model.
 * @param {Function} invoke Callable invoker.
 * @returns {{ normal: ExecutionState[], abrupt: object[] }} Outcome.
 */
function executeSwitchPath(cases, start, state, model, invoke) {
    let normal = [state]
    const exits = []
    const abrupt = []
    for (let index = start; index < cases.length && normal.length; index += 1) {
        const outcome = executeStatements(
            cases[index].consequent,
            normal,
            model,
            invoke
        )
        normal = outcome.normal
        for (const row of outcome.abrupt) {
            if (row.type === 'break' && !row.label) exits.push(row.state)
            else abrupt.push(row)
        }
    }
    return { normal: [...exits, ...normal], abrupt }
}

/**
 * Applies a finalizer to normal and pending abrupt completions.
 * @param {{ normal: ExecutionState[], abrupt: object[] }} outcome Pending outcome.
 * @param {object} finalizer Finalizer block.
 * @param {object} model Source model.
 * @param {Function} invoke Callable invoker.
 * @returns {{ normal: ExecutionState[], abrupt: object[] }} Finalized outcome.
 */
function executeFinalizer(outcome, finalizer, model, invoke) {
    const finalized = { normal: [], abrupt: [] }
    for (const state of outcome.normal) {
        mergeInto(finalized, executeStatement(finalizer, state, model, invoke))
    }
    for (const pending of outcome.abrupt) {
        const result = executeStatement(finalizer, pending.state, model, invoke)
        finalized.abrupt.push(...result.abrupt)
        for (const state of result.normal) {
            finalized.abrupt.push({ ...pending, state })
        }
    }
    return finalized
}

/**
 * Evaluates an expression to an abstract value.
 * @param {object | null} node Expression.
 * @param {ExecutionState} state State.
 * @param {object} model Source model.
 * @param {Function} invoke Callable invoker.
 * @returns {object} Abstract value.
 */
function evaluate(node, state, model, invoke) {
    if (!node) return unknownValue()
    if (node.type === 'ChainExpression') {
        return evaluate(node.expression, state, model, invoke)
    }
    if (node.type === 'Identifier') return state.read(node.name)
    if (node.type === 'Literal') {
        return primitiveValue(node.value)
    }
    if (node.type === 'TemplateLiteral') {
        return node.expressions.length === 0
            ? primitiveValue(node.quasis[0]?.value?.cooked || '')
            : primitiveValue()
    }
    if (isFunction(node)) {
        return callableValue(localDefinition(node, model.source), state)
    }
    if (node.type === 'ObjectExpression') {
        const properties = new Map()
        for (const property of node.properties) {
            if (property.type === 'SpreadElement') {
                const spread = evaluate(property.argument, state, model, invoke)
                for (const [name, value] of objectProperties(spread)) {
                    properties.set(name, value)
                }
                continue
            }
            const name = propertyName(property.key)
            if (!name) continue
            properties.set(
                name,
                property.method
                    ? callableValue(
                          localDefinition(property.value, model.source),
                          state
                      )
                    : evaluate(property.value, state, model, invoke)
            )
        }
        return objectValue(properties)
    }
    if (node.type === 'ArrayExpression') {
        return arrayValue(
            node.elements.map((row) => evaluate(row, state, model, invoke))
        )
    }
    if (node.type === 'MemberExpression') {
        const object = evaluate(node.object, state, model, invoke)
        const name = propertyName(node.property)
        return name ? propertyValue(object, name) : unknownValue()
    }
    if (node.type === 'CallExpression') {
        const callable = resolveCallable(node.callee, state, model, invoke)
        if (!callable) return unknownValue()
        const argumentsList = node.arguments.map((argument) =>
            evaluate(argument, state, model, invoke)
        )
        return invoke(callable.definition, argumentsList, callable.closureState)
    }
    if (node.type === 'AssignmentExpression') {
        const value = evaluate(node.right, state, model, invoke)
        assign(node.left, value, state, model, invoke)
        return value
    }
    if (node.type === 'ConditionalExpression') {
        evaluate(node.test, state, model, invoke)
        const constant = booleanValue(node.test)
        if (constant === true) {
            return evaluate(node.consequent, state, model, invoke)
        }
        if (constant === false) {
            return evaluate(node.alternate, state, model, invoke)
        }
        return unionValue([
            evaluate(node.consequent, state.fork(), model, invoke),
            evaluate(node.alternate, state.fork(), model, invoke)
        ])
    }
    if (node.type === 'LogicalExpression') {
        const left = evaluate(node.left, state, model, invoke)
        const decision = logicalDecision(node.operator, left)
        if (decision === false) return left
        if (decision === true) {
            return evaluate(node.right, state, model, invoke)
        }
        return unionValue([
            left,
            evaluate(node.right, state.fork(), model, invoke)
        ])
    }
    if (node.type === 'SequenceExpression') {
        let value = unknownValue()
        for (const expression of node.expressions) {
            value = evaluate(expression, state, model, invoke)
        }
        return value
    }
    for (const child of childExpressions(node)) {
        evaluate(child, state, model, invoke)
    }
    return unknownValue()
}

/**
 * Resolves a local, object-method, or same-class callable.
 * @param {object} node Callee expression.
 * @param {ExecutionState} state State.
 * @param {object} model Source model.
 * @param {Function} invoke Callable invoker.
 * @returns {object | null} Callable descriptor.
 */
function resolveCallable(node, state, model, invoke) {
    const callee = node.type === 'ChainExpression' ? node.expression : node
    if (callee.type === 'Identifier') {
        return callableDescriptor(state.read(callee.name))
    }
    if (isFunction(callee)) {
        return callableDescriptor(evaluate(callee, state, model, invoke))
    }
    if (callee.type !== 'MemberExpression') return null
    const name = propertyName(callee.property)
    const sameClass =
        callee.object.type === 'ThisExpression' ||
        (callee.object.type === 'Identifier' &&
            callee.object.name === model.className)
    if (sameClass && model.definitions.has(name)) {
        return {
            definition: model.definitions.get(name),
            closureState: null
        }
    }
    return callableDescriptor(
        propertyValue(evaluate(callee.object, state, model, invoke), name)
    )
}

/**
 * Assigns one identifier or bound object property.
 * @param {object} target Assignment target.
 * @param {object} value Assigned value.
 * @param {ExecutionState} state State.
 * @param {object} model Source model.
 * @param {Function} invoke Callable invoker.
 * @returns {void}
 */
function assign(target, value, state, model, invoke) {
    if (target.type === 'Identifier') {
        state.write(target.name, value)
        return
    }
    if (target.type !== 'MemberExpression') return
    const root = memberAssignment(target, propertyName)
    if (!root) return
    const current = state.read(root.name)
    state.write(root.name, setObjectPath(current, root.path, value))
    if (target.computed) evaluate(target.property, state, model, invoke)
}

/**
 * Declares identifier patterns and destructured object values.
 * @param {object | null} pattern Binding pattern.
 * @param {object} value Abstract value.
 * @param {ExecutionState} state State.
 * @returns {void}
 */
function declarePattern(pattern, value, state) {
    if (!pattern) return
    if (pattern.type === 'AssignmentPattern') {
        declarePattern(pattern.left, value, state)
        return
    }
    if (pattern.type === 'RestElement') {
        declarePattern(pattern.argument, value, state)
        return
    }
    if (pattern.type === 'Identifier') {
        state.declare(pattern.name, value)
        return
    }
    if (pattern.type === 'ObjectPattern') {
        for (const property of pattern.properties) {
            if (property.type === 'RestElement') {
                declarePattern(property.argument, unknownValue(), state)
                continue
            }
            declarePattern(
                property.value,
                propertyValue(value, propertyName(property.key)),
                state
            )
        }
    }
}

/**
 * Creates a continued outcome.
 * @param {ExecutionState} state State.
 * @returns {{ states: ExecutionState[], returns: object[] }} Outcome.
 */
function continued(state) {
    return { normal: [state], abrupt: [] }
}

/**
 * Combines control-flow outcomes.
 * @param {object} left Left outcome.
 * @param {object} right Right outcome.
 * @returns {object} Combined outcome.
 */
function combineOutcomes(left, right) {
    return {
        normal: [...left.normal, ...right.normal],
        abrupt: [...left.abrupt, ...right.abrupt]
    }
}

/**
 * Appends one outcome to a mutable accumulator.
 * @param {{ normal: ExecutionState[], abrupt: object[] }} target Target.
 * @param {{ normal: ExecutionState[], abrupt: object[] }} source Source.
 * @returns {void}
 */
function mergeInto(target, source) {
    target.normal.push(...source.normal)
    target.abrupt.push(...source.abrupt)
}

/**
 * Creates one pending abrupt completion.
 * @param {'return' | 'throw' | 'break' | 'continue'} type Completion type.
 * @param {ExecutionState} state Completion state.
 * @param {object | null} [value] Completion value.
 * @param {string} [label] Optional target label.
 * @returns {object} Completion.
 */
function completion(type, state, value = null, label = '') {
    return { type, state, value, label }
}

/**
 * Leaves a lexical scope for every state carried by an outcome.
 * @param {{ normal: ExecutionState[], abrupt: object[] }} outcome Outcome.
 * @returns {void}
 */
function leaveOutcomeScope(outcome) {
    for (const state of outcome.normal) state.leaveScope()
    for (const row of outcome.abrupt) row.state.leaveScope()
}

/**
 * Parses a class or standalone callable.
 * @param {string} ownerSource Class source.
 * @param {string} callableSource Callable source.
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
 * @param {string} name Name.
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
 * @param {string} source Full source.
 * @returns {object} Definition.
 */
function localDefinition(node, source) {
    return definition(node.id?.name || '<closure>', node, '', source)
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
 * Returns a constant boolean when known.
 * @param {object | null} node Expression.
 * @returns {boolean | null} Constant.
 */
function booleanValue(node) {
    return KicadOptionControlFlow.booleanValue(node)
}

/**
 * Returns whether a logical expression must evaluate its right operand.
 * @param {string} operator Logical operator.
 * @param {object} left Abstract left value.
 * @returns {boolean | null} Right-operand reachability.
 */
function logicalDecision(operator, left) {
    if (operator === '??') {
        const nullish = nullishValue(left)
        return nullish === null ? null : nullish
    }
    const truthy = truthyValue(left)
    if (truthy === null) return null
    return operator === '&&' ? truthy : !truthy
}

/**
 * Returns abstract truthiness when all represented values agree.
 * @param {object} value Abstract value.
 * @returns {boolean | null} Truthiness.
 */
function truthyValue(value) {
    if (value.kind === 'primitive') {
        return value.known ? Boolean(value.value) : null
    }
    if (['array', 'callable', 'object'].includes(value.kind)) return true
    if (value.kind !== 'union') return null
    const values = value.values.map(truthyValue)
    return values.every((row) => row === values[0]) ? values[0] : null
}

/**
 * Returns abstract nullishness when all represented values agree.
 * @param {object} value Abstract value.
 * @returns {boolean | null} Nullishness.
 */
function nullishValue(value) {
    if (value.kind === 'primitive') {
        return value.known
            ? value.value === null || value.value === undefined
            : null
    }
    if (['array', 'callable', 'object'].includes(value.kind)) return false
    if (value.kind !== 'union') return null
    const values = value.values.map(nullishValue)
    return values.every((row) => row === values[0]) ? values[0] : null
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
 * Returns whether a node is callable syntax.
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
 * Returns child expressions only.
 * @param {object} node Parent.
 * @returns {object[]} Expressions.
 */
function childExpressions(node) {
    const children = []
    for (const [key, value] of Object.entries(node)) {
        if (['start', 'end', 'loc', 'range'].includes(key)) continue
        const rows = Array.isArray(value) ? value : [value]
        for (const row of rows) {
            if (
                row &&
                (row.type === 'Identifier' || /Expression$/u.test(row.type))
            ) {
                children.push(row)
            }
        }
    }
    return children
}

/**
 * Returns preceding JSDoc.
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
 * Extracts documented return object paths.
 * @param {string} jsdoc JSDoc.
 * @returns {string[]} Paths.
 */
function documentedReturnFields(jsdoc) {
    const match = jsdoc.match(/@returns\s*\{([^\n]+)\}/u)
    if (!match) return []
    return objectTypePaths(match[1])
}

/**
 * Expands an object type into nested paths.
 * @param {string} type Type source.
 * @param {string} [prefix] Parent path.
 * @returns {string[]} Paths.
 */
function objectTypePaths(type, prefix = '') {
    const opening = type.indexOf('{')
    const closing = type.lastIndexOf('}')
    if (opening < 0 || closing <= opening) return []
    const fields = []
    for (const row of splitTopLevel(type.slice(opening + 1, closing))) {
        const match = row.match(/^\s*([\w$]+)(?:\?)?\s*:\s*(.+)$/u)
        if (!match) continue
        const path = prefix ? `${prefix}.${match[1]}` : match[1]
        fields.push(path, ...objectTypePaths(match[2], path))
    }
    return fields
}

/**
 * Splits comma-delimited source at top-level nesting.
 * @param {string} source Source.
 * @returns {string[]} Entries.
 */
function splitTopLevel(source) {
    const rows = []
    let depth = 0
    let start = 0
    for (let index = 0; index < source.length; index += 1) {
        if ('{[('.includes(source[index])) depth += 1
        else if ('}])'.includes(source[index])) depth -= 1
        else if (source[index] === ',' && depth === 0) {
            rows.push(source.slice(start, index))
            start = index + 1
        }
    }
    rows.push(source.slice(start))
    return rows
}
