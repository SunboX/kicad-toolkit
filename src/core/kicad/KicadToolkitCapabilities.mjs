// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const categoryInfo = Object.freeze({
    parser: {
        label: 'Parser',
        description:
            'Native KiCad document parsing and Circuit JSON projection.'
    },
    project_loading: {
        label: 'Project loading',
        description: 'Local board and project archive loading helpers.'
    },
    geometry_metadata: {
        label: 'Geometry and metadata',
        description:
            'S-expression, layer, net, and geometry normalization helpers.'
    },
    rendering: {
        label: 'Rendering',
        description: 'Deterministic SVG and HTML renderer output.'
    },
    scene3d: {
        label: '3D scene data',
        description: 'Data-only PCB 3D scene-description helpers.'
    },
    reporting: {
        label: 'Reporting',
        description:
            'Read-only diagnostics, report normalization, and readiness summaries.'
    }
})

const safetyClasses = Object.freeze(['read_only'])

const capabilities = Object.freeze([
    capability({
        id: 'kicad_pcb_parser',
        label: 'PCB parser',
        category: 'parser',
        outputs: ['kicadBoard', 'Circuit JSON'],
        summary: 'Parses native .kicad_pcb S-expression board data.'
    }),
    capability({
        id: 'kicad_schematic_parser',
        label: 'Schematic parser',
        category: 'parser',
        outputs: ['schematic', 'Circuit JSON'],
        summary: 'Parses native .kicad_sch S-expression schematic data.'
    }),
    capability({
        id: 'kicad_footprint_library_parser',
        label: 'Footprint library parser',
        category: 'parser',
        outputs: ['footprint-library', 'Circuit JSON'],
        summary:
            'Parses standalone .kicad_mod footprint library S-expression data.'
    }),
    capability({
        id: 'kicad_symbol_library_parser',
        label: 'Symbol library parser',
        category: 'parser',
        outputs: ['symbol-library', 'Circuit JSON'],
        summary:
            'Parses standalone .kicad_sym symbol library S-expression data.'
    }),
    capability({
        id: 'kicad_library_table_parser',
        label: 'Library table parser',
        category: 'parser',
        outputs: ['library-table'],
        summary: 'Parses KiCad fp-lib-table and sym-lib-table rows.'
    }),
    capability({
        id: 'kicad_jobset_parser',
        label: 'Jobset parser',
        category: 'parser',
        outputs: ['jobset'],
        summary: 'Parses KiCad .kicad_jobset output job metadata.'
    }),
    capability({
        id: 'kicad_design_rules_parser',
        label: 'Custom design rules parser',
        category: 'parser',
        outputs: ['design-rules'],
        summary: 'Parses KiCad .kicad_dru custom rule files.'
    }),
    capability({
        id: 'kicad_worksheet_parser',
        label: 'Worksheet parser',
        category: 'parser',
        outputs: ['worksheet'],
        summary: 'Parses KiCad .kicad_wks page layout files.'
    }),
    capability({
        id: 'kicad_netlist_parser',
        label: 'Netlist parser',
        category: 'parser',
        outputs: ['netlist'],
        summary: 'Parses KiCad exported S-expression .net files.'
    }),
    capability({
        id: 'kicad_footprint_association_parser',
        label: 'Footprint association parser',
        category: 'parser',
        outputs: ['footprint-associations'],
        summary: 'Parses KiCad .cmp footprint association files.'
    }),
    capability({
        id: 'kicad_legacy_library_parser',
        label: 'Legacy library parser',
        category: 'parser',
        outputs: ['legacy-library'],
        summary:
            'Exposes lightweight inspection metadata for legacy .lib, .dcm, and .mod files.'
    }),
    capability({
        id: 'circuit_json_adapter',
        label: 'Circuit JSON adapter',
        category: 'parser',
        outputs: ['Circuit JSON', 'renderer model'],
        summary:
            'Converts between renderer compatibility models and Circuit JSON arrays.'
    }),
    capability({
        id: 'project_zip_loader',
        label: 'Project ZIP loader',
        category: 'project_loading',
        requires: ['fflate'],
        outputs: ['documents', 'assets', 'diagnostics'],
        summary: 'Loads local KiCad project archives and companion assets.'
    }),
    capability({
        id: 'project_metadata_parser',
        label: 'Project metadata parser',
        category: 'project_loading',
        outputs: ['project metadata', 'net classes', 'rules'],
        summary:
            'Parses .kicad_pro JSON metadata, text variables, board settings, and net classes.'
    }),
    capability({
        id: 'project_design_bundle',
        label: 'Project design bundle',
        category: 'project_loading',
        outputs: ['design bundle', 'variant view'],
        summary:
            'Composes loaded KiCad project documents into bundle-level sheets, components, nets, BOM, PnP, and variants.'
    }),
    capability({
        id: 'pcb_pick_place_position_resolver',
        label: 'PCB pick-place position resolver',
        category: 'project_loading',
        outputs: ['pnp model'],
        summary:
            'Builds KiCad footprint-origin and pad-anchor-center PnP coordinate views.'
    }),
    capability({
        id: 'schematic_hierarchy_graph',
        label: 'Schematic hierarchy graph',
        category: 'project_loading',
        outputs: ['hierarchy graph'],
        summary:
            'Indexes KiCad schematic pages and hierarchical sheet references.'
    }),
    capability({
        id: 'project_document_graph',
        label: 'Project document graph',
        category: 'project_loading',
        outputs: ['document graph'],
        summary:
            'Indexes KiCad project documents, libraries, design blocks, jobsets, generated outputs, assets, and missing paths.'
    }),
    capability({
        id: 'kicad_library_index_builder',
        label: 'Library index builder',
        category: 'project_loading',
        outputs: ['library-index'],
        summary:
            'Builds searchable manifests for KiCad library tables, .pretty folders, .kicad_sym files, .kicad_symdir folders, and design blocks.'
    }),
    capability({
        id: 'kicad_library_search_index',
        label: 'Library search index',
        category: 'project_loading',
        outputs: ['search matches'],
        summary:
            'Searches KiCad footprint, symbol, and design block library items with exact, keyword, and fuzzy matching.'
    }),
    capability({
        id: 'kicad_jobset_digest_builder',
        label: 'Jobset digest builder',
        category: 'project_loading',
        outputs: ['jobset digest'],
        summary:
            'Builds project-level job and destination lookups from parsed KiCad jobsets.'
    }),
    capability({
        id: 'project_output_digest',
        label: 'Project output digest',
        category: 'project_loading',
        outputs: ['output digest'],
        summary:
            'Builds KiCad jobset output groups, document lookups, and expected artifact manifests.'
    }),
    capability({
        id: 'kicad_asset_inventory_builder',
        label: 'Asset inventory builder',
        category: 'project_loading',
        outputs: ['asset inventory'],
        summary:
            'Inventories embedded files, schematic images, worksheet bitmaps, 3D model references, and companion assets.'
    }),
    capability({
        id: 'kicad_design_block_library_parser',
        label: 'Design block library parser',
        category: 'project_loading',
        outputs: ['design-block-library'],
        summary: 'Indexes KiCad .kicad_blocks and .kicad_block folders.'
    }),
    capability({
        id: 's_expression_parser',
        label: 'S-expression parser',
        category: 'geometry_metadata',
        outputs: ['AST'],
        summary: 'Tokenizes and parses KiCad-style S-expression documents.'
    }),
    capability({
        id: 'layer_metadata',
        label: 'Layer metadata',
        category: 'geometry_metadata',
        outputs: ['layer records'],
        summary:
            'Normalizes KiCad layer aliases, ordinals, sides, classes, and wildcards.'
    }),
    capability({
        id: 'net_resolution',
        label: 'Net resolution',
        category: 'geometry_metadata',
        outputs: ['net records'],
        summary: 'Resolves KiCad net codes and names onto parsed primitives.'
    }),
    capability({
        id: 'geometry_helpers',
        label: 'Geometry helpers',
        category: 'geometry_metadata',
        outputs: ['bounds', 'clearances'],
        summary:
            'Computes board-coordinate primitive bounds and supported shape clearances.'
    }),
    capability({
        id: 'semantic_svg_metadata',
        label: 'Semantic SVG metadata',
        category: 'geometry_metadata',
        outputs: ['SVG metadata', 'semantic attributes'],
        summary:
            'Builds KiCad PCB and schematic semantic metadata sidecars for rendered SVG output.'
    }),
    capability({
        id: 'svg_model_cross_link_validator',
        label: 'SVG model cross-link validator',
        category: 'geometry_metadata',
        outputs: ['cross-link report'],
        summary:
            'Validates KiCad semantic SVG element keys and references against parsed schematic and PCB models.'
    }),
    capability({
        id: 'pcb_component_participation_policy',
        label: 'PCB component participation policy',
        category: 'geometry_metadata',
        outputs: ['component policy'],
        summary:
            'Normalizes KiCad footprint attributes into BOM, PnP, and netlist participation flags.'
    }),
    capability({
        id: 'pcb_ownership_graph',
        label: 'PCB ownership graph',
        category: 'geometry_metadata',
        outputs: ['ownership graph'],
        summary:
            'Indexes KiCad PCB primitives by component, routed net, and group ownership.'
    }),
    capability({
        id: 'schematic_ownership_graph',
        label: 'Schematic ownership graph',
        category: 'geometry_metadata',
        outputs: ['ownership graph'],
        summary:
            'Indexes KiCad schematic records by component and hierarchical sheet ownership.'
    }),
    capability({
        id: 'renderer_helper_api',
        label: 'Renderer helper API',
        category: 'rendering',
        outputs: ['SVG helpers', 'text metrics', 'parameter resolver'],
        summary:
            'Exposes deterministic SVG utility, semantic metadata, schematic parameter, and stroke-text metric helpers.'
    }),
    capability({
        id: 'schematic_render_ops_sidecar',
        label: 'Schematic render-operation sidecar',
        category: 'rendering',
        outputs: ['render operation sidecar'],
        summary:
            'Builds deterministic KiCad schematic SVG render-operation metadata for lines, pins, sheet entries, images, frame objects, and stroke text.'
    }),
    capability({
        id: 'pcb_svg_renderer',
        label: 'PCB SVG renderer',
        category: 'rendering',
        outputs: ['SVG'],
        summary:
            'Renders deterministic PCB SVG markup from recovered board models.'
    }),
    capability({
        id: 'pcb_layer_svg_exports',
        label: 'PCB layer SVG exports',
        category: 'rendering',
        outputs: ['layer SVG'],
        summary:
            'Renders deterministic per-layer KiCad PCB SVG exports from declared board layers.'
    }),
    capability({
        id: 'schematic_svg_renderer',
        label: 'Schematic SVG renderer',
        category: 'rendering',
        outputs: ['SVG'],
        summary:
            'Renders deterministic schematic SVG markup, sheet entries, image payloads, text frames, table cells, and authored graphic styles from recovered sheet models.'
    }),
    capability({
        id: 'bom_table_renderer',
        label: 'BOM table renderer',
        category: 'rendering',
        outputs: ['HTML'],
        summary: 'Renders deterministic grouped BOM table markup.'
    }),
    capability({
        id: 'kicad_library_render_manifest_builder',
        label: 'Library render manifest builder',
        category: 'rendering',
        outputs: ['render manifest'],
        summary:
            'Builds deterministic render/export manifests for KiCad footprint, symbol, design-block, and mixed library indexes.'
    }),
    capability({
        id: 'ci_artifact_bundle',
        label: 'CI artifact bundle',
        category: 'reporting',
        outputs: ['artifact bundle'],
        summary:
            'Composes deterministic parser, renderer, netlist, document graph, asset, readiness, and QA outputs for CI.'
    }),
    capability({
        id: 'contract_gate_report',
        label: 'Contract gate report',
        category: 'reporting',
        outputs: ['contract gate report'],
        summary:
            'Builds deterministic CI pass/fail gates for normalized models, netlists, SVG model links, and diagnostics.'
    }),
    capability({
        id: 'helper_contract_schemas',
        label: 'Helper contract schemas',
        category: 'reporting',
        outputs: ['JSON Schema'],
        summary:
            'Publishes split JSON Schema contracts for KiCad helper reports and bundles.'
    }),
    capability({
        id: 'source_coverage_report',
        label: 'Source coverage report',
        category: 'reporting',
        outputs: ['source coverage report'],
        summary:
            'Reports supported and preserved KiCad S-expression node families.'
    }),
    capability({
        id: 'host_capability_diagnostics',
        label: 'Host capability diagnostics',
        category: 'reporting',
        outputs: ['host capabilities'],
        summary:
            'Builds deterministic host capability and fallback diagnostics for KiCad render hosts.'
    }),
    capability({
        id: 'pcb_placed_footprint_manifest',
        label: 'PCB placed footprint manifest',
        category: 'reporting',
        outputs: ['footprint extraction manifest'],
        summary:
            'Builds .kicad_mod-style extraction descriptors for placed KiCad footprints.'
    }),
    capability({
        id: 'pcb_review_metadata',
        label: 'PCB review metadata',
        category: 'reporting',
        outputs: ['review metadata'],
        summary:
            'Builds KiCad routed-net review groups and board assembly review metadata from parser sidecars.'
    }),
    capability({
        id: 'footprint_library_parity_report',
        label: 'Footprint library parity report',
        category: 'reporting',
        outputs: ['footprint library parity'],
        summary:
            'Reports KiCad footprint-library advanced pad, graphic, and model fields.'
    }),
    capability({
        id: 'image_payload_manifest',
        label: 'Image payload manifest',
        category: 'reporting',
        outputs: ['image payload manifest'],
        summary:
            'Checksums KiCad schematic images, worksheet bitmaps, PCB images, and embedded schematic files.'
    }),
    capability({
        id: 'project_bom_pnp_reconciliation',
        label: 'Project BOM/PnP reconciliation',
        category: 'reporting',
        outputs: ['reconciliation report'],
        summary:
            'Compares schematic BOM, PCB BOM, PnP, DNP, exclude-from-BOM, and exclude-from-position-file designators.'
    }),
    capability({
        id: 'library_qa_report',
        label: 'Library QA report',
        category: 'reporting',
        outputs: ['library QA report'],
        summary:
            'Reports duplicate library items, merge-plan conflicts, unresolved footprint references, missing model assets, and symbol unit mismatches.'
    }),
    capability({
        id: 'schematic_document_qa',
        label: 'Schematic document QA',
        category: 'reporting',
        outputs: ['schematic QA report'],
        summary:
            'Reports unresolved schematic text variables, title-block gaps, and document style summaries.'
    }),
    capability({
        id: 'schematic_geometry_readiness',
        label: 'Schematic geometry readiness',
        category: 'reporting',
        outputs: ['schematic geometry readiness report'],
        summary:
            'Reports renderer-sensitive KiCad schematic geometry, text frames, pin styles, authored graphic styles, and unknown graphics.'
    }),
    capability({
        id: 'pcb_route_analysis',
        label: 'PCB route analysis',
        category: 'reporting',
        outputs: ['route analysis'],
        summary:
            'Builds deterministic routed-net summaries from KiCad tracks, arcs, and vias.'
    }),
    capability({
        id: 'pcb_layer_stack_read_model',
        label: 'PCB layer-stack read model',
        category: 'reporting',
        outputs: ['layer-stack read model'],
        summary:
            'Builds KiCad PCB stackup material, dielectric, and thickness summaries.'
    }),
    capability({
        id: 'pcb_layer_usage_report',
        label: 'PCB layer-usage report',
        category: 'reporting',
        outputs: ['layer usage report'],
        summary:
            'Reports declared, used, unused, and undeclared KiCad PCB layers.'
    }),
    capability({
        id: 'pcb_fidelity_diagnostics',
        label: 'PCB fidelity diagnostics',
        category: 'reporting',
        outputs: ['fidelity diagnostics'],
        summary:
            'Flags complex parsed KiCad PCB constructs that need consumer review.'
    }),
    capability({
        id: 'pcb_3d_model_readiness',
        label: 'PCB 3D model readiness',
        category: 'reporting',
        outputs: ['3D model readiness report'],
        summary:
            'Reports KiCad PCB 3D model references, unresolved assets, and procedural fallback package details.'
    }),
    capability({
        id: 'pcb_geometry_readiness',
        label: 'PCB geometry readiness',
        category: 'reporting',
        outputs: ['geometry readiness report'],
        summary:
            'Reports renderer-sensitive KiCad PCB geometry such as thick arcs, custom pads, curves, and multi-contour zones.'
    }),
    capability({
        id: 'pcb_dimension_read_model',
        label: 'PCB dimension read model',
        category: 'reporting',
        outputs: ['dimension read model'],
        summary:
            'Builds queryable KiCad PCB dimension rows with points, text, and measured values.'
    }),
    capability({
        id: 'pcb_region_semantics',
        label: 'PCB region semantics',
        category: 'reporting',
        outputs: ['region semantics'],
        summary:
            'Builds KiCad copper-zone, keepout, and board-region semantic summaries.'
    }),
    capability({
        id: 'pcb_rule_read_model',
        label: 'PCB rule read model',
        category: 'reporting',
        outputs: ['rule read model'],
        summary: 'Builds typed KiCad custom-rule and project-rule summaries.'
    }),
    capability({
        id: 'pcb_rigid_flex_topology',
        label: 'PCB rigid-flex topology',
        category: 'reporting',
        outputs: ['rigid-flex topology'],
        summary:
            'Reports KiCad flat-stack and region-metadata rigid-flex topology status.'
    }),
    capability({
        id: 'pcb_statistics',
        label: 'PCB statistics',
        category: 'reporting',
        outputs: ['statistics'],
        summary:
            'Builds deterministic KiCad PCB board, drill, width, and layer statistics.'
    }),
    capability({
        id: 'parser_compatibility_fuzzer',
        label: 'Parser compatibility fuzzer',
        category: 'reporting',
        outputs: ['fuzz report'],
        summary:
            'Runs deterministic synthetic KiCad parser smoke cases for compatibility checks.'
    }),
    capability({
        id: 'pcb_scene3d_description',
        label: 'PCB 3D scene description',
        category: 'scene3d',
        outputs: ['scene data'],
        summary: 'Builds host-renderer-neutral PCB 3D scene-description data.'
    }),
    capability({
        id: 'pcb_scene3d_textbox_layout',
        label: 'PCB 3D text-box layout',
        category: 'scene3d',
        outputs: ['text-box layout'],
        summary:
            'Resolves KiCad PCB text-box geometry and margins for 3D scene consumers.'
    }),
    capability({
        id: 'kicad_report_normalization',
        label: 'Report normalization',
        category: 'reporting',
        outputs: ['issues', 'summary'],
        summary:
            'Normalizes caller-supplied ERC and DRC report data into issue summaries.'
    }),
    capability({
        id: 'kicad_readiness_report',
        label: 'Readiness report',
        category: 'reporting',
        outputs: ['summary', 'findings'],
        summary:
            'Summarizes parsed board readiness using recovered model data only.'
    }),
    capability({
        id: 'kicad_schematic_connectivity_qa',
        label: 'Schematic connectivity QA',
        category: 'reporting',
        outputs: ['summary', 'findings'],
        summary:
            'Reports schematic-local implicit nets, dangling labels, orphan sheet entries, unconnected pins, and ambiguous junctions.'
    }),
    capability({
        id: 'project_netlist_exporter',
        label: 'Project netlist exporter',
        category: 'reporting',
        outputs: ['netlist JSON', 'wirelist'],
        summary:
            'Builds deterministic KiCad project netlist JSON and wirelist exports from design bundles.'
    })
])

/**
 * Builds parser and renderer capability inventories.
 */
export class KicadToolkitCapabilities {
    /**
     * Returns a filterable capability inventory.
     * @param {{ category?: string, safety?: string, includeCapabilities?: boolean }} [options] Inventory options.
     * @returns {object}
     */
    static inventory(options = {}) {
        const category = options.category || null
        const safety = options.safety || null
        if (category !== null && !Object.hasOwn(categoryInfo, category)) {
            throw new Error('Unknown capability category: ' + category)
        }
        if (safety !== null && !safetyClasses.includes(safety)) {
            throw new Error('Unknown capability safety class: ' + safety)
        }

        const records = capabilities.filter((record) => {
            return (
                (category === null || record.category === category) &&
                (safety === null || record.safety === safety)
            )
        })

        const response = {
            total: records.length,
            filters: { category, safety },
            availableCategories: Object.entries(categoryInfo).map(
                ([id, info]) => ({ id, ...info })
            ),
            categories: categoryCounts(records),
            safetyCounts: countBy(records, 'safety'),
            dependencyCounts: dependencyCounts(records),
            dryRunCounts: supportCounts(records, 'supportsDryRun', 'supported'),
            backupCounts: supportCounts(
                records,
                'createsBackup',
                'creates_backup'
            )
        }

        if (options.includeCapabilities !== false) {
            response.capabilities = records.map((record) => ({ ...record }))
        }

        return response
    }
}

/**
 * Builds a capability record with library defaults.
 * @param {object} record Capability fields.
 * @returns {object}
 */
function capability(record) {
    return Object.freeze({
        id: record.id,
        label: record.label,
        category: record.category,
        safety: 'read_only',
        requires: record.requires || [],
        outputs: record.outputs || [],
        supportsBrowser: record.supportsBrowser !== false,
        supportsNode: record.supportsNode !== false,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary: record.summary
    })
}

/**
 * Counts capabilities by category and attaches category metadata.
 * @param {object[]} records Capability records.
 * @returns {Record<string, object>}
 */
function categoryCounts(records) {
    const counts = countBy(records, 'category')
    return Object.fromEntries(
        Object.entries(categoryInfo)
            .filter(([id]) => counts[id])
            .map(([id, info]) => [id, { ...info, count: counts[id] }])
    )
}

/**
 * Counts records by one property.
 * @param {object[]} records Records.
 * @param {string} key Property name.
 * @returns {Record<string, number>}
 */
function countBy(records, key) {
    const counts = {}
    for (const record of records) {
        const value = String(record[key] || '')
        counts[value] = (counts[value] || 0) + 1
    }
    return Object.fromEntries(Object.entries(counts).sort())
}

/**
 * Counts dependency labels.
 * @param {object[]} records Capability records.
 * @returns {Record<string, number>}
 */
function dependencyCounts(records) {
    const counts = {}
    for (const record of records) {
        const dependencies = record.requires.length ? record.requires : ['none']
        for (const dependency of dependencies) {
            counts[dependency] = (counts[dependency] || 0) + 1
        }
    }
    return Object.fromEntries(Object.entries(counts).sort())
}

/**
 * Counts boolean support flags.
 * @param {object[]} records Capability records.
 * @param {string} key Flag key.
 * @param {string} supportedKey Output key for supported count.
 * @returns {{ [key: string]: number }}
 */
function supportCounts(records, key, supportedKey) {
    const supported = records.filter((record) => record[key] === true).length
    return {
        [supportedKey]: supported,
        unsupported: records.length - supported
    }
}
