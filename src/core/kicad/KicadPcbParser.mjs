// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { Geometry } from './Geometry.mjs'
import { KicadLayerResolver } from './KicadLayerResolver.mjs'
import { KicadNetResolver } from './KicadNetResolver.mjs'
import { KicadPcbDrawingParser } from './KicadPcbDrawingParser.mjs'
import { KicadPcbPadParser } from './KicadPcbPadParser.mjs'
import { SExpressionParser } from './SExpressionParser.mjs'

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
        const netResolver = KicadNetResolver.fromNodes(children(root, 'net'))
        const boardGraphicItems = KicadPcbDrawingParser.parseBoardItems(
            root,
            netResolver
        )
        const footprints = children(root, 'footprint').map((node, index) => {
            return parseFootprint(node, index, netResolver)
        })
        const pads = footprints.flatMap((footprint) => footprint.pads)
        const footprintTexts = footprints.flatMap(
            (footprint) => footprint.texts
        )
        const footprintDrawings = footprints.flatMap(
            (footprint) => footprint.drawings
        )
        const boardDrawings = [
            ...boardGraphicItems.drawings,
            ...KicadPcbDrawingParser.parseCopperDrawings(root, netResolver)
        ]
        const boardTexts = [
            ...children(root, 'gr_text').map((node, index) => {
                return parseBoardText(node, index)
            }),
            ...boardGraphicItems.texts
        ]
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
            nets: netResolver.records(),
            outlines,
            drawings,
            footprints,
            pads,
            texts,
            groups: [
                ...boardGraphicItems.groups,
                ...footprints.flatMap((footprint) => footprint.groups)
            ],
            generatedItems: [
                ...boardGraphicItems.generatedItems,
                ...footprints.flatMap((footprint) => footprint.generatedItems)
            ],
            bounds,
            diagnostics: []
        }
    }
}

/**
 * Parses one footprint node.
 * @param {Array} node
 * @param {number} index
 * @param {KicadNetResolver} netResolver Net resolver.
 * @returns {object}
 */
function parseFootprint(node, index, netResolver) {
    const propertyNodes = children(node, 'property')
    const properties = parseFootprintProperties(propertyNodes)
    const referenceProperty = propertyNodes.find((entry) => {
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
    const attributeFlags = parseFootprintAttributeFlags(attributes)
    const excludeFromPositionFiles = attributeFlags.excludeFromPositionFiles
    const transform = {
        ...parseAt(child(node, 'at')),
        side
    }
    const pads = children(node, 'pad').map((padNode, padIndex) => {
        return KicadPcbPadParser.parsePad(padNode, {
            footprintId: id,
            footprintReference: reference,
            footprintIndex: index,
            padIndex,
            transform,
            netResolver
        })
    })
    const graphicItems = KicadPcbDrawingParser.parseFootprintItems(node, {
        ownerId: id,
        transform,
        fallbackSide: side,
        netResolver
    })
    const texts = [
        ...propertyNodes.map((propertyNode, propertyIndex) => {
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
        }),
        ...graphicItems.texts
    ].filter(Boolean)
    const drawings = graphicItems.drawings
    const bounds = Geometry.boundsFromPoints([
        ...pads.flatMap(KicadPcbPadParser.pointsForPad),
        ...drawings.flatMap(KicadPcbDrawingParser.pointsForDrawing),
        ...texts
            .filter(isVisibleTextModel)
            .map((text) => ({ x: text.x, y: text.y }))
    ])

    return {
        id,
        libraryName: String(node[1] || ''),
        reference,
        value: propertyText(properties, 'Value'),
        footprintName:
            propertyText(properties, 'Footprint') || String(node[1] || ''),
        properties,
        attributes,
        ...attributeFlags,
        layer,
        side,
        x: transform.x,
        y: transform.y,
        rotation: transform.rotation,
        pads,
        texts,
        drawings,
        groups: graphicItems.groups,
        generatedItems: graphicItems.generatedItems,
        bounds
    }
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
 * Parses footprint property nodes into a name/value map.
 * @param {Array[]} nodes Property nodes.
 * @returns {Record<string, string>}
 */
function parseFootprintProperties(nodes) {
    const properties = {}
    for (const node of nodes || []) {
        const name = String(node[1] || '')
        if (!name) continue
        properties[name] = String(node[2] || '')
    }
    return properties
}

/**
 * Resolves one footprint property by canonical KiCad name.
 * @param {Record<string, string>} properties Footprint properties.
 * @param {string} name Property name.
 * @returns {string}
 */
function propertyText(properties, name) {
    if (properties[name] !== undefined) return properties[name]

    const normalized = name.toLowerCase()
    const matchedKey = Object.keys(properties).find((key) => {
        return key.toLowerCase() === normalized
    })
    return matchedKey ? properties[matchedKey] : ''
}

/**
 * Converts KiCad footprint attr tokens into explicit boolean fields.
 * @param {string[]} attributes Attribute tokens.
 * @returns {object}
 */
function parseFootprintAttributeFlags(attributes) {
    const tokens = new Set(attributes || [])
    const isVirtual = tokens.has('virtual')

    return {
        isThroughHole: tokens.has('through_hole'),
        isSmd: tokens.has('smd'),
        isVirtual,
        boardOnly: tokens.has('board_only'),
        excludeFromPositionFiles:
            isVirtual || tokens.has('exclude_from_pos_files'),
        excludeFromBom: isVirtual || tokens.has('exclude_from_bom'),
        doNotPopulate: tokens.has('dnp'),
        allowMissingCourtyard: tokens.has('allow_missing_courtyard'),
        allowSolderMaskBridges:
            tokens.has('allow_soldermask_bridges') ||
            tokens.has('allow_solder_mask_bridges')
    }
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
 * Computes drawing and pad bounds.
 * @param {object[]} outlines
 * @param {object[]} pads
 * @param {object[]} drawings
 * @param {object[]} texts
 * @returns {object}
 */
function computeBoardBounds(outlines, pads, drawings, texts) {
    const outlinePoints = outlines.flatMap(
        KicadPcbDrawingParser.pointsForDrawing
    )
    const allPoints = [
        ...outlinePoints,
        ...pads.flatMap(KicadPcbPadParser.pointsForPad),
        ...drawings.flatMap(KicadPcbDrawingParser.pointsForDrawing),
        ...texts.map((text) => ({ x: text.x, y: text.y }))
    ]
    return Geometry.boundsFromPoints(
        outlinePoints.length > 0 ? outlinePoints : allPoints
    )
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
