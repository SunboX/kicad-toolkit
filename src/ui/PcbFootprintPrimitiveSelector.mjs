// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Selects KiCad documentation-layer primitives for one board side.
 */
export class PcbFootprintPrimitiveSelector {
    /**
     * Selects side-specific footprint documentation primitives.
     * @param {object} board Board-like primitive container.
     * @param {{ side?: 'top' | 'bottom' | 'front' | 'back' }} [options] Selection options.
     * @returns {{ drawings: object[], texts: object[] }}
     */
    static select(board, options = {}) {
        const side = normalizeSide(options.side)
        const layerPriority = layersForSide(side)

        return {
            drawings: selectFamily(board?.drawings || [], layerPriority),
            texts: selectFamily(board?.texts || [], layerPriority)
        }
    }
}

/**
 * Filters one primitive family by prioritized KiCad layer names.
 * @param {object[]} primitives Primitive rows.
 * @param {string[]} layerPriority Prioritized layer names.
 * @returns {object[]}
 */
function selectFamily(primitives, layerPriority) {
    for (const layerName of layerPriority) {
        const selected = (primitives || []).filter((primitive) => {
            return primitiveLayer(primitive) === layerName
        })
        if (selected.length) return selected
    }

    return []
}

/**
 * Resolves one primitive layer key.
 * @param {object} primitive Primitive row.
 * @returns {string}
 */
function primitiveLayer(primitive) {
    return String(
        primitive?.layerKey || primitive?.layer || primitive?.layerName || ''
    )
}

/**
 * Normalizes a requested board side.
 * @param {string | undefined} side Candidate side.
 * @returns {'top' | 'bottom'}
 */
function normalizeSide(side) {
    const normalized = String(side || 'top').toLowerCase()
    return normalized === 'bottom' || normalized === 'back' ? 'bottom' : 'top'
}

/**
 * Returns prioritized KiCad documentation layers for one side.
 * @param {'top' | 'bottom'} side Board side.
 * @returns {string[]}
 */
function layersForSide(side) {
    if (side === 'bottom') {
        return ['B.SilkS', 'B.Fab', 'B.CrtYd']
    }

    return ['F.SilkS', 'F.Fab', 'F.CrtYd']
}
