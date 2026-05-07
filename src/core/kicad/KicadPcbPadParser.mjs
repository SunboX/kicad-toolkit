// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { Geometry } from './Geometry.mjs'
import { KicadLayerResolver } from './KicadLayerResolver.mjs'

/**
 * Parses KiCad PCB pad geometry, drill, custom primitive, and padstack detail.
 */
export class KicadPcbPadParser {
    /**
     * Parses one pad.
     * @param {Array} node Pad node.
     * @param {object} context Parser context.
     * @returns {object}
     */
    static parsePad(node, context) {
        const localAt = parseAt(child(node, 'at'))
        const position = transformLocalPoint(localAt, context.transform)
        const size = parseSize(child(node, 'size'), { width: 1, height: 1 })
        const layerResolution = KicadLayerResolver.resolvePadLayers(
            (child(node, 'layers') || []).slice(1).map(String),
            context.transform
        )
        const layers = layerResolution.layers
        const drill = parseDrill(child(node, 'drill'), String(node[2] || ''))
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
            width: size.width,
            height: size.height,
            drill: drill.diameter,
            drillWidth: drill.width,
            drillHeight: drill.height,
            drillShape: drill.shape,
            drillOffset: drill.offset,
            roundrectRatio: numberValue(
                child(node, 'roundrect_rratio')?.[1],
                0.25
            ),
            layers,
            side: KicadLayerResolver.sideFromLayers(layers),
            ...context.netResolver.resolveNode(child(node, 'net')),
            ...parsePadDetail(node)
        }
    }

    /**
     * Returns representative points for a pad.
     * @param {object} pad Pad.
     * @returns {{ x: number, y: number }[]}
     */
    static pointsForPad(pad) {
        const halfWidth = pad.width / 2
        const halfHeight = pad.height / 2
        return [
            { x: pad.x - halfWidth, y: pad.y - halfHeight },
            { x: pad.x + halfWidth, y: pad.y + halfHeight }
        ]
    }
}

/**
 * Parses optional detailed KiCad pad fields.
 * @param {Array} node Pad node.
 * @returns {object}
 */
function parsePadDetail(node) {
    return {
        rectDelta: parseVector(child(node, 'rect_delta'), { x: 0, y: 0 }),
        backdrill: parseDrillProps(child(node, 'backdrill')),
        tertiaryDrill: parseDrillProps(child(node, 'tertiary_drill')),
        pinFunction: textValue(child(node, 'pinfunction')),
        pinType: textValue(child(node, 'pintype')),
        dieLength: optionalNumber(child(node, 'die_length')),
        dieDelay: optionalNumber(child(node, 'die_delay')),
        solderMaskMargin: optionalNumber(child(node, 'solder_mask_margin')),
        solderPasteMargin: optionalNumber(child(node, 'solder_paste_margin')),
        solderPasteMarginRatio: optionalNumber(
            child(node, 'solder_paste_margin_ratio')
        ),
        clearance: optionalNumber(child(node, 'clearance')),
        teardrops: parseTeardrops(child(node, 'teardrops')),
        zoneConnect: optionalNumber(child(node, 'zone_connect')) ?? null,
        thermalBridgeWidth: optionalNumber(
            child(node, 'thermal_bridge_width') || child(node, 'thermal_width')
        ),
        thermalBridgeAngle: optionalNumber(child(node, 'thermal_bridge_angle')),
        thermalGap: optionalNumber(child(node, 'thermal_gap')),
        chamferRatio: optionalNumber(child(node, 'chamfer_ratio')),
        chamfers: parseScalarList(child(node, 'chamfer')),
        padProperties: parseScalarList(child(node, 'property')),
        options: parseOptions(child(node, 'options')),
        customPrimitives: parsePrimitives(child(node, 'primitives')),
        removeUnusedLayers: optionalBool(child(node, 'remove_unused_layers')),
        keepEndLayers: optionalBool(child(node, 'keep_end_layers')),
        tenting: parseFrontBack(child(node, 'tenting')),
        zoneLayerConnections: parseScalarList(
            child(node, 'zone_layer_connections')
        ),
        padstack: parsePadstack(child(node, 'padstack')),
        frontPostMachining: parsePostMachining(
            child(node, 'front_post_machining')
        ),
        backPostMachining: parsePostMachining(
            child(node, 'back_post_machining')
        )
    }
}

/**
 * Parses a drill node.
 * @param {Array | undefined} node Drill node.
 * @param {string} padType Pad type.
 * @returns {{ diameter: number, width: number, height: number, shape: string, offset: { x: number, y: number } }}
 */
function parseDrill(node, padType) {
    if (!node) {
        const fallback = padType === 'thru_hole' || padType === 'np_thru_hole'
        return {
            diameter: fallback ? 0 : 0,
            width: fallback ? 0 : 0,
            height: fallback ? 0 : 0,
            shape: 'circle',
            offset: { x: 0, y: 0 }
        }
    }

    const numbers = node.slice(1).filter((value) => typeof value === 'number')
    const width = numberValue(numbers[0], 0)
    const height = numberValue(numbers[1], width)
    return {
        diameter: Math.min(width || height, height || width),
        width,
        height,
        shape: node.slice(1).map(String).includes('oval') ? 'oval' : 'circle',
        offset: parseVector(child(node, 'offset'), { x: 0, y: 0 })
    }
}

/**
 * Parses secondary drill properties.
 * @param {Array | undefined} node Drill property node.
 * @returns {{ size: number, layers: string[] } | null}
 */
function parseDrillProps(node) {
    if (!node) return null
    return {
        size: numberValue(child(node, 'size')?.[1], 0),
        layers: (child(node, 'layers') || []).slice(1).map(String)
    }
}

/**
 * Parses post-machining properties.
 * @param {Array | undefined} node Post-machining node.
 * @returns {object | null}
 */
function parsePostMachining(node) {
    if (!node) return null
    return {
        mode: String(node[1] || ''),
        size: optionalNumber(child(node, 'size')),
        depth: optionalNumber(child(node, 'depth')),
        angle: optionalNumber(child(node, 'angle'))
    }
}

/**
 * Parses a padstack node.
 * @param {Array | undefined} node Padstack node.
 * @returns {{ mode: string, layers: object[] }}
 */
function parsePadstack(node) {
    if (!node) return { mode: '', layers: [] }
    return {
        mode: textValue(child(node, 'mode')),
        layers: children(node, 'layer').map(parsePadstackLayer)
    }
}

/**
 * Parses one padstack layer.
 * @param {Array} node Padstack layer node.
 * @returns {object}
 */
function parsePadstackLayer(node) {
    return {
        layer: String(node[1] || ''),
        shape: textValue(child(node, 'shape')),
        size: parseSize(child(node, 'size'), { width: 0, height: 0 }),
        offset: parseVector(child(node, 'offset'), { x: 0, y: 0 }),
        rectDelta: parseVector(child(node, 'rect_delta'), { x: 0, y: 0 }),
        roundrectRatio: optionalNumber(child(node, 'roundrect_rratio')),
        chamferRatio: optionalNumber(child(node, 'chamfer_ratio')),
        chamfers: parseScalarList(child(node, 'chamfer')),
        thermalBridgeWidth: optionalNumber(child(node, 'thermal_bridge_width')),
        thermalGap: optionalNumber(child(node, 'thermal_gap')),
        thermalBridgeAngle: optionalNumber(child(node, 'thermal_bridge_angle')),
        zoneConnect: optionalNumber(child(node, 'zone_connect')) ?? null,
        clearance: optionalNumber(child(node, 'clearance')),
        tenting: parseFrontBack(child(node, 'tenting')),
        options: parseOptions(child(node, 'options')),
        primitives: parsePrimitives(child(node, 'primitives'))
    }
}

/**
 * Parses custom pad options.
 * @param {Array | undefined} node Options node.
 * @returns {{ anchor?: string, clearance?: string }}
 */
function parseOptions(node) {
    if (!node) return {}
    const result = {}
    for (const entry of children(node)) {
        if (entry[0] === 'anchor') result.anchor = String(entry[1] || '')
        if (entry[0] === 'clearance') result.clearance = String(entry[1] || '')
    }
    return result
}

/**
 * Parses teardrop parameters.
 * @param {Array | undefined} node Teardrops node.
 * @returns {object | null}
 */
function parseTeardrops(node) {
    if (!node) return null
    return {
        enabled: optionalBool(child(node, 'enabled')),
        allowTwoSegments: optionalBool(child(node, 'allow_two_segments')),
        preferZoneConnections:
            optionalBool(child(node, 'prefer_zone_connections')) === undefined
                ? undefined
                : !optionalBool(child(node, 'prefer_zone_connections')),
        bestLengthRatio: optionalNumber(child(node, 'best_length_ratio')),
        maxLength: optionalNumber(child(node, 'max_length')),
        bestWidthRatio: optionalNumber(child(node, 'best_width_ratio')),
        maxWidth: optionalNumber(child(node, 'max_width')),
        curvedEdges:
            optionalBool(child(node, 'curved_edges')) ??
            optionalCurvePoints(child(node, 'curve_points')),
        filterRatio: optionalNumber(child(node, 'filter_ratio'))
    }
}

/**
 * Parses front/back optional boolean nodes.
 * @param {Array | undefined} node Front/back node.
 * @returns {{ front?: boolean | null, back?: boolean | null } | null}
 */
function parseFrontBack(node) {
    if (!node) return null
    const result = {}
    for (const value of node.slice(1)) {
        if (Array.isArray(value) && value[0] === 'front') {
            result.front = optionalTriState(value)
        } else if (Array.isArray(value) && value[0] === 'back') {
            result.back = optionalTriState(value)
        } else if (String(value) === 'front') {
            result.front = true
        } else if (String(value) === 'back') {
            result.back = true
        } else if (String(value) === 'none') {
            result.front = null
            result.back = null
        }
    }
    return result
}

/**
 * Parses custom primitive nodes.
 * @param {Array | undefined} node Primitives node.
 * @returns {object[]}
 */
function parsePrimitives(node) {
    return children(node).map(parsePrimitive)
}

/**
 * Parses one custom primitive node.
 * @param {Array} node Primitive node.
 * @returns {object}
 */
function parsePrimitive(node) {
    const sourceType = String(node[0] || '')
    const layer = textValue(child(node, 'layer'))
    const base = {
        sourceType,
        type: primitiveType(sourceType),
        layer,
        strokeWidth: numberValue(child(child(node, 'stroke'), 'width')?.[1], 0),
        fill: ['yes', 'solid'].includes(String(child(node, 'fill')?.[1] || ''))
    }
    if (base.type === 'line') {
        return {
            ...base,
            start: parseVector(child(node, 'start'), { x: 0, y: 0 }),
            end: parseVector(child(node, 'end'), { x: 0, y: 0 })
        }
    }
    if (base.type === 'circle') {
        return {
            ...base,
            center: parseVector(child(node, 'center'), { x: 0, y: 0 }),
            end: parseVector(child(node, 'end'), { x: 0, y: 0 })
        }
    }
    if (base.type === 'arc') {
        return {
            ...base,
            start: parseVector(child(node, 'start'), { x: 0, y: 0 }),
            mid: parseVector(child(node, 'mid'), { x: 0, y: 0 }),
            end: parseVector(child(node, 'end'), { x: 0, y: 0 })
        }
    }
    return { ...base, points: parsePoints(child(node, 'pts')) }
}

/**
 * Maps primitive source names to normalized types.
 * @param {string} sourceType Source type.
 * @returns {string}
 */
function primitiveType(sourceType) {
    if (sourceType === 'gr_line' || sourceType === 'gr_vector') return 'line'
    if (sourceType === 'gr_circle') return 'circle'
    if (sourceType === 'gr_arc') return 'arc'
    if (sourceType === 'gr_curve') return 'curve'
    return 'polygon'
}

/**
 * Parses a size node.
 * @param {Array | undefined} node Size node.
 * @param {{ width: number, height: number }} fallback Fallback size.
 * @returns {{ width: number, height: number }}
 */
function parseSize(node, fallback) {
    return {
        width: numberValue(node?.[1], fallback.width),
        height: numberValue(node?.[2], numberValue(node?.[1], fallback.height))
    }
}

/**
 * Parses an XY vector node.
 * @param {Array | undefined} node Vector node.
 * @param {{ x: number, y: number }} fallback Fallback vector.
 * @returns {{ x: number, y: number }}
 */
function parseVector(node, fallback) {
    return {
        x: numberValue(node?.[1], fallback.x),
        y: numberValue(node?.[2], fallback.y)
    }
}

/**
 * Parses a KiCad pts node.
 * @param {Array | undefined} node Points node.
 * @returns {{ x: number, y: number }[]}
 */
function parsePoints(node) {
    return children(node, 'xy').map((entry) =>
        parseVector(entry, { x: 0, y: 0 })
    )
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
 * Transforms pad rotation into board coordinates.
 * @param {number} localRotation Local rotation.
 * @param {{ rotation: number }} transform Footprint transform.
 * @param {boolean} [preserveLocalRotation] Preserve local rotation.
 * @returns {number}
 */
function transformPrimitiveRotation(
    localRotation,
    transform,
    preserveLocalRotation = false
) {
    if (preserveLocalRotation) {
        return normalizeRotation(
            transform.side === 'back' ? -localRotation : localRotation
        )
    }
    return normalizeRotation(localRotation - numberValue(transform.rotation, 0))
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
 * Parses scalar strings from a node.
 * @param {Array | undefined} node Node.
 * @returns {string[]}
 */
function parseScalarList(node) {
    if (!node) return []
    return node
        .slice(1)
        .filter((value) => !Array.isArray(value))
        .map(String)
}

/**
 * Parses optional number from a node.
 * @param {Array | undefined} node Node.
 * @returns {number | undefined}
 */
function optionalNumber(node) {
    if (!node || node[1] === undefined) return undefined
    return numberValue(node[1], undefined)
}

/**
 * Parses optional boolean from a node.
 * @param {Array | undefined} node Node.
 * @returns {boolean | undefined}
 */
function optionalBool(node) {
    if (!node) return undefined
    if (node.length === 1) return true
    return booleanValue(node[1], true)
}

/**
 * Parses optional KiCad yes/no/none value.
 * @param {Array} node Node.
 * @returns {boolean | null}
 */
function optionalTriState(node) {
    if (node.length === 1) return true
    if (String(node[1]) === 'none') return null
    return booleanValue(node[1], true)
}

/**
 * Parses legacy curve point count.
 * @param {Array | undefined} node Node.
 * @returns {boolean | undefined}
 */
function optionalCurvePoints(node) {
    if (!node) return undefined
    return numberValue(node[1], 0) > 0
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
 * @param {number | undefined} fallback Fallback value.
 * @returns {number | undefined}
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

/**
 * Normalizes a rotation.
 * @param {number} rotation Rotation.
 * @returns {number}
 */
function normalizeRotation(rotation) {
    const value = Number(rotation) || 0
    return ((value % 360) + 360) % 360
}
