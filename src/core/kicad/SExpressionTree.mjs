// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Utility helpers for reading KiCad S-expression trees.
 */
export class SExpressionTree {
    /**
     * Returns a node's first item as a string name.
     * @param {unknown} node S-expression node.
     * @returns {string}
     */
    static nodeName(node) {
        return Array.isArray(node) ? String(node[0] ?? '') : ''
    }

    /**
     * Finds direct child nodes, optionally filtered by one or more names.
     * @param {Array | undefined} node Parent node.
     * @param {string | string[]} [name] Child name or accepted child names.
     * @returns {Array[]}
     */
    static children(node, name) {
        if (!Array.isArray(node)) return []
        const names = Array.isArray(name) ? name.map(String) : null
        const singleName = typeof name === 'string' ? name : null

        return node.filter((entry) => {
            if (!Array.isArray(entry)) return false
            if (!name) return true
            const entryName = SExpressionTree.nodeName(entry)
            return names ? names.includes(entryName) : entryName === singleName
        })
    }

    /**
     * Finds the first direct child by name.
     * @param {Array | undefined} node Parent node.
     * @param {string | string[]} name Child name or accepted child names.
     * @returns {Array | undefined}
     */
    static child(node, name) {
        return SExpressionTree.children(node, name)[0]
    }

    /**
     * Returns true when a direct child exists.
     * @param {Array | undefined} node Parent node.
     * @param {string | string[]} name Child name or accepted child names.
     * @returns {boolean}
     */
    static hasChild(node, name) {
        return Boolean(SExpressionTree.child(node, name))
    }

    /**
     * Counts direct child node names.
     * @param {Array | undefined} node Parent node.
     * @returns {Record<string, number>}
     */
    static childNameCounts(node) {
        const counts = new Map()
        for (const child of SExpressionTree.children(node)) {
            const name = SExpressionTree.nodeName(child)
            counts.set(name, (counts.get(name) || 0) + 1)
        }
        return Object.fromEntries(counts)
    }

    /**
     * Lists direct child node names that occur more than once.
     * @param {Array | undefined} node Parent node.
     * @returns {string[]}
     */
    static duplicateChildNames(node) {
        return Object.entries(SExpressionTree.childNameCounts(node))
            .filter(([, count]) => count > 1)
            .map(([name]) => name)
    }

    /**
     * Describes generic structure and scalar values in one S-expression node.
     * @param {Array | undefined} node S-expression node.
     * @returns {{
     *     rootName: string,
     *     nodeCount: number,
     *     maxDepth: number,
     *     childNameCounts: Record<string, number>,
     *     duplicateChildNames: string[],
     *     scalarTypeCounts: Record<string, number>
     * }}
     */
    static describe(node) {
        const state = {
            nodeCount: 0,
            maxDepth: 0,
            scalarTypeCounts: {}
        }
        const depth = Array.isArray(node) ? 1 : 0

        SExpressionTree.#collectDescription(node, depth, state)

        return {
            rootName: SExpressionTree.nodeName(node),
            nodeCount: state.nodeCount,
            maxDepth: state.maxDepth,
            childNameCounts: SExpressionTree.childNameCounts(node),
            duplicateChildNames: SExpressionTree.duplicateChildNames(node),
            scalarTypeCounts: state.scalarTypeCounts
        }
    }

    /**
     * Reads the first positional value from a node as text.
     * @param {Array | unknown} value Node or scalar value.
     * @param {string} [fallback] Fallback text.
     * @returns {string}
     */
    static textValue(value, fallback = '') {
        const scalar = Array.isArray(value) ? value[1] : value
        if (scalar === undefined || scalar === null) return fallback
        return String(scalar)
    }

    /**
     * Reads a numeric value with fallback.
     * @param {Array | unknown} value Node or scalar value.
     * @param {number} fallback Fallback number.
     * @returns {number}
     */
    static numberValue(value, fallback) {
        const scalar = Array.isArray(value) ? value[1] : value
        const parsed = Number(scalar)
        return Number.isFinite(parsed) ? parsed : fallback
    }

    /**
     * Reads a boolean-like KiCad value.
     * @param {Array | unknown} value Node or scalar value.
     * @param {boolean} fallback Fallback boolean.
     * @returns {boolean}
     */
    static booleanValue(value, fallback) {
        const scalar = Array.isArray(value) ? value[1] : value
        if (scalar === true || scalar === 1 || scalar === '1') return true
        if (scalar === false || scalar === 0 || scalar === '0') return false

        const text = String(scalar ?? '').toLowerCase()
        if (text === 'yes' || text === 'true') return true
        if (text === 'no' || text === 'false') return false
        return fallback
    }

    /**
     * Reads a two-coordinate node or nested xy child.
     * @param {Array | undefined} node Coordinate node.
     * @param {{ x: number, y: number }} [fallback] Fallback point.
     * @returns {{ x: number, y: number }}
     */
    static vec2(node, fallback = { x: 0, y: 0 }) {
        const source = SExpressionTree.child(node, 'xy') || node
        return {
            x: SExpressionTree.numberValue(source?.[1], fallback.x),
            y: SExpressionTree.numberValue(source?.[2], fallback.y)
        }
    }

    /**
     * Reads a three-coordinate node or nested xyz child.
     * @param {Array | undefined} node Coordinate node.
     * @param {{ x: number, y: number, z: number }} [fallback] Fallback point.
     * @returns {{ x: number, y: number, z: number }}
     */
    static vec3(node, fallback = { x: 0, y: 0, z: 0 }) {
        const source = SExpressionTree.child(node, 'xyz') || node
        return {
            x: SExpressionTree.numberValue(source?.[1], fallback.x),
            y: SExpressionTree.numberValue(source?.[2], fallback.y),
            z: SExpressionTree.numberValue(source?.[3], fallback.z)
        }
    }

    /**
     * Reads a four-coordinate node.
     * @param {Array | undefined} node Coordinate node.
     * @param {{ x: number, y: number, z: number, w: number }} [fallback] Fallback value.
     * @returns {{ x: number, y: number, z: number, w: number }}
     */
    static vec4(node, fallback = { x: 0, y: 0, z: 0, w: 0 }) {
        return {
            x: SExpressionTree.numberValue(node?.[1], fallback.x),
            y: SExpressionTree.numberValue(node?.[2], fallback.y),
            z: SExpressionTree.numberValue(node?.[3], fallback.z),
            w: SExpressionTree.numberValue(node?.[4], fallback.w)
        }
    }

    /**
     * Reads a KiCad color node and normalizes RGB channels to 0..1.
     * @param {Array | undefined} node Color node.
     * @returns {{ r: number, g: number, b: number, a: number }}
     */
    static color(node) {
        return {
            r: SExpressionTree.numberValue(node?.[1], 0) / 255,
            g: SExpressionTree.numberValue(node?.[2], 0) / 255,
            b: SExpressionTree.numberValue(node?.[3], 0) / 255,
            a: SExpressionTree.numberValue(node?.[4], 1)
        }
    }

    /**
     * Reads direct property nodes into a map.
     * @param {Array | undefined} node Parent node.
     * @returns {Map<string, string>}
     */
    static properties(node) {
        return new Map(
            SExpressionTree.children(node, 'property').map((property) => [
                String(property[1] || ''),
                String(property[2] || '')
            ])
        )
    }

    /**
     * Reads direct property nodes into a plain object.
     * @param {Array | undefined} node Parent node.
     * @returns {Record<string, string>}
     */
    static propertyObject(node) {
        return Object.fromEntries(SExpressionTree.properties(node))
    }

    /**
     * Accumulates generic node and scalar facts.
     * @param {unknown} value S-expression subtree or scalar.
     * @param {number} depth Current array nesting depth.
     * @param {{
     *     nodeCount: number,
     *     maxDepth: number,
     *     scalarTypeCounts: Record<string, number>
     * }} state Mutable accumulator.
     * @returns {void}
     */
    static #collectDescription(value, depth, state) {
        if (Array.isArray(value)) {
            state.nodeCount += 1
            state.maxDepth = Math.max(state.maxDepth, depth)
            for (const child of value) {
                SExpressionTree.#collectDescription(child, depth + 1, state)
            }
            return
        }

        const type = SExpressionTree.#scalarTypeName(value)
        state.scalarTypeCounts[type] = (state.scalarTypeCounts[type] || 0) + 1
    }

    /**
     * Returns a stable public scalar type name.
     * @param {unknown} value Scalar value.
     * @returns {string}
     */
    static #scalarTypeName(value) {
        return value === null ? 'null' : typeof value
    }
}
