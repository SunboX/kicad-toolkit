// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'

const Primitives = CircuitJsonModelAdapterPrimitives

/**
 * Builds schematic preview elements for standalone symbol-library entries.
 */
export class CircuitJsonSchematicSymbolPreviewBuilder {
    /**
     * Appends preview elements for one symbol-library entry.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} symbol Parsed symbol-library entry.
     * @param {number} symbolIndex Symbol index.
     * @param {string} sourceComponentId Source component id.
     * @param {Map<string, string>} sourcePortIdsByPinNumber Source port ids by pin number.
     * @returns {void}
     */
    static append(
        circuitJson,
        idScope,
        symbol,
        symbolIndex,
        sourceComponentId,
        sourcePortIdsByPinNumber
    ) {
        const schematicSymbolId = Primitives.id(idScope, [
            'schematic_symbol',
            symbol.name || symbol.itemName || symbolIndex
        ])
        const schematicComponentId = Primitives.id(idScope, [
            'schematic_component',
            'library_symbol',
            symbol.name || symbol.itemName || symbolIndex
        ])
        const bounds = CircuitJsonSchematicSymbolPreviewBuilder.#bounds(symbol)
        const bodyBounds =
            CircuitJsonSchematicSymbolPreviewBuilder.#bodyBounds(symbol) ||
            bounds

        circuitJson.push({
            type: 'schematic_symbol',
            schematic_symbol_id: schematicSymbolId,
            name: Primitives.string(symbol.name || symbol.itemName, 'SYMBOL')
        })
        circuitJson.push({
            type: 'schematic_component',
            schematic_component_id: schematicComponentId,
            source_component_id: sourceComponentId,
            schematic_symbol_id: schematicSymbolId,
            center: bounds.center,
            size: {
                width: bounds.width,
                height: bounds.height
            },
            symbol_display_value: Primitives.string(
                symbol.properties?.Value || symbol.itemName || symbol.name,
                ''
            )
        })

        CircuitJsonSchematicSymbolPreviewBuilder.#appendPorts(
            circuitJson,
            idScope,
            symbol,
            schematicComponentId,
            sourcePortIdsByPinNumber,
            bodyBounds
        )
        CircuitJsonSchematicSymbolPreviewBuilder.#appendGraphics(
            circuitJson,
            idScope,
            symbol,
            schematicComponentId,
            schematicSymbolId
        )
        CircuitJsonSchematicSymbolPreviewBuilder.#appendProperties(
            circuitJson,
            idScope,
            symbol,
            schematicComponentId,
            schematicSymbolId
        )
    }

    /**
     * Appends schematic ports and pin stub lines.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} symbol Parsed symbol-library entry.
     * @param {string} schematicComponentId Schematic component id.
     * @param {Map<string, string>} sourcePortIdsByPinNumber Source port ids by pin number.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bodyBounds Drawn symbol body bounds.
     * @returns {void}
     */
    static #appendPorts(
        circuitJson,
        idScope,
        symbol,
        schematicComponentId,
        sourcePortIdsByPinNumber,
        bodyBounds
    ) {
        for (const [pinIndex, pin] of Primitives.array(symbol.pins).entries()) {
            const pinNumber = String(pin.number || pinIndex + 1)
            const sourcePortId = sourcePortIdsByPinNumber.get(pinNumber)
            if (!sourcePortId) continue

            const outer = Primitives.point(pin.at?.x, pin.at?.y)
            const inner =
                CircuitJsonSchematicSymbolPreviewBuilder.#pinInnerPoint(pin)
            const placement =
                CircuitJsonSchematicSymbolPreviewBuilder.#portPlacement(
                    outer,
                    bodyBounds
                )

            circuitJson.push({
                type: 'schematic_port',
                schematic_port_id: Primitives.id(idScope, [
                    'schematic_port',
                    'library_symbol',
                    sourcePortId
                ]),
                schematic_component_id: schematicComponentId,
                source_port_id: sourcePortId,
                center: outer,
                facing_direction:
                    Primitives.facingDirection(pin) ||
                    CircuitJsonSchematicSymbolPreviewBuilder.#facingDirection(
                        pin.orientation
                    ),
                side_of_component: placement.side,
                distance_from_component_edge: placement.distance
            })
            circuitJson.push({
                type: 'schematic_line',
                schematic_line_id: Primitives.id(idScope, [
                    'schematic_line',
                    'library_pin',
                    sourcePortId
                ]),
                schematic_component_id: schematicComponentId,
                x1: outer.x,
                y1: outer.y,
                x2: inner.x,
                y2: inner.y,
                stroke_width: 0.15,
                is_dashed: false
            })
        }
    }

    /**
     * Appends parsed symbol graphics.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} symbol Parsed symbol-library entry.
     * @param {string} schematicComponentId Schematic component id.
     * @param {string} schematicSymbolId Schematic symbol id.
     * @returns {void}
     */
    static #appendGraphics(
        circuitJson,
        idScope,
        symbol,
        schematicComponentId,
        schematicSymbolId
    ) {
        const graphics = symbol.graphics || {}
        for (const [lineIndex, polyline] of Primitives.array(
            graphics.lines
        ).entries()) {
            CircuitJsonSchematicSymbolPreviewBuilder.#appendPolyline(
                circuitJson,
                idScope,
                schematicComponentId,
                schematicSymbolId,
                polyline,
                lineIndex
            )
        }
        for (const [rectIndex, rectangle] of Primitives.array(
            graphics.rectangles
        ).entries()) {
            const start = Primitives.point(
                rectangle.start?.x,
                rectangle.start?.y
            )
            const end = Primitives.point(rectangle.end?.x, rectangle.end?.y)
            circuitJson.push({
                type: 'schematic_rect',
                schematic_rect_id: Primitives.id(idScope, [
                    'schematic_rect',
                    schematicSymbolId,
                    rectIndex
                ]),
                schematic_component_id: schematicComponentId,
                schematic_symbol_id: schematicSymbolId,
                center: {
                    x: Primitives.round((start.x + end.x) / 2),
                    y: Primitives.round((start.y + end.y) / 2)
                },
                width: Math.abs(end.x - start.x),
                height: Math.abs(end.y - start.y),
                rotation: 0,
                stroke_width:
                    Primitives.number(rectangle.stroke?.width, 0.15) || 0.15,
                is_filled: rectangle.fill?.type !== 'none'
            })
        }
        for (const [circleIndex, circle] of Primitives.array(
            graphics.circles
        ).entries()) {
            circuitJson.push({
                type: 'schematic_circle',
                schematic_circle_id: Primitives.id(idScope, [
                    'schematic_circle',
                    schematicSymbolId,
                    circleIndex
                ]),
                schematic_component_id: schematicComponentId,
                schematic_symbol_id: schematicSymbolId,
                center: Primitives.point(circle.center?.x, circle.center?.y),
                radius: Primitives.number(circle.radius, 0),
                stroke_width:
                    Primitives.number(circle.stroke?.width, 0.15) || 0.15,
                is_filled: circle.fill?.type !== 'none'
            })
        }
        for (const [arcIndex, arc] of Primitives.array(
            graphics.arcs
        ).entries()) {
            circuitJson.push({
                type: 'schematic_arc',
                schematic_arc_id: Primitives.id(idScope, [
                    'schematic_arc',
                    schematicSymbolId,
                    arcIndex
                ]),
                schematic_component_id: schematicComponentId,
                schematic_symbol_id: schematicSymbolId,
                start: Primitives.point(arc.start?.x, arc.start?.y),
                mid: Primitives.point(arc.mid?.x, arc.mid?.y),
                end: Primitives.point(arc.end?.x, arc.end?.y),
                stroke_width:
                    Primitives.number(arc.stroke?.width, 0.15) || 0.15,
                is_filled: arc.fill?.type !== 'none'
            })
        }
        for (const [bezierIndex, bezier] of Primitives.array(
            graphics.beziers
        ).entries()) {
            circuitJson.push({
                type: 'schematic_path',
                schematic_path_id: Primitives.id(idScope, [
                    'schematic_path',
                    'bezier',
                    schematicSymbolId,
                    bezierIndex
                ]),
                schematic_component_id: schematicComponentId,
                schematic_symbol_id: schematicSymbolId,
                points: Primitives.array(bezier.points).map((point) =>
                    Primitives.point(point.x, point.y)
                ),
                stroke_width:
                    Primitives.number(bezier.stroke?.width, 0.15) || 0.15
            })
        }
    }

    /**
     * Appends polyline segments and filled paths.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {string} schematicComponentId Schematic component id.
     * @param {string} schematicSymbolId Schematic symbol id.
     * @param {Record<string, unknown>} polyline Polyline row.
     * @param {number} lineIndex Polyline index.
     * @returns {void}
     */
    static #appendPolyline(
        circuitJson,
        idScope,
        schematicComponentId,
        schematicSymbolId,
        polyline,
        lineIndex
    ) {
        const points = Primitives.array(polyline.points).map((point) =>
            Primitives.point(point.x, point.y)
        )
        if (points.length < 2) return

        if (polyline.fill?.type && polyline.fill.type !== 'none') {
            circuitJson.push({
                type: 'schematic_path',
                schematic_path_id: Primitives.id(idScope, [
                    'schematic_path',
                    'polyline',
                    schematicSymbolId,
                    lineIndex
                ]),
                schematic_component_id: schematicComponentId,
                schematic_symbol_id: schematicSymbolId,
                points,
                stroke_width:
                    Primitives.number(polyline.stroke?.width, 0.15) || 0.15,
                is_filled: true
            })
        }

        for (let index = 1; index < points.length; index += 1) {
            const start = points[index - 1]
            const end = points[index]
            circuitJson.push({
                type: 'schematic_line',
                schematic_line_id: Primitives.id(idScope, [
                    'schematic_line',
                    'symbol_polyline',
                    schematicSymbolId,
                    lineIndex,
                    index
                ]),
                schematic_component_id: schematicComponentId,
                schematic_symbol_id: schematicSymbolId,
                x1: start.x,
                y1: start.y,
                x2: end.x,
                y2: end.y,
                stroke_width:
                    Primitives.number(polyline.stroke?.width, 0.15) || 0.15,
                is_dashed: polyline.stroke?.type === 'dash'
            })
        }
    }

    /**
     * Appends visible symbol property text rows.
     * @param {object[]} circuitJson Circuit JSON element sink.
     * @param {string} idScope Deterministic id scope.
     * @param {Record<string, unknown>} symbol Parsed symbol-library entry.
     * @param {string} schematicComponentId Schematic component id.
     * @param {string} schematicSymbolId Schematic symbol id.
     * @returns {void}
     */
    static #appendProperties(
        circuitJson,
        idScope,
        symbol,
        schematicComponentId,
        schematicSymbolId
    ) {
        for (const [propertyIndex, property] of Primitives.array(
            symbol.propertyRows
        ).entries()) {
            if (property.hidden || !property.value) continue
            circuitJson.push({
                type: 'schematic_text',
                schematic_text_id: Primitives.id(idScope, [
                    'schematic_text',
                    'symbol_property',
                    schematicSymbolId,
                    propertyIndex
                ]),
                schematic_component_id: schematicComponentId,
                schematic_symbol_id: schematicSymbolId,
                text: Primitives.string(property.value, ''),
                position: Primitives.point(property.at?.x, property.at?.y),
                rotation: Primitives.number(property.at?.rotation, 0),
                anchor: 'center',
                font_size: 1.27
            })
        }
    }

    /**
     * Returns a symbol preview bounds descriptor.
     * @param {Record<string, unknown>} symbol Parsed symbol-library entry.
     * @returns {{ center: { x: number, y: number }, width: number, height: number }}
     */
    static #bounds(symbol) {
        const points = [
            ...Primitives.array(symbol.pins).map((pin) =>
                Primitives.point(pin.at?.x, pin.at?.y)
            ),
            ...CircuitJsonSchematicSymbolPreviewBuilder.#graphicPoints(symbol)
        ]
        if (points.length === 0) {
            return { center: { x: 0, y: 0 }, width: 1, height: 1 }
        }

        return CircuitJsonSchematicSymbolPreviewBuilder.#boundsFromPoints(
            points
        )
    }

    /**
     * Returns bounds around symbol graphics, excluding external pin endpoints.
     * @param {Record<string, unknown>} symbol Parsed symbol-library entry.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number, center: { x: number, y: number }, width: number, height: number } | null}
     */
    static #bodyBounds(symbol) {
        const points =
            CircuitJsonSchematicSymbolPreviewBuilder.#graphicPoints(symbol)
        if (points.length === 0) return null

        return CircuitJsonSchematicSymbolPreviewBuilder.#boundsFromPoints(
            points
        )
    }

    /**
     * Returns point samples from drawn symbol graphics.
     * @param {Record<string, unknown>} symbol Parsed symbol-library entry.
     * @returns {{ x: number, y: number }[]}
     */
    static #graphicPoints(symbol) {
        return [
            ...Primitives.array(symbol.graphics?.rectangles).flatMap(
                (rectangle) => [
                    Primitives.point(rectangle.start?.x, rectangle.start?.y),
                    Primitives.point(rectangle.end?.x, rectangle.end?.y)
                ]
            ),
            ...Primitives.array(symbol.graphics?.lines).flatMap((line) =>
                Primitives.array(line.points).map((point) =>
                    Primitives.point(point.x, point.y)
                )
            ),
            ...Primitives.array(symbol.graphics?.circles).flatMap((circle) => {
                const center = Primitives.point(
                    circle.center?.x,
                    circle.center?.y
                )
                const radius = Primitives.number(circle.radius, 0) || 0
                return [
                    { x: center.x - radius, y: center.y - radius },
                    { x: center.x + radius, y: center.y + radius }
                ]
            }),
            ...Primitives.array(symbol.graphics?.arcs).flatMap((arc) => [
                Primitives.point(arc.start?.x, arc.start?.y),
                Primitives.point(arc.mid?.x, arc.mid?.y),
                Primitives.point(arc.end?.x, arc.end?.y)
            ]),
            ...Primitives.array(symbol.graphics?.beziers).flatMap((bezier) =>
                Primitives.array(bezier.points).map((point) =>
                    Primitives.point(point.x, point.y)
                )
            )
        ]
    }

    /**
     * Returns a bounds descriptor for sampled points.
     * @param {{ x: number, y: number }[]} points Sampled points.
     * @returns {{ minX: number, maxX: number, minY: number, maxY: number, center: { x: number, y: number }, width: number, height: number }}
     */
    static #boundsFromPoints(points) {
        const xs = points.map((point) => point.x)
        const ys = points.map((point) => point.y)
        const minX = Math.min(...xs)
        const maxX = Math.max(...xs)
        const minY = Math.min(...ys)
        const maxY = Math.max(...ys)

        return {
            minX,
            maxX,
            minY,
            maxY,
            center: {
                x: Primitives.round((minX + maxX) / 2),
                y: Primitives.round((minY + maxY) / 2)
            },
            width: Primitives.round(Math.max(1, maxX - minX)),
            height: Primitives.round(Math.max(1, maxY - minY))
        }
    }

    /**
     * Returns the inner point of a pin stub.
     * @param {Record<string, unknown>} pin Parsed symbol pin.
     * @returns {{ x: number, y: number }}
     */
    static #pinInnerPoint(pin) {
        const outer = Primitives.point(pin.at?.x, pin.at?.y)
        const length = Primitives.number(pin.length, 0) || 0
        const orientation = String(pin.orientation || 'right')

        if (orientation === 'left') return { x: outer.x + length, y: outer.y }
        if (orientation === 'top') return { x: outer.x, y: outer.y + length }
        if (orientation === 'bottom') return { x: outer.x, y: outer.y - length }
        return { x: outer.x - length, y: outer.y }
    }

    /**
     * Returns a port's side and distance relative to drawn body bounds.
     * @param {{ x: number, y: number }} point Port center.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds Drawn body bounds.
     * @returns {{ side: 'left' | 'right' | 'top' | 'bottom', distance: number }}
     */
    static #portPlacement(point, bounds) {
        const horizontalOverflow =
            point.x < bounds.minX
                ? { side: 'left', distance: bounds.minX - point.x }
                : point.x > bounds.maxX
                  ? { side: 'right', distance: point.x - bounds.maxX }
                  : null
        const verticalOverflow =
            point.y < bounds.minY
                ? { side: 'bottom', distance: bounds.minY - point.y }
                : point.y > bounds.maxY
                  ? { side: 'top', distance: point.y - bounds.maxY }
                  : null
        const placement =
            CircuitJsonSchematicSymbolPreviewBuilder.#dominantOverflow(
                horizontalOverflow,
                verticalOverflow
            ) ||
            CircuitJsonSchematicSymbolPreviewBuilder.#nearestBodySide(
                point,
                bounds
            )

        return {
            side: placement.side,
            distance: Primitives.round(placement.distance)
        }
    }

    /**
     * Returns the larger outside-body overflow, preserving axial pin placement.
     * @param {{ side: string, distance: number } | null} horizontal Horizontal overflow.
     * @param {{ side: string, distance: number } | null} vertical Vertical overflow.
     * @returns {{ side: string, distance: number } | null}
     */
    static #dominantOverflow(horizontal, vertical) {
        if (horizontal && vertical) {
            return horizontal.distance >= vertical.distance
                ? horizontal
                : vertical
        }
        return horizontal || vertical
    }

    /**
     * Returns the nearest body side for ports located inside the body bounds.
     * @param {{ x: number, y: number }} point Port center.
     * @param {{ minX: number, maxX: number, minY: number, maxY: number }} bounds Drawn body bounds.
     * @returns {{ side: 'left' | 'right' | 'top' | 'bottom', distance: number }}
     */
    static #nearestBodySide(point, bounds) {
        return [
            { side: 'left', distance: Math.abs(point.x - bounds.minX) },
            { side: 'right', distance: Math.abs(point.x - bounds.maxX) },
            { side: 'top', distance: Math.abs(point.y - bounds.maxY) },
            { side: 'bottom', distance: Math.abs(point.y - bounds.minY) }
        ].toSorted((a, b) => {
            return a.distance - b.distance
        })[0]
    }

    /**
     * Returns a Circuit JSON facing direction.
     * @param {unknown} orientation Parsed orientation.
     * @returns {'up' | 'down' | 'left' | 'right'}
     */
    static #facingDirection(orientation) {
        const normalized = String(orientation || '').toLowerCase()
        if (normalized === 'top') return 'up'
        if (normalized === 'bottom') return 'down'
        if (normalized === 'left') return 'left'
        return 'right'
    }
}
