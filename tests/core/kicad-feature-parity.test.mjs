// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadFeatureParity } from '../../src/parser.mjs'

test('KicadFeatureParity inventories implemented KiCad-native parity features', () => {
    const inventory = KicadFeatureParity.inventory()
    const byId = new Map(
        inventory.features.map((feature) => [feature.id, feature])
    )

    assert.equal(inventory.filters.category, null)
    assert.equal(inventory.filters.status, null)
    assert.equal(inventory.implemented, true)
    assert.equal(inventory.total, 70)
    assert.deepEqual(inventory.statusCounts, { implemented: 70 })
    assert.deepEqual(inventory.nativeCounts, {
        adapted_contract: 43,
        kicad_native: 27
    })
    assert.equal(inventory.featureCoverage.implemented, 70)
    assert.equal(inventory.featureCoverage.exempted, 7)
    assert.equal(inventory.featureCoverage.totalDocumented, 77)
    assert.equal(inventory.categories.parser_roots.count, 11)
    assert.equal(inventory.categories.project_loading.count, 14)
    assert.equal(inventory.categories.model_contracts.count, 13)
    assert.equal(inventory.categories.diagnostics_reporting.count, 19)
    assert.equal(inventory.categories.scene3d.count, 3)
    assert.equal(inventory.exemptions.length, 7)

    assert.deepEqual(byId.get('parse_kicad_schematic'), {
        id: 'parse_kicad_schematic',
        label: 'Parse KiCad schematics',
        category: 'parser_roots',
        status: 'implemented',
        kicadNative: true,
        altiumCapability: 'Parse native .SchDoc schematic documents.',
        kicadCapability: 'Parse native .kicad_sch S-expression schematics.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#schematic-fields'],
        tests: [
            'tests/core/kicad-parser.test.mjs',
            'tests/ui/schematic-svg-renderer.test.mjs'
        ],
        summary:
            'KicadParser.parseArrayBuffer() returns Circuit JSON with schematic renderer compatibility fields.'
    })

    assert.deepEqual(byId.get('pcb_side_resolved_rendering'), {
        id: 'pcb_side_resolved_rendering',
        label: 'Side-resolved PCB rendering',
        category: 'pcb_rendering',
        status: 'implemented',
        kicadNative: true,
        altiumCapability: 'Project a PCB side into a top-facing render model.',
        kicadCapability:
            'Project KiCad front or back board sides into deterministic render models.',
        entrypoints: ['kicad-toolkit/renderers', 'kicad-toolkit'],
        docs: ['docs/api.md#renderers'],
        tests: [
            'tests/ui/kicad-renderers-api.test.mjs',
            'tests/ui/pcb-svg-renderer-kicad-view.test.mjs'
        ],
        summary:
            'PcbSideResolvedRenderModel and preparePcbSideResolvedRenderModel support front and back KiCad views.'
    })

    assert.deepEqual(byId.get('renderer_helper_api'), {
        id: 'renderer_helper_api',
        label: 'Renderer helper API',
        category: 'model_contracts',
        status: 'implemented',
        kicadNative: false,
        altiumCapability:
            'Expose public SVG, schematic parameter, semantic metadata, and text metric helpers.',
        kicadCapability:
            'Expose KiCad SVG utilities, PCB/schematic semantic metadata builders, schematic project parameter resolution, and schematic stroke-text metrics.',
        entrypoints: ['kicad-toolkit/renderers', 'kicad-toolkit'],
        docs: ['docs/api.md#renderers', 'docs/capabilities.md'],
        tests: [
            'tests/api-entrypoints.test.mjs',
            'tests/ui/kicad-renderers-api.test.mjs'
        ],
        summary:
            'Renderer helper exports let host applications use KiCad-native formatting, metadata, parameter, and text metric contracts without importing internal paths.'
    })

    assert.deepEqual(byId.get('project_document_graph'), {
        id: 'project_document_graph',
        label: 'Project document graph',
        category: 'project_loading',
        status: 'implemented',
        kicadNative: false,
        altiumCapability:
            'Build a read-only graph of project documents, libraries, generated outputs, and missing paths.',
        kicadCapability:
            'Build a read-only graph of KiCad project documents, libraries, design blocks, jobsets, generated outputs, assets, and missing paths.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#project-loading-fields'
        ],
        tests: ['tests/core/kicad-ci-parity-helpers.test.mjs'],
        summary:
            'KicadProjectDocumentGraphBuilder indexes parsed project relationships without touching the filesystem.'
    })

    assert.deepEqual(byId.get('helper_contract_schemas'), {
        id: 'helper_contract_schemas',
        label: 'Helper contract schemas',
        category: 'model_contracts',
        status: 'implemented',
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
    })

    assert.deepEqual(byId.get('pcb_pick_place_position_resolver'), {
        id: 'pcb_pick_place_position_resolver',
        label: 'KiCad PCB pick-place position resolver',
        category: 'project_loading',
        status: 'implemented',
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
    })

    assert.deepEqual(byId.get('pcb_component_participation_policy'), {
        id: 'pcb_component_participation_policy',
        label: 'KiCad PCB component participation policy',
        category: 'model_contracts',
        status: 'implemented',
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
    })

    assert.deepEqual(byId.get('jobset_expected_artifacts'), {
        id: 'jobset_expected_artifacts',
        label: 'KiCad jobset expected artifacts',
        category: 'project_loading',
        status: 'implemented',
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
    })
    assert.deepEqual(byId.get('project_output_digest'), {
        id: 'project_output_digest',
        label: 'KiCad project output digest',
        category: 'project_loading',
        status: 'implemented',
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
    })

    assert.deepEqual(byId.get('contract_gate_report'), {
        id: 'contract_gate_report',
        label: 'KiCad contract gate report',
        category: 'diagnostics_reporting',
        status: 'implemented',
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
    })

    assert.deepEqual(byId.get('pcb_route_analysis'), {
        id: 'pcb_route_analysis',
        label: 'KiCad PCB route analysis',
        category: 'diagnostics_reporting',
        status: 'implemented',
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
    })

    assert.deepEqual(byId.get('pcb_placed_footprint_manifest'), {
        id: 'pcb_placed_footprint_manifest',
        label: 'KiCad placed footprint extraction manifest',
        category: 'model_contracts',
        status: 'implemented',
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
    })
    assert.deepEqual(byId.get('source_coverage_report'), {
        id: 'source_coverage_report',
        label: 'KiCad source coverage report',
        category: 'model_contracts',
        status: 'implemented',
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
    })

    assert.deepEqual(byId.get('pcb_layer_stack_read_model'), {
        id: 'pcb_layer_stack_read_model',
        label: 'KiCad PCB layer-stack read model',
        category: 'diagnostics_reporting',
        status: 'implemented',
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
    })

    assert.deepEqual(byId.get('image_payload_manifest'), {
        id: 'image_payload_manifest',
        label: 'KiCad image payload manifest',
        category: 'diagnostics_reporting',
        status: 'implemented',
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
    })
    assert.deepEqual(byId.get('pcb_rule_read_model'), {
        id: 'pcb_rule_read_model',
        label: 'KiCad PCB rule read model',
        category: 'diagnostics_reporting',
        status: 'implemented',
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
    })
    assert.deepEqual(byId.get('pcb_rigid_flex_topology'), {
        id: 'pcb_rigid_flex_topology',
        label: 'KiCad PCB rigid-flex topology',
        category: 'diagnostics_reporting',
        status: 'implemented',
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
    })

    assert.deepEqual(byId.get('project_bom_pnp_reconciliation'), {
        id: 'project_bom_pnp_reconciliation',
        label: 'KiCad project BOM/PnP reconciliation',
        category: 'diagnostics_reporting',
        status: 'implemented',
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
    })

    assert.deepEqual(byId.get('library_qa_report'), {
        id: 'library_qa_report',
        label: 'KiCad library QA report',
        category: 'diagnostics_reporting',
        status: 'implemented',
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
    })

    assert.deepEqual(byId.get('library_merge_plan'), {
        id: 'library_merge_plan',
        label: 'KiCad library merge plan',
        category: 'diagnostics_reporting',
        status: 'implemented',
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
    })

    assert.deepEqual(byId.get('schematic_render_ops_sidecar'), {
        id: 'schematic_render_ops_sidecar',
        label: 'KiCad schematic render-operation sidecar',
        category: 'model_contracts',
        status: 'implemented',
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
    })

    assert.deepEqual(byId.get('schematic_document_qa'), {
        id: 'schematic_document_qa',
        label: 'KiCad schematic document QA',
        category: 'diagnostics_reporting',
        status: 'implemented',
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
    })

    assert.deepEqual(byId.get('parse_kicad_design_rules'), {
        id: 'parse_kicad_design_rules',
        label: 'Parse KiCad custom design rules',
        category: 'parser_roots',
        status: 'implemented',
        kicadNative: true,
        altiumCapability: 'Parse project design rules.',
        kicadCapability:
            'Parse KiCad .kicad_dru custom DRC rules and component class assignments.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#auxiliary-fields'],
        tests: ['tests/core/kicad-auxiliary-file-parsers.test.mjs'],
        summary:
            'KicadDesignRulesParser.parse() exposes custom rule names, conditions, layers, severities, constraints, disallow rows, and component class assignments.'
    })
})

test('KicadFeatureParity filters without throwing for unknown filters', () => {
    const scene3d = KicadFeatureParity.inventory({ category: 'scene3d' })

    assert.equal(scene3d.total, 3)
    assert.deepEqual(Object.keys(scene3d.categories), ['scene3d'])
    assert.equal(scene3d.exemptions.length, 0)
    assert.deepEqual(
        scene3d.features.map((feature) => feature.id),
        [
            'pcb_scene3d_description',
            'pcb_scene3d_model_assets',
            'pcb_scene3d_textbox_layout'
        ]
    )

    const unknown = KicadFeatureParity.inventory({
        category: 'source_format_only'
    })

    assert.equal(unknown.total, 0)
    assert.equal(unknown.implemented, false)
    assert.deepEqual(unknown.categories, {})
    assert.deepEqual(unknown.statusCounts, {})
    assert.deepEqual(unknown.nativeCounts, {
        adapted_contract: 0,
        kicad_native: 0
    })
    assert.deepEqual(unknown.features, [])
})

test('KicadFeatureParity records Altium-only source-format exemptions', () => {
    const inventory = KicadFeatureParity.inventory()
    const byId = new Map(
        inventory.exemptions.map((exemption) => [exemption.id, exemption])
    )

    assert.deepEqual(byId.get('ole_compound_document'), {
        id: 'ole_compound_document',
        label: 'OLE compound document parsing',
        altiumCapability:
            'Read Altium native compound document stream containers.',
        reason: 'KiCad schematic and PCB files are text S-expressions, and KiCad projects are loaded from normal files or ZIP archives.',
        kicadEquivalent: 'SExpressionParser and KicadProjectLoader',
        docs: ['spec/library-scope.md']
    })

    assert.deepEqual(byId.get('pcb_library_streams'), {
        id: 'pcb_library_streams',
        label: 'Altium PCB library stream parsing',
        altiumCapability: 'Parse .PcbLib footprint library streams.',
        reason: 'KiCad footprint libraries are text .kicad_mod files in .pretty folders rather than Altium .PcbLib compound streams.',
        kicadEquivalent: 'KicadFootprintLibraryParser and KicadPcbParser',
        docs: ['spec/library-scope.md']
    })

    assert.deepEqual(byId.get('draftsman_digest_parser'), {
        id: 'draftsman_digest_parser',
        label: 'Altium Draftsman digest parsing',
        altiumCapability: 'Parse Altium Draftsman drawing container digests.',
        reason: 'KiCad drawing sheets, worksheets, and fabrication outputs are represented by .kicad_wks, .kicad_jobset, and generated output metadata rather than an Altium Draftsman container.',
        kicadEquivalent:
            'KicadWorksheetParser, KicadJobsetParser, KicadJobsetDigestBuilder, and KicadProjectDocumentGraphBuilder',
        docs: ['spec/library-scope.md']
    })
})
