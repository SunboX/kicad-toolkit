// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Additional adapted parity feature records kept outside the main inventory
 * module so the static inventory stays below the source line limit.
 */
export const additionalFeatureParityRecords = Object.freeze([
    {
        id: 'pcb_pick_place_position_resolver',
        label: 'KiCad PCB pick-place position resolver',
        category: 'project_loading',
        kicadNative: false,
        altiumCapability:
            'Expose component-origin and pad-anchor pick-and-place coordinate views.',
        kicadCapability:
            'Expose KiCad footprint-origin and pad-anchor-center pick-and-place coordinate views.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#pcb-fields'],
        tests: ['tests/core/kicad-pcb-read-model-helpers.test.mjs'],
        summary:
            'KicadPcbPickPlacePositionResolver builds deterministic PnP rows from components and pads.'
    },
    {
        id: 'schematic_hierarchy_graph',
        label: 'KiCad schematic hierarchy graph',
        category: 'project_loading',
        kicadNative: false,
        altiumCapability:
            'Build a read-only schematic hierarchy graph from project documents.',
        kicadCapability:
            'Build a read-only KiCad schematic hierarchy graph from project pages and hierarchical sheet symbols.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#project-loading-fields'
        ],
        tests: ['tests/core/kicad-pcb-read-model-helpers.test.mjs'],
        summary:
            'KicadSchematicHierarchyGraphBuilder indexes root and child schematic sheets without loading files.'
    },
    {
        id: 'jobset_expected_artifacts',
        label: 'KiCad jobset expected artifacts',
        category: 'project_loading',
        kicadNative: false,
        altiumCapability:
            'Build expected artifact manifests from output-job rows.',
        kicadCapability:
            'Build expected artifact manifests from KiCad jobset jobs and output destinations.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#auxiliary-fields'],
        tests: ['tests/core/kicad-parity-helper-apis.test.mjs'],
        summary:
            'KicadJobsetDigestBuilder emits expected artifact rows with normalized type, category, format, destination, output path, and job identity.'
    },
    {
        id: 'project_output_digest',
        label: 'KiCad project output digest',
        category: 'project_loading',
        kicadNative: false,
        altiumCapability:
            'Build output-job digests with output groups, document lookup indexes, and expected artifacts.',
        kicadCapability:
            'Build KiCad jobset output digests with output groups, document lookup indexes, and expected artifacts.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-final-parity-read-models.test.mjs'],
        summary:
            'KicadProjectOutputDigestBuilder adapts parsed KiCad jobsets into output groups and artifact manifests.'
    },
    {
        id: 'helper_contract_schemas',
        label: 'Helper contract schemas',
        category: 'model_contracts',
        kicadNative: false,
        altiumCapability:
            'Publish split JSON Schemas for helper report contracts.',
        kicadCapability:
            'Publish split KiCad JSON Schemas for project bundles, netlists, SVG semantics, schematic render operations, CI bundles, contract gates, document graphs, expected artifacts, output digests, source coverage, parser fuzz reports, route analysis, statistics, layer-stack, dimensions, region semantics, rule read models, rigid-flex topology, ownership/hierarchy graphs, host diagnostics, footprint extraction, review metadata, footprint-library parity, image payloads, project BOM/PnP reconciliation, library QA, library merge plans, and schematic QA.',
        entrypoints: ['docs/schemas/kicad_toolkit'],
        docs: ['docs/model-format.md#schema-contracts'],
        tests: ['tests/core/kicad-contract-schemas.test.mjs'],
        summary:
            'Machine-readable schema files give downstream consumers stable helper report contracts.'
    },
    {
        id: 'source_coverage_report',
        label: 'KiCad source coverage report',
        category: 'model_contracts',
        kicadNative: false,
        altiumCapability:
            'Expose record registries and raw-record coverage for parser consumers.',
        kicadCapability:
            'Expose KiCad S-expression node coverage with supported versus preserved-only nodes.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-final-parity-read-models.test.mjs'],
        summary:
            'KicadSourceCoverageReportBuilder counts supported and preserved-only KiCad S-expression node families.'
    },
    {
        id: 'pcb_component_participation_policy',
        label: 'KiCad PCB component participation policy',
        category: 'model_contracts',
        kicadNative: false,
        altiumCapability:
            'Normalize native PCB component-kind fields into BOM, netlist, and PnP participation policy.',
        kicadCapability:
            'Normalize KiCad footprint attributes into BOM, netlist, and PnP participation policy.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#pcb-fields'],
        tests: ['tests/core/kicad-pcb-read-model-helpers.test.mjs'],
        summary:
            'KicadPcbComponentParticipationPolicy resolves smd, through_hole, board_only, virtual, dnp, exclude-from-BOM, and exclude-from-position-file flags into deterministic participation booleans.'
    },
    {
        id: 'host_capability_diagnostics',
        label: 'KiCad host capability diagnostics',
        category: 'model_contracts',
        kicadNative: false,
        altiumCapability:
            'Build deterministic host capability and fallback diagnostics.',
        kicadCapability:
            'Build deterministic host capability and fallback diagnostics for KiCad render hosts.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-pcb-read-model-helpers.test.mjs'],
        summary:
            'KicadHostCapabilityDiagnosticsBuilder reports unavailable host capabilities and fallback decisions.'
    },
    {
        id: 'pcb_placed_footprint_manifest',
        label: 'KiCad placed footprint extraction manifest',
        category: 'model_contracts',
        kicadNative: false,
        altiumCapability:
            'Build read-only extraction manifests for placed PCB footprints.',
        kicadCapability:
            'Build read-only .kicad_mod-style extraction manifests for placed KiCad footprints.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-pcb-read-model-helpers.test.mjs'],
        summary:
            'KicadPcbPlacedFootprintManifestBuilder describes placed footprint outputs, layers, model assets, and extraction diagnostics.'
    },
    {
        id: 'pcb_review_metadata',
        label: 'KiCad PCB review metadata',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Build PCB review metadata for routed-class and board-assembly workflows.',
        kicadCapability:
            'Build KiCad PCB review metadata for routed net classes and board assembly model checks.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-pcb-read-model-helpers.test.mjs'],
        summary:
            'KicadPcbReviewMetadataBuilder adapts KiCad route-analysis rows into review groups.'
    },
    {
        id: 'contract_gate_report',
        label: 'KiCad contract gate report',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Build CI contract gate reports for normalized artifacts.',
        kicadCapability:
            'Build KiCad CI contract gate reports for normalized models, netlists, semantic SVG links, and diagnostics.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-ci-parity-helpers.test.mjs'],
        summary:
            'KicadContractGateReportBuilder gives CI consumers one deterministic pass/fail report over parser and renderer artifacts.'
    },
    {
        id: 'footprint_library_parity_report',
        label: 'KiCad footprint library parity report',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Build parity reports for advanced PCB library footprint fields.',
        kicadCapability:
            'Build parity reports for advanced KiCad footprint library pad, graphic, and model fields.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-pcb-read-model-helpers.test.mjs'],
        summary:
            'KicadFootprintLibraryParityReportBuilder counts custom pad primitives, pad options, graphics, and model references.'
    },
    {
        id: 'image_payload_manifest',
        label: 'KiCad image payload manifest',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Build deterministic image-payload manifests for Draftsman digest images.',
        kicadCapability:
            'Build deterministic image-payload manifests for KiCad schematic images, worksheet bitmaps, PCB images, and embedded schematic files.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-pcb-read-model-helpers.test.mjs'],
        summary:
            'KicadImagePayloadManifestBuilder emits byte sizes and FNV-1a checksums for KiCad image-like payloads.'
    },
    {
        id: 'pcb_ownership_graph',
        label: 'KiCad PCB ownership graph',
        category: 'model_contracts',
        kicadNative: false,
        altiumCapability:
            'Build read-only PCB primitive ownership graphs from normalized indexes.',
        kicadCapability:
            'Build read-only KiCad PCB primitive ownership graphs keyed by component, routed net, and group.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-pcb-read-model-helpers.test.mjs'],
        summary:
            'KicadPcbOwnershipGraphBuilder exposes component, routed-net, and group primitive ownership.'
    },
    {
        id: 'schematic_ownership_graph',
        label: 'KiCad schematic ownership graph',
        category: 'model_contracts',
        kicadNative: false,
        altiumCapability:
            'Build read-only schematic primitive ownership graphs from native owner indexes.',
        kicadCapability:
            'Build read-only KiCad schematic owner-child graphs for components, pins, texts, sheet symbols, sheet entries, directives, rule areas, and nets.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-additional-parity-read-models.test.mjs'],
        summary:
            'KicadSchematicOwnershipGraphBuilder indexes schematic records by component and hierarchical sheet ownership.'
    },
    {
        id: 'pcb_layer_stack_read_model',
        label: 'KiCad PCB layer-stack read model',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Build source-aware PCB layer-stack read models with material and dielectric metadata.',
        kicadCapability:
            'Build KiCad PCB stackup read models from setup stackup layers, material, thickness, dielectric, and edge-plating metadata.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-additional-parity-read-models.test.mjs'],
        summary:
            'KicadPcbLayerStackReadModelBuilder exposes KiCad stackup layers, materials, and thickness summaries.'
    },
    {
        id: 'pcb_dimension_read_model',
        label: 'KiCad PCB dimension read model',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Promote native PCB dimension records into queryable read-model rows.',
        kicadCapability:
            'Promote KiCad dimension graphics into queryable dimension rows with layer, points, text, and measured values.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-additional-parity-read-models.test.mjs'],
        summary:
            'KicadPcbDimensionReadModelBuilder builds deterministic dimension rows from parsed KiCad dimension graphics.'
    },
    {
        id: 'pcb_region_semantics',
        label: 'KiCad PCB region semantics',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Build board-region and rigid-flex planning semantic summaries.',
        kicadCapability:
            'Build KiCad zone, keepout, and board-region semantic summaries without treating keepouts as copper pours.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-additional-parity-read-models.test.mjs'],
        summary:
            'KicadPcbRegionSemanticsBuilder reports copper zones, keepout target flags, and board-region planning metadata.'
    },
    {
        id: 'pcb_rule_read_model',
        label: 'KiCad PCB rule read model',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Expose typed PCB design-rule families and parsed constraints.',
        kicadCapability:
            'Expose typed KiCad custom-rule and project-rule families with parsed constraints.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-final-parity-read-models.test.mjs'],
        summary:
            'KicadPcbRuleReadModelBuilder normalizes custom DRC rules, project design settings, and net classes into typed rule rows.'
    },
    {
        id: 'pcb_rigid_flex_topology',
        label: 'KiCad PCB rigid-flex topology',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Expose rigid-flex topology with substacks, branches, and bending lines.',
        kicadCapability:
            'Expose KiCad flat-stack and region-metadata topology status without inventing unsupported branch graphs.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-final-parity-read-models.test.mjs'],
        summary:
            'KicadPcbRigidFlexTopologyBuilder reports KiCad flat-stack status and region metadata while leaving branch graphs empty unless KiCad exposes them.'
    },
    {
        id: 'project_bom_pnp_reconciliation',
        label: 'KiCad project BOM/PnP reconciliation',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Build deterministic BOM/PnP reconciliation reports from project bundles.',
        kicadCapability:
            'Build deterministic KiCad BOM/PnP reconciliation reports from schematic BOM, PCB BOM, PnP, DNP, exclude-from-BOM, and exclude-from-position-file rows.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-project-bundle.test.mjs'],
        summary:
            'KicadProjectBomPnpReconciliationBuilder reports BOM, PnP, DNP, and fabrication-attribute drift.'
    },
    {
        id: 'library_qa_report',
        label: 'KiCad library QA report',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Build deterministic QA reports across schematic and PCB libraries.',
        kicadCapability:
            'Build deterministic KiCad QA reports across symbol and footprint library collections.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-parity-helper-apis.test.mjs'],
        summary:
            'KicadLibraryQaReportBuilder reports duplicate items, merge-plan conflicts, unresolved footprint references, missing model assets, and unit mismatches.'
    },
    {
        id: 'library_merge_plan',
        label: 'KiCad library merge plan',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Build read-only library merge-plan diagnostics for duplicate symbol names, embedded assets, and font dependencies.',
        kicadCapability:
            'Build read-only KiCad symbol-library merge-plan diagnostics for duplicate names, conflicting symbol shapes, embedded assets, and font dependencies.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-parity-helper-apis.test.mjs'],
        summary:
            'KicadLibraryQaReportBuilder emits a library.merge-plan.a1 sidecar with conflicts, rename suggestions, embedded assets, fonts, and diagnostics.'
    },
    {
        id: 'schematic_document_qa',
        label: 'KiCad schematic document QA',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Build deterministic schematic document QA summaries.',
        kicadCapability:
            'Build deterministic KiCad schematic document QA summaries for unresolved text variables, title-block gaps, and style inventories.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-parity-helper-apis.test.mjs'],
        summary:
            'KicadSchematicQaReportBuilder exposes document-level schematic QA without invoking KiCad ERC.'
    },
    {
        id: 'schematic_render_ops_sidecar',
        label: 'KiCad schematic render-operation sidecar',
        category: 'model_contracts',
        kicadNative: false,
        altiumCapability:
            'Build deterministic schematic render-operation sidecars for SVG regression and CI diffing workflows.',
        kicadCapability:
            'Build deterministic KiCad schematic render-operation sidecars for lines, pins, and stroke text in SVG regression and CI diffing workflows.',
        entrypoints: ['kicad-toolkit/renderers', 'kicad-toolkit'],
        docs: [
            'docs/api.md#renderers',
            'docs/model-format.md#schema-contracts'
        ],
        tests: ['tests/ui/kicad-svg-semantic-metadata.test.mjs'],
        summary:
            'SchematicRenderOpsSidecarBuilder emits kicad-toolkit.schematic.render-ops.a1 rows and SchematicSvgRenderer embeds them in SVG metadata.'
    },
    {
        id: 'pcb_scene3d_textbox_layout',
        label: 'KiCad PCB 3D text-box layout',
        category: 'scene3d',
        kicadNative: false,
        altiumCapability:
            'Resolve PCB text-box layout metadata for 3D scene consumers.',
        kicadCapability:
            'Resolve KiCad gr_text_box and fp_text_box geometry, margins, border, and alignment metadata for 3D scene consumers.',
        entrypoints: ['kicad-toolkit/scene3d', 'kicad-toolkit'],
        docs: ['docs/api.md#3d-scene-data'],
        tests: ['tests/scene3d-api.test.mjs'],
        summary:
            'PcbScene3dTextBoxLayoutResolver exposes KiCad text-box layout dimensions without creating renderer objects.'
    },
    {
        id: 'pcb_route_analysis',
        label: 'KiCad PCB route analysis',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Build deterministic routed-net summaries from normalized PCB primitives.',
        kicadCapability:
            'Build deterministic KiCad routed-net summaries from tracks, arcs, and vias.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-pcb-read-model-helpers.test.mjs'],
        summary:
            'KicadPcbRouteAnalysisBuilder groups routed KiCad copper by net and layer.'
    },
    {
        id: 'pcb_statistics',
        label: 'KiCad PCB statistics',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Build deterministic PCB QA and statistics summaries.',
        kicadCapability:
            'Build deterministic KiCad PCB board, drill, primitive-width, and layer summaries.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#helper-report-fields'
        ],
        tests: ['tests/core/kicad-pcb-read-model-helpers.test.mjs'],
        summary:
            'KicadPcbStatisticsBuilder exposes deterministic board, drill, width, and layer statistics.'
    }
])
