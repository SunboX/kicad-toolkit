// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.pcb.geometry-readiness.a1'

/**
 * Builds rendering-sensitive PCB geometry readiness reports.
 */
export class KicadPcbGeometryReadinessReportBuilder {
    /**
     * Builds a deterministic PCB geometry readiness report.
     * @param {object} pcb KiCad PCB model or normalized PCB sidecar.
     * @returns {object}
     */
    static build(pcb = {}) {
        const findings = keyedFindings([
            ...thickArcFindings(pcb),
            ...curveFindings(pcb),
            ...multiContourZoneFindings(pcb),
            ...textBoxFindings(pcb),
            ...customPadFindings(pcb)
        ])

        return {
            schema: schemaId,
            summary: summary(pcb, findings),
            findings,
            indexes: {
                findingsBySeverity: keysBy(findings, 'severity'),
                findingsByConstruct: keysBy(findings, 'construct')
            }
        }
    }
}

/**
 * Builds findings for thick arcs.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function thickArcFindings(pcb) {
    return (pcb.arcs || []).filter(isThickArc).map((arc) => ({
        severity: 'warning',
        code: 'kicad.pcb.geometry.thick-arc',
        construct: 'arc',
        sourceKey: sourceKey(arc),
        message: 'KiCad PCB arc stroke is at least as thick as the arc radius.'
    }))
}

/**
 * Builds findings for curve primitives.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function curveFindings(pcb) {
    return [...(pcb.drawings || []), ...(sourceBoard(pcb).drawings || [])]
        .filter((drawing) => String(drawing?.type || '') === 'curve')
        .map((drawing) => ({
            severity: 'info',
            code: 'kicad.pcb.geometry.curve-primitive',
            construct: 'curve',
            sourceKey: sourceKey(drawing),
            message:
                'KiCad PCB curve primitive should be rendered from preserved control points.'
        }))
}

/**
 * Builds findings for multi-contour zones.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function multiContourZoneFindings(pcb) {
    return [...(pcb.polygons || []), ...(pcb.drawings || [])]
        .filter((zone) => {
            return (
                String(zone?.type || '') === 'zone' &&
                (zone.contours || []).length > 1
            )
        })
        .map((zone) => ({
            severity: 'warning',
            code: 'kicad.pcb.geometry.multi-contour-zone',
            construct: 'zone',
            sourceKey: sourceKey(zone),
            message:
                'KiCad PCB zone has multiple contours and needs even-odd fill handling.'
        }))
}

/**
 * Builds findings for text boxes.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function textBoxFindings(pcb) {
    return [...(pcb.drawings || []), ...(pcb.texts || [])]
        .filter(isTextBox)
        .map((textBox) => ({
            severity: 'info',
            code: 'kicad.pcb.geometry.text-box',
            construct: 'text-box',
            sourceKey: sourceKey(textBox),
            message:
                'KiCad PCB text box has fixed geometry that renderer consumers should preserve.'
        }))
}

/**
 * Builds findings for custom pads and their curve primitives.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function customPadFindings(pcb) {
    const findings = []
    for (const pad of pcb.pads || []) {
        if (String(pad?.shape || '') === 'custom') {
            findings.push({
                severity: 'warning',
                code: 'kicad.pcb.geometry.custom-pad',
                construct: 'pad',
                sourceKey: sourceKey(pad),
                message:
                    'KiCad PCB custom pad should be rendered from preserved primitive geometry.'
            })
        }
        for (const primitive of pad.customPrimitives || []) {
            if (String(primitive?.type || '') !== 'curve') continue
            findings.push({
                severity: 'info',
                code: 'kicad.pcb.geometry.custom-pad-curve',
                construct: 'curve',
                sourceKey: sourceKey(pad),
                message:
                    'KiCad PCB custom pad includes curve primitive control points.'
            })
        }
    }
    return findings
}

/**
 * Returns true when an arc has a stroke at least as thick as its radius.
 * @param {object} arc Arc row.
 * @returns {boolean}
 */
function isThickArc(arc) {
    const width = Number(arc?.width || 0)
    const radius = Number(arc?.radius || 0)
    return radius > 0 && width / 2 >= radius
}

/**
 * Returns true for text-box rows.
 * @param {object} value Candidate primitive.
 * @returns {boolean}
 */
function isTextBox(value) {
    return ['text_box', 'gr_text_box'].includes(
        String(value?.type || value?.sourceType || '')
    )
}

/**
 * Adds stable finding keys.
 * @param {object[]} findings Finding rows.
 * @returns {object[]}
 */
function keyedFindings(findings) {
    return findings.map((finding, index) => ({
        key: 'geometry-' + index,
        ...finding
    }))
}

/**
 * Builds summary counts.
 * @param {object} pcb PCB model.
 * @param {object[]} findings Finding rows.
 * @returns {object}
 */
function summary(pcb, findings) {
    return {
        findingCount: findings.length,
        warningCount: findings.filter((row) => row.severity === 'warning')
            .length,
        infoCount: findings.filter((row) => row.severity === 'info').length,
        thickArcCount: (pcb.arcs || []).filter(isThickArc).length,
        multiContourZoneCount: findings.filter((row) => {
            return row.code === 'kicad.pcb.geometry.multi-contour-zone'
        }).length,
        curvePrimitiveCount: findings.filter((row) => row.construct === 'curve')
            .length,
        textBoxCount: findings.filter((row) => row.construct === 'text-box')
            .length,
        customPadCount: (pcb.pads || []).filter((pad) => {
            return String(pad?.shape || '') === 'custom'
        }).length
    }
}

/**
 * Resolves the raw board object from normalized wrappers.
 * @param {object} pcb Candidate PCB object.
 * @returns {object}
 */
function sourceBoard(pcb) {
    return pcb?.kicadBoard || pcb?.pcb?.kicadBoard || pcb?.pcb || {}
}

/**
 * Returns a stable source key for a construct.
 * @param {object} value Construct row.
 * @returns {string}
 */
function sourceKey(value) {
    return String(value?.id || value?.key || value?.name || '')
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
