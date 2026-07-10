// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const TOOLKITS = [
    'altium-toolkit',
    'circuitjson-toolkit',
    'gerber-toolkit',
    'kicad-toolkit'
]

/**
 * Creates one audited shared-contract mapping.
 * @param {string} capabilityId Current capability id.
 * @param {string} replacement Canonical replacement.
 * @returns {Readonly<Record<string, any>>} Frozen mapping.
 */
function shared(capabilityId, replacement) {
    return mapping(
        capabilityId,
        'shared',
        replacement,
        'This behavior converges on the named common CircuitJSON contract.'
    )
}

/**
 * Creates one audited KiCad-native extension mapping.
 * @param {string} capabilityId Current capability id.
 * @param {string} owner Native owner or feature id.
 * @returns {Readonly<Record<string, any>>} Frozen mapping.
 */
function native(capabilityId, owner) {
    return mapping(
        capabilityId,
        'native-extension',
        `kicad-toolkit/extensions#${owner}`,
        'This behavior preserves source-native KiCad syntax or fidelity behind an explicit extension.'
    )
}

/**
 * Creates a complete immutable preservation mapping.
 * @param {string} capabilityId Capability id.
 * @param {'shared' | 'native-extension'} disposition Preservation disposition.
 * @param {string} replacement Replacement contract.
 * @param {string} reason Audited rationale.
 * @returns {Readonly<Record<string, any>>} Frozen mapping.
 */
function mapping(capabilityId, disposition, replacement, reason) {
    const availability = Object.fromEntries(
        TOOLKITS.map((toolkit) => [
            toolkit,
            disposition === 'shared'
                ? toolkit === 'circuitjson-toolkit'
                    ? 'shared'
                    : 'derived'
                : toolkit === 'kicad-toolkit'
                  ? 'native'
                  : 'unavailable'
        ])
    )
    return Object.freeze({
        capabilityId,
        disposition,
        replacement,
        availability: Object.freeze(availability),
        reason
    })
}

const OWNER_MAPPINGS = Object.freeze({
    BomTableRenderer: shared(
        'bom_table_renderer',
        'circuitjson-toolkit/renderers#BomTableRenderer'
    ),
    CircuitJsonConformanceChecker: shared(
        'circuit_json_adapter',
        'circuitjson-toolkit#CircuitJsonDocument'
    ),
    CircuitJsonKicadLibraryExporter: native(
        'circuit_json_adapter',
        'CircuitJsonKicadLibraryExporter'
    ),
    CircuitJsonKicadModExporter: native(
        'circuit_json_adapter',
        'CircuitJsonKicadModExporter'
    ),
    CircuitJsonKicadProjectExporter: native(
        'circuit_json_adapter',
        'CircuitJsonKicadProjectExporter'
    ),
    CircuitJsonKicadProjectModelResolver: native(
        'circuit_json_adapter',
        'CircuitJsonKicadProjectModelResolver'
    ),
    CircuitJsonModelAdapter: shared(
        'circuit_json_adapter',
        'circuitjson-toolkit#CircuitJsonDocument'
    ),
    CircuitJsonModelSchema: shared(
        'circuit_json_adapter',
        'circuitjson-toolkit#CircuitJsonDocument'
    ),
    CircuitTraversal: shared(
        'project_netlist_exporter',
        'circuitjson-toolkit/query#QueryService'
    ),
    ComponentGrouping: shared(
        'project_netlist_exporter',
        'circuitjson-toolkit/query#QueryService'
    ),
    Geometry: shared('geometry_helpers', 'circuitjson-toolkit#Geometry'),
    KicadArcGeometry: native('geometry_helpers', 'KicadArcGeometry'),
    KicadCiArtifactBundleBuilder: native(
        'ci_artifact_bundle',
        'KicadCiArtifactBundleBuilder'
    ),
    KicadCliVisualSnapshotHarness: native(
        'kicad_library_render_manifest_builder',
        'KicadCliVisualSnapshotHarness'
    ),
    KicadContractGateReportBuilder: native(
        'contract_gate_report',
        'KicadContractGateReportBuilder'
    ),
    KicadDesignBlockLibraryParser: native(
        'kicad_design_block_library_parser',
        'KicadDesignBlockLibraryParser'
    ),
    KicadDesignRulesParser: native(
        'kicad_design_rules_parser',
        'KicadDesignRulesParser'
    ),
    KicadEmbeddedAssetInventoryBuilder: native(
        'kicad_asset_inventory_builder',
        'KicadEmbeddedAssetInventoryBuilder'
    ),
    KicadFeatureParity: native('helper_contract_schemas', 'KicadFeatureParity'),
    KicadFootprintAssociationParser: native(
        'kicad_footprint_association_parser',
        'KicadFootprintAssociationParser'
    ),
    KicadFootprintLibraryParityReportBuilder: native(
        'footprint_library_parity_report',
        'KicadFootprintLibraryParityReportBuilder'
    ),
    KicadFootprintLibraryParser: native(
        'kicad_footprint_library_parser',
        'KicadFootprintLibraryParser'
    ),
    KicadHostCapabilityDiagnosticsBuilder: native(
        'host_capability_diagnostics',
        'KicadHostCapabilityDiagnosticsBuilder'
    ),
    KicadImagePayloadManifestBuilder: native(
        'image_payload_manifest',
        'KicadImagePayloadManifestBuilder'
    ),
    KicadJobsetDigestBuilder: native(
        'kicad_jobset_digest_builder',
        'KicadJobsetDigestBuilder'
    ),
    KicadJobsetParser: native('kicad_jobset_parser', 'KicadJobsetParser'),
    KicadLayerResolver: native('layer_metadata', 'KicadLayerResolver'),
    KicadLegacyLibraryParser: native(
        'kicad_legacy_library_parser',
        'KicadLegacyLibraryParser'
    ),
    KicadLibraryIndexBuilder: native(
        'kicad_library_index_builder',
        'KicadLibraryIndexBuilder'
    ),
    KicadLibraryQaReportBuilder: native(
        'library_qa_report',
        'KicadLibraryQaReportBuilder'
    ),
    KicadLibraryRenderManifestBuilder: native(
        'kicad_library_render_manifest_builder',
        'KicadLibraryRenderManifestBuilder'
    ),
    KicadLibrarySearchIndex: native(
        'kicad_library_search_index',
        'KicadLibrarySearchIndex'
    ),
    KicadLibraryTableParser: native(
        'kicad_library_table_parser',
        'KicadLibraryTableParser'
    ),
    KicadNetResolver: native('net_resolution', 'KicadNetResolver'),
    KicadNetlistParser: native('kicad_netlist_parser', 'KicadNetlistParser'),
    KicadParser: shared(
        'circuit_json_adapter',
        'circuitjson-toolkit/parser#Parser'
    ),
    KicadParserCompatibilityFuzzer: native(
        'parser_compatibility_fuzzer',
        'KicadParserCompatibilityFuzzer'
    ),
    KicadPcb3dModelReadinessReportBuilder: native(
        'pcb_3d_model_readiness',
        'KicadPcb3dModelReadinessReportBuilder'
    ),
    KicadPcbComponentParticipationPolicy: native(
        'pcb_component_participation_policy',
        'KicadPcbComponentParticipationPolicy'
    ),
    KicadPcbDimensionReadModelBuilder: native(
        'pcb_dimension_read_model',
        'KicadPcbDimensionReadModelBuilder'
    ),
    KicadPcbDrawingParser: native('kicad_pcb_parser', 'KicadPcbDrawingParser'),
    KicadPcbFidelityDiagnosticsBuilder: native(
        'pcb_fidelity_diagnostics',
        'KicadPcbFidelityDiagnosticsBuilder'
    ),
    KicadPcbGeometryReadinessReportBuilder: native(
        'pcb_geometry_readiness',
        'KicadPcbGeometryReadinessReportBuilder'
    ),
    KicadPcbLayerMetadata: native('layer_metadata', 'KicadPcbLayerMetadata'),
    KicadPcbLayerStackReadModelBuilder: native(
        'pcb_layer_stack_read_model',
        'KicadPcbLayerStackReadModelBuilder'
    ),
    KicadPcbLayerUsageReportBuilder: native(
        'pcb_layer_usage_report',
        'KicadPcbLayerUsageReportBuilder'
    ),
    KicadPcbOwnershipGraphBuilder: native(
        'pcb_ownership_graph',
        'KicadPcbOwnershipGraphBuilder'
    ),
    KicadPcbPadParser: native('kicad_pcb_parser', 'KicadPcbPadParser'),
    KicadPcbParser: native('kicad_pcb_parser', 'KicadPcbParser'),
    KicadPcbPickPlacePositionResolver: native(
        'pcb_pick_place_position_resolver',
        'KicadPcbPickPlacePositionResolver'
    ),
    KicadPcbPlacedFootprintManifestBuilder: native(
        'pcb_placed_footprint_manifest',
        'KicadPcbPlacedFootprintManifestBuilder'
    ),
    KicadPcbRegionSemanticsBuilder: native(
        'pcb_region_semantics',
        'KicadPcbRegionSemanticsBuilder'
    ),
    KicadPcbRenderOutlineAdapter: native(
        'renderer_helper_api',
        'KicadPcbRenderOutlineAdapter'
    ),
    KicadPcbReviewMetadataBuilder: native(
        'pcb_review_metadata',
        'KicadPcbReviewMetadataBuilder'
    ),
    KicadPcbRigidFlexTopologyBuilder: native(
        'pcb_rigid_flex_topology',
        'KicadPcbRigidFlexTopologyBuilder'
    ),
    KicadPcbRouteAnalysisBuilder: native(
        'pcb_route_analysis',
        'KicadPcbRouteAnalysisBuilder'
    ),
    KicadPcbRuleReadModelBuilder: native(
        'pcb_rule_read_model',
        'KicadPcbRuleReadModelBuilder'
    ),
    KicadPcbStatisticsBuilder: native(
        'pcb_statistics',
        'KicadPcbStatisticsBuilder'
    ),
    KicadPcmPackageQaReportBuilder: native(
        'pcm_package_qa_report',
        'KicadPcmPackageQaReportBuilder'
    ),
    KicadPcmRepositoryIndexBuilder: native(
        'pcm_repository_index_builder',
        'KicadPcmRepositoryIndexBuilder'
    ),
    KicadProjectBomPnpReconciliationBuilder: native(
        'project_bom_pnp_reconciliation',
        'KicadProjectBomPnpReconciliationBuilder'
    ),
    KicadProjectDocumentGraphBuilder: native(
        'project_document_graph',
        'KicadProjectDocumentGraphBuilder'
    ),
    KicadProjectLoader: shared(
        'project_zip_loader',
        'circuitjson-toolkit/project#ProjectLoader'
    ),
    KicadProjectMetadataParser: native(
        'project_metadata_parser',
        'KicadProjectMetadataParser'
    ),
    KicadProjectOutputDigestBuilder: native(
        'project_output_digest',
        'KicadProjectOutputDigestBuilder'
    ),
    KicadReadinessReport: native(
        'kicad_readiness_report',
        'KicadReadinessReport'
    ),
    KicadScene3dBoardOutlineAdapter: native(
        'pcb_scene3d_description',
        'KicadScene3dBoardOutlineAdapter'
    ),
    KicadScene3dCopperLayerAdapter: native(
        'pcb_scene3d_description',
        'KicadScene3dCopperLayerAdapter'
    ),
    KicadScene3dCopperTrackCutoutBuilder: native(
        'pcb_scene3d_description',
        'KicadScene3dCopperTrackCutoutBuilder'
    ),
    KicadScene3dModelRegistryAdapter: native(
        'pcb_scene3d_description',
        'KicadScene3dModelRegistryAdapter'
    ),
    KicadScene3dPadShapeAdapter: native(
        'pcb_scene3d_description',
        'KicadScene3dPadShapeAdapter'
    ),
    KicadScene3dSilkscreenKeepoutAdapter: native(
        'pcb_scene3d_description',
        'KicadScene3dSilkscreenKeepoutAdapter'
    ),
    KicadScene3dSilkscreenSmoothingAdapter: native(
        'pcb_scene3d_description',
        'KicadScene3dSilkscreenSmoothingAdapter'
    ),
    KicadScene3dWrlUnitScaleAdapter: native(
        'pcb_scene3d_description',
        'KicadScene3dWrlUnitScaleAdapter'
    ),
    KicadSchematicConnectivityQaBuilder: native(
        'kicad_schematic_connectivity_qa',
        'KicadSchematicConnectivityQaBuilder'
    ),
    KicadSchematicGeometryReadinessReportBuilder: native(
        'schematic_geometry_readiness',
        'KicadSchematicGeometryReadinessReportBuilder'
    ),
    KicadSchematicGraphicParser: native(
        'kicad_schematic_parser',
        'KicadSchematicGraphicParser'
    ),
    KicadSchematicHierarchyGraphBuilder: native(
        'schematic_hierarchy_graph',
        'KicadSchematicHierarchyGraphBuilder'
    ),
    KicadSchematicOwnershipGraphBuilder: native(
        'schematic_ownership_graph',
        'KicadSchematicOwnershipGraphBuilder'
    ),
    KicadSchematicParser: native(
        'kicad_schematic_parser',
        'KicadSchematicParser'
    ),
    KicadSchematicQaReportBuilder: native(
        'schematic_document_qa',
        'KicadSchematicQaReportBuilder'
    ),
    KicadSchematicSymbolParser: native(
        'kicad_symbol_library_parser',
        'KicadSchematicSymbolParser'
    ),
    KicadSelectedPartExporter: native(
        'kicad_footprint_library_parser',
        'KicadSelectedPartExporter'
    ),
    KicadSemanticDiffReportBuilder: native(
        'kicad_semantic_diff_report',
        'KicadSemanticDiffReportBuilder'
    ),
    KicadSourceCoverageReportBuilder: native(
        'source_coverage_report',
        'KicadSourceCoverageReportBuilder'
    ),
    KicadStrokeFont: native('renderer_helper_api', 'KicadStrokeFont'),
    KicadSvgModelCrossLinkValidator: native(
        'svg_model_cross_link_validator',
        'KicadSvgModelCrossLinkValidator'
    ),
    KicadSvgUtils: native('renderer_helper_api', 'KicadSvgUtils'),
    KicadSymbolLibraryParser: native(
        'kicad_symbol_library_parser',
        'KicadSymbolLibraryParser'
    ),
    KicadToolkitCapabilities: shared(
        'helper_contract_schemas',
        'circuitjson-toolkit/capabilities#ToolkitCapabilities'
    ),
    KicadWorksheetParser: native(
        'kicad_worksheet_parser',
        'KicadWorksheetParser'
    ),
    LoadedDesignNetlistService: shared(
        'project_netlist_exporter',
        'circuitjson-toolkit/query#QueryService'
    ),
    MPN_MISSING_NOTE: shared(
        'project_netlist_exporter',
        'circuitjson-toolkit/query#QueryService'
    ),
    NormalizedModelSchema: shared(
        'circuit_json_adapter',
        'circuitjson-toolkit#CircuitJsonDocument'
    ),
    PcbArcUtils: native('geometry_helpers', 'PcbArcUtils'),
    PcbEdgeFacingGlyphNormalizer: native(
        'renderer_helper_api',
        'PcbEdgeFacingGlyphNormalizer'
    ),
    PcbFootprintPadAxisNormalizer: native(
        'pcb_placed_footprint_manifest',
        'PcbFootprintPadAxisNormalizer'
    ),
    PcbFootprintPrimitiveSelector: native(
        'pcb_placed_footprint_manifest',
        'PcbFootprintPrimitiveSelector'
    ),
    PcbInteractionIndex: shared(
        'geometry_helpers',
        'circuitjson-toolkit/interaction#PcbInteractionIndex'
    ),
    PcbInteractionItemRegistry: shared(
        'geometry_helpers',
        'circuitjson-toolkit/interaction#PcbInteractionIndex'
    ),
    PcbInteractionLayerModel: shared(
        'layer_metadata',
        'circuitjson-toolkit/interaction#PcbInteractionIndex'
    ),
    PcbScene3dBuilder: shared(
        'pcb_scene3d_description',
        'circuitjson-toolkit/scene3d#PcbScene3dBuilder'
    ),
    PcbScene3dModelRegistry: shared(
        'pcb_scene3d_description',
        'circuitjson-toolkit/scene3d#PcbScene3dModelRegistry'
    ),
    PcbScene3dPackages: shared(
        'pcb_scene3d_description',
        'circuitjson-toolkit/scene3d#PcbScene3dPackages'
    ),
    PcbScene3dScenePreparator: shared(
        'pcb_scene3d_description',
        'circuitjson-toolkit/scene3d#PcbScene3dPreparator'
    ),
    PcbScene3dSummaryRenderer: shared(
        'pcb_scene3d_description',
        'circuitjson-toolkit/scene3d#PcbScene3dSummaryRenderer'
    ),
    PcbScene3dTextBoxLayoutResolver: native(
        'pcb_scene3d_textbox_layout',
        'PcbScene3dTextBoxLayoutResolver'
    ),
    PcbSideResolvedRenderModel: shared(
        'pcb_svg_renderer',
        'circuitjson-toolkit/renderers#PcbSvgRenderer'
    ),
    PcbSvgRenderer: shared(
        'pcb_svg_renderer',
        'circuitjson-toolkit/renderers#PcbSvgRenderer'
    ),
    PcbSvgSemanticMetadata: shared(
        'semantic_svg_metadata',
        'circuitjson-toolkit/renderers#PcbSvgSemanticMetadata'
    ),
    ProjectDesignBundleBuilder: native(
        'project_design_bundle',
        'ProjectDesignBundleBuilder'
    ),
    ProjectNetlistExporter: shared(
        'project_netlist_exporter',
        'circuitjson-toolkit/query#QueryService'
    ),
    ProjectVariantViewBuilder: native(
        'kicad_library_index_builder',
        'ProjectVariantViewBuilder'
    ),
    QueryNetlistBuilder: shared(
        'project_netlist_exporter',
        'circuitjson-toolkit/query#QueryService'
    ),
    RegexPattern: shared(
        'project_netlist_exporter',
        'circuitjson-toolkit/query#QueryService'
    ),
    SExpressionParser: native('s_expression_parser', 'SExpressionParser'),
    SExpressionSchema: native('s_expression_parser', 'SExpressionSchema'),
    SExpressionSerializer: native(
        's_expression_parser',
        'SExpressionSerializer'
    ),
    SExpressionTree: native('s_expression_parser', 'SExpressionTree'),
    SchematicColorResolver: native(
        'renderer_helper_api',
        'SchematicColorResolver'
    ),
    SchematicContentLayout: native(
        'renderer_helper_api',
        'SchematicContentLayout'
    ),
    SchematicOwnerPinLabelLayout: native(
        'schematic_render_ops_sidecar',
        'SchematicOwnerPinLabelLayout'
    ),
    SchematicProjectParameterResolver: native(
        'renderer_helper_api',
        'SchematicProjectParameterResolver'
    ),
    SchematicRenderOpsSidecarBuilder: native(
        'schematic_render_ops_sidecar',
        'SchematicRenderOpsSidecarBuilder'
    ),
    SchematicSvgRenderer: shared(
        'schematic_svg_renderer',
        'circuitjson-toolkit/renderers#SchematicSvgRenderer'
    ),
    SchematicSvgSemanticMetadata: shared(
        'semantic_svg_metadata',
        'circuitjson-toolkit/renderers#SchematicSvgSemanticMetadata'
    ),
    SchematicSvgTextMetrics: shared(
        'renderer_helper_api',
        'circuitjson-toolkit/renderers#SchematicSvgTextMetrics'
    ),
    SchematicSvgUtils: shared(
        'renderer_helper_api',
        'circuitjson-toolkit/renderers#SchematicSvgUtils'
    ),
    SchematicTypography: native('renderer_helper_api', 'SchematicTypography'),
    SelectedPartKicadExportAdapter: native(
        'kicad_footprint_library_parser',
        'SelectedPartKicadExportAdapter'
    ),
    SelectedPartKicadModelNodeBuilder: native(
        'kicad_library_render_manifest_builder',
        'SelectedPartKicadModelNodeBuilder'
    ),
    isCopperPrimitive: native('renderer_helper_api', 'isCopperPrimitive'),
    preparePcbSideResolvedRenderModel: shared(
        'pcb_svg_renderer',
        'circuitjson-toolkit/renderers#PcbSvgRenderer'
    ),
    KicadParserWorker: shared(
        'circuit_json_adapter',
        'circuitjson-toolkit/workers/parser.worker.mjs'
    ),
    KicadRendererStyles: shared(
        'renderer_helper_api',
        'circuitjson-toolkit/styles/renderers.css'
    )
})

const SHARED_CAPABILITY_IDS = Object.freeze([
    'bom_table_renderer',
    'circuit_json_adapter',
    'contract_gate_report',
    'geometry_helpers',
    'helper_contract_schemas',
    'host_capability_diagnostics',
    'layer_metadata',
    'net_resolution',
    'pcb_layer_svg_exports',
    'pcb_scene3d_description',
    'pcb_svg_renderer',
    'project_netlist_exporter',
    'project_zip_loader',
    'renderer_helper_api',
    'schematic_svg_renderer',
    'semantic_svg_metadata'
])

const NATIVE_CAPABILITY_IDS = Object.freeze([
    'ci_artifact_bundle',
    'footprint_library_parity_report',
    'image_payload_manifest',
    'kicad_asset_inventory_builder',
    'kicad_design_block_library_parser',
    'kicad_design_rules_parser',
    'kicad_footprint_association_parser',
    'kicad_footprint_library_parser',
    'kicad_jobset_digest_builder',
    'kicad_jobset_parser',
    'kicad_legacy_library_parser',
    'kicad_library_index_builder',
    'kicad_library_render_manifest_builder',
    'kicad_library_search_index',
    'kicad_library_table_parser',
    'kicad_netlist_parser',
    'kicad_pcb_parser',
    'kicad_readiness_report',
    'kicad_report_normalization',
    'kicad_schematic_connectivity_qa',
    'kicad_schematic_parser',
    'kicad_semantic_diff_report',
    'kicad_symbol_library_parser',
    'kicad_worksheet_parser',
    'library_qa_report',
    'parser_compatibility_fuzzer',
    'pcb_3d_model_readiness',
    'pcb_component_participation_policy',
    'pcb_dimension_read_model',
    'pcb_fidelity_diagnostics',
    'pcb_geometry_readiness',
    'pcb_layer_stack_read_model',
    'pcb_layer_usage_report',
    'pcb_ownership_graph',
    'pcb_pick_place_position_resolver',
    'pcb_placed_footprint_manifest',
    'pcb_region_semantics',
    'pcb_review_metadata',
    'pcb_rigid_flex_topology',
    'pcb_route_analysis',
    'pcb_rule_read_model',
    'pcb_scene3d_textbox_layout',
    'pcb_statistics',
    'pcm_package_qa_report',
    'pcm_repository_index_builder',
    'project_bom_pnp_reconciliation',
    'project_design_bundle',
    'project_document_graph',
    'project_metadata_parser',
    'project_output_digest',
    'schematic_document_qa',
    'schematic_geometry_readiness',
    'schematic_hierarchy_graph',
    'schematic_ownership_graph',
    'schematic_render_ops_sidecar',
    'source_coverage_report',
    's_expression_parser',
    'svg_model_cross_link_validator'
])

const PARITY_CAPABILITY_IDS = Object.freeze({
    bom_table_rendering: 'bom_table_renderer',
    ci_artifact_bundle: 'ci_artifact_bundle',
    circuit_json_model_contract: 'circuit_json_adapter',
    contract_gate_report: 'contract_gate_report',
    diagnostics_and_readiness_reporting: 'kicad_readiness_report',
    documentation_and_tests: 'helper_contract_schemas',
    footprint_library_parity_report: 'footprint_library_parity_report',
    helper_contract_schemas: 'helper_contract_schemas',
    host_capability_diagnostics: 'host_capability_diagnostics',
    image_payload_manifest: 'image_payload_manifest',
    jobset_expected_artifacts: 'kicad_jobset_digest_builder',
    kicad_asset_inventory: 'kicad_asset_inventory_builder',
    kicad_jobset_digest: 'kicad_jobset_digest_builder',
    kicad_library_index: 'kicad_library_index_builder',
    kicad_library_render_manifests: 'kicad_library_render_manifest_builder',
    kicad_library_search_index: 'kicad_library_search_index',
    kicad_schematic_connectivity_qa: 'kicad_schematic_connectivity_qa',
    library_merge_plan: 'library_qa_report',
    library_qa_report: 'library_qa_report',
    loaded_design_netlist_query: 'project_netlist_exporter',
    normalized_schema_publication: 'circuit_json_adapter',
    parse_kicad_design_blocks: 'kicad_design_block_library_parser',
    parse_kicad_design_rules: 'kicad_design_rules_parser',
    parse_kicad_footprint_associations: 'kicad_footprint_association_parser',
    parse_kicad_footprint_library: 'kicad_footprint_library_parser',
    parse_kicad_jobset: 'kicad_jobset_parser',
    parse_kicad_legacy_libraries: 'kicad_legacy_library_parser',
    parse_kicad_library_tables: 'kicad_library_table_parser',
    parse_kicad_netlist: 'kicad_netlist_parser',
    parse_kicad_pcb: 'kicad_pcb_parser',
    parse_kicad_schematic: 'kicad_schematic_parser',
    parse_kicad_symbol_library: 'kicad_symbol_library_parser',
    parse_kicad_worksheet: 'kicad_worksheet_parser',
    parser_compatibility_fuzzer: 'parser_compatibility_fuzzer',
    parser_worker_entrypoint: 'circuit_json_adapter',
    pcb_3d_model_readiness: 'pcb_3d_model_readiness',
    pcb_component_participation_policy: 'pcb_component_participation_policy',
    pcb_dimension_read_model: 'pcb_dimension_read_model',
    pcb_fidelity_diagnostics: 'pcb_fidelity_diagnostics',
    pcb_geometry_readiness: 'pcb_geometry_readiness',
    pcb_layer_stack_read_model: 'pcb_layer_stack_read_model',
    pcb_layer_usage_report: 'pcb_layer_usage_report',
    pcb_ownership_graph: 'pcb_ownership_graph',
    pcb_pick_place_position_resolver: 'pcb_pick_place_position_resolver',
    pcb_placed_footprint_manifest: 'pcb_placed_footprint_manifest',
    pcb_region_semantics: 'pcb_region_semantics',
    pcb_review_metadata: 'pcb_review_metadata',
    pcb_rigid_flex_topology: 'pcb_rigid_flex_topology',
    pcb_route_analysis: 'pcb_route_analysis',
    pcb_rule_read_model: 'pcb_rule_read_model',
    pcb_scene3d_description: 'pcb_scene3d_description',
    pcb_scene3d_model_assets: 'pcb_3d_model_readiness',
    pcb_scene3d_textbox_layout: 'pcb_scene3d_textbox_layout',
    pcb_side_resolved_rendering: 'pcb_svg_renderer',
    pcb_statistics: 'pcb_statistics',
    pcb_svg_rendering: 'pcb_svg_renderer',
    project_bom_pnp_reconciliation: 'project_bom_pnp_reconciliation',
    project_design_bundle: 'project_design_bundle',
    project_document_graph: 'project_document_graph',
    project_metadata_parser: 'project_metadata_parser',
    project_netlist_export: 'project_netlist_exporter',
    project_output_digest: 'project_output_digest',
    project_zip_loading: 'project_zip_loader',
    raw_kicad_inspectability: 's_expression_parser',
    renderer_css_entrypoint: 'renderer_helper_api',
    renderer_helper_api: 'renderer_helper_api',
    schematic_document_qa: 'schematic_document_qa',
    schematic_geometry_readiness: 'schematic_geometry_readiness',
    schematic_hierarchy_graph: 'schematic_hierarchy_graph',
    schematic_ownership_graph: 'schematic_ownership_graph',
    schematic_render_ops_sidecar: 'schematic_render_ops_sidecar',
    schematic_svg_rendering: 'schematic_svg_renderer',
    semantic_svg_metadata: 'semantic_svg_metadata',
    source_coverage_report: 'source_coverage_report',
    svg_model_cross_link_validation: 'svg_model_cross_link_validator'
})

/**
 * Returns sorted missing and stale ids for one catalog.
 * @param {string[]} expected Live ids.
 * @param {string[]} cataloged Catalog ids.
 * @returns {{ missing: string[], stale: string[] }} Coverage differences.
 */
function coverage(expected, cataloged) {
    const expectedSet = new Set(expected)
    const catalogedSet = new Set(cataloged)
    return {
        missing: [...expectedSet].filter((id) => !catalogedSet.has(id)).sort(),
        stale: [...catalogedSet].filter((id) => !expectedSet.has(id)).sort()
    }
}

/**
 * Owns every audited baseline preservation decision.
 */
export class KicadBaselineMappingCatalog {
    /**
     * Returns one explicit public-owner mapping.
     * @param {string} owner Public owner.
     * @returns {Readonly<Record<string, any>>} Audited mapping.
     */
    static owner(owner) {
        return KicadBaselineMappingCatalog.#required(
            OWNER_MAPPINGS[owner],
            `owner ${owner}`
        )
    }

    /**
     * Returns one explicit capability-inventory mapping.
     * @param {string} capabilityId Capability id.
     * @returns {Readonly<Record<string, any>>} Audited mapping.
     */
    static capability(capabilityId) {
        if (SHARED_CAPABILITY_IDS.includes(capabilityId)) {
            return shared(
                capabilityId,
                `circuitjson-toolkit/capabilities#${capabilityId}`
            )
        }
        if (NATIVE_CAPABILITY_IDS.includes(capabilityId)) {
            return native(capabilityId, capabilityId)
        }
        throw new Error(`Missing audited capability mapping: ${capabilityId}`)
    }

    /**
     * Returns one explicit parity-feature mapping.
     * @param {string} parityId Parity feature id.
     * @returns {Readonly<Record<string, any>>} Audited mapping.
     */
    static parity(parityId) {
        const capabilityId = KicadBaselineMappingCatalog.#required(
            PARITY_CAPABILITY_IDS[parityId],
            `parity feature ${parityId}`
        )
        const capability = KicadBaselineMappingCatalog.capability(capabilityId)
        return capability.disposition === 'shared'
            ? shared(
                  capabilityId,
                  `circuitjson-toolkit/capabilities#${parityId}`
              )
            : native(capabilityId, parityId)
    }

    /**
     * Validates exact catalog coverage against the baseline source.
     * @param {{ owners: string[], capabilityIds: string[], parityIds: string[] }} inventory Live inventory ids.
     * @returns {void}
     */
    static assertComplete(inventory) {
        const capabilityCatalog = [
            ...SHARED_CAPABILITY_IDS,
            ...NATIVE_CAPABILITY_IDS
        ]
        const groups = [
            ['owner', coverage(inventory.owners, Object.keys(OWNER_MAPPINGS))],
            [
                'capability',
                coverage(inventory.capabilityIds, capabilityCatalog)
            ],
            [
                'parity feature',
                coverage(
                    inventory.parityIds,
                    Object.keys(PARITY_CAPABILITY_IDS)
                )
            ]
        ]
        for (const [label, differences] of groups) {
            if (differences.missing.length || differences.stale.length) {
                throw new Error(
                    `Audited ${label} catalog differs; missing=[${differences.missing.join(', ')}], stale=[${differences.stale.join(', ')}]`
                )
            }
        }
    }

    /**
     * Requires one catalog value.
     * @param {unknown} value Catalog value.
     * @param {string} label Error label.
     * @returns {any} Present value.
     */
    static #required(value, label) {
        if (value === undefined) {
            throw new Error(`Missing audited mapping for ${label}`)
        }
        return value
    }
}
