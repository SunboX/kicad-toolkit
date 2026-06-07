// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Extracts normalized KiCad PCB text-box metadata from S-expression nodes.
 */
export class KicadPcbTextBoxMetadata {
    /**
     * Builds a text-box metadata sidecar.
     * @param {Array} node Text-box node.
     * @param {{ sourceType: string, points: object[], border: boolean }} context Metadata context.
     * @returns {object}
     */
    static build(node, context) {
        const bounds = boundsFor(context.points)
        return {
            sourceType: context.sourceType,
            shape: hasChild(node, 'pts') ? 'polygon' : 'rect',
            border: context.border,
            knockout: booleanValue(child(node, 'knockout')?.[1], false),
            points: context.points,
            margins: marginsFor(child(node, 'margins')),
            width: bounds.width,
            height: bounds.height
        }
    }
}

/**
 * Resolves text-box margins in KiCad's left/top/right/bottom order.
 * @param {Array | undefined} node Margins node.
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
function marginsFor(node) {
    return {
        left: numberValue(node?.[1], 0),
        top: numberValue(node?.[2], 0),
        right: numberValue(node?.[3], 0),
        bottom: numberValue(node?.[4], 0)
    }
}

/**
 * Computes point bounds.
 * @param {{ x: number, y: number }[]} points Point list.
 * @returns {{ width: number, height: number }}
 */
function boundsFor(points) {
    const xs = (points || []).map((point) => Number(point.x || 0))
    const ys = (points || []).map((point) => Number(point.y || 0))
    if (xs.length === 0 || ys.length === 0) return { width: 0, height: 0 }

    return {
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
    }
}

/**
 * Returns a named child node.
 * @param {Array | undefined} node Parent node.
 * @param {string} name Child name.
 * @returns {Array | undefined}
 */
function child(node, name) {
    return (node || []).find(
        (entry) => Array.isArray(entry) && entry[0] === name
    )
}

/**
 * Returns true when a named child exists.
 * @param {Array | undefined} node Parent node.
 * @param {string} name Child name.
 * @returns {boolean}
 */
function hasChild(node, name) {
    return Boolean(child(node, name))
}

/**
 * Parses a finite number value.
 * @param {unknown} value Raw value.
 * @param {number} fallback Fallback number.
 * @returns {number}
 */
function numberValue(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Parses KiCad yes/no booleans.
 * @param {unknown} value Raw value.
 * @param {boolean} fallback Fallback boolean.
 * @returns {boolean}
 */
function booleanValue(value, fallback) {
    if (value === undefined || value === null) return fallback
    const text = String(value).toLowerCase()
    if (['yes', 'true', '1'].includes(text)) return true
    if (['no', 'false', '0'].includes(text)) return false
    return fallback
}
