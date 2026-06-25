// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

const EDGE_CUTS_STROKE = ['stroke', ['width', 0.1], ['type', 'solid']]

/**
 * Builds board-edge and milling geometry graphics for PCB export.
 */
export class CircuitJsonKicadProjectPcbBoardGeometryBuilder {
    /**
     * Builds board outline and cutout graphics.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static nodes(context) {
        return [
            ...CircuitJsonKicadProjectPcbBoardGeometryBuilder.outlineGraphics(
                context
            ),
            ...CircuitJsonKicadProjectPcbBoardGeometryBuilder.cutoutGraphics(
                context
            )
        ]
    }

    /**
     * Builds board outline graphics.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static outlineGraphics(context) {
        const outline =
            CircuitJsonKicadProjectPcbBoardGeometryBuilder.#normalizedPoints(
                CircuitJsonKicadProjectPcbBoardGeometryBuilder.#points(
                    context.board
                )
            )
        if (outline.length >= 2) {
            return CircuitJsonKicadProjectPcbBoardGeometryBuilder.#closedLines(
                outline,
                'board:outline'
            )
        }

        const bounds = Utils.boardBounds(context.board)
        if (!bounds) return []
        return [
            [
                'gr_rect',
                ['start', bounds.minX, -bounds.minY],
                ['end', bounds.maxX, -bounds.maxY],
                EDGE_CUTS_STROKE,
                ['fill', 'none'],
                ['layer', 'Edge.Cuts'],
                ['uuid', Utils.uuid('board:outline')]
            ]
        ]
    }

    /**
     * Builds board cutout graphics.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static cutoutGraphics(context) {
        return context.elements
            .filter((element) => element?.type === 'pcb_cutout')
            .flatMap((element, index) =>
                CircuitJsonKicadProjectPcbBoardGeometryBuilder.#cutoutGraphic(
                    element,
                    index
                )
            )
            .filter(Boolean)
    }

    /**
     * Builds one cutout graphic or graphic set.
     * @param {object} element Cutout element.
     * @param {number} index Cutout index.
     * @returns {Array[]}
     */
    static #cutoutGraphic(element, index) {
        const shape = Utils.text(element.shape).toLowerCase()
        const seed = 'cutout:' + (element.pcb_cutout_id || index)

        if (shape === 'circle') {
            return CircuitJsonKicadProjectPcbBoardGeometryBuilder.#circleGraphic(
                element,
                seed
            )
        }
        if (shape === 'rect' || shape === 'rectangle') {
            return CircuitJsonKicadProjectPcbBoardGeometryBuilder.#polygonGraphic(
                CircuitJsonKicadProjectPcbBoardGeometryBuilder.#rectPoints(
                    element
                ),
                seed
            )
        }
        if (shape === 'path') {
            return CircuitJsonKicadProjectPcbBoardGeometryBuilder.#openLines(
                CircuitJsonKicadProjectPcbBoardGeometryBuilder.#routePoints(
                    element
                ),
                seed
            )
        }

        return CircuitJsonKicadProjectPcbBoardGeometryBuilder.#polygonGraphic(
            CircuitJsonKicadProjectPcbBoardGeometryBuilder.#points(element),
            seed
        )
    }

    /**
     * Builds a circular cutout graphic.
     * @param {object} element Cutout element.
     * @param {string} seed UUID seed.
     * @returns {Array[]}
     */
    static #circleGraphic(element, seed) {
        const center = Utils.point(element.center || element)
        if (!center) return []
        const radius = Utils.number(
            element.radius,
            Utils.number(element.diameter, 0) / 2
        )
        if (radius <= 0) return []
        return [
            [
                'gr_circle',
                ['center', center.x, -center.y],
                ['end', Utils.round(center.x + radius), -center.y],
                EDGE_CUTS_STROKE,
                ['fill', 'none'],
                ['layer', 'Edge.Cuts'],
                ['uuid', Utils.uuid(seed)]
            ]
        ]
    }

    /**
     * Builds a polygon cutout graphic.
     * @param {{ x: number, y: number }[]} points Source points.
     * @param {string} seed UUID seed.
     * @returns {Array[]}
     */
    static #polygonGraphic(points, seed) {
        const normalized =
            CircuitJsonKicadProjectPcbBoardGeometryBuilder.#normalizedPoints(
                points
            )
        if (normalized.length < 3) return []
        return [
            [
                'gr_poly',
                [
                    'pts',
                    ...normalized.map((point) => ['xy', point.x, -point.y])
                ],
                EDGE_CUTS_STROKE,
                ['fill', 'none'],
                ['layer', 'Edge.Cuts'],
                ['uuid', Utils.uuid(seed)]
            ]
        ]
    }

    /**
     * Builds line graphics for an open route.
     * @param {{ x: number, y: number }[]} points Source points.
     * @param {string} seed UUID seed.
     * @returns {Array[]}
     */
    static #openLines(points, seed) {
        const normalized =
            CircuitJsonKicadProjectPcbBoardGeometryBuilder.#normalizedPoints(
                points
            )
        return CircuitJsonKicadProjectPcbBoardGeometryBuilder.#lineGraphics(
            normalized,
            false,
            seed
        )
    }

    /**
     * Builds line graphics for a closed outline.
     * @param {{ x: number, y: number }[]} points Source points.
     * @param {string} seed UUID seed.
     * @returns {Array[]}
     */
    static #closedLines(points, seed) {
        return CircuitJsonKicadProjectPcbBoardGeometryBuilder.#lineGraphics(
            points,
            true,
            seed
        )
    }

    /**
     * Builds line graphics for a point route.
     * @param {{ x: number, y: number }[]} points Source points.
     * @param {boolean} closed Whether to connect the last point to the first.
     * @param {string} seed UUID seed.
     * @returns {Array[]}
     */
    static #lineGraphics(points, closed, seed) {
        const graphics = []
        const limit = closed ? points.length : points.length - 1

        for (let index = 0; index < limit; index += 1) {
            const start = points[index]
            const end = points[(index + 1) % points.length]
            if (!start || !end) continue
            if (
                CircuitJsonKicadProjectPcbBoardGeometryBuilder.#samePoint(
                    start,
                    end
                )
            ) {
                continue
            }
            graphics.push([
                'gr_line',
                ['start', start.x, -start.y],
                ['end', end.x, -end.y],
                EDGE_CUTS_STROKE,
                ['layer', 'Edge.Cuts'],
                ['uuid', Utils.uuid(seed + ':' + index)]
            ])
        }

        return graphics
    }

    /**
     * Builds rotated rectangle points.
     * @param {object} element Rectangle-like cutout.
     * @returns {{ x: number, y: number }[]}
     */
    static #rectPoints(element) {
        const center = Utils.point(element.center || element)
        if (!center) return []
        const width = Utils.number(element.width, 0)
        const height = Utils.number(element.height, 0)
        if (width <= 0 || height <= 0) return []
        const radians =
            (Utils.number(
                element.rotation ?? element.ccw_rotation ?? element.angle,
                0
            ) *
                Math.PI) /
            180
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
     * Resolves point-list geometry from common fields.
     * @param {object} element Source element.
     * @returns {{ x: number, y: number }[]}
     */
    static #points(element) {
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
     * Resolves route point geometry.
     * @param {object} element Source element.
     * @returns {{ x: number, y: number }[]}
     */
    static #routePoints(element) {
        return (Array.isArray(element?.route) ? element.route : [])
            .map((point) => Utils.point(point))
            .filter(Boolean)
    }

    /**
     * Removes adjacent duplicate points and a duplicated closing point.
     * @param {{ x: number, y: number }[]} points Source points.
     * @returns {{ x: number, y: number }[]}
     */
    static #normalizedPoints(points) {
        const normalized = []
        for (const point of points) {
            const previous = normalized.at(-1)
            if (
                previous &&
                CircuitJsonKicadProjectPcbBoardGeometryBuilder.#samePoint(
                    previous,
                    point
                )
            ) {
                continue
            }
            normalized.push(point)
        }
        while (
            normalized.length > 1 &&
            CircuitJsonKicadProjectPcbBoardGeometryBuilder.#samePoint(
                normalized[0],
                normalized.at(-1)
            )
        ) {
            normalized.pop()
        }
        return normalized
    }

    /**
     * Returns true when two points have identical rounded coordinates.
     * @param {{ x: number, y: number }} left Left point.
     * @param {{ x: number, y: number }} right Right point.
     * @returns {boolean}
     */
    static #samePoint(left, right) {
        return left?.x === right?.x && left?.y === right?.y
    }
}
