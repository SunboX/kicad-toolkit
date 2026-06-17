// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import * as rootApi from '../src/index.mjs'
import * as parserApi from '../src/parser.mjs'
import * as rendererApi from '../src/renderers.mjs'
import * as scene3dApi from '../src/scene3d.mjs'

/**
 * Verifies the root entrypoint exposes parser and renderer APIs.
 */
test('root entrypoint exports parser and renderer classes', () => {
    assert.match(
        rootApi.NormalizedModelSchema.CURRENT_SCHEMA_ID,
        /^urn:kicad-toolkit:normalized-model:/
    )
    assert.equal(typeof rootApi.KicadArcGeometry.fromThreePoints, 'function')
    assert.equal(
        typeof rootApi.CircuitJsonModelAdapter.isCircuitJson,
        'function'
    )
    assert.equal(typeof rootApi.CircuitJsonModelSchema.attach, 'function')
    assert.equal(typeof rootApi.KicadToolkitCapabilities.inventory, 'function')
    assert.equal(typeof rootApi.KicadFeatureParity.inventory, 'function')
    assert.equal(typeof rootApi.KicadCiArtifactBundleBuilder.build, 'function')
    assert.equal(
        typeof rootApi.KicadContractGateReportBuilder.build,
        'function'
    )
    assert.equal(typeof rootApi.KicadDesignBlockLibraryParser.build, 'function')
    assert.equal(typeof rootApi.KicadDesignRulesParser.parse, 'function')
    assert.equal(
        typeof rootApi.KicadEmbeddedAssetInventoryBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadFootprintAssociationParser.parse,
        'function'
    )
    assert.equal(typeof rootApi.KicadReadinessReport.parseDrcReport, 'function')
    assert.equal(typeof rootApi.KicadNetResolver.fromNodes, 'function')
    assert.equal(typeof rootApi.KicadFootprintLibraryParser.parse, 'function')
    assert.equal(typeof rootApi.KicadJobsetDigestBuilder.build, 'function')
    assert.equal(typeof rootApi.KicadJobsetParser.parse, 'function')
    assert.equal(typeof rootApi.KicadLibraryIndexBuilder.build, 'function')
    assert.equal(
        typeof rootApi.KicadLibraryRenderManifestBuilder
            .buildPcbLibraryManifest,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadLibrarySearchIndex.searchPcbFootprints,
        'function'
    )
    assert.equal(typeof rootApi.KicadLibraryQaReportBuilder.build, 'function')
    assert.equal(typeof rootApi.KicadLibraryTableParser.parse, 'function')
    assert.equal(typeof rootApi.KicadLegacyLibraryParser.parse, 'function')
    assert.equal(typeof rootApi.KicadNetlistParser.parse, 'function')
    assert.equal(typeof rootApi.KicadParser.parseArrayBuffer, 'function')
    assert.equal(typeof rootApi.KicadParserCompatibilityFuzzer.run, 'function')
    assert.equal(
        typeof rootApi.KicadFootprintLibraryParityReportBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadHostCapabilityDiagnosticsBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadImagePayloadManifestBuilder.build,
        'function'
    )
    assert.equal(typeof rootApi.KicadPcbOwnershipGraphBuilder.build, 'function')
    assert.equal(
        typeof rootApi.KicadPcbDimensionReadModelBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadPcb3dModelReadinessReportBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadPcbFidelityDiagnosticsBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadPcbGeometryReadinessReportBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadPcbLayerStackReadModelBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadPcbLayerUsageReportBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadPcbRegionSemanticsBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadPcbRigidFlexTopologyBuilder.build,
        'function'
    )
    assert.equal(typeof rootApi.KicadPcbRuleReadModelBuilder.build, 'function')
    assert.equal(
        typeof rootApi.KicadPcbPickPlacePositionResolver.buildModel,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadPcbComponentParticipationPolicy.resolve,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadPcbPlacedFootprintManifestBuilder.build,
        'function'
    )
    assert.equal(typeof rootApi.KicadPcbReviewMetadataBuilder.build, 'function')
    assert.equal(typeof rootApi.KicadPcbRouteAnalysisBuilder.build, 'function')
    assert.equal(typeof rootApi.KicadPcbStatisticsBuilder.build, 'function')
    assert.equal(
        typeof rootApi.KicadPcbLayerMetadata.primitiveLayers,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadPcbDrawingParser.parseBoardItems,
        'function'
    )
    assert.equal(typeof rootApi.KicadPcbPadParser.parsePad, 'function')
    assert.equal(typeof rootApi.KicadPcbParser.parse, 'function')
    assert.equal(typeof rootApi.KicadProjectMetadataParser.parse, 'function')
    assert.equal(
        typeof rootApi.KicadProjectDocumentGraphBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadProjectBomPnpReconciliationBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadProjectOutputDigestBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadSchematicConnectivityQaBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadSchematicGeometryReadinessReportBuilder.build,
        'function'
    )
    assert.equal(typeof rootApi.KicadSchematicQaReportBuilder.build, 'function')
    assert.equal(
        typeof rootApi.KicadSchematicHierarchyGraphBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadSchematicOwnershipGraphBuilder.build,
        'function'
    )
    assert.equal(typeof rootApi.KicadSchematicGraphicParser.parse, 'function')
    assert.equal(typeof rootApi.KicadSchematicParser.parse, 'function')
    assert.equal(
        typeof rootApi.KicadSchematicSymbolParser.parsePins,
        'function'
    )
    assert.equal(
        typeof rootApi.KicadSourceCoverageReportBuilder.build,
        'function'
    )
    assert.equal(typeof rootApi.KicadProjectLoader.loadEntries, 'function')
    assert.equal(typeof rootApi.ProjectDesignBundleBuilder.build, 'function')
    assert.equal(
        typeof rootApi.ProjectNetlistExporter.buildWirelist,
        'function'
    )
    assert.equal(typeof rootApi.ProjectVariantViewBuilder.build, 'function')
    assert.equal(typeof rootApi.KicadSymbolLibraryParser.parse, 'function')
    assert.equal(typeof rootApi.KicadWorksheetParser.parse, 'function')
    assert.equal(typeof rootApi.SExpressionParser.parse, 'function')
    assert.equal(typeof rootApi.SExpressionParser.parseWithMetadata, 'function')
    assert.equal(typeof rootApi.SExpressionSchema.parse, 'function')
    assert.equal(typeof rootApi.SExpressionTree.child, 'function')
    assert.equal(typeof rootApi.SExpressionTree.describe, 'function')
    assert.equal(
        typeof rootApi.KicadSvgModelCrossLinkValidator.validate,
        'function'
    )
    assert.equal(typeof rootApi.BomTableRenderer.render, 'function')
    assert.equal(typeof rootApi.KicadSvgUtils.formatNumber, 'function')
    assert.equal(typeof rootApi.PcbArcUtils.buildPath, 'function')
    assert.equal(
        typeof rootApi.PcbFootprintPrimitiveSelector.select,
        'function'
    )
    assert.equal(
        typeof rootApi.PcbEdgeFacingGlyphNormalizer.normalize,
        'function'
    )
    assert.equal(typeof rootApi.PcbSvgSemanticMetadata.schema, 'string')
    assert.equal(typeof rootApi.PcbSvgRenderer.render, 'function')
    assert.equal(typeof rootApi.PcbSideResolvedRenderModel.resolve, 'function')
    assert.equal(typeof rootApi.preparePcbSideResolvedRenderModel, 'function')
    assert.equal(typeof rootApi.isCopperPrimitive, 'function')
    assert.equal(
        typeof rootApi.SchematicProjectParameterResolver.resolveSchematic,
        'function'
    )
    assert.equal(
        typeof rootApi.SchematicRenderOpsSidecarBuilder.build,
        'function'
    )
    assert.equal(
        typeof rootApi.SchematicColorResolver.resolveInkColor,
        'function'
    )
    assert.equal(typeof rootApi.SchematicContentLayout.buildClipId, 'function')
    assert.equal(
        typeof rootApi.SchematicOwnerPinLabelLayout
            .resolveNativePinTextPlacement,
        'function'
    )
    assert.equal(typeof rootApi.SchematicSvgUtils.formatNumber, 'function')
    assert.equal(typeof rootApi.SchematicSvgSemanticMetadata.schema, 'string')
    assert.equal(typeof rootApi.SchematicSvgRenderer.render, 'function')
    assert.equal(typeof rootApi.SchematicSvgTextMetrics.textHeight, 'function')
    assert.equal(
        typeof rootApi.SchematicTypography.resolveViewerFontSize,
        'function'
    )
    assert.equal(typeof rootApi.PcbScene3dBuilder.build, 'function')
    assert.equal(typeof rootApi.PcbScene3dPackages.resolve, 'function')
    assert.equal(typeof rootApi.PcbScene3dScenePreparator.prepare, 'function')
    assert.equal(
        typeof rootApi.PcbScene3dTextBoxLayoutResolver.resolve,
        'function'
    )
    assert.equal(typeof rootApi.RenderPalette, 'undefined')
    assert.equal(typeof rootApi.BadgeStyle, 'undefined')
    assert.equal(typeof rootApi.BadgeRenderer, 'undefined')
    assert.equal(typeof rootApi.ComponentHighlight, 'undefined')
})

/**
 * Verifies specialized parser and renderer entrypoints stay separated.
 */
test('specialized entrypoints expose their intended API groups', () => {
    assert.equal(
        typeof parserApi.CircuitJsonModelAdapter.isCircuitJson,
        'function'
    )
    assert.equal(typeof parserApi.CircuitJsonModelSchema.attach, 'function')
    assert.equal(typeof parserApi.NormalizedModelSchema.attach, 'function')
    assert.equal(
        typeof parserApi.KicadToolkitCapabilities.inventory,
        'function'
    )
    assert.equal(typeof parserApi.KicadFeatureParity.inventory, 'function')
    assert.equal(
        typeof parserApi.KicadCiArtifactBundleBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadContractGateReportBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadDesignBlockLibraryParser.build,
        'function'
    )
    assert.equal(typeof parserApi.KicadDesignRulesParser.parse, 'function')
    assert.equal(
        typeof parserApi.KicadEmbeddedAssetInventoryBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadFootprintAssociationParser.parse,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadReadinessReport.fabricationReadiness,
        'function'
    )
    assert.equal(typeof parserApi.KicadParser.parseArrayBuffer, 'function')
    assert.equal(typeof parserApi.KicadFootprintLibraryParser.parse, 'function')
    assert.equal(
        typeof parserApi.KicadFootprintLibraryParityReportBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadHostCapabilityDiagnosticsBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadImagePayloadManifestBuilder.build,
        'function'
    )
    assert.equal(typeof parserApi.KicadJobsetDigestBuilder.build, 'function')
    assert.equal(typeof parserApi.KicadJobsetParser.parse, 'function')
    assert.equal(typeof parserApi.KicadLibraryIndexBuilder.build, 'function')
    assert.equal(
        typeof parserApi.KicadLibraryRenderManifestBuilder
            .buildSchematicLibraryManifest,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadLibrarySearchIndex.searchItems,
        'function'
    )
    assert.equal(typeof parserApi.KicadLibraryQaReportBuilder.build, 'function')
    assert.equal(typeof parserApi.KicadLibraryTableParser.parse, 'function')
    assert.equal(typeof parserApi.KicadLegacyLibraryParser.parse, 'function')
    assert.equal(typeof parserApi.KicadNetlistParser.parse, 'function')
    assert.equal(
        typeof parserApi.KicadPcbLayerMetadata.documentLayers,
        'function'
    )
    assert.equal(typeof parserApi.KicadPcbPadParser.parsePad, 'function')
    assert.equal(typeof parserApi.KicadPcbParser.parse, 'function')
    assert.equal(
        typeof parserApi.KicadParserCompatibilityFuzzer.run,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcbOwnershipGraphBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcbDimensionReadModelBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcbLayerStackReadModelBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcbLayerUsageReportBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcb3dModelReadinessReportBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcbFidelityDiagnosticsBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcbGeometryReadinessReportBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcbRegionSemanticsBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcbRigidFlexTopologyBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcbRuleReadModelBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcbPickPlacePositionResolver.buildModel,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcbComponentParticipationPolicy.resolve,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcbPlacedFootprintManifestBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcbReviewMetadataBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadPcbRouteAnalysisBuilder.build,
        'function'
    )
    assert.equal(typeof parserApi.KicadPcbStatisticsBuilder.build, 'function')
    assert.equal(
        typeof parserApi.KicadProjectDocumentGraphBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadProjectBomPnpReconciliationBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadProjectOutputDigestBuilder.build,
        'function'
    )
    assert.equal(typeof parserApi.KicadProjectMetadataParser.parse, 'function')
    assert.equal(
        typeof parserApi.KicadSchematicConnectivityQaBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadSchematicGeometryReadinessReportBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadSchematicQaReportBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.SchematicProjectParameterResolver.resolveSchematic,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadSchematicHierarchyGraphBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadSchematicOwnershipGraphBuilder.build,
        'function'
    )
    assert.equal(
        typeof parserApi.KicadSourceCoverageReportBuilder.build,
        'function'
    )
    assert.equal(typeof parserApi.KicadSchematicParser.parse, 'function')
    assert.equal(typeof parserApi.ProjectDesignBundleBuilder.build, 'function')
    assert.equal(
        typeof parserApi.ProjectNetlistExporter.buildNetlistJson,
        'function'
    )
    assert.equal(typeof parserApi.ProjectVariantViewBuilder.build, 'function')
    assert.equal(typeof parserApi.KicadSymbolLibraryParser.parse, 'function')
    assert.equal(
        typeof parserApi.SExpressionParser.parseWithMetadata,
        'function'
    )
    assert.equal(typeof parserApi.SExpressionSchema.parse, 'function')
    assert.equal(typeof parserApi.SExpressionTree.child, 'function')
    assert.equal(typeof parserApi.SExpressionTree.describe, 'function')
    assert.equal(
        typeof parserApi.KicadSvgModelCrossLinkValidator.validate,
        'function'
    )
    assert.equal(typeof parserApi.KicadWorksheetParser.parse, 'function')
    assert.equal(typeof parserApi.PcbSvgRenderer, 'undefined')
    assert.equal(typeof rendererApi.PcbSvgRenderer.render, 'function')
    assert.equal(typeof rendererApi.KicadSvgUtils.escapeHtml, 'function')
    assert.equal(typeof rendererApi.PcbArcUtils.resolveSweepDelta, 'function')
    assert.equal(
        typeof rendererApi.PcbFootprintPrimitiveSelector.select,
        'function'
    )
    assert.equal(
        typeof rendererApi.PcbEdgeFacingGlyphNormalizer.normalize,
        'function'
    )
    assert.equal(typeof rendererApi.PcbSvgSemanticMetadata.schema, 'string')
    assert.equal(typeof rendererApi.SchematicSvgRenderer.render, 'function')
    assert.equal(
        typeof rendererApi.SchematicColorResolver.resolveInkColor,
        'function'
    )
    assert.equal(
        typeof rendererApi.SchematicContentLayout.buildClipMarkup,
        'function'
    )
    assert.equal(
        typeof rendererApi.SchematicOwnerPinLabelLayout.buildOwnerPinLabelKey,
        'function'
    )
    assert.equal(
        typeof rendererApi.SchematicProjectParameterResolver.resolveSchematic,
        'function'
    )
    assert.equal(
        typeof rendererApi.SchematicRenderOpsSidecarBuilder.build,
        'function'
    )
    assert.equal(typeof rendererApi.SchematicSvgUtils.escapeHtml, 'function')
    assert.equal(
        typeof rendererApi.SchematicSvgSemanticMetadata.schema,
        'string'
    )
    assert.equal(
        typeof rendererApi.SchematicSvgTextMetrics.textLineSpacing,
        'function'
    )
    assert.equal(
        typeof rendererApi.SchematicTypography.resolveViewerFontSize,
        'function'
    )
    assert.equal(typeof rendererApi.BomTableRenderer.render, 'function')
    assert.equal(
        typeof rendererApi.PcbSideResolvedRenderModel.resolve,
        'function'
    )
    assert.equal(
        typeof rendererApi.preparePcbSideResolvedRenderModel,
        'function'
    )
    assert.equal(typeof rendererApi.isCopperPrimitive, 'function')
    assert.equal(typeof rendererApi.KicadPcbParser, 'undefined')
    assert.equal(typeof scene3dApi.PcbScene3dBuilder.build, 'function')
    assert.equal(typeof scene3dApi.PcbScene3dPackages.resolve, 'function')
    assert.equal(
        typeof scene3dApi.PcbScene3dTextBoxLayoutResolver.resolve,
        'function'
    )
    assert.equal(typeof scene3dApi.PcbSvgRenderer, 'undefined')
    assert.deepEqual(
        ['BadgeRenderer', 'BadgeStyle', 'ComponentHighlight', 'RenderPalette']
            .map((name) => rendererApi[name])
            .filter(Boolean),
        []
    )
})
