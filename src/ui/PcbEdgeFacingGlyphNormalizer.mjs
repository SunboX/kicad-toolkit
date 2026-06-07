// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * No-op KiCad facade for Altium edge-facing glyph normalization.
 */
export class PcbEdgeFacingGlyphNormalizer {
    /**
     * Returns deterministic clones of footprint documentation primitives.
     * @param {{ fills?: object[], tracks?: object[], arcs?: object[], regions?: object[] }} footprintPrimitives Footprint primitives.
     * @returns {{ fills: object[], tracks: object[], arcs: object[], regions: object[] }}
     */
    static normalize(footprintPrimitives = {}) {
        return {
            fills: cloneArray(footprintPrimitives.fills),
            tracks: cloneArray(footprintPrimitives.tracks),
            arcs: cloneArray(footprintPrimitives.arcs),
            regions: cloneArray(footprintPrimitives.regions)
        }
    }

    /**
     * Returns deterministic clones for board-edge-only normalization.
     * @param {{ fills?: object[], tracks?: object[], arcs?: object[], regions?: object[] }} footprintPrimitives Footprint primitives.
     * @param {object} _outline Board outline, unused for KiCad-native geometry.
     * @returns {{ fills: object[], tracks: object[], arcs: object[], regions: object[] }}
     */
    static normalizeForBoardEdge(footprintPrimitives = {}, _outline = {}) {
        return PcbEdgeFacingGlyphNormalizer.normalize(footprintPrimitives)
    }
}

/**
 * Clones an array of primitive rows.
 * @param {object[] | undefined} rows Source rows.
 * @returns {object[]}
 */
function cloneArray(rows) {
    return (rows || []).map((row) => cloneValue(row))
}

/**
 * Recursively clones plain JSON-compatible values.
 * @param {unknown} value Source value.
 * @returns {unknown}
 */
function cloneValue(value) {
    if (Array.isArray(value)) return value.map((entry) => cloneValue(entry))
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, entryValue]) => [
                key,
                cloneValue(entryValue)
            ])
        )
    }
    return value
}
