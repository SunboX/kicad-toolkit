// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import test from 'node:test'

import * as packageApi from '../src/index.mjs'
import * as nodeApi from '../src/node.mjs'
import * as parserApi from '../src/parser.mjs'
import * as rendererApi from '../src/renderers.mjs'
import * as scene3dApi from '../src/scene3d.mjs'

test('package exposes Altium-style parser and renderer entrypoints', async () => {
    const packageConfig = JSON.parse(
        await readFile(new URL('../package.json', import.meta.url), 'utf8')
    )

    assert.equal(packageConfig.exports['.'], './src/index.mjs')
    assert.equal(packageConfig.exports['./parser'], './src/parser.mjs')
    assert.equal(packageConfig.exports['./node'], './src/node.mjs')
    assert.equal(packageConfig.exports['./renderers'], './src/renderers.mjs')
    assert.equal(packageConfig.exports['./scene3d'], './src/scene3d.mjs')
    assert.equal(
        packageConfig.exports['./workers/kicad-parser.worker.mjs'],
        './src/workers/kicad-parser.worker.mjs'
    )
    assert.equal(
        packageConfig.exports['./styles/kicad-renderers.css'],
        './src/styles/kicad-renderers.css'
    )

    assertPublicApi(parserApi, [
        'CircuitJsonConformanceChecker',
        'CircuitJsonKicadLibraryExporter',
        'CircuitJsonKicadModExporter',
        'CircuitJsonKicadProjectExporter',
        'CircuitJsonKicadProjectModelResolver',
        'CircuitJsonModelAdapter',
        'CircuitJsonModelSchema',
        'Geometry',
        'KicadArcGeometry',
        'KicadCiArtifactBundleBuilder',
        'KicadContractGateReportBuilder',
        'KicadDesignBlockLibraryParser',
        'KicadDesignRulesParser',
        'KicadEmbeddedAssetInventoryBuilder',
        'KicadFeatureParity',
        'KicadFootprintAssociationParser',
        'KicadFootprintLibraryParser',
        'KicadFootprintLibraryParityReportBuilder',
        'KicadHostCapabilityDiagnosticsBuilder',
        'KicadImagePayloadManifestBuilder',
        'KicadJobsetDigestBuilder',
        'KicadJobsetParser',
        'KicadLayerResolver',
        'KicadLegacyLibraryParser',
        'KicadLibraryIndexBuilder',
        'KicadLibraryQaReportBuilder',
        'KicadLibraryRenderManifestBuilder',
        'KicadLibrarySearchIndex',
        'KicadLibraryTableParser',
        'KicadNetResolver',
        'KicadNetlistParser',
        'KicadParser',
        'KicadParserCompatibilityFuzzer',
        'KicadPcb3dModelReadinessReportBuilder',
        'KicadPcbDimensionReadModelBuilder',
        'KicadPcbDrawingParser',
        'KicadPcbFidelityDiagnosticsBuilder',
        'KicadPcbGeometryReadinessReportBuilder',
        'KicadPcbLayerUsageReportBuilder',
        'KicadPcbLayerStackReadModelBuilder',
        'KicadPcbLayerMetadata',
        'KicadPcbComponentParticipationPolicy',
        'KicadPcbOwnershipGraphBuilder',
        'KicadPcbPadParser',
        'KicadPcbPickPlacePositionResolver',
        'KicadPcbPlacedFootprintManifestBuilder',
        'KicadPcbParser',
        'KicadPcbRegionSemanticsBuilder',
        'KicadPcbReviewMetadataBuilder',
        'KicadPcbRigidFlexTopologyBuilder',
        'KicadPcbRuleReadModelBuilder',
        'KicadPcbRouteAnalysisBuilder',
        'KicadPcbStatisticsBuilder',
        'KicadProjectLoader',
        'KicadProjectBomPnpReconciliationBuilder',
        'KicadProjectDocumentGraphBuilder',
        'KicadProjectOutputDigestBuilder',
        'KicadProjectMetadataParser',
        'KicadReadinessReport',
        'KicadSchematicConnectivityQaBuilder',
        'KicadSchematicGeometryReadinessReportBuilder',
        'KicadSchematicGraphicParser',
        'KicadSchematicHierarchyGraphBuilder',
        'KicadSchematicOwnershipGraphBuilder',
        'KicadSchematicParser',
        'KicadSchematicQaReportBuilder',
        'KicadSchematicSymbolParser',
        'KicadSelectedPartExporter',
        'KicadSourceCoverageReportBuilder',
        'KicadSymbolLibraryParser',
        'KicadSvgModelCrossLinkValidator',
        'KicadToolkitCapabilities',
        'KicadWorksheetParser',
        'NormalizedModelSchema',
        'ProjectDesignBundleBuilder',
        'ProjectNetlistExporter',
        'ProjectVariantViewBuilder',
        'SExpressionParser',
        'SExpressionSchema',
        'SExpressionSerializer',
        'SExpressionTree',
        'SchematicProjectParameterResolver',
        'SelectedPartKicadExportAdapter',
        'SelectedPartKicadModelNodeBuilder'
    ])
    assertPublicApi(nodeApi, ['KicadCliVisualSnapshotHarness'])
    assertPublicApi(rendererApi, [
        'BomTableRenderer',
        'KicadStrokeFont',
        'KicadSvgUtils',
        'PcbArcUtils',
        'PcbEdgeFacingGlyphNormalizer',
        'KicadPcbRenderOutlineAdapter',
        'PcbFootprintPadAxisNormalizer',
        'PcbFootprintPrimitiveSelector',
        'PcbInteractionIndex',
        'PcbInteractionItemRegistry',
        'PcbInteractionLayerModel',
        'PcbSideResolvedRenderModel',
        'PcbSvgSemanticMetadata',
        'PcbSvgRenderer',
        'SchematicRenderOpsSidecarBuilder',
        'SchematicColorResolver',
        'SchematicContentLayout',
        'SchematicOwnerPinLabelLayout',
        'SchematicProjectParameterResolver',
        'SchematicSvgUtils',
        'SchematicSvgSemanticMetadata',
        'SchematicSvgRenderer',
        'SchematicSvgTextMetrics',
        'SchematicTypography',
        'isCopperPrimitive',
        'preparePcbSideResolvedRenderModel'
    ])
    assertPublicApi(scene3dApi, [
        'KicadScene3dBoardOutlineAdapter',
        'KicadScene3dCopperLayerAdapter',
        'KicadScene3dCopperTrackCutoutBuilder',
        'KicadScene3dModelRegistryAdapter',
        'KicadScene3dPadShapeAdapter',
        'KicadScene3dSilkscreenKeepoutAdapter',
        'KicadScene3dSilkscreenSmoothingAdapter',
        'KicadScene3dWrlUnitScaleAdapter',
        'PcbScene3dBuilder',
        'PcbScene3dModelRegistry',
        'PcbScene3dPackages',
        'PcbScene3dScenePreparator',
        'PcbScene3dSummaryRenderer',
        'PcbScene3dTextBoxLayoutResolver'
    ])

    for (const exportName of Object.keys(parserApi)) {
        assert.equal(packageApi[exportName], parserApi[exportName])
    }

    for (const exportName of Object.keys(rendererApi)) {
        assert.equal(packageApi[exportName], rendererApi[exportName])
    }

    for (const exportName of Object.keys(scene3dApi)) {
        assert.equal(packageApi[exportName], scene3dApi[exportName])
    }
})

test('package keeps KiCad parser internals in a format-specific core folder', async () => {
    await assertFileExists('../src/core/kicad/Geometry.mjs')
    await assertFileExists('../src/core/kicad/KicadAuxiliaryParserRouter.mjs')
    await assertFileExists('../src/core/kicad/KicadArcGeometry.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadDesignBlockLibraryParser.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadDesignRulesParser.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadEmbeddedAssetInventoryBuilder.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadCiArtifactBundleBuilder.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadContractGateReportBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadFootprintAssociationParser.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadFootprintLibraryParser.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadFootprintLibraryParityReportBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadHostCapabilityDiagnosticsBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadImagePayloadManifestBuilder.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadJobsetDigestBuilder.mjs')
    await assertFileExists('../src/core/kicad/KicadJobsetParser.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadCliVisualSnapshotHarness.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadParser.mjs')
    await assertFileExists('../src/core/kicad/KicadLayerResolver.mjs')
    await assertFileExists('../src/core/kicad/KicadLegacyLibraryParser.mjs')
    await assertFileExists('../src/core/kicad/KicadLibraryIndexBuilder.mjs')
    await assertFileExists('../src/core/kicad/KicadLibraryQaReportBuilder.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadLibraryRenderManifestBuilder.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadLibrarySearchIndex.mjs')
    await assertFileExists('../src/core/kicad/KicadLibraryTableParser.mjs')
    await assertFileExists('../src/core/kicad/KicadNetResolver.mjs')
    await assertFileExists('../src/core/kicad/KicadNetlistParser.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadParserCompatibilityFuzzer.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadPcbDimensionReadModelBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadPcb3dModelReadinessReportBuilder.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadPcbDrawingParser.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadPcbFidelityDiagnosticsBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadPcbGeometryReadinessReportBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadPcbLayerUsageReportBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadPcbLayerStackReadModelBuilder.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadPcbLayerMetadata.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadPcbComponentParticipationPolicy.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadPcbReviewDrillMetadataBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadPcbReviewPolygonRealizationBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadPcbReviewRouteHighlightProfileBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadPcbOwnershipGraphBuilder.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadPcbPadParser.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadPcbPickPlacePositionResolver.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadPcbPlacedFootprintManifestBuilder.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadPcbParser.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadPcbRegionSemanticsBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadPcbReviewMetadataBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadPcbRigidFlexTopologyBuilder.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadPcbRuleReadModelBuilder.mjs')
    await assertFileExists('../src/core/kicad/KicadPcbRouteAnalysisBuilder.mjs')
    await assertFileExists('../src/core/kicad/KicadPcbStatisticsBuilder.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadProjectDocumentGraphBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadProjectBomPnpReconciliationBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadProjectOutputDigestBuilder.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadProjectMetadataParser.mjs')
    await assertFileExists('../src/core/kicad/KicadProjectLoader.mjs')
    await assertFileExists('../src/core/kicad/KicadReadinessReport.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadSchematicConnectivityQaBuilder.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadSchematicGraphicParser.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadSchematicHierarchyGraphBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadSchematicOwnershipGraphBuilder.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadSchematicParser.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadSchematicQaReportBuilder.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadSchematicSymbolParser.mjs')
    await assertFileExists('../src/core/kicad/KicadSelectedPartExporter.mjs')
    await assertFileExists(
        '../src/core/kicad/SelectedPartKicadExportAdapter.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/SelectedPartKicadModelNodeBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/CircuitJsonKicadLibraryExporter.mjs'
    )
    await assertFileExists('../src/core/kicad/CircuitJsonKicadModExporter.mjs')
    await assertFileExists(
        '../src/core/kicad/CircuitJsonKicadProjectExporter.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/CircuitJsonKicadProjectPcbArtworkBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/CircuitJsonKicadProjectPcbBoardGeometryBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/CircuitJsonKicadProjectModelResolver.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/CircuitJsonKicadProjectSchematicArcBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/CircuitJsonKicadProjectSchematicSymbolBuilder.mjs'
    )
    await assertFileExists(
        '../src/core/kicad/KicadSourceCoverageReportBuilder.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadSymbolLibraryParser.mjs')
    await assertFileExists(
        '../src/core/kicad/KicadSvgModelCrossLinkValidator.mjs'
    )
    await assertFileExists('../src/core/kicad/KicadToolkitCapabilities.mjs')
    await assertFileExists('../src/core/kicad/KicadWorksheetParser.mjs')
    await assertFileExists('../src/core/kicad/NormalizedModelSchema.mjs')
    await assertFileExists('../src/core/kicad/ProjectDesignBundleBuilder.mjs')
    await assertFileExists('../src/core/kicad/ProjectNetlistExporter.mjs')
    await assertFileExists('../src/core/kicad/ProjectVariantViewBuilder.mjs')
    await assertFileExists('../src/core/kicad/SExpressionParser.mjs')
    await assertFileExists('../src/core/kicad/SExpressionSchema.mjs')
    await assertFileExists('../src/core/kicad/SExpressionSerializer.mjs')
    await assertFileExists('../src/core/kicad/SExpressionTree.mjs')
    await assertFileExists(
        '../src/core/circuit-json/CircuitJsonConformanceChecker.mjs'
    )
    await assertFileExists(
        '../src/core/circuit-json/CircuitJsonModelAdapter.mjs'
    )
    await assertFileExists(
        '../src/core/circuit-json/CircuitJsonModelSchema.mjs'
    )
    await assertFileExists('../src/ui/PcbEdgeFacingGlyphNormalizer.mjs')
    await assertFileExists('../src/PcbScene3dTextBoxLayoutResolver.mjs')
    await assertFileExists('../src/ui/PcbSideResolvedRenderModel.mjs')
    await assertFileExists('../src/ui/SchematicRenderOpsSidecarBuilder.mjs')
    await assertFileExists('../src/ui/SchematicContentLayout.mjs')
    await assertFileExists('../src/ui/SchematicOwnerPinLabelLayout.mjs')
    await assertFileExists('../src/scene3d.mjs')
    await assertFileExists('../src/workers/kicad-parser.worker.mjs')
    await assertFileMissing('../src/ui/BadgeRenderer.mjs')
    await assertFileMissing('../src/ui/BadgeStyle.mjs')
    await assertFileMissing('../src/ui/ComponentHighlight.mjs')
    await assertFileMissing('../src/ui/RenderPalette.mjs')

    await assertFileMissing('../src/core/Geometry.mjs')
    await assertFileMissing('../src/core/KicadLayerResolver.mjs')
    await assertFileMissing('../src/core/KicadPcbParser.mjs')
    await assertFileMissing('../src/core/KicadProjectLoader.mjs')
    await assertFileMissing('../src/core/ProjectArchive.mjs')
    await assertFileMissing('../src/core/kicad/ProjectArchive.mjs')
    await assertFileMissing('../src/core/SExpressionParser.mjs')
    await assertFileMissing('../src/core/BadgeStyle.mjs')
    await assertFileMissing('../src/core/RenderPalette.mjs')
})

test('browser entrypoints do not load Node built-ins', async () => {
    const offenders = []

    for (const entrypoint of [
        '../src/index.mjs',
        '../src/parser.mjs',
        '../src/renderers.mjs',
        '../src/scene3d.mjs'
    ]) {
        offenders.push(...(await collectNodeBuiltinImports(entrypoint)))
    }

    assert.deepEqual(offenders, [])
})

/**
 * Asserts a module exposes exactly the expected named API.
 *
 * @param {Record<string, unknown>} api Module namespace to inspect.
 * @param {string[]} expectedNames Expected named exports.
 */
function assertPublicApi(api, expectedNames) {
    assert.deepEqual(Object.keys(api).sort(), expectedNames.sort())
}

/**
 * Asserts a package-relative file exists.
 *
 * @param {string} path Package-relative file path.
 */
async function assertFileExists(path) {
    await access(new URL(path, import.meta.url), constants.R_OK)
}

/**
 * Asserts a package-relative file is absent.
 *
 * @param {string} path Package-relative file path.
 */
async function assertFileMissing(path) {
    await assert.rejects(
        access(new URL(path, import.meta.url), constants.R_OK),
        { code: 'ENOENT' }
    )
}

/**
 * Collects local modules in one browser entrypoint graph that import Node
 * built-ins.
 * @param {string} entrypoint Test-relative entrypoint path.
 * @returns {Promise<string[]>}
 */
async function collectNodeBuiltinImports(entrypoint) {
    const visited = new Set()
    const offenders = []

    await visitBrowserModule(new URL(entrypoint, import.meta.url), {
        offenders,
        visited
    })

    return offenders
}

/**
 * Visits one browser-reachable module and its local static dependencies.
 * @param {URL} moduleUrl Module URL.
 * @param {{ offenders: string[], visited: Set<string> }} context Visit context.
 * @returns {Promise<void>}
 */
async function visitBrowserModule(moduleUrl, context) {
    const modulePath = moduleUrl.pathname
    if (context.visited.has(modulePath)) {
        return
    }
    context.visited.add(modulePath)

    const source = await readFile(moduleUrl, 'utf8')
    for (const specifier of extractStaticModuleSpecifiers(source)) {
        if (specifier.startsWith('node:')) {
            context.offenders.push(
                formatPackagePath(moduleUrl) + ' imports ' + specifier
            )
            continue
        }
        if (specifier.startsWith('./') || specifier.startsWith('../')) {
            await visitBrowserModule(new URL(specifier, moduleUrl), context)
        }
    }
}

/**
 * Extracts static import and re-export specifiers from a module.
 * @param {string} source JavaScript module source.
 * @returns {string[]}
 */
function extractStaticModuleSpecifiers(source) {
    return Array.from(
        source.matchAll(
            /\b(?:import|export)\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/gu
        ),
        (match) => match[1]
    )
}

/**
 * Formats a package-relative module path for assertion output.
 * @param {URL} moduleUrl Module URL.
 * @returns {string}
 */
function formatPackagePath(moduleUrl) {
    return moduleUrl.pathname.replace(/^.*\/kicad-toolkit\//u, '')
}
