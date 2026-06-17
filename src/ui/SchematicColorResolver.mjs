// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const wireColor = 'var(--schematic-default-ink-color)'
const symbolColor = 'var(--schematic-power-color)'
const sheetGraphicColor = 'var(--schematic-accent-ink-color)'
const labelColor = 'var(--schematic-text-color)'
const globalLabelColor = 'var(--schematic-alert-color)'
const symbolFillColor = 'var(--schematic-fill-color)'

/**
 * Resolves KiCad schematic primitive colors to renderer theme variables.
 */
export class SchematicColorResolver {
    /**
     * Resolves schematic primitive stroke color.
     * @param {object} primitive Primitive row.
     * @returns {string}
     */
    static resolveInkColor(primitive = {}) {
        if (primitive.strokeColor) return primitive.strokeColor
        if (primitive.ownerIndex) return symbolColor
        if (primitive.sourceType === 'polyline') return sheetGraphicColor
        if (primitive.isBus) return sheetGraphicColor
        if (primitive.labelKind === 'global') return globalLabelColor
        if (primitive.labelKind === 'hierarchical') return sheetGraphicColor
        if (primitive.labelKind === 'local') return labelColor
        return wireColor
    }

    /**
     * Resolves schematic primitive fill color.
     * @param {object} primitive Primitive row.
     * @returns {string}
     */
    static resolveFillColor(primitive = {}) {
        if (primitive.fill === 'outline') {
            return (
                primitive.fillColor ||
                SchematicColorResolver.resolveInkColor(primitive)
            )
        }
        if (primitive.fill && primitive.fill !== 'none') {
            return primitive.fillColor || symbolFillColor
        }
        return 'none'
    }

    /**
     * Resolves schematic shape background-pass fill color.
     * @param {object} primitive Primitive row.
     * @returns {string}
     */
    static resolveBackgroundFillColor(primitive = {}) {
        if (primitive.fill && !['none', 'outline'].includes(primitive.fill)) {
            return primitive.fillColor || symbolFillColor
        }
        return 'none'
    }

    /**
     * Resolves schematic shape foreground-pass fill color.
     * @param {object} primitive Primitive row.
     * @returns {string}
     */
    static resolveForegroundFillColor(primitive = {}) {
        if (primitive.fill === 'outline') {
            return (
                primitive.fillColor ||
                SchematicColorResolver.resolveInkColor(primitive)
            )
        }
        return 'none'
    }

    /**
     * Resolves schematic text color.
     * @param {object} text Text row.
     * @returns {string}
     */
    static resolveTextColor(text = {}) {
        if (text.strokeColor) return text.strokeColor
        if (text.ownerIndex) return labelColor
        if (text.labelKind === 'global') return globalLabelColor
        if (text.labelKind === 'hierarchical') return sheetGraphicColor
        return labelColor
    }
}
