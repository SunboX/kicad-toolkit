// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { Geometry } from './Geometry.mjs'
import { KicadSchematicStyleParser } from './KicadSchematicStyleParser.mjs'

const defaultInkColor = '#1f2430'
const defaultFillColor = 'none'

/**
 * Parses placed KiCad schematic symbol graphics and pins from library symbols.
 */
export class KicadSchematicSymbolParser {
    /**
     * Parses graphical primitives for one placed symbol.
     * @param {Array | undefined} symbol Library symbol node.
     * @param {string} ownerIndex Symbol owner id.
     * @param {object} transform Placement transform.
     * @param {{ unit: number, convert: number }} selection Unit/body selection.
     * @returns {{ lines: object[], rectangles: object[], ellipses: object[], arcs: object[], polygons: object[], beziers: object[] }}
     */
    static parsePrimitives(symbol, ownerIndex, transform, selection) {
        const primitiveSource = collectSymbolPrimitiveNodes(symbol, selection)
        return {
            lines: primitiveSource.flatMap((node, index) =>
                parseSymbolPolyline(node, index, ownerIndex, transform, false)
            ),
            rectangles: primitiveSource
                .filter((node) => node[0] === 'rectangle')
                .map((node, index) =>
                    parseSymbolRectangle(node, index, ownerIndex, transform)
                ),
            ellipses: primitiveSource
                .filter((node) => node[0] === 'circle')
                .map((node, index) =>
                    parseSymbolCircle(node, index, ownerIndex, transform)
                ),
            arcs: primitiveSource
                .filter((node) => node[0] === 'arc')
                .map((node, index) =>
                    parseSymbolArc(node, index, ownerIndex, transform)
                ),
            polygons: primitiveSource.flatMap((node, index) =>
                parseSymbolPolyline(node, index, ownerIndex, transform, true)
            ),
            beziers: primitiveSource
                .filter((node) => node[0] === 'bezier')
                .map((node, index) =>
                    parseSymbolBezier(node, index, ownerIndex, transform)
                )
        }
    }

    /**
     * Parses pins for one placed symbol.
     * @param {Array | undefined} symbol Library symbol node.
     * @param {string} ownerIndex Owner id.
     * @param {object} transform Placement transform.
     * @param {{ unit: number, convert: number }} selection Unit/body selection.
     * @returns {object[]}
     */
    static parsePins(symbol, ownerIndex, transform, selection) {
        const hidePinNumbers = pinNumbersHidden(symbol)
        const hidePinNames = pinNamesHidden(symbol)
        const nameOffset = pinNameOffset(symbol)
        return collectSymbolPinNodes(symbol, selection).map((node, index) => {
            const at = parseAt(child(node, 'at'))
            const electricalType = String(node[1] || '')
            const pinStyle = String(node[2] || 'line')
            const name = textValue(child(node, 'name')) || ''
            const nameFont = parsePinTextFont(child(node, 'name'))
            const numberFont = parsePinTextFont(child(node, 'number'))
            const visible = !pinHidden(node)
            const connection = transformPoint({ x: at.x, y: at.y }, transform)
            const length = numberValue(child(node, 'length')?.[1], 2.54)
            const innerLocal = pointFromPinConnection(at, length)
            const inner = transformPoint(innerLocal, transform)
            const orientation = orientationFromBodyAndConnection(
                inner,
                connection
            )
            return {
                x: inner.x,
                y: inner.y,
                length: Geometry.distance(inner, connection),
                name,
                designator:
                    textValue(child(node, 'number')) || String(index + 1),
                nameFontSize: nameFont.size,
                nameOffset,
                nameVisible:
                    visible &&
                    nameFont.visible &&
                    !hidePinNames &&
                    Boolean(name.trim()) &&
                    name.trim() !== '~',
                numberFontSize: numberFont.size,
                numberVisible: visible && numberFont.visible && !hidePinNumbers,
                orientation,
                electrical: 4,
                electricalType,
                pinStyle,
                color: defaultInkColor,
                labelColor: defaultInkColor,
                labelMode: 'number-only',
                endpointVisible: visible && Boolean(transform.endpointVisible),
                visible,
                ownerIndex
            }
        })
    }
}

/**
 * Checks whether a library symbol hides pin numbers.
 * @param {Array | undefined} symbol Library symbol node.
 * @returns {boolean}
 */
function pinNumbersHidden(symbol) {
    const pinNumbers = child(symbol, 'pin_numbers')
    return hasScalar(pinNumbers, 'hide') || hasChild(pinNumbers, 'hide')
}

/**
 * Checks whether a library symbol hides pin names.
 * @param {Array | undefined} symbol Library symbol node.
 * @returns {boolean}
 */
function pinNamesHidden(symbol) {
    const pinNames = child(symbol, 'pin_names')
    return hasScalar(pinNames, 'hide') || hasChild(pinNames, 'hide')
}

/**
 * Reads the library symbol pin-name offset.
 * @param {Array | undefined} symbol Library symbol node.
 * @returns {number}
 */
function pinNameOffset(symbol) {
    return numberValue(child(child(symbol, 'pin_names'), 'offset')?.[1], 0.5)
}

/**
 * Checks whether a pin is hidden in the KiCad library symbol.
 * @param {Array | undefined} node Pin node.
 * @returns {boolean}
 */
function pinHidden(node) {
    return hasScalar(node, 'hide') || hasChild(node, 'hide')
}

/**
 * Parses pin-number font visibility and size.
 * @param {Array | undefined} node Pin number node.
 * @returns {{ size: number, visible: boolean }}
 */
function parsePinTextFont(node) {
    if (!Array.isArray(node)) return { size: 0, visible: false }
    const effects = child(node, 'effects')
    const font = child(effects, 'font')
    const sizeNode = child(font, 'size') || ['size', 1.27, 1.27]
    const width = numberValue(sizeNode[1], 1.27)
    const height = numberValue(sizeNode[2], width)
    const size = Math.max(width, height)
    return {
        size,
        visible: size > 0 && !hasScalar(node, 'hide') && !hasChild(node, 'hide')
    }
}

/**
 * Collects supported primitive nodes from selected symbol units.
 * @param {Array | undefined} symbol Library symbol node.
 * @param {{ unit: number, convert: number }} selection Unit/body selection.
 * @returns {Array[]}
 */
function collectSymbolPrimitiveNodes(symbol, selection) {
    return collectSelectedSymbolNodes(symbol, selection).filter((node) => {
        return ['polyline', 'rectangle', 'circle', 'arc', 'bezier'].includes(
            String(node[0] || '')
        )
    })
}

/**
 * Collects selected pin nodes from a symbol definition.
 * @param {Array | undefined} symbol Library symbol node.
 * @param {{ unit: number, convert: number }} selection Unit/body selection.
 * @returns {Array[]}
 */
function collectSymbolPinNodes(symbol, selection) {
    return collectSelectedSymbolNodes(symbol, selection).filter((node) => {
        return node[0] === 'pin'
    })
}

/**
 * Collects root and selected nested symbol nodes.
 * @param {Array | undefined} symbol Library symbol node.
 * @param {{ unit: number, convert: number }} selection Unit/body selection.
 * @returns {Array[]}
 */
function collectSelectedSymbolNodes(symbol, selection) {
    if (!Array.isArray(symbol)) return []

    const rootName = libItemName(String(symbol[1] || ''))
    const direct = children(symbol).filter((node) => node[0] !== 'symbol')
    const nested = children(symbol, 'symbol')
        .filter((node) => symbolUnitMatches(node, rootName, selection))
        .flatMap((node) => children(node))

    return [...direct, ...nested]
}

/**
 * Checks whether a nested library symbol applies to the placed unit/body style.
 * @param {Array} node Nested symbol node.
 * @param {string} rootName Root library symbol item name.
 * @param {{ unit: number, convert: number }} selection Unit/body selection.
 * @returns {boolean}
 */
function symbolUnitMatches(node, rootName, selection) {
    const unitBody = unitBodyFromSymbolName(String(node[1] || ''), rootName)
    if (!unitBody) return false

    const selectedUnit = Number(selection.unit || 1)
    const selectedBody = Number(selection.convert || 1)
    const isCommonUnit = unitBody.unit === 0
    const bodyMatches =
        unitBody.body === 0 ||
        unitBody.body === 1 ||
        unitBody.body === selectedBody

    if (isCommonUnit) return bodyMatches
    return unitBody.unit === selectedUnit && bodyMatches
}

/**
 * Extracts unit/body style suffix from a nested symbol name.
 * @param {string} value Nested symbol name.
 * @param {string} rootName Root library item name.
 * @returns {{ unit: number, body: number } | null}
 */
function unitBodyFromSymbolName(value, rootName) {
    const name = libItemName(value)
    const prefix = `${rootName}_`
    if (!name.startsWith(prefix)) return null

    const [unit, body] = name.slice(prefix.length).split('_').map(Number)
    if (!Number.isFinite(unit) || !Number.isFinite(body)) return null
    return { unit, body }
}

/**
 * Returns the library item name without nickname.
 * @param {string} value Library identifier.
 * @returns {string}
 */
function libItemName(value) {
    return String(value || '')
        .replaceAll('{slash}', '/')
        .split(':')
        .at(-1)
}

/**
 * Parses a symbol polyline as either lines or filled polygon.
 * @param {Array} node Primitive node.
 * @param {number} index Primitive index.
 * @param {string} ownerIndex Owner id.
 * @param {object} transform Transform.
 * @param {boolean} polygonsOnly Whether to return only filled polygons.
 * @returns {object[]}
 */
function parseSymbolPolyline(node, index, ownerIndex, transform, polygonsOnly) {
    if (node[0] !== 'polyline') return []
    const points = parsePoints(child(node, 'pts')).map((point) =>
        transformPoint(point, transform)
    )
    const strokeFields = KicadSchematicStyleParser.strokeFields(node)
    const fillFields = KicadSchematicStyleParser.fillFields(node)
    const fill = fillType(node)
    const isFilled = fill !== 'none'
    if (polygonsOnly) {
        return isFilled
            ? [
                  {
                      points,
                      color: defaultInkColor,
                      fill,
                      ...strokeFields,
                      ...fillFields,
                      isSolid: true,
                      transparent: false,
                      lineWidth: strokeWidth(node),
                      ownerIndex,
                      renderOrder: index
                  }
              ]
            : []
    }
    if (isFilled) return []
    return points.slice(0, -1).map((point, pointIndex) => ({
        x1: point.x,
        y1: point.y,
        x2: points[pointIndex + 1].x,
        y2: points[pointIndex + 1].y,
        color: defaultInkColor,
        width: strokeWidth(node),
        ...strokeFields,
        ownerIndex,
        renderOrder: index * 100 + pointIndex
    }))
}

/**
 * Parses a symbol rectangle.
 * @param {Array} node Rectangle node.
 * @param {number} index Rectangle index.
 * @param {string} ownerIndex Owner id.
 * @param {object} transform Transform.
 * @returns {object}
 */
function parseSymbolRectangle(node, index, ownerIndex, transform) {
    const start = transformPoint(localPoint(child(node, 'start')), transform)
    const end = transformPoint(localPoint(child(node, 'end')), transform)
    return {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
        color: defaultInkColor,
        fill: fillType(node),
        ...KicadSchematicStyleParser.strokeFields(node),
        ...KicadSchematicStyleParser.fillFields(node),
        isSolid: false,
        transparent: true,
        lineWidth: strokeWidth(node),
        ownerIndex,
        sourceType: 'rectangle',
        renderOrder: index
    }
}

/**
 * Parses a symbol circle.
 * @param {Array} node Circle node.
 * @param {number} index Circle index.
 * @param {string} ownerIndex Owner id.
 * @param {object} transform Transform.
 * @returns {object}
 */
function parseSymbolCircle(node, index, ownerIndex, transform) {
    const center = transformPoint(localPoint(child(node, 'center')), transform)
    const radius = numberValue(child(node, 'radius')?.[1], 1)
    return {
        x: center.x,
        y: center.y,
        radiusX: radius,
        radiusY: radius,
        color: defaultInkColor,
        fill: fillType(node),
        ...KicadSchematicStyleParser.strokeFields(node),
        ...KicadSchematicStyleParser.fillFields(node),
        isSolid: false,
        transparent: true,
        lineWidth: strokeWidth(node),
        ownerIndex,
        sourceType: 'circle',
        renderOrder: index
    }
}

/**
 * Parses a symbol arc.
 * @param {Array} node Arc node.
 * @param {number} index Arc index.
 * @param {string} ownerIndex Owner id.
 * @param {object} transform Transform.
 * @returns {object}
 */
function parseSymbolArc(node, index, ownerIndex, transform) {
    return {
        type: 'arc',
        sourceType: 'arc',
        start: transformPoint(localPoint(child(node, 'start')), transform),
        mid: transformPoint(localPoint(child(node, 'mid')), transform),
        end: transformPoint(localPoint(child(node, 'end')), transform),
        color: defaultInkColor,
        width: strokeWidth(node),
        fill: fillType(node),
        ...KicadSchematicStyleParser.strokeFields(node),
        ...KicadSchematicStyleParser.fillFields(node),
        ownerIndex,
        renderOrder: index
    }
}

/**
 * Parses a symbol Bezier.
 * @param {Array} node Bezier node.
 * @param {number} index Bezier index.
 * @param {string} ownerIndex Owner id.
 * @param {object} transform Transform.
 * @returns {object}
 */
function parseSymbolBezier(node, index, ownerIndex, transform) {
    return {
        type: 'bezier',
        sourceType: 'bezier',
        points: parsePoints(child(node, 'pts')).map((point) =>
            transformPoint(point, transform)
        ),
        color: defaultInkColor,
        width: strokeWidth(node),
        ...KicadSchematicStyleParser.strokeFields(node),
        ownerIndex,
        renderOrder: index
    }
}

/**
 * Resolves the body-side pin point from a KiCad connection point.
 * @param {{ x: number, y: number, rotation: number }} at Pin at.
 * @param {number} length Pin length.
 * @returns {{ x: number, y: number }}
 */
function pointFromPinConnection(at, length) {
    const radians = (Number(at.rotation) || 0) * (Math.PI / 180)
    return {
        x: at.x + Math.cos(radians) * length,
        y: at.y + Math.sin(radians) * length
    }
}

/**
 * Resolves Altium-style pin orientation.
 * @param {{ x: number, y: number }} body Body-side point.
 * @param {{ x: number, y: number }} connection Connection point.
 * @returns {'left' | 'right' | 'top' | 'bottom'}
 */
function orientationFromBodyAndConnection(body, connection) {
    const dx = connection.x - body.x
    const dy = connection.y - body.y
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx < 0 ? 'left' : 'right'
    }
    return dy < 0 ? 'top' : 'bottom'
}

/**
 * Transforms one local symbol point.
 * @param {{ x: number, y: number }} point Local point.
 * @param {object} transform Transform.
 * @returns {{ x: number, y: number }}
 */
function transformPoint(point, transform) {
    const mirrored = mirrorPoint(point, transform.mirror)
    const local = { x: mirrored.x, y: -mirrored.y }
    const radians = transformRotationRadians(transform)
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    const x = local.x * cos - local.y * sin
    const y = local.x * sin + local.y * cos
    return {
        x: transform.x + x,
        y: transform.y + y
    }
}

/**
 * Resolves symbol rotation in screen-space after KiCad mirroring.
 * @param {object} transform Symbol placement transform.
 * @returns {number}
 */
function transformRotationRadians(transform) {
    const rotation = Number(transform.rotation) || 0
    const direction = transform.mirror ? 1 : -1
    return direction * rotation * (Math.PI / 180)
}

/**
 * Applies KiCad symbol mirror to a local point.
 * @param {{ x: number, y: number }} point Local point.
 * @param {string} mirror Mirror token.
 * @returns {{ x: number, y: number }}
 */
function mirrorPoint(point, mirror) {
    if (mirror === 'x') return { x: point.x, y: -point.y }
    if (mirror === 'y') return { x: -point.x, y: point.y }
    return point
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
 * Parses point list.
 * @param {Array | undefined} node Points node.
 * @returns {{ x: number, y: number }[]}
 */
function parsePoints(node) {
    return children(node, 'xy').map((entry) => ({
        x: numberValue(entry[1], 0),
        y: numberValue(entry[2], 0)
    }))
}

/**
 * Parses local point node.
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
 * Parses a primitive stroke width.
 * @param {Array} node Primitive node.
 * @returns {number}
 */
function strokeWidth(node) {
    return KicadSchematicStyleParser.strokeWidth(node, 0.15)
}

/**
 * Parses a primitive fill type.
 * @param {Array} node Primitive node.
 * @returns {string}
 */
function fillType(node) {
    return KicadSchematicStyleParser.fillType(node, defaultFillColor)
}

/**
 * Finds direct child nodes.
 * @param {Array | undefined} node Parent node.
 * @param {string} [name] Optional child name.
 * @returns {Array[]}
 */
function children(node, name) {
    if (!Array.isArray(node)) return []
    return node.filter((entry) => {
        return Array.isArray(entry) && (!name || entry[0] === name)
    })
}

/**
 * Finds the first named direct child.
 * @param {Array | undefined} node Parent node.
 * @param {string} name Child name.
 * @returns {Array | undefined}
 */
function child(node, name) {
    return children(node, name)[0]
}

/**
 * Checks for a direct child node.
 * @param {Array | undefined} node Parent node.
 * @param {string} name Child node name.
 * @returns {boolean}
 */
function hasChild(node, name) {
    return children(node, name).length > 0
}

/**
 * Checks whether a node contains a scalar token.
 * @param {Array | undefined} node Node.
 * @param {string} name Token name.
 * @returns {boolean}
 */
function hasScalar(node, name) {
    return (node || []).slice(1).some((value) => String(value) === name)
}

/**
 * Reads text value from a simple node.
 * @param {Array | undefined} node Node.
 * @returns {string}
 */
function textValue(node) {
    return String(node?.[1] || '')
}

/**
 * Reads a number with fallback.
 * @param {unknown} value Value.
 * @param {number} fallback Fallback.
 * @returns {number}
 */
function numberValue(value, fallback) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
}
