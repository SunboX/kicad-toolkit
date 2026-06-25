// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

/**
 * Builds KiCad schematic arc nodes from CircuitJSON arc primitives.
 */
export class CircuitJsonKicadProjectSchematicArcBuilder {
    /**
     * Builds one arc node.
     * @param {object} element Source arc element.
     * @param {{ transformPoint?: (point: { x: number, y: number }) => { x: number, y: number }, uuidSeed?: string }} [options] Arc options.
     * @returns {Array | null}
     */
    static node(element, options = {}) {
        const points =
            CircuitJsonKicadProjectSchematicArcBuilder.points(element)
        if (!points) return null
        const transform =
            options.transformPoint ||
            CircuitJsonKicadProjectSchematicArcBuilder.#identityPoint
        const start = transform(points.start)
        const mid = transform(points.mid)
        const end = transform(points.end)

        return [
            'arc',
            ['start', start.x, start.y],
            ['mid', mid.x, mid.y],
            ['end', end.x, end.y],
            CircuitJsonKicadProjectSchematicArcBuilder.strokeNode(element),
            CircuitJsonKicadProjectSchematicArcBuilder.fillNode(element),
            ...(options.uuidSeed
                ? [['uuid', Utils.uuid(options.uuidSeed)]]
                : [])
        ]
    }

    /**
     * Resolves the three KiCad arc control points from a source element.
     * @param {object} element Source arc element.
     * @returns {{ start: { x: number, y: number }, mid: { x: number, y: number }, end: { x: number, y: number } } | null}
     */
    static points(element) {
        const explicit = {
            start: Utils.point(element.start),
            mid: Utils.point(element.mid),
            end: Utils.point(element.end)
        }
        if (explicit.start && explicit.mid && explicit.end) return explicit

        const center = Utils.point(element.center || element)
        const radius = Utils.number(
            element.radius,
            Utils.number(element.diameter, 0) / 2
        )
        if (!center || radius <= 0) return null

        const startAngle = CircuitJsonKicadProjectSchematicArcBuilder.#angle(
            element,
            'start'
        )
        const endAngle = CircuitJsonKicadProjectSchematicArcBuilder.#angle(
            element,
            'end'
        )
        const midAngle = startAngle + (endAngle - startAngle) / 2

        return {
            start: CircuitJsonKicadProjectSchematicArcBuilder.#polarPoint(
                center,
                radius,
                startAngle
            ),
            mid: CircuitJsonKicadProjectSchematicArcBuilder.#polarPoint(
                center,
                radius,
                midAngle
            ),
            end: CircuitJsonKicadProjectSchematicArcBuilder.#polarPoint(
                center,
                radius,
                endAngle
            )
        }
    }

    /**
     * Builds a schematic stroke node.
     * @param {object} element Graphic element.
     * @returns {Array}
     */
    static strokeNode(element) {
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
            ['type', 'default']
        ]
    }

    /**
     * Builds a schematic fill node.
     * @param {object} element Graphic element.
     * @returns {Array}
     */
    static fillNode(element) {
        return ['fill', ['type', element.is_filled ? 'background' : 'none']]
    }

    /**
     * Resolves a start or end angle in degrees.
     * @param {object} element Arc element.
     * @param {'start' | 'end'} key Angle key.
     * @returns {number}
     */
    static #angle(element, key) {
        const pascalKey = key === 'start' ? 'startAngle' : 'endAngle'
        const snakeKey = key === 'start' ? 'start_angle' : 'end_angle'
        return Utils.number(
            element[pascalKey + 'Degrees'] ??
                element[snakeKey + '_degrees'] ??
                element[pascalKey] ??
                element[snakeKey],
            0
        )
    }

    /**
     * Builds one point on a polar circle.
     * @param {{ x: number, y: number }} center Arc center.
     * @param {number} radius Arc radius.
     * @param {number} angleDegrees Arc angle in degrees.
     * @returns {{ x: number, y: number }}
     */
    static #polarPoint(center, radius, angleDegrees) {
        const radians = (angleDegrees * Math.PI) / 180
        return {
            x: Utils.round(center.x + Math.cos(radians) * radius),
            y: Utils.round(center.y + Math.sin(radians) * radius)
        }
    }

    /**
     * Returns a point unchanged.
     * @param {{ x: number, y: number }} point Source point.
     * @returns {{ x: number, y: number }}
     */
    static #identityPoint(point) {
        return point
    }
}
