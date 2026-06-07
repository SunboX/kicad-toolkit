// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { additionalFeatureParityRecords } from './KicadFeatureParityAdditionalFeatures.mjs'

const categoryInfo = Object.freeze({
    parser_roots: {
        label: 'Parser roots',
        description:
            'Native KiCad schematic, PCB, footprint, and symbol parser roots exposed as Circuit JSON.'
    },
    project_loading: {
        label: 'Project loading',
        description:
            'Direct KiCad board and project ZIP loading with documents and assets.'
    },
    model_contracts: {
        label: 'Model contracts',
        description:
            'Circuit JSON, renderer compatibility fields, and normalized schema publication.'
    },
    raw_inspectability: {
        label: 'Raw inspectability',
        description:
            'Preserved KiCad AST and board models for lower-level inspection.'
    },
    schematic_rendering: {
        label: 'Schematic rendering',
        description: 'Deterministic SVG output for recovered schematic content.'
    },
    pcb_rendering: {
        label: 'PCB rendering',
        description:
            'Deterministic SVG output for recovered board content and side views.'
    },
    bom_rendering: {
        label: 'BOM rendering',
        description: 'Grouped BOM HTML output for parsed component rows.'
    },
    netlist_query: {
        label: 'Netlist query',
        description:
            'Browser-safe loaded-design component, net, and connectivity queries.'
    },
    scene3d: {
        label: '3D scene data',
        description:
            'Host-renderer-neutral PCB scene descriptions and model asset metadata.'
    },
    worker_support: {
        label: 'Worker support',
        description: 'Parser worker entrypoint for host applications.'
    },
    renderer_css: {
        label: 'Renderer CSS',
        description: 'Optional stylesheet export for deterministic renderers.'
    },
    diagnostics_reporting: {
        label: 'Diagnostics and reporting',
        description:
            'Capability inventory, report normalization, and board readiness summaries.'
    },
    documentation_testing: {
        label: 'Documentation and testing',
        description: 'Published API docs, schema docs, scope docs, and tests.'
    }
})

const features = Object.freeze([
    feature({
        id: 'parse_kicad_schematic',
        label: 'Parse KiCad schematics',
        category: 'parser_roots',
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
    }),
    feature({
        id: 'parse_kicad_pcb',
        label: 'Parse KiCad boards',
        category: 'parser_roots',
        altiumCapability: 'Parse native .PcbDoc PCB documents.',
        kicadCapability: 'Parse native .kicad_pcb S-expression boards.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#pcb-fields'],
        tests: [
            'tests/core/kicad-parser.test.mjs',
            'tests/core/kicad-pcb-parser.test.mjs',
            'tests/ui/pcb-svg-renderer.test.mjs'
        ],
        summary:
            'KicadParser.parseArrayBuffer() returns Circuit JSON with PCB renderer compatibility fields.'
    }),
    feature({
        id: 'parse_kicad_footprint_library',
        label: 'Parse KiCad footprint libraries',
        category: 'parser_roots',
        altiumCapability: 'Parse native .PcbLib footprint libraries.',
        kicadCapability:
            'Parse standalone .kicad_mod S-expression footprint library files.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#library-fields'],
        tests: ['tests/core/kicad-library-parsers.test.mjs'],
        summary:
            'KicadFootprintLibraryParser.parse() and KicadParser.parseArrayBufferToRendererModel() recover standalone footprint pads, graphics, text, and models.'
    }),
    feature({
        id: 'parse_kicad_symbol_library',
        label: 'Parse KiCad symbol libraries',
        category: 'parser_roots',
        altiumCapability: 'Parse native schematic symbol libraries.',
        kicadCapability:
            'Parse standalone .kicad_sym S-expression symbol library files.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#library-fields'],
        tests: ['tests/core/kicad-library-parsers.test.mjs'],
        summary:
            'KicadSymbolLibraryParser.parse() and KicadParser.parseArrayBufferToRendererModel() recover standalone symbol properties, pins, units, and graphics.'
    }),
    feature({
        id: 'parse_kicad_library_tables',
        label: 'Parse KiCad library tables',
        category: 'parser_roots',
        altiumCapability: 'Parse project library references and search paths.',
        kicadCapability:
            'Parse KiCad fp-lib-table and sym-lib-table S-expression library rows.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#library-fields'],
        tests: ['tests/core/kicad-library-index.test.mjs'],
        summary:
            'KicadLibraryTableParser.parse() exposes library names, plugin types, URIs, options, descriptions, disabled flags, and resolved variables.'
    }),
    feature({
        id: 'parse_kicad_jobset',
        label: 'Parse KiCad jobsets',
        category: 'parser_roots',
        altiumCapability: 'Parse output job definitions.',
        kicadCapability:
            'Parse KiCad .kicad_jobset JSON job and output metadata.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#auxiliary-fields'],
        tests: ['tests/core/kicad-auxiliary-file-parsers.test.mjs'],
        summary:
            'KicadJobsetParser.parse() exposes KiCad output job rows and output destinations.'
    }),
    feature({
        id: 'parse_kicad_design_rules',
        label: 'Parse KiCad custom design rules',
        category: 'parser_roots',
        altiumCapability: 'Parse project design rules.',
        kicadCapability:
            'Parse KiCad .kicad_dru custom DRC rules and component class assignments.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#auxiliary-fields'],
        tests: ['tests/core/kicad-auxiliary-file-parsers.test.mjs'],
        summary:
            'KicadDesignRulesParser.parse() exposes custom rule names, conditions, layers, severities, constraints, disallow rows, and component class assignments.'
    }),
    feature({
        id: 'parse_kicad_worksheet',
        label: 'Parse KiCad worksheets',
        category: 'parser_roots',
        altiumCapability: 'Parse sheet/page template metadata.',
        kicadCapability: 'Parse KiCad .kicad_wks worksheet page-layout files.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#auxiliary-fields'],
        tests: ['tests/core/kicad-auxiliary-file-parsers.test.mjs'],
        summary:
            'KicadWorksheetParser.parse() exposes worksheet setup defaults and line, rectangle, text, polygon, and bitmap item metadata.'
    }),
    feature({
        id: 'parse_kicad_netlist',
        label: 'Parse KiCad netlists',
        category: 'parser_roots',
        altiumCapability: 'Parse exported netlists.',
        kicadCapability: 'Parse KiCad exported S-expression .net files.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#auxiliary-fields'],
        tests: ['tests/core/kicad-auxiliary-file-parsers.test.mjs'],
        summary:
            'KicadNetlistParser.parse() exposes exported components, component properties, nets, and net nodes.'
    }),
    feature({
        id: 'parse_kicad_footprint_associations',
        label: 'Parse KiCad footprint associations',
        category: 'parser_roots',
        altiumCapability: 'Parse component-to-footprint association files.',
        kicadCapability: 'Parse KiCad .cmp footprint association files.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#auxiliary-fields'],
        tests: ['tests/core/kicad-auxiliary-file-parsers.test.mjs'],
        summary:
            'KicadFootprintAssociationParser.parse() exposes reference, value, and footprint association rows.'
    }),
    feature({
        id: 'parse_kicad_legacy_libraries',
        label: 'Inspect legacy KiCad libraries',
        category: 'parser_roots',
        altiumCapability: 'Expose older library formats for inspection.',
        kicadCapability:
            'Expose lightweight inspection metadata for KiCad legacy .lib, .dcm, and .mod files.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#auxiliary-fields'],
        tests: ['tests/core/kicad-auxiliary-file-parsers.test.mjs'],
        summary:
            'KicadLegacyLibraryParser.parse() recovers legacy symbol, documentation, and footprint module summaries without converting them to modern documents.'
    }),
    feature({
        id: 'project_zip_loading',
        label: 'KiCad project ZIP loading',
        category: 'project_loading',
        altiumCapability:
            'Recover project document references, parameters, and outputs from native project files.',
        kicadCapability:
            'Load direct board files and project ZIP archives with schematics, boards, assets, summaries, BOM rows, and diagnostics.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#project-loading-fields'
        ],
        tests: [
            'tests/core/kicad-project-loader.test.mjs',
            'tests/core/kicad-project-loader-full.test.mjs'
        ],
        summary:
            'KicadProjectLoader.loadEntries() and loadFiles() provide local-first project loading.'
    }),
    feature({
        id: 'project_metadata_parser',
        label: 'KiCad project metadata parser',
        category: 'project_loading',
        altiumCapability:
            'Parse project-level native metadata, rules, classes, and variables.',
        kicadCapability:
            'Parse .kicad_pro JSON metadata, text variables, board design settings, net classes, sheets, and boards.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#project-fields'],
        tests: ['tests/core/kicad-project-metadata.test.mjs'],
        summary:
            'KicadProjectMetadataParser.parse() exposes KiCad project JSON in a normalized model root.'
    }),
    feature({
        id: 'project_design_bundle',
        label: 'Project design bundle',
        category: 'project_loading',
        kicadNative: false,
        altiumCapability:
            'Compose parsed project, schematic, PCB, BOM, PnP, variant, and net rows into one design bundle.',
        kicadCapability:
            'Compose parsed KiCad project, schematic, PCB, BOM, PnP, variant, and net rows into one design bundle.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#project-loading-fields'
        ],
        tests: ['tests/core/kicad-project-bundle.test.mjs'],
        summary:
            'ProjectDesignBundleBuilder and ProjectVariantViewBuilder expose a shared multi-document API.'
    }),
    feature({
        id: 'project_document_graph',
        label: 'Project document graph',
        category: 'project_loading',
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
    }),
    feature({
        id: 'kicad_library_index',
        label: 'KiCad library index',
        category: 'project_loading',
        altiumCapability:
            'Build searchable library manifests for project/library browsers.',
        kicadCapability:
            'Build searchable manifests from KiCad library tables, .pretty folders, .kicad_sym files, .kicad_symdir folders, and design blocks.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#library-fields'],
        tests: ['tests/core/kicad-library-index.test.mjs'],
        summary:
            'KicadLibraryIndexBuilder.build() composes table rows and local library items into one searchable manifest.'
    }),
    feature({
        id: 'kicad_library_search_index',
        label: 'KiCad library search index',
        category: 'project_loading',
        kicadNative: false,
        altiumCapability:
            'Search parsed library symbols and footprints with exact, keyword, and fuzzy matching.',
        kicadCapability:
            'Search KiCad footprint, symbol, and design block library items with exact, keyword, and fuzzy matching.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#library-fields'],
        tests: ['tests/core/kicad-parity-helper-apis.test.mjs'],
        summary:
            'KicadLibrarySearchIndex exposes Altium-style library search helpers over KiCad library indexes and standalone libraries.'
    }),
    feature({
        id: 'kicad_jobset_digest',
        label: 'KiCad jobset digest',
        category: 'project_loading',
        kicadNative: false,
        altiumCapability:
            'Build output-job digests with jobs grouped by destination document.',
        kicadCapability:
            'Build jobset digests with KiCad jobs grouped by output destination.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#auxiliary-fields'],
        tests: ['tests/core/kicad-parity-helper-apis.test.mjs'],
        summary:
            'KicadJobsetDigestBuilder indexes parsed .kicad_jobset jobs, destinations, and output paths.'
    }),
    feature({
        id: 'kicad_asset_inventory',
        label: 'KiCad asset inventory',
        category: 'project_loading',
        kicadNative: false,
        altiumCapability:
            'Inventory embedded and companion binary payloads from parsed documents.',
        kicadCapability:
            'Inventory KiCad embedded files, schematic images, worksheet bitmaps, 3D model references, and companion assets.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#project-loading-fields'
        ],
        tests: ['tests/core/kicad-parity-helper-apis.test.mjs'],
        summary:
            'KicadEmbeddedAssetInventoryBuilder exposes a unified read-only asset inventory.'
    }),
    feature({
        id: 'parse_kicad_design_blocks',
        label: 'Parse KiCad design blocks',
        category: 'project_loading',
        altiumCapability: 'Expose reusable design snippets and library items.',
        kicadCapability:
            'Index KiCad .kicad_blocks and .kicad_block folder metadata.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#library-fields'],
        tests: ['tests/core/kicad-auxiliary-file-parsers.test.mjs'],
        summary:
            'KicadDesignBlockLibraryParser.build() exposes design block metadata, schematic files, and board files.'
    }),
    feature({
        id: 'circuit_json_model_contract',
        label: 'Circuit JSON model contract',
        category: 'model_contracts',
        kicadNative: false,
        altiumCapability:
            'Emit Circuit JSON arrays with renderer compatibility fields.',
        kicadCapability:
            'Emit Circuit JSON arrays with KiCad renderer compatibility fields.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#circuit-json-fields'
        ],
        tests: [
            'tests/core/kicad-parser-circuit-json-api.test.mjs',
            'tests/core/circuit-json-model-adapter.test.mjs'
        ],
        summary:
            'CircuitJsonModelAdapter and CircuitJsonModelSchema expose the same serialized model convention.'
    }),
    feature({
        id: 'normalized_schema_publication',
        label: 'Normalized schema publication',
        category: 'model_contracts',
        kicadNative: false,
        altiumCapability:
            'Publish versioned normalized renderer compatibility schema metadata.',
        kicadCapability:
            'Publish the KiCad normalized model schema id and JSON schema contract.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/model-format.md#schema-contracts',
            'docs/schemas/kicad_toolkit/normalized_model_a1.schema.json'
        ],
        tests: [
            'tests/project-structure.test.mjs',
            'tests/api-entrypoints.test.mjs'
        ],
        summary:
            'NormalizedModelSchema.CURRENT_SCHEMA_ID identifies the KiCad compatibility contract.'
    }),
    feature({
        id: 'semantic_svg_metadata',
        label: 'Semantic SVG metadata',
        category: 'model_contracts',
        kicadNative: false,
        altiumCapability:
            'Attach semantic SVG data attributes and metadata sidecars to rendered documents.',
        kicadCapability:
            'Attach KiCad PCB and schematic semantic SVG data attributes, metadata sidecars, and deterministic layer SVG exports.',
        entrypoints: ['kicad-toolkit/renderers', 'kicad-toolkit'],
        docs: [
            'docs/api.md#renderers',
            'docs/model-format.md#schema-contracts'
        ],
        tests: ['tests/ui/kicad-svg-semantic-metadata.test.mjs'],
        summary:
            'PCB and schematic SVG renders expose semantic element, layer, net, component, pin, pad, and drill metadata.'
    }),
    feature({
        id: 'renderer_helper_api',
        label: 'Renderer helper API',
        category: 'model_contracts',
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
    }),
    feature({
        id: 'svg_model_cross_link_validation',
        label: 'SVG model cross-link validation',
        category: 'model_contracts',
        kicadNative: false,
        altiumCapability:
            'Validate semantic SVG links against normalized parser model records.',
        kicadCapability:
            'Validate KiCad semantic SVG data-element-key attributes and references against parsed schematic and PCB models.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#schema-contracts'],
        tests: ['tests/core/kicad-ci-parity-helpers.test.mjs'],
        summary:
            'KicadSvgModelCrossLinkValidator reports missing, orphaned, and unresolved semantic SVG links.'
    }),
    feature({
        id: 'raw_kicad_inspectability',
        label: 'Raw KiCad inspectability',
        category: 'raw_inspectability',
        altiumCapability:
            'Preserve raw or partially decoded native primitive data for inspection.',
        kicadCapability:
            'Preserve schematic.kicadAst and pcb.kicadBoard for lower-level inspection.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/model-format.md#schematic-fields',
            'docs/model-format.md#pcb-fields'
        ],
        tests: [
            'tests/core/kicad-parser.test.mjs',
            'tests/core/kicad-pcb-parser.test.mjs'
        ],
        summary:
            'Parsed KiCad source structure remains available without requiring host applications to reparse files.'
    }),
    feature({
        id: 'schematic_svg_rendering',
        label: 'Schematic SVG rendering',
        category: 'schematic_rendering',
        altiumCapability: 'Render deterministic schematic SVG markup.',
        kicadCapability: 'Render deterministic KiCad schematic SVG markup.',
        entrypoints: ['kicad-toolkit/renderers', 'kicad-toolkit'],
        docs: ['docs/api.md#renderers'],
        tests: [
            'tests/ui/schematic-svg-renderer.test.mjs',
            'tests/ui/kicad-renderers-api.test.mjs'
        ],
        summary:
            'SchematicSvgRenderer.render() emits deterministic markup without DOM state.'
    }),
    feature({
        id: 'pcb_svg_rendering',
        label: 'PCB SVG rendering',
        category: 'pcb_rendering',
        altiumCapability: 'Render deterministic PCB SVG markup.',
        kicadCapability: 'Render deterministic KiCad board SVG markup.',
        entrypoints: ['kicad-toolkit/renderers', 'kicad-toolkit'],
        docs: ['docs/api.md#renderers'],
        tests: [
            'tests/ui/pcb-svg-renderer.test.mjs',
            'tests/ui/pcb-svg-renderer-pad-strokes.test.mjs',
            'tests/ui/kicad-renderers-api.test.mjs'
        ],
        summary:
            'PcbSvgRenderer.render() emits board, copper, drawing, pad, via, and text markup.'
    }),
    feature({
        id: 'pcb_side_resolved_rendering',
        label: 'Side-resolved PCB rendering',
        category: 'pcb_rendering',
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
    }),
    feature({
        id: 'bom_table_rendering',
        label: 'BOM table rendering',
        category: 'bom_rendering',
        altiumCapability: 'Render grouped BOM table HTML.',
        kicadCapability: 'Render grouped KiCad BOM table HTML.',
        entrypoints: ['kicad-toolkit/renderers', 'kicad-toolkit'],
        docs: ['docs/api.md#renderers'],
        tests: ['tests/ui/kicad-renderers-api.test.mjs'],
        summary:
            'BomTableRenderer.render() accepts grouped parser BOM rows and returns deterministic HTML.'
    }),
    feature({
        id: 'kicad_library_render_manifests',
        label: 'KiCad library render manifests',
        category: 'project_loading',
        kicadNative: false,
        altiumCapability:
            'Build deterministic render/export manifests for parsed libraries.',
        kicadCapability:
            'Build deterministic render/export manifests for KiCad footprint, symbol, design-block, and mixed library indexes.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/model-format.md#library-fields'],
        tests: ['tests/core/kicad-parity-helper-apis.test.mjs'],
        summary:
            'KicadLibraryRenderManifestBuilder gives library browsers stable SVG/export keys.'
    }),
    feature({
        id: 'loaded_design_netlist_query',
        label: 'Loaded-design netlist query',
        category: 'netlist_query',
        altiumCapability:
            'Search loaded designs, components, nets, pin connections, and connectivity.',
        kicadCapability:
            'Search loaded KiCad designs, components, nets, pin connections, and connectivity.',
        entrypoints: ['kicad-toolkit/netlist-query'],
        docs: ['docs/api.md#netlist-query'],
        tests: ['tests/core/netlist-query.test.mjs'],
        summary:
            'LoadedDesignNetlistService exposes browser-safe query helpers over host-provided documents.'
    }),
    feature({
        id: 'project_netlist_export',
        label: 'Project netlist export',
        category: 'netlist_query',
        kicadNative: false,
        altiumCapability:
            'Build deterministic project netlist JSON and wirelist exports.',
        kicadCapability:
            'Build deterministic KiCad project netlist JSON and wirelist exports from design bundles or variant views.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: [
            'docs/api.md#parser',
            'docs/model-format.md#project-loading-fields'
        ],
        tests: ['tests/core/kicad-project-bundle.test.mjs'],
        summary:
            'ProjectNetlistExporter emits kicad-toolkit.netlist.a1 JSON and line-oriented wirelists.'
    }),
    feature({
        id: 'pcb_scene3d_description',
        label: 'PCB 3D scene description',
        category: 'scene3d',
        altiumCapability:
            'Build data-only PCB 3D scene descriptions for host applications.',
        kicadCapability:
            'Build data-only KiCad PCB 3D scene descriptions for host applications.',
        entrypoints: ['kicad-toolkit/scene3d', 'kicad-toolkit'],
        docs: ['docs/api.md#3d-scene-data'],
        tests: ['tests/scene3d-api.test.mjs'],
        summary:
            'PcbScene3dBuilder.build() emits board, placement, copper, zone, text, and silkscreen detail.'
    }),
    feature({
        id: 'pcb_scene3d_model_assets',
        label: 'PCB 3D model assets',
        category: 'scene3d',
        altiumCapability:
            'Resolve embedded or session model candidates for 3D component placements.',
        kicadCapability:
            'Resolve KiCad companion model candidates and external placement metadata.',
        entrypoints: ['kicad-toolkit/scene3d', 'kicad-toolkit'],
        docs: ['docs/api.md#3d-scene-data'],
        tests: ['tests/scene3d-api.test.mjs'],
        summary:
            'PcbScene3dModelRegistry and externalPlacements expose model metadata without loading meshes.'
    }),
    feature({
        id: 'parser_worker_entrypoint',
        label: 'Parser worker entrypoint',
        category: 'worker_support',
        altiumCapability: 'Expose a parser worker entrypoint for hosts.',
        kicadCapability: 'Expose a KiCad parser worker entrypoint for hosts.',
        entrypoints: ['kicad-toolkit/workers/kicad-parser.worker.mjs'],
        docs: ['docs/api.md#entrypoints'],
        tests: ['tests/workers/kicad-parser-worker.test.mjs'],
        summary:
            'The worker parses host-provided KiCad document messages without app state.'
    }),
    feature({
        id: 'renderer_css_entrypoint',
        label: 'Renderer CSS entrypoint',
        category: 'renderer_css',
        altiumCapability: 'Publish optional renderer CSS.',
        kicadCapability: 'Publish optional KiCad renderer CSS.',
        entrypoints: ['kicad-toolkit/styles/kicad-renderers.css'],
        docs: ['README.md', 'docs/api.md#entrypoints'],
        tests: ['tests/project-structure.test.mjs'],
        summary:
            'The package exports renderer CSS without requiring host DOM wiring.'
    }),
    feature({
        id: 'diagnostics_and_readiness_reporting',
        label: 'Diagnostics and readiness reporting',
        category: 'diagnostics_reporting',
        altiumCapability:
            'Expose parser diagnostics and reusable feature/reporting helpers.',
        kicadCapability:
            'Expose parser diagnostics, capability inventory, DRC/ERC normalization, and parsed-board readiness summaries.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/capabilities.md', 'docs/api.md#capabilities-and-reports'],
        tests: ['tests/core/kicad-capabilities-readiness.test.mjs'],
        summary:
            'KicadToolkitCapabilities and KicadReadinessReport provide data-only diagnostics support.'
    }),
    feature({
        id: 'kicad_schematic_connectivity_qa',
        label: 'KiCad schematic connectivity QA',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Build read-only schematic connectivity QA reports from parsed schematic models.',
        kicadCapability:
            'Build read-only KiCad schematic connectivity QA reports for implicit nets, dangling labels, orphan sheet entries, unconnected pins, and ambiguous junctions.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#capabilities-and-reports'],
        tests: ['tests/core/kicad-parity-helper-apis.test.mjs'],
        summary:
            'KicadSchematicConnectivityQaBuilder exposes schematic-local connectivity findings without invoking KiCad.'
    }),
    feature({
        id: 'ci_artifact_bundle',
        label: 'CI artifact bundle',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Build deterministic CI artifact packages from parsed project documents.',
        kicadCapability:
            'Build deterministic KiCad CI artifact packages with design bundles, document graphs, netlists, SVGs, asset inventories, readiness reports, and schematic QA.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/capabilities.md'],
        tests: ['tests/core/kicad-ci-parity-helpers.test.mjs'],
        summary:
            'KicadCiArtifactBundleBuilder composes data-only parser, renderer, report, and netlist artifacts for CI workflows.'
    }),
    feature({
        id: 'parser_compatibility_fuzzer',
        label: 'Parser compatibility fuzzer',
        category: 'diagnostics_reporting',
        kicadNative: false,
        altiumCapability:
            'Run deterministic synthetic parser compatibility smoke cases.',
        kicadCapability:
            'Run deterministic synthetic KiCad parser compatibility smoke cases.',
        entrypoints: ['kicad-toolkit/parser', 'kicad-toolkit'],
        docs: ['docs/api.md#parser', 'docs/capabilities.md'],
        tests: ['tests/core/kicad-ci-parity-helpers.test.mjs'],
        summary:
            'KicadParserCompatibilityFuzzer exercises schematic, PCB, project metadata, and jobset parser entrypoints.'
    }),
    feature({
        id: 'documentation_and_tests',
        label: 'Documentation and tests',
        category: 'documentation_testing',
        altiumCapability:
            'Publish API, model, scope, testing, and schema documentation with tests.',
        kicadCapability:
            'Publish KiCad API, model, scope, testing, capability, and schema documentation with tests.',
        entrypoints: ['README.md', 'docs/api.md', 'docs/model-format.md'],
        docs: [
            'README.md',
            'docs/api.md',
            'docs/model-format.md',
            'docs/testing.md'
        ],
        tests: [
            'tests/project-structure.test.mjs',
            'tests/package-layout.test.mjs',
            'tests/mjs-line-limit.test.mjs'
        ],
        summary:
            'Project structure tests keep public package documentation and layout auditable.'
    }),
    ...additionalFeatureParityRecords.map(feature)
])

const exemptions = Object.freeze([
    exemption({
        id: 'ole_compound_document',
        label: 'OLE compound document parsing',
        altiumCapability:
            'Read Altium native compound document stream containers.',
        reason: 'KiCad schematic and PCB files are text S-expressions, and KiCad projects are loaded from normal files or ZIP archives.',
        kicadEquivalent: 'SExpressionParser and KicadProjectLoader'
    }),
    exemption({
        id: 'altium_binary_primitives',
        label: 'Altium binary primitive parsing',
        altiumCapability:
            'Decode Altium binary primitive streams and primitive sidecar streams.',
        reason: 'KiCad board and schematic documents store primitives as S-expression nodes rather than Altium binary records.',
        kicadEquivalent:
            'KicadPcbParser, KicadPcbDrawingParser, KicadPcbPadParser, and KicadSchematicParser'
    }),
    exemption({
        id: 'pcb_library_streams',
        label: 'Altium PCB library stream parsing',
        altiumCapability: 'Parse .PcbLib footprint library streams.',
        reason: 'KiCad footprint libraries are text .kicad_mod files in .pretty folders rather than Altium .PcbLib compound streams.',
        kicadEquivalent: 'KicadFootprintLibraryParser and KicadPcbParser'
    }),
    exemption({
        id: 'prjpcb_ini_parser',
        label: 'Altium PrjPcb INI parsing',
        altiumCapability:
            'Parse .PrjPcb sections, document groups, variants, configurations, and output groups.',
        reason: 'KiCad project loading is file/archive based and currently exposes project summaries, documents, BOM rows, nets, assets, and diagnostics.',
        kicadEquivalent: 'KicadProjectLoader'
    }),
    exemption({
        id: 'draftsman_digest_parser',
        label: 'Altium Draftsman digest parsing',
        altiumCapability: 'Parse Altium Draftsman drawing container digests.',
        reason: 'KiCad drawing sheets, worksheets, and fabrication outputs are represented by .kicad_wks, .kicad_jobset, and generated output metadata rather than an Altium Draftsman container.',
        kicadEquivalent:
            'KicadWorksheetParser, KicadJobsetParser, KicadJobsetDigestBuilder, and KicadProjectDocumentGraphBuilder'
    }),
    exemption({
        id: 'altium_raw_record_registry',
        label: 'Altium raw record registry',
        altiumCapability:
            'Preserve unsupported or partially decoded Altium binary record payloads in a registry.',
        reason: 'KiCad parsed models already preserve inspectable source structure as S-expression ASTs and raw board models.',
        kicadEquivalent: 'schematic.kicadAst and pcb.kicadBoard'
    }),
    exemption({
        id: 'altium_embedded_binary_payloads',
        label: 'Altium embedded binary payload extraction',
        altiumCapability:
            'Extract embedded Altium STEP and font payload metadata from native streams.',
        reason: 'KiCad component 3D models are referenced as companion assets, and KiCad stroke text rendering does not require Altium font stream extraction.',
        kicadEquivalent:
            'KicadProjectLoader assets, PcbScene3dModelRegistry, and KicadStrokeFont'
    })
])

/**
 * Reports KiCad-native feature parity against Altium Toolkit capabilities.
 */
export class KicadFeatureParity {
    /**
     * Returns a filterable feature parity inventory.
     * @param {{ category?: string, status?: string, includeFeatures?: boolean, includeExemptions?: boolean }} [options] Inventory options.
     * @returns {object}
     */
    static inventory(options = {}) {
        const category = normalizeFilter(options.category)
        const status = normalizeFilter(options.status)
        const records = features.filter((record) => {
            return (
                (category === null || record.category === category) &&
                (status === null || record.status === status)
            )
        })
        const response = {
            total: records.length,
            implemented:
                records.length > 0 &&
                records.every((record) => record.status === 'implemented'),
            filters: { category, status },
            availableCategories: Object.entries(categoryInfo).map(
                ([id, info]) => ({ id, ...info })
            ),
            categories: categoryCounts(records),
            statusCounts: countBy(records, 'status'),
            nativeCounts: nativeCounts(records),
            featureCoverage: {
                implemented: records.filter(
                    (record) => record.status === 'implemented'
                ).length,
                exempted:
                    category === null && status === null
                        ? exemptions.length
                        : 0,
                totalDocumented:
                    records.length +
                    (category === null && status === null
                        ? exemptions.length
                        : 0)
            }
        }

        if (options.includeFeatures !== false) {
            response.features = records.map(cloneRecord)
        }

        if (options.includeExemptions !== false) {
            response.exemptions =
                category === null && status === null
                    ? exemptions.map(cloneRecord)
                    : []
        }

        return response
    }
}

/**
 * Builds an implemented feature record.
 * @param {object} record Feature fields.
 * @returns {object}
 */
function feature(record) {
    return Object.freeze({
        id: record.id,
        label: record.label,
        category: record.category,
        status: 'implemented',
        kicadNative: record.kicadNative !== false,
        altiumCapability: record.altiumCapability,
        kicadCapability: record.kicadCapability,
        entrypoints: Object.freeze([...(record.entrypoints || [])]),
        docs: Object.freeze([...(record.docs || [])]),
        tests: Object.freeze([...(record.tests || [])]),
        summary: record.summary
    })
}

/**
 * Builds a source-format exemption record.
 * @param {object} record Exemption fields.
 * @returns {object}
 */
function exemption(record) {
    return Object.freeze({
        id: record.id,
        label: record.label,
        altiumCapability: record.altiumCapability,
        reason: record.reason,
        kicadEquivalent: record.kicadEquivalent,
        docs: Object.freeze(['spec/library-scope.md'])
    })
}

/**
 * Normalizes one optional string filter.
 * @param {string | undefined | null} value Filter value.
 * @returns {string | null}
 */
function normalizeFilter(value) {
    if (value === undefined || value === null || value === '') return null
    return String(value)
}

/**
 * Counts features by category and attaches category metadata.
 * @param {object[]} records Feature records.
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
 * Counts native versus adapted contract features.
 * @param {object[]} records Feature records.
 * @returns {{ adapted_contract: number, kicad_native: number }}
 */
function nativeCounts(records) {
    const kicadNative = records.filter(
        (record) => record.kicadNative === true
    ).length
    return {
        adapted_contract: records.length - kicadNative,
        kicad_native: kicadNative
    }
}

/**
 * Clones an immutable record into a plain object with mutable arrays.
 * @param {object} record Source record.
 * @returns {object}
 */
function cloneRecord(record) {
    const clone = { ...record }
    for (const key of ['entrypoints', 'docs', 'tests']) {
        if (Array.isArray(record[key])) clone[key] = [...record[key]]
    }
    return clone
}
