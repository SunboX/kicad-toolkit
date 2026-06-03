// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadLayerResolver } from './KicadLayerResolver.mjs'
import { SExpressionTree } from './SExpressionTree.mjs'

/**
 * Parses KiCad filled zone polygons.
 */
export class KicadPcbZoneParser {
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
