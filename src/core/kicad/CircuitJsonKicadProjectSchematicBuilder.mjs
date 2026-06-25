// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectContext as Context } from './CircuitJsonKicadProjectContext.mjs'
import { CircuitJsonKicadProjectMetadata as Metadata } from './CircuitJsonKicadProjectMetadata.mjs'
import { CircuitJsonKicadProjectSchematicArcBuilder as ArcBuilder } from './CircuitJsonKicadProjectSchematicArcBuilder.mjs'
import { CircuitJsonKicadProjectSchematicLabelBuilder as LabelBuilder } from './CircuitJsonKicadProjectSchematicLabelBuilder.mjs'
import { CircuitJsonKicadProjectSchematicPage } from './CircuitJsonKicadProjectSchematicPage.mjs'
import { CircuitJsonKicadProjectSchematicSymbolBuilder as SymbolBuilder } from './CircuitJsonKicadProjectSchematicSymbolBuilder.mjs'
import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

const DEFAULT_PIN_SNAP_TOLERANCE_MM = 10.16

/**
 * Builds KiCad schematic and symbol-library S-expression nodes.
 */
export class CircuitJsonKicadProjectSchematicBuilder {
    /**
     * Builds a schematic file root.
     * @param {object} context Export context.
     * @returns {Array}
     */
    static buildSchematic(context) {
        const paper = CircuitJsonKicadProjectSchematicPage.paperName(context)

        return [
            'kicad_sch',
            ['version', 20240108],
            ['generator', 'ecad_forge'],
            ['paper', paper],
            [
                'lib_symbols',
                ...CircuitJsonKicadProjectSchematicBuilder.symbols(context, {
                    embedded: true
                })
            ],
            ...CircuitJsonKicadProjectSchematicBuilder.placedSymbols(context),
            ...CircuitJsonKicadProjectSchematicBuilder.wires(context),
            ...CircuitJsonKicadProjectSchematicBuilder.labels(context),
            ...CircuitJsonKicadProjectSchematicBuilder.junctions(context),
            ...CircuitJsonKicadProjectSchematicBuilder.texts(context),
            ...CircuitJsonKicadProjectSchematicBuilder.graphics(context),
            ['sheet_instances', ['path', '/', ['page', '1']]],
            ...CircuitJsonKicadProjectSchematicBuilder.symbolInstances(context),
            ['embedded_fonts', 'no']
        ]
    }

    /**
     * Builds a standalone symbol library root.
     * @param {object} context Export context.
     * @returns {Array}
     */
    static buildSymbolLibrary(context) {
        return [
            'kicad_symbol_lib',
            ['version', 20240108],
            ['generator', 'ecad_forge'],
            ...CircuitJsonKicadProjectSchematicBuilder.symbols(context)
        ]
    }

    /**
     * Builds all library symbol nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static symbols(context, options = {}) {
        return (context.symbolRows || context.componentRows).map((row) =>
            CircuitJsonKicadProjectSchematicBuilder.symbolNode(
                context,
                row,
                options
            )
        )
    }

    /**
     * Builds one symbol library item.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @param {{ embedded?: boolean }} [options] Symbol options.
     * @returns {Array}
     */
    static symbolNode(context, row, options = {}) {
        const ports = context.sourcePorts.byComponentId.get(row.sourceId) || []
        const halfHeight = Math.max(2.54, ports.length * 1.27)
        const metadata = Metadata.symbolMetadata(row)
        const customNodes = SymbolBuilder.nodes(context, row)
        const generatedNodes =
            CircuitJsonKicadProjectSchematicBuilder.generatedSymbolBodyNodes(
                context,
                row
            )
        const componentArtworkNodes = customNodes
            ? []
            : SymbolBuilder.componentArtworkNodes(context, row)

        return [
            'symbol',
            options.embedded
                ? Metadata.embeddedSymbolName(context, row)
                : row.symbolName,
            ...Metadata.symbolPropertyNodes(
                [
                    {
                        name: 'Reference',
                        value: row.reference,
                        at: [0, -halfHeight - 2.54, 0]
                    },
                    {
                        name: 'Value',
                        value: row.value,
                        at: [0, halfHeight + 2.54, 0]
                    },
                    {
                        name: 'Footprint',
                        value: Metadata.footprintLibId(context, row),
                        at: [0, halfHeight + 5.08, 0],
                        hidden: true
                    }
                ],
                metadata
            ),
            ...Metadata.symbolDisplayNodes(row),
            ...(customNodes || [...generatedNodes, ...componentArtworkNodes])
        ]
    }

    /**
     * Builds the generated rectangle and source-port pins for one symbol body.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {Array[]}
     */
    static generatedSymbolBodyNodes(context, row) {
        const ports = context.sourcePorts.byComponentId.get(row.sourceId) || []
        const halfHeight = Math.max(2.54, ports.length * 1.27)

        return [
            [
                'rectangle',
                ['start', -5.08, -halfHeight],
                ['end', 5.08, halfHeight],
                ['stroke', ['width', 0.15], ['type', 'default']],
                ['fill', ['type', 'background']]
            ],
            ...ports.map((port, index) =>
                CircuitJsonKicadProjectSchematicBuilder.symbolPinNode(
                    port,
                    index,
                    ports.length
                )
            )
        ]
    }

    /**
     * Builds one symbol pin.
     * @param {object} port Source port.
     * @param {number} index Port index.
     * @param {number} portCount Total port count.
     * @returns {Array}
     */
    static symbolPinNode(port, index, portCount) {
        const y = (index - Math.max(portCount - 1, 0) / 2) * 2.54

        return [
            'pin',
            'passive',
            'line',
            ['at', -7.62, y, 0],
            ['length', 2.54],
            ['name', Utils.text(port.name, index + 1)],
            ['number', String(Context.pinNumber(port, index + 1))]
        ]
    }

    /**
     * Builds placed schematic symbol nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static placedSymbols(context) {
        return context.componentRows.map((row, index) => {
            const component = row.schematicComponent || {}
            const center = Utils.point(component.center) || {
                x: index * 20,
                y: 0
            }

            return [
                'symbol',
                ['lib_id', Metadata.symbolLibId(context, row)],
                ['at', center.x, -center.y, component.rotation || 0],
                ['unit', 1],
                ...Metadata.placedSymbolFlagNodes(row),
                [
                    'uuid',
                    CircuitJsonKicadProjectSchematicBuilder.placedSymbolUuid(
                        row
                    )
                ],
                [
                    'property',
                    'Reference',
                    row.referenceDesignator || row.reference,
                    ['at', center.x, -center.y - 5.08, 0]
                ],
                [
                    'property',
                    'Value',
                    row.value,
                    ['at', center.x, -center.y + 5.08, 0]
                ],
                [
                    'property',
                    'Footprint',
                    Metadata.footprintLibId(context, row),
                    ['at', center.x, -center.y + 7.62, 0],
                    ['effects', ['hide']]
                ]
            ]
        })
    }

    /**
     * Builds symbol instance path nodes for placed schematic symbols.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static symbolInstances(context) {
        if (!context.componentRows.length) return []
        return [
            [
                'symbol_instances',
                ...context.componentRows.map((row) => [
                    'path',
                    '/' +
                        CircuitJsonKicadProjectSchematicBuilder.placedSymbolUuid(
                            row
                        ),
                    ['reference', row.referenceDesignator || row.reference],
                    ['unit', 1],
                    ['value', row.value],
                    ['footprint', Metadata.footprintLibId(context, row)]
                ])
            ]
        ]
    }

    /**
     * Builds the deterministic UUID used by a placed schematic symbol.
     * @param {object} row Component row.
     * @returns {string}
     */
    static placedSymbolUuid(row) {
        return Utils.uuid('sch:' + row.sourceId)
    }

    /**
     * Builds schematic wire nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static wires(context) {
        const pinAnchors =
            CircuitJsonKicadProjectSchematicBuilder.pinAnchorMap(context)

        return ['schematic_line', 'schematic_trace'].flatMap((type) =>
            context.elements
                .filter((element) => element?.type === type)
                .filter(
                    (element) =>
                        !Utils.text(element.schematic_component_id) &&
                        !Utils.text(element.schematic_symbol_id) &&
                        !CircuitJsonKicadProjectSchematicPage.isPageGraphicLine(
                            element
                        )
                )
                .flatMap((element, index) =>
                    CircuitJsonKicadProjectSchematicBuilder.wireNodes(
                        context,
                        element,
                        index,
                        pinAnchors
                    )
                )
                .filter(Boolean)
        )
    }

    /**
     * Builds schematic wire nodes for a line or trace element.
     * @param {object} context Export context.
     * @param {object} element Wire or trace element.
     * @param {number} index Wire index.
     * @param {Map<string, { x: number, y: number }>} pinAnchors Pin anchors by source port id.
     * @returns {Array[]}
     */
    static wireNodes(context, element, index, pinAnchors = new Map()) {
        if (
            element?.type === 'schematic_trace' &&
            Array.isArray(element.edges) &&
            element.edges.length
        ) {
            return element.edges
                .map((edge, edgeIndex) =>
                    CircuitJsonKicadProjectSchematicBuilder.wireNode(
                        element,
                        index,
                        {
                            id:
                                (element.schematic_trace_id ||
                                    'schematic_trace_' + index) +
                                ':' +
                                edgeIndex,
                            start: CircuitJsonKicadProjectSchematicBuilder.snappedWirePoint(
                                context,
                                element,
                                edge.from || edge.start,
                                pinAnchors
                            ),
                            end: CircuitJsonKicadProjectSchematicBuilder.snappedWirePoint(
                                context,
                                element,
                                edge.to || edge.end,
                                pinAnchors
                            ),
                            width:
                                edge.width ??
                                edge.stroke_width ??
                                element.width ??
                                element.stroke_width
                        }
                    )
                )
                .filter(Boolean)
        }
        return [
            CircuitJsonKicadProjectSchematicBuilder.wireNode(element, index, {
                start: CircuitJsonKicadProjectSchematicBuilder.snappedWirePoint(
                    context,
                    element,
                    {
                        x: element.x1 ?? element.start?.x,
                        y: element.y1 ?? element.start?.y
                    },
                    pinAnchors
                ),
                end: CircuitJsonKicadProjectSchematicBuilder.snappedWirePoint(
                    context,
                    element,
                    {
                        x: element.x2 ?? element.end?.x,
                        y: element.y2 ?? element.end?.y
                    },
                    pinAnchors
                )
            })
        ].filter(Boolean)
    }

    /**
     * Builds one schematic wire node.
     * @param {object} element Wire element.
     * @param {number} index Wire index.
     * @param {{ id?: string, start?: object, end?: object, width?: unknown }} [options] Wire options.
     * @returns {Array | null}
     */
    static wireNode(element, index, options = {}) {
        const start = Utils.point(
            options.start || {
                x: element.x1 ?? element.start?.x,
                y: element.y1 ?? element.start?.y
            }
        )
        const end = Utils.point(
            options.end || {
                x: element.x2 ?? element.end?.x,
                y: element.y2 ?? element.end?.y
            }
        )
        if (!start || !end) return null
        return [
            'wire',
            ['pts', ['xy', start.x, -start.y], ['xy', end.x, -end.y]],
            [
                'stroke',
                ['width', Utils.number(options.width ?? element.width, 0)],
                ['type', 'default']
            ],
            [
                'uuid',
                Utils.uuid(
                    'wire:' +
                        (options.id ||
                            element.schematic_line_id ||
                            element.schematic_trace_id ||
                            index)
                )
            ]
        ]
    }

    /**
     * Builds final schematic pin anchors keyed by source port id.
     * @param {object} context Export context.
     * @returns {Map<string, { x: number, y: number }>}
     */
    static pinAnchorMap(context) {
        const map = new Map()

        context.componentRows.forEach((row, index) => {
            const customAnchors = SymbolBuilder.pinAnchors(context, row)
            const localAnchors =
                customAnchors === null
                    ? CircuitJsonKicadProjectSchematicBuilder.fallbackPinAnchors(
                          context,
                          row
                      )
                    : customAnchors

            for (const anchor of localAnchors) {
                map.set(
                    anchor.sourcePortId,
                    CircuitJsonKicadProjectSchematicBuilder.sheetPinPoint(
                        row,
                        index,
                        anchor.point
                    )
                )
            }
        })

        return map
    }

    /**
     * Builds fallback symbol-local pin anchors for generated symbols.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {{ sourcePortId: string, point: { x: number, y: number } }[]}
     */
    static fallbackPinAnchors(context, row) {
        const ports = context.sourcePorts.byComponentId.get(row.sourceId) || []

        return ports
            .map((port, index) => {
                const sourcePortId = Utils.text(port.source_port_id)
                if (!sourcePortId) return null
                return {
                    sourcePortId,
                    point: CircuitJsonKicadProjectSchematicBuilder.fallbackPinPoint(
                        index,
                        ports.length
                    )
                }
            })
            .filter(Boolean)
    }

    /**
     * Resolves a fallback pin anchor in generated symbol-local coordinates.
     * @param {number} index Port index.
     * @param {number} portCount Total port count.
     * @returns {{ x: number, y: number }}
     */
    static fallbackPinPoint(index, portCount) {
        return {
            x: -7.62,
            y: (index - Math.max(portCount - 1, 0) / 2) * 2.54
        }
    }

    /**
     * Converts a symbol-local pin point into source schematic coordinates.
     * @param {object} row Component row.
     * @param {number} index Component index.
     * @param {{ x: number, y: number }} localPoint Symbol-local point.
     * @returns {{ x: number, y: number }}
     */
    static sheetPinPoint(row, index, localPoint) {
        const component = row.schematicComponent || {}
        const center = Utils.point(component.center) || {
            x: index * 20,
            y: 0
        }
        const rotation = (Utils.number(component.rotation, 0) * Math.PI) / 180
        const cos = Math.cos(rotation)
        const sin = Math.sin(rotation)
        const rotatedX = localPoint.x * cos - localPoint.y * sin
        const rotatedY = localPoint.x * sin + localPoint.y * cos
        const sheetX = center.x + rotatedX
        const sheetY = -center.y + rotatedY

        return {
            x: Utils.round(sheetX),
            y: Utils.round(-sheetY)
        }
    }

    /**
     * Snaps one wire point to a connected exported pin anchor when close enough.
     * @param {object} context Export context.
     * @param {object} element Wire or trace element.
     * @param {object} candidate Candidate point.
     * @param {Map<string, { x: number, y: number }>} pinAnchors Pin anchors by source port id.
     * @returns {{ x: number, y: number } | null}
     */
    static snappedWirePoint(context, element, candidate, pinAnchors) {
        const point = Utils.point(candidate)
        if (!point || element?.type !== 'schematic_trace') return point

        const sourcePortIds =
            CircuitJsonKicadProjectSchematicBuilder.traceSourcePortIds(
                context,
                element
            )
        const tolerance = Utils.number(
            context.schematicWirePinSnapTolerance,
            DEFAULT_PIN_SNAP_TOLERANCE_MM
        )
        let nearest = null

        for (const sourcePortId of sourcePortIds) {
            const anchor = pinAnchors.get(sourcePortId)
            if (!anchor) continue
            const distance =
                Math.hypot(point.x - anchor.x, point.y - anchor.y) || 0
            if (distance > tolerance) continue
            if (!nearest || distance < nearest.distance) {
                nearest = { distance, point: anchor }
            }
        }

        return nearest ? nearest.point : point
    }

    /**
     * Resolves source port ids attached to one schematic trace.
     * @param {object} context Export context.
     * @param {object} element Schematic trace element.
     * @returns {string[]}
     */
    static traceSourcePortIds(context, element) {
        const directIds = Array.isArray(element.connected_source_port_ids)
            ? element.connected_source_port_ids
            : []
        const sourceTrace = context.sourceTraces.get(
            Utils.text(element.source_trace_id)
        )
        const traceIds = Array.isArray(sourceTrace?.connected_source_port_ids)
            ? sourceTrace.connected_source_port_ids
            : []

        return [
            ...new Set(
                [...directIds, ...traceIds]
                    .map((sourcePortId) => Utils.text(sourcePortId))
                    .filter(Boolean)
            )
        ]
    }

    /**
     * Builds schematic net label nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static labels(context) {
        return LabelBuilder.labels(context)
    }

    /**
     * Builds schematic junction nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static junctions(context) {
        return [
            ...context.elements
                .filter((element) => element?.type === 'schematic_junction')
                .map((element, index) =>
                    CircuitJsonKicadProjectSchematicBuilder.junctionNode(
                        element.center || element,
                        element.schematic_junction_id || index,
                        element.diameter
                    )
                ),
            ...context.elements
                .filter((element) => element?.type === 'schematic_trace')
                .flatMap((element, traceIndex) =>
                    (Array.isArray(element.junctions)
                        ? element.junctions
                        : []
                    ).map((junction, junctionIndex) =>
                        CircuitJsonKicadProjectSchematicBuilder.junctionNode(
                            junction,
                            (element.schematic_trace_id ||
                                'schematic_trace_' + traceIndex) +
                                ':' +
                                junctionIndex,
                            junction?.diameter
                        )
                    )
                )
        ].filter(Boolean)
    }

    /**
     * Builds one schematic junction node.
     * @param {object} candidate Junction point candidate.
     * @param {string | number} id Junction id seed.
     * @param {unknown} diameter Junction diameter.
     * @returns {Array | null}
     */
    static junctionNode(candidate, id, diameter) {
        const point = Utils.point(candidate)
        if (!point) return null
        return [
            'junction',
            ['at', point.x, -point.y],
            ['diameter', Utils.number(diameter, 0)],
            ['color', 0, 0, 0, 0],
            ['uuid', Utils.uuid('junction:' + id)]
        ]
    }

    /**
     * Builds schematic text nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static texts(context) {
        return CircuitJsonKicadProjectSchematicPage.textNodes(context)
    }

    /**
     * Builds simple schematic graphics.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static graphics(context) {
        return [
            ...CircuitJsonKicadProjectSchematicPage.graphicNodes(context),
            ...context.elements
                .filter((element) =>
                    CircuitJsonKicadProjectSchematicBuilder.#isPageGraphic(
                        element
                    )
                )
                .map((element, index) =>
                    CircuitJsonKicadProjectSchematicBuilder.#graphicNode(
                        element,
                        index
                    )
                )
                .filter(Boolean)
        ]
    }

    /**
     * Returns true when an element is a page-owned graphic.
     * @param {object} element Candidate element.
     * @returns {boolean}
     */
    static #isPageGraphic(element) {
        if (
            !['schematic_rect', 'schematic_box', 'schematic_arc'].includes(
                element?.type
            )
        ) {
            return false
        }
        return (
            !Utils.text(element.schematic_component_id) &&
            !Utils.text(element.schematic_symbol_id)
        )
    }

    /**
     * Builds one page graphic node.
     * @param {object} element Graphic element.
     * @param {number} index Graphic index.
     * @returns {Array | null}
     */
    static #graphicNode(element, index) {
        if (element.type === 'schematic_arc') {
            return ArcBuilder.node(element, {
                transformPoint: (point) => ({ x: point.x, y: -point.y }),
                uuidSeed:
                    'graphic:' + (element.schematic_arc_id || 'arc:' + index)
            })
        }
        return CircuitJsonKicadProjectSchematicBuilder.#rectangleNode(
            element,
            index
        )
    }

    /**
     * Builds one page rectangle node.
     * @param {object} element Rectangle element.
     * @param {number} index Rectangle index.
     * @returns {Array | null}
     */
    static #rectangleNode(element, index) {
        const center = Utils.point(element.center || element)
        if (!center) return null
        const width = Utils.number(element.width, 4)
        const height = Utils.number(element.height, 3)
        return [
            'rectangle',
            ['start', center.x - width / 2, -center.y - height / 2],
            ['end', center.x + width / 2, -center.y + height / 2],
            ['stroke', ['width', 0.15], ['type', 'default']],
            ['fill', ['type', 'none']],
            [
                'uuid',
                Utils.uuid('graphic:' + (element.schematic_rect_id || index))
            ]
        ]
    }

    /**
     * Picks a schematic paper size from exported content bounds.
     * @param {object} context Export context.
     * @returns {string}
     */
    static paperSize(context) {
        const bounds = CircuitJsonKicadProjectSchematicBuilder.bounds(context)
        if (!bounds) return 'A4'
        const width = bounds.maxX - bounds.minX
        const height = bounds.maxY - bounds.minY

        if (width <= 297 && height <= 210) return 'A4'
        if (width <= 420 && height <= 297) return 'A3'
        if (width <= 594 && height <= 420) return 'A2'
        return 'A1'
    }

    /**
     * Computes schematic content bounds.
     * @param {object} context Export context.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
     */
    static bounds(context) {
        let bounds = null
        for (const element of context.elements) {
            bounds = CircuitJsonKicadProjectSchematicBuilder.includeElement(
                bounds,
                element
            )
        }
        return bounds
    }

    /**
     * Includes one element in schematic bounds.
     * @param {object | null} bounds Current bounds.
     * @param {object} element CircuitJSON element.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
     */
    static includeElement(bounds, element) {
        if (element?.type === 'schematic_line') {
            return CircuitJsonKicadProjectSchematicBuilder.includePoints(
                bounds,
                [
                    { x: element.x1, y: element.y1 },
                    { x: element.x2, y: element.y2 }
                ]
            )
        }
        if (element?.type === 'schematic_trace') {
            return CircuitJsonKicadProjectSchematicBuilder.includePoints(
                bounds,
                (Array.isArray(element.edges) ? element.edges : []).flatMap(
                    (edge) => [edge.from, edge.to]
                )
            )
        }
        return CircuitJsonKicadProjectSchematicBuilder.includePoints(bounds, [
            element?.center,
            element?.position,
            element?.anchor_position,
            element
        ])
    }

    /**
     * Includes candidate points in schematic bounds.
     * @param {object | null} bounds Current bounds.
     * @param {unknown[]} points Candidate points.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
     */
    static includePoints(bounds, points) {
        let nextBounds = bounds
        for (const candidate of points) {
            const point = Utils.point(candidate)
            if (!point) continue
            nextBounds = CircuitJsonKicadProjectSchematicBuilder.includePoint(
                nextBounds,
                point
            )
        }
        return nextBounds
    }

    /**
     * Includes one point in schematic bounds.
     * @param {object | null} bounds Current bounds.
     * @param {{ x: number, y: number }} point Point.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
     */
    static includePoint(bounds, point) {
        if (!bounds) {
            return {
                minX: point.x,
                minY: point.y,
                maxX: point.x,
                maxY: point.y
            }
        }

        return {
            minX: Math.min(bounds.minX, point.x),
            minY: Math.min(bounds.minY, point.y),
            maxX: Math.max(bounds.maxX, point.x),
            maxY: Math.max(bounds.maxY, point.y)
        }
    }
}
