// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { Geometry } from '../core/kicad/Geometry.mjs'
import { KicadArcGeometry } from '../core/kicad/KicadArcGeometry.mjs'
import { KicadStrokeFont } from './KicadStrokeFont.mjs'
import { PcbSvgAuxiliaryRenderer } from './PcbSvgAuxiliaryRenderer.mjs'
import { PcbSvgBoardOutlineBuilder } from './PcbSvgBoardOutlineBuilder.mjs'
import { defaultLayerStyles } from './PcbSvgLayerStyles.mjs'
import { PcbSvgPadShapeRenderer } from './PcbSvgPadShapeRenderer.mjs'
import {
    drawingMetadataAttributeList,
    padMetadataAttributeList
} from './PcbSvgMetadata.mjs'
import { PcbSvgSemanticMetadata } from './PcbSvgSemanticMetadata.mjs'
import { PcbSvgVisibility } from './PcbSvgVisibility.mjs'
import { pathFromContours, pathFromPoints } from './PcbSvgPathBuilder.mjs'

const kicadTextLineSpacingRatio = 1.61
const kicadFirstLineHeightRatio = 1.17
const kicadStrokeBaselineFudgeRatio = 0.052
const defaultPadStrokeWidth = 0.16
const roundedStrokeAttributes = 'stroke-linecap="round" stroke-linejoin="round"'

/**
 * Renders normalized KiCad boards into manual-style SVG.
 */
export class PcbSvgRenderer {
    /**
     * Renders a PCB.
     * @param {object | null} board
     * @param {{ side?: 'front' | 'back' }} [options]
     * @returns {string}
     */
    static render(board, options = {}) {
        const renderBoardModel = PcbSvgRenderer.resolveBoardModel(board)
        if (!renderBoardModel) return PcbSvgRenderer.renderEmpty()

        const side =
            options.side ||
            PcbSvgRenderer.resolveRenderSide(board, renderBoardModel)
        const includeOppositeCopper = options.includeOppositeCopper === true
        const layerStyles = defaultLayerStyles()
        const viewBounds = Geometry.expandBounds(renderBoardModel.bounds, 4)
        const visiblePads = renderBoardModel.pads.filter((pad) =>
            PcbSvgVisibility.isVisibleOnSide(pad, side)
        )
        const visibleDrawings = renderBoardModel.drawings.filter((drawing) => {
            return (
                (PcbSvgVisibility.isVisibleOnSide(drawing, side) &&
                    PcbSvgVisibility.isRenderableBoardLayer(drawing)) ||
                (includeOppositeCopper &&
                    PcbSvgVisibility.isOppositeSideCopper(drawing, side))
            )
        })
        const visibleCopperDrawings = visibleDrawings.filter((drawing) =>
            isCopperDrawing(drawing)
        )
        const visibleSilkscreenDrawings = visibleDrawings.filter(
            (drawing) => !isCopperDrawing(drawing)
        )
        const visibleTexts = renderBoardModel.texts.filter((text) => {
            return (
                PcbSvgVisibility.isVisibleOnSide(text, side) &&
                PcbSvgVisibility.isVisibleText(text) &&
                !PcbSvgVisibility.isExcludedReferenceText(text) &&
                PcbSvgVisibility.isRenderableBoardLayer(text)
            )
        })
        const visibleViaDrills = visibleDrawings.filter((drawing) => {
            return drawing.type === 'via' && drawing.drill
        })
        const semanticContext = PcbSvgSemanticMetadata.buildContext(
            renderBoardModel,
            {
                viewKind: options.viewKind || 'top-composite',
                layerView: options.layerView || null,
                includedLayerKeys: options.includedLayerKeys
            }
        )
        const rootAttributes =
            PcbSvgSemanticMetadata.rootAttributes(semanticContext)

        return [
            `<svg xmlns="http://www.w3.org/2000/svg" class="pcb-svg" viewBox="${formatNumber(viewBounds.minX)} ${formatNumber(viewBounds.minY)} ${formatNumber(viewBounds.width)} ${formatNumber(viewBounds.height)}" role="img" aria-label="${escapeAttribute(renderBoardModel.title || renderBoardModel.fileName || 'PCB')}"${optionalAttribute(rootAttributes)}>`,
            PcbSvgSemanticMetadata.metadataElement(semanticContext),
            `<g class="pcb-scene"${sceneTransformAttribute(renderBoardModel.bounds, side)}>`,
            renderBoard(
                renderBoardModel,
                viewBounds,
                layerStyles,
                semanticContext
            ),
            visibleCopperDrawings
                .sort(compareDrawingOrder)
                .map((drawing) =>
                    renderDrawing(drawing, layerStyles, semanticContext)
                )
                .join(''),
            visibleSilkscreenDrawings
                .sort(compareDrawingOrder)
                .map((drawing) =>
                    renderDrawing(drawing, layerStyles, semanticContext)
                )
                .join(''),
            visibleTexts
                .map((text) => renderText(text, layerStyles, semanticContext))
                .join(''),
            visiblePads
                .map((pad) => renderPad(pad, layerStyles, semanticContext))
                .join(''),
            visibleViaDrills
                .map((drawing) =>
                    renderViaDrill(drawing, layerStyles, semanticContext)
                )
                .join(''),
            visiblePads
                .map((pad) => renderPadDrill(pad, layerStyles, semanticContext))
                .join(''),
            '</g>',
            '</svg>'
        ].join('')
    }

    /**
     * Renders deterministic one-layer PCB SVG exports.
     * @param {object} board Board or wrapped document model.
     * @returns {object[]}
     */
    static renderLayerSvgs(board) {
        const renderBoardModel = PcbSvgRenderer.resolveBoardModel(board)
        if (!renderBoardModel) return []

        return PcbSvgSemanticMetadata.displayLayerDescriptors(
            renderBoardModel
        ).map((layerView) => {
            const filtered = PcbSvgSemanticMetadata.filterBoardForLayer(
                renderBoardModel,
                layerView
            )
            return {
                ...layerView,
                svg: PcbSvgRenderer.render(filtered, {
                    viewKind: 'layer',
                    layerView,
                    includedLayerKeys: [layerView.layerKey]
                })
            }
        })
    }

    /**
     * Resolves a raw KiCad board from either raw or wrapped document models.
     * @param {object | null} value Input board or document model.
     * @returns {object | null}
     */
    static resolveBoardModel(value) {
        if (!value) return null
        if (value?.pcb?.kicadBoard) return value.pcb.kicadBoard
        return value
    }

    /**
     * Resolves the side requested by either options or a side-resolved model.
     * @param {object | null} value Original renderer input.
     * @param {object | null} board Resolved raw board model.
     * @returns {'front' | 'back'}
     */
    static resolveRenderSide(value, board) {
        if (value?.renderSide === 'back' || board?.renderSide === 'back') {
            return 'back'
        }
        return 'front'
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
function renderBoard(board, bounds, layerStyles, semanticContext) {
    const boardStyle = layerStyles.board
    const edgeStyle = layerStyles.edgeCuts
    if (!boardStyle.visible && !edgeStyle.visible) return ''

    const edgeOutline = PcbSvgBoardOutlineBuilder.build(board.outlines)
    const polygonOutlines = board.outlines.filter(
        (outline) => outline.type === 'polygon'
    )
    const fill = boardStyle.visible ? fillValue(boardStyle) : 'none'
    const fillOpacity = boardStyle.visible
        ? fillOpacityAttribute(boardStyle)
        : ''
    const stroke = edgeStyle.visible ? edgeStyle.borderColor : 'none'

    if (edgeOutline) {
        const semanticAttributes =
            PcbSvgSemanticMetadata.boardAttributes(semanticContext)
        return `<path class="pcb-board"${optionalAttribute(semanticAttributes)} d="${edgeOutline.d}" fill="${fill}"${optionalAttribute(fillOpacity)} stroke="${stroke}" stroke-width="${formatNumber(resolveStrokeWidth(edgeStyle, edgeOutline.strokeWidth))}" ${roundedStrokeAttributes} vector-effect="non-scaling-stroke"/>`
    }

    if (polygonOutlines.length === 0) {
        const semanticAttributes =
            PcbSvgSemanticMetadata.boardAttributes(semanticContext)
        return `<rect class="pcb-board"${optionalAttribute(semanticAttributes)} x="${formatNumber(bounds.minX)}" y="${formatNumber(bounds.minY)}" width="${formatNumber(bounds.width)}" height="${formatNumber(bounds.height)}" fill="${fill}"${optionalAttribute(fillOpacity)} stroke="${stroke}" stroke-width="${formatNumber(resolveStrokeWidth(edgeStyle, 0.12))}" ${roundedStrokeAttributes}/>`
    }

    return polygonOutlines
        .map((outline) => {
            const strokeWidth = Math.max(0.08, outline.strokeWidth || 0.08)
            const semanticAttributes =
                PcbSvgSemanticMetadata.boardAttributes(semanticContext)
            return `<path class="pcb-board"${optionalAttribute(semanticAttributes)} d="${pathFromPoints(outline.points, true)}" fill="${fill}"${optionalAttribute(fillOpacity)} stroke="${stroke}" stroke-width="${formatNumber(resolveStrokeWidth(edgeStyle, strokeWidth))}" ${roundedStrokeAttributes} vector-effect="non-scaling-stroke"/>`
        })
        .join('')
}

/**
 * Renders a drawing primitive.
 * @param {object} drawing
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderDrawing(drawing, layerStyles, semanticContext) {
    if (drawing.type === 'segment') {
        return renderSegment(drawing, layerStyles, semanticContext)
    }

    if (drawing.type === 'via') {
        return renderVia(drawing, layerStyles, semanticContext)
    }

    if (drawing.type === 'zone') {
        return renderZone(drawing, layerStyles, semanticContext)
    }

    if (drawing.type === 'arc' && drawing.sourceType === 'arc') {
        return renderTrackArc(drawing, layerStyles, semanticContext)
    }

    const style = drawingStyle(drawing, layerStyles)
    if (!style) return ''

    const strokeWidth = resolveStrokeWidth(
        style.layerStyle,
        Number(drawing.strokeWidth) || 0
    )
    const stroke = drawing.fill && strokeWidth <= 0.01 ? 'none' : style.stroke
    const fill = drawing.fill ? style.fill : 'none'
    const fillOpacity = drawing.fill
        ? optionalAttribute(fillOpacityAttribute(style.layerStyle))
        : ''
    const base = [
        `class="pcb-drawing pcb-drawing--${style.name}"`,
        ...drawingMetadataAttributeList(drawing),
        PcbSvgSemanticMetadata.primitiveAttributes(
            drawing,
            'drawing',
            semanticContext
        ),
        ...componentAttributeList(drawing.ownerId),
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

    if (drawing.type === 'curve') {
        return `<path ${base} d="${curvePath(drawing)}" fill="none"/>`
    }

    if (drawing.type === 'dimension') {
        return `<path ${base} d="${pathFromPoints(drawing.points, false)}" fill="none"/>`
    }

    if (drawing.type === 'polygon') {
        return `<path ${base} d="${pathFromPoints(drawing.points, true)}" fill="${fill}"${fillOpacity}/>`
    }

    if (drawing.type === 'image') {
        return PcbSvgAuxiliaryRenderer.renderImagePlaceholder(drawing, style)
    }

    if (drawing.type === 'barcode') {
        return PcbSvgAuxiliaryRenderer.renderBarcode(drawing, style)
    }

    if (drawing.type === 'target') {
        return PcbSvgAuxiliaryRenderer.renderTarget(drawing, style)
    }

    if (drawing.type === 'point') {
        return PcbSvgAuxiliaryRenderer.renderPoint(drawing, style)
    }

    return ''
}

/**
 * Renders one copper track segment.
 * @param {object} segment
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderSegment(segment, layerStyles, semanticContext) {
    const style = layerStyles.traces
    if (!style.visible) return ''

    const metadata = [
        ...drawingMetadataAttributeList(segment),
        PcbSvgSemanticMetadata.primitiveAttributes(
            segment,
            'track',
            semanticContext
        )
    ].join(' ')
    const strokeWidth = resolveStrokeWidth(
        style,
        Math.max(segment.strokeWidth || 0.2, 0.06)
    )
    return `<line class="pcb-segment"${optionalAttribute(metadata)} stroke="${style.borderColor}" stroke-width="${formatNumber(strokeWidth)}" ${roundedStrokeAttributes} x1="${formatNumber(segment.start.x)}" y1="${formatNumber(segment.start.y)}" x2="${formatNumber(segment.end.x)}" y2="${formatNumber(segment.end.y)}"/>`
}

/**
 * Renders one routed copper track arc.
 * @param {object} arc
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderTrackArc(arc, layerStyles, semanticContext) {
    const style = layerStyles.traces
    if (!style.visible) return ''

    const metadata = [
        ...drawingMetadataAttributeList(arc),
        PcbSvgSemanticMetadata.primitiveAttributes(arc, 'arc', semanticContext)
    ].join(' ')
    const strokeWidth = resolveStrokeWidth(
        style,
        Math.max(arc.strokeWidth || 0.2, 0.06)
    )
    return `<path class="pcb-arc"${optionalAttribute(metadata)} stroke="${style.borderColor}" stroke-width="${formatNumber(strokeWidth)}" ${roundedStrokeAttributes} d="${arcPath(arc)}" fill="none"/>`
}

/**
 * Renders one copper via.
 * @param {object} via
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderVia(via, layerStyles, semanticContext) {
    const style = layerStyles.vias
    if (!style.visible) return ''

    const metadata = [
        ...drawingMetadataAttributeList(via),
        PcbSvgSemanticMetadata.primitiveAttributes(via, 'via', semanticContext)
    ].join(' ')
    return `<circle class="pcb-via"${optionalAttribute(metadata)} cx="${formatNumber(via.x)}" cy="${formatNumber(via.y)}" r="${formatNumber(via.size / 2)}" fill="${fillValue(style)}"${optionalAttribute(fillOpacityAttribute(style))} stroke="${style.borderColor}" stroke-width="${formatNumber(resolveStrokeWidth(style, 0.06))}" vector-effect="non-scaling-stroke"/>`
}

/**
 * Renders one via drill as a physical board cutout.
 * @param {object} via
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderViaDrill(via, layerStyles, semanticContext) {
    const style = layerStyles.drills
    if (!style.visible) return ''

    const metadata = [
        ...drawingMetadataAttributeList(via),
        PcbSvgSemanticMetadata.primitiveAttributes(
            via,
            'via-hole',
            semanticContext,
            {
                'data-hole-owner': 'via',
                'data-hole-kind': 'via',
                'data-drill-render-state': 'open'
            }
        )
    ].join(' ')
    return `<circle class="pcb-via-drill"${optionalAttribute(metadata)} cx="${formatNumber(via.x)}" cy="${formatNumber(via.y)}" r="${formatNumber(via.drill / 2)}" fill="${fillValue(style)}"${optionalAttribute(fillOpacityAttribute(style))}${strokeAttributes(style, 0)}/>`
}

/**
 * Renders one filled copper zone.
 * @param {object} zone
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderZone(zone, layerStyles, semanticContext) {
    const style = layerStyles.zones
    if (!style.visible) return ''

    const metadata = [
        ...drawingMetadataAttributeList(zone),
        PcbSvgSemanticMetadata.primitiveAttributes(
            zone,
            'zone',
            semanticContext
        )
    ].join(' ')
    const contours =
        Array.isArray(zone.contours) && zone.contours.length > 0
            ? zone.contours
            : [zone.points || []]
    const fillRule = contours.length > 1 ? ' fill-rule="evenodd"' : ''
    return `<path class="pcb-zone"${optionalAttribute(metadata)} d="${pathFromContours(contours)}" fill="${fillValue(style)}"${optionalAttribute(fillOpacityAttribute(style))}${fillRule}${strokeAttributes(style, 0)}/>`
}

/**
 * Renders one pad.
 * @param {object} pad
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderPad(pad, layerStyles, semanticContext) {
    const style = layerStyles.pads
    if (!style.visible) return ''

    const attributes = [
        'class="pcb-pad"',
        ...padMetadataAttributeList(pad),
        PcbSvgSemanticMetadata.primitiveAttributes(pad, 'pad', semanticContext),
        ...componentAttributeList(pad.footprintId),
        `fill="${fillValue(style)}"`,
        fillOpacityAttribute(style),
        `stroke="${style.borderColor}"`,
        `stroke-width="${formatNumber(resolvePadStrokeWidth(pad, style))}"`,
        'vector-effect="non-scaling-stroke"'
    ]
        .filter(Boolean)
        .join(' ')
    const transform = `transform="rotate(${formatNumber(pad.rotation)} ${formatNumber(pad.x)} ${formatNumber(pad.y)})"`
    return PcbSvgPadShapeRenderer.renderPadShape(pad, attributes, transform)
}

/**
 * Renders one pad drill as a physical board cutout.
 * @param {object} pad
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderPadDrill(pad, layerStyles, semanticContext) {
    if (!pad.drill) return ''
    const style = layerStyles.drills
    if (!style.visible) return ''

    const metadata = [
        ...padMetadataAttributeList(pad),
        PcbSvgSemanticMetadata.primitiveAttributes(
            pad,
            'pad-hole',
            semanticContext,
            {
                'data-hole-owner': 'pad',
                'data-hole-kind': 'pad',
                'data-drill-render-state': 'open'
            }
        ),
        ...componentAttributeList(pad.footprintId)
    ].join(' ')
    const attributes = [
        'class="pcb-pad-drill"',
        metadata,
        `fill="${fillValue(style)}"`,
        fillOpacityAttribute(style),
        strokeAttributes(style, 0.08).trim(),
        'vector-effect="non-scaling-stroke"'
    ]
        .filter(Boolean)
        .join(' ')
    return PcbSvgPadShapeRenderer.renderPadDrillShape(pad, attributes)
}

/**
 * Renders text.
 * @param {object} text
 * @param {Record<string, object>} layerStyles
 * @returns {string}
 */
function renderText(text, layerStyles, semanticContext) {
    const style = layerStyles.silkscreen
    if (!style.visible) return ''

    const lines = String(text.value || '').split('\n')
    const lineSpacing = textLineSpacing(text)
    const strokeWidth = resolveStrokeWidth(style, textStrokeWidth(text))
    const attrs = [
        'class="pcb-label"',
        ...drawingMetadataAttributeList(text),
        PcbSvgSemanticMetadata.primitiveAttributes(
            text,
            'text',
            semanticContext
        ),
        ...componentAttributeList(text.ownerId),
        `aria-label="${escapeAttribute(text.value)}"`,
        'fill="none"',
        `stroke="${style.borderColor}"`,
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
    const layout = KicadStrokeFont.layoutLine(line, {
        x: 0,
        y: 0,
        sizeX,
        sizeY
    })
    const x = textLineX(text, layout.width)
    const y = textLineY(text, index, lineCount, lineSpacing)
    const strokes = layout.strokes.map((stroke) =>
        stroke.map((point) => ({ x: point.x + x, y: point.y + y }))
    )
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
    const arc = KicadArcGeometry.fromThreePoints(
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
 * Converts a cubic curve to SVG path syntax.
 * @param {{ points: object[] }} drawing
 * @returns {string}
 */
function curvePath(drawing) {
    const [start, firstControl, secondControl, end] = drawing.points || []
    if (!start || !firstControl || !secondControl || !end) {
        return pathFromPoints(drawing.points || [], false)
    }

    return [
        'M',
        formatNumber(start.x),
        formatNumber(start.y),
        'C',
        formatNumber(firstControl.x),
        formatNumber(firstControl.y),
        formatNumber(secondControl.x),
        formatNumber(secondControl.y),
        formatNumber(end.x),
        formatNumber(end.y)
    ].join(' ')
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
 * @returns {string[]}
 */
function componentAttributeList(ownerId) {
    const id = String(ownerId || '').trim()
    if (!id || id === 'board') return []

    return [`data-footprint-id="${escapeAttribute(id)}"`]
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
    if (isCopperDrawing(drawing)) {
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
 * Checks whether one drawing belongs to a copper visual pass.
 * @param {object} drawing Drawing primitive.
 * @returns {boolean}
 */
function isCopperDrawing(drawing) {
    return (
        drawing.material === 'copper' ||
        String(drawing.layer || '')
            .split(',')
            .some((layer) => layer.trim().endsWith('.Cu'))
    )
}

/**
 * Sorts zones below tracks within each drawing pass.
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
