// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { validateFeaturePreservation } from '../../scripts/check-feature-preservation.mjs'

const execFileAsync = promisify(execFile)
const repositoryRoot = new URL('../../', import.meta.url)

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

test('strict packed checker rejects callable and complete inventory drift', async () => {
    const [apiBaseline, fullLedger, packed] = await Promise.all([
        readJson('spec/api-baseline-v1.0.29.json'),
        readJson('spec/feature-preservation.json'),
        packRepositoryFixture()
    ])
    try {
        const callableMutations = [
            ['signature', (callable) => (callable.signature += ' /* drift */')],
            ['arity', (callable) => (callable.arity += 1)],
            ['parameters', (callable) => (callable.parameters = ['drift'])],
            ['options', (callable) => (callable.options = ['drift'])],
            ['result fields', (callable) => (callable.resultFields = ['drift'])]
        ]
        for (const [label, mutate] of callableMutations) {
            const callableDrift = structuredClone(apiBaseline)
            mutate(interactionHitTest(callableDrift))
            await assert.rejects(
                validateFeaturePreservation({
                    apiBaseline: callableDrift,
                    ledger: fullLedger,
                    strict: true,
                    packageRoot: packed.packageRoot
                }),
                /Packed callable contract differs/u,
                `strict validation accepted drifted ${label}`
            )
        }
        const instanceDrift = structuredClone(apiBaseline)
        loadedDesignList(instanceDrift).options = ['drift']
        await assert.rejects(
            validateFeaturePreservation({
                apiBaseline: instanceDrift,
                ledger: fullLedger,
                strict: true,
                packageRoot: packed.packageRoot
            }),
            /Packed callable contract differs/u,
            'strict validation accepted drifted instance method options'
        )

        const capabilityDrift = structuredClone(apiBaseline)
        capabilityDrift.capabilityInventory.capabilities[0].label =
            'Drifted capability'
        await assert.rejects(
            validateFeaturePreservation({
                apiBaseline: capabilityDrift,
                ledger: fullLedger,
                strict: true,
                packageRoot: packed.packageRoot
            }),
            /Packed capability inventory differs/u
        )

        const parityDrift = structuredClone(apiBaseline)
        parityDrift.featureInventory.features[0].status = 'drifted'
        await assert.rejects(
            validateFeaturePreservation({
                apiBaseline: parityDrift,
                ledger: fullLedger,
                strict: true,
                packageRoot: packed.packageRoot
            }),
            /Packed parity inventory differs/u
        )

        const workerDrift = structuredClone(apiBaseline)
        workerDrift.workerProtocol.messages[0].fields.pop()
        await assert.rejects(
            validateFeaturePreservation({
                apiBaseline: workerDrift,
                ledger: fullLedger,
                strict: true,
                packageRoot: packed.packageRoot
            }),
            /Packed worker protocol differs/u
        )
    } finally {
        await packed.cleanup()
    }
})

test('strict packed checker rejects checksum and isolated export-map drift', async () => {
    const [apiBaseline, fullLedger, packed] = await Promise.all([
        readJson('spec/api-baseline-v1.0.29.json'),
        readJson('spec/feature-preservation.json'),
        packRepositoryFixture()
    ])
    const packagePath = join(packed.packageRoot, 'package.json')
    const originalPackage = await readFile(packagePath, 'utf8')
    try {
        const checksumDrift = structuredClone(apiBaseline)
        checksumDrift.packageExportsChecksum = '0'.repeat(64)
        await assert.rejects(
            validateFeaturePreservation({
                apiBaseline: checksumDrift,
                ledger: fullLedger,
                strict: true,
                packageRoot: packed.packageRoot
            }),
            /Baseline package exports checksum differs/u
        )

        const mutations = [
            [
                'remapped renderer export',
                (pkg) => (pkg.exports['./renderers'] = './src/index.mjs')
            ],
            ['removed scene export', (pkg) => delete pkg.exports['./scene3d']]
        ]
        for (const [label, mutate] of mutations) {
            const pkg = JSON.parse(originalPackage)
            mutate(pkg)
            await writeFile(packagePath, JSON.stringify(pkg, null, 4) + '\n')
            await assert.rejects(
                validateFeaturePreservation({
                    apiBaseline,
                    ledger: fullLedger,
                    strict: true,
                    packageRoot: packed.packageRoot
                }),
                /Packed package exports differ/u,
                `strict validation accepted ${label}`
            )
            await writeFile(packagePath, originalPackage)
        }
    } finally {
        await writeFile(packagePath, originalPackage).catch(() => {})
        await packed.cleanup()
    }
})

/**
 * Returns the packed-drift target callable from one API baseline.
 * @param {Record<string, any>} apiBaseline API baseline.
 * @returns {Record<string, any>} Interaction hit-test contract.
 */
function interactionHitTest(apiBaseline) {
    const rendererEntrypoint = apiBaseline.entrypoints.find(
        (entrypoint) => entrypoint.entrypoint === './renderers'
    )
    const interaction = rendererEntrypoint.exports.find(
        (exported) => exported.name === 'PcbInteractionIndex'
    )
    return interaction.callables.find(
        (callable) => callable.name === 'hitTestItems'
    )
}

/**
 * Returns one instance-method contract from the netlist-query entrypoint.
 * @param {Record<string, any>} apiBaseline API baseline.
 * @returns {Record<string, any>} Loaded-design list contract.
 */
function loadedDesignList(apiBaseline) {
    const entrypoint = apiBaseline.entrypoints.find(
        (row) => row.entrypoint === './netlist-query'
    )
    const service = entrypoint.exports.find(
        (row) => row.name === 'LoadedDesignNetlistService'
    )
    return service.callables.find((row) => row.name === 'listDesigns')
}

/**
 * Reads one repository-relative JSON file.
 * @param {string} relativePath Repository-relative path.
 * @returns {Promise<any>} Parsed JSON.
 */
async function readJson(relativePath) {
    return JSON.parse(
        await readFile(new URL(relativePath, repositoryRoot), 'utf8')
    )
}

/**
 * Packs, extracts, and installs the real package for strict drift tests.
 * @returns {Promise<{ packageRoot: string, cleanup: () => Promise<void> }>} Packed package fixture.
 */
async function packRepositoryFixture() {
    const directory = await mkdtemp(join(tmpdir(), 'kicad-packed-drift-'))
    try {
        const { stdout } = await execFileAsync(
            'npm',
            ['pack', '--json', '--pack-destination', directory],
            {
                cwd: fileURLToPath(repositoryRoot),
                maxBuffer: 16 * 1024 * 1024
            }
        )
        const report = JSON.parse(stdout)
        await execFileAsync('tar', [
            '-xzf',
            resolve(directory, report[0].filename),
            '-C',
            directory
        ])
        const packageRoot = resolve(directory, 'package')
        await execFileAsync(
            'npm',
            [
                'install',
                '--ignore-scripts',
                '--omit=dev',
                '--no-audit',
                '--no-fund'
            ],
            { cwd: packageRoot, maxBuffer: 16 * 1024 * 1024 }
        )
        return {
            packageRoot,
            cleanup: () => rm(directory, { force: true, recursive: true })
        }
    } catch (error) {
        await rm(directory, { force: true, recursive: true })
        throw error
    }
}
