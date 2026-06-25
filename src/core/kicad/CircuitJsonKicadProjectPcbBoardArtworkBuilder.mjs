// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

const BOARD_ARTWORK_TYPES = new Set([
    'pcb_silkscreen_path',
    'pcb_silkscreen_circle',
    'pcb_silkscreen_rect',
    'pcb_note_path',
    'pcb_note_circle',
    'pcb_note_rect',
    'pcb_fabrication_note_path',
    'pcb_fabrication_note_circle',
    'pcb_fabrication_note_rect'
])

/**
 * Builds KiCad board-owned graphic nodes from PCB artwork rows.
 */
export class CircuitJsonKicadProjectPcbBoardArtworkBuilder {
    /**
     * Builds board-level artwork nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static nodes(context) {
        return context.elements.flatMap((element, index) => {
            if (!BOARD_ARTWORK_TYPES.has(element?.type)) return []
            if (
                Utils.text(element.pcb_component_id) ||
                Utils.text(element.source_component_id)
            ) {
                return []
            }
            return CircuitJsonKicadProjectPcbBoardArtworkBuilder.#elementNodes(
                element,
                index
            )
        })
    }

    /**
     * Builds graphic nodes for one board-owned artwork element.
     * @param {object} element Artwork element.
     * @param {number} index Fallback index.
     * @returns {Array[]}
     */
    static #elementNodes(element, index) {
        if (element.type.endsWith('_circle')) {
            return [
                CircuitJsonKicadProjectPcbBoardArtworkBuilder.#circleNode(
                    element,
                    index
                )
            ].filter(Boolean)
        }
        if (element.type.endsWith('_rect')) {
            return [
                CircuitJsonKicadProjectPcbBoardArtworkBuilder.#rectNode(
                    element,
                    index
                )
            ].filter(Boolean)
        }
        return CircuitJsonKicadProjectPcbBoardArtworkBuilder.#lineNodes(
            element,
            index
        )
    }

    /**
     * Builds line nodes for a path-like artwork element.
     * @param {object} element Artwork element.
     * @param {number} index Fallback index.
     * @returns {Array[]}
     */
    static #lineNodes(element, index) {
        const points =
            CircuitJsonKicadProjectPcbBoardArtworkBuilder.#points(element)
        const linePoints = points.length
            ? points
            : CircuitJsonKicadProjectPcbBoardArtworkBuilder.#linePoints(element)
        return linePoints
            .slice(0, -1)
            .map((start, pointIndex) =>
                CircuitJsonKicadProjectPcbBoardArtworkBuilder.#lineNode(
                    element,
                    start,
                    linePoints[pointIndex + 1],
                    index,
                    pointIndex
                )
            )
            .filter(Boolean)
    }

    /**
     * Builds one board line node.
     * @param {object} element Artwork element.
     * @param {{ x: number, y: number }} start Start point.
     * @param {{ x: number, y: number }} end End point.
     * @param {number} index Fallback index.
     * @param {number} pointIndex Segment index.
     * @returns {Array}
     */
    static #lineNode(element, start, end, index, pointIndex) {
        return [
            'gr_line',
            ['start', start.x, -start.y],
            ['end', end.x, -end.y],
            CircuitJsonKicadProjectPcbBoardArtworkBuilder.#strokeNode(element),
            [
                'layer',
                CircuitJsonKicadProjectPcbBoardArtworkBuilder.#layer(element)
            ],
            [
                'uuid',
                Utils.uuid(
                    'board-art:line:' +
                        CircuitJsonKicadProjectPcbBoardArtworkBuilder.#elementId(
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
     * Builds one board circle node.
     * @param {object} element Artwork element.
     * @param {number} index Fallback index.
     * @returns {Array | null}
     */
    static #circleNode(element, index) {
        const center = Utils.point(element.center || element)
        if (!center) return null
        const radius = Utils.number(
            element.radius,
            Utils.number(element.diameter, 1) / 2
        )

        return [
            'gr_circle',
            ['center', center.x, -center.y],
            ['end', Utils.round(center.x + radius), -center.y],
            CircuitJsonKicadProjectPcbBoardArtworkBuilder.#strokeNode(element),
            ['fill', 'none'],
            [
                'layer',
                CircuitJsonKicadProjectPcbBoardArtworkBuilder.#layer(element)
            ],
            [
                'uuid',
                Utils.uuid(
                    'board-art:circle:' +
                        CircuitJsonKicadProjectPcbBoardArtworkBuilder.#elementId(
                            element,
                            index
                        )
                )
            ]
        ]
    }

    /**
     * Builds one board rectangle node.
     * @param {object} element Artwork element.
     * @param {number} index Fallback index.
     * @returns {Array | null}
     */
    static #rectNode(element, index) {
        const center = Utils.point(element.center || element)
        if (!center) return null
        const width = Utils.number(element.width, 1)
        const height = Utils.number(element.height, 1)
        const rotation = Utils.number(
            element.rotation ?? element.ccw_rotation,
            0
        )
        if (rotation) {
            return CircuitJsonKicadProjectPcbBoardArtworkBuilder.#rotatedRectNode(
                element,
                center,
                width,
                height,
                rotation,
                index
            )
        }

        return [
            'gr_rect',
            [
                'start',
                Utils.round(center.x - width / 2),
                Utils.round(-(center.y - height / 2))
            ],
            [
                'end',
                Utils.round(center.x + width / 2),
                Utils.round(-(center.y + height / 2))
            ],
            CircuitJsonKicadProjectPcbBoardArtworkBuilder.#strokeNode(element),
            ['fill', 'none'],
            [
                'layer',
                CircuitJsonKicadProjectPcbBoardArtworkBuilder.#layer(element)
            ],
            [
                'uuid',
                Utils.uuid(
                    'board-art:rect:' +
                        CircuitJsonKicadProjectPcbBoardArtworkBuilder.#elementId(
                            element,
                            index
                        )
                )
            ]
        ]
    }

    /**
     * Builds one rotated rectangle as a board polygon.
     * @param {object} element Artwork element.
     * @param {{ x: number, y: number }} center Rectangle center.
     * @param {number} width Rectangle width.
     * @param {number} height Rectangle height.
     * @param {number} rotation Rectangle rotation in degrees.
     * @param {number} index Fallback index.
     * @returns {Array}
     */
    static #rotatedRectNode(element, center, width, height, rotation, index) {
        return [
            'gr_poly',
            [
                'pts',
                ...CircuitJsonKicadProjectPcbBoardArtworkBuilder.#rectCorners(
                    center,
                    width,
                    height,
                    rotation
                ).map((point) => ['xy', point.x, -point.y])
            ],
            CircuitJsonKicadProjectPcbBoardArtworkBuilder.#strokeNode(element),
            ['fill', 'none'],
            [
                'layer',
                CircuitJsonKicadProjectPcbBoardArtworkBuilder.#layer(element)
            ],
            [
                'uuid',
                Utils.uuid(
                    'board-art:rect:' +
                        CircuitJsonKicadProjectPcbBoardArtworkBuilder.#elementId(
                            element,
                            index
                        )
                )
            ]
        ]
    }

    /**
     * Computes rotated rectangle corners.
     * @param {{ x: number, y: number }} center Rectangle center.
     * @param {number} width Rectangle width.
     * @param {number} height Rectangle height.
     * @param {number} rotation Rotation in degrees.
     * @returns {{ x: number, y: number }[]}
     */
    static #rectCorners(center, width, height, rotation) {
        const radians = (rotation * Math.PI) / 180
        const cos = Math.cos(radians)
        const sin = Math.sin(radians)
        return [
            { x: -width / 2, y: -height / 2 },
            { x: width / 2, y: -height / 2 },
            { x: width / 2, y: height / 2 },
            { x: -width / 2, y: height / 2 }
        ].map((point) => ({
            x: Utils.round(center.x + point.x * cos - point.y * sin),
            y: Utils.round(center.y + point.x * sin + point.y * cos)
        }))
    }

    /**
     * Builds the shared stroke node.
     * @param {object} element Artwork element.
     * @returns {Array}
     */
    static #strokeNode(element) {
        return [
            'stroke',
            [
                'width',
                Utils.number(
                    element.stroke_width ??
                        element.line_width ??
                        element.strokeWidth ??
                        element.thickness ??
                        element.width,
                    0.15
                )
            ],
            ['type', 'solid']
        ]
    }

    /**
     * Resolves board artwork points from common point-list fields.
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
     * Resolves explicit start/end points for simple path rows.
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
     * Resolves a KiCad board graphic layer.
     * @param {object} element Artwork element.
     * @returns {string}
     */
    static #layer(element) {
        const source = Utils.text(element.layer || element.side).toLowerCase()
        const type = Utils.text(element.type).toLowerCase()
        if (
            source.includes('dwgs') ||
            source.includes('drawing') ||
            source.includes('user') ||
            (type.includes('note') && !type.includes('fabrication'))
        ) {
            return 'Dwgs.User'
        }
        const side =
            source.includes('bottom') || source.startsWith('b.') ? 'B' : 'F'
        if (type.includes('silkscreen') || source.includes('silk')) {
            return side + '.SilkS'
        }
        if (type.includes('fabrication') || source.includes('fab')) {
            return side + '.Fab'
        }
        return side + '.Cu'
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
                    element.pcb_silkscreen_circle_id ||
                    element.pcb_silkscreen_rect_id ||
                    element.pcb_note_path_id ||
                    element.pcb_note_circle_id ||
                    element.pcb_note_rect_id ||
                    element.pcb_fabrication_note_path_id ||
                    element.pcb_fabrication_note_circle_id ||
                    element.pcb_fabrication_note_rect_id ||
                    element.id ||
                    element.name
            ) || element.type + '_' + (index + 1)
        )
    }
}
