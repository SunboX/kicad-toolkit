// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'

import { validateFeaturePreservation } from '../../scripts/check-feature-preservation.mjs'

const mapping = Object.freeze({
    feature: '.#KicadParser',
    kind: 'export',
    capabilityId: 'kicad_pcb_parser',
    disposition: 'shared',
    replacement: 'Parser',
    availability: {
        'altium-toolkit': 'derived',
        'circuitjson-toolkit': 'shared',
        'gerber-toolkit': 'derived',
        'kicad-toolkit': 'shared'
    },
    reason: 'KiCad parsing converges on the shared parser contract.',
    evidenceToken: 'KicadParser',
    sourceContract: { type: 'function', arity: 2 },
    tests: ['tests/core/kicad-parser.test.mjs'],
    documentation: ['docs/api.md']
})

/**
 * Creates a minimal API baseline for checker unit tests.
 * @param {Record<string, any>} [featureOverrides] Feature overrides.
 * @returns {Record<string, any>} API baseline.
 */
function baseline(featureOverrides = {}) {
    return {
        package: 'kicad-toolkit',
        packageVersion: '1.0.29',
        entrypoints: [],
        features: [{ ...mapping, ...featureOverrides }]
    }
}

/**
 * Creates a minimal ledger for checker unit tests.
 * @param {Record<string, any>} [rowOverrides] Row overrides.
 * @returns {Record<string, any>[]} Ledger rows.
 */
function ledger(rowOverrides = {}) {
    return [
        {
            package: 'kicad-toolkit@1.0.29',
            ...mapping,
            ...rowOverrides
        }
    ]
}

test('feature checker accepts one exact complete preservation mapping', async () => {
    const result = await validateFeaturePreservation({
        apiBaseline: baseline(),
        ledger: ledger()
    })

    assert.deepEqual(result, { featureCount: 1 })
})

test('feature checker rejects missing and strict stale mappings', async () => {
    await assert.rejects(
        validateFeaturePreservation({
            apiBaseline: baseline(),
            ledger: []
        }),
        /Missing feature-preservation mappings/u
    )
    await assert.rejects(
        validateFeaturePreservation({
            apiBaseline: baseline(),
            ledger: [
                ...ledger(),
                { ...ledger()[0], feature: '.#RemovedExport' }
            ],
            strict: true,
            capabilityIds: new Set(['kicad_pcb_parser'])
        }),
        /Stale feature-preservation mappings/u
    )
})

test('strict feature checker rejects fictitious capability mappings', async () => {
    await assert.rejects(
        validateFeaturePreservation({
            apiBaseline: baseline({ capabilityId: 'invented_capability' }),
            ledger: ledger({ capabilityId: 'invented_capability' }),
            strict: true,
            capabilityIds: new Set(['kicad_pcb_parser'])
        }),
        /Fictitious capabilityId mappings: invented_capability/u
    )
})

test('feature checker rejects duplicate and mismatched mapping contracts', async () => {
    await assert.rejects(
        validateFeaturePreservation({
            apiBaseline: {
                ...baseline(),
                features: [mapping, mapping]
            },
            ledger: ledger()
        }),
        /Duplicate baseline features/u
    )
    await assert.rejects(
        validateFeaturePreservation({
            apiBaseline: baseline(),
            ledger: ledger({ replacement: 'WrongParser' })
        }),
        /Baseline and ledger mapping differ/u
    )
    await assert.rejects(
        validateFeaturePreservation({
            apiBaseline: baseline(),
            ledger: ledger({
                sourceContract: { type: 'function', arity: 1 }
            })
        }),
        /Baseline and ledger mapping differ/u
    )
})
