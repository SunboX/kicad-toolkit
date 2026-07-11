// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Clones option provenance values.
 * @param {object[]} origins Origins.
 * @returns {object[]} Clones.
 */
export function cloneOrigins(origins) {
    return origins.map((origin) => ({
        path: [...origin.path],
        excluded: new Set(origin.excluded)
    }))
}

/**
 * Returns a stable origin signature.
 * @param {object[]} origins Origins.
 * @returns {string} Signature.
 */
export function originSignature(origins) {
    return origins
        .map(
            (origin) =>
                `${origin.path.join('.')}:${[...origin.excluded].sort().join(',')}`
        )
        .sort()
        .join(';')
}

/**
 * Deduplicates option origins.
 * @param {object[]} origins Origins.
 * @returns {object[]} Unique origins.
 */
function uniqueOrigins(origins) {
    const rows = new Map()
    for (const origin of origins) {
        rows.set(originSignature([origin]), origin)
    }
    return cloneOrigins([...rows.values()])
}

/**
 * One lexical option-analysis scope.
 */
export class KicadOptionScope {
    /**
     * Creates a scope.
     * @param {KicadOptionScope | null} [parent] Parent scope.
     */
    constructor(parent = null) {
        this.parent = parent
        this.bindings = new Map()
    }

    /**
     * Declares a binding.
     * @param {string} name Name.
     * @param {object} value Abstract value.
     * @returns {void}
     */
    declare(name, value) {
        this.bindings.set(name, {
            origins: cloneOrigins(value.origins || []),
            callable: value.callable || null,
            members: new Map(value.members || []),
            arrayLike: value.arrayLike === true
        })
    }

    /**
     * Resolves a binding.
     * @param {string} name Name.
     * @returns {object | null} Binding.
     */
    resolve(name) {
        return this.bindings.get(name) || this.parent?.resolve(name) || null
    }

    /**
     * Clones the complete visible scope chain.
     * @returns {KicadOptionScope} Fork.
     */
    fork() {
        const parent = this.parent?.fork() || null
        const clone = new KicadOptionScope(parent)
        for (const [name, binding] of this.bindings) {
            clone.declare(name, binding)
        }
        return clone
    }

    /**
     * Merges possible visible values after branches.
     * @param {KicadOptionScope[]} branches Branch scopes.
     * @returns {void}
     */
    merge(branches) {
        for (const [name, binding] of this.bindings) {
            const origins = branches.flatMap(
                (branch) => branch.resolve(name)?.origins || []
            )
            binding.origins = uniqueOrigins(origins)
            const values = branches
                .map((branch) => branch.resolve(name))
                .filter(Boolean)
            if (
                values.some(
                    (value) =>
                        value.callable?.definition?.id !==
                        binding.callable?.definition?.id
                )
            ) {
                binding.callable = null
            }
            binding.arrayLike =
                values.length > 0 && values.every((value) => value.arrayLike)
        }
        if (this.parent) {
            this.parent.merge(branches.map((branch) => branch.parent || branch))
        }
    }
}
