// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadArcGeometry } from '../core/kicad/KicadArcGeometry.mjs'

/**
 * Renders non-text KiCad schematic SVG shapes that share primitive styling.
 */
export class SchematicSvgShapeRenderer {
    /**
     * Renders the faint KiCad-style sheet dot grid.
     * @param {object} sheet Sheet metadata.
     * @param {number} width Sheet width in display units.
     * @param {number} height Sheet height in display units.
     * @param {{ displayScale: number, frameColor: string }} options Render options.
     * @returns {string}
     */
    static renderGrid(sheet, width, height, options) {
        const sourceStep = Number(sheet.visibleGrid || sheet.snapGrid || 0)
        if (!Number.isFinite(sourceStep) || sourceStep <= 0) return ''

        const step = sourceStep * options.displayScale
        const id =
            `schematic-grid-${formatNumber(width)}-${formatNumber(height)}-${formatNumber(step)}`.replaceAll(
                '.',
                '_'
            )

        return [
            '<defs>',
            `<pattern id="${escapeAttribute(id)}" width="${formatNumber(step)}" height="${formatNumber(step)}" patternUnits="userSpaceOnUse">`,
            `<circle cx="${formatNumber(step / 2)}" cy="${formatNumber(step / 2)}" r="0.7" fill="${options.frameColor}" opacity="0.22"/>`,
            '</pattern>',
            '</defs>',
            `<rect class="schematic-grid" x="0" y="0" width="${formatNumber(width)}" height="${formatNumber(height)}" fill="url(#${escapeAttribute(id)})"/>`
        ].join('')
    }

    /**
     * Renders KiCad schematic shape background fills.
     * @param {object[]} primitives Shape primitives.
     * @param {object} theme Color resolver callbacks.
     * @returns {string}
     */
    static renderShapeBackgrounds(primitives, theme) {
        return sortedPrimitives(primitives)
            .map((primitive) => renderShapeFill(primitive, theme, 'background'))
            .join('')
    }

    /**
     * Renders KiCad schematic shape foreground fills and strokes.
     * @param {object[]} primitives Shape primitives.
     * @param {object} theme Color resolver callbacks.
     * @returns {string}
     */
    static renderShapeForegrounds(primitives, theme) {
        return sortedPrimitives(primitives)
            .map((primitive) =>
                [
                    renderShapeFill(primitive, theme, 'foreground'),
                    renderShapeStroke(primitive, theme)
                ].join('')
            )
            .join('')
    }

    /**
     * Renders SVG stroke-pattern attributes for a KiCad stroke type.
     * @param {object} primitive Primitive with a stroke style.
     * @param {number} strokeWidth Effective stroke width.
     * @returns {string}
     */
    static strokeStyleAttributes(primitive, strokeWidth) {
        return strokeStyleAttributes(primitive, strokeWidth)
    }

    /**
     * Renders schematic polygons.
     * @param {object[]} polygons Polygons.
     * @param {object} theme Color resolver callbacks.
     * @returns {string}
     */
    static renderPolygons(polygons, theme) {
        return polygons
            .map((polygon) => {
                const points = polygon.points || []
                if (points.length === 0) return ''
                const strokeWidth = effectiveStrokeWidth(
                    polygon.lineWidth || 0.15
                )
                return `<path class="schematic-polygon" d="${pathFromPoints(points)} Z" fill="${theme.resolveFillColor(polygon)}" stroke="${theme.resolveInkColor(polygon)}" stroke-width="${formatNumber(strokeWidth)}" stroke-linejoin="round"${strokeStyleAttributes(polygon, strokeWidth)}/>`
            })
            .join('')
    }

    /**
     * Renders schematic ellipses and circles.
     * @param {object[]} ellipses Ellipses.
     * @param {object} theme Color resolver callbacks.
     * @returns {string}
     */
    static renderEllipses(ellipses, theme) {
        return ellipses
            .map((ellipse) => {
                const strokeWidth = effectiveStrokeWidth(
                    ellipse.lineWidth || 0.15
                )
                return `<ellipse class="schematic-ellipse" cx="${formatNumber(ellipse.x)}" cy="${formatNumber(ellipse.y)}" rx="${formatNumber(ellipse.radiusX || 0)}" ry="${formatNumber(ellipse.radiusY || ellipse.radiusX || 0)}" fill="${theme.resolveFillColor(ellipse)}" stroke="${theme.resolveInkColor(ellipse)}" stroke-width="${formatNumber(strokeWidth)}"${strokeStyleAttributes(ellipse, strokeWidth)}/>`
            })
            .join('')
    }

    /**
     * Renders schematic circular arcs.
     * @param {object[]} arcs Arcs.
     * @param {object} theme Color resolver callbacks.
     * @returns {string}
     */
    static renderArcs(arcs, theme) {
        return arcs
            .map((arc) => {
                const strokeWidth = effectiveStrokeWidth(
                    arc.width || arc.lineWidth || 0.15
                )
                return `<path class="schematic-arc" d="${arcPath(arc)}" fill="none" stroke="${theme.resolveInkColor(arc)}" stroke-width="${formatNumber(strokeWidth)}" stroke-linecap="round"${strokeStyleAttributes(arc, strokeWidth)}/>`
            })
            .join('')
    }

    /**
     * Renders schematic Bezier curves.
     * @param {object[]} beziers Beziers.
     * @param {object} theme Color resolver callbacks.
     * @returns {string}
     */
    static renderBeziers(beziers, theme) {
        return beziers
            .map((bezier) => {
                const strokeWidth = effectiveStrokeWidth(
                    bezier.width || bezier.lineWidth || 0.15
                )
                return `<path class="schematic-bezier" d="${bezierPath(bezier)}" fill="none" stroke="${theme.resolveInkColor(bezier)}" stroke-width="${formatNumber(strokeWidth)}" stroke-linecap="round"${strokeStyleAttributes(bezier, strokeWidth)}/>`
            })
            .join('')
    }
}

/**
 * Renders one closed primitive fill pass.
 * @param {object} primitive Shape primitive.
 * @param {object} theme Color resolver callbacks.
 * @param {'background' | 'foreground'} phase Paint phase.
 * @returns {string}
 */
function renderShapeFill(primitive, theme, phase) {
    if (!canFillPrimitive(primitive)) return ''
    const color =
        phase === 'background'
            ? resolveBackgroundFillColor(primitive, theme)
            : resolveForegroundFillColor(primitive, theme)
    if (color === 'none') return ''
    return renderShapePrimitive(primitive, {
        classSuffix: 'fill',
        fill: color,
        stroke: 'none',
        strokeWidth: 0
    })
}

/**
 * Renders one primitive stroke pass.
 * @param {object} primitive Shape primitive.
 * @param {object} theme Color resolver callbacks.
 * @returns {string}
 */
function renderShapeStroke(primitive, theme) {
    const strokeWidth = effectiveStrokeWidth(primitiveStrokeWidth(primitive))
    if (strokeWidth <= 0) return ''
    return renderShapePrimitive(primitive, {
        classSuffix: 'stroke',
        fill: 'none',
        stroke: theme.resolveInkColor(primitive),
        strokeWidth,
        strokeAttributes: strokeStyleAttributes(primitive, strokeWidth)
    })
}

/**
 * Resolves the stroke-width field without confusing geometry width for pen width.
 * @param {object} primitive Shape primitive.
 * @returns {number | undefined}
 */
function primitiveStrokeWidth(primitive) {
    if (['line', 'arc', 'bezier'].includes(primitive?.shapeType)) {
        return primitive.width ?? primitive.lineWidth
    }
    return primitive?.lineWidth
}

/**
 * Renders one shape primitive.
 * @param {object} primitive Shape primitive.
 * @param {{ classSuffix: string, fill: string, stroke: string, strokeWidth: number, strokeAttributes?: string }} paint Paint attributes.
 * @returns {string}
 */
function renderShapePrimitive(primitive, paint) {
    if (primitive.shapeType === 'line')
        return renderLinePrimitive(primitive, paint)
    if (primitive.shapeType === 'rectangle') {
        return `<rect class="schematic-rect schematic-shape-${paint.classSuffix}" x="${formatNumber(primitive.x)}" y="${formatNumber(primitive.y)}" width="${formatNumber(primitive.width)}" height="${formatNumber(primitive.height)}"${rectangleRadiusAttributes(primitive)} fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${formatNumber(paint.strokeWidth)}"${paint.strokeAttributes || ''}/>`
    }
    if (primitive.shapeType === 'polygon') {
        const points = primitive.points || []
        if (points.length === 0) return ''
        return `<path class="schematic-polygon schematic-shape-${paint.classSuffix}" d="${pathFromPoints(points)} Z" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${formatNumber(paint.strokeWidth)}" stroke-linejoin="round"${paint.strokeAttributes || ''}/>`
    }
    if (primitive.shapeType === 'ellipse') {
        return `<ellipse class="schematic-ellipse schematic-shape-${paint.classSuffix}" cx="${formatNumber(primitive.x)}" cy="${formatNumber(primitive.y)}" rx="${formatNumber(primitive.radiusX || 0)}" ry="${formatNumber(primitive.radiusY || primitive.radiusX || 0)}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${formatNumber(paint.strokeWidth)}"${paint.strokeAttributes || ''}/>`
    }
    if (primitive.shapeType === 'arc') {
        return `<path class="schematic-arc schematic-shape-${paint.classSuffix}" d="${arcPath(primitive)}" fill="none" stroke="${paint.stroke}" stroke-width="${formatNumber(paint.strokeWidth)}" stroke-linecap="round"${paint.strokeAttributes || ''}/>`
    }
    if (primitive.shapeType === 'bezier') {
        return `<path class="schematic-bezier schematic-shape-${paint.classSuffix}" d="${bezierPath(primitive)}" fill="none" stroke="${paint.stroke}" stroke-width="${formatNumber(paint.strokeWidth)}" stroke-linecap="round"${paint.strokeAttributes || ''}/>`
    }
    return ''
}

/**
 * Renders SVG radius attributes for rounded schematic rectangles.
 * @param {object} primitive Rectangle primitive.
 * @returns {string}
 */
function rectangleRadiusAttributes(primitive) {
    const radius = Number(primitive?.radius || 0)
    if (!Number.isFinite(radius) || radius <= 0) return ''
    return ` rx="${formatNumber(radius)}" ry="${formatNumber(radius)}"`
}

/**
 * Renders one line primitive.
 * @param {object} line Line primitive.
 * @param {{ classSuffix: string, stroke: string, strokeWidth: number, strokeAttributes?: string }} paint Paint attributes.
 * @returns {string}
 */
function renderLinePrimitive(line, paint) {
    return `<line class="schematic-line schematic-shape-${paint.classSuffix}" x1="${formatNumber(line.x1)}" y1="${formatNumber(line.y1)}" x2="${formatNumber(line.x2)}" y2="${formatNumber(line.y2)}" stroke="${paint.stroke}" stroke-width="${formatNumber(paint.strokeWidth)}" stroke-linecap="round"${paint.strokeAttributes || ''}/>`
}

/**
 * Renders SVG stroke-pattern attributes for a KiCad stroke type.
 * @param {object} primitive Primitive with a stroke style.
 * @param {number} strokeWidth Effective stroke width.
 * @returns {string}
 */
function strokeStyleAttributes(primitive, strokeWidth) {
    const pattern = strokePattern(primitive?.strokeStyle, strokeWidth)
    if (!pattern) return ''
    return ` stroke-dasharray="${pattern}"`
}

/**
 * Resolves a KiCad stroke style to an SVG dash pattern.
 * @param {string | undefined} style KiCad stroke type.
 * @param {number} strokeWidth Effective stroke width.
 * @returns {string}
 */
function strokePattern(style, strokeWidth) {
    const normalized = String(style || '')
        .toLowerCase()
        .replaceAll('-', '_')
    const width = Math.max(Number(strokeWidth) || 0.15, 0.001)
    const dot = formatNumber(width)
    const gap = formatNumber(width * 2)
    const dash = formatNumber(width * 4)

    if (!normalized || ['default', 'solid'].includes(normalized)) return ''
    if (normalized === 'dot') return `${dot} ${gap}`
    if (normalized === 'dash') return `${dash} ${gap}`
    if (normalized === 'dash_dot') return `${dash} ${gap} ${dot} ${gap}`
    if (normalized === 'dash_dot_dot') {
        return `${dash} ${gap} ${dot} ${gap} ${dot} ${gap}`
    }
    return ''
}

/**
 * Checks whether a primitive has closed geometry for fill drawing.
 * @param {object} primitive Shape primitive.
 * @returns {boolean}
 */
function canFillPrimitive(primitive) {
    return ['rectangle', 'polygon', 'ellipse'].includes(primitive?.shapeType)
}

/**
 * Resolves background-pass fill color.
 * @param {object} primitive Shape primitive.
 * @param {object} theme Color resolver callbacks.
 * @returns {string}
 */
function resolveBackgroundFillColor(primitive, theme) {
    return theme.resolveBackgroundFillColor
        ? theme.resolveBackgroundFillColor(primitive)
        : theme.resolveFillColor(primitive)
}

/**
 * Resolves foreground-pass fill color.
 * @param {object} primitive Shape primitive.
 * @param {object} theme Color resolver callbacks.
 * @returns {string}
 */
function resolveForegroundFillColor(primitive, theme) {
    return theme.resolveForegroundFillColor
        ? theme.resolveForegroundFillColor(primitive)
        : 'none'
}

/**
 * Resolves KiCad's effective stroke width convention.
 * @param {number | undefined} width Stroke width.
 * @returns {number}
 */
function effectiveStrokeWidth(width) {
    const resolved = Number(width)
    if (Number.isFinite(resolved) && resolved < 0) return 0
    if (!Number.isFinite(resolved) || Math.abs(resolved) < 0.001) return 0.15
    return resolved
}

/**
 * Sorts primitives in KiCad source order.
 * @param {object[]} primitives Shape primitives.
 * @returns {object[]}
 */
function sortedPrimitives(primitives) {
    return (primitives || [])
        .map((primitive, index) => ({ primitive, index }))
        .sort((left, right) => {
            const order = primitiveRenderOrder(left.primitive)
            const otherOrder = primitiveRenderOrder(right.primitive)
            return order - otherOrder || left.index - right.index
        })
        .map((entry) => entry.primitive)
}

/**
 * Resolves a primitive render-order key.
 * @param {object} primitive Shape primitive.
 * @returns {number}
 */
function primitiveRenderOrder(primitive) {
    const order = Number(primitive?.renderOrder)
    if (!Number.isFinite(order)) return 0
    if (primitive?.shapeType === 'line') return order / 100
    return order
}

/**
 * Renders a KiCad three-point arc path.
 * @param {object} arc Arc primitive.
 * @returns {string}
 */
function arcPath(arc) {
    const start = arc.start || { x: 0, y: 0 }
    const mid = arc.mid || start
    const end = arc.end || start
    const geometry = KicadArcGeometry.fromThreePoints(start, mid, end)
    if (!geometry) {
        return `M ${formatNumber(start.x)} ${formatNumber(start.y)} Q ${formatNumber(mid.x)} ${formatNumber(mid.y)} ${formatNumber(end.x)} ${formatNumber(end.y)}`
    }

    return [
        `M ${formatNumber(start.x)} ${formatNumber(start.y)}`,
        'A',
        formatNumber(geometry.radius),
        formatNumber(geometry.radius),
        '0',
        geometry.largeArc ? '1' : '0',
        geometry.sweep ? '1' : '0',
        formatNumber(end.x),
        formatNumber(end.y)
    ].join(' ')
}

/**
 * Renders a KiCad Bezier path.
 * @param {object} bezier Bezier primitive.
 * @returns {string}
 */
function bezierPath(bezier) {
    const points = bezier.points || []
    if (points.length === 0) return ''
    if (points.length < 4) return pathFromPoints(points)

    const [first, ...rest] = points
    const commands = [`M ${formatNumber(first.x)} ${formatNumber(first.y)}`]
    for (let index = 0; index < rest.length; index += 3) {
        const controlA = rest[index]
        const controlB = rest[index + 1]
        const end = rest[index + 2]
        if (!controlA || !controlB || !end) break
        commands.push(
            `C ${formatNumber(controlA.x)} ${formatNumber(controlA.y)} ${formatNumber(controlB.x)} ${formatNumber(controlB.y)} ${formatNumber(end.x)} ${formatNumber(end.y)}`
        )
    }
    return commands.join(' ')
}

/**
 * Converts points to an SVG path.
 * @param {{ x: number, y: number }[]} points Points.
 * @returns {string}
 */
function pathFromPoints(points) {
    if (!points.length) return ''
    const [first, ...rest] = points
    const commands = [`M ${formatNumber(first.x)} ${formatNumber(first.y)}`]
    rest.forEach((point) => {
        commands.push(`L ${formatNumber(point.x)} ${formatNumber(point.y)}`)
    })
    return commands.join(' ')
}

/**
 * Formats a number.
 * @param {number} value Number.
 * @returns {string}
 */
function formatNumber(value) {
    return Number(value || 0)
        .toFixed(3)
        .replace(/\.?0+$/, '')
}

/**
 * Escapes attribute content.
 * @param {unknown} value Raw value.
 * @returns {string}
 */
function escapeAttribute(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}
