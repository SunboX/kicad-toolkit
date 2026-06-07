// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadReadinessReport } from '../../src/core/kicad/KicadReadinessReport.mjs'
import { KicadToolkitCapabilities } from '../../src/core/kicad/KicadToolkitCapabilities.mjs'

test('KicadToolkitCapabilities inventories parser renderer and reporting capabilities', () => {
    const inventory = KicadToolkitCapabilities.inventory()
    const byId = new Map(
        inventory.capabilities.map((capability) => [capability.id, capability])
    )

    assert.equal(inventory.filters.category, null)
    assert.equal(inventory.filters.safety, null)
    assert.ok(inventory.total >= 12)
    assert.ok(inventory.categories.parser.count >= 3)
    assert.ok(inventory.categories.rendering.count >= 3)
    assert.ok(inventory.categories.reporting.count >= 2)
    assert.equal(inventory.safetyCounts.read_only, inventory.total)
    assert.equal(inventory.dryRunCounts.supported, 0)
    assert.equal(inventory.backupCounts.creates_backup, 0)

    assert.deepEqual(byId.get('kicad_readiness_report'), {
        id: 'kicad_readiness_report',
        label: 'Readiness report',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['summary', 'findings'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Summarizes parsed board readiness using recovered model data only.'
    })
    assert.deepEqual(byId.get('kicad_schematic_connectivity_qa'), {
        id: 'kicad_schematic_connectivity_qa',
        label: 'Schematic connectivity QA',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['summary', 'findings'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Reports schematic-local implicit nets, dangling labels, orphan sheet entries, unconnected pins, and ambiguous junctions.'
    })
    assert.deepEqual(byId.get('renderer_helper_api'), {
        id: 'renderer_helper_api',
        label: 'Renderer helper API',
        category: 'rendering',
        safety: 'read_only',
        requires: [],
        outputs: ['SVG helpers', 'text metrics', 'parameter resolver'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Exposes deterministic SVG utility, semantic metadata, schematic parameter, and stroke-text metric helpers.'
    })
    assert.deepEqual(byId.get('schematic_render_ops_sidecar'), {
        id: 'schematic_render_ops_sidecar',
        label: 'Schematic render-operation sidecar',
        category: 'rendering',
        safety: 'read_only',
        requires: [],
        outputs: ['render operation sidecar'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Builds deterministic KiCad schematic SVG render-operation metadata for CI diffs.'
    })
    assert.deepEqual(byId.get('ci_artifact_bundle'), {
        id: 'ci_artifact_bundle',
        label: 'CI artifact bundle',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['artifact bundle'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Composes deterministic parser, renderer, netlist, document graph, asset, readiness, and QA outputs for CI.'
    })
    assert.deepEqual(byId.get('contract_gate_report'), {
        id: 'contract_gate_report',
        label: 'Contract gate report',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['contract gate report'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Builds deterministic CI pass/fail gates for normalized models, netlists, SVG model links, and diagnostics.'
    })
    assert.deepEqual(byId.get('pcb_route_analysis'), {
        id: 'pcb_route_analysis',
        label: 'PCB route analysis',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['route analysis'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Builds deterministic routed-net summaries from KiCad tracks, arcs, and vias.'
    })
    assert.deepEqual(byId.get('pcb_layer_stack_read_model'), {
        id: 'pcb_layer_stack_read_model',
        label: 'PCB layer-stack read model',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['layer-stack read model'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Builds KiCad PCB stackup material, dielectric, and thickness summaries.'
    })
    assert.deepEqual(byId.get('project_output_digest'), {
        id: 'project_output_digest',
        label: 'Project output digest',
        category: 'project_loading',
        safety: 'read_only',
        requires: [],
        outputs: ['output digest'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Builds KiCad jobset output groups, document lookups, and expected artifact manifests.'
    })
    assert.deepEqual(byId.get('pcb_pick_place_position_resolver'), {
        id: 'pcb_pick_place_position_resolver',
        label: 'PCB pick-place position resolver',
        category: 'project_loading',
        safety: 'read_only',
        requires: [],
        outputs: ['pnp model'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Builds KiCad footprint-origin and pad-anchor-center PnP coordinate views.'
    })
    assert.deepEqual(byId.get('pcb_component_participation_policy'), {
        id: 'pcb_component_participation_policy',
        label: 'PCB component participation policy',
        category: 'geometry_metadata',
        safety: 'read_only',
        requires: [],
        outputs: ['component policy'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Normalizes KiCad footprint attributes into BOM, PnP, and netlist participation flags.'
    })
    assert.deepEqual(byId.get('host_capability_diagnostics'), {
        id: 'host_capability_diagnostics',
        label: 'Host capability diagnostics',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['host capabilities'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Builds deterministic host capability and fallback diagnostics for KiCad render hosts.'
    })
    assert.deepEqual(byId.get('source_coverage_report'), {
        id: 'source_coverage_report',
        label: 'Source coverage report',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['source coverage report'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Reports supported and preserved KiCad S-expression node families.'
    })
    assert.deepEqual(byId.get('pcb_placed_footprint_manifest'), {
        id: 'pcb_placed_footprint_manifest',
        label: 'PCB placed footprint manifest',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['footprint extraction manifest'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Builds .kicad_mod-style extraction descriptors for placed KiCad footprints.'
    })
    assert.deepEqual(byId.get('pcb_review_metadata'), {
        id: 'pcb_review_metadata',
        label: 'PCB review metadata',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['review metadata'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Builds KiCad routed-net review groups and board assembly review metadata from parser sidecars.'
    })
    assert.deepEqual(byId.get('footprint_library_parity_report'), {
        id: 'footprint_library_parity_report',
        label: 'Footprint library parity report',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['footprint library parity'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Reports KiCad footprint-library advanced pad, graphic, and model fields.'
    })
    assert.deepEqual(byId.get('image_payload_manifest'), {
        id: 'image_payload_manifest',
        label: 'Image payload manifest',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['image payload manifest'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Checksums KiCad schematic images, worksheet bitmaps, PCB images, and embedded schematic files.'
    })
    assert.deepEqual(byId.get('project_bom_pnp_reconciliation'), {
        id: 'project_bom_pnp_reconciliation',
        label: 'Project BOM/PnP reconciliation',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['reconciliation report'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Compares schematic BOM, PCB BOM, PnP, DNP, exclude-from-BOM, and exclude-from-position-file designators.'
    })
    assert.deepEqual(byId.get('library_qa_report'), {
        id: 'library_qa_report',
        label: 'Library QA report',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['library QA report'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Reports duplicate library items, merge-plan conflicts, unresolved footprint references, missing model assets, and symbol unit mismatches.'
    })
    assert.deepEqual(byId.get('schematic_document_qa'), {
        id: 'schematic_document_qa',
        label: 'Schematic document QA',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['schematic QA report'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Reports unresolved schematic text variables, title-block gaps, and document style summaries.'
    })
    assert.deepEqual(byId.get('pcb_rule_read_model'), {
        id: 'pcb_rule_read_model',
        label: 'PCB rule read model',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['rule read model'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary: 'Builds typed KiCad custom-rule and project-rule summaries.'
    })
    assert.deepEqual(byId.get('pcb_rigid_flex_topology'), {
        id: 'pcb_rigid_flex_topology',
        label: 'PCB rigid-flex topology',
        category: 'reporting',
        safety: 'read_only',
        requires: [],
        outputs: ['rigid-flex topology'],
        supportsBrowser: true,
        supportsNode: true,
        supportsDryRun: false,
        createsBackup: false,
        mutatesInput: false,
        summary:
            'Reports KiCad flat-stack and region-metadata rigid-flex topology status.'
    })

    const reporting = KicadToolkitCapabilities.inventory({
        category: 'reporting'
    })

    assert.equal(reporting.total, 24)
    assert.deepEqual(Object.keys(reporting.categories), ['reporting'])
})

test('KicadReadinessReport normalizes DRC and ERC report issues', () => {
    const drc = KicadReadinessReport.parseDrcReport(
        {
            violations: [
                {
                    severity: 'error',
                    rule: 'clearance',
                    description: 'Copper items are too close',
                    items: [{ uuid: 'a' }, { uuid: 'b' }]
                }
            ],
            warnings: [
                {
                    type: 'courtyard_overlap',
                    message: 'Courtyard overlap'
                }
            ],
            nested: {
                unconnected_items: [
                    {
                        uuid: 'pad-1',
                        description: 'Pad is not connected'
                    }
                ]
            }
        },
        { includeItems: false }
    )

    assert.equal(drc.reportType, 'drc')
    assert.equal(drc.total, 3)
    assert.deepEqual(drc.bySeverity, { error: 1, warning: 2 })
    assert.deepEqual(drc.byRule, {
        clearance: 1,
        courtyard_overlap: 1,
        unconnected_items: 1
    })
    assert.equal(drc.issues[0].message, 'Copper items are too close')
    assert.equal('items' in drc.issues[0], false)

    const ercSummary = KicadReadinessReport.summarizeErcReport(
        JSON.stringify({
            violations: [
                {
                    level: 'warning',
                    type: 'pin_not_connected',
                    message: 'Pin is not connected'
                }
            ]
        })
    )

    assert.deepEqual(ercSummary, {
        reportType: 'erc',
        total: 1,
        bySeverity: { warning: 1 },
        byRule: { pin_not_connected: 1 },
        byCategory: { violations: 1 },
        examples: [
            {
                category: 'violations',
                severity: 'warning',
                rule: 'pin_not_connected',
                message: 'Pin is not connected'
            }
        ]
    })
})

test('KicadReadinessReport summarizes fabrication readiness from parsed board data', () => {
    const blocked = KicadReadinessReport.fabricationReadiness({
        layers: [{ name: 'F.Cu' }],
        outlines: [],
        footprints: [],
        pads: [],
        drawings: [],
        nets: []
    })

    assert.equal(blocked.ok, false)
    assert.equal(blocked.readiness, 'blocked')
    assert.deepEqual(blocked.findingCounts, {
        blocker: 2,
        warning: 1,
        info: 0
    })
    assert.deepEqual(
        blocked.findings.map((finding) => finding.kind),
        ['insufficient_copper_layers', 'missing_board_outline', 'no_footprints']
    )

    const ready = KicadReadinessReport.fabricationReadiness({
        layers: [{ name: 'F.Cu' }, { name: 'B.Cu' }],
        outlines: [
            {
                type: 'polygon',
                layer: 'Edge.Cuts',
                points: [
                    { x: 0, y: 0 },
                    { x: 20, y: 0 },
                    { x: 20, y: 10 },
                    { x: 0, y: 10 }
                ]
            }
        ],
        footprints: [
            {
                reference: 'U1',
                models: [{ path: '${KIPRJMOD}/body.step', visible: true }]
            }
        ],
        pads: [
            { footprintReference: 'U1', number: '1', netName: 'GND' },
            { footprintReference: 'U1', number: '2', netName: 'GND' }
        ],
        drawings: [
            {
                type: 'segment',
                netName: 'GND',
                layer: 'F.Cu',
                start: { x: 1, y: 1 },
                end: { x: 2, y: 1 }
            }
        ],
        nets: [{ netIndex: 1, name: 'GND' }],
        bounds: { minX: 0, minY: 0, maxX: 20, maxY: 10 }
    })

    assert.equal(ready.ok, true)
    assert.equal(ready.readiness, 'ready')
    assert.equal(ready.score, 100)
    assert.deepEqual(ready.findings, [])
    assert.deepEqual(ready.statistics, {
        footprintCount: 1,
        padCount: 2,
        netCount: 1,
        trackCount: 1,
        viaCount: 0,
        zoneCount: 0,
        copperLayerCount: 2
    })
})
