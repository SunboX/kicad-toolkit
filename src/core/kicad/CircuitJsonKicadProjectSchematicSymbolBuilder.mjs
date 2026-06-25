// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'
import { CircuitJsonKicadProjectSchematicArcBuilder as ArcBuilder } from './CircuitJsonKicadProjectSchematicArcBuilder.mjs'

const GRAPHIC_TYPES = new Set([
    'schematic_path',
    'schematic_line',
    'schematic_circle',
    'schematic_arc',
    'schematic_rect',
    'schematic_box',
    'schematic_text'
])

/**
 * Builds KiCad library symbol bodies from custom schematic symbol rows.
 */
export class CircuitJsonKicadProjectSchematicSymbolBuilder {
    /**
     * Builds custom symbol body nodes for one component row.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {Array[] | null}
     */
    static nodes(context, row) {
        const symbol =
            row.schematicSymbol ||
            CircuitJsonKicadProjectSchematicSymbolBuilder.symbolFor(
                context.elements,
                row.schematicComponent
            )
        if (!symbol) return null

        const ports =
            CircuitJsonKicadProjectSchematicSymbolBuilder.#schematicPorts(
                context,
                row,
                symbol
            )
        const graphics =
            CircuitJsonKicadProjectSchematicSymbolBuilder.#graphicNodes(
                context,
                row,
                symbol
            )

        return [
            ...(graphics.length
                ? graphics
                : [
                      CircuitJsonKicadProjectSchematicSymbolBuilder.#fallbackBodyNode(
                          row,
                          symbol
                      )
                  ].filter(Boolean)),
            ...ports.map((port, index) =>
                CircuitJsonKicadProjectSchematicSymbolBuilder.#pinNode(
                    context,
                    row,
                    symbol,
                    port,
                    index
                )
            )
        ]
    }

    /**
     * Builds component-scoped artwork for generated symbol bodies.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {Array[]}
     */
    static componentArtworkNodes(context, row) {
        const componentId = Utils.text(
            row.schematicComponent?.schematic_component_id
        )
        if (!componentId) return []

        const center =
            CircuitJsonKicadProjectSchematicSymbolBuilder.#symbolCenter(
                row,
                null
            )
        return context.elements
            .filter((element) =>
                CircuitJsonKicadProjectSchematicSymbolBuilder.#isComponentArtworkForRow(
                    element,
                    componentId
                )
            )
            .map((element) =>
                CircuitJsonKicadProjectSchematicSymbolBuilder.#graphicNode(
                    center,
                    element
                )
            )
            .filter(Boolean)
    }

    /**
     * Builds custom symbol-local pin anchors for one component row.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {{ sourcePortId: string, point: { x: number, y: number } }[] | null}
     */
    static pinAnchors(context, row) {
        const symbol =
            row.schematicSymbol ||
            CircuitJsonKicadProjectSchematicSymbolBuilder.symbolFor(
                context.elements,
                row.schematicComponent
            )
        if (!symbol) return null

        const ports =
            CircuitJsonKicadProjectSchematicSymbolBuilder.#schematicPorts(
                context,
                row,
                symbol
            )
        const graphics =
            CircuitJsonKicadProjectSchematicSymbolBuilder.#graphicNodes(
                context,
                row,
                symbol
            )

        return ports
            .map((port, index) =>
                CircuitJsonKicadProjectSchematicSymbolBuilder.#pinAnchor(
                    context,
                    row,
                    symbol,
                    port,
                    index
                )
            )
            .filter(Boolean)
    }

    /**
     * Finds the custom schematic symbol used by a component.
     * @param {object[]} elements CircuitJSON elements.
     * @param {object | null} schematicComponent Schematic component row.
     * @returns {object | null}
     */
    static symbolFor(elements, schematicComponent) {
        const symbolId =
            Utils.text(schematicComponent?.schematic_symbol_id) ||
            CircuitJsonKicadProjectSchematicSymbolBuilder.#linkedSymbolId(
                elements,
                schematicComponent
            )
        if (!symbolId) return null
        return (
            elements.find(
                (element) =>
                    element?.type === 'schematic_symbol' &&
                    Utils.text(element.schematic_symbol_id) === symbolId
            ) || null
        )
    }

    /**
     * Resolves a symbol id from graphics linked to a schematic component.
     * @param {object[]} elements CircuitJSON elements.
     * @param {object | null} schematicComponent Schematic component row.
     * @returns {string}
     */
    static #linkedSymbolId(elements, schematicComponent) {
        const componentId = Utils.text(
            schematicComponent?.schematic_component_id
        )
        if (!componentId) return ''

        const linked = elements.find(
            (element) =>
                GRAPHIC_TYPES.has(element?.type) &&
                Utils.text(element.schematic_component_id) === componentId &&
                Utils.text(element.schematic_symbol_id)
        )
        return Utils.text(linked?.schematic_symbol_id)
    }

    /**
     * Builds custom graphic nodes for a row.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @param {object | null} symbol Schematic symbol row.
     * @returns {Array[]}
     */
    static #graphicNodes(context, row, symbol) {
        const center =
            CircuitJsonKicadProjectSchematicSymbolBuilder.#symbolCenter(
                row,
                symbol
            )
        return context.elements
            .filter((element) =>
                CircuitJsonKicadProjectSchematicSymbolBuilder.#isGraphicForRow(
                    element,
                    row,
                    symbol
                )
            )
            .map((element) =>
                CircuitJsonKicadProjectSchematicSymbolBuilder.#graphicNode(
                    center,
                    element
                )
            )
            .filter(Boolean)
    }

    /**
     * Returns true when a graphic element belongs in the row symbol body.
     * @param {object} element Candidate element.
     * @param {object} row Component row.
     * @param {object | null} symbol Schematic symbol row.
     * @returns {boolean}
     */
    static #isGraphicForRow(element, row, symbol) {
        if (!GRAPHIC_TYPES.has(element?.type)) return false
        const symbolId = Utils.text(symbol?.schematic_symbol_id)
        const componentId = Utils.text(
            row.schematicComponent?.schematic_component_id
        )
        return (
            (!!symbolId &&
                Utils.text(element.schematic_symbol_id) === symbolId) ||
            (!!componentId &&
                Utils.text(element.schematic_component_id) === componentId)
        )
    }

    /**
     * Returns true when a graphic is an overlay for a generated component body.
     * @param {object} element Candidate element.
     * @param {string} componentId Schematic component id.
     * @returns {boolean}
     */
    static #isComponentArtworkForRow(element, componentId) {
        return (
            GRAPHIC_TYPES.has(element?.type) &&
            Utils.text(element.schematic_component_id) === componentId &&
            !Utils.text(element.schematic_symbol_id)
        )
    }

    /**
     * Builds one graphic node.
     * @param {{ x: number, y: number }} center Symbol center.
     * @param {object} element Graphic element.
     * @returns {Array | null}
     */
    static #graphicNode(center, element) {
        if (element.type === 'schematic_circle') {
            return CircuitJsonKicadProjectSchematicSymbolBuilder.#circleNode(
                center,
                element
            )
        }
        if (element.type === 'schematic_arc') {
            return CircuitJsonKicadProjectSchematicSymbolBuilder.#arcNode(
                center,
                element
            )
        }
        if (
            element.type === 'schematic_rect' ||
            element.type === 'schematic_box'
        ) {
            return CircuitJsonKicadProjectSchematicSymbolBuilder.#rectNode(
                center,
                element
            )
        }
        if (element.type === 'schematic_text') {
            return CircuitJsonKicadProjectSchematicSymbolBuilder.#textNode(
                center,
                element
            )
        }
        return CircuitJsonKicadProjectSchematicSymbolBuilder.#polylineNode(
            center,
            element
        )
    }

    /**
     * Builds one symbol polyline node.
     * @param {{ x: number, y: number }} center Symbol center.
     * @param {object} element Line or path element.
     * @returns {Array | null}
     */
    static #polylineNode(center, element) {
        const points =
            CircuitJsonKicadProjectSchematicSymbolBuilder.#points(element)
        const linePoints = points.length
            ? points
            : CircuitJsonKicadProjectSchematicSymbolBuilder.#linePoints(element)
        if (linePoints.length < 2) return null

        return [
            'polyline',
            [
                'pts',
                ...linePoints.map((point) => {
                    const local =
                        CircuitJsonKicadProjectSchematicSymbolBuilder.#localPoint(
                            center,
                            point
                        )
                    return ['xy', local.x, local.y]
                })
            ],
            CircuitJsonKicadProjectSchematicSymbolBuilder.#strokeNode(element),
            CircuitJsonKicadProjectSchematicSymbolBuilder.#fillNode(element)
        ]
    }

    /**
     * Builds one symbol arc node.
     * @param {{ x: number, y: number }} center Symbol center.
     * @param {object} element Arc element.
     * @returns {Array | null}
     */
    static #arcNode(center, element) {
        return ArcBuilder.node(element, {
            transformPoint: (point) =>
                CircuitJsonKicadProjectSchematicSymbolBuilder.#localPoint(
                    center,
                    point
                )
        })
    }

    /**
     * Builds one symbol circle node.
     * @param {{ x: number, y: number }} center Symbol center.
     * @param {object} element Circle element.
     * @returns {Array | null}
     */
    static #circleNode(center, element) {
        const point = Utils.point(element.center || element)
        if (!point) return null
        const local = CircuitJsonKicadProjectSchematicSymbolBuilder.#localPoint(
            center,
            point
        )
        return [
            'circle',
            ['center', local.x, local.y],
            [
                'radius',
                Utils.number(
                    element.radius,
                    Utils.number(element.diameter, 1) / 2
                )
            ],
            CircuitJsonKicadProjectSchematicSymbolBuilder.#strokeNode(element),
            CircuitJsonKicadProjectSchematicSymbolBuilder.#fillNode(element)
        ]
    }

    /**
     * Builds one symbol rectangle node.
     * @param {{ x: number, y: number }} center Symbol center.
     * @param {object} element Rectangle element.
     * @returns {Array | null}
     */
    static #rectNode(center, element) {
        const point = Utils.point(element.center || element)
        if (!point) return null
        const local = CircuitJsonKicadProjectSchematicSymbolBuilder.#localPoint(
            center,
            point
        )
        const width = Utils.number(element.width, 4)
        const height = Utils.number(element.height, 3)

        return [
            'rectangle',
            [
                'start',
                Utils.round(local.x - width / 2),
                Utils.round(local.y - height / 2)
            ],
            [
                'end',
                Utils.round(local.x + width / 2),
                Utils.round(local.y + height / 2)
            ],
            CircuitJsonKicadProjectSchematicSymbolBuilder.#strokeNode(element),
            CircuitJsonKicadProjectSchematicSymbolBuilder.#fillNode(element)
        ]
    }

    /**
     * Builds one symbol text node.
     * @param {{ x: number, y: number }} center Symbol center.
     * @param {object} element Text element.
     * @returns {Array | null}
     */
    static #textNode(center, element) {
        const point = Utils.point(
            element.anchor_position || element.position || element
        )
        if (!point) return null
        const text = Utils.text(element.text || element.value)
        if (!text) return null
        const local = CircuitJsonKicadProjectSchematicSymbolBuilder.#localPoint(
            center,
            point
        )
        const size = Utils.number(element.font_size || element.size, 1.27)

        return [
            'text',
            text,
            ['at', local.x, local.y, Utils.number(element.rotation, 0)],
            [
                'effects',
                [
                    'font',
                    ['size', size, size],
                    [
                        'thickness',
                        Utils.number(
                            element.thickness || element.stroke_width,
                            0.15
                        )
                    ]
                ]
            ]
        ]
    }

    /**
     * Builds a fallback rectangle for custom symbols without explicit art.
     * @param {object} row Component row.
     * @param {object | null} symbol Schematic symbol row.
     * @returns {Array}
     */
    static #fallbackBodyNode(row, symbol) {
        const ports = row.sourcePorts || []
        const width = Utils.number(symbol?.width, 10.16)
        const height = Utils.number(
            symbol?.height,
            Math.max(5.08, ports.length * 2.54)
        )
        return [
            'rectangle',
            ['start', Utils.round(-width / 2), Utils.round(-height / 2)],
            ['end', Utils.round(width / 2), Utils.round(height / 2)],
            ['stroke', ['width', 0.15], ['type', 'default']],
            ['fill', ['type', 'background']]
        ]
    }

    /**
     * Builds one symbol pin node.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @param {object | null} symbol Schematic symbol row.
     * @param {object} port Schematic port row.
     * @param {number} index Port index.
     * @returns {Array}
     */
    static #pinNode(context, row, symbol, port, index) {
        const local =
            CircuitJsonKicadProjectSchematicSymbolBuilder.#pinLocalPoint(
                row,
                symbol,
                port,
                index
            )
        const sourcePort = context.sourcePorts.byId.get(
            Utils.text(port.source_port_id)
        )
        const number = Utils.text(
            port.pin_number ?? sourcePort?.pin_number,
            index + 1
        )
        const name = Utils.text(
            port.display_pin_label || port.name || sourcePort?.name,
            number
        )

        return [
            'pin',
            CircuitJsonKicadProjectSchematicSymbolBuilder.#pinType(port),
            'line',
            [
                'at',
                local.x,
                local.y,
                CircuitJsonKicadProjectSchematicSymbolBuilder.#pinAngle(port)
            ],
            ['length', Utils.number(port.length || port.pin_length, 2.54)],
            ['name', name],
            ['number', number]
        ]
    }

    /**
     * Builds one custom symbol-local pin anchor.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @param {object | null} symbol Schematic symbol row.
     * @param {object} port Schematic port row.
     * @param {number} index Port index.
     * @returns {{ sourcePortId: string, point: { x: number, y: number } } | null}
     */
    static #pinAnchor(context, row, symbol, port, index) {
        const sourcePort =
            CircuitJsonKicadProjectSchematicSymbolBuilder.#sourcePortFor(
                context,
                row,
                port
            )
        const sourcePortId = Utils.text(
            port.source_port_id || sourcePort?.source_port_id
        )
        if (!sourcePortId) return null

        return {
            sourcePortId,
            point: CircuitJsonKicadProjectSchematicSymbolBuilder.#pinLocalPoint(
                row,
                symbol,
                port,
                index
            )
        }
    }

    /**
     * Resolves the source port represented by one schematic port.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @param {object} port Schematic port row.
     * @returns {object | null}
     */
    static #sourcePortFor(context, row, port) {
        const directId = Utils.text(port.source_port_id)
        if (directId) return context.sourcePorts.byId.get(directId) || null

        const pinNumber = Utils.text(port.pin_number ?? port.pinNumber)
        if (!pinNumber) return null
        return (
            (context.sourcePorts.byComponentId.get(row.sourceId) || []).find(
                (sourcePort) =>
                    Utils.text(
                        sourcePort.pin_number ?? sourcePort.pinNumber
                    ) === pinNumber
            ) || null
        )
    }

    /**
     * Resolves one custom pin anchor in symbol-local coordinates.
     * @param {object} row Component row.
     * @param {object | null} symbol Schematic symbol row.
     * @param {object} port Schematic port row.
     * @param {number} index Port index.
     * @returns {{ x: number, y: number }}
     */
    static #pinLocalPoint(row, symbol, port, index) {
        const center =
            CircuitJsonKicadProjectSchematicSymbolBuilder.#symbolCenter(
                row,
                symbol
            )
        const point =
            Utils.point(port.center || port.position || port.anchor_position) ||
            CircuitJsonKicadProjectSchematicSymbolBuilder.#fallbackPinPoint(
                symbol,
                index
            )
        return CircuitJsonKicadProjectSchematicSymbolBuilder.#localPoint(
            center,
            point
        )
    }

    /**
     * Resolves schematic ports for one row.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @param {object | null} symbol Schematic symbol row.
     * @returns {object[]}
     */
    static #schematicPorts(context, row, symbol) {
        const symbolId = Utils.text(symbol?.schematic_symbol_id)
        const componentId = Utils.text(
            row.schematicComponent?.schematic_component_id
        )
        const symbolPorts = symbolId
            ? context.elements.filter(
                  (element) =>
                      element?.type === 'schematic_port' &&
                      Utils.text(element.schematic_symbol_id) === symbolId
              )
            : []
        const componentPorts = componentId
            ? context.elements.filter(
                  (element) =>
                      element?.type === 'schematic_port' &&
                      Utils.text(element.schematic_component_id) === componentId
              )
            : []
        const selected = symbolPorts.length
            ? symbolPorts
            : CircuitJsonKicadProjectSchematicSymbolBuilder.#componentPorts(
                  componentPorts
              )

        return CircuitJsonKicadProjectSchematicSymbolBuilder.#dedupedPorts(
            selected
        ).sort(
            (left, right) =>
                CircuitJsonKicadProjectSchematicSymbolBuilder.#pinSortValue(
                    left
                ) -
                CircuitJsonKicadProjectSchematicSymbolBuilder.#pinSortValue(
                    right
                )
        )
    }

    /**
     * Resolves preferred component-scoped custom ports.
     * @param {object[]} ports Component-scoped ports.
     * @returns {object[]}
     */
    static #componentPorts(ports) {
        const labeled = ports.filter(
            (port) => port.display_pin_label !== undefined
        )
        return labeled.length ? labeled : ports
    }

    /**
     * Deduplicates ports by pin number or visible label.
     * @param {object[]} ports Candidate ports.
     * @returns {object[]}
     */
    static #dedupedPorts(ports) {
        const byKey = new Map()
        for (const port of ports) {
            byKey.set(
                CircuitJsonKicadProjectSchematicSymbolBuilder.#portKey(port),
                port
            )
        }
        return Array.from(byKey.values())
    }

    /**
     * Resolves a stable port dedupe key.
     * @param {object} port Schematic port.
     * @returns {string}
     */
    static #portKey(port) {
        const pin = Utils.text(port.pin_number ?? port.pinNumber)
        if (pin) return 'pin:' + pin
        const label = Utils.text(port.display_pin_label || port.name)
        if (label) return 'label:' + label.toLowerCase()
        return 'id:' + Utils.text(port.schematic_port_id)
    }

    /**
     * Resolves a sortable pin value.
     * @param {object} port Schematic port row.
     * @returns {number}
     */
    static #pinSortValue(port) {
        return Utils.number(port.pin_number ?? port.pinNumber, 0)
    }

    /**
     * Resolves one pin electrical type.
     * @param {object} port Schematic port row.
     * @returns {string}
     */
    static #pinType(port) {
        const type = Utils.text(
            port.pin_type || port.electrical_type
        ).toLowerCase()
        if (type === 'input' || type === 'output' || type === 'passive') {
            return type
        }
        if (type === 'bidirectional' || type === 'bidi') return 'bidirectional'
        if (type === 'power_in' || type === 'power') return 'power_in'
        if (type === 'power_out') return 'power_out'
        return 'passive'
    }

    /**
     * Resolves the KiCad pin angle from facing direction.
     * @param {object} port Schematic port row.
     * @returns {number}
     */
    static #pinAngle(port) {
        const direction = Utils.text(
            port.facing_direction || port.facingDirection || port.side
        ).toLowerCase()
        if (direction === 'right' || direction === 'east') return 180
        if (
            direction === 'top' ||
            direction === 'north' ||
            direction === 'up'
        ) {
            return 270
        }
        if (
            direction === 'bottom' ||
            direction === 'south' ||
            direction === 'down'
        ) {
            return 90
        }
        return 0
    }

    /**
     * Resolves the fallback absolute pin position.
     * @param {object | null} symbol Schematic symbol row.
     * @param {number} index Port index.
     * @returns {{ x: number, y: number }}
     */
    static #fallbackPinPoint(symbol, index) {
        const center = Utils.point(symbol?.center || symbol) || { x: 0, y: 0 }
        return {
            x: center.x - Utils.number(symbol?.width, 10.16) / 2,
            y: center.y + index * 2.54
        }
    }

    /**
     * Resolves the symbol center.
     * @param {object} row Component row.
     * @param {object | null} symbol Schematic symbol row.
     * @returns {{ x: number, y: number }}
     */
    static #symbolCenter(row, symbol) {
        return (
            Utils.point(symbol?.center || symbol) ||
            Utils.point(
                row.schematicComponent?.center || row.schematicComponent
            ) || { x: 0, y: 0 }
        )
    }

    /**
     * Resolves a stroke node.
     * @param {object} element Graphic element.
     * @returns {Array}
     */
    static #strokeNode(element) {
        const lineWidth =
            element.type === 'schematic_line' ||
            element.type === 'schematic_path'
                ? element.width
                : undefined
        return [
            'stroke',
            [
                'width',
                Utils.number(
                    element.stroke_width ??
                        element.line_width ??
                        element.strokeWidth ??
                        element.thickness ??
                        lineWidth,
                    0.15
                )
            ],
            ['type', 'default']
        ]
    }

    /**
     * Resolves one symbol graphic fill node.
     * @param {object} element Graphic element.
     * @returns {Array}
     */
    static #fillNode(element) {
        return ['fill', ['type', element.is_filled ? 'background' : 'none']]
    }

    /**
     * Converts a schematic point into symbol-local coordinates.
     * @param {{ x: number, y: number }} center Symbol center.
     * @param {{ x: number, y: number }} point Schematic point.
     * @returns {{ x: number, y: number }}
     */
    static #localPoint(center, point) {
        return {
            x: Utils.round(point.x - center.x),
            y: Utils.round(-(point.y - center.y))
        }
    }

    /**
     * Resolves point-list geometry.
     * @param {object} element Graphic element.
     * @returns {{ x: number, y: number }[]}
     */
    static #points(element) {
        const candidates =
            (Array.isArray(element.points) && element.points) ||
            (Array.isArray(element.route) && element.route) ||
            (Array.isArray(element.vertices) && element.vertices) ||
            (Array.isArray(element.outline) && element.outline) ||
            []
        return candidates.map((point) => Utils.point(point)).filter(Boolean)
    }

    /**
     * Resolves explicit start/end geometry.
     * @param {object} element Graphic element.
     * @returns {{ x: number, y: number }[]}
     */
    static #linePoints(element) {
        return [
            Utils.point({
                x: element.x1 ?? element.start?.x,
                y: element.y1 ?? element.start?.y
            }),
            Utils.point({
                x: element.x2 ?? element.end?.x,
                y: element.y2 ?? element.end?.y
            })
        ].filter(Boolean)
    }
}
