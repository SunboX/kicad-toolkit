// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadArcGeometry } from '../kicad/KicadArcGeometry.mjs'
import { CircuitJsonModelAdapterElements } from './CircuitJsonModelAdapterElements.mjs'
import { CircuitJsonSchematicDocumentGraphicsBuilder } from './CircuitJsonSchematicDocumentGraphicsBuilder.mjs'
import { CircuitJsonModelAdapterPrimitives } from './CircuitJsonModelAdapterPrimitives.mjs'
import { CircuitJsonSchematicTraceBuilder } from './CircuitJsonSchematicTraceBuilder.mjs'

const Elements = CircuitJsonModelAdapterElements
const Primitives = CircuitJsonModelAdapterPrimitives
const DEFAULT_INK = '#1f2430'
const BEZIER_SEGMENTS = 24
const ELLIPSE_SEGMENTS = 48

/** Projects normalized KiCad schematic graphics into canonical CircuitJSON. */
export class CircuitJsonSchematicGraphicsBuilder {
    /**
     * Appends graphical and document-layout rows.
     * @param {object[]} circuitJson CircuitJSON target.
     * @param {Record<string, any>} schematic Native schematic model.
     * @param {string} idScope Stable document id scope.
     * @param {{ componentIds?: Map<unknown, string>, consumedSegments?: Set<string>, netIds?: Map<string, string>, rendererModel?: Record<string, any> }} [context] Projection context.
     * @returns {{ assets: object[], diagnostics: object[] }} Image result.
     */
    static append(circuitJson, schematic, idScope, context = {}) {
        CircuitJsonSchematicGraphicsBuilder.#appendLines(
            circuitJson,
            schematic,
            idScope,
            context
        )
        CircuitJsonSchematicGraphicsBuilder.#appendTexts(
            circuitJson,
            schematic,
            idScope,
            context.componentIds
        )
        CircuitJsonSchematicGraphicsBuilder.#appendRectangles(
            circuitJson,
            schematic,
            idScope,
            context.componentIds
        )
        CircuitJsonSchematicGraphicsBuilder.#appendEllipses(
            circuitJson,
            schematic,
            idScope,
            context.componentIds
        )
        CircuitJsonSchematicGraphicsBuilder.#appendArcs(
            circuitJson,
            schematic,
            idScope,
            context.componentIds
        )
        CircuitJsonSchematicGraphicsBuilder.#appendPaths(
            circuitJson,
            schematic,
            idScope,
            context.componentIds
        )
        return CircuitJsonSchematicDocumentGraphicsBuilder.append(
            circuitJson,
            schematic,
            idScope,
            { componentIds: context.componentIds }
        )
    }

    /**
     * Appends unconsumed schematic lines.
     * @param {object[]} circuitJson CircuitJSON target.
     * @param {Record<string, any>} schematic Native schematic model.
     * @param {string} idScope Stable id scope.
     * @param {Record<string, any>} context Projection context.
     * @returns {void}
     */
    static #appendLines(circuitJson, schematic, idScope, context) {
        const consumed = context.consumedSegments || new Set()
        const netIds = context.netIds || new Map()
        for (const [lineIndex, line] of Primitives.array(
            schematic.lines
        ).entries()) {
            if (
                consumed.has(CircuitJsonSchematicTraceBuilder.segmentKey(line))
            ) {
                continue
            }
            const lineElement = {
                type: 'schematic_line',
                schematic_line_id:
                    CircuitJsonSchematicGraphicsBuilder.#elementId(
                        idScope,
                        'schematic_line',
                        line,
                        lineIndex
                    ),
                x1: Primitives.number(line.x1, 0),
                y1: Primitives.number(line.y1, 0),
                x2: Primitives.number(line.x2, 0),
                y2: Primitives.number(line.y2, 0),
                ...CircuitJsonSchematicGraphicsBuilder.#stroke(line),
                ...CircuitJsonSchematicGraphicsBuilder.#ownership(
                    line,
                    context.componentIds
                )
            }
            circuitJson.push(lineElement)
            if (!CircuitJsonSchematicGraphicsBuilder.#isElectricalLine(line)) {
                continue
            }
            const sourceTraceId = Primitives.id(idScope, [
                'source_trace',
                line.netName || line.netIndex || lineIndex
            ])
            const sourceNetId = Elements.sourceNetIdForPrimitive(
                circuitJson,
                idScope,
                line,
                netIds
            )
            circuitJson.push(
                {
                    type: 'source_trace',
                    source_trace_id: sourceTraceId,
                    connected_source_port_ids: [],
                    connected_source_net_ids: sourceNetId ? [sourceNetId] : []
                },
                {
                    type: 'schematic_trace',
                    schematic_trace_id: Primitives.id(idScope, [
                        'schematic_trace',
                        lineIndex
                    ]),
                    source_trace_id: sourceTraceId,
                    junctions: [],
                    edges: [
                        {
                            from: { x: lineElement.x1, y: lineElement.y1 },
                            to: { x: lineElement.x2, y: lineElement.y2 }
                        }
                    ]
                }
            )
        }
    }

    /**
     * Appends standalone texts and net labels.
     * @param {object[]} circuitJson CircuitJSON target.
     * @param {Record<string, any>} schematic Native schematic model.
     * @param {string} idScope Stable id scope.
     * @param {Map<unknown, string> | undefined} componentIds Component owners.
     * @returns {void}
     */
    static #appendTexts(circuitJson, schematic, idScope, componentIds) {
        for (const [textIndex, text] of Primitives.array(
            schematic.texts
        ).entries()) {
            const textValue = Primitives.string(
                text.text || text.value || text.name,
                ''
            )
            const position = Primitives.point(text.x, text.y)
            if (Primitives.isNetLabel(text)) {
                const sourceNetId = Primitives.sourceNetId(
                    idScope,
                    textValue || textIndex
                )
                Elements.appendMissingSourceNet(
                    circuitJson,
                    sourceNetId,
                    textValue || String(textIndex)
                )
                circuitJson.push({
                    type: 'schematic_net_label',
                    schematic_net_label_id: Primitives.id(idScope, [
                        'schematic_net_label',
                        textIndex
                    ]),
                    source_net_id: sourceNetId,
                    center: position,
                    anchor_side: 'top',
                    text: textValue
                })
                continue
            }
            circuitJson.push({
                type: 'schematic_text',
                schematic_text_id:
                    CircuitJsonSchematicGraphicsBuilder.#elementId(
                        idScope,
                        'schematic_text',
                        text,
                        textIndex
                    ),
                text: textValue,
                position,
                anchor: CircuitJsonSchematicGraphicsBuilder.#textAnchor(text),
                font_size: Primitives.number(text.fontSize, 1.27),
                rotation: Primitives.number(text.rotation, 0),
                color: CircuitJsonSchematicGraphicsBuilder.#ink(text),
                ...CircuitJsonSchematicGraphicsBuilder.#ownership(
                    text,
                    componentIds
                )
            })
        }
    }

    /**
     * Appends rectangle primitives.
     * @param {object[]} circuitJson CircuitJSON target.
     * @param {Record<string, any>} schematic Native schematic model.
     * @param {string} idScope Stable id scope.
     * @param {Map<unknown, string> | undefined} componentIds Component owners.
     * @returns {void}
     */
    static #appendRectangles(circuitJson, schematic, idScope, componentIds) {
        for (const [index, rectangle] of Primitives.array(
            schematic.rectangles
        ).entries()) {
            const width = Primitives.number(rectangle.width, 0)
            const height = Primitives.number(rectangle.height, 0)
            circuitJson.push({
                type: 'schematic_rect',
                schematic_rect_id:
                    CircuitJsonSchematicGraphicsBuilder.#elementId(
                        idScope,
                        'schematic_rect',
                        rectangle,
                        index
                    ),
                center: Primitives.point(
                    Primitives.number(rectangle.x, 0) + width / 2,
                    Primitives.number(rectangle.y, 0) + height / 2
                ),
                width,
                height,
                rotation: Primitives.number(rectangle.rotation, 0),
                ...CircuitJsonSchematicGraphicsBuilder.#stroke(rectangle),
                ...CircuitJsonSchematicGraphicsBuilder.#fill(rectangle),
                ...CircuitJsonSchematicGraphicsBuilder.#ownership(
                    rectangle,
                    componentIds
                )
            })
        }
    }

    /**
     * Appends circles and sampled unequal ellipses.
     * @param {object[]} circuitJson CircuitJSON target.
     * @param {Record<string, any>} schematic Native schematic model.
     * @param {string} idScope Stable id scope.
     * @param {Map<unknown, string> | undefined} componentIds Component owners.
     * @returns {void}
     */
    static #appendEllipses(circuitJson, schematic, idScope, componentIds) {
        for (const [index, ellipse] of Primitives.array(
            schematic.ellipses
        ).entries()) {
            const radiusX = Math.abs(Primitives.number(ellipse.radiusX, 0))
            const radiusY = Math.abs(Primitives.number(ellipse.radiusY, 0))
            if (Math.abs(radiusX - radiusY) <= 0.000001) {
                circuitJson.push({
                    type: 'schematic_circle',
                    schematic_circle_id:
                        CircuitJsonSchematicGraphicsBuilder.#elementId(
                            idScope,
                            'schematic_circle',
                            ellipse,
                            index
                        ),
                    center: Primitives.point(ellipse.x, ellipse.y),
                    radius: radiusX,
                    ...CircuitJsonSchematicGraphicsBuilder.#stroke(ellipse),
                    ...CircuitJsonSchematicGraphicsBuilder.#fill(ellipse),
                    ...CircuitJsonSchematicGraphicsBuilder.#ownership(
                        ellipse,
                        componentIds
                    )
                })
                continue
            }
            CircuitJsonSchematicGraphicsBuilder.#appendPath(
                circuitJson,
                idScope,
                ellipse,
                index,
                CircuitJsonSchematicGraphicsBuilder.#ellipsePoints(ellipse),
                componentIds,
                'schematic_ellipse'
            )
        }
    }

    /**
     * Appends exact circular arcs or a degenerate path fallback.
     * @param {object[]} circuitJson CircuitJSON target.
     * @param {Record<string, any>} schematic Native schematic model.
     * @param {string} idScope Stable id scope.
     * @param {Map<unknown, string> | undefined} componentIds Component owners.
     * @returns {void}
     */
    static #appendArcs(circuitJson, schematic, idScope, componentIds) {
        for (const [index, primitive] of Primitives.array(
            schematic.arcs
        ).entries()) {
            const start = Primitives.point(
                primitive.start?.x,
                primitive.start?.y
            )
            const mid = Primitives.point(primitive.mid?.x, primitive.mid?.y)
            const end = Primitives.point(primitive.end?.x, primitive.end?.y)
            const arc = KicadArcGeometry.fromThreePoints(start, mid, end)
            if (!arc) {
                CircuitJsonSchematicGraphicsBuilder.#appendPath(
                    circuitJson,
                    idScope,
                    primitive,
                    index,
                    [start, mid, end],
                    componentIds,
                    'schematic_arc_path'
                )
                continue
            }
            circuitJson.push({
                type: 'schematic_arc',
                schematic_arc_id:
                    CircuitJsonSchematicGraphicsBuilder.#elementId(
                        idScope,
                        'schematic_arc',
                        primitive,
                        index
                    ),
                center: Primitives.point(arc.center.x, arc.center.y),
                radius: Primitives.round(arc.radius),
                start_angle_degrees: Primitives.round(arc.startAngle),
                end_angle_degrees: Primitives.round(arc.endAngle),
                direction: arc.sweep ? 'clockwise' : 'counterclockwise',
                ...CircuitJsonSchematicGraphicsBuilder.#stroke(primitive),
                ...CircuitJsonSchematicGraphicsBuilder.#ownership(
                    primitive,
                    componentIds
                )
            })
        }
    }

    /**
     * Appends bezier, polygon, and rule-area paths.
     * @param {object[]} circuitJson CircuitJSON target.
     * @param {Record<string, any>} schematic Native schematic model.
     * @param {string} idScope Stable id scope.
     * @param {Map<unknown, string> | undefined} componentIds Component owners.
     * @returns {void}
     */
    static #appendPaths(circuitJson, schematic, idScope, componentIds) {
        for (const [index, bezier] of Primitives.array(
            schematic.beziers
        ).entries()) {
            CircuitJsonSchematicGraphicsBuilder.#appendPath(
                circuitJson,
                idScope,
                bezier,
                index,
                CircuitJsonSchematicGraphicsBuilder.#bezierPoints(bezier),
                componentIds,
                'schematic_bezier'
            )
        }
        const polygons = [
            ...Primitives.array(schematic.polygons),
            ...Primitives.array(schematic.regions)
        ]
        for (const [index, polygon] of polygons.entries()) {
            CircuitJsonSchematicGraphicsBuilder.#appendPath(
                circuitJson,
                idScope,
                polygon,
                index,
                Primitives.array(polygon.points).map((point) =>
                    Primitives.point(point?.x, point?.y)
                ),
                componentIds,
                'schematic_polygon'
            )
        }
    }

    /**
     * Appends one canonical schematic path.
     * @param {object[]} circuitJson CircuitJSON target.
     * @param {string} idScope Stable id scope.
     * @param {Record<string, any>} primitive Native primitive.
     * @param {number} index Primitive index.
     * @param {object[]} points Path points.
     * @param {Map<unknown, string> | undefined} componentIds Component owners.
     * @param {string} idFamily Stable id family.
     * @returns {void}
     */
    static #appendPath(
        circuitJson,
        idScope,
        primitive,
        index,
        points,
        componentIds,
        idFamily
    ) {
        if (points.length < 2) return
        circuitJson.push({
            type: 'schematic_path',
            schematic_path_id: CircuitJsonSchematicGraphicsBuilder.#elementId(
                idScope,
                idFamily,
                primitive,
                index
            ),
            points,
            stroke_color: CircuitJsonSchematicGraphicsBuilder.#ink(primitive),
            ...CircuitJsonSchematicGraphicsBuilder.#stroke(primitive, false),
            ...CircuitJsonSchematicGraphicsBuilder.#fill(primitive),
            ...CircuitJsonSchematicGraphicsBuilder.#ownership(
                primitive,
                componentIds
            )
        })
    }

    /**
     * Builds a stable element id from source identity.
     * @param {string} idScope Stable id scope.
     * @param {string} family Element family.
     * @param {Record<string, any>} primitive Native primitive.
     * @param {number} index Primitive index.
     * @returns {string} Stable id.
     */
    static #elementId(idScope, family, primitive, index) {
        return Primitives.id(idScope, [
            family,
            primitive.uuid || primitive.id || primitive.ownerIndex || index
        ])
    }

    /**
     * Builds stroke fields supported by canonical schematic graphics.
     * @param {Record<string, any>} primitive Native primitive.
     * @param {boolean} [includeColor] Whether to use the `color` field.
     * @returns {object} Stroke fields.
     */
    static #stroke(primitive, includeColor = true) {
        return {
            stroke_width: Primitives.number(
                primitive.lineWidth ?? primitive.width,
                0.15
            ),
            is_dashed:
                Boolean(primitive.dashed) ||
                !['', 'default', 'solid'].includes(
                    String(primitive.strokeStyle || '').toLowerCase()
                ),
            ...(includeColor
                ? { color: CircuitJsonSchematicGraphicsBuilder.#ink(primitive) }
                : {})
        }
    }

    /**
     * Builds fill fields supported by canonical schematic graphics.
     * @param {Record<string, any>} primitive Native primitive.
     * @returns {object} Fill fields.
     */
    static #fill(primitive) {
        const fill = String(primitive.fill || '').toLowerCase()
        const isFilled = Boolean(primitive.isSolid) || (fill && fill !== 'none')
        const fillColor =
            primitive.fillColor ||
            (fill === 'outline'
                ? CircuitJsonSchematicGraphicsBuilder.#ink(primitive)
                : '')
        return {
            is_filled: isFilled,
            ...(fillColor ? { fill_color: String(fillColor) } : {})
        }
    }

    /**
     * Resolves a canonical ink color.
     * @param {Record<string, any>} primitive Native primitive.
     * @returns {string} CSS color.
     */
    static #ink(primitive) {
        return String(primitive.strokeColor || primitive.color || DEFAULT_INK)
    }

    /**
     * Resolves optional component ownership.
     * @param {Record<string, any>} primitive Native primitive.
     * @param {Map<unknown, string> | undefined} componentIds Component owners.
     * @returns {object} Ownership fields.
     */
    static #ownership(primitive, componentIds) {
        if (!(componentIds instanceof Map)) return {}
        for (const key of [
            primitive.ownerIndex,
            primitive.componentIndex,
            primitive.ownerId
        ]) {
            const id = componentIds.get(String(key ?? '').trim())
            if (id) return { schematic_component_id: id }
        }
        return {}
    }

    /**
     * Checks whether a native line carries electrical semantics.
     * @param {Record<string, any>} line Native line.
     * @returns {boolean} Electrical status.
     */
    static #isElectricalLine(line) {
        return String(line.sourceType || '').toLowerCase() === 'wire'
    }

    /**
     * Samples a cubic bezier deterministically.
     * @param {Record<string, any>} bezier Native bezier.
     * @returns {object[]} Sampled points.
     */
    static #bezierPoints(bezier) {
        const points = Primitives.array(bezier.points).map((point) =>
            Primitives.point(point?.x, point?.y)
        )
        if (points.length !== 4) return points
        return Array.from({ length: BEZIER_SEGMENTS + 1 }, (_, index) => {
            const t = index / BEZIER_SEGMENTS
            const inverse = 1 - t
            return Primitives.point(
                inverse ** 3 * points[0].x +
                    3 * inverse ** 2 * t * points[1].x +
                    3 * inverse * t ** 2 * points[2].x +
                    t ** 3 * points[3].x,
                inverse ** 3 * points[0].y +
                    3 * inverse ** 2 * t * points[1].y +
                    3 * inverse * t ** 2 * points[2].y +
                    t ** 3 * points[3].y
            )
        })
    }

    /**
     * Samples an unequal ellipse as one closed polyline.
     * @param {Record<string, any>} ellipse Native ellipse.
     * @returns {object[]} Sampled points.
     */
    static #ellipsePoints(ellipse) {
        const center = Primitives.point(ellipse.x, ellipse.y)
        const radiusX = Math.abs(Primitives.number(ellipse.radiusX, 0))
        const radiusY = Math.abs(Primitives.number(ellipse.radiusY, 0))
        return Array.from({ length: ELLIPSE_SEGMENTS }, (_, index) => {
            const angle = (index / ELLIPSE_SEGMENTS) * Math.PI * 2
            return Primitives.point(
                center.x + Math.cos(angle) * radiusX,
                center.y + Math.sin(angle) * radiusY
            )
        })
    }

    /**
     * Resolves a combined text anchor.
     * @param {Record<string, any>} text Native text.
     * @returns {string} Canonical anchor.
     */
    static #textAnchor(text) {
        if (
            !text.font?.hAlign &&
            !text.font?.vAlign &&
            !text.hAlign &&
            !text.vAlign
        ) {
            return 'center'
        }
        const horizontal =
            CircuitJsonSchematicGraphicsBuilder.#horizontalAlign(text)
        const vertical =
            CircuitJsonSchematicGraphicsBuilder.#verticalAlign(text)
        const verticalPart = vertical === 'middle' ? 'center' : vertical
        const horizontalPart = horizontal === 'center' ? 'center' : horizontal
        if (verticalPart === 'center' && horizontalPart === 'center') {
            return 'center'
        }
        return `${verticalPart}_${horizontalPart}`
    }

    /**
     * Resolves horizontal alignment.
     * @param {Record<string, any>} value Native text-like row.
     * @returns {'left' | 'center' | 'right'} Alignment.
     */
    static #horizontalAlign(value) {
        const alignment = String(
            value.font?.hAlign || value.hAlign || 'left'
        ).toLowerCase()
        return ['left', 'center', 'right'].includes(alignment)
            ? alignment
            : 'left'
    }

    /**
     * Resolves vertical alignment.
     * @param {Record<string, any>} value Native text-like row.
     * @returns {'top' | 'middle' | 'bottom'} Alignment.
     */
    static #verticalAlign(value) {
        const alignment = String(
            value.font?.vAlign || value.vAlign || 'bottom'
        ).toLowerCase()
        if (alignment === 'center') return 'middle'
        return ['top', 'middle', 'bottom'].includes(alignment)
            ? alignment
            : 'bottom'
    }
}

Object.freeze(CircuitJsonSchematicGraphicsBuilder.prototype)
Object.freeze(CircuitJsonSchematicGraphicsBuilder)
