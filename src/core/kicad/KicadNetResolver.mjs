// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Resolves KiCad PCB net declarations and connected-item references.
 */
export class KicadNetResolver {
    #records = []
    #indexByName = new Map()
    #nameByIndex = new Map()
    #nextIndex = 1

    /**
     * Builds a resolver from top-level KiCad net nodes.
     * @param {Array[]} nodes Top-level net nodes.
     * @returns {KicadNetResolver}
     */
    static fromNodes(nodes) {
        const resolver = new KicadNetResolver()
        for (const node of nodes || []) {
            const reference = KicadNetResolver.parseReferenceNode(node)
            resolver.#observeIndex(reference.netIndex)
            if (reference.name) {
                resolver.#ensureRecord(reference.name, reference.netIndex)
            }
        }
        return resolver
    }

    /**
     * Parses a KiCad net node into optional index and name fields.
     * @param {Array | undefined} node Net S-expression node.
     * @returns {{ netIndex: number | null, name: string }}
     */
    static parseReferenceNode(node) {
        if (!Array.isArray(node)) return { netIndex: null, name: '' }

        const values = node.slice(1)
        const numericValue = values.find((value) => {
            return Number.isInteger(Number(value))
        })
        const nameValue = values.find((value) => {
            return value !== numericValue && String(value || '') !== ''
        })

        return {
            netIndex: numericValue === undefined ? null : Number(numericValue),
            name: String(nameValue || '')
        }
    }

    /**
     * Resolves one connected item net node.
     * @param {Array | undefined} node Net node.
     * @param {string} [fallbackName] Legacy net-name fallback.
     * @returns {{ netIndex?: number, netName?: string }}
     */
    resolveNode(node, fallbackName = '') {
        const reference = KicadNetResolver.parseReferenceNode(node)
        const explicitName = reference.name || String(fallbackName || '')

        if (explicitName) {
            const record = this.#ensureRecord(explicitName, reference.netIndex)
            return { netIndex: record.netIndex, netName: record.name }
        }

        if (Number.isInteger(reference.netIndex)) {
            const netName = this.#nameByIndex.get(reference.netIndex) || ''
            return {
                netIndex: reference.netIndex,
                ...(netName ? { netName } : {})
            }
        }

        return {}
    }

    /**
     * Returns normalized net records in KiCad declaration/recovery order.
     * @returns {object[]}
     */
    records() {
        return this.#records.map((record) => ({ ...record }))
    }

    /**
     * Adds or returns a normalized net record.
     * @param {string} name Net name.
     * @param {number | null} preferredIndex Native KiCad net code.
     * @returns {object}
     */
    #ensureRecord(name, preferredIndex) {
        const normalizedName = String(name || '')
        const existingIndex = this.#indexByName.get(normalizedName)
        if (Number.isInteger(existingIndex)) {
            return this.#records.find((record) => {
                return record.netIndex === existingIndex
            })
        }

        const netIndex = Number.isInteger(preferredIndex)
            ? preferredIndex
            : this.#allocateIndex()
        const record = createNetRecord(netIndex, normalizedName)
        this.#records.push(record)
        this.#indexByName.set(normalizedName, netIndex)
        this.#nameByIndex.set(netIndex, normalizedName)
        this.#observeIndex(netIndex)
        return record
    }

    /**
     * Allocates a recovered net index.
     * @returns {number}
     */
    #allocateIndex() {
        while (this.#nameByIndex.has(this.#nextIndex)) {
            this.#nextIndex += 1
        }
        const value = this.#nextIndex
        this.#nextIndex += 1
        return value
    }

    /**
     * Keeps recovered indexes above declared native codes.
     * @param {number | null} value Net index.
     * @returns {void}
     */
    #observeIndex(value) {
        if (Number.isInteger(value) && value >= this.#nextIndex) {
            this.#nextIndex = value + 1
        }
    }
}

/**
 * Creates an Altium-style normalized net record.
 * @param {number} netIndex Native or recovered net index.
 * @param {string} name Net name.
 * @returns {object}
 */
function createNetRecord(netIndex, name) {
    return {
        netIndex,
        name,
        uniqueId: String(netIndex),
        color: '#ffff00',
        visible: true,
        overrideColor: false,
        keepout: false,
        locked: false,
        userRouted: true,
        loopRemoval: true,
        jumpersVisible: true,
        polygonOutline: false,
        layer: '',
        unionIndex: 0
    }
}
