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
            ...missingFontFaceDiagnostics(pcb),
            ...suspiciousTextPayloadDiagnostics(pcb),
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
 * Builds diagnostics for explicit text font faces without available font data.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function missingFontFaceDiagnostics(pcb) {
    if (embeddedFontsEnabled(pcb)) return []

    const available = availableFontFaces(pcb)
    return textRows(pcb)
        .filter((text) => {
            const fontFace = normalizeFontFace(text?.fontFace)
            return fontFace && !available.has(fontFace)
        })
        .map((text) => ({
            severity: 'info',
            code: 'kicad.pcb.fidelity.missing-font-face',
            construct: 'text',
            sourceKey: sourceKey(text),
            fontFace: String(text?.fontFace || ''),
            message:
                'KiCad PCB text names a font face that was not found in embedded or available font assets.'
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
        missingFontFaceCount: missingFontFaceDiagnostics(pcb).length,
        suspiciousTextPayloadCount:
            suspiciousTextPayloadDiagnostics(pcb).length,
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
 * Builds diagnostics for text-like payloads with suspicious characters.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function suspiciousTextPayloadDiagnostics(pcb) {
    return textPayloadRows(pcb)
        .map((row) => ({
            row,
            issues: textPayloadIssues(row.value)
        }))
        .filter(({ issues }) => issues.length > 0)
        .map(({ row, issues }) => ({
            severity: 'warning',
            code: 'kicad.pcb.fidelity.suspicious-text-payload',
            construct: row.construct,
            sourceKey: row.sourceKey,
            field: row.field,
            issues,
            message:
                'KiCad PCB text-like payload contains replacement, null, or non-whitespace control characters.'
        }))
}

/**
 * Lists text-like payload rows from PCB text and footprint metadata.
 * @param {object} pcb PCB model.
 * @returns {{ construct: string, sourceKey: string, field: string, value: string }[]}
 */
function textPayloadRows(pcb) {
    return [
        ...textRows(pcb).map((text, index) => ({
            construct: 'text',
            sourceKey: sourceKey(text) || 'text-' + index,
            field: textPayloadField(text),
            value: textPayloadValue(text)
        })),
        ...footprintFieldPayloadRows(pcb),
        ...componentFieldPayloadRows(pcb)
    ].filter((row) => row.field)
}

/**
 * Lists text-like footprint metadata payload rows.
 * @param {object} pcb PCB model.
 * @returns {{ construct: string, sourceKey: string, field: string, value: string }[]}
 */
function footprintFieldPayloadRows(pcb) {
    return footprintRows(pcb).flatMap((footprint, index) => {
        const baseKey = sourceKey(footprint) || 'footprint-' + index
        return fieldPayloadRows('footprint-field', baseKey, footprint, [
            'reference',
            'value',
            'footprintName',
            'libraryName'
        ])
    })
}

/**
 * Lists text-like component metadata payload rows.
 * @param {object} pcb PCB model.
 * @returns {{ construct: string, sourceKey: string, field: string, value: string }[]}
 */
function componentFieldPayloadRows(pcb) {
    return (pcb.components || []).flatMap((component, index) => {
        const baseKey = sourceKey(component) || 'component-' + index
        return fieldPayloadRows('component-field', baseKey, component, [
            'designator',
            'value',
            'name',
            'footprintId',
            'footprintName',
            'modelName',
            'modelPath'
        ])
    })
}

/**
 * Lists selected fields from one object as text payload rows.
 * @param {string} construct Construct name.
 * @param {string} baseKey Source key.
 * @param {object} source Source object.
 * @param {string[]} fields Field names.
 * @returns {{ construct: string, sourceKey: string, field: string, value: string }[]}
 */
function fieldPayloadRows(construct, baseKey, source, fields) {
    return fields
        .filter((field) => source?.[field] !== undefined)
        .map((field) => ({
            construct,
            sourceKey: baseKey + ':' + field,
            field,
            value: String(source?.[field] ?? '')
        }))
}

/**
 * Resolves the source field for a PCB text row.
 * @param {object} text Text row.
 * @returns {string}
 */
function textPayloadField(text) {
    for (const field of ['value', 'text', 'name']) {
        if (text?.[field] !== undefined) return field
    }
    return ''
}

/**
 * Resolves the source value for a PCB text row.
 * @param {object} text Text row.
 * @returns {string}
 */
function textPayloadValue(text) {
    const field = textPayloadField(text)
    return field ? String(text?.[field] ?? '') : ''
}

/**
 * Lists suspicious text payload issue codes.
 * @param {unknown} value Candidate text.
 * @returns {string[]}
 */
function textPayloadIssues(value) {
    const text = String(value ?? '')
    const issues = []
    if (/\uFFFD/u.test(text)) issues.push('replacement-character')
    if (/\u0000/u.test(text)) issues.push('null-character')
    if (/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) {
        issues.push('control-character')
    }
    return issues
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
 * Lists text rows from a PCB model and nested footprints.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function textRows(pcb) {
    const source = sourceBoard(pcb)
    const sourceTexts = [
        ...(source.texts || []),
        ...(source.footprints || []).flatMap(
            (footprint) => footprint.texts || []
        )
    ]
    if (source !== pcb && sourceTexts.length > 0) {
        return uniqueObjects(sourceTexts)
    }

    return uniqueObjects([
        ...(pcb.texts || []),
        ...(pcb.footprints || []).flatMap((footprint) => footprint.texts || [])
    ])
}

/**
 * Lists footprint rows from a PCB model.
 * @param {object} pcb PCB model.
 * @returns {object[]}
 */
function footprintRows(pcb) {
    const source = sourceBoard(pcb)
    if (source !== pcb && (source.footprints || []).length > 0) {
        return uniqueObjects(source.footprints || [])
    }
    return uniqueObjects(pcb.footprints || [])
}

/**
 * Returns true when the PCB declares embedded fonts.
 * @param {object} pcb PCB model.
 * @returns {boolean}
 */
function embeddedFontsEnabled(pcb) {
    return Boolean(pcb.embeddedFonts || sourceBoard(pcb).embeddedFonts)
}

/**
 * Lists normalized available font faces.
 * @param {object} pcb PCB model.
 * @returns {Set<string>}
 */
function availableFontFaces(pcb) {
    return new Set(
        [
            ...(pcb.availableFonts || []),
            ...(sourceBoard(pcb).availableFonts || []),
            ...(pcb.embeddedFiles || []),
            ...(sourceBoard(pcb).embeddedFiles || [])
        ]
            .flatMap(fontFaceCandidates)
            .map(normalizeFontFace)
            .filter(Boolean)
    )
}

/**
 * Returns font-face candidate names from one asset or scalar.
 * @param {unknown} value Candidate asset.
 * @returns {string[]}
 */
function fontFaceCandidates(value) {
    if (!value || typeof value !== 'object') return [String(value || '')]
    return [
        value.fontFace,
        value.family,
        value.name,
        value.fileName,
        fileStem(value.path),
        fileStem(value.relativePath)
    ].filter(Boolean)
}

/**
 * Returns the basename without a final extension.
 * @param {unknown} value Candidate path.
 * @returns {string}
 */
function fileStem(value) {
    return String(value || '')
        .replace(/\\/gu, '/')
        .split('/')
        .pop()
        .replace(/\.[^.]+$/u, '')
}

/**
 * Normalizes a font face for matching.
 * @param {unknown} value Candidate face.
 * @returns {string}
 */
function normalizeFontFace(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
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
