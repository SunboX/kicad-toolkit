// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Resolves KiCad layer names and display sides.
 */
export class KicadLayerResolver {
    /**
     * Maps layers to a display side.
     * @param {string[]} layers
     * @returns {'front' | 'back' | 'both'}
     */
    static sideFromLayers(layers) {
        const hasAllCopper = layers.includes('*.Cu')
        const hasFront = this.#hasFrontLayer(layers)
        const hasBack = this.#hasBackLayer(layers)
        if (hasAllCopper || (hasFront && hasBack)) return 'both'
        if (hasBack) return 'back'
        return 'front'
    }

    /**
     * Maps one layer to a display side.
     * @param {string} layer
     * @returns {'front' | 'back' | 'both'}
     */
    static sideFromLayer(layer) {
        if (String(layer || '').startsWith('B.')) return 'back'
        if (String(layer || '').startsWith('F.')) return 'front'
        return 'both'
    }

    /**
     * Resolves pad layers and whether their local rotation should be preserved.
     * @param {string[]} layers
     * @param {{ side?: string }} transform
     * @returns {{ layers: string[], preserveLocalRotation: boolean }}
     */
    static resolvePadLayers(layers, transform) {
        return {
            layers,
            preserveLocalRotation: transform.side === 'back'
        }
    }

    /**
     * Checks for explicit front-side layers.
     * @param {string[]} layers
     * @returns {boolean}
     */
    static #hasFrontLayer(layers) {
        return layers.some((layer) => layer.startsWith('F.'))
    }

    /**
     * Checks for explicit back-side layers.
     * @param {string[]} layers
     * @returns {boolean}
     */
    static #hasBackLayer(layers) {
        return layers.some((layer) => layer.startsWith('B.'))
    }
}
