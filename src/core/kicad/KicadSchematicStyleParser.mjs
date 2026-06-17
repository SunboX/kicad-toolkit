// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { SExpressionTree } from './SExpressionTree.mjs'

/**
 * Parses reusable KiCad schematic stroke and fill styling fields.
 */
export class KicadSchematicStyleParser {
    /**
     * Parses a primitive stroke width.
     * @param {Array | undefined} node Primitive node.
     * @param {number} [fallback] Fallback stroke width.
     * @returns {number}
     */
    static strokeWidth(node, fallback = 0.15) {
        return SExpressionTree.numberValue(
            SExpressionTree.child(
                SExpressionTree.child(node, 'stroke'),
                'width'
            )?.[1],
            fallback
        )
    }

    /**
     * Parses a primitive stroke style token.
     * @param {Array | undefined} node Primitive node.
     * @returns {string | undefined}
     */
    static strokeStyle(node) {
        return optionalText(
            SExpressionTree.child(SExpressionTree.child(node, 'stroke'), 'type')
        )
    }

    /**
     * Parses a primitive stroke color as a CSS rgba value.
     * @param {Array | undefined} node Primitive node.
     * @returns {string | undefined}
     */
    static strokeColor(node) {
        return colorValue(
            SExpressionTree.child(
                SExpressionTree.child(node, 'stroke'),
                'color'
            )
        )
    }

    /**
     * Builds optional stroke fields for model primitives.
     * @param {Array | undefined} node Primitive node.
     * @returns {{ strokeStyle?: string, strokeColor?: string }}
     */
    static strokeFields(node) {
        const strokeStyle = KicadSchematicStyleParser.strokeStyle(node)
        const strokeColor = KicadSchematicStyleParser.strokeColor(node)
        return {
            ...(strokeStyle ? { strokeStyle } : {}),
            ...(strokeColor ? { strokeColor } : {})
        }
    }

    /**
     * Parses a primitive fill type.
     * @param {Array | undefined} node Primitive node.
     * @param {string} [fallback] Fallback fill type.
     * @returns {string}
     */
    static fillType(node, fallback = 'none') {
        return (
            optionalText(
                SExpressionTree.child(
                    SExpressionTree.child(node, 'fill'),
                    'type'
                )
            ) || fallback
        )
    }

    /**
     * Parses a primitive fill color as a CSS rgba value.
     * @param {Array | undefined} node Primitive node.
     * @returns {string | undefined}
     */
    static fillColor(node) {
        return colorValue(
            SExpressionTree.child(SExpressionTree.child(node, 'fill'), 'color')
        )
    }

    /**
     * Builds optional fill fields for model primitives.
     * @param {Array | undefined} node Primitive node.
     * @returns {{ fillColor?: string }}
     */
    static fillFields(node) {
        const fillColor = KicadSchematicStyleParser.fillColor(node)
        return fillColor ? { fillColor } : {}
    }
}

/**
 * Reads optional text from a simple node.
 * @param {Array | undefined} node S-expression node.
 * @returns {string | undefined}
 */
function optionalText(node) {
    const value = String(node?.[1] ?? '').trim()
    return value || undefined
}

/**
 * Reads a KiCad color node as a CSS rgba value.
 * @param {Array | undefined} node Color node.
 * @returns {string | undefined}
 */
function colorValue(node) {
    if (!Array.isArray(node) || node.length < 4) return undefined
    const red = clampChannel(node[1])
    const green = clampChannel(node[2])
    const blue = clampChannel(node[3])
    const alpha = clampAlpha(node[4])
    return `rgba(${red},${green},${blue},${formatNumber(alpha)})`
}

/**
 * Clamps one RGB channel into the SVG byte range.
 * @param {unknown} value Channel value.
 * @returns {number}
 */
function clampChannel(value) {
    const parsed = Math.round(Number(value))
    if (!Number.isFinite(parsed)) return 0
    return Math.min(Math.max(parsed, 0), 255)
}

/**
 * Clamps one alpha value into CSS opacity range.
 * @param {unknown} value Alpha value.
 * @returns {number}
 */
function clampAlpha(value) {
    const parsed = Number(value)
    const alpha = Number.isFinite(parsed) ? parsed : 1
    const normalized = alpha > 1 ? alpha / 255 : alpha
    return Math.min(Math.max(normalized, 0), 1)
}

/**
 * Formats concise CSS numeric values.
 * @param {number} value Number.
 * @returns {string}
 */
function formatNumber(value) {
    return Number(value || 0)
        .toFixed(4)
        .replace(/\.?0+$/u, '')
}
