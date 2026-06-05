// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Provides deterministic SVG formatting helpers for KiCad renderer consumers.
 */
export class KicadSvgUtils {
    /**
     * Formats a number for compact SVG output.
     * @param {unknown} value Number-like value.
     * @param {number} [precision] Decimal precision.
     * @returns {string}
     */
    static formatNumber(value, precision = 4) {
        const decimals = KicadSvgUtils.#precision(precision)
        const number = KicadSvgUtils.#number(value)
        const text = number.toFixed(decimals).replace(/\.?0+$/u, '')
        return text === '-0' ? '0' : text
    }

    /**
     * Escapes HTML text content.
     * @param {unknown} value Raw value.
     * @returns {string}
     */
    static escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;')
    }

    /**
     * Escapes SVG attribute content.
     * @param {unknown} value Raw value.
     * @returns {string}
     */
    static escapeAttribute(value) {
        return KicadSvgUtils.escapeHtml(value)
    }

    /**
     * Renders deterministic SVG attributes from a plain object.
     * @param {Record<string, unknown>} attributes Attribute map.
     * @returns {string}
     */
    static renderAttributes(attributes) {
        return Object.entries(attributes || {})
            .filter(([name, value]) => {
                return (
                    value !== undefined &&
                    value !== null &&
                    KicadSvgUtils.#isAttributeName(name)
                )
            })
            .map(([name, value]) => {
                return `${name}="${KicadSvgUtils.escapeAttribute(value)}"`
            })
            .join(' ')
    }

    /**
     * Converts points to a compact SVG path string.
     * @param {{ x: unknown, y: unknown }[]} points Points to render.
     * @param {object} [options] Path options.
     * @param {boolean} [options.close] Whether to close the path.
     * @param {number} [options.precision] Decimal precision.
     * @returns {string}
     */
    static pathFromPoints(points, options = {}) {
        if (!Array.isArray(points) || points.length === 0) return ''
        const precision = KicadSvgUtils.#precision(options.precision ?? 4)
        const [first, ...rest] = points
        const commands = [
            `M ${KicadSvgUtils.formatNumber(first?.x, precision)} ${KicadSvgUtils.formatNumber(first?.y, precision)}`
        ]

        rest.forEach((point) => {
            commands.push(
                `L ${KicadSvgUtils.formatNumber(point?.x, precision)} ${KicadSvgUtils.formatNumber(point?.y, precision)}`
            )
        })
        if (options.close) commands.push('Z')
        return commands.join(' ')
    }

    /**
     * Projects a KiCad model-space point into an overlay or SVG coordinate space.
     * @param {{ x: unknown, y: unknown }} point Source point.
     * @param {object} [options] Projection options.
     * @param {number} [options.scale] Shared x/y scale.
     * @param {number} [options.scaleX] X-axis scale override.
     * @param {number} [options.scaleY] Y-axis scale override.
     * @param {number} [options.offsetX] X-axis offset.
     * @param {number} [options.offsetY] Y-axis offset.
     * @param {boolean} [options.flipX] Whether to mirror the X coordinate.
     * @param {boolean} [options.flipY] Whether to mirror the Y coordinate.
     * @returns {{ x: number, y: number }}
     */
    static projectPoint(point, options = {}) {
        const scale = KicadSvgUtils.#number(options.scale, 1)
        const scaleX = KicadSvgUtils.#number(options.scaleX, scale)
        const scaleY = KicadSvgUtils.#number(options.scaleY, scale)
        const offsetX = KicadSvgUtils.#number(options.offsetX)
        const offsetY = KicadSvgUtils.#number(options.offsetY)
        const x = KicadSvgUtils.#number(point?.x)
        const y = KicadSvgUtils.#number(point?.y)

        return {
            x: (options.flipX ? -x : x) * scaleX + offsetX,
            y: (options.flipY ? -y : y) * scaleY + offsetY
        }
    }

    /**
     * Normalizes unknown input into a finite number.
     * @param {unknown} value Number-like value.
     * @param {number} [fallback] Fallback for non-finite input.
     * @returns {number}
     */
    static #number(value, fallback = 0) {
        const number = Number(value)
        return Number.isFinite(number) ? number : fallback
    }

    /**
     * Normalizes precision into a bounded integer.
     * @param {unknown} precision Precision value.
     * @returns {number}
     */
    static #precision(precision) {
        const decimals = Math.trunc(KicadSvgUtils.#number(precision, 4))
        return Math.min(Math.max(decimals, 0), 12)
    }

    /**
     * Checks whether a string is a safe SVG attribute name.
     * @param {unknown} name Attribute name.
     * @returns {boolean}
     */
    static #isAttributeName(name) {
        return /^[A-Za-z_][A-Za-z0-9:_.-]*$/u.test(String(name || ''))
    }
}
