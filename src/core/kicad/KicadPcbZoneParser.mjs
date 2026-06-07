// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadLayerResolver } from './KicadLayerResolver.mjs'
import { SExpressionTree } from './SExpressionTree.mjs'

/**
 * Parses KiCad filled zone polygons.
 */
export class KicadPcbZoneParser {
    /**
     * Parses zone-level semantic metadata without projecting it into copper.
     * @param {Array} root KiCad board root node.
     * @param {object} netResolver Net resolver.
     * @returns {object[]}
     */
    static parseZoneSemantics(root, netResolver) {
        return SExpressionTree.children(root, 'zone').map((node, zoneIndex) =>
            parseZoneSemanticRow(node, zoneIndex, netResolver)
        )
    }

    /**
     * Parses one zone node into filled polygon models.
     * @param {Array} node Zone node.
     * @param {number} zoneIndex Zone index.
     * @param {object} netResolver Net resolver.
     * @returns {object[]}
     */
    static parseZone(node, zoneIndex, netResolver) {
        const zoneLayer = SExpressionTree.textValue(
            SExpressionTree.child(node, 'layer')
        )
        const net = netResolver.resolveNode(
            SExpressionTree.child(node, 'net'),
            SExpressionTree.textValue(SExpressionTree.child(node, 'net_name'))
        )
        return SExpressionTree.children(node, 'filled_polygon')
            .map((polygonNode, polygonIndex) => {
                const layer =
                    SExpressionTree.textValue(
                        SExpressionTree.child(polygonNode, 'layer')
                    ) || zoneLayer
                const contours = parsePolygonContours(polygonNode)
                return {
                    id: `board:zone:${zoneIndex}:${polygonIndex}`,
                    ownerId: 'board',
                    sourceType: 'zone',
                    type: 'zone',
                    material: 'copper',
                    layer,
                    side: KicadLayerResolver.sideFromLayer(layer),
                    ...net,
                    strokeWidth: 0,
                    fill: true,
                    points: contours[0] || [],
                    contours
                }
            })
            .filter((zone) => zone.points.length > 0)
    }
}

/**
 * Builds one zone semantic row.
 * @param {Array} node Zone node.
 * @param {number} zoneIndex Zone index.
 * @param {object} netResolver Net resolver.
 * @returns {object}
 */
function parseZoneSemanticRow(node, zoneIndex, netResolver) {
    const layerKey = SExpressionTree.textValue(
        SExpressionTree.child(node, 'layer')
    )
    const net = netResolver.resolveNode(
        SExpressionTree.child(node, 'net'),
        SExpressionTree.textValue(SExpressionTree.child(node, 'net_name'))
    )
    const keepoutTargets = parseKeepoutTargets(
        SExpressionTree.child(node, 'keepout')
    )

    return stripEmpty({
        zoneIndex,
        uuid: SExpressionTree.textValue(SExpressionTree.child(node, 'uuid')),
        name: SExpressionTree.textValue(SExpressionTree.child(node, 'name')),
        layerKey,
        netName: net.netName || '',
        netIndex: net.netIndex,
        priority: SExpressionTree.numberValue(
            SExpressionTree.child(node, 'priority'),
            0
        ),
        points: parseOutlinePoints(SExpressionTree.child(node, 'polygon')),
        keepoutTargets,
        isKeepout: Object.values(keepoutTargets).some(Boolean)
    })
}

/**
 * Parses keepout target flags.
 * @param {Array | undefined} node Keepout node.
 * @returns {Record<string, boolean>}
 */
function parseKeepoutTargets(node) {
    if (!node) return {}
    return Object.fromEntries(
        SExpressionTree.children(node).map((entry) => [
            String(entry[0] || ''),
            String(entry[1] || '') === 'not_allowed'
        ])
    )
}

/**
 * Parses a zone outline polygon.
 * @param {Array | undefined} polygonNode Polygon node.
 * @returns {{ x: number, y: number }[]}
 */
function parseOutlinePoints(polygonNode) {
    return parsePoints(SExpressionTree.child(polygonNode, 'pts'))
}

/**
 * Parses all point contours from a filled polygon node.
 * @param {Array} polygonNode Filled polygon node.
 * @returns {{ x: number, y: number }[][]}
 */
function parsePolygonContours(polygonNode) {
    return SExpressionTree.children(polygonNode, 'pts')
        .map(parsePoints)
        .filter((points) => points.length > 0)
}

/**
 * Parses a KiCad pts node.
 * @param {Array} node Points node.
 * @returns {{ x: number, y: number }[]}
 */
function parsePoints(node) {
    return SExpressionTree.children(node, 'xy').map((entry) => ({
        x: SExpressionTree.numberValue(entry[1], 0),
        y: SExpressionTree.numberValue(entry[2], 0)
    }))
}

/**
 * Removes undefined and empty string fields.
 * @param {Record<string, unknown>} value Candidate object.
 * @returns {Record<string, unknown>}
 */
function stripEmpty(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entryValue]) => {
            return entryValue !== undefined && entryValue !== ''
        })
    )
}
