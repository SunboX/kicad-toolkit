// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Converts points to an SVG path.
 * @param {{ x: number, y: number }[]} points Points to render.
 * @param {boolean} close Whether to close the path.
 * @returns {string}
 */
export function pathFromPoints(points, close) {
    if (!Array.isArray(points) || !points.length) return ''
    const [first, ...rest] = points
    const commands = [`M ${formatNumber(first.x)} ${formatNumber(first.y)}`]
    rest.forEach((point) => {
        commands.push(`L ${formatNumber(point.x)} ${formatNumber(point.y)}`)
    })
    if (close) commands.push('Z')
    return commands.join(' ')
}

/**
 * Converts multiple polygon contours to one SVG path.
 * @param {{ x: number, y: number }[][]} contours Polygon contours.
 * @returns {string}
 */
export function pathFromContours(contours) {
    return (Array.isArray(contours) ? contours : [])
        .map((points) => pathFromPoints(points, true))
        .filter(Boolean)
        .join(' ')
}

/**
 * Formats a number for compact SVG output.
 * @param {number} value Number.
 * @returns {string}
 */
function formatNumber(value) {
    return Number(value || 0)
        .toFixed(4)
        .replace(/\.?0+$/u, '')
}
