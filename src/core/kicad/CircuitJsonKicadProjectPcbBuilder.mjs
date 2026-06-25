// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectMetadata as Metadata } from './CircuitJsonKicadProjectMetadata.mjs'
import { CircuitJsonKicadProjectPcbArtworkBuilder as ArtworkBuilder } from './CircuitJsonKicadProjectPcbArtworkBuilder.mjs'
import { CircuitJsonKicadProjectPcbBoardArtworkBuilder as BoardArtworkBuilder } from './CircuitJsonKicadProjectPcbBoardArtworkBuilder.mjs'
import { CircuitJsonKicadProjectPcbBoardGeometryBuilder as BoardGeometryBuilder } from './CircuitJsonKicadProjectPcbBoardGeometryBuilder.mjs'
import { CircuitJsonKicadProjectPcbModelBuilder as ModelBuilder } from './CircuitJsonKicadProjectPcbModelBuilder.mjs'
import { CircuitJsonKicadProjectPcbNetResolver as NetResolver } from './CircuitJsonKicadProjectPcbNetResolver.mjs'
import { CircuitJsonKicadProjectPcbPadBuilder as PadBuilder } from './CircuitJsonKicadProjectPcbPadBuilder.mjs'
import { CircuitJsonKicadProjectPcbZoneBuilder as ZoneBuilder } from './CircuitJsonKicadProjectPcbZoneBuilder.mjs'
import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

/**
 * Builds KiCad PCB and footprint-library S-expression nodes.
 */
export class CircuitJsonKicadProjectPcbBuilder {
    /**
     * Builds a PCB file root.
     * @param {object} context Export context.
     * @returns {Array}
     */
    static buildPcb(context) {
        return [
            'kicad_pcb',
            ['version', 20240108],
            ['generator', 'ecad_forge'],
            ['paper', 'A4'],
            CircuitJsonKicadProjectPcbBuilder.layersNode(context),
            ['net', 0, ''],
            ...Array.from(context.netMap.entries()).map(([name, id]) => [
                'net',
                id,
                name
            ]),
            ...CircuitJsonKicadProjectPcbBuilder.pcbFootprints(context),
            ...CircuitJsonKicadProjectPcbBuilder.pcbSegments(context),
            ...CircuitJsonKicadProjectPcbBuilder.pcbVias(context),
            ...CircuitJsonKicadProjectPcbBuilder.copperZones(context),
            ...CircuitJsonKicadProjectPcbBuilder.keepoutZones(context),
            ...CircuitJsonKicadProjectPcbBuilder.boardGraphics(context)
        ]
    }

    /**
     * Builds the standard layer declaration node.
     * @param {object} [context] Export context.
     * @returns {Array}
     */
    static layersNode(context = {}) {
        const count = Math.max(2, Utils.number(context.board?.num_layers, 2))
        const innerLayers = Array.from(
            { length: Math.max(Math.round(count) - 2, 0) },
            (_entry, index) => [
                String(index + 1),
                'In' + (index + 1) + '.Cu',
                'signal'
            ]
        )
        return [
            'layers',
            ['0', 'F.Cu', 'signal'],
            ...innerLayers,
            ['31', 'B.Cu', 'signal'],
            ['32', 'B.Adhes', 'user'],
            ['33', 'F.Adhes', 'user'],
            ['34', 'B.Paste', 'user'],
            ['35', 'F.Paste', 'user'],
            ['36', 'B.SilkS', 'user'],
            ['37', 'F.SilkS', 'user'],
            ['38', 'B.Mask', 'user'],
            ['39', 'F.Mask', 'user'],
            ['40', 'Dwgs.User', 'user'],
            ['44', 'Edge.Cuts', 'user'],
            ['46', 'B.CrtYd', 'user'],
            ['47', 'F.CrtYd', 'user'],
            ['49', 'F.Fab', 'user'],
            ['50', 'B.Fab', 'user']
        ]
    }

    /**
     * Builds placed PCB footprint nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static pcbFootprints(context) {
        return context.footprintRows
            .filter((row) => row.pcbComponent)
            .map((row) =>
                CircuitJsonKicadProjectPcbBuilder.footprintNode(context, row, {
                    placed: true
                })
            )
    }

    /**
     * Builds footprint library archive entries.
     * @param {object} context Export context.
     * @param {string} basePath Archive base path.
     * @returns {{ path: string, bytes: Uint8Array, contentType: string }[]}
     */
    static footprintEntries(context, basePath) {
        return context.footprintRows.map((row) =>
            Utils.sexprEntry(
                Utils.joinPath(
                    basePath,
                    context.libraryName +
                        '.pretty/' +
                        row.footprintName +
                        '.kicad_mod'
                ),
                CircuitJsonKicadProjectPcbBuilder.footprintNode(context, row, {
                    placed: false
                }),
                'application/x-kicad-footprint'
            )
        )
    }

    /**
     * Builds one footprint node.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @param {{ placed: boolean }} options Footprint options.
     * @returns {Array}
     */
    static footprintNode(context, row, options) {
        const component = row.pcbComponent || {}
        const center = Utils.point(component.center) || { x: 0, y: 0 }
        const at = options.placed
            ? ['at', center.x, -center.y, Utils.number(component.rotation, 0)]
            : ['at', 0, 0, 0]

        return [
            'footprint',
            options.placed
                ? Metadata.footprintLibId(context, row)
                : row.footprintName,
            [
                'layer',
                CircuitJsonKicadProjectPcbBuilder.footprintLayer(component, row)
            ],
            at,
            ['uuid', Utils.uuid('fp:' + row.sourceId)],
            ...Metadata.footprintPropertyNodes(
                [
                    {
                        name: 'Reference',
                        value: options.placed
                            ? row.referenceDesignator || row.reference
                            : row.reference,
                        at: [0, -1.5, 0],
                        layer: 'F.SilkS'
                    },
                    {
                        name: 'Value',
                        value: row.value,
                        at: [0, 1.5, 0],
                        layer: 'F.Fab'
                    }
                ],
                Metadata.footprintMetadata(row)
            ),
            ...Metadata.footprintAttributeNodes(row),
            ...Metadata.footprintEmbeddedFontNodes(row),
            ...CircuitJsonKicadProjectPcbBuilder.padNodes(context, row),
            ...ArtworkBuilder.nodes(context, row),
            ...ModelBuilder.modelNodes(context, row)
        ]
    }

    /**
     * Builds pad nodes for one component.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {Array[]}
     */
    static padNodes(context, row) {
        if (row.standalonePad) {
            return [
                PadBuilder.padNode(
                    context,
                    row.pcbComponent || {},
                    row.standalonePad,
                    0
                )
            ]
        }

        return PadBuilder.componentPadNodes(context, row)
    }

    /**
     * Builds one pad node.
     * @param {object} context Export context.
     * @param {object} component PCB component.
     * @param {object} pad Pad element.
     * @param {number} index Pad index.
     * @returns {Array}
     */
    static padNode(context, component, pad, index) {
        return PadBuilder.padNode(context, component, pad, index)
    }

    /**
     * Builds routed segment nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static pcbSegments(context) {
        const segments = []
        for (const trace of context.elements.filter(
            (element) => element?.type === 'pcb_trace'
        )) {
            segments.push(
                ...CircuitJsonKicadProjectPcbBuilder.traceSegments(
                    context,
                    trace
                )
            )
        }
        return segments
    }

    /**
     * Builds segments for one trace.
     * @param {object} context Export context.
     * @param {object} trace Trace element.
     * @returns {Array[]}
     */
    static traceSegments(context, trace) {
        const route = Array.isArray(trace.route) ? trace.route : []
        const segments = []
        const netName = NetResolver.netName(context, trace)
        let lastKnownLayer =
            CircuitJsonKicadProjectPcbBuilder.routePointLayer(
                route[0],
                'start'
            ) || trace.layer

        for (let index = 0; index < route.length - 1; index += 1) {
            const startPoint = route[index]
            const endPoint = route[index + 1]
            const start = CircuitJsonKicadProjectPcbBuilder.routePointPosition(
                startPoint,
                'start'
            )
            const end = CircuitJsonKicadProjectPcbBuilder.routePointPosition(
                endPoint,
                'end'
            )
            if (!start || !end) continue
            if (start.x === end.x && start.y === end.y) continue
            const startLayer =
                CircuitJsonKicadProjectPcbBuilder.routePointLayer(
                    startPoint,
                    'start'
                )
            const endLayer = CircuitJsonKicadProjectPcbBuilder.routePointLayer(
                endPoint,
                'end'
            )
            const layer =
                startLayer || endLayer || lastKnownLayer || trace.layer
            segments.push([
                'segment',
                ['start', start.x, -start.y],
                ['end', end.x, -end.y],
                [
                    'width',
                    Utils.number(
                        CircuitJsonKicadProjectPcbBuilder.routePointWidth(
                            startPoint
                        ) ??
                            CircuitJsonKicadProjectPcbBuilder.routePointWidth(
                                endPoint
                            ) ??
                            trace.width,
                        0.25
                    )
                ],
                ['layer', CircuitJsonKicadProjectPcbBuilder.copperLayer(layer)],
                ['net', netName ? context.netMap.get(netName) || 0 : 0],
                ['uuid', Utils.uuid('segment:' + (trace.pcb_trace_id || index))]
            ])
            lastKnownLayer = endLayer || startLayer || lastKnownLayer
        }

        return segments
    }

    /**
     * Builds via nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static pcbVias(context) {
        const seen = new Set()
        return [
            ...context.elements
                .filter((element) => element?.type === 'pcb_via')
                .map((via, index) => ({ via, index })),
            ...CircuitJsonKicadProjectPcbBuilder.routeViaRows(context)
        ]
            .filter((row) => {
                const key = CircuitJsonKicadProjectPcbBuilder.viaDedupeKey(
                    context,
                    row.via
                )
                if (seen.has(key)) return false
                seen.add(key)
                return true
            })
            .map((row) =>
                CircuitJsonKicadProjectPcbBuilder.viaNode(
                    context,
                    row.via,
                    row.index
                )
            )
    }

    /**
     * Builds route-defined via rows.
     * @param {object} context Export context.
     * @returns {{ via: object, index: number }[]}
     */
    static routeViaRows(context) {
        return context.elements
            .filter((element) => element?.type === 'pcb_trace')
            .flatMap((trace) =>
                (Array.isArray(trace.route) ? trace.route : [])
                    .filter((entry) => entry?.route_type === 'via')
                    .map((entry, index) => ({
                        via: {
                            ...entry,
                            type: 'pcb_via',
                            pcb_via_id:
                                (trace.pcb_trace_id || 'trace') +
                                ':via:' +
                                index,
                            net: NetResolver.netName(context, trace)
                        },
                        index
                    }))
            )
    }

    /**
     * Builds one via node.
     * @param {object} context Export context.
     * @param {object} via Via element.
     * @param {number} index Via index.
     * @returns {Array}
     */
    static viaNode(context, via, index) {
        const point = Utils.point(via) || { x: 0, y: 0 }
        const netName = NetResolver.netName(context, via)

        return [
            'via',
            ['at', point.x, -point.y],
            ['size', Utils.number(via.outer_diameter ?? via.diameter, 0.8)],
            ['drill', Utils.number(via.hole_diameter, 0.4)],
            ['layers', ...CircuitJsonKicadProjectPcbBuilder.viaLayers(via)],
            ['net', netName ? context.netMap.get(netName) || 0 : 0],
            ['uuid', Utils.uuid('via:' + (via.pcb_via_id || index))]
        ]
    }

    /**
     * Builds a via identity key for suppressing duplicate route-defined vias.
     * @param {object} context Export context.
     * @param {object} via Via element.
     * @returns {string}
     */
    static viaDedupeKey(context, via) {
        const point = Utils.point(via) || { x: 0, y: 0 }
        const layers = CircuitJsonKicadProjectPcbBuilder.viaLayers(via)
            .slice()
            .sort((left, right) => left.localeCompare(right))
            .join(',')
        return [
            Utils.round(point.x),
            Utils.round(point.y),
            layers,
            NetResolver.netName(context, via)
        ].join('|')
    }

    /**
     * Resolves a route point position.
     * @param {object} point Route point.
     * @param {'start' | 'end'} role Segment role.
     * @returns {{ x: number, y: number } | null}
     */
    static routePointPosition(point, role) {
        const direct = Utils.point(point)
        if (direct) return direct
        if (!point) return null
        if (point.route_type === 'through_pad') {
            return (
                Utils.point(role === 'start' ? point.start : point.end) ||
                Utils.point(point.center)
            )
        }
        return Utils.point(role === 'start' ? point.start : point.end)
    }

    /**
     * Resolves a route point layer.
     * @param {object} point Route point.
     * @param {'start' | 'end'} role Segment role.
     * @returns {unknown}
     */
    static routePointLayer(point, role) {
        if (!point) return ''
        if (point.route_type === 'through_pad') {
            return role === 'start'
                ? point.end_layer || point.to_layer || point.layer
                : point.start_layer || point.from_layer || point.layer
        }
        if (point.route_type === 'via') {
            return role === 'start'
                ? point.to_layer || point.end_layer || point.layer
                : point.from_layer || point.start_layer || point.layer
        }
        return point.layer || point.start_layer || point.end_layer
    }

    /**
     * Resolves a route point width.
     * @param {object} point Route point.
     * @returns {unknown}
     */
    static routePointWidth(point) {
        return point?.width ?? point?.trace_width ?? point?.stroke_width
    }

    /**
     * Builds board outline graphics.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static boardGraphics(context) {
        return [
            ...BoardGeometryBuilder.nodes(context),
            ...CircuitJsonKicadProjectPcbBuilder.lineGraphics(context),
            ...CircuitJsonKicadProjectPcbBuilder.textGraphics(context),
            ...BoardArtworkBuilder.nodes(context)
        ]
    }

    /**
     * Builds copper zone nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static copperZones(context) {
        return ZoneBuilder.nodes(context, {
            copperLayer: CircuitJsonKicadProjectPcbBuilder.copperLayer,
            netName: NetResolver.netName
        })
    }

    /**
     * Builds PCB keepout zone nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static keepoutZones(context) {
        return ZoneBuilder.keepoutNodes(context, {
            copperLayer: CircuitJsonKicadProjectPcbBuilder.copperLayer
        })
    }

    /**
     * Builds board cutout graphics.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static cutoutGraphics(context) {
        return BoardGeometryBuilder.cutoutGraphics(context)
    }

    /**
     * Builds PCB line graphics.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static lineGraphics(context) {
        return [
            'pcb_silkscreen_line',
            'pcb_note_line',
            'pcb_fabrication_note_line'
        ].flatMap((type) =>
            context.elements
                .filter((element) => element?.type === type)
                .map((element, index) =>
                    CircuitJsonKicadProjectPcbBuilder.lineGraphic(
                        element,
                        index
                    )
                )
                .filter(Boolean)
        )
    }

    /**
     * Builds one PCB line graphic.
     * @param {object} element Line element.
     * @param {number} index Line index.
     * @returns {Array | null}
     */
    static lineGraphic(element, index) {
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
            'gr_line',
            ['start', start.x, -start.y],
            ['end', end.x, -end.y],
            [
                'stroke',
                ['width', Utils.number(element.width, 0.15)],
                ['type', 'solid']
            ],
            ['layer', CircuitJsonKicadProjectPcbBuilder.graphicLayer(element)],
            [
                'uuid',
                Utils.uuid('line:' + (element.pcb_silkscreen_line_id || index))
            ]
        ]
    }

    /**
     * Builds PCB text graphics.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static textGraphics(context) {
        return [
            'pcb_silkscreen_text',
            'pcb_text',
            'pcb_fabrication_note_text',
            'pcb_note_text'
        ].flatMap((type) =>
            context.elements
                .filter((element) => element?.type === type)
                .map((element, index) =>
                    CircuitJsonKicadProjectPcbBuilder.textGraphic(
                        element,
                        index
                    )
                )
                .filter(Boolean)
        )
    }

    /**
     * Builds one PCB text graphic.
     * @param {object} element Text element.
     * @param {number} index Text index.
     * @returns {Array | null}
     */
    static textGraphic(element, index) {
        const point = Utils.point(element.anchor_position || element)
        if (!point) return null
        const size = Utils.number(element.font_size ?? element.height, 1)
        const strokeWidth = Utils.number(element.stroke_width, 0.15)
        return [
            'gr_text',
            Utils.text(element.text),
            ['at', point.x, -point.y, Utils.number(element.ccw_rotation, 0)],
            ['layer', CircuitJsonKicadProjectPcbBuilder.graphicLayer(element)],
            ...(element.is_hidden === true ? [['hide']] : []),
            [
                'effects',
                ['font', ['size', size, size], ['thickness', strokeWidth]]
            ],
            [
                'uuid',
                Utils.uuid(
                    'text:' +
                        (element.pcb_text_id ||
                            element.pcb_silkscreen_text_id ||
                            element.pcb_fabrication_note_text_id ||
                            index)
                )
            ]
        ]
    }

    /**
     * Resolves one pad number.
     * @param {object} context Export context.
     * @param {object} pad Pad element.
     * @param {number} index Pad index.
     * @returns {string}
     */
    static padNumber(context, pad, index) {
        if (pad?.type === 'pcb_hole') return ''
        const pcbPort = context.pcbPorts.get(Utils.text(pad.pcb_port_id))
        const sourcePort = context.sourcePorts.byId.get(
            Utils.text(pcbPort?.source_port_id)
        )
        const hint = Array.isArray(pad.port_hints) ? pad.port_hints[0] : ''
        return String(
            sourcePort?.pin_number ||
                pad.number ||
                pad.name ||
                hint ||
                index + 1
        )
    }

    /**
     * Resolves a footprint layer.
     * @param {object} component PCB component.
     * @param {object} [row] Component row.
     * @returns {string}
     */
    static footprintLayer(component, row = {}) {
        const metadata = Metadata.footprintMetadata(row)
        return CircuitJsonKicadProjectPcbBuilder.side(
            metadata.layer || component.layer
        ) === 'bottom'
            ? 'B.Cu'
            : 'F.Cu'
    }

    /**
     * Builds one pad placement node.
     * @param {object} component PCB component.
     * @param {object} pad Pad element.
     * @param {{ x: number, y: number }} padPoint Pad point.
     * @param {{ x: number, y: number }} center Component center.
     * @returns {Array}
     */
    static padAtNode(component, pad, padPoint, center) {
        return [
            'at',
            Utils.round(padPoint.x - center.x),
            Utils.round(center.y - padPoint.y),
            Utils.number(
                pad.rect_ccw_rotation ??
                    pad.ccw_rotation ??
                    pad.rotation ??
                    component.rotation,
                0
            )
        ]
    }

    /**
     * Resolves a pad source layer.
     * @param {object} pad Pad element.
     * @returns {string}
     */
    static padLayer(pad) {
        if (Array.isArray(pad.layers) && pad.layers.length) {
            return Utils.text(pad.layers[0])
        }
        return Utils.text(pad.layer, 'top')
    }

    /**
     * Resolves KiCad pad layers.
     * @param {string} layer Source layer.
     * @param {string} padType KiCad pad type.
     * @returns {string[]}
     */
    static padLayers(layer, padType) {
        if (padType === 'thru_hole' || padType === 'np_thru_hole') {
            return ['*.Cu', '*.Mask']
        }
        const side =
            CircuitJsonKicadProjectPcbBuilder.side(layer) === 'bottom'
                ? 'B'
                : 'F'
        return [side + '.Cu', side + '.Paste', side + '.Mask']
    }

    /**
     * Resolves KiCad via layers.
     * @param {object} via Via element.
     * @returns {string[]}
     */
    static viaLayers(via) {
        const layers = Array.isArray(via.layers) ? via.layers : []
        const resolvedLayers = layers.length
            ? layers
            : [via.from_layer, via.to_layer].filter(Boolean)
        if (!resolvedLayers.length) return ['F.Cu', 'B.Cu']
        return resolvedLayers.map((layer) =>
            CircuitJsonKicadProjectPcbBuilder.copperLayer(layer)
        )
    }

    /**
     * Resolves one copper layer.
     * @param {unknown} value Source layer.
     * @returns {string}
     */
    static copperLayer(value) {
        const text = Utils.text(value).toLowerCase()
        const innerMatch = /^inner(\d+)$/u.exec(text)
        if (innerMatch) return 'In' + innerMatch[1] + '.Cu'
        if (/^in\d+\.cu$/u.test(text)) {
            return 'In' + text.match(/\d+/u)[0] + '.Cu'
        }
        if (CircuitJsonKicadProjectPcbBuilder.side(value) === 'bottom') {
            return 'B.Cu'
        }
        return 'F.Cu'
    }

    /**
     * Normalizes a top/bottom side value.
     * @param {unknown} value Candidate side.
     * @returns {'top' | 'bottom'}
     */
    static side(value) {
        const text = Utils.text(value).toLowerCase()
        return text === 'bottom' ||
            text === 'back' ||
            text === 'b' ||
            text === 'b.cu'
            ? 'bottom'
            : 'top'
    }

    /**
     * Resolves polygon points from common element fields.
     * @param {object} element Element.
     * @returns {{ x: number, y: number }[]}
     */
    static points(element) {
        return (
            (Array.isArray(element?.points) && element.points) ||
            (Array.isArray(element?.outline) && element.outline) ||
            (Array.isArray(element?.vertices) && element.vertices) ||
            []
        )
            .map((point) => Utils.point(point))
            .filter(Boolean)
    }

    /**
     * Resolves a KiCad graphic layer.
     * @param {object} element Graphic element.
     * @returns {string}
     */
    static graphicLayer(element) {
        const text = Utils.text(element.layer).toLowerCase()
        const type = Utils.text(element.type).toLowerCase()
        if (
            text.includes('dwgs') ||
            text.includes('drawing') ||
            text.includes('user') ||
            (type.includes('note') && !type.includes('fabrication'))
        ) {
            return 'Dwgs.User'
        }
        if (text.includes('bottom') || text.startsWith('b.')) {
            if (text.includes('silk')) return 'B.SilkS'
            if (text.includes('fab')) return 'B.Fab'
            return 'B.Cu'
        }
        if (text.includes('silk')) return 'F.SilkS'
        if (text.includes('fab')) return 'F.Fab'
        if (text.includes('edge')) return 'Edge.Cuts'
        return 'F.Cu'
    }

    /**
     * Resolves a KiCad pad shape.
     * @param {object} pad Pad element.
     * @param {Array | null} drill Drill node.
     * @returns {string}
     */
    static padType(pad, drill) {
        if (pad?.type === 'pcb_hole') return 'np_thru_hole'
        return drill ? 'thru_hole' : 'smd'
    }

    /**
     * Resolves a KiCad pad shape.
     * @param {object} pad Pad element.
     * @param {Array | null} drill Drill node.
     * @returns {string}
     */
    static padShape(pad, drill) {
        const shape = Utils.text(pad.shape || pad.shapeTopName).toLowerCase()
        if (shape.includes('polygon') || Array.isArray(pad.points)) {
            return 'custom'
        }
        if (pad.corner_radius || shape.includes('roundrect')) {
            return 'roundrect'
        }
        if (shape.includes('rect')) return 'rect'
        if (shape.includes('circle')) return 'circle'
        if (shape.includes('pill') || shape.includes('oval')) return 'oval'
        if (
            drill &&
            CircuitJsonKicadProjectPcbBuilder.padWidth(pad) ===
                CircuitJsonKicadProjectPcbBuilder.padHeight(pad)
        ) {
            return 'circle'
        }
        return 'rect'
    }

    /**
     * Resolves one pad width.
     * @param {object} pad Pad element.
     * @returns {number}
     */
    static padWidth(pad) {
        return Utils.number(
            pad.width ??
                pad.outer_width ??
                pad.rect_pad_width ??
                pad.diameter ??
                pad.hole_width,
            Utils.number(pad.radius, 0.5) * 2
        )
    }

    /**
     * Resolves one pad height.
     * @param {object} pad Pad element.
     * @returns {number}
     */
    static padHeight(pad) {
        return Utils.number(
            pad.height ??
                pad.outer_height ??
                pad.rect_pad_height ??
                pad.diameter ??
                pad.hole_height,
            Utils.number(pad.radius, 0.5) * 2
        )
    }

    /**
     * Resolves one pad drill node.
     * @param {object} pad Pad element.
     * @returns {Array | null}
     */
    static drillNode(pad) {
        const width = Utils.number(pad.hole_width, NaN)
        const height = Utils.number(pad.hole_height, NaN)
        const offsetX = Utils.number(pad.hole_offset_x, 0)
        const offsetY = Utils.number(pad.hole_offset_y, 0)
        const offset =
            offsetX || offsetY
                ? [['offset', Utils.round(-offsetX), Utils.round(offsetY)]]
                : []

        if (Number.isFinite(width) && Number.isFinite(height)) {
            return ['drill', 'oval', width, height, ...offset]
        }

        const diameter = Utils.number(
            pad.hole_diameter ?? pad.drill ?? pad.holeDiameter,
            0
        )
        return diameter > 0 ? ['drill', diameter] : null
    }

    /**
     * Resolves the KiCad roundrect ratio from corner radius and pad size.
     * @param {object} pad Pad element.
     * @returns {number}
     */
    static roundrectRatio(pad) {
        const radius = Utils.number(pad.corner_radius, 0)
        const minSize = Math.min(
            CircuitJsonKicadProjectPcbBuilder.padWidth(pad),
            CircuitJsonKicadProjectPcbBuilder.padHeight(pad)
        )
        if (minSize <= 0) return 0
        return Utils.round(radius / minSize)
    }

    /**
     * Builds custom pad primitive nodes.
     * @param {object} pad Pad element.
     * @param {{ x: number, y: number }} padPoint Pad anchor point.
     * @returns {Array}
     */
    static customPadPrimitives(pad, padPoint) {
        const points = CircuitJsonKicadProjectPcbBuilder.points(pad).map(
            (point) => [
                'xy',
                Utils.round(point.x - padPoint.x),
                Utils.round(padPoint.y - point.y)
            ]
        )

        return [
            'primitives',
            ['gr_poly', ['pts', ...points], ['width', 0], ['fill', 'yes']]
        ]
    }
}
