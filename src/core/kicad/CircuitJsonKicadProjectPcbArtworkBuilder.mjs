// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

const ARTWORK_TYPES = new Set([
    'pcb_silkscreen_path',
    'pcb_silkscreen_line',
    'pcb_silkscreen_text',
    'pcb_silkscreen_circle',
    'pcb_silkscreen_rect',
    'pcb_note_path',
    'pcb_note_line',
    'pcb_note_text',
    'pcb_note_circle',
    'pcb_note_rect',
    'pcb_fabrication_note_path',
    'pcb_fabrication_note_line',
    'pcb_fabrication_note_text',
    'pcb_fabrication_note_circle',
    'pcb_fabrication_note_rect',
    'pcb_courtyard',
    'pcb_courtyard_path',
    'pcb_courtyard_line',
    'pcb_courtyard_circle',
    'pcb_courtyard_rect',
    'pcb_courtyard_outline'
])

/**
 * Builds KiCad footprint artwork primitives from component-owned PCB rows.
 */
export class CircuitJsonKicadProjectPcbArtworkBuilder {
    /**
     * Builds footprint artwork nodes for one component row.
     * @param {object} context Export context.
     * @param {object} row Component row.
     * @returns {Array[]}
     */
    static nodes(context, row) {
        const component = row.pcbComponent || {}
        const componentId = Utils.text(component.pcb_component_id)
        if (!componentId) return []

        return context.elements.flatMap((element, index) => {
            if (!ARTWORK_TYPES.has(element?.type)) return []
            if (
                Utils.text(element.pcb_component_id) !== componentId &&
                Utils.text(element.source_component_id) !== row.sourceId
            ) {
                return []
            }
            return CircuitJsonKicadProjectPcbArtworkBuilder.#elementNodes(
                component,
                row,
                element,
                index
            )
        })
    }

    /**
     * Builds KiCad nodes for one artwork element.
     * @param {object} component PCB component row.
     * @param {object} row Component row.
     * @param {object} element Artwork element.
     * @param {number} index Fallback index.
     * @returns {Array[]}
     */
    static #elementNodes(component, row, element, index) {
        if (element.type.endsWith('_text')) {
            return [
                CircuitJsonKicadProjectPcbArtworkBuilder.#textNode(
                    component,
                    row,
                    element,
                    index
                )
            ].filter(Boolean)
        }
        if (element.type.endsWith('_circle')) {
            return [
                CircuitJsonKicadProjectPcbArtworkBuilder.#circleNode(
                    component,
                    element,
                    index
                )
            ].filter(Boolean)
        }
        if (element.type.endsWith('_rect')) {
            return [
                CircuitJsonKicadProjectPcbArtworkBuilder.#rectNode(
                    component,
                    element,
                    index
                )
            ].filter(Boolean)
        }
        if (element.type.endsWith('_outline')) {
            return [
                CircuitJsonKicadProjectPcbArtworkBuilder.#polyNode(
                    component,
                    element,
                    index
                )
            ].filter(Boolean)
        }
        if (element.type === 'pcb_courtyard') {
            return CircuitJsonKicadProjectPcbArtworkBuilder.#genericShapeNodes(
                component,
                element,
                index
            )
        }
        return CircuitJsonKicadProjectPcbArtworkBuilder.#lineNodes(
            component,
            element,
            index
        )
    }

    /**
     * Builds KiCad nodes for a generic shape-bearing artwork element.
     * @param {object} component PCB component row.
     * @param {object} element Artwork element.
     * @param {number} index Fallback index.
     * @returns {Array[]}
     */
    static #genericShapeNodes(component, element, index) {
        const shape = Utils.text(element.shape).toLowerCase()
        const points = CircuitJsonKicadProjectPcbArtworkBuilder.#points(element)
        if (
            shape === 'circle' ||
            element.radius !== undefined ||
            element.diameter !== undefined
        ) {
            return [
                CircuitJsonKicadProjectPcbArtworkBuilder.#circleNode(
                    component,
                    element,
                    index
                )
            ].filter(Boolean)
        }
        if (
            shape === 'rect' ||
            (element.width !== undefined && element.height !== undefined)
        ) {
            return [
                CircuitJsonKicadProjectPcbArtworkBuilder.#rectNode(
                    component,
                    element,
                    index
                )
            ].filter(Boolean)
        }
        if (points.length >= 3) {
            return [
                CircuitJsonKicadProjectPcbArtworkBuilder.#polyNode(
                    component,
                    element,
                    index
                )
            ].filter(Boolean)
        }
        return CircuitJsonKicadProjectPcbArtworkBuilder.#lineNodes(
            component,
            element,
            index
        )
    }

    /**
     * Builds one footprint text node.
     * @param {object} component PCB component row.
     * @param {object} row Component row.
     * @param {object} element Text element.
     * @param {number} index Fallback index.
     * @returns {Array | null}
     */
    static #textNode(component, row, element, index) {
        const point = Utils.point(
            element.anchor_position || element.position || element
        )
        if (!point) return null
        const text = Utils.text(element.text || element.value)
        if (!text) return null
        const at = CircuitJsonKicadProjectPcbArtworkBuilder.#localPoint(
            component,
            point
        )
        const size = Utils.number(
            element.font_size || element.fontSize || element.size,
            1
        )

        return [
            'fp_text',
            CircuitJsonKicadProjectPcbArtworkBuilder.#textKind(row, text),
            text,
            [
                'at',
                at.x,
                at.y,
                Utils.number(element.rotation ?? element.ccw_rotation, 0)
            ],
            [
                'layer',
                CircuitJsonKicadProjectPcbArtworkBuilder.#layer(
                    component,
                    element
                )
            ],
            [
                'uuid',
                Utils.uuid(
                    'art:text:' +
                        CircuitJsonKicadProjectPcbArtworkBuilder.#elementId(
                            element,
                            index
                        )
                )
            ],
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
     * Resolves the footprint text kind.
     * @param {object} row Component row.
     * @param {string} text Text value.
     * @returns {string}
     */
    static #textKind(row, text) {
        const referenceTexts = new Set([
            Utils.text(row.sourceComponent?.name),
            Utils.text(row.sourceComponent?.reference),
            Utils.text(row.referenceDesignator),
            Utils.text(row.reference)
        ])
        if (referenceTexts.has(text)) return 'reference'
        if (text === Utils.text(row.value)) return 'value'
        return 'user'
    }

    /**
     * Builds footprint line nodes for a path or line element.
     * @param {object} component PCB component row.
     * @param {object} element Path or line element.
     * @param {number} index Fallback index.
     * @returns {Array[]}
     */
    static #lineNodes(component, element, index) {
        const points = CircuitJsonKicadProjectPcbArtworkBuilder.#points(element)
        const linePoints = points.length
            ? points
            : CircuitJsonKicadProjectPcbArtworkBuilder.#linePoints(element)
        return linePoints
            .slice(0, -1)
            .map((point, pointIndex) =>
                CircuitJsonKicadProjectPcbArtworkBuilder.#lineNode(
                    component,
                    element,
                    point,
                    linePoints[pointIndex + 1],
                    index,
                    pointIndex
                )
            )
            .filter(Boolean)
    }

    /**
     * Builds one footprint line node.
     * @param {object} component PCB component row.
     * @param {object} element Line element.
     * @param {{ x: number, y: number }} start Start point.
     * @param {{ x: number, y: number }} end End point.
     * @param {number} index Fallback index.
     * @param {number} pointIndex Segment index.
     * @returns {Array}
     */
    static #lineNode(component, element, start, end, index, pointIndex) {
        const localStart = CircuitJsonKicadProjectPcbArtworkBuilder.#localPoint(
            component,
            start
        )
        const localEnd = CircuitJsonKicadProjectPcbArtworkBuilder.#localPoint(
            component,
            end
        )

        return [
            'fp_line',
            ['start', localStart.x, localStart.y],
            ['end', localEnd.x, localEnd.y],
            CircuitJsonKicadProjectPcbArtworkBuilder.#strokeNode(element),
            [
                'layer',
                CircuitJsonKicadProjectPcbArtworkBuilder.#layer(
                    component,
                    element
                )
            ],
            [
                'uuid',
                Utils.uuid(
                    'art:line:' +
                        CircuitJsonKicadProjectPcbArtworkBuilder.#elementId(
                            element,
                            index
                        ) +
                        ':' +
                        pointIndex
                )
            ]
        ]
    }

    /**
     * Builds one footprint circle node.
     * @param {object} component PCB component row.
     * @param {object} element Circle element.
     * @param {number} index Fallback index.
     * @returns {Array | null}
     */
    static #circleNode(component, element, index) {
        const center = Utils.point(element.center || element)
        if (!center) return null
        const radius = Utils.number(
            element.radius,
            Utils.number(element.diameter, 1) / 2
        )
        const localCenter =
            CircuitJsonKicadProjectPcbArtworkBuilder.#localPoint(
                component,
                center
            )

        return [
            'fp_circle',
            ['center', localCenter.x, localCenter.y],
            ['end', Utils.round(localCenter.x + radius), localCenter.y],
            CircuitJsonKicadProjectPcbArtworkBuilder.#strokeNode(element),
            ['fill', 'none'],
            [
                'layer',
                CircuitJsonKicadProjectPcbArtworkBuilder.#layer(
                    component,
                    element
                )
            ],
            [
                'uuid',
                Utils.uuid(
                    'art:circle:' +
                        CircuitJsonKicadProjectPcbArtworkBuilder.#elementId(
                            element,
                            index
                        )
                )
            ]
        ]
    }

    /**
     * Builds one footprint rectangle node.
     * @param {object} component PCB component row.
     * @param {object} element Rectangle element.
     * @param {number} index Fallback index.
     * @returns {Array | null}
     */
    static #rectNode(component, element, index) {
        const center = Utils.point(element.center || element)
        if (!center) return null
        const width = Utils.number(element.width, 1)
        const height = Utils.number(element.height, 1)
        const point = CircuitJsonKicadProjectPcbArtworkBuilder.#localPoint(
            component,
            center
        )

        return [
            'fp_rect',
            [
                'start',
                Utils.round(point.x - width / 2),
                Utils.round(point.y - height / 2)
            ],
            [
                'end',
                Utils.round(point.x + width / 2),
                Utils.round(point.y + height / 2)
            ],
            CircuitJsonKicadProjectPcbArtworkBuilder.#strokeNode(element),
            ['fill', 'none'],
            [
                'layer',
                CircuitJsonKicadProjectPcbArtworkBuilder.#layer(
                    component,
                    element
                )
            ],
            [
                'uuid',
                Utils.uuid(
                    'art:rect:' +
                        CircuitJsonKicadProjectPcbArtworkBuilder.#elementId(
                            element,
                            index
                        )
                )
            ]
        ]
    }

    /**
     * Builds one footprint polygon node.
     * @param {object} component PCB component row.
     * @param {object} element Polygon element.
     * @param {number} index Fallback index.
     * @returns {Array | null}
     */
    static #polyNode(component, element, index) {
        const points = CircuitJsonKicadProjectPcbArtworkBuilder.#points(element)
        if (points.length < 3) return null

        return [
            'fp_poly',
            [
                'pts',
                ...points.map((point) => {
                    const localPoint =
                        CircuitJsonKicadProjectPcbArtworkBuilder.#localPoint(
                            component,
                            point
                        )
                    return ['xy', localPoint.x, localPoint.y]
                })
            ],
            CircuitJsonKicadProjectPcbArtworkBuilder.#strokeNode(element),
            ['fill', 'none'],
            [
                'layer',
                CircuitJsonKicadProjectPcbArtworkBuilder.#layer(
                    component,
                    element
                )
            ],
            [
                'uuid',
                Utils.uuid(
                    'art:poly:' +
                        CircuitJsonKicadProjectPcbArtworkBuilder.#elementId(
                            element,
                            index
                        )
                )
            ]
        ]
    }

    /**
     * Builds the shared stroke node for footprint artwork.
     * @param {object} element Artwork element.
     * @returns {Array}
     */
    static #strokeNode(element) {
        const lineWidth =
            element.type?.endsWith('_line') || element.type?.endsWith('_path')
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
            ['type', 'solid']
        ]
    }

    /**
     * Resolves artwork points from common point-list fields.
     * @param {object} element Artwork element.
     * @returns {{ x: number, y: number }[]}
     */
    static #points(element) {
        const candidates =
            (Array.isArray(element.route) && element.route) ||
            (Array.isArray(element.points) && element.points) ||
            (Array.isArray(element.outline) && element.outline) ||
            (Array.isArray(element.vertices) && element.vertices) ||
            []
        return candidates.map((point) => Utils.point(point)).filter(Boolean)
    }

    /**
     * Resolves explicit start/end points for simple line elements.
     * @param {object} element Artwork element.
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

    /**
     * Converts a board point to footprint-local coordinates.
     * @param {object} component PCB component row.
     * @param {{ x: number, y: number }} point Board point.
     * @returns {{ x: number, y: number }}
     */
    static #localPoint(component, point) {
        const center = Utils.point(component.center) || { x: 0, y: 0 }
        const dx = point.x - center.x
        const dy = point.y - center.y
        const radians = (-Utils.number(component.rotation, 0) * Math.PI) / 180
        const cos = Math.cos(radians)
        const sin = Math.sin(radians)
        return {
            x: Utils.round(dx * cos - dy * sin),
            y: Utils.round(-(dx * sin + dy * cos))
        }
    }

    /**
     * Resolves a KiCad footprint layer for an artwork element.
     * @param {object} component PCB component row.
     * @param {object} element Artwork element.
     * @returns {string}
     */
    static #layer(component, element) {
        const side =
            CircuitJsonKicadProjectPcbArtworkBuilder.#side(
                element.layer || element.side || component.layer
            ) === 'bottom'
                ? 'B'
                : 'F'
        const type = Utils.text(element.type).toLowerCase()
        if (type.includes('courtyard')) return side + '.CrtYd'
        if (type.includes('silkscreen')) return side + '.SilkS'
        return side + '.Fab'
    }

    /**
     * Normalizes a top/bottom side value.
     * @param {unknown} value Candidate side.
     * @returns {'top' | 'bottom'}
     */
    static #side(value) {
        const text = Utils.text(value).toLowerCase()
        return text === 'bottom' ||
            text === 'back' ||
            text === 'b' ||
            text === 'b.cu'
            ? 'bottom'
            : 'top'
    }

    /**
     * Resolves a stable artwork element identifier.
     * @param {object} element Artwork element.
     * @param {number} index Fallback index.
     * @returns {string}
     */
    static #elementId(element, index) {
        return (
            Utils.text(
                element.pcb_silkscreen_path_id ||
                    element.pcb_silkscreen_line_id ||
                    element.pcb_silkscreen_text_id ||
                    element.pcb_silkscreen_circle_id ||
                    element.pcb_silkscreen_rect_id ||
                    element.pcb_note_path_id ||
                    element.pcb_note_line_id ||
                    element.pcb_note_text_id ||
                    element.pcb_note_circle_id ||
                    element.pcb_note_rect_id ||
                    element.pcb_fabrication_note_path_id ||
                    element.pcb_fabrication_note_line_id ||
                    element.pcb_fabrication_note_text_id ||
                    element.pcb_fabrication_note_circle_id ||
                    element.pcb_fabrication_note_rect_id ||
                    element.pcb_courtyard_path_id ||
                    element.pcb_courtyard_id ||
                    element.pcb_courtyard_line_id ||
                    element.pcb_courtyard_circle_id ||
                    element.pcb_courtyard_rect_id ||
                    element.pcb_courtyard_outline_id ||
                    element.id ||
                    element.name
            ) || element.type + '_' + (index + 1)
        )
    }
}
