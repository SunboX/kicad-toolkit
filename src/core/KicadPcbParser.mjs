// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { Geometry } from './Geometry.mjs'
import { KicadLayerResolver } from './KicadLayerResolver.mjs'
import { SExpressionParser } from './SExpressionParser.mjs'

const drawingNodeNames = new Set([
    'gr_line',
    'gr_rect',
    'gr_circle',
    'gr_arc',
    'gr_poly',
    'fp_line',
    'fp_rect',
    'fp_circle',
    'fp_arc',
    'fp_poly'
])

/**
 * Converts KiCad PCB S-expressions into a small assembly-rendering model.
 */
export class KicadPcbParser {
    /**
     * Parses KiCad PCB source text.
     * @param {string} source
     * @param {{ fileName?: string }} [options]
     * @returns {object}
     */
    static parse(source, options = {}) {
        const root = SExpressionParser.parse(source)
        if (!isNode(root, 'kicad_pcb')) {
            throw new Error('Expected kicad_pcb root')
        }

        const titleBlock = child(root, 'title_block')
        const footprints = children(root, 'footprint').map((node, index) => {
            return parseFootprint(node, index)
        })
        const pads = footprints.flatMap((footprint) => footprint.pads)
        const footprintTexts = footprints.flatMap(
            (footprint) => footprint.texts
        )
        const footprintDrawings = footprints.flatMap(
            (footprint) => footprint.drawings
        )
        const boardDrawings = [
            ...parseBoardDrawings(root),
            ...parseCopperDrawings(root)
        ]
        const boardTexts = children(root, 'gr_text').map((node, index) => {
            return parseBoardText(node, index)
        })
        const outlines = boardDrawings.filter(
            (drawing) => drawing.layer === 'Edge.Cuts'
        )
        const drawings = [
            ...boardDrawings.filter((drawing) => drawing.layer !== 'Edge.Cuts'),
            ...footprintDrawings
        ]
        const texts = [...boardTexts, ...footprintTexts]
        const bounds = computeBoardBounds(
            outlines,
            pads,
            drawings,
            texts.filter(isVisibleTextModel)
        )

        return {
            fileName: String(options.fileName || ''),
            title: textValue(child(titleBlock, 'title')) || '',
            revision: textValue(child(titleBlock, 'rev')) || '',
            outlines,
            drawings,
            footprints,
            pads,
            texts,
            bounds,
            diagnostics: []
        }
    }
}

/**
 * Parses one footprint node.
 * @param {Array} node
 * @param {number} index
 * @returns {object}
 */
function parseFootprint(node, index) {
    const referenceProperty = children(node, 'property').find((entry) => {
        return String(entry[1] || '') === 'Reference'
    })
    const referenceText = children(node, 'fp_text').find((entry) => {
        return String(entry[1] || '') === 'reference'
    })
    const reference = String(
        referenceProperty?.[2] || referenceText?.[2] || `FP${index + 1}`
    )
    const id = `footprint:${reference}:${index}`
    const layer = textValue(child(node, 'layer')) || ''
    const side = KicadLayerResolver.sideFromLayer(layer)
    const attributes = parseFootprintAttributes(child(node, 'attr'))
    const excludeFromPositionFiles = attributes.includes(
        'exclude_from_pos_files'
    )
    const transform = {
        ...parseAt(child(node, 'at')),
        side
    }
    const pads = children(node, 'pad').map((padNode, padIndex) => {
        return parsePad(padNode, {
            footprintId: id,
            footprintReference: reference,
            footprintIndex: index,
            padIndex,
            transform
        })
    })
    const texts = [
        ...children(node, 'property').map((propertyNode, propertyIndex) => {
            return parseFootprintPropertyText(
                propertyNode,
                propertyIndex,
                id,
                transform,
                side,
                excludeFromPositionFiles
            )
        }),
        ...children(node, 'fp_text').map((textNode, textIndex) => {
            return parseFootprintText(
                textNode,
                textIndex,
                reference,
                id,
                transform,
                side,
                excludeFromPositionFiles
            )
        })
    ].filter(Boolean)
    const drawings = children(node).flatMap((entry, drawingIndex) => {
        if (!drawingNodeNames.has(String(entry[0] || ''))) return []
        return parseDrawing(entry, drawingIndex, {
            ownerId: id,
            transform,
            fallbackSide: side
        })
    })
    const bounds = Geometry.boundsFromPoints([
        ...pads.flatMap(pointsForPad),
        ...drawings.flatMap(pointsForDrawing),
        ...texts
            .filter(isVisibleTextModel)
            .map((text) => ({ x: text.x, y: text.y }))
    ])

    return {
        id,
        libraryName: String(node[1] || ''),
        reference,
        attributes,
        excludeFromPositionFiles,
        layer,
        side,
        x: transform.x,
        y: transform.y,
        rotation: transform.rotation,
        pads,
        texts,
        drawings,
        bounds
    }
}

/**
 * Parses one pad.
 * @param {Array} node
 * @param {object} context
 * @returns {object}
 */
function parsePad(node, context) {
    const localAt = parseAt(child(node, 'at'))
    const position = transformLocalPoint(localAt, context.transform)
    const size = child(node, 'size') || ['size', 1, 1]
    const layerResolution = KicadLayerResolver.resolvePadLayers(
        (child(node, 'layers') || []).slice(1).map(String),
        context.transform
    )
    const layers = layerResolution.layers
    const net = child(node, 'net')
    const side = KicadLayerResolver.sideFromLayers(layers)
    const id = `pad:${context.footprintReference}:${String(node[1] || '')}:${context.footprintIndex}:${context.padIndex}`

    return {
        id,
        footprintId: context.footprintId,
        footprintReference: context.footprintReference,
        number: String(node[1] || ''),
        type: String(node[2] || ''),
        shape: String(node[3] || 'rect'),
        x: position.x,
        y: position.y,
        rotation: transformPrimitiveRotation(
            localAt.rotation,
            context.transform,
            layerResolution.preserveLocalRotation
        ),
        width: numberValue(size[1], 1),
        height: numberValue(size[2], numberValue(size[1], 1)),
        drill: parseDrill(child(node, 'drill')),
        roundrectRatio: numberValue(child(node, 'roundrect_rratio')?.[1], 0.25),
        layers,
        side,
        netName: String(net?.[2] || '')
    }
}

/**
 * Parses board-level graphic nodes.
 * @param {Array} root
 * @returns {object[]}
 */
function parseBoardDrawings(root) {
    return children(root).flatMap((entry, index) => {
        if (!String(entry[0] || '').startsWith('gr_')) return []
        if (entry[0] === 'gr_text') return []
        return parseDrawing(entry, index, {
            ownerId: 'board',
            transform: { x: 0, y: 0, rotation: 0 },
            fallbackSide: 'both'
        })
    })
}

/**
 * Parses one supported drawing node.
 * @param {Array} node
 * @param {number} index
 * @param {{ ownerId: string, transform: { x: number, y: number, rotation: number }, fallbackSide: string }} context
 * @returns {object[]}
 */
function parseDrawing(node, index, context) {
    const layer = textValue(child(node, 'layer')) || ''
    const side = KicadLayerResolver.sideFromLayer(layer) || context.fallbackSide
    const strokeWidth = numberValue(
        child(child(node, 'stroke'), 'width')?.[1],
        0.12
    )
    const fillMode = textValue(child(node, 'fill')) || 'no'
    const id = `${context.ownerId}:drawing:${index}`
    const base = {
        id,
        ownerId: context.ownerId,
        sourceType: String(node[0] || ''),
        layer,
        side,
        material: layer.includes('.Cu') ? 'copper' : 'silk',
        strokeWidth,
        fill: fillMode === 'yes'
    }

    if (node[0] === 'gr_line' || node[0] === 'fp_line') {
        return [
            {
                ...base,
                type: 'line',
                start: point(node, 'start', context),
                end: point(node, 'end', context)
            }
        ]
    }

    if (node[0] === 'gr_rect' || node[0] === 'fp_rect') {
        return [{ ...base, type: 'polygon', points: rectPoints(node, context) }]
    }

    if (node[0] === 'gr_circle' || node[0] === 'fp_circle') {
        const center = point(node, 'center', context)
        const end = point(node, 'end', context)
        return [
            {
                ...base,
                type: 'circle',
                center,
                radius: Geometry.distance(center, end)
            }
        ]
    }

    if (node[0] === 'gr_arc' || node[0] === 'fp_arc') {
        return [
            {
                ...base,
                type: 'arc',
                start: point(node, 'start', context),
                mid: point(node, 'mid', context),
                end: point(node, 'end', context)
            }
        ]
    }

    if (node[0] === 'gr_poly' || node[0] === 'fp_poly') {
        const points = parsePoints(child(node, 'pts'), context.transform)
        return [{ ...base, type: 'polygon', points }]
    }

    return []
}

/**
 * Parses routed copper primitives.
 * @param {Array} root
 * @returns {object[]}
 */
function parseCopperDrawings(root) {
    return [
        ...children(root, 'zone').flatMap(parseZone),
        ...children(root, 'segment').map(parseSegment),
        ...children(root, 'via').map(parseVia)
    ]
}

/**
 * Parses one copper track segment.
 * @param {Array} node
 * @param {number} index
 * @returns {object}
 */
function parseSegment(node, index) {
    const layer = textValue(child(node, 'layer')) || ''
    return {
        id: `board:segment:${index}`,
        ownerId: 'board',
        sourceType: 'segment',
        type: 'segment',
        material: 'copper',
        layer,
        side: KicadLayerResolver.sideFromLayer(layer),
        strokeWidth: numberValue(child(node, 'width')?.[1], 0.2),
        fill: false,
        start: point(node, 'start', {
            transform: { x: 0, y: 0, rotation: 0 }
        }),
        end: point(node, 'end', {
            transform: { x: 0, y: 0, rotation: 0 }
        })
    }
}

/**
 * Parses one copper via.
 * @param {Array} node
 * @param {number} index
 * @returns {object}
 */
function parseVia(node, index) {
    const at = parseAt(child(node, 'at'))
    const layers = (child(node, 'layers') || []).slice(1).map(String)
    const size = numberValue(child(node, 'size')?.[1], 0.6)
    return {
        id: `board:via:${index}`,
        ownerId: 'board',
        sourceType: 'via',
        type: 'via',
        material: 'copper',
        layer: layers.join(','),
        side: KicadLayerResolver.sideFromLayers(layers),
        x: at.x,
        y: at.y,
        size,
        drill: parseDrill(child(node, 'drill')),
        strokeWidth: 0.08,
        fill: true
    }
}

/**
 * Parses one copper zone from filled polygons.
 * @param {Array} node
 * @param {number} zoneIndex
 * @returns {object[]}
 */
function parseZone(node, zoneIndex) {
    const zoneLayer = textValue(child(node, 'layer')) || ''
    return children(node, 'filled_polygon')
        .map((polygonNode, polygonIndex) => {
            const layer = textValue(child(polygonNode, 'layer')) || zoneLayer
            return {
                id: `board:zone:${zoneIndex}:${polygonIndex}`,
                ownerId: 'board',
                sourceType: 'zone',
                type: 'zone',
                material: 'copper',
                layer,
                side: KicadLayerResolver.sideFromLayer(layer),
                strokeWidth: 0,
                fill: true,
                points: parsePoints(child(polygonNode, 'pts'), {
                    x: 0,
                    y: 0,
                    rotation: 0
                })
            }
        })
        .filter((zone) => zone.points.length > 0)
}

/**
 * Parses one footprint property text.
 * @param {Array} node
 * @param {number} index
 * @param {string} ownerId
 * @param {{ x: number, y: number, rotation: number }} transform
 * @param {string} fallbackSide
 * @param {boolean} excludeFromPositionFiles
 * @returns {object | null}
 */
function parseFootprintPropertyText(
    node,
    index,
    ownerId,
    transform,
    fallbackSide,
    excludeFromPositionFiles
) {
    return parseTextNode(node, {
        id: `${ownerId}:property:${index}`,
        ownerId,
        propertyName: String(node[1] || ''),
        value: String(node[2] || ''),
        transform,
        fallbackSide,
        keepUpright: hasKeepUprightTextRotation(node),
        visible: !hasChild(node, 'hide'),
        excludeFromPositionFiles
    })
}

/**
 * Parses one footprint text node.
 * @param {Array} node
 * @param {number} index
 * @param {string} reference
 * @param {string} ownerId
 * @param {{ x: number, y: number, rotation: number }} transform
 * @param {string} fallbackSide
 * @param {boolean} excludeFromPositionFiles
 * @returns {object | null}
 */
function parseFootprintText(
    node,
    index,
    reference,
    ownerId,
    transform,
    fallbackSide,
    excludeFromPositionFiles
) {
    const rawValue = String(node[2] || '')
    const value = rawValue === '${REFERENCE}' ? reference : rawValue
    return parseTextNode(node, {
        id: `${ownerId}:text:${index}`,
        ownerId,
        value,
        transform,
        fallbackSide,
        keepUpright: hasKeepUprightTextRotation(node),
        visible: !hasChild(node, 'hide'),
        excludeFromPositionFiles
    })
}

/**
 * Parses board-level text.
 * @param {Array} node
 * @param {number} index
 * @returns {object}
 */
function parseBoardText(node, index) {
    return parseTextNode(node, {
        id: `board:text:${index}`,
        ownerId: 'board',
        propertyName: '',
        value: String(node[1] || ''),
        transform: { x: 0, y: 0, rotation: 0 },
        fallbackSide: 'both',
        keepUpright: false,
        visible: !hasChild(node, 'hide'),
        excludeFromPositionFiles: false
    })
}

/**
 * Parses shared text node fields.
 * @param {Array} node
 * @param {object} context
 * @returns {object}
 */
function parseTextNode(node, context) {
    const localAt = parseAt(child(node, 'at'))
    const layer = textValue(child(node, 'layer')) || ''
    const side = KicadLayerResolver.sideFromLayer(layer) || context.fallbackSide
    const position = transformLocalPoint(localAt, context.transform)
    const font = child(child(node, 'effects'), 'font')
    const size = child(font, 'size') || ['size', 1, 1]
    const justify = parseJustify(node)
    const rotation = transformTextRotation(
        localAt.rotation,
        context.transform,
        side
    )

    return {
        id: context.id,
        ownerId: context.ownerId,
        propertyName: context.propertyName || '',
        value: context.value,
        x: position.x,
        y: position.y,
        rotation: context.keepUpright
            ? keepUprightRotation(rotation)
            : rotation,
        layer,
        side,
        mirrored: justify.mirrored,
        hAlign: justify.hAlign,
        vAlign: justify.vAlign,
        sizeX: numberValue(size[1], 1),
        sizeY: numberValue(size[2], numberValue(size[1], 1)),
        thickness: numberValue(child(font, 'thickness')?.[1], 0.12),
        visible: context.visible !== false,
        excludeFromPositionFiles: context.excludeFromPositionFiles === true
    }
}

/**
 * Parses a footprint attr node.
 * @param {Array | undefined} node
 * @returns {string[]}
 */
function parseFootprintAttributes(node) {
    return (node || []).slice(1).map(String)
}

/**
 * Checks parsed text visibility.
 * @param {{ visible?: boolean }} text
 * @returns {boolean}
 */
function isVisibleTextModel(text) {
    return text.visible !== false
}

/**
 * Parses one named point node.
 * @param {Array} node
 * @param {string} name
 * @param {{ transform: { x: number, y: number, rotation: number } }} context
 * @returns {{ x: number, y: number }}
 */
function point(node, name, context) {
    const pointNode = child(node, name) || [name, 0, 0]
    return transformLocalPoint(
        {
            x: numberValue(pointNode[1], 0),
            y: numberValue(pointNode[2], 0)
        },
        context.transform
    )
}

/**
 * Parses transformed rectangle corners.
 * @param {Array} node
 * @param {{ transform: { x: number, y: number, rotation: number } }} context
 * @returns {{ x: number, y: number }[]}
 */
function rectPoints(node, context) {
    const start = localPoint(child(node, 'start'))
    const end = localPoint(child(node, 'end'))
    return [
        { x: start.x, y: start.y },
        { x: end.x, y: start.y },
        { x: end.x, y: end.y },
        { x: start.x, y: end.y }
    ].map((pointValue) => {
        return transformLocalPoint(pointValue, context.transform)
    })
}

/**
 * Parses a local point node without applying transforms.
 * @param {Array | undefined} node
 * @returns {{ x: number, y: number }}
 */
function localPoint(node) {
    return {
        x: numberValue(node?.[1], 0),
        y: numberValue(node?.[2], 0)
    }
}

/**
 * Parses a KiCad pts node.
 * @param {Array | undefined} node
 * @param {{ x: number, y: number, rotation: number }} transform
 * @returns {{ x: number, y: number }[]}
 */
function parsePoints(node, transform) {
    if (!node) return []
    return children(node, 'xy').map((entry) => {
        return transformLocalPoint(
            {
                x: numberValue(entry[1], 0),
                y: numberValue(entry[2], 0)
            },
            transform
        )
    })
}

/**
 * Applies a KiCad footprint transform, including bottom-side local mirroring.
 * @param {{ x: number, y: number }} pointValue
 * @param {{ x: number, y: number, rotation: number, side?: string }} transform
 * @returns {{ x: number, y: number }}
 */
function transformLocalPoint(pointValue, transform) {
    return Geometry.transformPoint(pointValue, {
        ...transform,
        rotation: footprintCoordinateRotation(transform)
    })
}

/**
 * Resolves footprint-local coordinate rotation.
 * @param {{ rotation: number, side?: string }} transform
 * @returns {number}
 */
function footprintCoordinateRotation(transform) {
    return -transform.rotation
}

/**
 * Transforms pad and primitive rotation into board coordinates.
 * @param {number} localRotation
 * @param {{ rotation: number, side?: string }} transform
 * @param {boolean} [preserveLocalRotation]
 * @returns {number}
 */
function transformPrimitiveRotation(
    localRotation,
    transform,
    preserveLocalRotation = false
) {
    if (preserveLocalRotation) return normalizeRotation(localRotation)

    return normalizeRotation(
        localRotation + footprintCoordinateRotation(transform)
    )
}

/**
 * Transforms text rotation into render coordinates.
 * @param {number} localRotation
 * @param {{ rotation: number, side?: string, x: number, y: number }} transform
 * @param {string} side
 * @returns {number}
 */
function transformTextRotation(localRotation, transform, side) {
    if (side !== 'back') {
        return normalizeRotation(localRotation)
    }

    if (transform.side === 'back') {
        return normalizeRotation(localRotation - transform.rotation * 2)
    }

    return normalizeRotation(-localRotation)
}

/**
 * Mirrors KiCad PCB_TEXT::GetDrawRotation() for footprint text.
 * @param {number} rotation
 * @returns {number}
 */
function keepUprightRotation(rotation) {
    let value = normalizeSignedRotation(rotation)

    while (value > 90) value -= 180
    while (value <= -90) value += 180

    return normalizeRotation(value)
}

/**
 * Parses an at node.
 * @param {Array | undefined} node
 * @returns {{ x: number, y: number, rotation: number }}
 */
function parseAt(node) {
    return {
        x: numberValue(node?.[1], 0),
        y: numberValue(node?.[2], 0),
        rotation: numberValue(node?.[3], 0)
    }
}

/**
 * Parses a drill node.
 * @param {Array | undefined} node
 * @returns {number}
 */
function parseDrill(node) {
    if (!node) return 0
    const direct = node.slice(1).find((value) => typeof value === 'number')
    return numberValue(direct, 0)
}

/**
 * Computes drawing and pad bounds.
 * @param {object[]} outlines
 * @param {object[]} pads
 * @param {object[]} drawings
 * @param {object[]} texts
 * @returns {object}
 */
function computeBoardBounds(outlines, pads, drawings, texts) {
    const outlinePoints = outlines.flatMap(pointsForDrawing)
    const allPoints = [
        ...outlinePoints,
        ...pads.flatMap(pointsForPad),
        ...drawings.flatMap(pointsForDrawing),
        ...texts.map((text) => ({ x: text.x, y: text.y }))
    ]
    return Geometry.boundsFromPoints(
        outlinePoints.length > 0 ? outlinePoints : allPoints
    )
}

/**
 * Returns representative points for a pad.
 * @param {object} pad
 * @returns {{ x: number, y: number }[]}
 */
function pointsForPad(pad) {
    const halfWidth = pad.width / 2
    const halfHeight = pad.height / 2
    return [
        { x: pad.x - halfWidth, y: pad.y - halfHeight },
        { x: pad.x + halfWidth, y: pad.y + halfHeight }
    ]
}

/**
 * Returns representative points for a drawing.
 * @param {object} drawing
 * @returns {{ x: number, y: number }[]}
 */
function pointsForDrawing(drawing) {
    if (drawing.type === 'polygon') return drawing.points
    if (drawing.type === 'zone') return drawing.points
    if (drawing.type === 'line') return [drawing.start, drawing.end]
    if (drawing.type === 'segment') return [drawing.start, drawing.end]
    if (drawing.type === 'rect') return [drawing.start, drawing.end]
    if (drawing.type === 'arc') return [drawing.start, drawing.mid, drawing.end]
    if (drawing.type === 'via') {
        const radius = drawing.size / 2
        return [
            { x: drawing.x - radius, y: drawing.y - radius },
            { x: drawing.x + radius, y: drawing.y + radius }
        ]
    }
    if (drawing.type === 'circle') {
        return [
            {
                x: drawing.center.x - drawing.radius,
                y: drawing.center.y - drawing.radius
            },
            {
                x: drawing.center.x + drawing.radius,
                y: drawing.center.y + drawing.radius
            }
        ]
    }
    return []
}

/**
 * Finds direct child nodes, optionally by name.
 * @param {Array | undefined} node
 * @param {string} [name]
 * @returns {Array[]}
 */
function children(node, name) {
    if (!Array.isArray(node)) return []
    return node.filter((entry) => {
        return Array.isArray(entry) && (!name || entry[0] === name)
    })
}

/**
 * Finds the first direct child by name.
 * @param {Array | undefined} node
 * @param {string} name
 * @returns {Array | undefined}
 */
function child(node, name) {
    return children(node, name)[0]
}

/**
 * Returns true when a child exists.
 * @param {Array | undefined} node
 * @param {string} name
 * @returns {boolean}
 */
function hasChild(node, name) {
    return Boolean(child(node, name))
}

/**
 * Returns true when text has KiCad mirror justification.
 * @param {Array | undefined} node
 * @returns {boolean}
 */
function hasMirrorJustify(node) {
    return parseJustify(node).mirrored
}

/**
 * Checks KiCad footprint text keep-upright state.
 * @param {Array | undefined} node
 * @returns {boolean}
 */
function hasKeepUprightTextRotation(node) {
    const unlocked = child(node, 'unlocked')
    if (!unlocked && child(node, 'at')?.map(String).includes('unlocked')) {
        return false
    }

    if (!unlocked) return true
    if (unlocked.length === 1) return false

    return !booleanValue(unlocked[1], true)
}

/**
 * Parses KiCad text justification.
 * @param {Array | undefined} node
 * @returns {{ mirrored: boolean, hAlign: string, vAlign: string }}
 */
function parseJustify(node) {
    const values =
        child(child(node, 'effects'), 'justify')?.slice(1).map(String) || []
    return {
        mirrored: values.includes('mirror'),
        hAlign: values.includes('left')
            ? 'left'
            : values.includes('right')
              ? 'right'
              : 'center',
        vAlign: values.includes('top')
            ? 'top'
            : values.includes('bottom')
              ? 'bottom'
              : 'center'
    }
}

/**
 * Checks node type.
 * @param {unknown} node
 * @param {string} name
 * @returns {boolean}
 */
function isNode(node, name) {
    return Array.isArray(node) && node[0] === name
}

/**
 * Reads node text value.
 * @param {Array | undefined} node
 * @returns {string}
 */
function textValue(node) {
    return String(node?.[1] || '')
}

/**
 * Reads a number with fallback.
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function numberValue(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Reads a KiCad boolean-like value with fallback.
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function booleanValue(value, fallback) {
    if (value === true || value === 'yes' || value === 1 || value === '1') {
        return true
    }

    if (value === false || value === 'no' || value === 0 || value === '0') {
        return false
    }

    return fallback
}

/**
 * Normalizes a rotation.
 * @param {number} rotation
 * @returns {number}
 */
function normalizeRotation(rotation) {
    const value = Number(rotation) || 0
    return ((value % 360) + 360) % 360
}

/**
 * Normalizes a rotation into [-180, 180).
 * @param {number} rotation
 * @returns {number}
 */
function normalizeSignedRotation(rotation) {
    const value = normalizeRotation(rotation)
    return value >= 180 ? value - 360 : value
}
