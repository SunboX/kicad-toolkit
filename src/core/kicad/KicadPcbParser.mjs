// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later
import { Geometry } from './Geometry.mjs'
import { KicadLayerResolver } from './KicadLayerResolver.mjs'
import { KicadNetResolver } from './KicadNetResolver.mjs'
import { KicadPcbBoardMetadataParser } from './KicadPcbBoardMetadataParser.mjs'
import { KicadPcbDrawingParser } from './KicadPcbDrawingParser.mjs'
import { KicadPcbPadParser } from './KicadPcbPadParser.mjs'
import { KicadPcbTextVariables } from './KicadPcbTextVariables.mjs'
import { KicadPcbZoneParser } from './KicadPcbZoneParser.mjs'
import { SExpressionParser } from './SExpressionParser.mjs'
import { SExpressionTree } from './SExpressionTree.mjs'
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
        const fileName = String(options.fileName || '')
        const title = textValue(child(titleBlock, 'title')) || ''
        const revision = textValue(child(titleBlock, 'rev')) || ''
        const boardMetadata = parseBoardMetadata(root)
        const boardTextContext = {
            board: {
                ...boardMetadata,
                fileName,
                title,
                revision
            }
        }
        const netResolver = KicadNetResolver.fromNodes(children(root, 'net'))
        const zoneSemantics = KicadPcbZoneParser.parseZoneSemantics(
            root,
            netResolver
        )
        const boardGraphicItems = KicadPcbDrawingParser.parseBoardItems(
            root,
            netResolver
        )
        const footprints = children(root, ['footprint', 'module']).map(
            (node, index) => {
                return parseFootprint(
                    node,
                    index,
                    netResolver,
                    boardTextContext
                )
            }
        )
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
                return parseBoardText(node, index, boardTextContext)
            }),
            ...boardGraphicItems.texts.map((text) =>
                expandTextModel(text, boardTextContext)
            )
        ]
        const graphicDrawings = [...boardDrawings, ...footprintDrawings]
        const outlines = graphicDrawings.filter(
            (drawing) => drawing.layer === 'Edge.Cuts'
        )
        const drawings = graphicDrawings.filter(
            (drawing) => drawing.layer !== 'Edge.Cuts'
        )
        const texts = [...boardTexts, ...footprintTexts]
        const bounds = computeBoardBounds(
            outlines,
            pads,
            drawings,
            texts.filter(isVisibleTextModel)
        )
        const netRecords = netResolver.records()
        const statistics = KicadPcbBoardMetadataParser.buildStatistics({
            footprints,
            pads,
            nets: netRecords,
            classes: boardMetadata.classes,
            rules: boardMetadata.rules,
            outlines,
            drawings,
            texts
        })
        return {
            ...boardMetadata,
            fileName,
            title,
            revision,
            nets: netRecords,
            outlines,
            drawings,
            footprints,
            pads,
            texts,
            groups: [
                ...boardGraphicItems.groups,
                ...footprints.flatMap((footprint) => footprint.groups)
            ],
            zoneSemantics,
            generatedItems: [
                ...boardGraphicItems.generatedItems,
                ...footprints.flatMap((footprint) => footprint.generatedItems)
            ],
            bounds,
            statistics,
            diagnostics: []
        }
    }
}
/**
 * Parses board-level metadata declarations.
 * @param {Array} root Board root node.
 * @returns {object}
 */
function parseBoardMetadata(root) {
    const titleBlock = child(root, 'title_block')
    const setupNode = child(root, 'setup')
    const setup = parseSetup(setupNode)
    return {
        version: numberValue(child(root, 'version')?.[1], 0),
        generator: textValue(child(root, 'generator')),
        generatorVersion: textValue(child(root, 'generator_version')),
        embeddedFonts: booleanValue(child(root, 'embedded_fonts')?.[1], false),
        paper: parsePaper(child(root, 'paper')),
        titleBlock: parseTitleBlock(titleBlock),
        general: parseGeneral(child(root, 'general')),
        properties: SExpressionTree.propertyObject(root),
        layers: parseLayers(child(root, 'layers')),
        setup,
        classes: KicadPcbBoardMetadataParser.parseNetClasses(root),
        rules: KicadPcbBoardMetadataParser.parseSetupRules(setupNode)
    }
}
/**
 * Parses a paper declaration.
 * @param {Array | undefined} node Paper node.
 * @returns {{ size: string, width?: number, height?: number, portrait: boolean }}
 */
function parsePaper(node) {
    const size = textValue(node) || 'A4'
    const width = Number.isFinite(Number(node?.[2]))
        ? Number(node[2])
        : undefined
    const height = Number.isFinite(Number(node?.[3]))
        ? Number(node[3])
        : undefined
    return {
        size,
        ...(width === undefined ? {} : { width }),
        ...(height === undefined ? {} : { height }),
        portrait: node?.map(String).includes('portrait') || false
    }
}
/**
 * Parses title-block metadata.
 * @param {Array | undefined} node Title block node.
 * @returns {{ title: string, date: string, revision: string, company: string, comments: Record<string, string> }}
 */
function parseTitleBlock(node) {
    return {
        title: textValue(child(node, 'title')),
        date: textValue(child(node, 'date')),
        revision: textValue(child(node, 'rev')),
        company: textValue(child(node, 'company')),
        comments: Object.fromEntries(
            children(node, 'comment').map((comment) => [
                String(comment[1] || ''),
                String(comment[2] || '')
            ])
        )
    }
}
/**
 * Parses general board options.
 * @param {Array | undefined} node General node.
 * @returns {{ thickness?: number, legacyTeardrops?: boolean }}
 */
function parseGeneral(node) {
    if (!node) return {}
    return {
        thickness: numberValue(child(node, 'thickness')?.[1], 0),
        legacyTeardrops: hasChild(node, 'legacy_teardrops')
    }
}
/**
 * Parses declared board layer records.
 * @param {Array | undefined} node Layers node.
 * @returns {object[]}
 */
function parseLayers(node) {
    return children(node).map(parseLayer)
}
/**
 * Parses one declared board layer.
 * @param {Array} node Layer node.
 * @returns {{ ordinal: number, name: string, type: string, userName: string, uuid: string }}
 */
function parseLayer(node) {
    const scalarValues = node.filter((value) => !Array.isArray(value))
    return {
        ordinal: numberValue(scalarValues[0], 0),
        name: String(scalarValues[1] || ''),
        type: String(scalarValues[2] || ''),
        userName: String(scalarValues[3] || ''),
        uuid: textValue(child(node, 'uuid'))
    }
}
/**
 * Parses board setup options.
 * @param {Array | undefined} node Setup node.
 * @returns {object}
 */
function parseSetup(node) {
    if (!node) return {}
    return removeUndefinedValues({
        padToMaskClearance: optionalNumber(
            child(node, 'pad_to_mask_clearance')
        ),
        solderMaskMinWidth: optionalNumber(
            child(node, 'solder_mask_min_width')
        ),
        padToPasteClearance: optionalNumber(
            child(node, 'pad_to_paste_clearance')
        ),
        padToPasteClearanceRatio: optionalNumber(
            child(node, 'pad_to_paste_clearance_ratio')
        ),
        allowSoldermaskBridgesInFootprints: optionalBoolean(
            child(node, 'allow_soldermask_bridges_in_footprints')
        ),
        auxAxisOrigin: optionalVec2(child(node, 'aux_axis_origin')),
        gridOrigin: optionalVec2(child(node, 'grid_origin')),
        stackup: parseStackup(child(node, 'stackup')),
        pcbPlotParams: parsePcbPlotParams(child(node, 'pcbplotparams'))
    })
}
/**
 * Parses stackup metadata.
 * @param {Array | undefined} node Stackup node.
 * @returns {object | undefined}
 */
function parseStackup(node) {
    if (!node) return undefined
    return removeUndefinedValues({
        layers: children(node, 'layer').map(parseStackupLayer),
        copperFinish: optionalText(child(node, 'copper_finish')),
        dielectricConstraints: optionalBoolean(
            child(node, 'dielectric_constraints')
        ),
        edgeConnector: optionalText(child(node, 'edge_connector')),
        castellatedPads: optionalBoolean(child(node, 'castellated_pads')),
        edgePlating: optionalBoolean(child(node, 'edge_plating'))
    })
}

/**
 * Parses one stackup layer record.
 * @param {Array} node Stackup layer node.
 * @returns {object}
 */
function parseStackupLayer(node) {
    return {
        name: textValue(node),
        stackIndex: optionalNumber(['stack_index', node[2]]),
        type: optionalText(child(node, 'type')) || '',
        color: optionalText(child(node, 'color')) || '',
        thickness: optionalNumber(child(node, 'thickness')) || 0,
        material: optionalText(child(node, 'material')) || '',
        epsilonR: optionalNumber(child(node, 'epsilon_r')) || 0,
        lossTangent: optionalNumber(child(node, 'loss_tangent')) || 0,
        uuid: optionalText(child(node, 'uuid')) || ''
    }
}

/**
 * Parses PCB plot parameters as scalar values keyed by KiCad names.
 * @param {Array | undefined} node Plot parameter node.
 * @returns {Record<string, string | number | boolean> | undefined}
 */
function parsePcbPlotParams(node) {
    if (!node) return undefined
    return Object.fromEntries(
        children(node).map((entry) => [
            String(entry[0] || ''),
            parseScalarValue(entry[1])
        ])
    )
}

/**
 * Parses a scalar node value.
 * @param {unknown} value Scalar value.
 * @returns {string | number | boolean}
 */
function parseScalarValue(value) {
    if (value === 'yes' || value === 'true') return true
    if (value === 'no' || value === 'false') return false
    return typeof value === 'number' ? value : String(value ?? '')
}

/**
 * Reads optional text from a node.
 * @param {Array | undefined} node Value node.
 * @returns {string | undefined}
 */
function optionalText(node) {
    return node ? textValue(node) : undefined
}
/**
 * Reads optional number from a node.
 * @param {Array | undefined} node Value node.
 * @returns {number | undefined}
 */
function optionalNumber(node) {
    return node ? numberValue(node[1], 0) : undefined
}
/**
 * Reads optional boolean from a node.
 * @param {Array | undefined} node Value node.
 * @returns {boolean | undefined}
 */
function optionalBoolean(node) {
    if (!node) return undefined
    return node.length === 1 ? true : booleanValue(node[1], false)
}
/**
 * Reads optional two-coordinate value from a node.
 * @param {Array | undefined} node Coordinate node.
 * @returns {{ x: number, y: number } | undefined}
 */
function optionalVec2(node) {
    return node ? SExpressionTree.vec2(node) : undefined
}
/**
 * Removes undefined fields from an object.
 * @param {Record<string, unknown>} value Source object.
 * @returns {object}
 */
function removeUndefinedValues(value) {
    return Object.fromEntries(
        Object.entries(value).filter((entry) => entry[1] !== undefined)
    )
}

/**
 * Parses one footprint node.
 * @param {Array} node
 * @param {number} index
 * @param {KicadNetResolver} netResolver Net resolver.
 * @param {object} boardTextContext Board text context.
 * @returns {object}
 */
function parseFootprint(node, index, netResolver, boardTextContext) {
    const propertyNodes = children(node, 'property')
    const properties = parseFootprintProperties(propertyNodes)
    const referenceProperty = propertyNodes.find((entry) => {
        return String(entry[1] || '') === 'Reference'
    })
    const referenceText = children(node, 'fp_text').find((entry) => {
        return String(entry[1] || '') === 'reference'
    })
    const valueText = children(node, 'fp_text').find((entry) => {
        return String(entry[1] || '') === 'value'
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
    const models = parseFootprintModels(children(node, 'model'))
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
    const footprintValue =
        propertyText(properties, 'Value') || String(valueText?.[2] || '')
    const footprintName =
        propertyText(properties, 'Footprint') || String(node[1] || '')
    const footprintTextContext = {
        ...boardTextContext,
        footprint: {
            reference,
            value: footprintValue,
            layer,
            libraryName: String(node[1] || ''),
            footprintName,
            properties,
            pads
        }
    }
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
                excludeFromPositionFiles,
                footprintTextContext
            )
        }),
        ...children(node, 'fp_text').map((textNode, textIndex) => {
            return parseFootprintText(
                textNode,
                textIndex,
                id,
                transform,
                side,
                excludeFromPositionFiles,
                footprintTextContext
            )
        }),
        ...graphicItems.texts.map((text) =>
            expandTextModel(text, footprintTextContext)
        )
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
        sourceType: String(node[0] || 'footprint'),
        libraryName: String(node[1] || ''),
        reference,
        value: footprintValue,
        footprintName,
        properties,
        attributes,
        ...attributeFlags,
        layer,
        side,
        x: transform.x,
        y: transform.y,
        rotation: transform.rotation,
        models,
        pads,
        texts,
        drawings,
        groups: graphicItems.groups,
        generatedItems: graphicItems.generatedItems,
        bounds
    }
}

/**
 * Parses footprint 3D model metadata.
 * @param {Array[]} modelNodes Model nodes.
 * @returns {{ path: string, name: string, offset: { x: number, y: number, z: number }, scale: { x: number, y: number, z: number }, rotation: { x: number, y: number, z: number }, visible: boolean }[]}
 */
function parseFootprintModels(modelNodes) {
    return modelNodes.map((modelNode) => {
        const path = String(modelNode?.[1] || '')
        return {
            path,
            name: basename(path),
            offset: parseNestedXyz(modelNode, 'offset', 0),
            scale: parseNestedXyz(modelNode, 'scale', 1),
            rotation: parseNestedXyz(modelNode, 'rotate', 0),
            visible: !hasChild(modelNode, 'hide')
        }
    })
}

/**
 * Reads one nested `(name (xyz ...))` coordinate.
 * @param {Array | undefined} node Parent node.
 * @param {string} name Child node name.
 * @param {number} fallback Fallback coordinate value.
 * @returns {{ x: number, y: number, z: number }}
 */
function parseNestedXyz(node, name, fallback) {
    const xyz = child(child(node, name), 'xyz')
    return {
        x: numberValue(xyz?.[1], fallback),
        y: numberValue(xyz?.[2], fallback),
        z: numberValue(xyz?.[3], fallback)
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
 * @param {object} footprintTextContext Text expansion context.
 * @returns {object | null}
 */
function parseFootprintPropertyText(
    node,
    index,
    ownerId,
    transform,
    fallbackSide,
    excludeFromPositionFiles,
    footprintTextContext
) {
    return parseTextNode(node, {
        id: `${ownerId}:property:${index}`,
        ownerId,
        propertyName: String(node[1] || ''),
        value: String(node[2] || ''),
        transform,
        fallbackSide,
        keepUpright: hasKeepUprightTextRotation(node),
        visible:
            !hasChild(node, 'hide') &&
            !hasChild(child(node, 'effects'), 'hide'),
        excludeFromPositionFiles,
        textContext: footprintTextContext
    })
}

/**
 * Parses one footprint text node.
 * @param {Array} node
 * @param {number} index
 * @param {string} ownerId
 * @param {{ x: number, y: number, rotation: number }} transform
 * @param {string} fallbackSide
 * @param {boolean} excludeFromPositionFiles
 * @param {object} footprintTextContext Text expansion context.
 * @returns {object | null}
 */
function parseFootprintText(
    node,
    index,
    ownerId,
    transform,
    fallbackSide,
    excludeFromPositionFiles,
    footprintTextContext
) {
    const rawValue = String(node[2] || '')
    return parseTextNode(node, {
        id: `${ownerId}:text:${index}`,
        ownerId,
        value: rawValue,
        transform,
        fallbackSide,
        keepUpright: hasKeepUprightTextRotation(node),
        visible:
            !hasChild(node, 'hide') &&
            !hasChild(child(node, 'effects'), 'hide'),
        excludeFromPositionFiles,
        textContext: footprintTextContext
    })
}

/**
 * Parses board-level text.
 * @param {Array} node
 * @param {number} index
 * @param {object} boardTextContext Text expansion context.
 * @returns {object}
 */
function parseBoardText(node, index, boardTextContext) {
    return parseTextNode(node, {
        id: `board:text:${index}`,
        ownerId: 'board',
        propertyName: '',
        value: String(node[1] || ''),
        transform: { x: 0, y: 0, rotation: 0 },
        fallbackSide: 'both',
        keepUpright: false,
        visible:
            !hasChild(node, 'hide') &&
            !hasChild(child(node, 'effects'), 'hide'),
        excludeFromPositionFiles: false,
        textContext: boardTextContext
    })
}

/**
 * Expands a parsed text model value.
 * @param {object} text Text model.
 * @param {object} textContext Text expansion context.
 * @returns {object}
 */
function expandTextModel(text, textContext) {
    return {
        ...text,
        value: KicadPcbTextVariables.expand(text.value, {
            ...textContext,
            text: { layer: text.layer }
        })
    }
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
    const fontFace = textValue(child(font, 'face'))
    const size = child(font, 'size') || ['size', 1, 1]
    const justify = parseJustify(node)
    const rotation = transformTextRotation(
        localAt.rotation,
        context.transform,
        side
    )
    const value = KicadPcbTextVariables.expand(context.value, {
        ...(context.textContext || {}),
        text: { layer }
    })
    return {
        id: context.id,
        ownerId: context.ownerId,
        propertyName: context.propertyName || '',
        value,
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
        excludeFromPositionFiles: context.excludeFromPositionFiles === true,
        ...(fontFace ? { fontFace } : {})
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
 * @param {string | string[]} [name]
 * @returns {Array[]}
 */
function children(node, name) {
    return SExpressionTree.children(node, name)
}

/**
 * Finds the first direct child by name.
 * @param {Array | undefined} node
 * @param {string | string[]} name
 * @returns {Array | undefined}
 */
function child(node, name) {
    return SExpressionTree.child(node, name)
}

/**
 * Returns true when a child exists.
 * @param {Array | undefined} node
 * @param {string | string[]} name
 * @returns {boolean}
 */
function hasChild(node, name) {
    const hasHideFlag =
        name === 'hide' && Array.isArray(node) && node.includes('hide')
    return hasHideFlag || SExpressionTree.hasChild(node, name)
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
    return SExpressionTree.nodeName(node) === name
}

/**
 * Reads node text value.
 * @param {Array | undefined} node
 * @returns {string}
 */
function textValue(node) {
    return SExpressionTree.textValue(node)
}

/**
 * Returns a slash-normalized path basename.
 * @param {string} path Path value.
 * @returns {string}
 */
function basename(path) {
    return String(path || '')
        .replace(/\\/g, '/')
        .split('/')
        .at(-1)
}

/**
 * Reads a number with fallback.
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function numberValue(value, fallback) {
    return SExpressionTree.numberValue(value, fallback)
}
/**
 * Reads a KiCad boolean-like value with fallback.
 * @param {unknown} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function booleanValue(value, fallback) {
    return SExpressionTree.booleanValue(value, fallback)
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
