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
    assert.equal(inventory.total, 42)
    assert.deepEqual(inventory.statusCounts, { implemented: 42 })
    assert.deepEqual(inventory.nativeCounts, {
        adapted_contract: 15,
        kicad_native: 27
    })
    assert.equal(inventory.featureCoverage.implemented, 42)
    assert.equal(inventory.featureCoverage.exempted, 7)
    assert.equal(inventory.featureCoverage.totalDocumented, 49)
    assert.equal(inventory.categories.parser_roots.count, 11)
    assert.equal(inventory.categories.project_loading.count, 10)
    assert.equal(inventory.categories.scene3d.count, 2)
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

    assert.equal(scene3d.total, 2)
    assert.deepEqual(Object.keys(scene3d.categories), ['scene3d'])
    assert.equal(scene3d.exemptions.length, 0)
    assert.deepEqual(
        scene3d.features.map((feature) => feature.id),
        ['pcb_scene3d_description', 'pcb_scene3d_model_assets']
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
