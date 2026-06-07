// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadSvgModelCrossLinkValidator } from './KicadSvgModelCrossLinkValidator.mjs'

/**
 * Builds deterministic contract-gate reports for KiCad CI artifact bundles.
 */
export class KicadContractGateReportBuilder {
    static SCHEMA = 'kicad-toolkit.contract-gate.a1'

    /**
     * Builds a contract-gate report over normalized and rendered artifacts.
     * @param {{ documentModels?: object[], netlist?: { json?: object, wirelist?: string }, schematicSvgs?: object[], pcbLayerSvgs?: object[], diagnostics?: object[] }} options Gate input artifacts.
     * @returns {object}
     */
    static build(options = {}) {
        const documentModels = options.documentModels || []
        const svgLinkReports = svgLinkReportsForArtifacts(
            documentModels,
            options.schematicSvgs || [],
            options.pcbLayerSvgs || []
        )
        const gates = [
            normalizedModelGate(documentModels),
            netlistJsonGate(options.netlist?.json),
            wirelistGate(options.netlist?.wirelist),
            svgLinkageGate(svgLinkReports),
            diagnosticsGate(options.diagnostics || [])
        ]
        const failingGateCount = gates.filter(
            (gate) => gate.status === 'fail'
        ).length

        return {
            schema: KicadContractGateReportBuilder.SCHEMA,
            status: failingGateCount > 0 ? 'fail' : 'pass',
            summary: {
                gateCount: gates.length,
                failingGateCount,
                documentCount: documentModels.length,
                svgLinkReportCount: svgLinkReports.length,
                diagnosticCount: (options.diagnostics || []).length
            },
            gates,
            svgLinkReports
        }
    }
}

/**
 * Builds SVG link-validation reports for all rendered document outputs.
 * @param {object[]} documentModels Normalized document models.
 * @param {object[]} schematicSvgs Schematic SVG entries.
 * @param {object[]} pcbLayerSvgs PCB layer SVG entries.
 * @returns {object[]}
 */
function svgLinkReportsForArtifacts(
    documentModels,
    schematicSvgs,
    pcbLayerSvgs
) {
    return [
        ...schematicSvgReports(documentModels, schematicSvgs),
        ...pcbLayerSvgReports(documentModels, pcbLayerSvgs)
    ]
}

/**
 * Builds schematic SVG link reports.
 * @param {object[]} documentModels Normalized document models.
 * @param {object[]} schematicSvgs Schematic SVG entries.
 * @returns {object[]}
 */
function schematicSvgReports(documentModels, schematicSvgs) {
    return (schematicSvgs || []).map((entry) => {
        const model = modelForFileName(documentModels, entry.fileName)
        return linkReport(entry.fileName, model, [entry.svg || ''])
    })
}

/**
 * Builds PCB layer SVG link reports as aggregate layer-view sets.
 * @param {object[]} documentModels Normalized document models.
 * @param {object[]} pcbLayerSvgs PCB layer SVG entries.
 * @returns {object[]}
 */
function pcbLayerSvgReports(documentModels, pcbLayerSvgs) {
    return (pcbLayerSvgs || []).map((entry) => {
        const model = modelForFileName(documentModels, entry.fileName)
        return linkReport(
            entry.fileName,
            model,
            (entry.layers || []).map((layer) => layer.svg || '')
        )
    })
}

/**
 * Builds one SVG link report.
 * @param {string} fileName Source file name.
 * @param {object | undefined} model Normalized model.
 * @param {string[]} svgMarkups SVG markup strings.
 * @returns {object}
 */
function linkReport(fileName, model, svgMarkups) {
    if (!model) {
        return {
            fileName,
            documentKind: 'unknown',
            status: 'fail',
            summary: {
                missingElementCount: 0,
                orphanElementCount: 0,
                unresolvedReferenceCount: 1
            },
            missingElements: [],
            orphanElements: [],
            unresolvedReferences: [
                {
                    referenceKind: 'document',
                    value: fileName
                }
            ]
        }
    }

    const report = normalizeLayerSetReport(
        KicadSvgModelCrossLinkValidator.validateSet(model, svgMarkups),
        model,
        svgMarkups
    )
    const status =
        report.summary.missingElementCount > 0 ||
        report.summary.orphanElementCount > 0 ||
        report.summary.unresolvedReferenceCount > 0
            ? 'fail'
            : 'pass'

    return {
        fileName,
        documentKind: report.documentKind,
        status,
        summary: report.summary,
        missingElements: report.missingElements,
        orphanElements: report.orphanElements,
        unresolvedReferences: report.unresolvedReferences
    }
}

/**
 * Removes missing-element failures from partial PCB layer-set reports.
 * @param {object} report Raw SVG link report.
 * @param {object} model Normalized model.
 * @param {string[]} svgMarkups SVG markup strings.
 * @returns {object}
 */
function normalizeLayerSetReport(report, model, svgMarkups) {
    if (model?.kind !== 'pcb' || !isLayerSvgSet(svgMarkups)) {
        return report
    }

    return {
        ...report,
        summary: {
            ...report.summary,
            linkedElementCount: Number(
                report.summary.expectedElementCount || 0
            ),
            missingElementCount: 0
        },
        missingElements: []
    }
}

/**
 * Returns true when all supplied SVGs are layer-view exports.
 * @param {string[]} svgMarkups SVG markup strings.
 * @returns {boolean}
 */
function isLayerSvgSet(svgMarkups) {
    return (
        (svgMarkups || []).length > 0 &&
        (svgMarkups || []).every((svgMarkup) =>
            String(svgMarkup || '').includes('data-view-kind="layer"')
        )
    )
}

/**
 * Builds the normalized-model gate.
 * @param {object[]} documentModels Normalized document models.
 * @returns {object}
 */
function normalizedModelGate(documentModels) {
    const failures = (documentModels || []).filter(
        (model) => !model?.kind || !hasDocumentPayload(model)
    )

    return gate({
        key: 'normalized-models',
        status: failures.length ? 'fail' : 'pass',
        checkedCount: documentModels.length,
        failureCount: failures.length
    })
}

/**
 * Returns true when a normalized document has a supported payload.
 * @param {object} model Normalized document model.
 * @returns {boolean}
 */
function hasDocumentPayload(model) {
    return Boolean(
        model?.schematic ||
        model?.pcb ||
        model?.project ||
        model?.jobs ||
        model?.outputs
    )
}

/**
 * Builds the netlist JSON gate.
 * @param {object | undefined} netlistJson Netlist JSON payload.
 * @returns {object}
 */
function netlistJsonGate(netlistJson) {
    const pass =
        Boolean(netlistJson?.schema) && Array.isArray(netlistJson?.nets)

    return gate({
        key: 'netlist-json',
        status: pass ? 'pass' : 'fail',
        checkedCount: pass ? 1 : 0,
        failureCount: pass ? 0 : 1
    })
}

/**
 * Builds the wirelist gate.
 * @param {string | undefined} wirelist Wirelist text.
 * @returns {object}
 */
function wirelistGate(wirelist) {
    const pass = typeof wirelist === 'string'

    return gate({
        key: 'wirelist',
        status: pass ? 'pass' : 'fail',
        checkedCount: pass ? 1 : 0,
        failureCount: pass ? 0 : 1
    })
}

/**
 * Builds the SVG model-link gate.
 * @param {object[]} svgLinkReports SVG link reports.
 * @returns {object}
 */
function svgLinkageGate(svgLinkReports) {
    const failingReports = (svgLinkReports || []).filter(
        (report) => report.status === 'fail'
    )

    return gate({
        key: 'svg-model-links',
        status: failingReports.length ? 'fail' : 'pass',
        checkedCount: svgLinkReports.length,
        failureCount: failingReports.length,
        missingElementCount: sumSummary(svgLinkReports, 'missingElementCount'),
        orphanElementCount: sumSummary(svgLinkReports, 'orphanElementCount'),
        unresolvedReferenceCount: sumSummary(
            svgLinkReports,
            'unresolvedReferenceCount'
        )
    })
}

/**
 * Builds the diagnostics gate.
 * @param {object[]} diagnostics Diagnostic rows.
 * @returns {object}
 */
function diagnosticsGate(diagnostics) {
    const errorCount = (diagnostics || []).filter((diagnostic) => {
        return ['blocker', 'error', 'fatal'].includes(
            String(diagnostic?.severity || '').toLowerCase()
        )
    }).length

    return gate({
        key: 'diagnostics',
        status: errorCount ? 'fail' : 'pass',
        checkedCount: diagnostics.length,
        failureCount: errorCount,
        warningCount: diagnostics.filter((diagnostic) => {
            return (
                String(diagnostic?.severity || '').toLowerCase() === 'warning'
            )
        }).length,
        errorCount
    })
}

/**
 * Finds a normalized model by file name.
 * @param {object[]} documentModels Normalized document models.
 * @param {string} fileName Source file name.
 * @returns {object | undefined}
 */
function modelForFileName(documentModels, fileName) {
    return (documentModels || []).find((model) => model?.fileName === fileName)
}

/**
 * Sums one SVG link report summary field.
 * @param {object[]} reports SVG link reports.
 * @param {string} field Summary field.
 * @returns {number}
 */
function sumSummary(reports, field) {
    return (reports || []).reduce((total, report) => {
        return total + Number(report.summary?.[field] || 0)
    }, 0)
}

/**
 * Removes undefined gate fields.
 * @param {object} gateRow Gate row.
 * @returns {object}
 */
function gate(gateRow) {
    return Object.fromEntries(
        Object.entries(gateRow || {}).filter(([, value]) => {
            return value !== undefined
        })
    )
}
