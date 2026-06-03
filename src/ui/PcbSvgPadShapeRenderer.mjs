// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { pathFromPoints } from './PcbSvgPathBuilder.mjs'
import { KicadArcGeometry } from '../core/kicad/KicadArcGeometry.mjs'

/**
 * Renders pad copper and drill shapes.
 */
export class PcbSvgPadShapeRenderer {
    /**
     * Renders pad geometry by shape.
     * @param {object} pad Pad model.
     * @param {string} attributes SVG attributes.
     * @param {string} transform SVG rotation transform.
     * @returns {string}
     */
    static renderPadShape(pad, attributes, transform) {
        if (pad.shape === 'custom' && pad.customPrimitives?.length) {
            return renderCustomPad(pad, attributes)
        }

        if (pad.shape === 'circle') {
            return `<circle ${attributes} cx="${formatNumber(pad.x)}" cy="${formatNumber(pad.y)}" r="${formatNumber(Math.max(pad.width, pad.height) / 2)}"/>`
        }

        const polygon = polygonPadPoints(pad)
        if (polygon.length > 0) {
            return `<path ${attributes} ${transform} d="${pathFromPoints(polygon, true)}"/>`
        }

        const x = pad.x - pad.width / 2
        const y = pad.y - pad.height / 2
        const radiusAttributes = padRadiusAttributes(pad)

        return `<rect ${attributes} ${transform} x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(pad.width)}" height="${formatNumber(pad.height)}"${radiusAttributes}/>`
    }

    /**
     * Renders circular and oval pad drill geometry.
     * @param {object} pad Pad model.
     * @param {string} attributes SVG attributes.
     * @returns {string}
     */
    static renderPadDrillShape(pad, attributes) {
        const width = Number(pad.drillWidth || pad.drill || 0)
        const height = Number(pad.drillHeight || pad.drill || width)
        const center = drillCenter(pad)
        const isOval = pad.drillShape === 'oval' && width > 0 && height > 0
        if (!isOval || Math.abs(width - height) < Number.EPSILON) {
            return `<circle ${attributes} cx="${formatNumber(center.x)}" cy="${formatNumber(center.y)}" r="${formatNumber(width / 2)}"/>`
        }
        const radius = Math.min(width, height) / 2
        const x = center.x - width / 2
        const y = center.y - height / 2
        const transform = `rotate(${formatNumber(pad.rotation || 0)} ${formatNumber(center.x)} ${formatNumber(center.y)})`
        return `<rect ${attributes} transform="${transform}" x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(width)}" height="${formatNumber(height)}" rx="${formatNumber(radius)}" ry="${formatNumber(radius)}"/>`
    }
}

/**
 * Renders a custom pad from local primitive geometry.
 * @param {object} pad Pad model.
 * @param {string} attributes SVG attributes.
 * @returns {string}
 */
function renderCustomPad(pad, attributes) {
    const customAttributes = attributes.replace(
        'class="pcb-pad"',
        'class="pcb-pad pcb-pad--custom"'
    )
    const transform = `translate(${formatNumber(pad.x)} ${formatNumber(pad.y)}) rotate(${formatNumber(pad.rotation || 0)})`
    return `<g ${customAttributes} transform="${transform}">${pad.customPrimitives.map(renderCustomPrimitive).join('')}</g>`
}

/**
 * Renders one custom pad primitive.
 * @param {object} primitive Primitive model.
 * @returns {string}
 */
function renderCustomPrimitive(primitive) {
    const className = `pcb-pad-primitive pcb-pad-primitive--${primitive.type || 'polygon'}`
    const fill = primitive.fill === false ? ' fill="none"' : ''
    const strokeWidth = primitiveStrokeWidthAttribute(primitive)
    if (primitive.type === 'line') {
        return `<line class="${className}" x1="${formatNumber(primitive.start?.x)}" y1="${formatNumber(primitive.start?.y)}" x2="${formatNumber(primitive.end?.x)}" y2="${formatNumber(primitive.end?.y)}"${fill}${strokeWidth}/>`
    }
    if (primitive.type === 'circle') {
        const radius = distance(primitive.center, primitive.end)
        return `<circle class="${className}" cx="${formatNumber(primitive.center?.x)}" cy="${formatNumber(primitive.center?.y)}" r="${formatNumber(radius)}"${fill}${strokeWidth}/>`
    }
    if (primitive.type === 'arc') {
        return `<path class="${className}" d="${arcPath(primitive)}"${fill}${strokeWidth}/>`
    }
    if (primitive.type === 'curve') {
        return `<path class="${className}" d="${curvePath(primitive.points || [])}"${fill}${strokeWidth}/>`
    }
    return `<path class="${className}" d="${pathFromPoints(primitive.points || [], true)}"${fill}${strokeWidth}/>`
}

/**
 * Calculates a pad drill center including local drill offsets.
 * @param {object} pad Pad model.
 * @returns {{ x: number, y: number }}
 */
function drillCenter(pad) {
    return {
        x: Number(pad.x || 0) + Number(pad.drillOffset?.x || 0),
        y: Number(pad.y || 0) + Number(pad.drillOffset?.y || 0)
    }
}

/**
 * Renders an optional primitive stroke-width override.
 * @param {object} primitive Primitive model.
 * @returns {string}
 */
function primitiveStrokeWidthAttribute(primitive) {
    const strokeWidth = Number(primitive.strokeWidth || 0)
    return strokeWidth > 0 ? ` stroke-width="${formatNumber(strokeWidth)}"` : ''
}

/**
 * Converts a three-point primitive arc to SVG arc syntax.
 * @param {{ start?: object, mid?: object, end?: object }} primitive Arc primitive.
 * @returns {string}
 */
function arcPath(primitive) {
    const start = primitive.start
    const mid = primitive.mid
    const end = primitive.end
    if (!start || !mid || !end) return ''

    const arc = KicadArcGeometry.fromThreePoints(start, mid, end)
    const startPath = `M ${formatNumber(start.x)} ${formatNumber(start.y)}`
    if (!arc) {
        return `${startPath} Q ${formatNumber(mid.x)} ${formatNumber(mid.y)} ${formatNumber(end.x)} ${formatNumber(end.y)}`
    }

    return [
        startPath,
        'A',
        formatNumber(arc.radius),
        formatNumber(arc.radius),
        '0',
        arc.largeArc ? '1' : '0',
        arc.sweep ? '1' : '0',
        formatNumber(end.x),
        formatNumber(end.y)
    ].join(' ')
}

/**
 * Converts custom pad curve points to SVG cubic path syntax.
 * @param {object[]} points Curve points.
 * @returns {string}
 */
function curvePath(points) {
    const [start] = points
    if (points.length < 4 || !start) {
        return pathFromPoints(points, false)
    }

    const commands = ['M', formatNumber(start.x), formatNumber(start.y)]
    let index = 1
    while (index + 2 < points.length) {
        const firstControl = points[index]
        const secondControl = points[index + 1]
        const end = points[index + 2]
        commands.push(
            'C',
            formatNumber(firstControl.x),
            formatNumber(firstControl.y),
            formatNumber(secondControl.x),
            formatNumber(secondControl.y),
            formatNumber(end.x),
            formatNumber(end.y)
        )
        index += 3
    }
    for (; index < points.length; index += 1) {
        commands.push(
            'L',
            formatNumber(points[index].x),
            formatNumber(points[index].y)
        )
    }
    return commands.join(' ')
}

/**
 * Builds explicit polygon points for pad shapes that cannot be rectangles.
 * @param {object} pad Pad model.
 * @returns {{ x: number, y: number }[]}
 */
function polygonPadPoints(pad) {
    if (pad.shape === 'trapezoid') return trapezoidPadPoints(pad)
    if (pad.chamferRatio && pad.chamfers?.length) {
        return chamferedRectanglePoints(pad)
    }
    return []
}

/**
 * Builds trapezoid pad points from rectangle delta values.
 * @param {object} pad Pad model.
 * @returns {{ x: number, y: number }[]}
 */
function trapezoidPadPoints(pad) {
    const left = pad.x - pad.width / 2
    const right = pad.x + pad.width / 2
    const top = pad.y - pad.height / 2
    const bottom = pad.y + pad.height / 2
    const deltaX = Number(pad.rectDelta?.x || 0) / 2
    const deltaY = Number(pad.rectDelta?.y || 0) / 2

    return [
        { x: left - deltaX, y: top + deltaY },
        { x: right + deltaX, y: top - deltaY },
        { x: right - deltaX, y: bottom + deltaY },
        { x: left + deltaX, y: bottom - deltaY }
    ]
}

/**
 * Builds chamfered rectangle pad points.
 * @param {object} pad Pad model.
 * @returns {{ x: number, y: number }[]}
 */
function chamferedRectanglePoints(pad) {
    const left = pad.x - pad.width / 2
    const right = pad.x + pad.width / 2
    const top = pad.y - pad.height / 2
    const bottom = pad.y + pad.height / 2
    const chamfer = Math.min(
        Math.min(pad.width, pad.height) * Number(pad.chamferRatio || 0),
        pad.width / 2,
        pad.height / 2
    )
    const corners = new Set((pad.chamfers || []).map(String))
    const points = []

    points.push(
        corners.has('top_left')
            ? { x: left + chamfer, y: top }
            : { x: left, y: top }
    )
    if (corners.has('top_right')) points.push({ x: right - chamfer, y: top })
    points.push(
        corners.has('top_right')
            ? { x: right, y: top + chamfer }
            : { x: right, y: top }
    )
    if (corners.has('bottom_right')) {
        points.push({ x: right, y: bottom - chamfer })
        points.push({ x: right - chamfer, y: bottom })
    } else {
        points.push({ x: right, y: bottom })
    }
    if (corners.has('bottom_left'))
        points.push({ x: left + chamfer, y: bottom })
    points.push(
        corners.has('bottom_left')
            ? { x: left, y: bottom - chamfer }
            : { x: left, y: bottom }
    )
    if (corners.has('top_left')) points.push({ x: left, y: top + chamfer })

    return points
}

/**
 * Renders SVG corner radius attributes for rounded pad shapes.
 * @param {object} pad Pad model.
 * @returns {string}
 */
function padRadiusAttributes(pad) {
    if (pad.shape === 'oval') {
        const radius = Math.min(pad.width, pad.height) / 2
        return ` rx="${formatNumber(radius)}" ry="${formatNumber(radius)}"`
    }

    if (pad.shape === 'roundrect') {
        return ` rx="${formatNumber(pad.width * pad.roundrectRatio)}" ry="${formatNumber(pad.height * pad.roundrectRatio)}"`
    }

    return ''
}

/**
 * Measures distance between two points.
 * @param {object | undefined} first First point.
 * @param {object | undefined} second Second point.
 * @returns {number}
 */
function distance(first, second) {
    const dx = Number(first?.x || 0) - Number(second?.x || 0)
    const dy = Number(first?.y || 0) - Number(second?.y || 0)
    return Math.hypot(dx, dy)
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
