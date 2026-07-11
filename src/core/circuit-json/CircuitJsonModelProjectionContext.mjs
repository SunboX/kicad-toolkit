// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const CONTEXTS = new WeakMap()

/**
 * Carries non-serialized project projection context between native parsing and
 * CircuitJSON adaptation without changing the retained renderer model shape.
 */
export class CircuitJsonModelProjectionContext {
    /**
     * Associates a native board with safe projection-only fields.
     * @template {object} T
     * @param {T} board Native board model.
     * @param {unknown} options Native parser options.
     * @returns {T} The same board.
     */
    static attach(board, options) {
        if (!board || typeof board !== 'object') return board
        let descriptors
        try {
            descriptors = Object.getOwnPropertyDescriptors(options || {})
        } catch {
            descriptors = {}
        }
        const assetNames = CircuitJsonModelProjectionContext.#data(
            descriptors.modelAssetNames
        )
        CONTEXTS.set(board, {
            modelAssetNames: Array.isArray(assetNames)
                ? assetNames.map(String)
                : [],
            projectRoot:
                CircuitJsonModelProjectionContext.#data(
                    descriptors.projectRoot
                ) ?? null
        })
        return board
    }

    /**
     * Returns projection context for one native board.
     * @param {unknown} board Native board model.
     * @returns {{ modelAssetNames: string[], projectRoot: string | null }} Context.
     */
    static forBoard(board) {
        return (
            (board && typeof board === 'object' && CONTEXTS.get(board)) || {
                modelAssetNames: [],
                projectRoot: null
            }
        )
    }

    /**
     * Reads one own data descriptor.
     * @param {PropertyDescriptor | undefined} descriptor Descriptor.
     * @returns {unknown} Data value.
     */
    static #data(descriptor) {
        return descriptor && Object.hasOwn(descriptor, 'value')
            ? descriptor.value
            : undefined
    }
}

Object.freeze(CircuitJsonModelProjectionContext.prototype)
Object.freeze(CircuitJsonModelProjectionContext)
