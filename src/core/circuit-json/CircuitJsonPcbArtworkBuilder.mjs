// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'

const Primitives = CircuitJsonModelAdapterPrimitives

/**
 * Builds Circuit JSON PCB artwork elements from parsed graphic drawings.
 */
export class CircuitJsonPcbArtworkBuilder {
    /**
     * Appends artwork elements for non-copper PCB graphics.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {unknown[]} drawings Parsed drawing rows.
     * @param {{ coordinateUnits?: 'mil' | 'mm', ownerComponentIds?: Map<string, string>, idParts?: unknown[] }} [options] Builder options.
     * @returns {void}
     */
    static append(circuitJson, idScope, drawings, options = {}) {
        for (const [drawingIndex, drawing] of Primitives.array(
            drawings
        ).entries()) {
            const element = CircuitJsonPcbArtworkBuilder.#element(
                idScope,
                drawing,
                drawingIndex,
                options
            )
            if (element) circuitJson.push(element)
        }
    }

    /**
     * Builds one artwork element.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} drawing Parsed drawing row.
     * @param {number} drawingIndex Drawing index.
     * @param {{ coordinateUnits?: 'mil' | 'mm', ownerComponentIds?: Map<string, string>, idParts?: unknown[] }} options Builder options.
     * @returns {object | null}
     */
    static #element(idScope, drawing, drawingIndex, options) {
        if (!drawing || typeof drawing !== 'object') return null
        if (CircuitJsonPcbArtworkBuilder.#isSkippedDrawing(drawing)) {
            return null
        }

        const type = CircuitJsonPcbArtworkBuilder.#elementType(drawing)
        if (!type) return null

        const shape = CircuitJsonPcbArtworkBuilder.#shape(
            drawing,
            options.coordinateUnits || 'mil'
        )
        if (!shape) return null

        const idField = CircuitJsonPcbArtworkBuilder.#idField(type)
        const element = {
            type,
            [idField]: Primitives.id(idScope, [
                type,
                ...(options.idParts || []),
                drawing.id || drawing.uuid || drawingIndex
            ]),
            layer: CircuitJsonPcbArtworkBuilder.#layer(drawing),
            width: CircuitJsonPcbArtworkBuilder.#length(
                drawing.strokeWidth ?? drawing.width,
                options.coordinateUnits || 'mil',
                0
            ),
            source_layer: String(drawing.layer || ''),
            source_type: String(drawing.sourceType || drawing.type || ''),
            ...shape
        }
        const ownerComponentId = CircuitJsonPcbArtworkBuilder.#ownerComponentId(
            drawing,
            options.ownerComponentIds
        )

        if (ownerComponentId) element.pcb_component_id = ownerComponentId
        return element
    }

    /**
     * Returns true when a drawing should not be serialized as artwork.
     * @param {Record<string, unknown>} drawing Parsed drawing row.
     * @returns {boolean}
     */
    static #isSkippedDrawing(drawing) {
        const layer = String(drawing.layer || '').trim()
        const type = String(drawing.type || '').toLowerCase()
        const material = String(drawing.material || '').toLowerCase()

        return (
            !layer ||
            layer === 'Edge.Cuts' ||
            material === 'copper' ||
            ['segment', 'via', 'zone'].includes(type)
        )
    }

    /**
     * Returns the Circuit JSON element type for a drawing.
     * @param {Record<string, unknown>} drawing Parsed drawing row.
     * @returns {string}
     */
    static #elementType(drawing) {
        const layer = String(drawing.layer || '').toLowerCase()

        if (layer.includes('silk')) return 'pcb_silkscreen_path'
        if (layer.includes('fab')) return 'pcb_fabrication_note_path'
        if (layer.includes('crtyd') || layer.includes('courtyard')) {
            return 'pcb_courtyard'
        }
        return ''
    }

    /**
     * Returns the primary id field for an artwork element type.
     * @param {string} type Circuit JSON element type.
     * @returns {string}
     */
    static #idField(type) {
        if (type === 'pcb_silkscreen_path') return 'pcb_silkscreen_path_id'
        if (type === 'pcb_fabrication_note_path') {
            return 'pcb_fabrication_note_path_id'
        }
        return 'pcb_courtyard_id'
    }

    /**
     * Builds a Circuit JSON shape payload.
     * @param {Record<string, unknown>} drawing Parsed drawing row.
     * @param {'mil' | 'mm'} coordinateUnits Drawing coordinate units.
     * @returns {object | null}
     */
    static #shape(drawing, coordinateUnits) {
        const type = String(drawing.type || '').toLowerCase()

        if (type === 'line')
            return CircuitJsonPcbArtworkBuilder.#lineShape(
                drawing,
                coordinateUnits
            )
        if (type === 'arc')
            return CircuitJsonPcbArtworkBuilder.#arcShape(
                drawing,
                coordinateUnits
            )
        if (type === 'circle') {
            return CircuitJsonPcbArtworkBuilder.#circleShape(
                drawing,
                coordinateUnits
            )
        }
        if (type === 'polygon' || type === 'rect') {
            return CircuitJsonPcbArtworkBuilder.#polygonShape(
                drawing,
                coordinateUnits
            )
        }
        if (type === 'curve' || type === 'dimension') {
            return CircuitJsonPcbArtworkBuilder.#polylineShape(
                drawing,
                coordinateUnits
            )
        }
        return null
    }

    /**
     * Builds a line shape payload.
     * @param {Record<string, unknown>} drawing Parsed drawing row.
     * @param {'mil' | 'mm'} coordinateUnits Drawing coordinate units.
     * @returns {object | null}
     */
    static #lineShape(drawing, coordinateUnits) {
        const start = CircuitJsonPcbArtworkBuilder.#point(
            drawing.start,
            coordinateUnits
        )
        const end = CircuitJsonPcbArtworkBuilder.#point(
            drawing.end,
            coordinateUnits
        )
        if (!start || !end) return null

        return {
            shape: 'line',
            start,
            end,
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            points: [start, end]
        }
    }

    /**
     * Builds an arc shape payload.
     * @param {Record<string, unknown>} drawing Parsed drawing row.
     * @param {'mil' | 'mm'} coordinateUnits Drawing coordinate units.
     * @returns {object | null}
     */
    static #arcShape(drawing, coordinateUnits) {
        const points = [drawing.start, drawing.mid, drawing.end]
            .map((point) =>
                CircuitJsonPcbArtworkBuilder.#point(point, coordinateUnits)
            )
            .filter(Boolean)
        if (points.length !== 3) return null

        return {
            shape: 'arc',
            start: points[0],
            mid: points[1],
            end: points[2],
            x1: points[0].x,
            y1: points[0].y,
            x2: points[2].x,
            y2: points[2].y,
            points
        }
    }

    /**
     * Builds a circle shape payload.
     * @param {Record<string, unknown>} drawing Parsed drawing row.
     * @param {'mil' | 'mm'} coordinateUnits Drawing coordinate units.
     * @returns {object | null}
     */
    static #circleShape(drawing, coordinateUnits) {
        const center = CircuitJsonPcbArtworkBuilder.#point(
            drawing.center,
            coordinateUnits
        )
        if (!center) return null

        return {
            shape: 'circle',
            center,
            x: center.x,
            y: center.y,
            radius: CircuitJsonPcbArtworkBuilder.#length(
                drawing.radius,
                coordinateUnits,
                0
            )
        }
    }

    /**
     * Builds a polygon shape payload.
     * @param {Record<string, unknown>} drawing Parsed drawing row.
     * @param {'mil' | 'mm'} coordinateUnits Drawing coordinate units.
     * @returns {object | null}
     */
    static #polygonShape(drawing, coordinateUnits) {
        const points = CircuitJsonPcbArtworkBuilder.#closedPoints(
            Primitives.array(drawing.points)
                .map((point) =>
                    CircuitJsonPcbArtworkBuilder.#point(point, coordinateUnits)
                )
                .filter(Boolean)
        )
        if (points.length < 4) return null

        return {
            shape: 'polygon',
            points
        }
    }

    /**
     * Builds a polyline shape payload.
     * @param {Record<string, unknown>} drawing Parsed drawing row.
     * @param {'mil' | 'mm'} coordinateUnits Drawing coordinate units.
     * @returns {object | null}
     */
    static #polylineShape(drawing, coordinateUnits) {
        const points = Primitives.array(drawing.points)
            .map((point) =>
                CircuitJsonPcbArtworkBuilder.#point(point, coordinateUnits)
            )
            .filter(Boolean)
        if (points.length < 2) return null

        return {
            shape: 'polyline',
            points
        }
    }

    /**
     * Converts a point into Circuit JSON millimeters.
     * @param {Record<string, unknown>} point Point-like value.
     * @param {'mil' | 'mm'} coordinateUnits Source coordinate units.
     * @returns {{ x: number, y: number } | null}
     */
    static #point(point, coordinateUnits) {
        if (!point || typeof point !== 'object') return null
        if (coordinateUnits === 'mm') return Primitives.point(point.x, point.y)
        return Primitives.milPoint(point.x, point.y)
    }

    /**
     * Converts a length into Circuit JSON millimeters.
     * @param {unknown} value Source length.
     * @param {'mil' | 'mm'} coordinateUnits Source coordinate units.
     * @param {number} fallback Fallback length.
     * @returns {number}
     */
    static #length(value, coordinateUnits, fallback) {
        if (coordinateUnits === 'mm') {
            return Primitives.round(Primitives.number(value, fallback) || 0)
        }
        return Primitives.milNumber(value, fallback)
    }

    /**
     * Closes a polygon point list when needed.
     * @param {{ x: number, y: number }[]} points Point list.
     * @returns {{ x: number, y: number }[]}
     */
    static #closedPoints(points) {
        if (points.length === 0) return []
        const first = points[0]
        const last = points[points.length - 1]
        if (first.x === last.x && first.y === last.y) return points
        return [...points, { ...first }]
    }

    /**
     * Returns a normalized Circuit JSON display layer for artwork.
     * @param {Record<string, unknown>} drawing Parsed drawing row.
     * @returns {string}
     */
    static #layer(drawing) {
        const layer = String(drawing.layer || '').toLowerCase()
        const side =
            layer.includes('bottom') || layer.startsWith('b.')
                ? 'bottom'
                : 'top'

        if (layer.includes('silk')) return `${side}_silkscreen`
        if (layer.includes('fab')) return `${side}_fabrication`
        if (layer.includes('crtyd') || layer.includes('courtyard')) {
            return `${side}_courtyard`
        }
        return side
    }

    /**
     * Resolves the owning PCB component id for a footprint-owned drawing.
     * @param {Record<string, unknown>} drawing Parsed drawing row.
     * @param {Map<string, string> | undefined} ownerComponentIds Owner lookup.
     * @returns {string}
     */
    static #ownerComponentId(drawing, ownerComponentIds) {
        if (!ownerComponentIds) return ''

        for (const key of [
            drawing.ownerId,
            drawing.footprintId,
            drawing.footprintReference,
            drawing.ownerIndex
        ]) {
            const value = String(key || '').trim()
            if (value && ownerComponentIds.has(value)) {
                return ownerComponentIds.get(value)
            }
        }

        return ''
    }
}
