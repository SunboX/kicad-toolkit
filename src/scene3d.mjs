// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadArcGeometry } from './core/kicad/KicadArcGeometry.mjs'
import { PcbScene3dLayerMapper } from './PcbScene3dLayerMapper.mjs'
import { PcbScene3dCopperTextBuilder } from './PcbScene3dCopperTextBuilder.mjs'
import { PcbScene3dDrillCutoutBuilder } from './PcbScene3dDrillCutoutBuilder.mjs'
import { PcbScene3dExternalPlacementBuilder } from './PcbScene3dExternalPlacementBuilder.mjs'
import { PcbScene3dPackages } from './PcbScene3dPackages.mjs'
import { PcbScene3dSilkscreenCutoutBuilder } from './PcbScene3dSilkscreenCutoutBuilder.mjs'
import { KicadStrokeFont } from './ui/KicadStrokeFont.mjs'

const milsPerMillimeter = 1000 / 25.4
const kicadTextLineSpacingRatio = 1.61
const kicadFirstLineHeightRatio = 1.17
const kicadStrokeBaselineFudgeRatio = 0.052

export { PcbScene3dPackages } from './PcbScene3dPackages.mjs'
export { PcbScene3dTextBoxLayoutResolver } from './PcbScene3dTextBoxLayoutResolver.mjs'

/**
 * Builds data-only 3D scene descriptions for KiCad PCB documents.
 */
export class PcbScene3dBuilder {
    /**
     * Builds a deterministic scene description without depending on Three.js.
     * @param {object} documentModel Normalized KiCad PCB document.
     * @param {object} [options] Scene build options.
     * @returns {object}
     */
    static build(documentModel, options = {}) {
        const pcb = documentModel?.pcb || {}
        const boardOutline = pcb.boardOutline || {}
        const thicknessMil = Number(options.boardThicknessMil || 63) || 63
        const registry =
            options.modelRegistry instanceof PcbScene3dModelRegistry
                ? options.modelRegistry
                : new PcbScene3dModelRegistry({
                      sessionAssets: options.sessionAssets || []
                  })
        const board = {
            widthMil: Number(boardOutline.widthMil || 0),
            heightMil: Number(boardOutline.heightMil || 0),
            thicknessMil,
            minX: Number(boardOutline.minX || 0),
            minY: Number(boardOutline.minY || 0),
            centerX:
                Number(boardOutline.minX || 0) +
                Number(boardOutline.widthMil || 0) / 2,
            centerY:
                Number(boardOutline.minY || 0) +
                Number(boardOutline.heightMil || 0) / 2,
            segments: []
        }
        board.segments = PcbScene3dLayerMapper.boardSegments(
            boardOutline.segments || [],
            board
        )
        const pads = (pcb.pads || []).map((pad) =>
            PcbScene3dLayerMapper.pad(pad, board)
        )
        const tracks = (pcb.tracks || []).map((track) =>
            PcbScene3dLayerMapper.track(track, board)
        )
        const arcs = (pcb.arcs || []).map((arc) =>
            PcbScene3dLayerMapper.arc(arc, board)
        )
        const fills = (pcb.fills || []).map((fill) =>
            PcbScene3dLayerMapper.fill(fill, board)
        )
        const vias = (pcb.vias || []).map((via) =>
            PcbScene3dLayerMapper.via(via, board)
        )
        const polygons = (pcb.polygons || []).map((polygon) =>
            PcbScene3dLayerMapper.polygon(polygon, board)
        )
        const texts = (pcb.texts || []).map((text) =>
            PcbScene3dLayerMapper.text(text, board)
        )
        const padsByFootprintId =
            PcbScene3dBuilder.#groupPadsByFootprintId(pads)
        const components = (pcb.components || [])
            .filter(
                (component) =>
                    !PcbScene3dBuilder.#isHoleOnlyFootprint(
                        component,
                        padsByFootprintId
                    )
            )
            .map((component) => {
                const mountSide =
                    String(component.layer || 'TOP').toUpperCase() === 'BOTTOM'
                        ? 'bottom'
                        : 'top'
                const body = PcbScene3dPackages.resolve(component, {
                    width: Number(component.width || 0),
                    depth: Number(component.depth || 0)
                })
                const z =
                    mountSide === 'bottom'
                        ? -(thicknessMil / 2 + body.sizeMil.height / 2)
                        : thicknessMil / 2 + body.sizeMil.height / 2

                return {
                    designator: String(component.designator || ''),
                    mountSide,
                    rotationDeg: Number(component.rotation || 0),
                    positionMil: {
                        x: Number(component.x || 0) - board.centerX,
                        y: board.centerY - Number(component.y || 0),
                        z
                    },
                    boardPositionMil: {
                        x: Number(component.x || 0),
                        y: Number(component.y || 0),
                        z: 0
                    },
                    pattern: String(component.pattern || ''),
                    source: String(component.source || ''),
                    modelName: String(component.modelName || ''),
                    modelPath: String(component.modelPath || ''),
                    modelTransform: component.modelTransform || null,
                    body,
                    externalModel: registry.resolveComponentModel(component)
                }
            })
        const silkscreen = buildKicadSilkscreenDetail(
            pcb.kicadBoard,
            board,
            pads,
            vias
        )
        const externalPlacements = PcbScene3dExternalPlacementBuilder.build(
            components,
            board
        )
        const copperTexts = PcbScene3dCopperTextBuilder.build(
            documentModel,
            board
        )

        return {
            sourceFormat: documentModel?.sourceFormat || 'kicad',
            coordinateSystem: 'kicad-3d-y-up',
            board,
            layers: pcb.layers || [],
            components,
            pads,
            tracks,
            vias,
            zones: polygons,
            texts,
            externalPlacements,
            detail: {
                pads,
                tracks,
                arcs,
                fills,
                vias,
                polygons,
                copperTexts,
                silkscreen
            },
            externalModels: components
                .map((component) => component.externalModel)
                .filter(Boolean)
        }
    }

    /**
     * Groups mapped pad detail by owning footprint id.
     * @param {object[]} pads Scene pad detail rows.
     * @returns {Map<string, object[]>}
     */
    static #groupPadsByFootprintId(pads) {
        const padsByFootprintId = new Map()

        for (const pad of pads || []) {
            const footprintId = String(pad?.footprintId || '').trim()
            if (!footprintId) {
                continue
            }

            if (!padsByFootprintId.has(footprintId)) {
                padsByFootprintId.set(footprintId, [])
            }
            padsByFootprintId.get(footprintId)?.push(pad)
        }

        return padsByFootprintId
    }

    /**
     * Checks whether one footprint is only represented by drill holes.
     * @param {{ footprintId?: string }} component Component model.
     * @param {Map<string, object[]>} padsByFootprintId Pads grouped by footprint.
     * @returns {boolean}
     */
    static #isHoleOnlyFootprint(component, padsByFootprintId) {
        const footprintId = String(component?.footprintId || '').trim()
        const componentPads = padsByFootprintId.get(footprintId) || []

        return (
            componentPads.length > 0 &&
            componentPads.every((pad) => PcbScene3dBuilder.#isDrillOnlyPad(pad))
        )
    }

    /**
     * Checks whether one pad contributes only a non-plated board drill.
     * @param {object} pad Pad detail row.
     * @returns {boolean}
     */
    static #isDrillOnlyPad(pad) {
        const holeDiameter = Number(pad?.holeDiameter || 0)

        return (
            holeDiameter > 0 &&
            pad?.isPlated !== true &&
            !PcbScene3dBuilder.#hasPadCopperAnnulus(pad, holeDiameter)
        )
    }

    /**
     * Checks whether a pad has copper larger than its drill aperture.
     * @param {object} pad Pad detail row.
     * @param {number} holeDiameter Drill diameter in mils.
     * @returns {boolean}
     */
    static #hasPadCopperAnnulus(pad, holeDiameter) {
        return [
            pad?.sizeTopX,
            pad?.sizeTopY,
            pad?.sizeMidX,
            pad?.sizeMidY,
            pad?.sizeBottomX,
            pad?.sizeBottomY
        ].some((size) => Number(size || 0) > holeDiameter + 0.001)
    }
}

/**
 * Async preparation facade matching the Altium scene3d contract.
 */
export class PcbScene3dScenePreparator {
    /**
     * Prepares a scene description.
     * @param {object} documentModel Normalized KiCad PCB document.
     * @param {object} [options] Preparation options.
     * @returns {Promise<object>}
     */
    static async prepare(documentModel, options = {}) {
        return PcbScene3dBuilder.build(documentModel, options)
    }
}

/**
 * Resolves companion 3D model assets for KiCad footprints.
 */
export class PcbScene3dModelRegistry {
    #assets

    /**
     * Creates a model registry.
     * @param {{ sessionAssets?: object[] }} [options] Registry options.
     */
    constructor(options = {}) {
        this.#assets = Array.from(options.sessionAssets || [])
    }

    /**
     * Creates a model registry from session files.
     * @param {object[]} sessionAssets Session assets.
     * @returns {PcbScene3dModelRegistry}
     */
    static create(sessionAssets) {
        return new PcbScene3dModelRegistry({ sessionAssets })
    }

    /**
     * Returns the currently registered session assets.
     * @returns {object[]}
     */
    get assets() {
        return [...this.#assets]
    }

    /**
     * Finds a companion asset for a component.
     * @param {object} component Component placement.
     * @returns {object | null}
     */
    resolveForComponent(component) {
        const keys = [
            component?.modelName,
            component?.modelPath,
            component?.pattern,
            component?.source,
            component?.description
        ]
            .filter(Boolean)
            .map(normalizeMatchKey)

        if (!keys.length) return null

        return (
            this.#assets.find((asset) => {
                const assetName = normalizeMatchKey(
                    asset.name || asset.path || ''
                )
                return keys.some((key) => {
                    return (
                        assetName === key ||
                        assetName.startsWith(key + '.') ||
                        assetName.includes('/' + key + '.')
                    )
                })
            }) || null
        )
    }

    /**
     * Resolves a component model using the Altium-style method name.
     * @param {object} component Component placement.
     * @returns {object | null}
     */
    resolveComponentModel(component) {
        return this.resolveForComponent(component)
    }

    /**
     * KiCad normalized models do not yet expose explicit body-model records.
     * @returns {null}
     */
    resolveComponentBodyModel() {
        return null
    }
}

/**
 * Renders compact scene summary markup.
 */
export class PcbScene3dSummaryRenderer {
    /**
     * Renders a human-readable scene summary.
     * @param {object} documentModel Normalized KiCad PCB document.
     * @returns {string}
     */
    static render(documentModel) {
        const pcb = documentModel?.pcb || {}
        const outline = pcb.boardOutline || {}
        const componentCount = (pcb.components || []).length

        return [
            '<section class="kicad-scene3d-summary">',
            '<h2>KiCad 3D scene</h2>',
            '<dl>',
            `<dt>Components</dt><dd>${componentCount}</dd>`,
            `<dt>Width</dt><dd>${escapeHtml(String(Math.round(outline.widthMil || 0)))} mil</dd>`,
            `<dt>Height</dt><dd>${escapeHtml(String(Math.round(outline.heightMil || 0)))} mil</dd>`,
            '</dl>',
            '</section>'
        ].join('')
    }
}

/**
 * Normalizes asset and component matching keys.
 * @param {string} value Source value.
 * @returns {string}
 */
function normalizeMatchKey(value) {
    return String(value || '')
        .replace(/\\/g, '/')
        .split('/')
        .at(-1)
        .replace(/\.(step|stp|wrl|vrml)$/i, '')
        .toLowerCase()
}

/**
 * Builds 3D silkscreen detail from KiCad drawing primitives.
 * @param {object | undefined} kicadBoard Raw parsed KiCad board model.
 * @param {{ centerY: number }} board Board placement metadata in mils.
 * @returns {{ top: { fills: object[], tracks: object[], arcs: object[], drillCutouts: object[], copperCutouts: object[] }, bottom: { fills: object[], tracks: object[], arcs: object[], drillCutouts: object[], copperCutouts: object[] } }}
 */
function buildKicadSilkscreenDetail(kicadBoard, board, pads = [], vias = []) {
    const silkscreen = emptySilkscreenDetail()
    const drawings = Array.isArray(kicadBoard?.drawings)
        ? kicadBoard.drawings
        : []
    const texts = Array.isArray(kicadBoard?.texts) ? kicadBoard.texts : []

    drawings.forEach((drawing) => {
        const sideName = resolveSilkscreenSide(drawing)
        if (!sideName) {
            return
        }

        buildKicadSilkscreenTracks(drawing).forEach((track) =>
            silkscreen[sideName].tracks.push(
                PcbScene3dLayerMapper.silkscreenTrack(track, board)
            )
        )

        const arc = buildKicadSilkscreenArc(drawing)
        if (arc) {
            silkscreen[sideName].arcs.push(
                PcbScene3dLayerMapper.silkscreenArc(arc, board)
            )
        }

        const fill = buildKicadSilkscreenFill(drawing)
        if (fill) {
            silkscreen[sideName].fills.push(
                PcbScene3dLayerMapper.silkscreenFill(fill, board)
            )
        }
    })

    texts.forEach((text) => {
        const sideName = resolveSilkscreenSide(text)
        if (!sideName) {
            return
        }

        buildKicadSilkscreenTextTracks(text).forEach((track) =>
            silkscreen[sideName].tracks.push(
                PcbScene3dLayerMapper.silkscreenTrack(track, board)
            )
        )
    })

    const drillCutouts = PcbScene3dDrillCutoutBuilder.buildCutouts(pads, vias)
    const topCopperCutouts = PcbScene3dSilkscreenCutoutBuilder.buildSideCutouts(
        pads,
        vias,
        'top'
    )
    const bottomCopperCutouts =
        PcbScene3dSilkscreenCutoutBuilder.buildSideCutouts(pads, vias, 'bottom')
    silkscreen.top.drillCutouts = drillCutouts.map((cutout) => cutout.points)
    silkscreen.bottom.drillCutouts = drillCutouts.map((cutout) => cutout.points)
    silkscreen.top.copperCutouts = topCopperCutouts.map(
        (cutout) => cutout.points
    )
    silkscreen.bottom.copperCutouts = bottomCopperCutouts.map(
        (cutout) => cutout.points
    )
    silkscreen.top.fills = PcbScene3dDrillCutoutBuilder.clipFills(
        silkscreen.top.fills,
        drillCutouts.concat(topCopperCutouts)
    )
    silkscreen.bottom.fills = PcbScene3dDrillCutoutBuilder.clipFills(
        silkscreen.bottom.fills,
        drillCutouts.concat(bottomCopperCutouts)
    )

    return silkscreen
}

/**
 * Builds an empty silkscreen detail container.
 * @returns {{ top: { fills: object[], tracks: object[], arcs: object[], drillCutouts: object[], copperCutouts: object[] }, bottom: { fills: object[], tracks: object[], arcs: object[], drillCutouts: object[], copperCutouts: object[] } }}
 */
function emptySilkscreenDetail() {
    return {
        top: {
            fills: [],
            tracks: [],
            arcs: [],
            drillCutouts: [],
            copperCutouts: []
        },
        bottom: {
            fills: [],
            tracks: [],
            arcs: [],
            drillCutouts: [],
            copperCutouts: []
        }
    }
}

/**
 * Resolves a KiCad drawing to a top or bottom silkscreen side.
 * @param {object} drawing Drawing primitive.
 * @returns {'top' | 'bottom' | ''}
 */
function resolveSilkscreenSide(drawing) {
    const layer = String(drawing?.layer || '').toUpperCase()

    if (layer === 'F.SILKS') {
        return 'top'
    }

    if (layer === 'B.SILKS') {
        return 'bottom'
    }

    return ''
}

/**
 * Builds stroke-style silkscreen tracks from one drawing.
 * @param {object} drawing Drawing primitive.
 * @returns {object[]}
 */
function buildKicadSilkscreenTracks(drawing) {
    const type = String(drawing?.type || '').toLowerCase()

    if (
        (type === 'line' || type === 'segment') &&
        drawing.start &&
        drawing.end
    ) {
        return [buildSilkscreenTrack(drawing.start, drawing.end, drawing)]
    }

    if (type === 'rect' && drawing.start && drawing.end && !drawing.fill) {
        const bounds = drawingBounds([drawing.start, drawing.end])
        if (!bounds) {
            return []
        }

        return [
            buildSilkscreenTrack(
                { x: bounds.minX, y: bounds.minY },
                { x: bounds.maxX, y: bounds.minY },
                drawing
            ),
            buildSilkscreenTrack(
                { x: bounds.maxX, y: bounds.minY },
                { x: bounds.maxX, y: bounds.maxY },
                drawing
            ),
            buildSilkscreenTrack(
                { x: bounds.maxX, y: bounds.maxY },
                { x: bounds.minX, y: bounds.maxY },
                drawing
            ),
            buildSilkscreenTrack(
                { x: bounds.minX, y: bounds.maxY },
                { x: bounds.minX, y: bounds.minY },
                drawing
            )
        ]
    }

    if (type === 'polygon' && Array.isArray(drawing.points) && !drawing.fill) {
        return buildPolygonSilkscreenTracks(drawing)
    }

    return []
}

/**
 * Builds KiCad stroke-font text as silkscreen tracks.
 * @param {object} text Text primitive.
 * @returns {object[]}
 */
function buildKicadSilkscreenTextTracks(text) {
    if (!isVisibleSilkscreenText(text)) {
        return []
    }

    const width = textStrokeWidth(text)
    return textStrokes(text).flatMap((stroke) => {
        const tracks = []

        for (let index = 1; index < stroke.length; index += 1) {
            tracks.push({
                x1: toMil(stroke[index - 1].x),
                y1: toMil(stroke[index - 1].y),
                x2: toMil(stroke[index].x),
                y2: toMil(stroke[index].y),
                width: toMil(width)
            })
        }

        return tracks
    })
}

/**
 * Checks whether one parsed text item should contribute to 3D silkscreen.
 * @param {object} text Text primitive.
 * @returns {boolean}
 */
function isVisibleSilkscreenText(text) {
    return (
        text?.visible !== false &&
        String(text?.value ?? text?.text ?? '').length > 0
    )
}

/**
 * Builds transformed KiCad stroke-font point lists for one text item.
 * @param {object} text Text primitive.
 * @returns {{ x: number, y: number }[][]}
 */
function textStrokes(text) {
    const lines = String(text?.value ?? text?.text ?? '').split('\n')
    const lineSpacing = textLineSpacing(text)

    return lines.flatMap((line, index) =>
        textLineStrokes(text, line, index, lines.length, lineSpacing)
    )
}

/**
 * Builds transformed KiCad stroke-font point lists for one text line.
 * @param {object} text Text primitive.
 * @param {string} line Line text.
 * @param {number} index Line index.
 * @param {number} lineCount Total line count.
 * @param {number} lineSpacing Baseline spacing in millimeters.
 * @returns {{ x: number, y: number }[][]}
 */
function textLineStrokes(text, line, index, lineCount, lineSpacing) {
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

    return layout.strokes.map((stroke) =>
        stroke.map((point) =>
            transformTextPoint(text, { x: point.x + x, y: point.y + y })
        )
    )
}

/**
 * Calculates KiCad-like baseline spacing for multiline text.
 * @param {object} text Text primitive.
 * @returns {number}
 */
function textLineSpacing(text) {
    return textHeight(text) * kicadTextLineSpacingRatio
}

/**
 * Resolves vertical text size.
 * @param {object} text Text primitive.
 * @returns {number}
 */
function textHeight(text) {
    return positiveTextSize(text?.sizeX, text?.sizeY)
}

/**
 * Resolves horizontal text size.
 * @param {object} text Text primitive.
 * @returns {number}
 */
function textWidth(text) {
    return positiveTextSize(text?.sizeY, text?.sizeX)
}

/**
 * Resolves a positive text metric.
 * @param {number | undefined} primary Primary metric.
 * @param {number | undefined} secondary Fallback metric.
 * @returns {number}
 */
function positiveTextSize(primary, secondary) {
    const value = Number(primary) || Number(secondary) || 1
    return Math.max(value, 0.001)
}

/**
 * Calculates line origin from KiCad horizontal justification.
 * @param {object} text Text primitive.
 * @param {number} lineWidth Rendered line width.
 * @returns {number}
 */
function textLineX(text, lineWidth) {
    const fudge = textStrokeHorizontalFudge(text)

    if (text?.hAlign === 'left') {
        return Number(text?.x || 0) + fudge
    }

    if (text?.hAlign === 'right') {
        return Number(text?.x || 0) - lineWidth - fudge
    }

    return Number(text?.x || 0) - lineWidth / 2
}

/**
 * Calculates one line baseline from KiCad vertical justification.
 * @param {object} text Text primitive.
 * @param {number} index Line index.
 * @param {number} lineCount Total line count.
 * @param {number} lineSpacing Baseline spacing in millimeters.
 * @returns {number}
 */
function textLineY(text, index, lineCount, lineSpacing) {
    const height = textHeight(text)
    const blockHeight =
        height * kicadFirstLineHeightRatio + lineSpacing * (lineCount - 1)
    let baseline = Number(text?.y || 0) + height - textStrokeBaselineFudge(text)

    if (text?.vAlign === 'bottom') {
        baseline -= blockHeight
    } else if (text?.vAlign === 'center') {
        baseline -= blockHeight / 2
    }

    return baseline + lineSpacing * index
}

/**
 * Applies KiCad text rotation and mirrored text transforms.
 * @param {object} text Text primitive.
 * @param {{ x: number, y: number }} point Stroke point.
 * @returns {{ x: number, y: number }}
 */
function transformTextPoint(text, point) {
    const origin = {
        x: Number(text?.x || 0),
        y: Number(text?.y || 0)
    }

    if (text?.mirrored) {
        const rotated = rotatePoint(point, origin, Number(text?.rotation || 0))
        return {
            x: origin.x - (rotated.x - origin.x),
            y: rotated.y
        }
    }

    return rotatePoint(point, origin, -Number(text?.rotation || 0))
}

/**
 * Rotates one point around an origin.
 * @param {{ x: number, y: number }} point Point.
 * @param {{ x: number, y: number }} origin Origin.
 * @param {number} angleDeg Rotation angle in degrees.
 * @returns {{ x: number, y: number }}
 */
function rotatePoint(point, origin, angleDeg) {
    const angle = (Number(angleDeg || 0) * Math.PI) / 180
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const dx = Number(point?.x || 0) - origin.x
    const dy = Number(point?.y || 0) - origin.y

    return {
        x: origin.x + dx * cos - dy * sin,
        y: origin.y + dx * sin + dy * cos
    }
}

/**
 * Resolves KiCad text stroke width.
 * @param {object} text Text primitive.
 * @returns {number}
 */
function textStrokeWidth(text) {
    return Math.max(Number(text?.thickness) || 0.12, 0.01)
}

/**
 * Mirrors KiCad's small horizontal stroke-font adjustment.
 * @param {object} text Text primitive.
 * @returns {number}
 */
function textStrokeHorizontalFudge(text) {
    return textStrokeWidth(text) / 1.52
}

/**
 * Mirrors KiCad's small stroke-font baseline adjustment.
 * @param {object} text Text primitive.
 * @returns {number}
 */
function textStrokeBaselineFudge(text) {
    return textStrokeWidth(text) * kicadStrokeBaselineFudgeRatio
}

/**
 * Builds closed polygon edge tracks.
 * @param {object} drawing Polygon drawing.
 * @returns {object[]}
 */
function buildPolygonSilkscreenTracks(drawing) {
    const points = drawing.points || []
    if (points.length < 2) {
        return []
    }

    return points.map((point, index) =>
        buildSilkscreenTrack(
            point,
            points[(index + 1) % points.length],
            drawing
        )
    )
}

/**
 * Builds one track primitive in mils.
 * @param {{ x?: number, y?: number }} start Start point in mm.
 * @param {{ x?: number, y?: number }} end End point in mm.
 * @param {object} drawing Source drawing.
 * @returns {{ x1: number, y1: number, x2: number, y2: number, width: number }}
 */
function buildSilkscreenTrack(start, end, drawing) {
    return {
        x1: toMil(start?.x),
        y1: toMil(start?.y),
        x2: toMil(end?.x),
        y2: toMil(end?.y),
        width: toMil(drawing?.strokeWidth ?? drawing?.width ?? 0.15)
    }
}

/**
 * Builds one arc primitive in mils.
 * @param {object} drawing Drawing primitive.
 * @returns {object | null}
 */
function buildKicadSilkscreenArc(drawing) {
    const type = String(drawing?.type || '').toLowerCase()
    if (type === 'circle' && drawing.center && drawing.radius) {
        return {
            x: toMil(drawing.center.x),
            y: toMil(drawing.center.y),
            radius: toMil(drawing.radius),
            startAngle: 0,
            endAngle: 360,
            width: toMil(drawing?.strokeWidth ?? drawing?.width ?? 0.15)
        }
    }

    if (type !== 'arc' || !drawing.start || !drawing.mid || !drawing.end) {
        return null
    }

    const arc = KicadArcGeometry.fromThreePoints(
        drawing.start,
        drawing.mid,
        drawing.end
    )
    if (!arc) {
        return null
    }

    return {
        x: toMil(arc.center.x),
        y: toMil(arc.center.y),
        radius: toMil(arc.radius),
        startAngle: arc.startAngle,
        endAngle: arc.endAngle,
        sweepAngle: arc.sweepAngle,
        width: toMil(drawing?.strokeWidth ?? drawing?.width ?? 0.15)
    }
}

/**
 * Builds one fill primitive in mils.
 * @param {object} drawing Drawing primitive.
 * @returns {object | null}
 */
function buildKicadSilkscreenFill(drawing) {
    if (!drawing?.fill) {
        return null
    }

    if (
        String(drawing?.type || '').toLowerCase() === 'polygon' &&
        Array.isArray(drawing.points) &&
        drawing.points.length >= 3
    ) {
        return {
            points: drawing.points.map((point) => toMilPoint(point))
        }
    }

    const bounds = drawingBounds(drawingPoints(drawing))
    if (!bounds) {
        return null
    }

    return {
        x1: toMil(bounds.minX),
        y1: toMil(bounds.minY),
        x2: toMil(bounds.maxX),
        y2: toMil(bounds.maxY)
    }
}

/**
 * Converts one point from millimeters to mils.
 * @param {{ x?: number, y?: number }} point Point in millimeters.
 * @returns {{ x: number, y: number }}
 */
function toMilPoint(point) {
    return {
        x: toMil(point?.x),
        y: toMil(point?.y)
    }
}

/**
 * Extracts boundary points from one drawing.
 * @param {object} drawing Drawing primitive.
 * @returns {{ x?: number, y?: number }[]}
 */
function drawingPoints(drawing) {
    if (Array.isArray(drawing?.points)) {
        return drawing.points
    }

    if (drawing?.start && drawing?.end) {
        return [drawing.start, drawing.end]
    }

    if (drawing?.center && drawing?.radius) {
        const radius = Number(drawing.radius || 0)
        return [
            {
                x: Number(drawing.center.x || 0) - radius,
                y: Number(drawing.center.y || 0) - radius
            },
            {
                x: Number(drawing.center.x || 0) + radius,
                y: Number(drawing.center.y || 0) + radius
            }
        ]
    }

    return []
}

/**
 * Calculates drawing bounds in millimeters.
 * @param {{ x?: number, y?: number }[]} points Drawing points.
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
 */
function drawingBounds(points) {
    const normalizedPoints = (points || [])
        .map((point) => ({
            x: Number(point?.x),
            y: Number(point?.y)
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))

    if (!normalizedPoints.length) {
        return null
    }

    return {
        minX: Math.min(...normalizedPoints.map((point) => point.x)),
        minY: Math.min(...normalizedPoints.map((point) => point.y)),
        maxX: Math.max(...normalizedPoints.map((point) => point.x)),
        maxY: Math.max(...normalizedPoints.map((point) => point.y))
    }
}

/**
 * Converts millimeters to mils.
 * @param {number | string | undefined} value Millimeter value.
 * @returns {number}
 */
function toMil(value) {
    return Number(value || 0) * milsPerMillimeter
}

/**
 * Escapes HTML-sensitive text.
 * @param {string} value Raw value.
 * @returns {string}
 */
function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[character]
    })
}
