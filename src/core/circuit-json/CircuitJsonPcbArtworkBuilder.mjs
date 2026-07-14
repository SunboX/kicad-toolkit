// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'
import { KicadArcGeometry } from '../kicad/KicadArcGeometry.mjs'

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
            ...(drawing.fill === true ? { fill: true } : {}),
            source_layer: String(drawing.layer || ''),
            source_type: String(drawing.sourceType || drawing.type || ''),
            ...shape
        }
        const ownerComponentId = CircuitJsonPcbArtworkBuilder.#ownerComponentId(
            drawing,
            options.ownerComponentIds
        )

        if (ownerComponentId) element.pcb_component_id = ownerComponentId
        return CircuitJsonPcbArtworkBuilder.#canonicalElement(element)
    }

    /**
     * Projects one owned legacy artwork shape directly onto a pinned
     * CircuitJSON primitive.
     * @param {Record<string, any>} element Artwork element.
     * @returns {Record<string, any> | null} Canonical artwork element.
     */
    static #canonicalElement(element) {
        if (
            element.type === 'pcb_silkscreen_path' ||
            element.type === 'pcb_fabrication_note_path'
        ) {
            return CircuitJsonPcbArtworkBuilder.#canonicalPath(element)
        }
        if (element.type === 'pcb_courtyard') {
            return CircuitJsonPcbArtworkBuilder.#canonicalCourtyard(element)
        }
        return element
    }

    /**
     * Completes one silk or fabrication path, using a generic note path for
     * board-level artwork that has no component owner.
     * @param {Record<string, any>} element Artwork element.
     * @returns {Record<string, any> | null} Canonical path element.
     */
    static #canonicalPath(element) {
        const route = CircuitJsonPcbArtworkBuilder.#route(element)
        if (route.length < 2) return null
        const side = CircuitJsonPcbArtworkBuilder.#side(element.layer)
        const strokeWidth = Number(element.width) || 0
        if (!element.pcb_component_id) {
            const id =
                element.pcb_silkscreen_path_id ||
                element.pcb_fabrication_note_path_id
            delete element.pcb_silkscreen_path_id
            delete element.pcb_fabrication_note_path_id
            element.type = 'pcb_note_path'
            element.pcb_note_path_id = id
        }
        element.layer = side
        element.route = route
        element.stroke_width = strokeWidth
        return element
    }

    /**
     * Maps one courtyard shape to its shape-specific upstream element.
     * @param {Record<string, any>} element Courtyard artwork element.
     * @returns {Record<string, any> | null} Canonical courtyard element.
     */
    static #canonicalCourtyard(element) {
        if (!element.pcb_component_id) {
            return CircuitJsonPcbArtworkBuilder.#courtyardNotePath(element)
        }
        const id = element.pcb_courtyard_id
        const side = CircuitJsonPcbArtworkBuilder.#side(element.layer)
        delete element.pcb_courtyard_id
        element.layer = side

        if (element.shape === 'circle') {
            element.type = 'pcb_courtyard_circle'
            element.pcb_courtyard_circle_id = id
            return element
        }
        if (
            element.shape === 'polygon' &&
            String(element.source_type || '')
                .toLowerCase()
                .includes('rect') &&
            CircuitJsonPcbArtworkBuilder.#isAxisAlignedRectangle(element.points)
        ) {
            const bounds = CircuitJsonPcbArtworkBuilder.#bounds(element.points)
            if (!bounds) return null
            element.type = 'pcb_courtyard_rect'
            element.pcb_courtyard_rect_id = id
            element.center = {
                x: (bounds.minX + bounds.maxX) / 2,
                y: (bounds.minY + bounds.maxY) / 2
            }
            element.width = bounds.maxX - bounds.minX
            element.height = bounds.maxY - bounds.minY
            return element
        }
        if (element.shape === 'polygon') {
            if (!Array.isArray(element.points) || element.points.length < 3) {
                return null
            }
            element.type = 'pcb_courtyard_polygon'
            element.pcb_courtyard_polygon_id = id
            return element
        }

        const outline = CircuitJsonPcbArtworkBuilder.#route(element)
        if (outline.length < 2) return null
        element.type = 'pcb_courtyard_outline'
        element.pcb_courtyard_outline_id = id
        element.outline = outline
        return element
    }

    /**
     * Preserves unowned courtyard geometry as a generic PCB note path.
     * @param {Record<string, any>} element Courtyard artwork element.
     * @returns {Record<string, any> | null} Canonical note path.
     */
    static #courtyardNotePath(element) {
        const route = CircuitJsonPcbArtworkBuilder.#route(element)
        if (route.length < 2) return null
        const id = element.pcb_courtyard_id
        delete element.pcb_courtyard_id
        element.type = 'pcb_note_path'
        element.pcb_note_path_id = id
        element.layer = CircuitJsonPcbArtworkBuilder.#side(element.layer)
        element.route = route
        element.stroke_width = Number(element.width) || 0
        return element
    }

    /**
     * Returns a usable polyline for one artwork shape.
     * @param {Record<string, any>} element Artwork element.
     * @returns {{ x: number, y: number }[]} Canonical route points.
     */
    static #route(element) {
        if (
            element.shape === 'arc' &&
            element.start &&
            element.mid &&
            element.end
        ) {
            const route = KicadArcGeometry.toPolyline(
                element.start,
                element.mid,
                element.end
            ).map((point) => Primitives.point(point.x, point.y))
            route[0] = element.start
            route[route.length - 1] = element.end
            return route
        }
        if (Array.isArray(element.points)) return element.points
        if (element.start && element.end) {
            return [element.start, element.end]
        }
        if (
            element.shape === 'circle' &&
            element.center &&
            Number(element.radius) > 0
        ) {
            const points = []
            for (let index = 0; index <= 32; index += 1) {
                const angle = (index / 32) * Math.PI * 2
                points.push({
                    x: element.center.x + Math.cos(angle) * element.radius,
                    y: element.center.y + Math.sin(angle) * element.radius
                })
            }
            return points
        }
        return []
    }

    /**
     * Computes exact bounds for a point list.
     * @param {{ x: number, y: number }[]} points Point list.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null} Bounds.
     */
    static #bounds(points) {
        if (!Array.isArray(points) || points.length < 3) return null
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const point of points) {
            const x = Number(point.x)
            const y = Number(point.y)
            if (!Number.isFinite(x) || !Number.isFinite(y)) return null
            minX = Math.min(minX, x)
            minY = Math.min(minY, y)
            maxX = Math.max(maxX, x)
            maxY = Math.max(maxY, y)
        }
        return {
            minX,
            minY,
            maxX,
            maxY
        }
    }

    /**
     * Returns true when transformed rectangle points remain axis-aligned.
     * Rotated KiCad rectangles are emitted as polygons to preserve geometry.
     * @param {{ x: number, y: number }[]} points Rectangle point ring.
     * @returns {boolean} Whether every edge follows one board axis.
     */
    static #isAxisAlignedRectangle(points) {
        if (!Array.isArray(points)) return false
        const ring = points.slice()
        if (
            ring.length > 1 &&
            ring[0].x === ring[ring.length - 1].x &&
            ring[0].y === ring[ring.length - 1].y
        ) {
            ring.pop()
        }
        if (ring.length !== 4) return false
        const epsilon = 1e-9
        for (let index = 0; index < ring.length; index += 1) {
            const current = ring[index]
            const next = ring[(index + 1) % ring.length]
            const dx = Math.abs(Number(next.x) - Number(current.x))
            const dy = Math.abs(Number(next.y) - Number(current.y))
            const horizontal = dx > epsilon && dy <= epsilon
            const vertical = dy > epsilon && dx <= epsilon
            if (!horizontal && !vertical) return false
        }
        return true
    }

    /**
     * Returns the canonical top or bottom side for artwork.
     * @param {unknown} layer Layer name.
     * @returns {'top' | 'bottom'} Canonical side.
     */
    static #side(layer) {
        const value = String(layer || '').toLowerCase()
        return value.includes('bottom') || value.startsWith('b.')
            ? 'bottom'
            : 'top'
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
