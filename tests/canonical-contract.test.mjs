// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'

import * as sharedToolkit from 'circuitjson-toolkit'
import {
    ToolkitContractFixtures,
    runToolkitContract
} from 'circuitjson-toolkit/testing'

import * as toolkit from '../src/index.mjs'

test('KiCad root exposes the exact shared toolkit surface', () => {
    assert.deepEqual(
        Object.keys(toolkit).sort(),
        Object.keys(sharedToolkit).sort()
    )
})

test('KiCad package passes the shared observable toolkit contract', async () => {
    const report = await runToolkitContract(toolkit, {
        fixtures: ToolkitContractFixtures.kicad()
    })

    assert.equal(report.schema, 'ecad-toolkit.contract-report.v1')
    assert.deepEqual(report.failures, [])
    assert.equal(
        report.checks.every((row) => row.status === 'passed'),
        true
    )
})
