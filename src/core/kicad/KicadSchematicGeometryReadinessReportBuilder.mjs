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
        unknownGraphicCount: codeCount(
            findings,
            'kicad.schematic.geometry.unknown-root-node'
        )
    }
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
