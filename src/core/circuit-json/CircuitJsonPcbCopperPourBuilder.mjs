// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapterElements } from './CircuitJsonModelAdapterElements.mjs'
import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'

const Elements = CircuitJsonModelAdapterElements
const Primitives = CircuitJsonModelAdapterPrimitives

/**
 * Builds Circuit JSON copper-pour elements from renderer PCB polygons.
 */
export class CircuitJsonPcbCopperPourBuilder {
    /**
     * Appends copper pours from PCB polygon-like primitives.
     * @param {object[]} circuitJson Circuit JSON elements.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} pcb Renderer PCB model.
     * @param {Map<string, string>} sourceNetIds Known source net ids.
     * @returns {void}
     */
    static append(circuitJson, idScope, pcb, sourceNetIds) {
        for (const [pourIndex, polygon] of Primitives.array(
            pcb.polygons
        ).entries()) {
            if (!CircuitJsonPcbCopperPourBuilder.#isCopperPolygon(polygon)) {
                continue
            }

            const points =
                CircuitJsonPcbCopperPourBuilder.#pointsForPolygon(polygon)
            if (points.length < 4) continue

            const sourceNetId = Elements.sourceNetIdForPrimitive(
                circuitJson,
                idScope,
                polygon,
                sourceNetIds
            )
            const element = {
                type: 'pcb_copper_pour',
                pcb_copper_pour_id: Primitives.id(idScope, [
                    'pcb_copper_pour',
                    pourIndex
                ]),
                layer: Primitives.layerName(polygon),
                shape: 'polygon',
                points
            }
            const netName = String(
                polygon.netName || polygon.net || polygon.netIndex || ''
            ).trim()

            if (netName) {
                element.net_name = Primitives.sourceNetName(netName, 'NET')
                if (element.net_name !== netName) {
                    element.raw_net_name = netName
                }
            }
            if (sourceNetId) element.source_net_id = sourceNetId
            circuitJson.push(element)
        }
    }

    /**
     * Returns true when a polygon should become a copper pour.
     * @param {Record<string, unknown>} polygon Polygon primitive.
     * @returns {boolean}
     */
    static #isCopperPolygon(polygon) {
        const layer = String(polygon?.layer || polygon?.layerName || '')
            .toLowerCase()
            .trim()
        if (!layer) return false
        if (layer.includes('edge') || layer.includes('silk')) return false
        if (layer.includes('fab') || layer.includes('courtyard')) return false
        if (layer.includes('mask') || layer.includes('paste')) return false
        return (
            layer === 'f.cu' ||
            layer === 'b.cu' ||
            layer === 'top' ||
            layer === 'bottom' ||
            /^in\d+\.cu$/u.test(layer)
        )
    }

    /**
     * Returns closed Circuit JSON points for one polygon.
     * @param {Record<string, unknown>} polygon Polygon primitive.
     * @returns {{ x: number, y: number }[]}
     */
    static #pointsForPolygon(polygon) {
        if (Array.isArray(polygon.contours) && polygon.contours.length > 0) {
            return CircuitJsonPcbCopperPourBuilder.#pointsFromSegments(
                polygon.contours[0]
            )
        }
        if (Array.isArray(polygon.segments) && polygon.segments.length > 0) {
            return CircuitJsonPcbCopperPourBuilder.#pointsFromSegments(
                polygon.segments
            )
        }
        if (Array.isArray(polygon.points) && polygon.points.length > 0) {
            return CircuitJsonPcbCopperPourBuilder.#closedPoints(
                polygon.points.map((point) =>
                    Primitives.milPoint(point.x, point.y)
                )
            )
        }
        return []
    }

    /**
     * Converts mil segment records to a closed point list.
     * @param {object[]} segments Polygon segments.
     * @returns {{ x: number, y: number }[]}
     */
    static #pointsFromSegments(segments) {
        const points = Primitives.array(segments).map((segment) =>
            Primitives.milPoint(segment.x1, segment.y1)
        )
        const last = segments[segments.length - 1]
        if (last) points.push(Primitives.milPoint(last.x2, last.y2))
        return CircuitJsonPcbCopperPourBuilder.#closedPoints(points)
    }

    /**
     * Ensures a polygon point list is explicitly closed.
     * @param {{ x: number, y: number }[]} points Points.
     * @returns {{ x: number, y: number }[]}
     */
    static #closedPoints(points) {
        if (points.length < 2) return points
        const first = points[0]
        const last = points[points.length - 1]
        if (
            Math.abs(first.x - last.x) < 1e-6 &&
            Math.abs(first.y - last.y) < 1e-6
        ) {
            return points
        }
        return [...points, { ...first }]
    }
}
