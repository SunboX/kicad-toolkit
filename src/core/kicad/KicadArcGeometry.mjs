// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { Geometry } from './Geometry.mjs'

const circleEpsilon = 1e-9
const fullCircleRadians = Math.PI * 2

/**
 * Resolves shared KiCad three-point circular arc geometry.
 */
export class KicadArcGeometry {
    /**
     * Calculates arc metrics from KiCad start, mid, and end points.
     * @param {{ x: number, y: number }} start Start point.
     * @param {{ x: number, y: number }} mid Mid point.
     * @param {{ x: number, y: number }} end End point.
     * @returns {{ center: { x: number, y: number }, radius: number, startAngle: number, endAngle: number, largeArc: boolean, sweep: boolean } | null}
     */
    static fromThreePoints(start, mid, end) {
        const center = KicadArcGeometry.centerFromThreePoints(start, mid, end)
        if (!center) return null

        const startAngleRadians = Math.atan2(
            start.y - center.y,
            start.x - center.x
        )
        const midAngleRadians = Math.atan2(mid.y - center.y, mid.x - center.x)
        const endAngleRadians = Math.atan2(end.y - center.y, end.x - center.x)
        const clockwiseEnd = normalizeRadians(
            endAngleRadians - startAngleRadians
        )
        const clockwiseMid = normalizeRadians(
            midAngleRadians - startAngleRadians
        )
        const sweep = clockwiseMid <= clockwiseEnd + circleEpsilon
        const arcAngle = sweep ? clockwiseEnd : fullCircleRadians - clockwiseEnd

        return {
            center,
            radius: Geometry.distance(center, start),
            startAngle: degrees(startAngleRadians),
            endAngle: degrees(endAngleRadians),
            largeArc: arcAngle > Math.PI,
            sweep
        }
    }

    /**
     * Calculates a circle center through three points.
     * @param {{ x: number, y: number }} a First point.
     * @param {{ x: number, y: number }} b Second point.
     * @param {{ x: number, y: number }} c Third point.
     * @returns {{ x: number, y: number } | null}
     */
    static centerFromThreePoints(a, b, c) {
        const divisor =
            2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
        if (Math.abs(divisor) < circleEpsilon) return null

        const aSquared = a.x * a.x + a.y * a.y
        const bSquared = b.x * b.x + b.y * b.y
        const cSquared = c.x * c.x + c.y * c.y

        return {
            x:
                (aSquared * (b.y - c.y) +
                    bSquared * (c.y - a.y) +
                    cSquared * (a.y - b.y)) /
                divisor,
            y:
                (aSquared * (c.x - b.x) +
                    bSquared * (a.x - c.x) +
                    cSquared * (b.x - a.x)) /
                divisor
        }
    }
}

/**
 * Normalizes radians to [0, 2PI).
 * @param {number} value Radian value.
 * @returns {number}
 */
function normalizeRadians(value) {
    const result = value % fullCircleRadians
    return result < 0 ? result + fullCircleRadians : result
}

/**
 * Converts radians to normalized degrees.
 * @param {number} radians Radians.
 * @returns {number}
 */
function degrees(radians) {
    const value = radians * (180 / Math.PI)
    return ((value % 360) + 360) % 360
}
