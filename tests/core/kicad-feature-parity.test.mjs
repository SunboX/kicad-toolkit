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
    assert.equal(inventory.total, 17)
    assert.deepEqual(inventory.statusCounts, { implemented: 17 })
    assert.deepEqual(inventory.nativeCounts, {
        adapted_contract: 2,
        kicad_native: 15
    })
    assert.equal(inventory.featureCoverage.implemented, 17)
    assert.equal(inventory.featureCoverage.exempted, 6)
    assert.equal(inventory.featureCoverage.totalDocumented, 23)
    assert.equal(inventory.categories.parser_roots.count, 2)
    assert.equal(inventory.categories.project_loading.count, 1)
    assert.equal(inventory.categories.scene3d.count, 2)
    assert.equal(inventory.exemptions.length, 6)

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
        reason: 'KiCad footprint libraries use KiCad-specific .kicad_mod or symbol-library workflows outside the current parser roots.',
        kicadEquivalent:
            'Footprint instances embedded in .kicad_pcb files are parsed through KicadPcbParser.',
        docs: ['spec/library-scope.md']
    })
})
