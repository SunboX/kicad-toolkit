// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadPcb3dModelReadinessReportBuilder } from '../../src/legacy-parser.mjs'

test('KicadPcb3dModelReadinessReportBuilder names procedural fallback packages', () => {
    const report = KicadPcb3dModelReadinessReportBuilder.build({
        components: [
            {
                componentIndex: 0,
                designator: 'Q1',
                footprintId: 'Package_TO_SOT:SOT-23',
                pattern: 'Package_TO_SOT:SOT-23',
                width: 130,
                depth: 95,
                height: 40,
                models: []
            }
        ]
    })

    assert.equal(report.models[0].fallback, true)
    assert.deepEqual(report.models[0].fallbackPackage, {
        family: 'sot',
        sizeMil: {
            width: 130,
            depth: 95,
            height: 40
        }
    })
    assert.equal(report.diagnostics[0].fallbackFamily, 'sot')
    assert.deepEqual(report.diagnostics[0].fallbackSizeMil, {
        width: 130,
        depth: 95,
        height: 40
    })
})

test('KicadPcb3dModelReadinessReportBuilder ranks available model candidates', () => {
    const report = KicadPcb3dModelReadinessReportBuilder.build(
        {
            components: [
                {
                    componentIndex: 0,
                    designator: 'U1',
                    footprintId: 'Package_QFN:QFN-32-1EP_5x5mm_P0.5mm',
                    pattern: 'Package_QFN:QFN-32-1EP_5x5mm_P0.5mm',
                    models: [
                        {
                            path: '${KIPRJMOD}/missing/QFN-32.step'
                        }
                    ]
                },
                {
                    componentIndex: 1,
                    designator: 'R1',
                    footprintId: 'Resistor_SMD:R_0603_1608Metric',
                    pattern: 'Resistor_SMD:R_0603_1608Metric',
                    models: []
                }
            ]
        },
        {
            assets: [
                {
                    key: 'asset-near-qfn',
                    path: 'models/packages/QFN-32-1EP_5x5mm_P05.step'
                },
                {
                    key: 'asset-qfn-alt',
                    path: 'models/packages/QFN-48_7x7mm.step'
                },
                {
                    key: 'asset-resistor',
                    path: 'models/packages/R_0603_1608Metric.wrl'
                }
            ]
        }
    )

    assert.deepEqual(report.models[0].candidateModels.slice(0, 2), [
        {
            assetKey: 'asset-near-qfn',
            name: 'QFN-32-1EP_5x5mm_P05.step',
            path: 'models/packages/QFN-32-1EP_5x5mm_P05.step',
            format: 'step',
            score: 98,
            matchKind: 'token-overlap',
            matchedKeys: ['QFN-32-1EP', '5X5MM', 'QFN-32-1EP_5X5MM_P0.5MM']
        },
        {
            assetKey: 'asset-qfn-alt',
            name: 'QFN-48_7x7mm.step',
            path: 'models/packages/QFN-48_7x7mm.step',
            format: 'step',
            score: 20,
            matchKind: 'token-overlap',
            matchedKeys: ['QFN']
        }
    ])
    assert.deepEqual(report.models[1].candidateModels, [
        {
            assetKey: 'asset-resistor',
            name: 'R_0603_1608Metric.wrl',
            path: 'models/packages/R_0603_1608Metric.wrl',
            format: 'wrl',
            score: 74,
            matchKind: 'token-overlap',
            matchedKeys: ['0603', '1608METRIC', 'R_0603_1608METRIC']
        }
    ])
    assert.deepEqual(report.indexes.candidateModelsByAssetKey, {
        'asset-near-qfn': ['model-0'],
        'asset-qfn-alt': ['model-0'],
        'asset-resistor': ['model-1']
    })
})
