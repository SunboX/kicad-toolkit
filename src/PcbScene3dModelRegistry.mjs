// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Resolves companion 3D model assets for KiCad footprints.
 */
export class PcbScene3dModelRegistry {
    #assets

    /**
     * Creates a model registry.
     * @param {{ sessionAssets?: object[] }} [options] Registry options.
     */
    constructor(options = {}) {
        this.#assets = Array.from(options.sessionAssets || [])
    }

    /**
     * Creates a model registry from session files.
     * @param {object[]} sessionAssets Session assets.
     * @returns {PcbScene3dModelRegistry}
     */
    static create(sessionAssets) {
        return new PcbScene3dModelRegistry({ sessionAssets })
    }

    /**
     * Returns the currently registered session assets.
     * @returns {object[]}
     */
    get assets() {
        return [...this.#assets]
    }

    /**
     * Finds a companion asset for a component.
     * @param {object} component Component placement.
     * @returns {object | null}
     */
    resolveForComponent(component) {
        const keys = [
            component?.modelName,
            component?.modelPath,
            component?.pattern,
            component?.source,
            component?.description
        ]
            .filter(Boolean)
            .map(PcbScene3dModelRegistry.#normalizeMatchKey)

        if (!keys.length) return null

        return (
            this.#assets.find((asset) => {
                const assetName = PcbScene3dModelRegistry.#normalizeMatchKey(
                    asset.name || asset.path || ''
                )
                return keys.some((key) => {
                    return (
                        assetName === key ||
                        assetName.startsWith(key + '.') ||
                        assetName.includes('/' + key + '.')
                    )
                })
            }) || null
        )
    }

    /**
     * Resolves a component model using the Altium-style method name.
     * @param {object} component Component placement.
     * @returns {object | null}
     */
    resolveComponentModel(component) {
        return this.resolveForComponent(component)
    }

    /**
     * KiCad normalized models do not yet expose explicit body-model records.
     * @returns {null}
     */
    resolveComponentBodyModel() {
        return null
    }

    /**
     * Normalizes asset and component matching keys.
     * @param {string} value Source value.
     * @returns {string}
     */
    static #normalizeMatchKey(value) {
        return String(value || '')
            .replace(/\\/g, '/')
            .split('/')
            .at(-1)
            .replace(/\.(step|stp|wrl|vrml)$/i, '')
            .toLowerCase()
    }
}
