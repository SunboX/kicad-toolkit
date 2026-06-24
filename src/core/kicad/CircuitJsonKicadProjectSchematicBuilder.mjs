// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectContext as Context } from './CircuitJsonKicadProjectContext.mjs'
import { CircuitJsonKicadProjectSchematicPage } from './CircuitJsonKicadProjectSchematicPage.mjs'
import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

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
                ...CircuitJsonKicadProjectSchematicBuilder.symbols(context)
            ],
            ...CircuitJsonKicadProjectSchematicBuilder.placedSymbols(context),
            ...CircuitJsonKicadProjectSchematicBuilder.wires(context),
            ...CircuitJsonKicadProjectSchematicBuilder.labels(context),
            ...CircuitJsonKicadProjectSchematicBuilder.junctions(context),
            ...CircuitJsonKicadProjectSchematicBuilder.texts(context),
            ...CircuitJsonKicadProjectSchematicBuilder.graphics(context),
            ['sheet_instances', ['path', '/', ['page', '1']]],
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
    static symbols(context) {
        return context.componentRows.map((row) =>
            CircuitJsonKicadProjectSchematicBuilder.symbolNode(context, row)
        )
    }

    /**
     * Builds one symbol library item.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {Array}
     */
    static symbolNode(context, row) {
        const ports = context.sourcePorts.byComponentId.get(row.sourceId) || []
        const halfHeight = Math.max(2.54, ports.length * 1.27)

        return [
            'symbol',
            row.symbolName,
            [
                'property',
                'Reference',
                row.reference,
                ['at', 0, -halfHeight - 2.54, 0]
            ],
            ['property', 'Value', row.value, ['at', 0, halfHeight + 2.54, 0]],
            [
                'property',
                'Footprint',
                context.libraryName + ':' + row.footprintName,
                ['at', 0, halfHeight + 5.08, 0],
                ['effects', ['hide']]
            ],
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
                ['lib_id', context.libraryName + ':' + row.symbolName],
                ['at', center.x, -center.y, component.rotation || 0],
                ['unit', 1],
                ['exclude_from_sim', 'no'],
                ['in_bom', 'yes'],
                ['on_board', 'yes'],
                ['dnp', 'no'],
                ['uuid', Utils.uuid('sch:' + row.sourceId)],
                [
                    'property',
                    'Reference',
                    row.reference,
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
                    context.libraryName + ':' + row.footprintName,
                    ['at', center.x, -center.y + 7.62, 0],
                    ['effects', ['hide']]
                ]
            ]
        })
    }

    /**
     * Builds schematic wire nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static wires(context) {
        return ['schematic_line', 'schematic_trace'].flatMap((type) =>
            context.elements
                .filter((element) => element?.type === type)
                .map((element, index) =>
                    CircuitJsonKicadProjectSchematicBuilder.wireNode(
                        element,
                        index
                    )
                )
                .filter(Boolean)
        )
    }

    /**
     * Builds one schematic wire node.
     * @param {object} element Wire element.
     * @param {number} index Wire index.
     * @returns {Array | null}
     */
    static wireNode(element, index) {
        const start = Utils.point({
            x: element.x1 ?? element.start?.x,
            y: element.y1 ?? element.start?.y
        })
        const end = Utils.point({
            x: element.x2 ?? element.end?.x,
            y: element.y2 ?? element.end?.y
        })
        if (!start || !end) return null
        return [
            'wire',
            ['pts', ['xy', start.x, -start.y], ['xy', end.x, -end.y]],
            [
                'stroke',
                ['width', Utils.number(element.width, 0)],
                ['type', 'default']
            ],
            ['uuid', Utils.uuid('wire:' + (element.schematic_line_id || index))]
        ]
    }

    /**
     * Builds schematic net label nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static labels(context) {
        return context.elements
            .filter((element) => element?.type === 'schematic_net_label')
            .map((element, index) => {
                const point = Utils.point(element.anchor_position || element)
                if (!point) return null
                return [
                    'label',
                    Utils.text(element.text || element.name),
                    [
                        'at',
                        point.x,
                        -point.y,
                        Utils.number(element.rotation, 0)
                    ],
                    [
                        'effects',
                        ['font', ['size', 1.27, 1.27], ['thickness', 0.15]]
                    ],
                    [
                        'uuid',
                        Utils.uuid(
                            'label:' + (element.schematic_net_label_id || index)
                        )
                    ]
                ]
            })
            .filter(Boolean)
    }

    /**
     * Builds schematic junction nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static junctions(context) {
        return context.elements
            .filter((element) => element?.type === 'schematic_junction')
            .map((element, index) => {
                const point = Utils.point(element.center || element)
                if (!point) return null
                return [
                    'junction',
                    ['at', point.x, -point.y],
                    ['diameter', Utils.number(element.diameter, 0)],
                    ['color', 0, 0, 0, 0],
                    [
                        'uuid',
                        Utils.uuid(
                            'junction:' +
                                (element.schematic_junction_id || index)
                        )
                    ]
                ]
            })
            .filter(Boolean)
    }

    /**
     * Builds schematic text nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static texts(context) {
        return context.elements
            .filter((element) => element?.type === 'schematic_text')
            .map((element, index) => {
                const point = Utils.point(
                    element.position || element.anchor_position || element
                )
                if (!point) return null
                return [
                    'text',
                    Utils.text(element.text || element.value),
                    [
                        'at',
                        point.x,
                        -point.y,
                        Utils.number(element.rotation, 0)
                    ],
                    [
                        'effects',
                        ['font', ['size', 1.27, 1.27], ['thickness', 0.15]]
                    ],
                    [
                        'uuid',
                        Utils.uuid(
                            'text:' + (element.schematic_text_id || index)
                        )
                    ]
                ]
            })
            .filter(Boolean)
    }

    /**
     * Builds simple schematic graphics.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static graphics(context) {
        return context.elements
            .filter((element) =>
                ['schematic_rect', 'schematic_box'].includes(element?.type)
            )
            .map((element, index) => {
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
                        Utils.uuid(
                            'graphic:' + (element.schematic_rect_id || index)
                        )
                    ]
                ]
            })
            .filter(Boolean)
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
