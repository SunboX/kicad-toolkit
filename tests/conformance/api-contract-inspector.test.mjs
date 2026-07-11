// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { KicadApiContractInspector } from '../../scripts/KicadApiContractInspector.mjs'
import { KicadModuleContractRegistry } from '../../scripts/KicadModuleContractRegistry.mjs'

import { DelegateWrapperProbe } from './fixtures/DelegateWrapperProbe.mjs'
import { DelegateStrictProbe as DelegateStrictBaselineProbe } from './fixtures/DelegateStrictBaselineProbe.mjs'
import { DelegateStrictProbe as DelegateStrictDriftProbe } from './fixtures/DelegateStrictDriftProbe.mjs'
import { TryFinallyFlowProbe } from './fixtures/TryFinallyFlowProbe.mjs'

const repositoryRoot = new URL('../../', import.meta.url)

/**
 * Returns one named callable from an exported contract.
 * @param {Record<string, any>} contract Export contract.
 * @param {string} name Callable name.
 * @returns {Record<string, any>} Callable contract.
 */
function namedCallable(contract, name) {
    return contract.callables.find((row) => row.name === name)
}

class LexicalContractProbe {
    /**
     * Exercises real forwarding without treating nested results as options.
     * @param {object} [options] Probe options.
     * @returns {object}
     */
    static inspect(options = {}) {
        const sourceText = 'options.stringOnly return { stringOnly: true }'
        const rows = [{ shadowOnly: true }]
        // options.commentOnly must never become a public option.
        for (const options of rows) {
            if (options.shadowOnly) continue
        }
        void sourceText
        return LexicalContractProbe.#wrap(LexicalContractProbe.#decode(options))
    }

    /**
     * Reads the one truly forwarded option.
     * @param {object} settings Forwarded options.
     * @returns {object}
     */
    static #decode(settings) {
        return { kind: String(settings.variables || 'probe') }
    }

    /**
     * Builds a result through a bound object and wrapper call.
     * @param {object} board Decoded board.
     * @returns {object}
     */
    static #wrap(board) {
        const result = {
            kind: board.kind,
            summary: { count: 1 }
        }
        const ignored = {}
        ignored.unreturned = true
        ;[board].map((entry) => ({ callbackOnly: entry.kind }))
        return LexicalContractProbe.#attach(result)
    }

    /**
     * Returns a structurally resolved internal wrapper value.
     * @param {object} value Result value.
     * @returns {object}
     */
    static #attach(value) {
        return value
    }

    /**
     * Returns the public schema id.
     * @returns {string}
     */
    static get schema() {
        return 'probe.schema.a1'
    }

    /**
     * Returns instance assets.
     * @returns {object[]}
     */
    get assets() {
        return []
    }
}

class AdversarialFlowProbe {
    /**
     * Reads destructured options and one invoked closure only.
     * @param {object} [options] Probe options.
     * @returns {object}
     */
    static inspect(options = {}) {
        const { variables, project: projectVariables } = options
        const neverCalled = () => options.closureOnly
        const called = () => options.called
        /** @returns {unknown} One reachable declaration result. */
        function declaredCalled() {
            return options.declaredCalled
        }
        /** @returns {unknown} One unreachable declaration result. */
        function declaredNever() {
            return options.declaredNever
        }
        called()
        declaredCalled()
        ;[true].filter(() => options.callback)
        if (false) options.unreachable
        try {
            void projectVariables
        } catch (options) {
            void options.catchOnly
        }
        void variables
        void neverCalled
        void declaredNever
        return { live: true }
        // This read is unreachable and must not become public API.
        void options.afterReturn
    }

    /**
     * Reads options directly from a destructured parameter.
     * @param {object} options Probe options.
     * @returns {object}
     */
    static destructured({ direct, renamed: localName } = {}) {
        void direct
        void localName
        return { destructured: true }
    }

    /**
     * Returns only reachable values in their lexical scope.
     * @param {boolean} flag Branch selector.
     * @returns {object}
     */
    static result(flag) {
        const outer = { outer: true }
        if (false) return { unreachable: true }
        JSON.stringify({ argumentOnly: true })
        {
            const outer = { shadowOnly: true }
            void outer
        }
        const neverCalled = () => ({ closureOnly: true })
        const called = () => ({ called: true })
        void neverCalled
        if (flag) return outer
        return called()
        return { afterReturn: true }
    }

    /**
     * Exercises switch reachability and constant logical short-circuiting.
     * @param {string} mode Branch selector.
     * @param {object} [options] Probe options.
     * @returns {object}
     */
    static optionBranches(mode, options = {}) {
        switch (mode) {
            case 'first':
                void options.switchFirst
                break
            case 'second':
                void options.switchSecond
                return { second: true }
            default:
                void options.switchDefault
        }
        false && options.andDead
        true && options.andLive
        true || options.orDead
        false || options.orLive
        null ?? options.nullishLive
        'present' ?? options.nullishDead
        return { first: true }
    }

    /**
     * Executes a callback parameter through an arbitrary local helper.
     * @param {object} [options] Probe options.
     * @returns {object}
     */
    static callbackProvenance(options = {}) {
        const invoke = (callback, value) => callback(value)
        invoke((settings) => settings.localHelper, options)
        const fakeCollection = {
            map(callback) {
                return callback
            }
        }
        fakeCollection.map(() => options.fakeMap)
        return { callback: true }
    }

    /**
     * Preserves callback reads on a documented Array with a fallback.
     * @param {object[]} rows Probe rows.
     * @param {object} [options] Probe options.
     * @returns {object[]}
     */
    static documentedArrayCallback(rows, options = {}) {
        return (rows || []).map(() => options.documentedArray)
    }

    /**
     * Returns the value selected by constant logical expressions.
     * @returns {object}
     */
    static logicalResult() {
        const ignoredAnd = false && { andDead: true }
        const ignoredOr = true || { orDead: true }
        const ignoredNullish = 'present' ?? { nullishDead: true }
        void ignoredAnd
        void ignoredOr
        void ignoredNullish
        return (
            (false || { orLive: true }) &&
            true && { andLive: true } &&
            (null ?? { nullishLive: true })
        )
    }

    /**
     * Returns only the statically selected switch branch.
     * @returns {object}
     */
    static switchResult() {
        switch ('selected') {
            case 'dead':
                return { switchDead: true }
            case 'selected':
                return { switchLive: true }
            default:
                return { switchDefaultDead: true }
        }
    }

    /**
     * Lets a returning finalizer override a pending try return.
     * @returns {object}
     */
    static finallyResult() {
        try {
            return { tryDead: true }
        } finally {
            return { finallyLive: true }
        }
    }

    /**
     * Preserves a pending try return when the finalizer completes normally.
     * @returns {object}
     */
    static preservingFinallyResult() {
        try {
            return { tryLive: true }
        } finally {
            const localOnly = { finallyLocalOnly: true }
            void localOnly
        }
    }
}

class LocalSwitchControlProbe {
    /**
     * Stops evaluating labels and bodies after the selected case breaks.
     * @param {object} [options] Probe options.
     * @returns {object}
     */
    static selectedBreak(options = {}) {
        switch ('selected') {
            case 'selected':
                void options.selected
                break
            case options.deadLabel:
                void options.deadBody
                break
            default:
                void options.deadDefault
        }
        return { afterBreak: true }
    }

    /**
     * Stops after a selected abrupt null return.
     * @param {object} [options] Probe options.
     * @returns {object | null}
     */
    static selectedReturn(options = {}) {
        switch ('selected') {
            case 'selected':
                return null
            case options.deadLabel:
                return { deadBody: options.deadBody }
            default:
                return { deadDefault: true }
        }
    }

    /**
     * Preserves selected-case fallthrough until an unlabeled break.
     * @param {object} [options] Probe options.
     * @returns {object}
     */
    static selectedFallthrough(options = {}) {
        switch ('selected') {
            case 'selected':
                void options.selected
            case 'fallthrough':
                void options.fallthrough
                break
            default:
                void options.deadDefault
        }
        return { afterFallthrough: true }
    }
}

class LocalSwitchStrictBaselineProbe {
    /**
     * Returns the live selected contract.
     * @param {object} [options] Probe options.
     * @returns {object | null}
     */
    static inspect(options = {}) {
        switch ('selected') {
            case 'selected':
                return { live: options.shared }
            case options.shared:
                return { live: options.shared }
            default:
                return { live: options.shared }
        }
    }
}

class LocalSwitchStrictDriftProbe {
    /**
     * Replaces the live selected contract with null.
     * @param {object} [options] Probe options.
     * @returns {object | null}
     */
    static inspect(options = {}) {
        switch ('selected') {
            case 'selected':
                return null
            case options.shared:
                return { live: options.shared }
            default:
                return { live: options.shared }
        }
    }
}

class LiteralLoopContractProbe {
    /**
     * Returns from a loop whose literal condition cannot fall through.
     * @param {object} [options] Probe options.
     * @returns {object}
     */
    static returning(options = {}) {
        while (true) {
            void options.beforeReturn
            return { loopReturn: true }
        }
        void options.afterReturn
        return { afterReturn: true }
    }

    /**
     * Breaks a literal infinite loop and continues after it.
     * @param {object} [options] Probe options.
     * @returns {object}
     */
    static breaking(options = {}) {
        for (;;) {
            void options.beforeBreak
            break
        }
        void options.afterBreak
        return { afterBreak: true }
    }

    /**
     * Continues a literal infinite loop without reaching later statements.
     * @param {object} [options] Probe options.
     * @returns {object}
     */
    static continuing(options = {}) {
        do {
            void options.beforeContinue
            continue
        } while (true)
        void options.afterContinue
        return { afterContinue: true }
    }

    /**
     * Ignores an unreachable break inside a literal infinite loop.
     * @param {object} [options] Probe options.
     * @returns {object}
     */
    static unreachableBreak(options = {}) {
        while (true) {
            if (false) break
            void options.loopOnly
            continue
        }
        void options.afterUnreachableBreak
        return { afterUnreachableBreak: true }
    }

    /**
     * Breaks the labeled literal loop and continues after it.
     * @param {object} [options] Probe options.
     * @returns {object}
     */
    static labeledBreak(options = {}) {
        outer: while (true) {
            void options.beforeLabeledBreak
            break outer
        }
        void options.afterLabeledBreak
        return { afterLabeledBreak: true }
    }

    /**
     * Continues the labeled literal loop without reaching later statements.
     * @param {object} [options] Probe options.
     * @returns {object}
     */
    static labeledContinue(options = {}) {
        outer: do {
            void options.beforeLabeledContinue
            continue outer
        } while (true)
        void options.afterLabeledContinue
        return { afterLabeledContinue: true }
    }
}

class AccessorContractProbe {
    /**
     * Returns nested observable settings.
     * @returns {object}
     */
    static get settings() {
        return {
            schema: 'probe.settings.a1',
            nested: { enabled: true },
            rows: [{ id: 1 }]
        }
    }

    /**
     * Accepts replacement settings.
     * @param {{ schema?: string, nested?: object }} value New settings.
     */
    static set settings(value) {
        void value
    }
}

test('API inspector follows lexical bindings and method-scope result flow', () => {
    const contract = KicadApiContractInspector.exported(
        'LexicalContractProbe',
        LexicalContractProbe
    )
    const inspect = contract.callables.find((row) => row.name === 'inspect')

    assert.deepEqual(inspect.options, ['variables'])
    assert.deepEqual(inspect.resultFields, ['kind', 'summary', 'summary.count'])
})

test('API inspector freezes static values and documented instance accessor types', () => {
    const contract = KicadApiContractInspector.exported(
        'LexicalContractProbe',
        LexicalContractProbe
    )

    assert.deepEqual(contract.staticAccessors, [
        {
            name: 'schema',
            get: true,
            set: false,
            getContract: {
                returnType: 'string',
                value: { type: 'string', value: 'probe.schema.a1' }
            }
        }
    ])
    assert.deepEqual(contract.instanceAccessors, [
        {
            name: 'assets',
            get: true,
            set: false,
            getContract: {
                returnType: 'object[]',
                value: null
            }
        }
    ])
})

test('API inspector hashes CSS and captures selectors and declarations', () => {
    const source = `/* ignored { comment } */
.pcb-svg, .board-view {
    display: block;
    content: "a;{b}";
}`

    assert.deepEqual(KicadApiContractInspector.stylesheet(source), {
        sha256: createHash('sha256').update(source).digest('hex'),
        rules: [
            {
                selectors: ['.board-view', '.pcb-svg'],
                declarations: [
                    { property: 'content', value: '"a;{b}"' },
                    { property: 'display', value: 'block' }
                ]
            }
        ]
    })
})

test('worker protocol capture ignores message-like comments and strings', () => {
    const source = `
// message.commentOnly === 'parse:comment'
// return { type: 'parser:comment', commentField: true }
async function handleMessage(message) {
    const prose = "message.stringOnly === 'parse:string'; return { type: 'parser:string', stringField: true }"
    void prose
    if (message?.type !== 'parse:file') throw new Error('unsupported')
    return {
        type: 'parser:success',
        requestId: message.requestId || '',
        documentModel: parse(message.fileName, message.buffer, message.options || {})
    }
}`

    assert.deepEqual(
        KicadApiContractInspector.workerProtocol(source, './worker'),
        {
            entrypoint: './worker',
            messages: [
                {
                    type: 'parse:file',
                    direction: 'request',
                    fields: [
                        { name: 'buffer', required: true },
                        { name: 'fileName', required: true },
                        { name: 'options', required: false },
                        { name: 'requestId', required: false },
                        { name: 'type', required: true }
                    ]
                },
                {
                    type: 'parser:success',
                    direction: 'response',
                    fields: [
                        { name: 'documentModel', required: true },
                        { name: 'requestId', required: true },
                        { name: 'type', required: true }
                    ]
                }
            ]
        }
    )
})

test('API inspector models destructuring, reachability, catches, and invoked closures', () => {
    const contract = KicadApiContractInspector.exported(
        'AdversarialFlowProbe',
        AdversarialFlowProbe
    )

    assert.deepEqual(
        contract.callables.find((row) => row.name === 'inspect').options,
        ['callback', 'called', 'declaredCalled', 'project', 'variables']
    )
    assert.deepEqual(
        contract.callables.find((row) => row.name === 'destructured').options,
        ['direct', 'renamed']
    )
})

test('API inspector follows only reachable scoped result values', () => {
    const contract = KicadApiContractInspector.exported(
        'AdversarialFlowProbe',
        AdversarialFlowProbe
    )

    assert.deepEqual(
        contract.callables.find((row) => row.name === 'result').resultFields,
        ['called', 'outer']
    )
})

test('API inspector follows switch cases and constant logical reachability', () => {
    const contract = KicadApiContractInspector.exported(
        'AdversarialFlowProbe',
        AdversarialFlowProbe
    )

    assert.deepEqual(
        contract.callables.find((row) => row.name === 'optionBranches').options,
        [
            'andLive',
            'nullishLive',
            'orLive',
            'switchDefault',
            'switchFirst',
            'switchSecond'
        ]
    )
})

test('API inspector derives callback invocation from local callable provenance', () => {
    const contract = KicadApiContractInspector.exported(
        'AdversarialFlowProbe',
        AdversarialFlowProbe
    )

    assert.deepEqual(
        contract.callables.find((row) => row.name === 'callbackProvenance')
            .options,
        ['localHelper']
    )
    assert.deepEqual(
        contract.callables.find((row) => row.name === 'documentedArrayCallback')
            .options,
        ['documentedArray']
    )
})

test('API inspector respects logical, switch, and finally result flow', () => {
    const contract = KicadApiContractInspector.exported(
        'AdversarialFlowProbe',
        AdversarialFlowProbe
    )

    assert.deepEqual(
        contract.callables.find((row) => row.name === 'logicalResult')
            .resultFields,
        ['nullishLive']
    )
    assert.deepEqual(
        contract.callables.find((row) => row.name === 'switchResult')
            .resultFields,
        ['switchLive']
    )
    assert.deepEqual(
        contract.callables.find((row) => row.name === 'finallyResult')
            .resultFields,
        ['finallyLive']
    )
    assert.deepEqual(
        contract.callables.find((row) => row.name === 'preservingFinallyResult')
            .resultFields,
        ['tryLive']
    )
})

test('API inspector stops local switch analysis after a guaranteed match', () => {
    const contract = KicadApiContractInspector.exported(
        'LocalSwitchControlProbe',
        LocalSwitchControlProbe
    )

    assert.deepEqual(namedCallable(contract, 'selectedBreak').options, [
        'selected'
    ])
    assert.deepEqual(namedCallable(contract, 'selectedBreak').resultFields, [
        'afterBreak'
    ])
    assert.deepEqual(namedCallable(contract, 'selectedReturn').options, [])
    assert.deepEqual(namedCallable(contract, 'selectedReturn').resultFields, [])
    assert.deepEqual(namedCallable(contract, 'selectedFallthrough').options, [
        'fallthrough',
        'selected'
    ])
    assert.deepEqual(
        namedCallable(contract, 'selectedFallthrough').resultFields,
        ['afterFallthrough']
    )
})

test('local switch contracts expose a selected-case null strict drift', () => {
    const baseline = KicadApiContractInspector.exported(
        'LocalSwitchStrictProbe',
        LocalSwitchStrictBaselineProbe
    ).callables.find((row) => row.name === 'inspect')
    const drift = KicadApiContractInspector.exported(
        'LocalSwitchStrictProbe',
        LocalSwitchStrictDriftProbe
    ).callables.find((row) => row.name === 'inspect')

    assert.notDeepEqual(drift, baseline)
    assert.deepEqual(baseline.options, ['shared'])
    assert.deepEqual(baseline.resultFields, ['live'])
    assert.deepEqual(drift.options, [])
    assert.deepEqual(drift.resultFields, [])
})

test('API inspector models literal loop return, break, and continue reachability', () => {
    const contract = KicadApiContractInspector.exported(
        'LiteralLoopContractProbe',
        LiteralLoopContractProbe
    )

    assert.deepEqual(namedCallable(contract, 'returning').options, [
        'beforeReturn'
    ])
    assert.deepEqual(namedCallable(contract, 'returning').resultFields, [
        'loopReturn'
    ])
    assert.deepEqual(namedCallable(contract, 'breaking').options, [
        'afterBreak',
        'beforeBreak'
    ])
    assert.deepEqual(namedCallable(contract, 'breaking').resultFields, [
        'afterBreak'
    ])
    assert.deepEqual(namedCallable(contract, 'continuing').options, [
        'beforeContinue'
    ])
    assert.deepEqual(namedCallable(contract, 'continuing').resultFields, [])
    assert.deepEqual(namedCallable(contract, 'unreachableBreak').options, [
        'loopOnly'
    ])
    assert.deepEqual(
        namedCallable(contract, 'unreachableBreak').resultFields,
        []
    )
    assert.deepEqual(namedCallable(contract, 'labeledBreak').options, [
        'afterLabeledBreak',
        'beforeLabeledBreak'
    ])
    assert.deepEqual(namedCallable(contract, 'labeledBreak').resultFields, [
        'afterLabeledBreak'
    ])
    assert.deepEqual(namedCallable(contract, 'labeledContinue').options, [
        'beforeLabeledContinue'
    ])
    assert.deepEqual(
        namedCallable(contract, 'labeledContinue').resultFields,
        []
    )
})

test('API inspector preserves typed completions through try, catch, and finally', () => {
    const contract = KicadApiContractInspector.exported(
        'TryFinallyFlowProbe',
        TryFinallyFlowProbe
    )

    assert.deepEqual(namedCallable(contract, 'breakThroughFinally').options, [
        'afterBreak',
        'finallyLive'
    ])
    assert.deepEqual(
        namedCallable(contract, 'breakThroughFinally').resultFields,
        ['afterBreak']
    )
    assert.deepEqual(
        namedCallable(contract, 'continueThroughFinally').options,
        ['finallyLive']
    )
    assert.deepEqual(
        namedCallable(contract, 'continueThroughFinally').resultFields,
        []
    )
    assert.deepEqual(namedCallable(contract, 'returnThroughFinally').options, [
        'finallyLive'
    ])
    assert.deepEqual(
        namedCallable(contract, 'returnThroughFinally').resultFields,
        ['returned']
    )
    assert.deepEqual(namedCallable(contract, 'nonThrowingTry').options, [
        'tryLive'
    ])
    assert.deepEqual(namedCallable(contract, 'nonThrowingTry').resultFields, [
        'live'
    ])
    assert.deepEqual(namedCallable(contract, 'throwingCall').options, [
        'catchLive',
        'text'
    ])
    assert.deepEqual(namedCallable(contract, 'throwingCall').resultFields, [
        'caught',
        'parsed'
    ])
})

test('entrypoint delegation resolves exact symbols, aliases, and bound results', async () => {
    const delegates = await KicadModuleContractRegistry.load(
        './tests/conformance/fixtures/DelegateWrapperProbe.mjs',
        repositoryRoot
    )
    const contract = KicadApiContractInspector.entrypoint(
        './probe',
        './tests/conformance/fixtures/DelegateWrapperProbe.mjs',
        { DelegateWrapperProbe },
        delegates
    )
    const wrapper = contract.exports[0]

    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'inspect').options,
        ['exactOption']
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'inspect').resultFields,
        ['exact', 'nested', 'nested.value']
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'shadow').options,
        []
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'shadow').resultFields,
        ['local']
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'logicalDead').options,
        []
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'logicalDead')
            .resultFields,
        ['logical']
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'logicalSelection')
            .options,
        ['exactOption']
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'logicalSelection')
            .resultFields,
        ['logical']
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'selectedSwitch').options,
        []
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'selectedSwitch')
            .resultFields,
        []
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'switchFallthrough')
            .options,
        ['exactOption']
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'switchFallthrough')
            .resultFields,
        ['afterSwitch']
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'finallyOverride').options,
        ['exactOption']
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'finallyOverride')
            .resultFields,
        []
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'finallySideEffect')
            .options,
        ['exactOption']
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'finallySideEffect')
            .resultFields,
        ['preserved']
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'deadCatch').options,
        []
    )
    assert.deepEqual(
        wrapper.callables.find((row) => row.name === 'deadCatch').resultFields,
        []
    )
})

test('delegated switch contracts expose a selected-case null strict drift', async () => {
    const [baselineDelegates, driftDelegates] = await Promise.all([
        KicadModuleContractRegistry.load(
            './tests/conformance/fixtures/DelegateStrictBaselineProbe.mjs',
            repositoryRoot
        ),
        KicadModuleContractRegistry.load(
            './tests/conformance/fixtures/DelegateStrictDriftProbe.mjs',
            repositoryRoot
        )
    ])
    const baseline = KicadApiContractInspector.entrypoint(
        './strict-probe',
        './tests/conformance/fixtures/DelegateStrictBaselineProbe.mjs',
        { DelegateStrictProbe: DelegateStrictBaselineProbe },
        baselineDelegates
    ).exports[0].callables.find((row) => row.name === 'inspect')
    const drift = KicadApiContractInspector.entrypoint(
        './strict-probe',
        './tests/conformance/fixtures/DelegateStrictDriftProbe.mjs',
        { DelegateStrictProbe: DelegateStrictDriftProbe },
        driftDelegates
    ).exports[0].callables.find((row) => row.name === 'inspect')

    assert.notDeepEqual(drift, baseline)
    assert.deepEqual(baseline.options, ['exactOption'])
    assert.deepEqual(baseline.resultFields, ['exact', 'nested', 'nested.value'])
    assert.deepEqual(drift.options, [])
    assert.deepEqual(drift.resultFields, [])
})

test('API inspector captures setters and bounded deep getter values', () => {
    const contract = KicadApiContractInspector.exported(
        'AccessorContractProbe',
        AccessorContractProbe
    )

    assert.deepEqual(contract.staticAccessors, [
        {
            name: 'settings',
            get: true,
            set: true,
            getContract: {
                returnType: 'object',
                value: {
                    type: 'object',
                    value: {
                        nested: {
                            type: 'object',
                            value: {
                                enabled: { type: 'boolean', value: true }
                            }
                        },
                        rows: {
                            type: 'array',
                            length: 1,
                            value: [
                                {
                                    type: 'object',
                                    value: {
                                        id: { type: 'number', value: 1 }
                                    }
                                }
                            ]
                        },
                        schema: {
                            type: 'string',
                            value: 'probe.settings.a1'
                        }
                    }
                }
            },
            setContract: {
                parameter: 'value',
                parameterType: '{ schema?: string, nested?: object }'
            }
        }
    ])
})
