// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonKicadProjectUtils as Utils } from './CircuitJsonKicadProjectUtils.mjs'
import { CircuitJsonKicadProjectSchematicTransform as SchematicTransform } from './CircuitJsonKicadProjectSchematicTransform.mjs'

const PAPER_SIZES = [
    { name: 'A4', width: 297, height: 210 },
    { name: 'A3', width: 420, height: 297 },
    { name: 'A2', width: 594, height: 420 },
    { name: 'A1', width: 841, height: 594 },
    { name: 'A0', width: 1189, height: 841 }
]

const PAGE_GRAPHIC_ROLES = new Set([
    'annotation',
    'decoration',
    'divider',
    'graphic',
    'page_graphic',
    'section'
])

const SECTION_TEXT_PADDING_X = 0.22
const SECTION_TEXT_PADDING_Y = 0.18

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
        const scale = SchematicTransform.scaleFromContext(context)
        const scaledBounds = SchematicTransform.scaledBounds(bounds, scale)
        const width = scaledBounds.maxX - scaledBounds.minX
        const height = scaledBounds.maxY - scaledBounds.minY
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
            .filter((element) => !Utils.text(element.schematic_symbol_id))
            .map((element, index) =>
                CircuitJsonKicadProjectSchematicPage.textNode(
                    context,
                    element,
                    index
                )
            )
            .filter(Boolean)
    }

    /**
     * Builds one schematic text node.
     * @param {object} context Export context.
     * @param {object} element Schematic text element.
     * @param {number} index Text index.
     * @returns {Array | null}
     */
    static textNode(context, element, index) {
        const transform = SchematicTransform.forContext(context)
        const point = Utils.point(element.position || element)
        if (!point) return null
        const output = transform.pagePoint(point)
        const size = Utils.number(element.font_size ?? element.size, 1.27)
        return [
            'text',
            Utils.text(element.text),
            ['at', output.x, output.y, Utils.number(element.rotation, 0)],
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
     * Builds page graphic nodes from annotations and sections.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static graphicNodes(context) {
        return [
            ...CircuitJsonKicadProjectSchematicPage.lineGraphicNodes(context),
            ...CircuitJsonKicadProjectSchematicPage.sectionNodes(context)
        ]
    }

    /**
     * Builds page-owned line or path nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static lineGraphicNodes(context) {
        return context.elements
            .filter((element) =>
                CircuitJsonKicadProjectSchematicPage.isPageGraphicLine(element)
            )
            .map((element, index) =>
                CircuitJsonKicadProjectSchematicPage.lineGraphicNode(
                    context,
                    element,
                    index
                )
            )
            .filter(Boolean)
    }

    /**
     * Returns true when a schematic line/path is a page graphic.
     * @param {object} element Candidate element.
     * @returns {boolean}
     */
    static isPageGraphicLine(element) {
        if (!['schematic_line', 'schematic_path'].includes(element?.type)) {
            return false
        }
        if (Utils.text(element.schematic_component_id)) return false
        if (Utils.text(element.schematic_symbol_id)) return false
        return CircuitJsonKicadProjectSchematicPage.hasPageGraphicIntent(
            element
        )
    }

    /**
     * Returns true when metadata marks an element as non-electrical page art.
     * @param {object} element Candidate element.
     * @returns {boolean}
     */
    static hasPageGraphicIntent(element) {
        if (
            element.is_page_graphic === true ||
            element.isPageGraphic === true ||
            element.is_graphic === true ||
            element.isGraphic === true ||
            element.is_decoration === true ||
            element.isDecoration === true ||
            element.is_electrical === false ||
            element.isElectrical === false
        ) {
            return true
        }
        if (
            Utils.text(element.schematic_section_id) ||
            Utils.text(element.section_id) ||
            Utils.text(element.sectionId)
        ) {
            return true
        }
        return PAGE_GRAPHIC_ROLES.has(
            Utils.text(
                element.role ||
                    element.purpose ||
                    element.kind ||
                    element.graphic_kind ||
                    element.graphicKind
            ).toLowerCase()
        )
    }

    /**
     * Builds one page-owned schematic line or path node.
     * @param {object} context Export context.
     * @param {object} element Line/path element.
     * @param {number} index Graphic index.
     * @returns {Array | null}
     */
    static lineGraphicNode(context, element, index) {
        const transform = SchematicTransform.forContext(context)
        const points =
            CircuitJsonKicadProjectSchematicPage.graphicLinePoints(element)
        if (points.length < 2) return null
        return [
            'polyline',
            [
                'pts',
                ...points.map((point) => {
                    const output = transform.pagePoint(point)
                    return ['xy', output.x, output.y]
                })
            ],
            [
                'stroke',
                [
                    'width',
                    Utils.number(element.stroke_width ?? element.width, 0)
                ],
                ['type', 'default']
            ],
            ['fill', ['type', 'none']],
            [
                'uuid',
                Utils.uuid(
                    'page-graphic:' +
                        (element.schematic_line_id ||
                            element.schematic_path_id ||
                            index)
                )
            ]
        ]
    }

    /**
     * Resolves points for a page graphic line or path.
     * @param {object} element Line/path element.
     * @returns {{ x: number, y: number }[]}
     */
    static graphicLinePoints(element) {
        if (Array.isArray(element.points)) {
            return element.points
                .map((point) => Utils.point(point))
                .filter(Boolean)
        }
        if (Array.isArray(element.route)) {
            return element.route
                .map((point) => Utils.point(point))
                .filter(Boolean)
        }
        return CircuitJsonKicadProjectSchematicPage.linePoints(element)
    }

    /**
     * Builds section outline and label nodes.
     * @param {object} context Export context.
     * @returns {Array[]}
     */
    static sectionNodes(context) {
        return context.elements
            .filter((element) => element?.type === 'schematic_section')
            .flatMap((element, index) =>
                CircuitJsonKicadProjectSchematicPage.sectionNodePair(
                    context,
                    element,
                    index
                )
            )
            .filter(Boolean)
    }

    /**
     * Builds one section's outline and heading.
     * @param {object} context Export context.
     * @param {object} element Section element.
     * @param {number} index Section index.
     * @returns {Array[]}
     */
    static sectionNodePair(context, element, index) {
        const bounds =
            CircuitJsonKicadProjectSchematicPage.sectionBounds(element)
        if (!bounds) return []
        return [
            CircuitJsonKicadProjectSchematicPage.sectionRectangleNode(
                context,
                element,
                bounds,
                index
            ),
            CircuitJsonKicadProjectSchematicPage.sectionTextNode(
                context,
                element,
                bounds,
                index
            )
        ].filter(Boolean)
    }

    /**
     * Builds one section rectangle node.
     * @param {object} context Export context.
     * @param {object} element Section element.
     * @param {object} bounds Section bounds.
     * @param {number} index Section index.
     * @returns {Array}
     */
    static sectionRectangleNode(context, element, bounds, index) {
        const outputBounds =
            SchematicTransform.forContext(context).bounds(bounds)
        return [
            'rectangle',
            ['start', outputBounds.minX, -outputBounds.maxY],
            ['end', outputBounds.maxX, -outputBounds.minY],
            [
                'stroke',
                ['width', Utils.number(element.stroke_width, 0)],
                ['type', 'default']
            ],
            ['fill', ['type', 'none']],
            [
                'uuid',
                Utils.uuid('section:' + (element.schematic_section_id || index))
            ]
        ]
    }

    /**
     * Builds one section heading node.
     * @param {object} context Export context.
     * @param {object} element Section element.
     * @param {object} bounds Section bounds.
     * @param {number} index Section index.
     * @returns {Array | null}
     */
    static sectionTextNode(context, element, bounds, index) {
        const label = Utils.text(
            element.display_name ||
                element.displayName ||
                element.title ||
                element.name ||
                element.text
        )
        if (!label) return null
        const transform = SchematicTransform.forContext(context)
        const output = transform.pagePoint({
            x: bounds.minX + SECTION_TEXT_PADDING_X,
            y: bounds.maxY - SECTION_TEXT_PADDING_Y
        })
        const size = Utils.number(element.font_size ?? element.size, 1.27)
        return [
            'text',
            label,
            ['at', output.x, output.y, Utils.number(element.rotation, 0)],
            ['effects', ['font', ['size', size, size], ['thickness', 0.15]]],
            [
                'uuid',
                Utils.uuid(
                    'section-text:' + (element.schematic_section_id || index)
                )
            ]
        ]
    }

    /**
     * Resolves schematic section bounds.
     * @param {object} element Section element.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
     */
    static sectionBounds(element) {
        const explicit =
            CircuitJsonKicadProjectSchematicPage.explicitBounds(element)
        if (explicit) return explicit
        const center = Utils.point(
            element.center || element.position || element
        )
        if (!center) return null
        const width = Utils.number(element.width, 0)
        const height = Utils.number(element.height, 0)
        if (width <= 0 || height <= 0) return null
        return {
            minX: Utils.round(center.x - width / 2),
            minY: Utils.round(center.y - height / 2),
            maxX: Utils.round(center.x + width / 2),
            maxY: Utils.round(center.y + height / 2)
        }
    }

    /**
     * Resolves explicit min/max bounds from an element.
     * @param {object} element Candidate element.
     * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
     */
    static explicitBounds(element) {
        const minX = Utils.number(
            element.x1 ?? element.min_x ?? element.minX,
            NaN
        )
        const minY = Utils.number(
            element.y1 ?? element.min_y ?? element.minY,
            NaN
        )
        const maxX = Utils.number(
            element.x2 ?? element.max_x ?? element.maxX,
            NaN
        )
        const maxY = Utils.number(
            element.y2 ?? element.max_y ?? element.maxY,
            NaN
        )
        if (
            !Number.isFinite(minX) ||
            !Number.isFinite(minY) ||
            !Number.isFinite(maxX) ||
            !Number.isFinite(maxY)
        ) {
            return null
        }
        return {
            minX: Math.min(minX, maxX),
            minY: Math.min(minY, maxY),
            maxX: Math.max(minX, maxX),
            maxY: Math.max(minY, maxY)
        }
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
        if (element?.type === 'schematic_section') {
            const bounds =
                CircuitJsonKicadProjectSchematicPage.sectionBounds(element)
            return bounds
                ? [
                      { x: bounds.minX, y: bounds.minY },
                      { x: bounds.maxX, y: bounds.maxY }
                  ]
                : []
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
