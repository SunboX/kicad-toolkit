// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadSvgUtils } from './KicadSvgUtils.mjs'

const fullCircleEpsilon = 0.001

/**
 * Builds KiCad PCB arc markup and geometry helpers.
 */
export class PcbArcUtils {
    /**
     * Builds one PCB arc or authored circle as SVG markup.
     * @param {object} arc Arc primitive.
     * @param {string} className CSS class name.
     * @returns {string}
     */
    static buildMarkup(arc, className) {
        const radius = Math.max(Number(arc?.radius || 0), 0)
        const strokeWidth = Math.max(Number(arc?.width || 0), 0.01)

        if (isFullCircle(arc)) {
            return (
                '<circle class="' +
                KicadSvgUtils.escapeAttribute(className) +
                '" cx="' +
                KicadSvgUtils.formatNumber(arc?.x) +
                '" cy="' +
                KicadSvgUtils.formatNumber(arc?.y) +
                '" r="' +
                KicadSvgUtils.formatNumber(radius) +
                '" stroke-width="' +
                KicadSvgUtils.formatNumber(strokeWidth) +
                '" fill="none" />'
            )
        }

        return (
            '<path class="' +
            KicadSvgUtils.escapeAttribute(className) +
            '" d="' +
            KicadSvgUtils.escapeAttribute(PcbArcUtils.buildPath(arc)) +
            '" stroke-width="' +
            KicadSvgUtils.formatNumber(strokeWidth) +
            '" fill="none" />'
        )
    }

    /**
     * Builds one SVG arc path command from normalized PCB arc geometry.
     * @param {object} arc Arc primitive.
     * @returns {string}
     */
    static buildPath(arc) {
        const radius = Math.max(Number(arc?.radius || 0), 0)
        const start = projectPoint(arc, arc?.startAngle, radius)
        const end = projectPoint(arc, arc?.endAngle, radius)
        const delta = PcbArcUtils.resolveSweepDelta(
            arc?.startAngle,
            arc?.endAngle
        )

        return (
            'M ' +
            KicadSvgUtils.formatNumber(start.x) +
            ' ' +
            KicadSvgUtils.formatNumber(start.y) +
            ' A ' +
            KicadSvgUtils.formatNumber(radius) +
            ' ' +
            KicadSvgUtils.formatNumber(radius) +
            ' 0 ' +
            (Math.abs(delta) > 180 ? 1 : 0) +
            ' ' +
            (delta >= 0 ? 1 : 0) +
            ' ' +
            KicadSvgUtils.formatNumber(end.x) +
            ' ' +
            KicadSvgUtils.formatNumber(end.y)
        )
    }

    /**
     * Returns a conservative arc bounding box.
     * @param {object} arc Arc primitive.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
     */
    static extents(arc) {
        const radius =
            Math.max(Number(arc?.radius || 0), 0) +
            Math.max(Number(arc?.width || 0), 0) / 2
        const centerX = Number(arc?.x || 0)
        const centerY = Number(arc?.y || 0)

        return {
            minX: round(centerX - radius),
            maxX: round(centerX + radius),
            minY: round(centerY - radius),
            maxY: round(centerY + radius)
        }
    }

    /**
     * Pushes one conservative arc bounding box into running axis lists.
     * @param {number[]} xs X-axis values.
     * @param {number[]} ys Y-axis values.
     * @param {object} arc Arc primitive.
     */
    static pushExtents(xs, ys, arc) {
        const bounds = PcbArcUtils.extents(arc)
        xs.push(bounds.minX, bounds.maxX)
        ys.push(bounds.minY, bounds.maxY)
    }

    /**
     * Returns true when one arc overlaps a search box.
     * @param {object} arc Arc primitive.
     * @param {object} bounds Bounds object.
     * @returns {boolean}
     */
    static intersectsBounds(arc, bounds) {
        const arcBounds = PcbArcUtils.extents(arc)
        return !(
            arcBounds.maxX < bounds.minX ||
            arcBounds.minX > bounds.maxX ||
            arcBounds.maxY < bounds.minY ||
            arcBounds.minY > bounds.maxY
        )
    }

    /**
     * Normalizes one PCB arc delta to the intended short wrapped sweep.
     * @param {number} startAngle Start angle.
     * @param {number} endAngle End angle.
     * @returns {number}
     */
    static resolveSweepDelta(startAngle, endAngle) {
        const rawDelta = Number(endAngle || 0) - Number(startAngle || 0)
        let normalizedDelta = ((rawDelta + 540) % 360) - 180

        if (
            Math.abs(normalizedDelta + 180) <= fullCircleEpsilon &&
            rawDelta > 0
        ) {
            normalizedDelta = 180
        }

        return normalizedDelta
    }

    /**
     * Resolves short SVG sweep direction from center and endpoint geometry.
     * @param {object} segment Arc segment descriptor.
     * @returns {0 | 1}
     */
    static resolveShortSweepFromCenter(segment) {
        const startDeltaX = Number(segment?.x1 || 0) - Number(segment?.cx || 0)
        const startDeltaY = Number(segment?.y1 || 0) - Number(segment?.cy || 0)
        const endDeltaX = Number(segment?.x2 || 0) - Number(segment?.cx || 0)
        const endDeltaY = Number(segment?.y2 || 0) - Number(segment?.cy || 0)
        const crossProduct = startDeltaX * endDeltaY - startDeltaY * endDeltaX

        return crossProduct >= 0 ? 1 : 0
    }
}

/**
 * Projects one arc point.
 * @param {object} arc Arc primitive.
 * @param {unknown} angle Angle in degrees.
 * @param {number} radius Radius.
 * @returns {{ x: number, y: number }}
 */
function projectPoint(arc, angle, radius) {
    const radians = (Number(angle || 0) * Math.PI) / 180

    return {
        x: Number(arc?.x || 0) + radius * Math.cos(radians),
        y: Number(arc?.y || 0) + radius * Math.sin(radians)
    }
}

/**
 * Checks whether one arc represents a full circle.
 * @param {object} arc Arc primitive.
 * @returns {boolean}
 */
function isFullCircle(arc) {
    const rawDelta = Number(arc?.endAngle || 0) - Number(arc?.startAngle || 0)
    return (
        Math.abs(rawDelta) <= fullCircleEpsilon ||
        Math.abs(rawDelta) >= 360 - fullCircleEpsilon
    )
}

/**
 * Rounds one numeric value.
 * @param {unknown} value Numeric value.
 * @returns {number}
 */
function round(value) {
    const number = Number(value || 0)
    return Number.isFinite(number) ? Number(number.toFixed(4)) : 0
}
