// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectContext as Context } from './CircuitJsonKicadProjectContext.mjs'
import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

const PAD_TYPES = new Set(['pcb_smtpad', 'pcb_plated_hole', 'pcb_hole'])

/**
 * Builds KiCad footprint pad nodes from CircuitJSON PCB pad and hole rows.
 */
export class CircuitJsonKicadProjectPcbPadBuilder {
    /**
     * Builds pad nodes for one placed component footprint.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {Array[]}
     */
    static componentPadNodes(context, row) {
        const component = row.pcbComponent || {}
        const componentId = Utils.text(component.pcb_component_id)

        return context.elements
            .filter(
                (element) =>
                    PAD_TYPES.has(element?.type) &&
                    Utils.text(element.pcb_component_id) === componentId
            )
            .map((pad, index) =>
                CircuitJsonKicadProjectPcbPadBuilder.padNode(
                    context,
                    component,
                    pad,
                    index
                )
            )
    }

    /**
     * Builds placed footprint nodes for board-owned pads and holes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static standaloneFootprints(context) {
        return CircuitJsonKicadProjectPcbPadBuilder.standaloneRows(context).map(
            (row) =>
                CircuitJsonKicadProjectPcbPadBuilder.standaloneFootprintNode(
                    context,
                    row,
                    { placed: true }
                )
        )
    }

    /**
     * Builds footprint library nodes for board-owned pads and holes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static standaloneLibraryFootprints(context) {
        return CircuitJsonKicadProjectPcbPadBuilder.standaloneRows(context).map(
            (row) =>
                CircuitJsonKicadProjectPcbPadBuilder.standaloneFootprintNode(
                    context,
                    row,
                    { placed: false }
                )
        )
    }

    /**
     * Builds normalized standalone pad/hole rows.
     * @param {object} context Export context.
     * @returns {object[]}
     */
    static standaloneRows(context) {
        return context.elements
            .filter(
                (element) =>
                    PAD_TYPES.has(element?.type) &&
                    !Utils.text(element.pcb_component_id)
            )
            .map((element, index) => {
                const center = CircuitJsonKicadProjectPcbPadBuilder.padCenter(
                    element
                ) || { x: index, y: 0 }
                const name = Utils.safeName(
                    CircuitJsonKicadProjectPcbPadBuilder.elementId(
                        element,
                        index
                    )
                )
                return { element, index, center, name }
            })
    }

    /**
     * Builds one footprint for a board-owned pad or hole.
     * @param {object} context Export context.
     * @param {object} row Standalone row.
     * @param {{ placed: boolean }} options Footprint options.
     * @returns {Array}
     */
    static standaloneFootprintNode(context, row, options) {
        const component = {
            pcb_component_id: 'standalone:' + row.name,
            center: row.center,
            layer: CircuitJsonKicadProjectPcbPadBuilder.padLayer(row.element)
        }
        const at = options.placed
            ? ['at', row.center.x, -row.center.y, 0]
            : ['at', 0, 0, 0]

        return [
            'footprint',
            options.placed ? context.libraryName + ':' + row.name : row.name,
            [
                'layer',
                CircuitJsonKicadProjectPcbPadBuilder.footprintLayer(component)
            ],
            at,
            [
                'uuid',
                Utils.uuid(
                    'standalone:footprint:' +
                        row.name +
                        ':' +
                        (options.placed ? 'placed' : 'library')
                )
            ],
            [
                'property',
                'Reference',
                row.name,
                ['at', 0, -1.5, 0],
                ['layer', 'F.SilkS']
            ],
            [
                'property',
                'Value',
                row.name,
                ['at', 0, 1.5, 0],
                ['layer', 'F.Fab']
            ],
            CircuitJsonKicadProjectPcbPadBuilder.padNode(
                context,
                component,
                row.element,
                0
            )
        ]
    }

    /**
     * Builds one KiCad pad node.
     * @param {object} context Export context.
     * @param {object} component PCB component.
     * @param {object} pad CircuitJSON pad or hole.
     * @param {number} index Pad index.
     * @returns {Array}
     */
    static padNode(context, component, pad, index) {
        const center = Utils.point(component.center) || { x: 0, y: 0 }
        const padPoint = CircuitJsonKicadProjectPcbPadBuilder.padCenter(
            pad
        ) || {
            x: index,
            y: 0
        }
        const padType = CircuitJsonKicadProjectPcbPadBuilder.padType(pad)
        const shape = CircuitJsonKicadProjectPcbPadBuilder.padShape(pad)
        const netName = Context.netName(pad)
        const netId = netName ? context.netMap.get(netName) || 0 : 0

        return [
            'pad',
            CircuitJsonKicadProjectPcbPadBuilder.padNumber(context, pad, index),
            padType,
            shape,
            [
                'at',
                Utils.round(padPoint.x - center.x),
                Utils.round(center.y - padPoint.y),
                CircuitJsonKicadProjectPcbPadBuilder.padRotation(pad)
            ],
            [
                'size',
                CircuitJsonKicadProjectPcbPadBuilder.padWidth(pad),
                CircuitJsonKicadProjectPcbPadBuilder.padHeight(pad)
            ],
            ...CircuitJsonKicadProjectPcbPadBuilder.drillNodes(pad),
            [
                'layers',
                ...CircuitJsonKicadProjectPcbPadBuilder.padLayers(
                    CircuitJsonKicadProjectPcbPadBuilder.padLayer(pad),
                    padType
                )
            ],
            ...CircuitJsonKicadProjectPcbPadBuilder.roundrectNodes(pad, shape),
            ...CircuitJsonKicadProjectPcbPadBuilder.customPadNodes(
                pad,
                shape,
                padPoint
            ),
            ...(netName ? [['net', netId, netName]] : [])
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
        const pinHint = Array.isArray(pad.port_hints)
            ? pad.port_hints.find((hint) => /^pin[A-Za-z0-9_]+$/iu.test(hint))
            : ''
        const gridHint = Array.isArray(pad.port_hints)
            ? pad.port_hints.find((hint) =>
                  /^[A-Za-z]?\d[A-Za-z0-9_]*$/u.test(hint)
              )
            : ''
        return String(
            sourcePort?.pin_number ||
                pad.number ||
                pad.name ||
                (pinHint ? pinHint.replace(/^pin/iu, '') : '') ||
                gridHint ||
                index + 1
        )
    }

    /**
     * Resolves a footprint layer.
     * @param {object} component PCB component.
     * @returns {string}
     */
    static footprintLayer(component) {
        return CircuitJsonKicadProjectPcbPadBuilder.side(component.layer) ===
            'bottom'
            ? 'B.Cu'
            : 'F.Cu'
    }

    /**
     * Resolves a pad center from point or polygon data.
     * @param {object} pad Pad or hole element.
     * @returns {{ x: number, y: number } | null}
     */
    static padCenter(pad) {
        const point = Utils.point(pad)
        if (point) return point
        const points = CircuitJsonKicadProjectPcbPadBuilder.points(pad)
        if (!points.length) return null
        return {
            x: Utils.round(
                points.reduce((sum, entry) => sum + entry.x, 0) / points.length
            ),
            y: Utils.round(
                points.reduce((sum, entry) => sum + entry.y, 0) / points.length
            )
        }
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
            CircuitJsonKicadProjectPcbPadBuilder.side(layer) === 'bottom'
                ? 'B'
                : 'F'
        return [side + '.Cu', side + '.Paste', side + '.Mask']
    }

    /**
     * Resolves a KiCad pad type.
     * @param {object} pad Pad or hole element.
     * @returns {string}
     */
    static padType(pad) {
        if (pad?.type === 'pcb_hole') return 'np_thru_hole'
        if (pad?.type === 'pcb_plated_hole') return 'thru_hole'
        return CircuitJsonKicadProjectPcbPadBuilder.hasDrill(pad)
            ? 'thru_hole'
            : 'smd'
    }

    /**
     * Resolves a KiCad pad shape.
     * @param {object} pad Pad or hole element.
     * @returns {string}
     */
    static padShape(pad) {
        const shape = Utils.text(
            pad.shape || pad.hole_shape || pad.shapeTopName
        ).toLowerCase()
        if (pad?.type === 'pcb_smtpad' && shape === 'polygon') return 'custom'
        if (
            pad?.type === 'pcb_smtpad' &&
            CircuitJsonKicadProjectPcbPadBuilder.roundrectRatio(pad)
        ) {
            return 'roundrect'
        }
        if (
            pad?.type === 'pcb_hole' &&
            (shape.includes('pill') || shape.includes('oval'))
        ) {
            return 'oval'
        }
        if (
            pad?.type === 'pcb_plated_hole' &&
            (shape.includes('rect_pad') || shape.includes('rect'))
        ) {
            return 'rect'
        }
        if (shape.includes('circle')) return 'circle'
        if (shape.includes('pill') || shape.includes('oval')) return 'oval'
        if (
            CircuitJsonKicadProjectPcbPadBuilder.hasDrill(pad) &&
            CircuitJsonKicadProjectPcbPadBuilder.padWidth(pad) ===
                CircuitJsonKicadProjectPcbPadBuilder.padHeight(pad)
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
        if (
            CircuitJsonKicadProjectPcbPadBuilder.padShapeForSize(pad) ===
            'custom'
        ) {
            return 0.2
        }
        return Utils.number(
            pad.width ??
                pad.outer_width ??
                pad.rect_pad_width ??
                pad.diameter ??
                pad.hole_diameter ??
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
        if (
            CircuitJsonKicadProjectPcbPadBuilder.padShapeForSize(pad) ===
            'custom'
        ) {
            return 0.2
        }
        return Utils.number(
            pad.height ??
                pad.outer_height ??
                pad.rect_pad_height ??
                pad.diameter ??
                pad.hole_diameter ??
                pad.hole_height,
            Utils.number(pad.radius, 0.5) * 2
        )
    }

    /**
     * Builds drill nodes for plated and non-plated holes.
     * @param {object} pad Pad or hole element.
     * @returns {Array[]}
     */
    static drillNodes(pad) {
        if (!CircuitJsonKicadProjectPcbPadBuilder.hasDrill(pad)) return []
        const drill = CircuitJsonKicadProjectPcbPadBuilder.drillSize(pad)
        const offset = CircuitJsonKicadProjectPcbPadBuilder.drillOffset(pad)
        const offsetNode = offset ? [['offset', offset.x, offset.y]] : []
        if (drill.oval) {
            return [['drill', 'oval', drill.width, drill.height, ...offsetNode]]
        }
        return [['drill', drill.diameter, ...offsetNode]]
    }

    /**
     * Builds roundrect metadata nodes.
     * @param {object} pad Pad element.
     * @param {string} shape KiCad pad shape.
     * @returns {Array[]}
     */
    static roundrectNodes(pad, shape) {
        if (shape !== 'roundrect') return []
        return [
            [
                'roundrect_rratio',
                CircuitJsonKicadProjectPcbPadBuilder.roundrectRatio(pad)
            ]
        ]
    }

    /**
     * Builds custom pad option and primitive nodes.
     * @param {object} pad Pad element.
     * @param {string} shape KiCad pad shape.
     * @param {{ x: number, y: number }} padPoint Pad center.
     * @returns {Array[]}
     */
    static customPadNodes(pad, shape, padPoint) {
        if (shape !== 'custom') return []
        const points = CircuitJsonKicadProjectPcbPadBuilder.points(pad)
        if (points.length < 3) return []
        return [
            ['options', ['anchor', 'circle']],
            [
                'primitives',
                [
                    'gr_poly',
                    [
                        'pts',
                        ...points.map((point) => [
                            'xy',
                            Utils.round(point.x - padPoint.x),
                            Utils.round(padPoint.y - point.y)
                        ])
                    ],
                    ['width', 0],
                    ['fill', 'yes']
                ]
            ]
        ]
    }

    /**
     * Resolves a round-rectangle ratio.
     * @param {object} pad Pad element.
     * @returns {number}
     */
    static roundrectRatio(pad) {
        const shape = Utils.text(pad.shape).toLowerCase()
        const cornerRadius = Utils.number(
            pad.corner_radius ?? pad.rect_border_radius,
            NaN
        )
        const pillRadius = Utils.number(pad.radius, NaN)
        const radius = Number.isFinite(cornerRadius)
            ? cornerRadius
            : shape.includes('pill')
              ? pillRadius
              : NaN
        if (!Number.isFinite(radius)) return 0
        const minor = Math.min(
            CircuitJsonKicadProjectPcbPadBuilder.padWidthForRatio(pad),
            CircuitJsonKicadProjectPcbPadBuilder.padHeightForRatio(pad)
        )
        if (!minor) return 0
        return Utils.round(Math.min(0.5, Math.max(0, radius / minor)))
    }

    /**
     * Resolves one pad rotation.
     * @param {object} pad Pad or hole element.
     * @returns {number}
     */
    static padRotation(pad) {
        return Utils.number(
            pad.rect_ccw_rotation ?? pad.ccw_rotation ?? pad.rotation,
            0
        )
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
     * Resolves a stable element identifier.
     * @param {object} element Pad or hole element.
     * @param {number} index Element index.
     * @returns {string}
     */
    static elementId(element, index) {
        return (
            Utils.text(
                element.pcb_smtpad_id ||
                    element.pcb_plated_hole_id ||
                    element.pcb_hole_id ||
                    element.name
            ) || element.type + '_' + (index + 1)
        )
    }

    /**
     * Checks whether a pad has drill geometry.
     * @param {object} pad Pad or hole element.
     * @returns {boolean}
     */
    static hasDrill(pad) {
        return (
            pad?.type === 'pcb_hole' ||
            pad?.type === 'pcb_plated_hole' ||
            pad.hole_diameter !== undefined ||
            pad.hole_width !== undefined ||
            pad.drill !== undefined ||
            pad.holeDiameter !== undefined
        )
    }

    /**
     * Resolves drill geometry.
     * @param {object} pad Pad or hole element.
     * @returns {{ oval: boolean, diameter: number, width: number, height: number }}
     */
    static drillSize(pad) {
        const shape = Utils.text(pad.shape || pad.hole_shape).toLowerCase()
        const width = Utils.number(pad.hole_width, NaN)
        const height = Utils.number(pad.hole_height, NaN)
        if (
            Number.isFinite(width) &&
            Number.isFinite(height) &&
            (shape.includes('pill') || shape.includes('oval'))
        ) {
            return {
                oval: true,
                diameter: Math.min(width, height),
                width,
                height
            }
        }
        const diameter = Utils.number(
            pad.hole_diameter ?? pad.drill ?? pad.holeDiameter,
            Math.min(
                Utils.number(width, 0.8),
                Utils.number(height, Utils.number(width, 0.8))
            )
        )
        return {
            oval: false,
            diameter,
            width: diameter,
            height: diameter
        }
    }

    /**
     * Resolves KiCad drill offset.
     * @param {object} pad Pad or hole element.
     * @returns {{ x: number, y: number } | null}
     */
    static drillOffset(pad) {
        if (
            pad.hole_offset_x === undefined &&
            pad.hole_offset_y === undefined
        ) {
            return null
        }
        const x = Utils.number(pad.hole_offset_x, 0)
        const y = Utils.number(pad.hole_offset_y, 0)
        if (x === 0 && y === 0) return null
        return { x: Utils.round(-x), y: Utils.round(y) }
    }

    /**
     * Resolves shape for size-only checks without recursion.
     * @param {object} pad Pad element.
     * @returns {string}
     */
    static padShapeForSize(pad) {
        return Utils.text(pad.shape || pad.shapeTopName).toLowerCase() ===
            'polygon'
            ? 'custom'
            : ''
    }

    /**
     * Resolves pad width without custom-size fallback.
     * @param {object} pad Pad element.
     * @returns {number}
     */
    static padWidthForRatio(pad) {
        return Utils.number(
            pad.width ?? pad.outer_width ?? pad.rect_pad_width ?? pad.diameter,
            Utils.number(pad.radius, 0.5) * 2
        )
    }

    /**
     * Resolves pad height without custom-size fallback.
     * @param {object} pad Pad element.
     * @returns {number}
     */
    static padHeightForRatio(pad) {
        return Utils.number(
            pad.height ??
                pad.outer_height ??
                pad.rect_pad_height ??
                pad.diameter,
            Utils.number(pad.radius, 0.5) * 2
        )
    }
}
