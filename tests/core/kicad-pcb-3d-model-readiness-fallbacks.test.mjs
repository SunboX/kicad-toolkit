// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { KicadPcb3dModelReadinessReportBuilder } from '../../src/parser.mjs'

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
