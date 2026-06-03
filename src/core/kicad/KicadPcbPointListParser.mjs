// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { Geometry } from './Geometry.mjs'
import { KicadArcGeometry } from './KicadArcGeometry.mjs'

const pointEpsilon = 1e-9

/**
 * Parses PCB point lists that may include inline arc segments.
 */
export class KicadPcbPointListParser {
    /**
     * Parses a KiCad `(pts ...)` node in source order.
     * @param {Array | undefined} node Points node.
     * @param {{ x?: number, y?: number, rotation?: number }} [transform] Transform.
     * @returns {{ x: number, y: number }[]}
     */
    static parsePoints(node, transform = {}) {
        if (!node) return []

        return children(node).reduce((points, entry) => {
            appendPoints(
                points,
                localPointsForEntry(entry).map((point) =>
                    transformLocalPoint(point, transform)
                )
            )
            return points
        }, [])
    }
}

/**
 * Parses local points represented by one direct `(pts ...)` child.
 * @param {Array} entry Point-list child.
 * @returns {{ x: number, y: number }[]}
 */
function localPointsForEntry(entry) {
    if (nodeName(entry) === 'xy') return [localPoint(entry)]
    if (nodeName(entry) !== 'arc') return []

    return KicadArcGeometry.toPolyline(
        localPoint(child(entry, 'start')),
        localPoint(child(entry, 'mid')),
        localPoint(child(entry, 'end'))
    )
}

/**
 * Appends points while dropping immediate duplicates.
 * @param {{ x: number, y: number }[]} target Target points.
 * @param {{ x: number, y: number }[]} nextPoints Points to append.
 * @returns {void}
 */
function appendPoints(target, nextPoints) {
    for (const point of nextPoints) {
        if (!samePoint(target.at(-1), point)) {
            target.push(point)
        }
    }
}

/**
 * Compares two points with parser-scale tolerance.
 * @param {{ x: number, y: number } | undefined} left First point.
 * @param {{ x: number, y: number } | undefined} right Second point.
 * @returns {boolean}
 */
function samePoint(left, right) {
    return (
        Boolean(left && right) &&
        Math.abs(left.x - right.x) <= pointEpsilon &&
        Math.abs(left.y - right.y) <= pointEpsilon
    )
}

/**
 * Applies a footprint-local transform.
 * @param {{ x: number, y: number }} point Point.
 * @param {{ x?: number, y?: number, rotation?: number }} transform Transform.
 * @returns {{ x: number, y: number }}
 */
function transformLocalPoint(point, transform) {
    return Geometry.transformPoint(point, {
        x: numberValue(transform.x, 0),
        y: numberValue(transform.y, 0),
        rotation: -numberValue(transform.rotation, 0)
    })
}

/**
 * Parses one local point node.
 * @param {Array | undefined} node Point node.
 * @returns {{ x: number, y: number }}
 */
function localPoint(node) {
    return {
        x: numberValue(node?.[1], 0),
        y: numberValue(node?.[2], 0)
    }
}

/**
 * Returns a node name.
 * @param {unknown} node S-expression node.
 * @returns {string}
 */
function nodeName(node) {
    return Array.isArray(node) ? String(node[0] || '') : ''
}

/**
 * Lists direct child nodes.
 * @param {Array | undefined} node Parent node.
 * @returns {Array[]}
 */
function children(node) {
    return Array.isArray(node) ? node.filter(Array.isArray) : []
}

/**
 * Finds the first direct child by name.
 * @param {Array | undefined} node Parent node.
 * @param {string} name Child name.
 * @returns {Array | undefined}
 */
function child(node, name) {
    return children(node).find((entry) => nodeName(entry) === name)
}

/**
 * Reads a numeric value.
 * @param {unknown} value Source value.
 * @param {number} fallback Fallback number.
 * @returns {number}
 */
function numberValue(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}
