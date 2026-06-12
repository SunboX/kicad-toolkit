// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Serializes KiCad-style S-expression trees back to source text.
 */
export class SExpressionSerializer {
    /**
     * Serializes one S-expression value.
     * @param {unknown} value S-expression tree, list, or scalar.
     * @returns {string}
     */
    static serialize(value) {
        return SExpressionSerializer.#serializeValue(value, 0, false)
    }

    /**
     * Serializes one S-expression document and appends a trailing newline.
     * @param {unknown} value S-expression root.
     * @returns {string}
     */
    static serializeDocument(value) {
        return SExpressionSerializer.serialize(value) + '\n'
    }

    /**
     * Serializes one value.
     * @param {unknown} value S-expression value.
     * @param {number} depth Current tree depth.
     * @param {boolean} isHead Whether the scalar is a node head token.
     * @returns {string}
     */
    static #serializeValue(value, depth, isHead) {
        if (Array.isArray(value)) {
            return SExpressionSerializer.#serializeNode(value, depth)
        }

        if (typeof value === 'number') {
            return Number.isFinite(value) ? String(value) : '0'
        }

        if (typeof value === 'boolean') {
            return value ? 'yes' : 'no'
        }

        const text = String(value ?? '')
        if (isHead || SExpressionSerializer.#isBareAtom(text)) {
            return text || '""'
        }

        return SExpressionSerializer.#quote(text)
    }

    /**
     * Serializes one node list.
     * @param {unknown[]} node Node values.
     * @param {number} depth Current tree depth.
     * @returns {string}
     */
    static #serializeNode(node, depth) {
        return (
            '(' +
            node
                .map((entry, index) =>
                    SExpressionSerializer.#serializeValue(
                        entry,
                        depth + 1,
                        index === 0
                    )
                )
                .join(' ') +
            ')'
        )
    }

    /**
     * Quotes one scalar string.
     * @param {string} value Raw string value.
     * @returns {string}
     */
    static #quote(value) {
        return (
            '"' +
            value
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t') +
            '"'
        )
    }

    /**
     * Returns true when a scalar can be emitted as a bare KiCad atom.
     * @param {string} value Raw scalar value.
     * @returns {boolean}
     */
    static #isBareAtom(value) {
        return /^[a-z_][a-z0-9_-]*$/u.test(value)
    }
}
