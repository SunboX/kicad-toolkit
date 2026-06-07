// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { CircuitJsonModelAdapter } from '../circuit-json/CircuitJsonModelAdapter.mjs'
import { PcbSvgRenderer } from '../../ui/PcbSvgRenderer.mjs'
import { SchematicSvgRenderer } from '../../ui/SchematicSvgRenderer.mjs'
import { KicadEmbeddedAssetInventoryBuilder } from './KicadEmbeddedAssetInventoryBuilder.mjs'
import { KicadContractGateReportBuilder } from './KicadContractGateReportBuilder.mjs'
import { KicadProjectDocumentGraphBuilder } from './KicadProjectDocumentGraphBuilder.mjs'
import { KicadReadinessReport } from './KicadReadinessReport.mjs'
import { KicadSchematicConnectivityQaBuilder } from './KicadSchematicConnectivityQaBuilder.mjs'
import { ProjectDesignBundleBuilder } from './ProjectDesignBundleBuilder.mjs'
import { ProjectNetlistExporter } from './ProjectNetlistExporter.mjs'

const schemaId = 'kicad-toolkit.ci.artifact-bundle.a1'

/**
 * Builds deterministic read-only CI artifacts from parsed KiCad documents.
 */
export class KicadCiArtifactBundleBuilder {
    /**
     * Builds a bundle of normalized, rendered, and report outputs.
     * @param {{ projectModel?: object, documentModels?: object[], designBundle?: object, variantName?: string, renderSchematicSvg?: boolean, renderPcbLayerSvgs?: boolean, schematicSvgOptions?: object, generatedOutputs?: object[], assets?: object[], jobsets?: object[] }} [options] Bundle options.
     * @returns {object}
     */
    static build(options = {}) {
        const projectModel = options.projectModel || {}
        const documentModels = resolveDocumentModels(options, projectModel)
        const designBundle =
            options.designBundle ||
            ProjectDesignBundleBuilder.build({
                projectModel,
                documentModels,
                variantName: options.variantName
            })
        const activeBundle = designBundle.effectiveVariant || designBundle
        const schematicSvgs =
            options.renderSchematicSvg === false
                ? []
                : schematicSvgRows(
                      documentModels,
                      options.schematicSvgOptions || {}
                  )
        const pcbLayerSvgs =
            options.renderPcbLayerSvgs === false
                ? []
                : pcbLayerSvgRows(documentModels)
        const documentGraph = KicadProjectDocumentGraphBuilder.build(
            projectModel,
            {
                documentModels,
                generatedOutputs: options.generatedOutputs || [],
                assets: options.assets || [],
                jobsets: options.jobsets || []
            }
        )
        const netlistJson =
            ProjectNetlistExporter.buildNetlistJson(activeBundle)
        const netlist = {
            json: netlistJson,
            wirelist: ProjectNetlistExporter.buildWirelist(activeBundle)
        }
        const readiness = readinessReports(documentModels)
        const schematicQa = schematicQaReports(documentModels)
        const diagnostics = diagnosticRows(designBundle, documentModels)
        const assetInventory = KicadEmbeddedAssetInventoryBuilder.build(
            { documents: documentModels },
            { assets: combinedAssets(projectModel, options) }
        )
        const contractGate = KicadContractGateReportBuilder.build({
            documentModels,
            netlist,
            schematicSvgs,
            pcbLayerSvgs,
            diagnostics
        })

        return {
            schema: schemaId,
            summary: {
                normalizedModelCount: documentModels.length,
                schematicSvgCount: schematicSvgs.length,
                pcbLayerSvgCount: pcbLayerSvgs.reduce(
                    (total, entry) => total + entry.layers.length,
                    0
                ),
                netCount: netlistJson.nets.length,
                bomRowCount: (activeBundle.bom || designBundle.bom || [])
                    .length,
                pnpCount: (activeBundle.pnp?.entries || []).length,
                diagnosticCount: diagnostics.length,
                readinessReportCount: readiness.pcb.length,
                schematicQaReportCount: schematicQa.length,
                contractGateStatus: contractGate.status
            },
            designBundle,
            documentGraph,
            normalizedModels: documentModels,
            netlist,
            bom: { rows: activeBundle.bom || designBundle.bom || [] },
            pnp: activeBundle.pnp || designBundle.pnp || { entries: [] },
            schematicSvgs,
            pcbLayerSvgs,
            readiness,
            schematicQa,
            assetInventory,
            contractGate,
            diagnostics
        }
    }
}

/**
 * Resolves renderer-compatible document models.
 * @param {object} options Build options.
 * @param {object} projectModel Project loader result.
 * @returns {object[]}
 */
function resolveDocumentModels(options, projectModel) {
    const records =
        options.documentModels ||
        projectModel.rendererDocuments ||
        projectModel.documents ||
        []
    return (Array.isArray(records) ? records : []).map((record) => {
        if (record?.kind || record?.schematic || record?.pcb) return record
        return CircuitJsonModelAdapter.toRendererModel(record)
    })
}

/**
 * Renders schematic SVG rows.
 * @param {object[]} documentModels Parsed document models.
 * @param {object} renderOptions Render options.
 * @returns {object[]}
 */
function schematicSvgRows(documentModels, renderOptions) {
    return documentModels
        .filter((model) => model?.kind === 'schematic')
        .map((model) => ({
            fileName: model.fileName || '',
            svg: SchematicSvgRenderer.render(model, renderOptions)
        }))
}

/**
 * Renders PCB per-layer SVG rows.
 * @param {object[]} documentModels Parsed document models.
 * @returns {object[]}
 */
function pcbLayerSvgRows(documentModels) {
    return documentModels
        .filter((model) => model?.kind === 'pcb')
        .map((model) => ({
            fileName: model.fileName || '',
            layers: PcbSvgRenderer.renderLayerSvgs(model)
        }))
}

/**
 * Builds PCB readiness reports.
 * @param {object[]} documentModels Parsed document models.
 * @returns {{ pcb: object[] }}
 */
function readinessReports(documentModels) {
    return {
        pcb: documentModels
            .filter((model) => model?.kind === 'pcb')
            .map((model) => ({
                fileName: model.fileName || '',
                ...KicadReadinessReport.fabricationReadiness(
                    model.pcb?.kicadBoard || model.pcb || model
                )
            }))
    }
}

/**
 * Builds schematic connectivity QA reports.
 * @param {object[]} documentModels Parsed document models.
 * @returns {object[]}
 */
function schematicQaReports(documentModels) {
    return documentModels
        .filter((model) => model?.kind === 'schematic')
        .map((model) => ({
            fileName: model.fileName || '',
            ...KicadSchematicConnectivityQaBuilder.build(model)
        }))
}

/**
 * Collects source diagnostics.
 * @param {object} designBundle Design bundle.
 * @param {object[]} documentModels Parsed document models.
 * @returns {object[]}
 */
function diagnosticRows(designBundle, documentModels) {
    return [
        ...sourceDiagnostics('design-bundle', designBundle.diagnostics || []),
        ...documentModels.flatMap((model) =>
            sourceDiagnostics(
                model.fileName || model.kind || 'document',
                model.diagnostics || []
            )
        )
    ]
}

/**
 * Combines project and caller assets without duplicating identical names.
 * @param {object} projectModel Project loader result.
 * @param {object} options Build options.
 * @returns {object[]}
 */
function combinedAssets(projectModel, options) {
    const assetsByName = new Map()
    for (const asset of [
        ...(Array.isArray(projectModel.assets) ? projectModel.assets : []),
        ...(Array.isArray(options.assets) ? options.assets : [])
    ]) {
        const key = String(asset?.name || asset?.fileName || '').trim()
        if (!key || assetsByName.has(key)) continue
        assetsByName.set(key, asset)
    }
    return [...assetsByName.values()]
}

/**
 * Labels diagnostics with their source.
 * @param {string} source Diagnostic source.
 * @param {object[]} diagnostics Diagnostics.
 * @returns {object[]}
 */
function sourceDiagnostics(source, diagnostics) {
    return (diagnostics || []).map((diagnostic) => ({
        source,
        ...diagnostic
    }))
}
