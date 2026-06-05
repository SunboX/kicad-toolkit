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

    const reporting = KicadToolkitCapabilities.inventory({
        category: 'reporting'
    })

    assert.equal(reporting.total, 6)
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
