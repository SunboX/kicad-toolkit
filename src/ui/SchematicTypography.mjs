// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { SchematicSvgTextMetrics } from './SchematicSvgTextMetrics.mjs'

/**
 * Shared KiCad schematic typography facade.
 */
export class SchematicTypography {
    /**
     * Builds render options for one schematic text label.
     * @param {object} text Text primitive.
     * @returns {object}
     */
    static buildSchematicTextRenderOptions(text = {}) {
        return {
            fontSize: SchematicTypography.resolveViewerFontSize(text),
            fontFamily: text.fontFamily,
            fontWeight: text.fontWeight,
            fontStyle: text.fontStyle,
            rotation: SchematicSvgTextMetrics.resolveRenderedTextRotation(text)
        }
    }

    /**
     * Applies viewer font-size resolution to an option bag.
     * @param {object} options Text options.
     * @returns {object}
     */
    static withViewerFontSize(options = {}) {
        return {
            ...options,
            fontSize: SchematicTypography.resolveViewerFontSize(options)
        }
    }

    /**
     * Resolves KiCad's viewer font size for one text primitive or raw size.
     * @param {object | number | undefined} textOrSize Text primitive or size.
     * @returns {number | undefined}
     */
    static resolveViewerFontSize(textOrSize) {
        if (typeof textOrSize === 'object' && textOrSize !== null) {
            return SchematicSvgTextMetrics.textHeight(textOrSize)
        }

        const number = Number(textOrSize)
        return Number.isFinite(number) && number > 0 ? number : undefined
    }

    /**
     * Returns KiCad stroke text line spacing for one text primitive.
     * @param {object} text Text primitive.
     * @returns {number}
     */
    static textLineSpacing(text) {
        return SchematicSvgTextMetrics.textLineSpacing(text)
    }

    /**
     * Resolves KiCad text stroke width.
     * @param {object} text Text primitive.
     * @returns {number}
     */
    static textStrokeWidth(text) {
        return SchematicSvgTextMetrics.textStrokeWidth(text)
    }
}
