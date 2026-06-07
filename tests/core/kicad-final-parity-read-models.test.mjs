// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import {
    KicadDesignRulesParser,
    KicadJobsetDigestBuilder,
    KicadPcbRigidFlexTopologyBuilder,
    KicadPcbRuleReadModelBuilder,
    KicadProjectOutputDigestBuilder,
    KicadSourceCoverageReportBuilder,
    SExpressionParser
} from '../../src/parser.mjs'

test('KicadPcbRuleReadModelBuilder normalizes KiCad custom and project rules', () => {
    const designRules = KicadDesignRulesParser.parse(
        `
        (version 1)
        (rule "wide power"
            (condition "A.NetClass == 'Power'")
            (severity warning)
            (constraint track_width (min 0.25mm) (opt 0.40mm) (max 1.00mm))
            (constraint clearance (min 0.20mm)))
        (assign_component_class "connectors"
            (condition "A.Reference =~ 'J*'"))
        `,
        { fileName: 'board.kicad_dru' }
    )
    const projectModel = {
        kind: 'project-metadata',
        fileName: 'board.kicad_pro',
        board: {
            designSettings: {
                rules: [
                    { name: 'minimum_clearance', value: '0.15 mm' },
                    { name: 'allow_blind_buried_vias', value: false }
                ],
                trackWidths: [0.25, 0.5],
                viaDimensions: [{ diameter: 0.8, drill: 0.4 }],
                diffPairDimensions: [{ width: 0.15, gap: 0.2 }]
            }
        },
        netSettings: {
            classes: [
                {
                    name: 'Power',
                    clearance: 0.2,
                    trackWidth: 0.4,
                    viaDiameter: 0.8,
                    viaDrill: 0.4,
                    nets: ['VBUS']
                }
            ]
        }
    }

    const report = KicadPcbRuleReadModelBuilder.build({
        designRules,
        projectModel
    })

    assert.equal(report.schema, 'kicad-toolkit.pcb.rule-read-model.a1')
    assert.deepEqual(report.summary, {
        ruleCount: 6,
        customRuleCount: 1,
        projectRuleCount: 5,
        netClassCount: 1,
        componentClassAssignmentCount: 1,
        constraintCount: 8,
        diagnosticCount: 0
    })
    assert.equal(report.rules[0].ruleType.kind, 'width')
    assert.equal(report.rules[0].ruleType.category, 'routing')
    assert.equal(report.rules[0].constraints[0].values.min.valueMm, 0.25)
    assert.equal(report.rules[0].constraints[0].typed.minWidthMm, 0.25)
    assert.equal(report.rules[0].constraints[0].typed.maxWidthMil, 39.370079)
    assert.equal(report.rules[1].ruleType.kind, 'clearance')
    assert.equal(report.rules[2].ruleType.kind, 'routing-vias')
    assert.equal(report.rules[5].ruleType.kind, 'differential-pair-routing')
    assert.deepEqual(report.componentClassAssignments, [
        {
            key: 'component-class-0',
            name: 'connectors',
            condition: "A.Reference =~ 'J*'",
            sourceFileName: 'board.kicad_dru'
        }
    ])
    assert.deepEqual(report.indexes.ruleKeysByKind.width, [
        'custom-rule-0',
        'project-rule-track-widths'
    ])
    assert.deepEqual(report.indexes.ruleKeysBySource.kicad_pro, [
        'project-rule-minimum-clearance',
        'project-rule-allow-blind-buried-vias',
        'project-rule-track-widths',
        'project-rule-via-dimensions',
        'project-rule-diff-pair-dimensions'
    ])
    assert.deepEqual(report.netClasses[0].ruleKeys, [
        'net-class-Power-clearance',
        'net-class-Power-track-width',
        'net-class-Power-via'
    ])
})

test('KicadSourceCoverageReportBuilder summarizes supported and preserved S-expression nodes', () => {
    const ast = SExpressionParser.parse(`
        (kicad_sch
            (version 20230121)
            (symbol (lib_id "Device:R") (at 10 20 0))
            (wire (pts (xy 1 2) (xy 3 4)))
            (mystery_node (value "kept")))
    `)

    const report = KicadSourceCoverageReportBuilder.build({
        kind: 'schematic',
        fileName: 'sheet.kicad_sch',
        schematic: { kicadAst: ast }
    })

    assert.equal(report.schema, 'kicad-toolkit.source.coverage.a1')
    assert.deepEqual(report.summary, {
        rootName: 'kicad_sch',
        nodeCount: 11,
        supportedNodeCount: 10,
        preservedOnlyNodeCount: 1,
        unsupportedNodeCount: 1,
        maxDepth: 4,
        diagnosticCount: 1
    })
    assert.deepEqual(report.nodesByName.mystery_node, {
        name: 'mystery_node',
        count: 1,
        family: 'unknown',
        supported: false,
        preserved: true,
        maxDepth: 1
    })
    assert.deepEqual(report.indexes.nodeNamesBySupport.unsupported, [
        'mystery_node'
    ])
    assert.deepEqual(report.indexes.nodeNamesByFamily.component, ['symbol'])
})

test('KicadProjectOutputDigestBuilder adapts jobsets into output groups and expected artifacts', () => {
    const jobset = {
        kind: 'jobset',
        fileName: 'fabrication.kicad_jobset',
        jobs: [
            {
                id: 'gerbers',
                type: 'gerber',
                description: 'Plot gerbers',
                output: 'fab',
                settings: { board: 'board.kicad_pcb' }
            },
            {
                id: 'bom',
                type: 'bom',
                description: 'Grouped BOM',
                output: 'docs',
                settings: { document: 'main.kicad_sch' }
            }
        ],
        outputs: [
            {
                id: 'fab',
                type: 'folder',
                description: 'Fabrication',
                settings: { output_path: 'fab' }
            },
            {
                id: 'docs',
                type: 'folder',
                description: 'Documentation',
                settings: { output_path: 'docs' }
            }
        ]
    }
    const jobsetDigest = KicadJobsetDigestBuilder.build(jobset)

    const digest = KicadProjectOutputDigestBuilder.build({
        jobsetDigest,
        projectModel: {
            project: {
                pages: [{ kind: 'pcb', fileName: 'board.kicad_pcb' }]
            }
        }
    })

    assert.equal(digest.schema, 'kicad-toolkit.project.output-digest.a1')
    assert.deepEqual(digest.summary, {
        jobsetCount: 1,
        outputGroupCount: 2,
        outputCount: 2,
        typedOutputCount: 2,
        unsupportedOutputCount: 0,
        expectedArtifactCount: 2
    })
    assert.deepEqual(
        digest.outputGroups.map((group) => [group.destinationId, group.name]),
        [
            ['docs', 'Documentation'],
            ['fab', 'Fabrication']
        ]
    )
    assert.equal(digest.outputGroups[1].outputs[0].normalizedType, 'gerber')
    assert.equal(
        digest.outputGroups[1].outputs[0].normalizedDocumentPath,
        'board.kicad_pcb'
    )
    assert.deepEqual(Object.keys(digest.outputsByDocumentPath), [
        'board.kicad_pcb',
        'main.kicad_sch'
    ])
    assert.equal(digest.expectedArtifacts.manifest.outputs[0].schema, undefined)
})

test('KicadPcbRigidFlexTopologyBuilder reports KiCad flat-stack and region status', () => {
    const topology = KicadPcbRigidFlexTopologyBuilder.build({
        layerStack: {
            layers: [
                { layerKey: 'F.Cu', name: 'F.Cu', role: 'copper' },
                {
                    layerKey: 'dielectric-1',
                    name: 'dielectric',
                    role: 'dielectric'
                },
                { layerKey: 'B.Cu', name: 'B.Cu', role: 'copper' }
            ]
        },
        regionSemantics: {
            boardRegions: [
                {
                    key: 'board-region-0',
                    name: 'Flex tail',
                    layerStackId: 'flex-tail',
                    isFlexRegion: true,
                    bendingLineCount: 2
                }
            ]
        }
    })

    assert.equal(topology.schema, 'kicad-toolkit.pcb.rigid-flex-topology.a1')
    assert.deepEqual(topology.summary, {
        topologyStatus: 'region-metadata-only',
        layerCount: 3,
        substackCount: 1,
        flexRegionCount: 1,
        rigidRegionCount: 0,
        branchCount: 0,
        bendLineCount: 2,
        diagnosticCount: 1
    })
    assert.deepEqual(topology.substackRegionJoins, [
        {
            substackId: 'flex-tail',
            substackName: 'flex-tail',
            isFlex: true,
            layerKeys: ['F.Cu', 'dielectric-1', 'B.Cu'],
            regionKeys: ['board-region-0'],
            regionNames: ['Flex tail']
        }
    ])
    assert.deepEqual(topology.branchGraph, [])
    assert.deepEqual(topology.bendLines, [
        {
            substackId: 'flex-tail',
            substackName: 'flex-tail',
            regionKey: 'board-region-0',
            regionName: 'Flex tail',
            lineIndex: 0
        },
        {
            substackId: 'flex-tail',
            substackName: 'flex-tail',
            regionKey: 'board-region-0',
            regionName: 'Flex tail',
            lineIndex: 1
        }
    ])
    assert.equal(
        topology.diagnostics[0].code,
        'kicad.pcb.rigid-flex.no-branch-topology'
    )
})
