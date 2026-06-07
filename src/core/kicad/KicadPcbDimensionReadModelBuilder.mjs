// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { Geometry } from './Geometry.mjs'

const schemaId = 'kicad-toolkit.pcb.dimensions.a1'

/**
 * Builds read-only PCB dimension reports from parsed KiCad drawings.
 */
export class KicadPcbDimensionReadModelBuilder {
    /**
     * Builds a deterministic PCB dimension report.
     * @param {object} pcb KiCad PCB model or normalized PCB sidecar.
     * @returns {object}
     */
    static build(pcb = {}) {
        const board = sourceBoard(pcb)
        const drawings = dimensionDrawings(board)
        const texts = dimensionTexts(board)
        const dimensions = drawings.map((drawing, index) =>
            dimensionRow(drawing, index, texts)
        )

        return {
            schema: schemaId,
            units: { coordinate: 'mm', length: 'mm', angle: 'deg' },
            summary: {
                dimensionCount: dimensions.length,
                measuredDimensionCount: dimensions.filter((dimension) =>
                    Number.isFinite(dimension.measuredValue)
                ).length,
                textCount: dimensions.filter((dimension) => dimension.text)
                    .length,
                layerCount: new Set(
                    dimensions
                        .map((dimension) => dimension.layerKey)
                        .filter(Boolean)
                ).size
            },
            dimensions,
            indexes: {
                dimensionsByLayer: keysBy(dimensions, 'layerKey')
            }
        }
    }
}

/**
 * Resolves the raw KiCad board model from normalized wrappers.
 * @param {object} pcb Candidate PCB object.
 * @returns {object}
 */
function sourceBoard(pcb) {
    return pcb?.kicadBoard || pcb?.pcb?.kicadBoard || pcb?.pcb || pcb || {}
}

/**
 * Finds dimension drawing rows.
 * @param {object} board Parsed board.
 * @returns {object[]}
 */
function dimensionDrawings(board) {
    return (board.drawings || []).filter((drawing) => {
        return (
            drawing?.type === 'dimension' || drawing?.sourceType === 'dimension'
        )
    })
}

/**
 * Finds dimension text rows.
 * @param {object} board Parsed board.
 * @returns {object[]}
 */
function dimensionTexts(board) {
    return (board.texts || []).filter((text) => {
        return (
            text?.sourceType === 'dimension' || /dimension-text/u.test(text?.id)
        )
    })
}

/**
 * Builds one dimension row.
 * @param {object} drawing Dimension drawing.
 * @param {number} index Dimension index.
 * @param {object[]} texts Dimension text rows.
 * @returns {object}
 */
function dimensionRow(drawing, index, texts) {
    const text = matchingText(drawing, index, texts)
    const points = (drawing.points || []).map(pointRow)
    const measuredValue =
        points.length >= 2
            ? round(Geometry.distance(points[0], points[1]))
            : null

    return stripEmpty({
        dimensionIndex: index,
        key: 'dimension-' + index,
        kind: String(
            drawing.dimensionKind ||
                drawing.kind ||
                drawing.dimensionType ||
                'linear'
        ),
        layerKey: String(drawing.layerKey || drawing.layer || ''),
        ownerId: String(drawing.ownerId || ''),
        sourceType: String(drawing.sourceType || ''),
        pointCount: points.length,
        points,
        measuredValue,
        unit: 'mm',
        text: String(text?.value || text?.text || ''),
        textLocation: text ? pointRow({ x: text.x, y: text.y }) : undefined,
        strokeWidth: round(drawing.strokeWidth)
    })
}

/**
 * Resolves the text paired with one dimension drawing.
 * @param {object} drawing Dimension drawing.
 * @param {number} index Dimension index.
 * @param {object[]} texts Candidate texts.
 * @returns {object | undefined}
 */
function matchingText(drawing, index, texts) {
    return texts.find((text) => {
        if (
            text.ownerId &&
            drawing.ownerId &&
            text.ownerId !== drawing.ownerId
        ) {
            return false
        }
        return (
            String(text.id || '').endsWith(':' + index) ||
            String(text.id || '').includes('dimension-text:' + index)
        )
    })
}

/**
 * Builds a rounded point row.
 * @param {{ x?: number, y?: number }} point Candidate point.
 * @returns {{ x: number, y: number }}
 */
function pointRow(point) {
    return {
        x: round(point?.x),
        y: round(point?.y)
    }
}

/**
 * Groups dimension keys by one field.
 * @param {object[]} dimensions Dimension rows.
 * @param {string} field Field name.
 * @returns {Record<string, string[]>}
 */
function keysBy(dimensions, field) {
    const groups = {}
    for (const dimension of dimensions) {
        const key = String(dimension[field] || '')
        if (!key) continue
        if (!groups[key]) groups[key] = []
        groups[key].push(dimension.key)
    }
    return Object.fromEntries(Object.entries(groups).sort())
}

/**
 * Rounds a numeric value for deterministic report output.
 * @param {unknown} value Candidate number.
 * @returns {number}
 */
function round(value) {
    const number = Number(value || 0)
    return Number.isFinite(number) ? Number(number.toFixed(3)) : 0
}

/**
 * Removes undefined, null, and empty string fields.
 * @param {Record<string, unknown>} value Candidate object.
 * @returns {Record<string, unknown>}
 */
function stripEmpty(value) {
    return Object.fromEntries(
        Object.entries(value || {}).filter(([, entryValue]) => {
            return (
                entryValue !== undefined &&
                entryValue !== null &&
                entryValue !== ''
            )
        })
    )
}
