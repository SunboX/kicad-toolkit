// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const schemaId = 'kicad-toolkit.pcb.fidelity-diagnostics.a1'

/**
 * Builds diagnostics for parsed PCB constructs that deserve consumer review.
 */
export class KicadPcbFidelityDiagnosticsBuilder {
    /**
     * Builds deterministic PCB fidelity diagnostics.
     * @param {object} pcb KiCad PCB model or normalized PCB sidecar.
     * @returns {object}
     */
    static build(pcb = {}) {
        const diagnostics = keyedDiagnostics([
            ...complexPadDiagnostics(pcb),
            ...zonePolicyDiagnostics(pcb),
            ...thickArcDiagnostics(pcb),
            ...unknownSourceNodeDiagnostics(pcb)
        ])

        return {
            schema: schemaId,
            summary: summary(pcb, diagnostics),
            diagnostics,
            indexes: {
                diagnosticsBySeverity: keysBy(diagnostics, 'severity'),
                diagnosticsByConstruct: keysBy(diagnostics, 'construct')
            }
        }
    }
}

/**
 * Builds diagnostics for complex pads.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function complexPadDiagnostics(pcb) {
    const diagnostics = []
    for (const pad of pcb.pads || []) {
        if (isComplexPad(pad)) {
            diagnostics.push({
                severity: 'warning',
                code: 'kicad.pcb.fidelity.complex-pad',
                construct: 'pad',
                sourceKey: sourceKey(pad),
                message:
                    'KiCad PCB pad uses a complex shape or layer-specific padstack fields.'
            })
        }
        if ((pad.customPrimitives || []).length > 0) {
            diagnostics.push({
                severity: 'warning',
                code: 'kicad.pcb.fidelity.custom-pad-primitives',
                construct: 'pad',
                sourceKey: sourceKey(pad),
                count: (pad.customPrimitives || []).length,
                message:
                    'KiCad PCB pad includes custom primitives that consumers should render from preserved geometry.'
            })
        }
        if (hasPadLocalPolicy(pad)) {
            diagnostics.push({
                severity: 'warning',
                code: 'kicad.pcb.fidelity.pad-local-policy',
                construct: 'pad',
                sourceKey: sourceKey(pad),
                message:
                    'KiCad PCB pad overrides local mask, paste, clearance, thermal, or zone connection policy.'
            })
        }
    }
    return diagnostics
}

/**
 * Returns true when a pad uses complex geometry.
 * @param {object} pad Pad row.
 * @returns {boolean}
 */
function isComplexPad(pad) {
    return (
        String(pad?.shape || '') === 'custom' ||
        (pad?.customPrimitives || []).length > 0 ||
        (pad?.padstackLayers || []).length > 0
    )
}

/**
 * Returns true when a pad has local manufacturing or zone policy.
 * @param {object} pad Pad row.
 * @returns {boolean}
 */
function hasPadLocalPolicy(pad) {
    return [
        pad?.solderMaskMargin,
        pad?.solderPasteMargin,
        pad?.solderPasteMarginRatio,
        pad?.clearance,
        pad?.zoneConnect,
        pad?.thermalBridgeWidth,
        pad?.thermalBridgeAngle,
        pad?.thermalGap
    ].some((value) => value !== undefined && value !== null)
}

/**
 * Builds diagnostics for zone fill and connection policies.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function zonePolicyDiagnostics(pcb) {
    const diagnostics = []
    for (const zone of zoneRows(pcb)) {
        if (Object.keys(zone.fillPolicy || {}).length > 0) {
            diagnostics.push({
                severity: 'info',
                code: 'kicad.pcb.fidelity.zone-fill-policy',
                construct: 'zone',
                sourceKey: sourceKey(zone),
                message:
                    'KiCad PCB zone declares fill policy metadata that affects generated copper.'
            })
        }
        if (Object.keys(zone.connectPads || {}).length > 0) {
            diagnostics.push({
                severity: 'info',
                code: 'kicad.pcb.fidelity.zone-connect-policy',
                construct: 'zone',
                sourceKey: sourceKey(zone),
                message:
                    'KiCad PCB zone declares pad connection policy metadata.'
            })
        }
    }
    return diagnostics
}

/**
 * Lists zone semantic rows.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function zoneRows(pcb) {
    return uniqueObjects([
        ...(pcb.zoneSemantics || []),
        ...(sourceBoard(pcb).zoneSemantics || [])
    ])
}

/**
 * Builds diagnostics for thick arcs.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function thickArcDiagnostics(pcb) {
    return (pcb.arcs || [])
        .filter((arc) => {
            const width = Number(arc?.width || 0)
            const radius = Number(arc?.radius || 0)
            return radius > 0 && width / 2 >= radius
        })
        .map((arc) => ({
            severity: 'warning',
            code: 'kicad.pcb.fidelity.thick-arc',
            construct: 'arc',
            sourceKey: sourceKey(arc),
            message:
                'KiCad PCB arc stroke is at least as thick as the arc radius.'
        }))
}

/**
 * Builds diagnostics for unknown preserved source nodes.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function unknownSourceNodeDiagnostics(pcb) {
    const coverage = pcb.sourceCoverage || sourceBoard(pcb).sourceCoverage || {}
    return Object.values(coverage.nodesByName || {})
        .filter((row) => row?.known === false)
        .map((row) => ({
            severity: 'warning',
            code: 'kicad.pcb.fidelity.unknown-source-node',
            construct: 'source-node',
            sourceKey: String(row.name || ''),
            message:
                'KiCad PCB source contains preserved S-expression nodes without a recognized parser family.'
        }))
}

/**
 * Adds stable keys to diagnostics.
 * @param {object[]} diagnostics Diagnostic rows.
 * @returns {object[]}
 */
function keyedDiagnostics(diagnostics) {
    return diagnostics.map((diagnostic, index) => ({
        key: 'fidelity-' + index,
        ...diagnostic
    }))
}

/**
 * Builds summary counts.
 * @param {object} pcb PCB model.
 * @param {object[]} diagnostics Diagnostic rows.
 * @returns {object}
 */
function summary(pcb, diagnostics) {
    return {
        diagnosticCount: diagnostics.length,
        warningCount: diagnostics.filter((row) => row.severity === 'warning')
            .length,
        infoCount: diagnostics.filter((row) => row.severity === 'info').length,
        complexPadCount: (pcb.pads || []).filter(isComplexPad).length,
        customPadPrimitiveCount: (pcb.pads || []).reduce((total, pad) => {
            return total + (pad.customPrimitives || []).length
        }, 0),
        zonePolicyCount: zoneRows(pcb).reduce((total, zone) => {
            return (
                total +
                (Object.keys(zone.fillPolicy || {}).length > 0 ? 1 : 0) +
                (Object.keys(zone.connectPads || {}).length > 0 ? 1 : 0)
            )
        }, 0),
        highRiskConstructCount: diagnostics.filter((row) => {
            return [
                'kicad.pcb.fidelity.complex-pad',
                'kicad.pcb.fidelity.thick-arc',
                'kicad.pcb.fidelity.unknown-source-node'
            ].includes(row.code)
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
    return String(
        value?.id || value?.key || value?.name || value?.zoneIndex || ''
    )
}

/**
 * Deduplicates object references while preserving order.
 * @param {object[]} values Source values.
 * @returns {object[]}
 */
function uniqueObjects(values) {
    return [...new Set(values.filter(Boolean))]
}

/**
 * Groups diagnostic keys by one field.
 * @param {object[]} rows Diagnostic rows.
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
