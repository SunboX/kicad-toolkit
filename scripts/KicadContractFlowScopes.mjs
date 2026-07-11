// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

let bindingSequence = 0

/**
 * One lexical abstract-value scope for delegated call analysis.
 */
export class KicadAbstractScope {
    /**
     * Creates a scope.
     * @param {KicadAbstractScope | null} [parent] Parent scope.
     */
    constructor(parent = null) {
        this.parent = parent
        this.bindings = new Map()
    }

    /**
     * Declares a binding.
     * @param {string} name Name.
     * @param {object} value Value.
     * @returns {void}
     */
    declare(name, value) {
        this.bindings.set(name, value)
    }

    /**
     * Resolves a binding.
     * @param {string} name Name.
     * @returns {object | null} Value.
     */
    resolve(name) {
        return this.bindings.get(name) || this.parent?.resolve(name) || null
    }

    /**
     * Assigns an existing binding.
     * @param {string} name Name.
     * @param {object} value Value.
     * @returns {void}
     */
    assign(name, value) {
        if (this.bindings.has(name)) this.bindings.set(name, value)
        else this.parent?.assign(name, value)
    }

    /**
     * Forks the complete scope chain.
     * @returns {KicadAbstractScope} Fork.
     */
    fork() {
        const scope = new KicadAbstractScope(this.parent?.fork() || null)
        scope.bindings = new Map(this.bindings)
        return scope
    }
}

/**
 * One result-analysis execution state with lexical binding identities.
 */
export class KicadResultExecutionState {
    /**
     * Creates a state.
     * @param {ResultLexicalScope | null} [scope] Scope.
     * @param {Map<number, object>} [values] Values.
     */
    constructor(scope = null, values = new Map()) {
        this.scope = scope || new ResultLexicalScope()
        this.values = values
    }

    /**
     * Declares a binding.
     * @param {string} name Name.
     * @param {object} value Value.
     * @returns {void}
     */
    declare(name, value) {
        const id = ++bindingSequence
        this.scope.bindings.set(name, id)
        this.values.set(id, value)
    }

    /**
     * Reads a binding.
     * @param {string} name Name.
     * @returns {object} Value.
     */
    read(name) {
        const id = this.scope.resolve(name)
        return id
            ? this.values.get(id) || { kind: 'unknown' }
            : { kind: 'unknown' }
    }

    /**
     * Writes an existing binding.
     * @param {string} name Name.
     * @param {object} value Value.
     * @returns {void}
     */
    write(name, value) {
        const id = this.scope.resolve(name)
        if (id) this.values.set(id, value)
    }

    /**
     * Forks a state.
     * @returns {KicadResultExecutionState} Fork.
     */
    fork() {
        return new KicadResultExecutionState(
            this.scope.clone(),
            new Map(this.values)
        )
    }

    /**
     * Forks with a child lexical scope.
     * @returns {KicadResultExecutionState} Child state.
     */
    forkWithChildScope() {
        const fork = this.fork()
        fork.scope = new ResultLexicalScope(fork.scope)
        return fork
    }

    /**
     * Leaves one lexical scope.
     * @returns {void}
     */
    leaveScope() {
        if (this.scope.parent) this.scope = this.scope.parent
    }
}

/**
 * One lexical name-to-binding scope for result analysis.
 */
class ResultLexicalScope {
    /**
     * Creates a scope.
     * @param {ResultLexicalScope | null} [parent] Parent scope.
     */
    constructor(parent = null) {
        this.parent = parent
        this.bindings = new Map()
    }

    /**
     * Resolves one binding id.
     * @param {string} name Name.
     * @returns {number | null} Binding id.
     */
    resolve(name) {
        return this.bindings.get(name) || this.parent?.resolve(name) || null
    }

    /**
     * Clones the scope chain while preserving binding identities.
     * @returns {ResultLexicalScope} Clone.
     */
    clone() {
        const clone = new ResultLexicalScope(this.parent?.clone() || null)
        clone.bindings = new Map(this.bindings)
        return clone
    }
}
