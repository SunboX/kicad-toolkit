// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const MILS_PER_MM = 39.37007874015748

/**
 * Resolves face-specific renderer pad fields for canonical Circuit JSON.
 */
export class CircuitJsonModelAdapterPadFace {
    /**
     * Resolves the active face's pad shape name.
     * @param {Record<string, unknown>} pad Renderer-model pad.
     * @param {string} layer Canonical copper layer.
     * @returns {unknown}
     */
    static shapeName(pad, layer) {
        const isBottom = layer === 'bottom'
        const activeName = isBottom ? pad.shapeBottomName : pad.shapeTopName
        const oppositeName = isBottom ? pad.shapeTopName : pad.shapeBottomName
        const activeCode = isBottom ? pad.shapeBottom : pad.shapeTop
        const oppositeCode = isBottom ? pad.shapeTop : pad.shapeBottom

        return (
            activeName ||
            pad.shapeName ||
            pad.shape ||
            oppositeName ||
            CircuitJsonModelAdapterPadFace.#shapeNameFromCode(activeCode) ||
            CircuitJsonModelAdapterPadFace.#shapeNameFromCode(oppositeCode) ||
            ''
        )
    }

    /**
     * Resolves one active-face pad dimension in renderer-model mils.
     * @param {Record<string, unknown>} pad Renderer-model pad.
     * @param {string} layer Canonical copper layer.
     * @param {'X' | 'Y'} axis Dimension axis.
     * @returns {number}
     */
    static size(pad, layer, axis) {
        const isBottom = layer === 'bottom'
        const activeKey = `size${isBottom ? 'Bottom' : 'Top'}${axis}`
        const oppositeKey = `size${isBottom ? 'Top' : 'Bottom'}${axis}`
        const rawKey = axis === 'X' ? 'width' : 'height'
        const candidates = [
            pad[activeKey],
            pad[`size${axis}`],
            pad[oppositeKey],
            pad[rawKey]
        ]

        for (const candidate of candidates) {
            const numeric = Number(candidate)
            if (Number.isFinite(numeric) && numeric > 0) return numeric
        }
        return 0
    }

    /**
     * Resolves the active face's local pad offset in renderer-model mils.
     * @param {Record<string, unknown>} pad Renderer-model pad.
     * @param {string} layer Canonical copper layer.
     * @returns {{ x: number, y: number }}
     */
    static offset(pad, layer) {
        const isBottom = layer === 'bottom'
        const activeSide = isBottom ? 'Bottom' : 'Top'
        const oppositeSide = isBottom ? 'Top' : 'Bottom'

        return {
            x: CircuitJsonModelAdapterPadFace.#firstFinite([
                pad[`offset${activeSide}X`],
                pad.offsetX,
                pad[`offset${oppositeSide}X`]
            ]),
            y: CircuitJsonModelAdapterPadFace.#firstFinite([
                pad[`offset${activeSide}Y`],
                pad.offsetY,
                pad[`offset${oppositeSide}Y`]
            ])
        }
    }

    /**
     * Returns whether the active pad face is covered by solder mask.
     * @param {Record<string, unknown>} pad Renderer-model pad.
     * @param {string} layer Canonical copper layer.
     * @returns {boolean | undefined}
     */
    static coveredWithSolderMask(pad, layer) {
        const explicit =
            pad.is_covered_with_solder_mask ?? pad.covered_with_solder_mask
        if (explicit !== undefined && explicit !== null) {
            return Boolean(explicit)
        }

        const tenting =
            layer === 'bottom' ? pad.isTentingBottom : pad.isTentingTop
        if (tenting !== undefined && tenting !== null) {
            return Boolean(tenting)
        }

        const sourceLayers = Array.isArray(pad.layers)
            ? pad.layers.map((value) => String(value || '').toLowerCase())
            : []
        if (!sourceLayers.length) return undefined

        const copperLayer = layer === 'bottom' ? 'b.cu' : 'f.cu'
        const maskLayer = layer === 'bottom' ? 'b.mask' : 'f.mask'
        const hasCopper =
            sourceLayers.includes('*.cu') || sourceLayers.includes(copperLayer)
        if (!hasCopper) return undefined

        return !(
            sourceLayers.includes('*.mask') || sourceLayers.includes(maskLayer)
        )
    }

    /**
     * Returns an explicit solder-mask margin in millimeters.
     * @param {Record<string, unknown>} pad Renderer-model pad.
     * @returns {number | undefined}
     */
    static solderMaskMargin(pad) {
        const direct = Number(pad.soldermask_margin ?? pad.solder_mask_margin)
        if (Number.isFinite(direct)) return round(direct)
        if (pad.solderMaskExpansionMode !== 1) return undefined

        const expansion = Number(pad.solderMaskExpansion)
        return Number.isFinite(expansion) ? round(expansion / MILS_PER_MM) : 0
    }

    /**
     * Maps a normalized renderer pad shape code back to its name.
     * @param {unknown} value Shape code.
     * @returns {string}
     */
    static #shapeNameFromCode(value) {
        const code = Number(value)
        if (code === 1) return 'circle'
        if (code === 2) return 'oval'
        if (code === 3) return 'trapezoid'
        if (code === 4) return 'roundrect'
        if (code === 9) return 'custom'
        return code === 0 ? 'rect' : ''
    }

    /**
     * Returns the first finite numeric candidate, or zero.
     * @param {unknown[]} candidates Candidate values.
     * @returns {number}
     */
    static #firstFinite(candidates) {
        for (const candidate of candidates) {
            if (
                candidate === undefined ||
                candidate === null ||
                candidate === ''
            ) {
                continue
            }
            const numeric = Number(candidate)
            if (Number.isFinite(numeric)) return numeric
        }
        return 0
    }
}

/**
 * Rounds one canonical millimeter value.
 * @param {number} value Numeric value.
 * @returns {number}
 */
function round(value) {
    return Math.round(value * 1_000_000) / 1_000_000
}
