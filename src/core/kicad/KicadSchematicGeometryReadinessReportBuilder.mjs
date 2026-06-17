// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadArcGeometry } from './KicadArcGeometry.mjs'

const schemaId = 'kicad-toolkit.schematic.geometry-readiness.a1'
const validFillTypes = new Set(['', 'none', 'background', 'outline', 'solid'])
const supportedPinStyles = new Set([
    '',
    'line',
    'inverted',
    'clock',
    'inverted_clock',
    'input_low',
    'clock_low',
    'output_low',
    'edge_clock_high',
    'non_logic'
])
const knownRootNodes = new Set([
    'version',
    'generator',
    'generator_version',
    'uuid',
    'paper',
    'title_block',
    'lib_symbols',
    'symbol',
    'wire',
    'bus',
    'label',
    'global_label',
    'hierarchical_label',
    'junction',
    'no_connect',
    'sheet',
    'bus_entry',
    'bus_alias',
    'image',
    'directive_label',
    'text',
    'text_box',
    'table',
    'polyline',
    'arc',
    'circle',
    'rectangle',
    'bezier',
    'rule_area',
    'sheet_instances',
    'symbol_instances',
    'embedded_fonts',
    'embedded_files'
])

/**
 * Builds rendering-sensitive schematic geometry readiness reports.
 */
export class KicadSchematicGeometryReadinessReportBuilder {
    /**
     * Builds a deterministic schematic geometry readiness report.
     * @param {{ schematic?: object } | object} input Schematic model or wrapper.
     * @returns {object}
     */
    static build(input = {}) {
        const schematic = input?.schematic || input || {}
        const findings = keyedFindings([
            ...bezierFindings(schematic),
            ...arcFindings(schematic),
            ...roundedRectangleFindings(schematic),
            ...textFrameFindings(schematic),
            ...unusualFillFindings(schematic),
            ...unusualStrokeFindings(schematic),
            ...unsupportedPinStyleFindings(schematic),
            ...pinOutsideBodyFindings(schematic),
            ...fieldOutsideBodyFindings(schematic),
            ...unknownRootNodeFindings(schematic)
        ])

        return {
            schema: schemaId,
            summary: summary(schematic, findings),
            findings,
            indexes: {
                findingsBySeverity: keysBy(findings, 'severity'),
                findingsByConstruct: keysBy(findings, 'construct')
            }
        }
    }
}

/**
 * Builds findings for Bezier graphics.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function bezierFindings(schematic) {
    return (schematic.beziers || []).map((bezier) => ({
        severity: 'info',
        code: 'kicad.schematic.geometry.bezier',
        construct: 'bezier',
        sourceKey: sourceKey(bezier),
        message:
            'KiCad schematic Bezier should be rendered from preserved control points.'
    }))
}

/**
 * Builds findings for schematic arcs.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function arcFindings(schematic) {
    const findings = []
    for (const arc of schematic.arcs || []) {
        const metrics = KicadArcGeometry.fromThreePoints(
            point(arc.start),
            point(arc.mid),
            point(arc.end)
        )
        if (!metrics) {
            findings.push({
                severity: 'warning',
                code: 'kicad.schematic.geometry.degenerate-arc',
                construct: 'arc',
                sourceKey: sourceKey(arc),
                message:
                    'KiCad schematic arc has collinear or missing control points.'
            })
            continue
        }
        if (Math.abs(metrics.sweepAngle) <= 180) continue
        findings.push({
            severity: 'warning',
            code: 'kicad.schematic.geometry.long-arc',
            construct: 'arc',
            sourceKey: sourceKey(arc),
            message:
                'KiCad schematic arc sweeps more than 180 degrees and needs large-arc handling.'
        })
    }
    return findings
}

/**
 * Builds findings for rounded schematic rectangles.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function roundedRectangleFindings(schematic) {
    return (schematic.rectangles || [])
        .filter((rectangle) => Number(rectangle?.radius || 0) > 0)
        .map((rectangle) => ({
            severity: 'info',
            code: 'kicad.schematic.geometry.rounded-rectangle',
            construct: 'rectangle',
            sourceKey: sourceKey(rectangle),
            message:
                'KiCad schematic rectangle has a corner radius that renderer consumers should preserve.'
        }))
}

/**
 * Builds findings for multiline text frames and table cells.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function textFrameFindings(schematic) {
    return [
        ...(schematic.textBoxes || [])
            .filter((textBox) => hasMultipleLines(textBox?.text))
            .map((textBox) => ({
                severity: 'info',
                code: 'kicad.schematic.geometry.multiline-text-frame',
                construct: 'text-frame',
                sourceKey: sourceKey(textBox),
                message:
                    'KiCad schematic text box contains multiline text with fixed frame geometry.'
            })),
        ...(schematic.tables || []).flatMap((table) =>
            (table.cells || [])
                .filter((cell) => hasMultipleLines(cell?.text))
                .map((cell) => ({
                    severity: 'info',
                    code: 'kicad.schematic.geometry.multiline-table-cell',
                    construct: 'text-frame',
                    sourceKey: sourceKey(cell) || sourceKey(table),
                    message:
                        'KiCad schematic table cell contains multiline text with fixed frame geometry.'
                }))
        )
    ]
}

/**
 * Builds findings for unusual fill tokens.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function unusualFillFindings(schematic) {
    return fillPrimitives(schematic)
        .filter((primitive) => {
            return !validFillTypes.has(String(primitive?.fill || ''))
        })
        .map((primitive) => ({
            severity: 'warning',
            code: 'kicad.schematic.geometry.unusual-fill',
            construct: constructFor(primitive),
            sourceKey: sourceKey(primitive),
            message:
                'KiCad schematic primitive uses a fill token outside the common renderer set.'
        }))
}

/**
 * Builds findings for unusual stroke widths.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function unusualStrokeFindings(schematic) {
    return strokePrimitives(schematic)
        .filter((primitive) => {
            const width = numericStrokeWidth(primitive)
            return width !== null && width < 0
        })
        .map((primitive) => ({
            severity: 'warning',
            code: 'kicad.schematic.geometry.unusual-stroke',
            construct: constructFor(primitive),
            sourceKey: sourceKey(primitive),
            message:
                'KiCad schematic primitive uses a negative stroke width that suppresses drawing.'
        }))
}

/**
 * Builds findings for unknown pin styles.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function unsupportedPinStyleFindings(schematic) {
    return (schematic.pins || [])
        .filter((pin) => !supportedPinStyles.has(pinStyle(pin)))
        .map((pin) => ({
            severity: 'warning',
            code: 'kicad.schematic.geometry.unsupported-pin-style',
            construct: 'pin',
            sourceKey: sourceKey(pin),
            message:
                'KiCad schematic pin uses a graphic style without a renderer marker.'
        }))
}

/**
 * Builds findings for root nodes outside the typed schematic read model.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function unknownRootNodeFindings(schematic) {
    return children(schematic.kicadAst)
        .map((node, index) => ({ node, index, name: String(node[0] || '') }))
        .filter((entry) => !knownRootNodes.has(entry.name))
        .map((entry) => ({
            severity: 'warning',
            code: 'kicad.schematic.geometry.unknown-root-node',
            construct: 'unknown-graphic',
            sourceKey: uuidOfNode(entry.node) || entry.name + '-' + entry.index,
            message:
                'KiCad schematic root node is not represented by a typed graphics family.'
        }))
}

/**
 * Builds summary counts.
 * @param {object} schematic Schematic model.
 * @param {object[]} findings Finding rows.
 * @returns {object}
 */
function summary(schematic, findings) {
    return {
        findingCount: findings.length,
        warningCount: findings.filter((row) => row.severity === 'warning')
            .length,
        infoCount: findings.filter((row) => row.severity === 'info').length,
        bezierCount: (schematic.beziers || []).length,
        longArcCount: codeCount(findings, 'kicad.schematic.geometry.long-arc'),
        degenerateArcCount: codeCount(
            findings,
            'kicad.schematic.geometry.degenerate-arc'
        ),
        roundedRectangleCount: (schematic.rectangles || []).filter(
            (rectangle) => Number(rectangle?.radius || 0) > 0
        ).length,
        textFrameCount:
            (schematic.textBoxes || []).length +
            (schematic.tables || []).length,
        multilineTextFrameCount:
            codeCount(
                findings,
                'kicad.schematic.geometry.multiline-text-frame'
            ) +
            codeCount(
                findings,
                'kicad.schematic.geometry.multiline-table-cell'
            ),
        unusualFillCount: codeCount(
            findings,
            'kicad.schematic.geometry.unusual-fill'
        ),
        unusualStrokeCount: codeCount(
            findings,
            'kicad.schematic.geometry.unusual-stroke'
        ),
        unsupportedPinStyleCount: codeCount(
            findings,
            'kicad.schematic.geometry.unsupported-pin-style'
        ),
        pinOutsideBodyCount: codeCount(
            findings,
            'kicad.schematic.geometry.pin-outside-symbol-body'
        ),
        fieldOutsideBodyCount: codeCount(
            findings,
            'kicad.schematic.geometry.field-outside-symbol-body'
        ),
        unknownGraphicCount: codeCount(
            findings,
            'kicad.schematic.geometry.unknown-root-node'
        )
    }
}

/**
 * Builds findings for symbol pins outside their parsed body bounds.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function pinOutsideBodyFindings(schematic) {
    const bodyBounds = symbolBodyBoundsByOwner(schematic)
    return (schematic.pins || [])
        .filter((pin) => pin?.visible !== false)
        .map((pin) => ({ pin, bounds: bodyBounds.get(String(pin.ownerIndex)) }))
        .filter(({ pin, bounds }) => {
            return bounds && !pointInsideBounds(point(pin), bounds)
        })
        .map(({ pin, bounds }) => ({
            severity: 'warning',
            code: 'kicad.schematic.geometry.pin-outside-symbol-body',
            construct: 'pin',
            sourceKey: sourceKey(pin),
            ownerIndex: String(pin.ownerIndex || ''),
            bodyBounds: describeBounds(bounds),
            message:
                'KiCad schematic symbol pin anchor falls outside the parsed symbol body bounds.'
        }))
}

/**
 * Builds findings for symbol fields outside their parsed body bounds.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function fieldOutsideBodyFindings(schematic) {
    const bodyBounds = symbolBodyBoundsByOwner(schematic)
    return (schematic.texts || [])
        .filter((text) => text?.ownerIndex && isSymbolField(text))
        .map((text) => ({
            text,
            bounds: bodyBounds.get(String(text.ownerIndex))
        }))
        .filter(({ text, bounds }) => {
            return bounds && !pointInsideBounds(point(text), bounds)
        })
        .map(({ text, bounds }) => ({
            severity: 'info',
            code: 'kicad.schematic.geometry.field-outside-symbol-body',
            construct: 'field',
            sourceKey: sourceKey(text),
            ownerIndex: String(text.ownerIndex || ''),
            bodyBounds: describeBounds(bounds),
            message:
                'KiCad schematic symbol field anchor falls outside the parsed symbol body bounds.'
        }))
}

/**
 * Adds stable finding keys.
 * @param {object[]} findings Finding rows.
 * @returns {object[]}
 */
function keyedFindings(findings) {
    return findings.map((finding, index) => ({
        key: 'schematic-geometry-' + index,
        ...finding
    }))
}

/**
 * Returns a normalized point.
 * @param {{ x?: number, y?: number } | undefined} value Point value.
 * @returns {{ x: number, y: number }}
 */
function point(value) {
    return {
        x: Number(value?.x || 0),
        y: Number(value?.y || 0)
    }
}

/**
 * Checks whether a text value spans multiple lines.
 * @param {unknown} value Text value.
 * @returns {boolean}
 */
function hasMultipleLines(value) {
    return /\r|\n/u.test(String(value || ''))
}

/**
 * Builds symbol body bounds keyed by owner index.
 * @param {object} schematic Schematic model.
 * @returns {Map<string, object>}
 */
function symbolBodyBoundsByOwner(schematic) {
    const boundsByOwner = new Map()
    for (const primitive of bodyPrimitives(schematic)) {
        const ownerIndex = String(primitive?.ownerIndex || '')
        if (!ownerIndex) continue
        const primitiveBounds = boundsForPrimitive(primitive)
        if (!primitiveBounds) continue
        boundsByOwner.set(
            ownerIndex,
            mergeBounds(boundsByOwner.get(ownerIndex), primitiveBounds)
        )
    }
    return boundsByOwner
}

/**
 * Collects symbol body primitives.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function bodyPrimitives(schematic) {
    return [
        ...(schematic.rectangles || []),
        ...(schematic.ellipses || []),
        ...(schematic.polygons || []),
        ...(schematic.lines || [])
    ]
}

/**
 * Resolves bounds for one schematic primitive.
 * @param {object} primitive Primitive row.
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
 */
function boundsForPrimitive(primitive) {
    if (primitive?.center && primitive?.radius !== undefined) {
        const center = point(primitive.center)
        const radius = Number(primitive.radius || 0)
        return {
            minX: center.x - radius,
            minY: center.y - radius,
            maxX: center.x + radius,
            maxY: center.y + radius
        }
    }

    const points = primitivePoints(primitive)
    if (points.length === 0) return null
    return boundsForPoints(points)
}

/**
 * Lists representative points for a primitive.
 * @param {object} primitive Primitive row.
 * @returns {{ x: number, y: number }[]}
 */
function primitivePoints(primitive) {
    if ((primitive?.points || []).length) {
        return primitive.points.map(point)
    }
    return [primitive?.start, primitive?.end]
        .filter(Boolean)
        .map((entry) => point(entry))
}

/**
 * Builds bounds for points.
 * @param {{ x: number, y: number }[]} points Points.
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
 */
function boundsForPoints(points) {
    return {
        minX: Math.min(...points.map((entry) => entry.x)),
        minY: Math.min(...points.map((entry) => entry.y)),
        maxX: Math.max(...points.map((entry) => entry.x)),
        maxY: Math.max(...points.map((entry) => entry.y))
    }
}

/**
 * Merges two bounds.
 * @param {object | undefined} current Existing bounds.
 * @param {object} next Next bounds.
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }}
 */
function mergeBounds(current, next) {
    if (!current) return { ...next }
    return {
        minX: Math.min(current.minX, next.minX),
        minY: Math.min(current.minY, next.minY),
        maxX: Math.max(current.maxX, next.maxX),
        maxY: Math.max(current.maxY, next.maxY)
    }
}

/**
 * Checks whether a point is inside bounds.
 * @param {{ x: number, y: number }} value Point.
 * @param {object} bounds Bounds.
 * @returns {boolean}
 */
function pointInsideBounds(value, bounds) {
    return (
        value.x >= bounds.minX &&
        value.x <= bounds.maxX &&
        value.y >= bounds.minY &&
        value.y <= bounds.maxY
    )
}

/**
 * Describes bounds with derived dimensions.
 * @param {object} bounds Bounds.
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }}
 */
function describeBounds(bounds) {
    return {
        minX: roundMetric(bounds.minX),
        minY: roundMetric(bounds.minY),
        maxX: roundMetric(bounds.maxX),
        maxY: roundMetric(bounds.maxY),
        width: roundMetric(bounds.maxX - bounds.minX),
        height: roundMetric(bounds.maxY - bounds.minY)
    }
}

/**
 * Checks whether a schematic text row represents a symbol field.
 * @param {object} text Text row.
 * @returns {boolean}
 */
function isSymbolField(text) {
    return Boolean(text?.propertyName || text?.fieldName || text?.field)
}

/**
 * Rounds a metric value to stable precision.
 * @param {unknown} value Candidate value.
 * @returns {number}
 */
function roundMetric(value) {
    const number = Number(value)
    if (!Number.isFinite(number)) return 0
    return Math.round(number * 1000) / 1000
}

/**
 * Collects fill-bearing primitives.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function fillPrimitives(schematic) {
    return [
        ...(schematic.rectangles || []),
        ...(schematic.polygons || []),
        ...(schematic.ellipses || []),
        ...(schematic.arcs || []),
        ...(schematic.beziers || []),
        ...(schematic.textBoxes || [])
    ]
}

/**
 * Collects stroke-bearing primitives.
 * @param {object} schematic Schematic model.
 * @returns {object[]}
 */
function strokePrimitives(schematic) {
    return [
        ...(schematic.lines || []),
        ...(schematic.rectangles || []),
        ...(schematic.polygons || []),
        ...(schematic.ellipses || []),
        ...(schematic.arcs || []),
        ...(schematic.beziers || []),
        ...(schematic.textBoxes || [])
    ]
}

/**
 * Resolves a schematic primitive construct name.
 * @param {object} primitive Primitive row.
 * @returns {string}
 */
function constructFor(primitive) {
    return String(
        primitive?.shapeType ||
            primitive?.sourceType ||
            primitive?.type ||
            primitive?.recordType ||
            'primitive'
    )
}

/**
 * Reads a finite stroke width.
 * @param {object} primitive Primitive row.
 * @returns {number | null}
 */
function numericStrokeWidth(primitive) {
    const value = Number(
        primitive?.lineWidth ?? primitive?.strokeWidth ?? primitive?.width
    )
    return Number.isFinite(value) ? value : null
}

/**
 * Resolves a normalized pin style token.
 * @param {object} pin Pin row.
 * @returns {string}
 */
function pinStyle(pin) {
    return String(pin?.pinStyle || pin?.graphicStyle || 'line').trim()
}

/**
 * Counts findings with one code.
 * @param {object[]} findings Finding rows.
 * @param {string} code Finding code.
 * @returns {number}
 */
function codeCount(findings, code) {
    return findings.filter((finding) => finding.code === code).length
}

/**
 * Finds direct child nodes.
 * @param {Array | undefined} node Parent node.
 * @returns {Array[]}
 */
function children(node) {
    if (!Array.isArray(node)) return []
    return node.filter(Array.isArray)
}

/**
 * Reads a direct UUID child from an S-expression node.
 * @param {Array} node S-expression node.
 * @returns {string}
 */
function uuidOfNode(node) {
    const uuid = children(node).find((entry) => entry[0] === 'uuid')
    return String(uuid?.[1] || '')
}

/**
 * Returns a stable source key for a construct.
 * @param {object} value Construct row.
 * @returns {string}
 */
function sourceKey(value) {
    return String(
        value?.uuid ||
            value?.id ||
            value?.key ||
            value?.designator ||
            value?.name ||
            ''
    )
}

/**
 * Groups finding keys by one field.
 * @param {object[]} rows Finding rows.
 * @param {string} field Field name.
 * @returns {Record<string, string[]>}
 */
function keysBy(rows, field) {
    const groups = {}
    for (const row of rows) {
        const key = String(row[field] || '')
        if (!key) continue
        groups[key] ||= []
        groups[key].push(row.key)
    }
    return Object.fromEntries(Object.entries(groups).sort())
}
