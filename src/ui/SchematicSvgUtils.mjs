// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadSvgUtils } from './KicadSvgUtils.mjs'

/**
 * Schematic-specific SVG formatting facade.
 */
export class SchematicSvgUtils {
    /**
     * Escapes user-facing SVG text content.
     * @param {unknown} value Raw value.
     * @returns {string}
     */
    static escapeHtml(value) {
        return KicadSvgUtils.escapeHtml(value)
    }

    /**
     * Escapes SVG attribute content.
     * @param {unknown} value Raw value.
     * @returns {string}
     */
    static escapeAttribute(value) {
        return KicadSvgUtils.escapeAttribute(value)
    }

    /**
     * Formats a concise numeric SVG attribute.
     * @param {unknown} value Number-like value.
     * @param {number} [precision] Decimal precision.
     * @returns {string}
     */
    static formatNumber(value, precision = 4) {
        return KicadSvgUtils.formatNumber(value, precision)
    }

    /**
     * Converts bottom-left schematic coordinates into SVG coordinates.
     * @param {number} sheetHeight Sheet height.
     * @param {number} value Schematic y coordinate.
     * @returns {number}
     */
    static projectSchematicY(sheetHeight, value) {
        return Number(sheetHeight) - Number(value)
    }

    /**
     * Creates one escaped SVG text element.
     * @param {string} className Class name.
     * @param {number} x X coordinate.
     * @param {number} y Y coordinate.
     * @param {string} text Text content.
     * @param {string} color Fill color.
     * @param {'start' | 'end' | 'middle'} anchor Text anchor.
     * @param {object} [options] Text rendering options.
     * @returns {string}
     */
    static createSvgText(className, x, y, text, color, anchor, options = {}) {
        const content = String(text ?? '')
        if (!content) return ''

        return (
            '<text class="' +
            SchematicSvgUtils.escapeAttribute(className) +
            '" x="' +
            SchematicSvgUtils.formatNumber(x) +
            '" y="' +
            SchematicSvgUtils.formatNumber(y) +
            '" fill="' +
            SchematicSvgUtils.escapeAttribute(color) +
            '" text-anchor="' +
            SchematicSvgUtils.escapeAttribute(anchor) +
            '"' +
            textStyleAttributes(x, y, options) +
            '>' +
            SchematicSvgUtils.escapeHtml(content) +
            '</text>'
        )
    }

    /**
     * Returns only the trailing file segment.
     * @param {string | undefined} fileName File name.
     * @returns {string}
     */
    static basename(fileName) {
        if (!fileName) return ''
        return String(fileName).split(/[\\/]/u).at(-1) || ''
    }
}

/**
 * Builds optional SVG text style attributes.
 * @param {number} x X coordinate.
 * @param {number} y Y coordinate.
 * @param {object} options Text rendering options.
 * @returns {string}
 */
function textStyleAttributes(x, y, options) {
    const attributes = {}
    if (options.fontSize) attributes['font-size'] = options.fontSize
    if (options.fontFamily) attributes['font-family'] = options.fontFamily
    if (options.fontWeight) attributes['font-weight'] = options.fontWeight
    if (options.fontStyle) attributes['font-style'] = options.fontStyle
    if (options.rotation) {
        attributes.transform =
            'rotate(' +
            SchematicSvgUtils.formatNumber(options.rotation) +
            ' ' +
            SchematicSvgUtils.formatNumber(x) +
            ' ' +
            SchematicSvgUtils.formatNumber(y) +
            ')'
    }

    const rendered = KicadSvgUtils.renderAttributes(attributes)
    return rendered ? ' ' + rendered : ''
}
