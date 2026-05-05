// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { Geometry } from '../core/Geometry.mjs'
import { RenderPalette } from '../core/RenderPalette.mjs'
import { BadgeRenderer } from './BadgeRenderer.mjs'
import { ComponentHighlight } from './ComponentHighlight.mjs'
import { KicadStrokeFont } from './KicadStrokeFont.mjs'

const kicadTextLineSpacingRatio = 1.61
const kicadFirstLineHeightRatio = 1.17
const kicadStrokeBaselineFudgeRatio = 0.052
const circleEpsilon = 1e-9
const fullCircleRadians = Math.PI * 2
const defaultPadStrokeWidth = 0.16
const roundedStrokeAttributes = 'stroke-linecap="round" stroke-linejoin="round"'

/**
 * Renders normalized KiCad boards into manual-style SVG.
 */
export class PcbSvgRenderer {
    /**
     * Renders a PCB.
     * @param {object | null} board
     * @param {{ side?: 'front' | 'back', markers?: object[], layerStyles?: Record<string, object>, colors?: Record<string, string>, highlightedFootprints?: readonly string[], hoveredFootprintId?: string, highlightColor?: string, badges?: readonly object[], badgeStyle?: object }} [options]
     * @returns {string}
     */
    static render(board, options = {}) {
        if (!board) return PcbSvgRenderer.renderEmpty()

        const side = options.side || 'front'
        const layerStyles = RenderPalette.resolveStyles(
            options.layerStyles,
            options.colors
        )
        const highlight = ComponentHighlight.resolve(options)
        const viewBounds = Geometry.expandBounds(board.bounds, 4)
        const visiblePads = board.pads.filter((pad) =>
            isVisibleOnSide(pad, side)
        )
        const visibleDrawings = board.drawings.filter((drawing) => {
            return (
                isVisibleOnSide(drawing, side) &&
                isRenderableBoardLayer(drawing)
            )
        })
        const visibleTexts = board.texts.filter((text) => {
            return (
                isVisibleOnSide(text, side) &&
                isVisibleText(text) &&
                !isExcludedReferenceText(text) &&
                isRenderableBoardLayer(text)
            )
        })
        const visibleViaDrills = visibleDrawings.filter((drawing) => {
            return drawing.type === 'via' && drawing.drill
        })

        return [
            `<svg xmlns="http://www.w3.org/2000/svg" class="pcb-svg" viewBox="${formatNumber(viewBounds.minX)} ${formatNumber(viewBounds.minY)} ${formatNumber(viewBounds.width)} ${formatNumber(viewBounds.height)}" role="img" aria-label="${escapeAttribute(board.title || board.fileName || 'PCB')}">`,
            `<g class="pcb-scene"${sceneTransformAttribute(board.bounds, side)}>`,
            renderBoard(board, viewBounds, layerStyles),
            renderComponentHitAreas(
                board,
                visiblePads,
                visibleDrawings,
                visibleTexts
            ),
            visibleDrawings
                .sort(compareDrawingOrder)
                .map((drawing) =>
                    renderDrawing(drawing, layerStyles, highlight)
                )
                .join(''),
            visiblePads
                .map((pad) => renderPad(pad, layerStyles, highlight))
                .join(''),
            visibleTexts
                .map((text) => renderText(text, layerStyles, highlight))
                .join(''),
            visibleViaDrills
                .map((drawing) => renderViaDrill(drawing, layerStyles))
                .join(''),
            visiblePads.map((pad) => renderPadDrill(pad, layerStyles)).join(''),
            BadgeRenderer.render(
                options.badges,
                side,
                highlight.color,
                options.badgeStyle
            ),
            '</g>',
            '</svg>'
        ].join('')
    }

    /**
     * Renders empty placeholder SVG.
     * @returns {string}
     */
    static renderEmpty() {
        return [
            '<svg xmlns="http://www.w3.org/2000/svg" class="pcb-svg pcb-svg--empty" viewBox="0 0 100 60" role="img" aria-label="Drop board file">',
            '<rect x="1" y="1" width="98" height="58" rx="2" fill="#f7f8f9" stroke="#8d98a4" stroke-width="0.35" stroke-dasharray="1.4 1.2"/>',
            '<text x="50" y="28" text-anchor="middle" fill="#1f2430" font-size="4.5" font-weight="700">Drop board file</text>',
            '<text x="50" y="35.5" text-anchor="middle" fill="#6a7280" font-size="3.5">.kicad_pcb or project .zip</text>',
            '</svg>'
        ].join('')
    }
}

/**
 * Builds a KiCad-style side transform for the whole rendered scene.
 * @param {object} bounds
 * @param {'front' | 'back'} side
 * @returns {string}
 */
function sceneTransformAttribute(bounds, side) {
    if (side !== 'back') return ''
    const center = Geometry.boundsCenter(bounds)
    return ` transform="translate(${formatNumber(center.x * 2)} 0) scale(-1 1)"`
}

/**
 * Renders board fill and outlines.
 * @param {object} board
 * @param {object} bounds
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderBoard(board, bounds, layerStyles) {
    const boardStyle = layerStyles.board
    const edgeStyle = layerStyles.edgeCuts
    if (!boardStyle.visible && !edgeStyle.visible) return ''

    const polygonOutlines = board.outlines.filter(
        (outline) => outline.type === 'polygon'
    )
    const fill = boardStyle.visible ? fillValue(boardStyle) : 'none'
    const fillOpacity = boardStyle.visible
        ? fillOpacityAttribute(boardStyle)
        : ''
    const stroke = edgeStyle.visible ? edgeStyle.borderColor : 'none'

    if (polygonOutlines.length === 0) {
        return `<rect class="pcb-board" x="${formatNumber(bounds.minX)}" y="${formatNumber(bounds.minY)}" width="${formatNumber(bounds.width)}" height="${formatNumber(bounds.height)}" fill="${fill}"${optionalAttribute(fillOpacity)} stroke="${stroke}" stroke-width="${formatNumber(resolveStrokeWidth(edgeStyle, 0.12))}" ${roundedStrokeAttributes}/>`
    }

    return polygonOutlines
        .map((outline) => {
            const strokeWidth = Math.max(0.08, outline.strokeWidth || 0.08)
            return `<path class="pcb-board" d="${pathFromPoints(outline.points, true)}" fill="${fill}"${optionalAttribute(fillOpacity)} stroke="${stroke}" stroke-width="${formatNumber(resolveStrokeWidth(edgeStyle, strokeWidth))}" ${roundedStrokeAttributes} vector-effect="non-scaling-stroke"/>`
        })
        .join('')
}

/**
 * Renders a drawing primitive.
 * @param {object} drawing
 * @param {Record<string, object>} layerStyles
 * @param {object} highlight
 * @returns {string}
 */
function renderDrawing(drawing, layerStyles, highlight) {
    if (drawing.type === 'segment') {
        return renderSegment(drawing, layerStyles)
    }

    if (drawing.type === 'via') {
        return renderVia(drawing, layerStyles)
    }

    if (drawing.type === 'zone') {
        return renderZone(drawing, layerStyles)
    }

    const style = drawingStyle(drawing, layerStyles)
    if (!style) return ''

    const strokeWidth = resolveStrokeWidth(
        style.layerStyle,
        Number(drawing.strokeWidth) || 0
    )
    const highlightState = ComponentHighlight.stateFor(
        drawing.ownerId,
        highlight
    )
    const strokeColor = highlightState?.color || style.stroke
    const stroke = drawing.fill && strokeWidth <= 0.01 ? 'none' : strokeColor
    const fill = drawing.fill ? highlightState?.color || style.fill : 'none'
    const fillOpacity = drawing.fill
        ? optionalAttribute(
              highlightState ? '' : fillOpacityAttribute(style.layerStyle)
          )
        : ''
    const base = [
        `class="pcb-drawing pcb-drawing--${style.name}"`,
        ...componentAttributeList(drawing.ownerId, highlightState),
        `stroke="${stroke}"`,
        `stroke-width="${formatNumber(strokeWidth)}"`,
        roundedStrokeAttributes
    ].join(' ')

    if (drawing.type === 'line') {
        return `<line ${base} x1="${formatNumber(drawing.start.x)}" y1="${formatNumber(drawing.start.y)}" x2="${formatNumber(drawing.end.x)}" y2="${formatNumber(drawing.end.y)}"/>`
    }

    if (drawing.type === 'rect') {
        const x = Math.min(drawing.start.x, drawing.end.x)
        const y = Math.min(drawing.start.y, drawing.end.y)
        const width = Math.abs(drawing.end.x - drawing.start.x)
        const height = Math.abs(drawing.end.y - drawing.start.y)
        return `<rect ${base} x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(width)}" height="${formatNumber(height)}" fill="${fill}"${fillOpacity}/>`
    }

    if (drawing.type === 'circle') {
        return `<circle ${base} cx="${formatNumber(drawing.center.x)}" cy="${formatNumber(drawing.center.y)}" r="${formatNumber(drawing.radius)}" fill="${fill}"${fillOpacity}/>`
    }

    if (drawing.type === 'arc') {
        return `<path ${base} d="${arcPath(drawing)}" fill="none"/>`
    }

    if (drawing.type === 'polygon') {
        return `<path ${base} d="${pathFromPoints(drawing.points, true)}" fill="${fill}"${fillOpacity}/>`
    }

    return ''
}

/**
 * Renders one copper track segment.
 * @param {object} segment
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderSegment(segment, layerStyles) {
    const style = layerStyles.traces
    if (!style.visible) return ''

    const strokeWidth = resolveStrokeWidth(
        style,
        Math.max(segment.strokeWidth || 0.2, 0.06)
    )
    return `<line class="pcb-segment" stroke="${style.borderColor}" stroke-width="${formatNumber(strokeWidth)}" ${roundedStrokeAttributes} vector-effect="non-scaling-stroke" x1="${formatNumber(segment.start.x)}" y1="${formatNumber(segment.start.y)}" x2="${formatNumber(segment.end.x)}" y2="${formatNumber(segment.end.y)}"/>`
}

/**
 * Renders one copper via.
 * @param {object} via
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderVia(via, layerStyles) {
    const style = layerStyles.vias
    if (!style.visible) return ''

    return `<circle class="pcb-via" cx="${formatNumber(via.x)}" cy="${formatNumber(via.y)}" r="${formatNumber(via.size / 2)}" fill="${fillValue(style)}"${optionalAttribute(fillOpacityAttribute(style))} stroke="${style.borderColor}" stroke-width="${formatNumber(resolveStrokeWidth(style, 0.06))}" vector-effect="non-scaling-stroke"/>`
}

/**
 * Renders one via drill as a physical board cutout.
 * @param {object} via
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderViaDrill(via, layerStyles) {
    const style = layerStyles.drills
    if (!style.visible) return ''

    return `<circle class="pcb-via-drill" cx="${formatNumber(via.x)}" cy="${formatNumber(via.y)}" r="${formatNumber(via.drill / 2)}" fill="${fillValue(style)}"${optionalAttribute(fillOpacityAttribute(style))}${strokeAttributes(style, 0)}/>`
}

/**
 * Renders one filled copper zone.
 * @param {object} zone
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderZone(zone, layerStyles) {
    const style = layerStyles.zones
    if (!style.visible) return ''

    return `<path class="pcb-zone" d="${pathFromPoints(zone.points, true)}" fill="${fillValue(style)}"${optionalAttribute(fillOpacityAttribute(style))}${strokeAttributes(style, 0)}/>`
}

/**
 * Renders one pad.
 * @param {object} pad
 * @param {Record<string, object>} layerStyles
 * @param {object} highlight
 * @returns {string}
 */
function renderPad(pad, layerStyles, highlight) {
    const style = layerStyles.pads
    if (!style.visible) return ''

    const highlightState = ComponentHighlight.stateFor(
        pad.footprintId,
        highlight
    )
    const attributes = [
        'class="pcb-pad"',
        ...componentAttributeList(pad.footprintId, highlightState),
        `fill="${highlightState?.color || fillValue(style)}"`,
        highlightState ? '' : fillOpacityAttribute(style),
        `stroke="${style.borderColor}"`,
        `stroke-width="${formatNumber(resolvePadStrokeWidth(pad, style))}"`,
        'vector-effect="non-scaling-stroke"'
    ]
        .filter(Boolean)
        .join(' ')
    const transform = `transform="rotate(${formatNumber(pad.rotation)} ${formatNumber(pad.x)} ${formatNumber(pad.y)})"`
    return renderPadShape(pad, attributes, transform)
}

/**
 * Renders one pad drill as a physical board cutout.
 * @param {object} pad
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderPadDrill(pad, layerStyles) {
    if (!pad.drill) return ''
    const style = layerStyles.drills
    if (!style.visible) return ''

    return `<circle class="pcb-pad-drill" ${componentAttributeList(pad.footprintId, null).join(' ')} cx="${formatNumber(pad.x)}" cy="${formatNumber(pad.y)}" r="${formatNumber(pad.drill / 2)}" fill="${fillValue(style)}"${optionalAttribute(fillOpacityAttribute(style))}${strokeAttributes(style, 0.08)} vector-effect="non-scaling-stroke"/>`
}

/**
 * Renders transparent footprint targets for click and hover interaction.
 * @param {{ footprints?: object[] }} board
 * @param {object[]} pads
 * @param {object[]} drawings
 * @param {object[]} texts
 * @returns {string}
 */
function renderComponentHitAreas(board, pads, drawings, texts) {
    const visibleIds = visibleFootprintIds(pads, drawings, texts)
    return (board.footprints || [])
        .filter((footprint) => visibleIds.has(footprint.id))
        .map(renderComponentHitArea)
        .join('')
}

/**
 * Renders one transparent component hit area.
 * @param {{ id: string, reference?: string, bounds?: object }} footprint
 * @returns {string}
 */
function renderComponentHitArea(footprint) {
    if (!footprint.bounds) return ''

    const bounds = Geometry.expandBounds(footprint.bounds, 0.4)
    return [
        '<rect',
        'class="pcb-component-hit-area"',
        `data-footprint-id="${escapeAttribute(footprint.id)}"`,
        `aria-label="${escapeAttribute(`Toggle highlight ${footprint.reference || footprint.id}`)}"`,
        `x="${formatNumber(bounds.minX)}"`,
        `y="${formatNumber(bounds.minY)}"`,
        `width="${formatNumber(bounds.width)}"`,
        `height="${formatNumber(bounds.height)}"`,
        'fill="transparent"',
        'pointer-events="all"/>'
    ].join(' ')
}

/**
 * Finds footprint ids that have visible renderable content.
 * @param {object[]} pads
 * @param {object[]} drawings
 * @param {object[]} texts
 * @returns {Set<string>}
 */
function visibleFootprintIds(pads, drawings, texts) {
    const ids = new Set()
    pads.forEach((pad) => addFootprintId(ids, pad.footprintId))
    drawings.forEach((drawing) => addFootprintId(ids, drawing.ownerId))
    texts.forEach((text) => addFootprintId(ids, text.ownerId))
    return ids
}

/**
 * Adds a real footprint id to a set.
 * @param {Set<string>} ids
 * @param {unknown} value
 * @returns {void}
 */
function addFootprintId(ids, value) {
    const id = String(value || '').trim()
    if (id && id !== 'board') ids.add(id)
}

/**
 * Renders pad geometry by shape.
 * @param {object} pad
 * @param {string} attributes
 * @param {string} transform
 * @returns {string}
 */
function renderPadShape(pad, attributes, transform) {
    if (pad.shape === 'circle') {
        return `<circle ${attributes} cx="${formatNumber(pad.x)}" cy="${formatNumber(pad.y)}" r="${formatNumber(Math.max(pad.width, pad.height) / 2)}"/>`
    }

    const x = pad.x - pad.width / 2
    const y = pad.y - pad.height / 2
    const radiusAttributes = padRadiusAttributes(pad)

    return `<rect ${attributes} ${transform} x="${formatNumber(x)}" y="${formatNumber(y)}" width="${formatNumber(pad.width)}" height="${formatNumber(pad.height)}"${radiusAttributes}/>`
}

/**
 * Renders SVG corner radius attributes for rounded pad shapes.
 * @param {object} pad
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
 * Renders text.
 * @param {object} text
 * @param {Record<string, object>} layerStyles
 * @param {object} highlight
 * @returns {string}
 */
function renderText(text, layerStyles, highlight) {
    const style = layerStyles.silkscreen
    if (!style.visible) return ''

    const lines = String(text.value || '').split('\n')
    const lineSpacing = textLineSpacing(text)
    const strokeWidth = resolveStrokeWidth(style, textStrokeWidth(text))
    const highlightState = ComponentHighlight.stateFor(text.ownerId, highlight)
    const attrs = [
        'class="pcb-label"',
        ...componentAttributeList(text.ownerId, highlightState),
        `aria-label="${escapeAttribute(text.value)}"`,
        'fill="none"',
        `stroke="${highlightState?.color || style.borderColor}"`,
        `stroke-width="${formatNumber(strokeWidth)}"`,
        'stroke-linecap="round"',
        'stroke-linejoin="round"',
        `transform="${textTransform(text)}"`
    ].join(' ')

    return `<g ${attrs}>${lines.map((line, index) => renderTextLine(text, line, index, lines.length, lineSpacing)).join('')}</g>`
}

/**
 * Renders one KiCad stroke-font text line.
 * @param {object} text
 * @param {string} line
 * @param {number} index
 * @param {number} lineCount
 * @param {number} lineSpacing
 * @returns {string}
 */
function renderTextLine(text, line, index, lineCount, lineSpacing) {
    const sizeX = textWidth(text)
    const sizeY = textHeight(text)
    const lineWidth = KicadStrokeFont.measureLine(line, sizeX)
    const x = textLineX(text, lineWidth)
    const y = textLineY(text, index, lineCount, lineSpacing)
    const strokes = KicadStrokeFont.strokeLine(line, { x, y, sizeX, sizeY })
    const attrs = [
        'class="pcb-label-line"',
        `data-line="${escapeAttribute(line)}"`,
        `data-x="${formatNumber(x)}"`,
        `data-y="${formatNumber(y)}"`
    ].join(' ')

    return `<g ${attrs}>${strokes.map(renderTextStroke).join('')}</g>`
}

/**
 * Renders one KiCad stroke-font pen-down stroke.
 * @param {{ x: number, y: number }[]} points
 * @returns {string}
 */
function renderTextStroke(points) {
    return `<path class="pcb-label-stroke" d="${pathFromPoints(points, false)}"/>`
}

/**
 * Converts a KiCad start/mid/end circular arc to SVG arc syntax.
 * @param {{ start: object, mid: object, end: object }} drawing
 * @returns {string}
 */
function arcPath(drawing) {
    const arc = circularArcFromThreePoints(
        drawing.start,
        drawing.mid,
        drawing.end
    )
    const start = `M ${formatNumber(drawing.start.x)} ${formatNumber(drawing.start.y)}`

    if (!arc) {
        return `${start} Q ${formatNumber(drawing.mid.x)} ${formatNumber(drawing.mid.y)} ${formatNumber(drawing.end.x)} ${formatNumber(drawing.end.y)}`
    }

    return [
        start,
        'A',
        formatNumber(arc.radius),
        formatNumber(arc.radius),
        '0',
        arc.largeArc ? '1' : '0',
        arc.sweep ? '1' : '0',
        formatNumber(drawing.end.x),
        formatNumber(drawing.end.y)
    ].join(' ')
}

/**
 * Resolves SVG arc flags from KiCad's three-point circular arc.
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} mid
 * @param {{ x: number, y: number }} end
 * @returns {{ radius: number, largeArc: boolean, sweep: boolean } | null}
 */
function circularArcFromThreePoints(start, mid, end) {
    const center = circleCenterFromThreePoints(start, mid, end)
    if (!center) return null

    const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
    const midAngle = Math.atan2(mid.y - center.y, mid.x - center.x)
    const endAngle = Math.atan2(end.y - center.y, end.x - center.x)
    const clockwiseEnd = normalizeRadians(endAngle - startAngle)
    const clockwiseMid = normalizeRadians(midAngle - startAngle)
    const sweep = clockwiseMid <= clockwiseEnd + circleEpsilon
    const arcAngle = sweep ? clockwiseEnd : fullCircleRadians - clockwiseEnd

    return {
        radius: Geometry.distance(center, start),
        largeArc: arcAngle > Math.PI,
        sweep
    }
}

/**
 * Calculates a circle center through three points.
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {{ x: number, y: number }} c
 * @returns {{ x: number, y: number } | null}
 */
function circleCenterFromThreePoints(a, b, c) {
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

/**
 * Normalizes radians to [0, 2PI).
 * @param {number} value
 * @returns {number}
 */
function normalizeRadians(value) {
    const result = value % fullCircleRadians
    return result < 0 ? result + fullCircleRadians : result
}

/**
 * Calculates KiCad-like baseline spacing for multiline text.
 * @param {object} text
 * @returns {number}
 */
function textLineSpacing(text) {
    return textHeight(text) * kicadTextLineSpacingRatio
}

/**
 * Resolves KiCad's vertical stroke size for font and baseline metrics.
 * @param {object} text
 * @returns {number}
 */
function textHeight(text) {
    return positiveTextSize(text.sizeX, text.sizeY)
}

/**
 * Resolves KiCad's horizontal stroke size for glyph scaling.
 * @param {object} text
 * @returns {number}
 */
function textWidth(text) {
    return positiveTextSize(text.sizeY, text.sizeX)
}

/**
 * Resolves a KiCad text size without imposing a renderer minimum.
 * @param {number | undefined} primary
 * @param {number | undefined} secondary
 * @returns {number}
 */
function positiveTextSize(primary, secondary) {
    const value = Number(primary) || Number(secondary) || 1
    return Math.max(value, 0.001)
}

/**
 * Calculates line origin from KiCad horizontal justification.
 * @param {object} text
 * @param {number} lineWidth
 * @returns {number}
 */
function textLineX(text, lineWidth) {
    const fudge = textStrokeHorizontalFudge(text)

    if (text.hAlign === 'left') return text.x + fudge
    if (text.hAlign === 'right') return text.x - lineWidth - fudge
    return text.x - lineWidth / 2
}

/**
 * Calculates one line baseline from KiCad vertical justification.
 * @param {object} text
 * @param {number} index
 * @param {number} lineCount
 * @param {number} lineSpacing
 * @returns {number}
 */
function textLineY(text, index, lineCount, lineSpacing) {
    const height = textHeight(text)
    const blockHeight =
        height * kicadFirstLineHeightRatio + lineSpacing * (lineCount - 1)
    let baseline = text.y + height - textStrokeBaselineFudge(text)

    if (text.vAlign === 'bottom') {
        baseline -= blockHeight
    } else if (text.vAlign === 'center') {
        baseline -= blockHeight / 2
    }

    return baseline + lineSpacing * index
}

/**
 * Mirrors KiCad's small stroke-font baseline adjustment.
 * @param {object} text
 * @returns {number}
 */
function textStrokeBaselineFudge(text) {
    return textStrokeWidth(text) * kicadStrokeBaselineFudgeRatio
}

/**
 * Mirrors KiCad's small stroke-font horizontal adjustment.
 * @param {object} text
 * @returns {number}
 */
function textStrokeHorizontalFudge(text) {
    return textStrokeWidth(text) / 1.52
}

/**
 * Resolves KiCad text stroke width.
 * @param {object} text
 * @returns {number}
 */
function textStrokeWidth(text) {
    return Math.max(Number(text.thickness) || 0.12, 0.01)
}

/**
 * Builds footprint metadata attributes for SVG primitives.
 * @param {unknown} ownerId
 * @param {{ state: 'selected' | 'hover', color: string } | null} highlightState
 * @returns {string[]}
 */
function componentAttributeList(ownerId, highlightState) {
    const id = String(ownerId || '').trim()
    if (!id || id === 'board') return []

    const attributes = [`data-footprint-id="${escapeAttribute(id)}"`]
    if (highlightState) {
        attributes.push(`data-highlight-state="${highlightState.state}"`)
    }

    return attributes
}

/**
 * Resolves an automatic or explicit layer stroke width.
 * @param {{ borderWidth?: number | null }} style
 * @param {number} fallback
 * @returns {number}
 */
function resolveStrokeWidth(style, fallback) {
    if (style.borderWidth === null || style.borderWidth === undefined) {
        return fallback
    }

    return Math.max(Number(style.borderWidth) || 0, 0)
}

/**
 * Resolves automatic pad outline width without swallowing very thin SMD pads.
 * @param {{ width?: number, height?: number }} pad
 * @param {{ borderWidth?: number | null }} style
 * @returns {number}
 */
function resolvePadStrokeWidth(pad, style) {
    const requested = resolveStrokeWidth(style, defaultPadStrokeWidth)
    if (requested > defaultPadStrokeWidth) return requested

    const minDimension = Math.min(
        Math.max(Number(pad.width) || 0, 0),
        Math.max(Number(pad.height) || 0, 0)
    )
    if (minDimension <= 0) return requested

    return Math.min(requested, minDimension * 0.2)
}

/**
 * Builds optional stroke attributes for shapes with configurable borders.
 * @param {{ borderColor: string, borderWidth?: number | null }} style
 * @param {number} fallbackWidth
 * @returns {string}
 */
function strokeAttributes(style, fallbackWidth) {
    const strokeWidth = resolveStrokeWidth(style, fallbackWidth)
    if (strokeWidth <= 0) return ' stroke="none"'

    return ` stroke="${style.borderColor}" stroke-width="${formatNumber(strokeWidth)}" ${roundedStrokeAttributes}`
}

/**
 * Resolves SVG fill output for a layer style.
 * @param {{ fillColor: string }} style
 * @returns {string}
 */
function fillValue(style) {
    return style.fillColor
}

/**
 * Resolves SVG fill-opacity output for a layer style.
 * @param {{ fillOpacity?: number }} style
 * @returns {string}
 */
function fillOpacityAttribute(style) {
    const opacity = Number(style.fillOpacity)
    if (!Number.isFinite(opacity) || opacity >= 1) return ''

    return `fill-opacity="${formatNumber(Math.max(0, opacity))}"`
}

/**
 * Adds a leading space to an optional SVG attribute.
 * @param {string} attribute
 * @returns {string}
 */
function optionalAttribute(attribute) {
    return attribute ? ' ' + attribute : ''
}

/**
 * Returns drawing style by material.
 * @param {object} drawing
 * @param {Record<string, object>} layerStyles
 * @returns {{ name: string, stroke: string, fill: string, layerStyle: object } | null}
 */
function drawingStyle(drawing, layerStyles) {
    if (drawing.material === 'copper') {
        const layerStyle = drawing.fill ? layerStyles.zones : layerStyles.traces
        if (!layerStyle.visible) return null

        return {
            name: 'copper',
            stroke: layerStyle.borderColor,
            fill: fillValue(layerStyle),
            layerStyle
        }
    }

    const layerStyle = layerStyles.silkscreen
    if (!layerStyle.visible) return null

    return {
        name: 'silk',
        stroke: layerStyle.borderColor,
        fill: fillValue(layerStyle),
        layerStyle
    }
}

/**
 * Sorts zones below tracks, then silkscreen below pads/text.
 * @param {object} first
 * @param {object} second
 * @returns {number}
 */
function compareDrawingOrder(first, second) {
    return drawingOrder(first) - drawingOrder(second)
}

/**
 * Resolves drawing order.
 * @param {object} drawing
 * @returns {number}
 */
function drawingOrder(drawing) {
    if (drawing.type === 'zone') return 0
    if (drawing.type === 'segment') return 1
    if (drawing.type === 'via') return 2
    return 3
}

/**
 * Builds the SVG text transform, including KiCad mirrored bottom text.
 * @param {object} text
 * @returns {string}
 */
function textTransform(text) {
    if (!text.mirrored) {
        return `rotate(${formatNumber(-text.rotation)} ${formatNumber(text.x)} ${formatNumber(text.y)})`
    }

    return [
        `translate(${formatNumber(text.x)} ${formatNumber(text.y)})`,
        `rotate(${formatNumber(text.rotation)})`,
        'scale(-1 1)',
        `translate(${formatNumber(-text.x)} ${formatNumber(-text.y)})`
    ].join(' ')
}

/**
 * Converts points to an SVG path.
 * @param {{ x: number, y: number }[]} points
 * @param {boolean} close
 * @returns {string}
 */
function pathFromPoints(points, close) {
    if (!points.length) return ''
    const [first, ...rest] = points
    const commands = [`M ${formatNumber(first.x)} ${formatNumber(first.y)}`]
    rest.forEach((point) => {
        commands.push(`L ${formatNumber(point.x)} ${formatNumber(point.y)}`)
    })
    if (close) commands.push('Z')
    return commands.join(' ')
}

/**
 * Checks side visibility.
 * @param {{ side: string }} item
 * @param {'front' | 'back'} side
 * @returns {boolean}
 */
function isVisibleOnSide(item, side) {
    return item.side === 'both' || item.side === side
}

/**
 * Checks KiCad text visibility.
 * @param {{ visible?: boolean }} text
 * @returns {boolean}
 */
function isVisibleText(text) {
    return text.visible !== false
}

/**
 * Checks whether this is an assembly-excluded footprint reference.
 * @param {{ propertyName?: string, excludeFromPositionFiles?: boolean }} text
 * @returns {boolean}
 */
function isExcludedReferenceText(text) {
    return (
        text.excludeFromPositionFiles === true &&
        text.propertyName === 'Reference'
    )
}

/**
 * Checks whether a KiCad layer belongs in the visible board render.
 * @param {{ layer?: string }} item
 * @returns {boolean}
 */
function isRenderableBoardLayer(item) {
    return String(item.layer || '')
        .split(',')
        .some((layer) => isRenderableLayerName(layer.trim()))
}

/**
 * Checks a single KiCad layer name.
 * @param {string} layer
 * @returns {boolean}
 */
function isRenderableLayerName(layer) {
    return (
        layer.endsWith('.Cu') ||
        layer.endsWith('.Mask') ||
        layer.endsWith('.SilkS')
    )
}

/**
 * Formats a number for compact SVG output.
 * @param {number} value
 * @returns {string}
 */
function formatNumber(value) {
    return Number(value || 0)
        .toFixed(4)
        .replace(/\.?0+$/u, '')
}

/**
 * Escapes text content.
 * @param {unknown} value
 * @returns {string}
 */
function escapeText(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
}

/**
 * Escapes attribute values.
 * @param {unknown} value
 * @returns {string}
 */
function escapeAttribute(value) {
    return escapeText(value).replaceAll('"', '&quot;')
}
