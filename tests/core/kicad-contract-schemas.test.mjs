// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { NormalizedModelSchema } from '../../src/parser.mjs'

test('machine-readable KiCad helper schemas are split for downstream consumers', () => {
    const schemaFiles = [
        [
            '../../docs/schemas/kicad_toolkit/project_bundle_a1.schema.json',
            'urn:kicad-toolkit:project-bundle:a1',
            NormalizedModelSchema.CURRENT_SCHEMA_ID
        ],
        [
            '../../docs/schemas/kicad_toolkit/netlist_a1.schema.json',
            'kicad-toolkit.netlist.a1',
            'kicad-toolkit.netlist.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/schematic_svg_semantics_a1.schema.json',
            'kicad-toolkit.schematic.svg.semantics.a1',
            'kicad-toolkit.schematic.svg.semantics.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/schematic_render_ops_a1.schema.json',
            'kicad-toolkit.schematic.render-ops.a1',
            'kicad-toolkit.schematic.render-ops.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/pcb_svg_semantics_a1.schema.json',
            'kicad-toolkit.pcb.svg.semantics.a1',
            'kicad-toolkit.pcb.svg.semantics.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/ci_artifact_bundle_a1.schema.json',
            'kicad-toolkit.ci.artifact-bundle.a1',
            'kicad-toolkit.ci.artifact-bundle.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/contract_gate_a1.schema.json',
            'kicad-toolkit.contract-gate.a1',
            'kicad-toolkit.contract-gate.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/project_document_graph_a1.schema.json',
            'kicad-toolkit.project.document-graph.a1',
            'kicad-toolkit.project.document-graph.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/project_expected_artifacts_a1.schema.json',
            'kicad-toolkit.project.expected-artifacts.a1',
            'kicad-toolkit.project.expected-artifacts.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/project_output_digest_a1.schema.json',
            'kicad-toolkit.project.output-digest.a1',
            'kicad-toolkit.project.output-digest.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/source_coverage_a1.schema.json',
            'kicad-toolkit.source.coverage.a1',
            'kicad-toolkit.source.coverage.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/svg_model_cross_link_a1.schema.json',
            'kicad-toolkit.svg-model-cross-link.a1',
            'kicad-toolkit.svg-model-cross-link.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/parser_compatibility_fuzz_a1.schema.json',
            'kicad-toolkit.parser-compatibility-fuzz.a1',
            'kicad-toolkit.parser-compatibility-fuzz.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/pcb_route_analysis_a1.schema.json',
            'kicad-toolkit.pcb.route-analysis.a1',
            'kicad-toolkit.pcb.route-analysis.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/pcb_statistics_a1.schema.json',
            'kicad-toolkit.pcb.statistics.a1',
            'kicad-toolkit.pcb.statistics.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/pcb_layer_stack_a1.schema.json',
            'kicad-toolkit.pcb.layer-stack.a1',
            'kicad-toolkit.pcb.layer-stack.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/pcb_dimensions_a1.schema.json',
            'kicad-toolkit.pcb.dimensions.a1',
            'kicad-toolkit.pcb.dimensions.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/pcb_region_semantics_a1.schema.json',
            'kicad-toolkit.pcb.region-semantics.a1',
            'kicad-toolkit.pcb.region-semantics.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/pcb_rule_read_model_a1.schema.json',
            'kicad-toolkit.pcb.rule-read-model.a1',
            'kicad-toolkit.pcb.rule-read-model.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/pcb_rigid_flex_topology_a1.schema.json',
            'kicad-toolkit.pcb.rigid-flex-topology.a1',
            'kicad-toolkit.pcb.rigid-flex-topology.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/pcb_ownership_graph_a1.schema.json',
            'kicad-toolkit.pcb.ownership-graph.a1',
            'kicad-toolkit.pcb.ownership-graph.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/schematic_ownership_graph_a1.schema.json',
            'kicad-toolkit.schematic.ownership-graph.a1',
            'kicad-toolkit.schematic.ownership-graph.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/schematic_hierarchy_graph_a1.schema.json',
            'kicad-toolkit.schematic.hierarchy-graph.a1',
            'kicad-toolkit.schematic.hierarchy-graph.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/host_capabilities_a1.schema.json',
            'kicad-toolkit.host-capabilities.a1',
            'kicad-toolkit.host-capabilities.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/pcb_placed_footprint_extraction_a1.schema.json',
            'kicad-toolkit.pcb.placed-footprint-extraction.a1',
            'kicad-toolkit.pcb.placed-footprint-extraction.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/pcb_review_metadata_a1.schema.json',
            'kicad-toolkit.pcb.review-metadata.a1',
            'kicad-toolkit.pcb.review-metadata.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/footprint_library_parity_a1.schema.json',
            'kicad-toolkit.footprint-library.parity.a1',
            'kicad-toolkit.footprint-library.parity.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/image_payloads_a1.schema.json',
            'kicad-toolkit.image-payloads.a1',
            'kicad-toolkit.image-payloads.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/project_bom_pnp_reconciliation_a1.schema.json',
            'kicad-toolkit.project.bom-pnp-reconciliation.a1',
            'kicad-toolkit.project.bom-pnp-reconciliation.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/library_qa_a1.schema.json',
            'kicad-toolkit.library.qa.a1',
            'kicad-toolkit.library.qa.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/library_merge_plan_a1.schema.json',
            'kicad-toolkit.library.merge-plan.a1',
            'kicad-toolkit.library.merge-plan.a1'
        ],
        [
            '../../docs/schemas/kicad_toolkit/schematic_qa_a1.schema.json',
            'kicad-toolkit.schematic.qa.a1',
            'kicad-toolkit.schematic.qa.a1'
        ]
    ]

    for (const [filePath, schemaId, emittedSchemaId] of schemaFiles) {
        const schema = JSON.parse(
            fs.readFileSync(new URL(filePath, import.meta.url), 'utf8')
        )

        assert.equal(schema.$id, schemaId)
        assert.equal(schema.properties.schema.const, emittedSchemaId)
        assert.equal(schema.additionalProperties, true)
    }
})
