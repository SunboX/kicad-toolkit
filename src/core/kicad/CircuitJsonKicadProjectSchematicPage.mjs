// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'

const PAPER_SIZES = [
    { name: 'A4', width: 297, height: 210 },
    { name: 'A3', width: 420, height: 297 },
    { name: 'A2', width: 594, height: 420 },
    { name: 'A1', width: 841, height: 594 },
    { name: 'A0', width: 1189, height: 841 }
]

/**
 * Builds schematic page metadata and standalone annotation nodes.
 */
export class CircuitJsonKicadProjectSchematicPage {
    /**
     * Selects a KiCad paper size for schematic content.
     * @param {object} context Export context.
     * @returns {string}
     */
    static paperName(context) {
        const bounds =
            CircuitJsonKicadProjectSchematicPage.contentBounds(context)
        if (!bounds) return 'A4'
        const width = bounds.maxX - bounds.minX
        const height = bounds.maxY - bounds.minY
        const padding = 20
        const requiredWidth = width + padding * 2
        const requiredHeight = height + padding * 2
        const paper = PAPER_SIZES.find(
            (entry) =>
                requiredWidth <= entry.width && requiredHeight <= entry.height
        )
        return (paper || PAPER_SIZES.at(-1)).name
    }

    /**
     * Builds a root sheet instance node.
     * @returns {Array}
     */
    static sheetInstancesNode() {
        return ['sheet_instances', ['path', '/', ['page', '1']]]
    }

    /**
     * Builds embedded-font metadata.
     * @returns {Array}
     */
    static embeddedFontsNode() {
        return ['embedded_fonts', false]
    }

    /**
     * Builds standalone schematic text nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static textNodes(context) {
        return context.elements
            .filter((element) => element?.type === 'schematic_text')
            .filter((element) => !Utils.text(element.schematic_component_id))
            .map((element, index) =>
                CircuitJsonKicadProjectSchematicPage.textNode(element, index)
            )
            .filter(Boolean)
    }

    /**
     * Builds one schematic text node.
     * @param {object} element Schematic text element.
     * @param {number} index Text index.
     * @returns {Array | null}
     */
    static textNode(element, index) {
        const point = Utils.point(element.position || element)
        if (!point) return null
        const size = Utils.number(element.font_size ?? element.size, 1.27)
        return [
            'text',
            Utils.text(element.text),
            ['at', point.x, -point.y, Utils.number(element.rotation, 0)],
            ['effects', ['font', ['size', size, size], ['thickness', 0.15]]],
            [
                'uuid',
                Utils.uuid(
                    'schematic-text:' + (element.schematic_text_id || index)
                )
            ]
        ]
    }

    /**
     * Resolves schematic content bounds.
     * @param {object} context Export context.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
     */
    static contentBounds(context) {
        const points =
            CircuitJsonKicadProjectSchematicPage.contentPoints(context)
        if (!points.length) return null
        return {
            minX: Math.min(...points.map((point) => point.x)),
            minY: Math.min(...points.map((point) => point.y)),
            maxX: Math.max(...points.map((point) => point.x)),
            maxY: Math.max(...points.map((point) => point.y))
        }
    }

    /**
     * Collects schematic content points.
     * @param {object} context Export context.
     * @returns {{ x: number, y: number }[]}
     */
    static contentPoints(context) {
        const points = []
        for (const element of context.elements) {
            points.push(
                ...CircuitJsonKicadProjectSchematicPage.pointsForElement(
                    element
                )
            )
        }
        return points
    }

    /**
     * Collects bounds-relevant points for one schematic element.
     * @param {object} element CircuitJSON element.
     * @returns {{ x: number, y: number }[]}
     */
    static pointsForElement(element) {
        if (element?.type === 'schematic_component') {
            const center = Utils.point(element.center || element)
            if (!center) return []
            const width = Utils.number(element.size?.width ?? element.width, 0)
            const height = Utils.number(
                element.size?.height ?? element.height,
                0
            )
            return [
                { x: center.x - width / 2, y: center.y - height / 2 },
                { x: center.x + width / 2, y: center.y + height / 2 }
            ]
        }
        if (
            element?.type === 'schematic_line' ||
            element?.type === 'schematic_trace'
        ) {
            return CircuitJsonKicadProjectSchematicPage.linePoints(element)
        }
        if (
            element?.type === 'schematic_text' ||
            element?.type === 'schematic_net_label'
        ) {
            const point = Utils.point(
                element.position || element.anchor_position || element
            )
            return point ? [point] : []
        }
        if (
            element?.type === 'schematic_rect' ||
            element?.type === 'schematic_box'
        ) {
            const center = Utils.point(element.center || element)
            if (!center) return []
            const width = Utils.number(element.width, 0)
            const height = Utils.number(element.height, 0)
            return [
                { x: center.x - width / 2, y: center.y - height / 2 },
                { x: center.x + width / 2, y: center.y + height / 2 }
            ]
        }
        return []
    }

    /**
     * Resolves schematic line points.
     * @param {object} element Line element.
     * @returns {{ x: number, y: number }[]}
     */
    static linePoints(element) {
        if (Array.isArray(element.edges)) {
            return element.edges.flatMap((edge) =>
                [Utils.point(edge.from), Utils.point(edge.to)].filter(Boolean)
            )
        }
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
