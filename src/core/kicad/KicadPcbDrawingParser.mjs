// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { Geometry } from './Geometry.mjs'
import { KicadLayerResolver } from './KicadLayerResolver.mjs'
import { KicadPcbPointListParser } from './KicadPcbPointListParser.mjs'
import { KicadPcbTextBoxMetadata } from './KicadPcbTextBoxMetadata.mjs'
import { KicadPcbZoneParser } from './KicadPcbZoneParser.mjs'

const graphicNodeNames = new Set([
    'gr_line',
    'gr_rect',
    'gr_bbox',
    'gr_circle',
    'gr_arc',
    'gr_poly',
    'gr_curve',
    'gr_vector',
    'fp_line',
    'fp_rect',
    'fp_circle',
    'fp_arc',
    'fp_poly',
    'fp_curve'
])
const textBoxNodeNames = new Set(['gr_text_box', 'fp_text_box'])

/**
 * Parses KiCad PCB graphics and routed copper primitives.
 */
export class KicadPcbDrawingParser {
    /**
     * Parses board-owned graphic items.
     * @param {Array} root KiCad board root node.
     * @param {object} netResolver Net resolver.
     * @returns {{ drawings: object[], texts: object[], groups: object[], generatedItems: object[] }}
     */
    static parseBoardItems(root, netResolver) {
        const context = {
            ownerId: 'board',
            transform: { x: 0, y: 0, rotation: 0 },
            fallbackSide: 'both',
            netResolver
        }
        const parsed = children(root).flatMap((entry, index) => {
            return parseVisibleItem(entry, index, context)
        })

        return {
            drawings: parsed.flatMap((item) => item.drawings),
            texts: parsed.flatMap((item) => item.texts),
            groups: children(root, 'group').map((node, index) =>
                parseGroup(node, index, 'board')
            ),
            generatedItems: children(root, 'generated').map((node, index) =>
                parseGeneratedItem(node, index, 'board')
            )
        }
    }

    /**
     * Parses footprint-owned graphic items.
     * @param {Array} node Footprint node.
     * @param {{ ownerId: string, transform: object, fallbackSide: string, netResolver: object }} context
     * @returns {{ drawings: object[], texts: object[], groups: object[], generatedItems: object[] }}
     */
    static parseFootprintItems(node, context) {
        const parsed = children(node).flatMap((entry, index) => {
            return parseVisibleItem(entry, index, context)
        })

        return {
            drawings: parsed.flatMap((item) => item.drawings),
            texts: parsed.flatMap((item) => item.texts),
            groups: children(node, 'group').map((groupNode, index) =>
                parseGroup(groupNode, index, context.ownerId)
            ),
            generatedItems: children(node, 'generated').map(
                (generatedNode, index) =>
                    parseGeneratedItem(generatedNode, index, context.ownerId)
            )
        }
    }

    /**
     * Parses routed copper primitives.
     * @param {Array} root KiCad board root node.
     * @param {object} netResolver Net resolver.
     * @returns {object[]}
     */
    static parseCopperDrawings(root, netResolver) {
        return [
            ...children(root, 'zone').flatMap((node, index) =>
                KicadPcbZoneParser.parseZone(node, index, netResolver)
            ),
            ...children(root, 'segment').map((node, index) =>
                parseSegment(node, index, netResolver)
            ),
            ...children(root, 'arc')
                .map((node, index) => parseCopperArc(node, index, netResolver))
                .filter(Boolean),
            ...children(root, 'via').map((node, index) =>
                parseVia(node, index, netResolver)
            )
        ]
    }

    /**
     * Returns representative points for a drawing.
     * @param {object} drawing Drawing.
     * @returns {{ x: number, y: number }[]}
     */
    static pointsForDrawing(drawing) {
        if (drawing.type === 'polygon') return drawing.points
        if (drawing.type === 'zone') {
            return Array.isArray(drawing.contours)
                ? drawing.contours.flat()
                : drawing.points
        }
        if (drawing.type === 'line') return [drawing.start, drawing.end]
        if (drawing.type === 'segment') return [drawing.start, drawing.end]
        if (drawing.type === 'dimension') return drawing.points
        if (drawing.type === 'curve') return drawing.points
        if (drawing.type === 'rect') return [drawing.start, drawing.end]
        if (drawing.type === 'arc') {
            return [drawing.start, drawing.mid, drawing.end]
        }
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
        if (drawing.type === 'barcode' || drawing.type === 'image') {
            return rectangleBounds(
                drawing.x,
                drawing.y,
                drawing.width,
                drawing.height
            )
        }
        if (drawing.type === 'target' || drawing.type === 'point') {
            const radius = drawing.size / 2
            return [
                { x: drawing.x - radius, y: drawing.y - radius },
                { x: drawing.x + radius, y: drawing.y + radius }
            ]
        }
        return []
    }
}

/**
 * Parses one visible item into drawing and text buckets.
 * @param {Array} node Item node.
 * @param {number} index Item index.
 * @param {object} context Parser context.
 * @returns {{ drawings: object[], texts: object[] }}
 */
function parseVisibleItem(node, index, context) {
    const type = String(node?.[0] || '')
    if (graphicNodeNames.has(type)) {
        return { drawings: parseGraphicShape(node, index, context), texts: [] }
    }
    if (textBoxNodeNames.has(type)) return parseTextBox(node, index, context)
    if (type === 'table') return parseTable(node, index, context)
    if (type === 'dimension') return parseDimension(node, index, context)
    if (type === 'image')
        return { drawings: [parseImage(node, index, context)], texts: [] }
    if (type === 'barcode') {
        return { drawings: [parseBarcode(node, index, context)], texts: [] }
    }
    if (type === 'target')
        return { drawings: [parseTarget(node, index, context)], texts: [] }
    if (type === 'point')
        return { drawings: [parsePoint(node, index, context)], texts: [] }

    return { drawings: [], texts: [] }
}

/**
 * Parses one graphical shape.
 * @param {Array} node Shape node.
 * @param {number} index Shape index.
 * @param {object} context Parser context.
 * @returns {object[]}
 */
function parseGraphicShape(node, index, context) {
    const layer = textValue(child(node, 'layer')) || ''
    const side = KicadLayerResolver.sideFromLayer(layer) || context.fallbackSide
    const strokeWidth = strokeWidthValue(node, 0.12)
    const id = `${context.ownerId}:drawing:${index}`
    const base = {
        id,
        ownerId: context.ownerId,
        sourceType: String(node[0] || ''),
        layer,
        side,
        material: materialForLayer(layer),
        strokeWidth,
        fill: fillEnabled(node, layer),
        ...(context.netResolver?.resolveNode(child(node, 'net')) || {})
    }

    if (
        node[0] === 'gr_line' ||
        node[0] === 'fp_line' ||
        node[0] === 'gr_vector'
    ) {
        return [
            {
                ...base,
                type: 'line',
                start: point(node, 'start', context),
                end: point(node, 'end', context)
            }
        ]
    }
    if (
        node[0] === 'gr_rect' ||
        node[0] === 'gr_bbox' ||
        node[0] === 'fp_rect'
    ) {
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
    if (node[0] === 'gr_curve' || node[0] === 'fp_curve') {
        return [
            {
                ...base,
                type: 'curve',
                points: KicadPcbPointListParser.parsePoints(
                    child(node, 'pts'),
                    context.transform
                )
            }
        ]
    }
    if (node[0] === 'gr_poly' || node[0] === 'fp_poly') {
        return [
            {
                ...base,
                type: 'polygon',
                points: KicadPcbPointListParser.parsePoints(
                    child(node, 'pts'),
                    context.transform
                )
            }
        ]
    }

    return []
}

/**
 * Parses one routed copper track segment.
 * @param {Array} node Segment node.
 * @param {number} index Segment index.
 * @param {object} netResolver Net resolver.
 * @returns {object}
 */
function parseSegment(node, index, netResolver) {
    const layer = textValue(child(node, 'layer')) || ''
    return {
        id: `board:segment:${index}`,
        ownerId: 'board',
        sourceType: 'segment',
        type: 'segment',
        material: 'copper',
        layer,
        side: KicadLayerResolver.sideFromLayer(layer),
        ...netResolver.resolveNode(child(node, 'net')),
        strokeWidth: numberValue(child(node, 'width')?.[1], 0.2),
        fill: false,
        start: point(node, 'start', boardContext()),
        end: point(node, 'end', boardContext())
    }
}

/**
 * Parses one routed copper arc.
 * @param {Array} node Arc node.
 * @param {number} index Arc index.
 * @param {object} netResolver Net resolver.
 * @returns {object | null}
 */
function parseCopperArc(node, index, netResolver) {
    const layer = textValue(child(node, 'layer')) || ''
    if (!isCopperLayer(layer)) return null

    return {
        id: `board:arc:${index}`,
        ownerId: 'board',
        sourceType: 'arc',
        type: 'arc',
        material: 'copper',
        layer,
        side: KicadLayerResolver.sideFromLayer(layer),
        ...netResolver.resolveNode(child(node, 'net')),
        strokeWidth: numberValue(child(node, 'width')?.[1], 0.2),
        fill: false,
        start: point(node, 'start', boardContext()),
        mid: point(node, 'mid', boardContext()),
        end: point(node, 'end', boardContext())
    }
}

/**
 * Parses one routed via.
 * @param {Array} node Via node.
 * @param {number} index Via index.
 * @param {object} netResolver Net resolver.
 * @returns {object}
 */
function parseVia(node, index, netResolver) {
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
        ...netResolver.resolveNode(child(node, 'net')),
        x: at.x,
        y: at.y,
        size,
        drill: parseDrill(child(node, 'drill')),
        strokeWidth: 0.08,
        fill: true
    }
}

/**
 * Parses a text box as a text item plus optional border drawing.
 * @param {Array} node Text box node.
 * @param {number} index Text box index.
 * @param {object} context Parser context.
 * @returns {{ drawings: object[], texts: object[] }}
 */
function parseTextBox(node, index, context) {
    const sourceType = String(node[0] || '')
    const layer = textValue(child(node, 'layer')) || ''
    const side = KicadLayerResolver.sideFromLayer(layer) || context.fallbackSide
    const points = textBoxPoints(node, context)
    const border = booleanValue(child(node, 'border')?.[1], true)
    const text = parseTextLikeNode(node, {
        id: `${context.ownerId}:text-box:${index}`,
        ownerId: context.ownerId,
        value: String(node[1] || ''),
        position: points[0] || { x: 0, y: 0 },
        layer,
        side,
        sourceType,
        textBox: KicadPcbTextBoxMetadata.build(node, {
            sourceType,
            points,
            border
        })
    })
    const drawings = border
        ? [
              {
                  id: `${context.ownerId}:text-box-border:${index}`,
                  ownerId: context.ownerId,
                  sourceType: String(node[0] || ''),
                  type: 'polygon',
                  layer,
                  side,
                  material: materialForLayer(layer),
                  strokeWidth: strokeWidthValue(node, 0.1),
                  fill: false,
                  points
              }
          ]
        : []

    return { drawings, texts: [text] }
}

/**
 * Parses a PCB table into cell texts and borders.
 * @param {Array} node Table node.
 * @param {number} index Table index.
 * @param {object} context Parser context.
 * @returns {{ drawings: object[], texts: object[] }}
 */
function parseTable(node, index, context) {
    const tableLayer = textValue(child(node, 'layer')) || ''
    const cells = children(child(node, 'cells'), 'table_cell')
    const parsedCells = cells.map((cellNode, cellIndex) => {
        const layer = textValue(child(cellNode, 'layer')) || tableLayer
        const side =
            KicadLayerResolver.sideFromLayer(layer) || context.fallbackSide
        const points = textBoxPoints(cellNode, context)
        return {
            drawing: {
                id: `${context.ownerId}:table:${index}:${cellIndex}`,
                ownerId: context.ownerId,
                sourceType: 'table',
                type: 'polygon',
                layer,
                side,
                material: materialForLayer(layer),
                strokeWidth: strokeWidthValue(cellNode, 0.1),
                fill: false,
                points
            },
            text: parseTextLikeNode(cellNode, {
                id: `${context.ownerId}:table-text:${index}:${cellIndex}`,
                ownerId: context.ownerId,
                value: String(cellNode[1] || ''),
                position: points[0] || { x: 0, y: 0 },
                layer,
                side
            })
        }
    })

    return {
        drawings: parsedCells.map((cell) => cell.drawing),
        texts: parsedCells.map((cell) => cell.text)
    }
}

/**
 * Parses a visible dimension item.
 * @param {Array} node Dimension node.
 * @param {number} index Dimension index.
 * @param {object} context Parser context.
 * @returns {{ drawings: object[], texts: object[] }}
 */
function parseDimension(node, index, context) {
    const layer = textValue(child(node, 'layer')) || ''
    const side = KicadLayerResolver.sideFromLayer(layer) || context.fallbackSide
    const points = KicadPcbPointListParser.parsePoints(
        child(node, 'pts'),
        context.transform
    ).slice(0, 2)
    const drawing = {
        id: `${context.ownerId}:dimension:${index}`,
        ownerId: context.ownerId,
        sourceType: 'dimension',
        type: 'dimension',
        dimensionKind: textValue(child(node, 'type')) || 'linear',
        layer,
        side,
        material: materialForLayer(layer),
        strokeWidth: strokeWidthValue(node, 0.12),
        fill: false,
        points
    }
    const textNode = child(node, 'gr_text')
    const texts = textNode
        ? [
              parseTextLikeNode(textNode, {
                  id: `${context.ownerId}:dimension-text:${index}`,
                  ownerId: context.ownerId,
                  value: String(textNode[1] || ''),
                  position: transformLocalPoint(
                      parseAt(child(textNode, 'at')),
                      context.transform
                  ),
                  layer: textValue(child(textNode, 'layer')) || layer,
                  side
              })
          ]
        : []

    return { drawings: points.length >= 2 ? [drawing] : [], texts }
}

/**
 * Parses one reference image as a visible placeholder.
 * @param {Array} node Image node.
 * @param {number} index Image index.
 * @param {object} context Parser context.
 * @returns {object}
 */
function parseImage(node, index, context) {
    const at = transformLocalPoint(
        parseAt(child(node, 'at')),
        context.transform
    )
    const layer = textValue(child(node, 'layer')) || ''
    const scale = numberValue(child(node, 'scale')?.[1], 1)
    return {
        id: `${context.ownerId}:image:${index}`,
        ownerId: context.ownerId,
        sourceType: 'image',
        type: 'image',
        layer,
        side: KicadLayerResolver.sideFromLayer(layer) || context.fallbackSide,
        material: materialForLayer(layer),
        x: at.x,
        y: at.y,
        width: Math.max(scale, 0.1),
        height: Math.max(scale, 0.1),
        data: textValue(child(node, 'data'))
    }
}

/**
 * Parses one barcode item.
 * @param {Array} node Barcode node.
 * @param {number} index Barcode index.
 * @param {object} context Parser context.
 * @returns {object}
 */
function parseBarcode(node, index, context) {
    const at = transformLocalPoint(
        parseAt(child(node, 'at')),
        context.transform
    )
    const layer = textValue(child(node, 'layer')) || ''
    const size = child(node, 'size') || ['size', 1, 1]
    return {
        id: `${context.ownerId}:barcode:${index}`,
        ownerId: context.ownerId,
        sourceType: 'barcode',
        type: 'barcode',
        layer,
        side: KicadLayerResolver.sideFromLayer(layer) || context.fallbackSide,
        material: materialForLayer(layer),
        x: at.x,
        y: at.y,
        rotation: at.rotation,
        width: numberValue(size[1], 1),
        height: numberValue(size[2], numberValue(size[1], 1)),
        text: textValue(child(node, 'text')),
        barcodeType: textValue(child(node, 'type')) || 'qr',
        showText: !booleanValue(child(node, 'hide')?.[1], false)
    }
}

/**
 * Parses one target marker.
 * @param {Array} node Target node.
 * @param {number} index Target index.
 * @param {object} context Parser context.
 * @returns {object}
 */
function parseTarget(node, index, context) {
    const at = transformLocalPoint(
        parseAt(child(node, 'at')),
        context.transform
    )
    const layer = textValue(child(node, 'layer')) || ''
    return {
        id: `${context.ownerId}:target:${index}`,
        ownerId: context.ownerId,
        sourceType: 'target',
        type: 'target',
        layer,
        side: KicadLayerResolver.sideFromLayer(layer) || context.fallbackSide,
        material: materialForLayer(layer),
        shape: node.slice(1).map(String).includes('x') ? 'x' : 'plus',
        x: at.x,
        y: at.y,
        size: numberValue(child(node, 'size')?.[1], 1),
        strokeWidth: numberValue(child(node, 'width')?.[1], 0.12)
    }
}

/**
 * Parses one point marker.
 * @param {Array} node Point node.
 * @param {number} index Point index.
 * @param {object} context Parser context.
 * @returns {object}
 */
function parsePoint(node, index, context) {
    const at = transformLocalPoint(
        parseAt(child(node, 'at')),
        context.transform
    )
    const layer = textValue(child(node, 'layer')) || ''
    return {
        id: `${context.ownerId}:point:${index}`,
        ownerId: context.ownerId,
        sourceType: 'point',
        type: 'point',
        layer,
        side: KicadLayerResolver.sideFromLayer(layer) || context.fallbackSide,
        material: materialForLayer(layer),
        x: at.x,
        y: at.y,
        size: numberValue(child(node, 'size')?.[1], 0.5)
    }
}

/**
 * Parses a group metadata item.
 * @param {Array} node Group node.
 * @param {number} index Group index.
 * @param {string} ownerId Owner id.
 * @returns {object}
 */
function parseGroup(node, index, ownerId) {
    return {
        id: textValue(child(node, 'uuid')) || `${ownerId}:group:${index}`,
        ownerId,
        name: typeof node[1] === 'string' ? node[1] : '',
        members: (child(node, 'members') || []).slice(1).map(String)
    }
}

/**
 * Parses a generated item metadata entry.
 * @param {Array} node Generated node.
 * @param {number} index Generated item index.
 * @param {string} ownerId Owner id.
 * @returns {object}
 */
function parseGeneratedItem(node, index, ownerId) {
    return {
        id: textValue(child(node, 'uuid')) || `${ownerId}:generated:${index}`,
        ownerId,
        type: textValue(child(node, 'type')),
        members: (child(node, 'members') || []).slice(1).map(String)
    }
}

/**
 * Parses shared text-like fields.
 * @param {Array} node Text-like node.
 * @param {object} context Text context.
 * @returns {object}
 */
function parseTextLikeNode(node, context) {
    const font = child(child(node, 'effects'), 'font')
    const size = child(font, 'size') || ['size', 1, 1]
    const justify = parseJustify(node)
    return {
        id: context.id,
        ownerId: context.ownerId,
        propertyName: '',
        value: context.value,
        x: context.position.x,
        y: context.position.y,
        rotation: numberValue(
            child(node, 'angle')?.[1],
            context.position.rotation || 0
        ),
        layer: context.layer,
        side: context.side,
        mirrored: justify.mirrored,
        hAlign: justify.hAlign,
        vAlign: justify.vAlign,
        sizeX: numberValue(size[1], 1),
        sizeY: numberValue(size[2], numberValue(size[1], 1)),
        thickness: numberValue(child(font, 'thickness')?.[1], 0.12),
        visible: !hasChild(node, 'hide'),
        excludeFromPositionFiles: false,
        ...(context.sourceType ? { sourceType: context.sourceType } : {}),
        ...(context.textBox ? { textBox: context.textBox } : {})
    }
}

/**
 * Parses KiCad text justification.
 * @param {Array | undefined} node Text node.
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
 * Builds text box corner points.
 * @param {Array} node Text box node.
 * @param {object} context Parser context.
 * @returns {{ x: number, y: number }[]}
 */
function textBoxPoints(node, context) {
    const polygon = KicadPcbPointListParser.parsePoints(
        child(node, 'pts'),
        context.transform
    )
    return polygon.length > 0 ? polygon : rectPoints(node, context)
}

/**
 * Parses one named point node.
 * @param {Array} node Parent node.
 * @param {string} name Point child name.
 * @param {{ transform: object }} context Parser context.
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
 * @param {Array} node Rectangle node.
 * @param {{ transform: object }} context Parser context.
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
    ].map((pointValue) => transformLocalPoint(pointValue, context.transform))
}

/**
 * Builds rectangle bounds around an origin and size.
 * @param {number} x X origin.
 * @param {number} y Y origin.
 * @param {number} width Width.
 * @param {number} height Height.
 * @returns {{ x: number, y: number }[]}
 */
function rectangleBounds(x, y, width, height) {
    return [
        { x, y },
        { x: x + width, y: y + height }
    ]
}

/**
 * Parses a local point node without transforms.
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
 * Applies a KiCad footprint transform.
 * @param {{ x: number, y: number }} pointValue Point.
 * @param {{ x: number, y: number, rotation: number }} transform Transform.
 * @returns {{ x: number, y: number }}
 */
function transformLocalPoint(pointValue, transform) {
    return Geometry.transformPoint(pointValue, {
        ...transform,
        rotation: -numberValue(transform.rotation, 0)
    })
}

/**
 * Parses an at node.
 * @param {Array | undefined} node At node.
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
 * @param {Array | undefined} node Drill node.
 * @returns {number}
 */
function parseDrill(node) {
    if (!node) return 0
    const direct = node.slice(1).find((value) => typeof value === 'number')
    return numberValue(direct, 0)
}

/**
 * Resolves drawing material from layer.
 * @param {string} layer Layer name.
 * @returns {string}
 */
function materialForLayer(layer) {
    return isCopperLayer(layer) ? 'copper' : 'silk'
}

/**
 * Checks whether a layer is copper.
 * @param {string} layer Layer name.
 * @returns {boolean}
 */
function isCopperLayer(layer) {
    return String(layer || '').endsWith('.Cu')
}

/**
 * Resolves stroke width from modern or legacy syntax.
 * @param {Array} node Item node.
 * @param {number} fallback Fallback width.
 * @returns {number}
 */
function strokeWidthValue(node, fallback) {
    return numberValue(
        child(child(node, 'stroke'), 'width')?.[1] ?? child(node, 'width')?.[1],
        fallback
    )
}

/**
 * Resolves fill mode from KiCad shape syntax.
 * @param {Array} node Shape node.
 * @param {string} layer Layer name.
 * @returns {boolean}
 */
function fillEnabled(node, layer) {
    const values = flattenValues(child(node, 'fill')).map(String)
    if (values.some((value) => ['yes', 'solid'].includes(value))) return true
    if (values.some((value) => ['no', 'none'].includes(value))) return false
    return node[0] === 'gr_poly' && layer !== 'Edge.Cuts'
}

/**
 * Flattens direct scalar values from one node.
 * @param {Array | undefined} node Node.
 * @returns {unknown[]}
 */
function flattenValues(node) {
    if (!Array.isArray(node)) return []
    return node
        .slice(1)
        .flatMap((entry) => (Array.isArray(entry) ? entry.slice(1) : [entry]))
}

/**
 * Builds a board-space parser context.
 * @returns {{ transform: { x: number, y: number, rotation: number } }}
 */
function boardContext() {
    return { transform: { x: 0, y: 0, rotation: 0 } }
}

/**
 * Finds direct child nodes, optionally by name.
 * @param {Array | undefined} node Node.
 * @param {string} [name] Child name.
 * @returns {Array[]}
 */
function children(node, name) {
    if (!Array.isArray(node)) return []
    return node.filter((entry) => {
        return Array.isArray(entry) && (!name || entry[0] === name)
    })
}

/**
 * Finds first direct child by name.
 * @param {Array | undefined} node Node.
 * @param {string} name Child name.
 * @returns {Array | undefined}
 */
function child(node, name) {
    return children(node, name)[0]
}

/**
 * Checks whether a child exists.
 * @param {Array | undefined} node Node.
 * @param {string} name Child name.
 * @returns {boolean}
 */
function hasChild(node, name) {
    return Boolean(child(node, name))
}

/**
 * Reads node text value.
 * @param {Array | undefined} node Node.
 * @returns {string}
 */
function textValue(node) {
    return String(node?.[1] || '')
}

/**
 * Reads a number with fallback.
 * @param {unknown} value Raw value.
 * @param {number} fallback Fallback value.
 * @returns {number}
 */
function numberValue(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Reads a KiCad boolean-like value with fallback.
 * @param {unknown} value Raw value.
 * @param {boolean} fallback Fallback value.
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
