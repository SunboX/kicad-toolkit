// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Small geometry helpers for KiCad millimeter coordinates.
 */
export class Geometry {
    /**
     * Rotates a local point by degrees around origin.
     * @param {{ x: number, y: number }} point
     * @param {number} degrees
     * @returns {{ x: number, y: number }}
     */
    static rotatePoint(point, degrees) {
        const radians = (Number(degrees) || 0) * (Math.PI / 180)
        const cos = Math.cos(radians)
        const sin = Math.sin(radians)
        return {
            x: point.x * cos - point.y * sin,
            y: point.x * sin + point.y * cos
        }
    }

    /**
     * Applies a KiCad footprint transform to a local point.
     * @param {{ x: number, y: number }} point
     * @param {{ x: number, y: number, rotation: number }} transform
     * @returns {{ x: number, y: number }}
     */
    static transformPoint(point, transform) {
        const rotated = Geometry.rotatePoint(point, transform.rotation)
        return {
            x: transform.x + rotated.x,
            y: transform.y + rotated.y
        }
    }

    /**
     * Returns Euclidean distance.
     * @param {{ x: number, y: number }} first
     * @param {{ x: number, y: number }} second
     * @returns {number}
     */
    static distance(first, second) {
        return Math.hypot(first.x - second.x, first.y - second.y)
    }

    /**
     * Creates bounds from points.
     * @param {{ x: number, y: number }[]} points
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }}
     */
    static boundsFromPoints(points) {
        const finitePoints = points.filter((point) => {
            return Number.isFinite(point.x) && Number.isFinite(point.y)
        })

        if (finitePoints.length === 0) {
            return {
                minX: 0,
                minY: 0,
                maxX: 1,
                maxY: 1,
                width: 1,
                height: 1
            }
        }

        const xs = finitePoints.map((point) => point.x)
        const ys = finitePoints.map((point) => point.y)
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)
        const maxX = Math.max(...xs)
        const maxY = Math.max(...ys)

        return {
            minX,
            minY,
            maxX,
            maxY,
            width: Math.max(0.001, maxX - minX),
            height: Math.max(0.001, maxY - minY)
        }
    }

    /**
     * Adds padding to bounds.
     * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
     * @param {number} padding
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }}
     */
    static expandBounds(bounds, padding) {
        const amount = Number(padding) || 0
        return {
            minX: bounds.minX - amount,
            minY: bounds.minY - amount,
            maxX: bounds.maxX + amount,
            maxY: bounds.maxY + amount,
            width: bounds.maxX - bounds.minX + amount * 2,
            height: bounds.maxY - bounds.minY + amount * 2
        }
    }

    /**
     * Returns the center of bounds.
     * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
     * @returns {{ x: number, y: number }}
     */
    static boundsCenter(bounds) {
        return {
            x: (bounds.minX + bounds.maxX) / 2,
            y: (bounds.minY + bounds.maxY) / 2
        }
    }
}
