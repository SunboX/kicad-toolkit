// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'

import { zipSync } from 'fflate'
import { ToolkitContractFixtures } from 'circuitjson-toolkit/testing'

import { Parser } from '../src/parser.mjs'
import { ProjectLoader } from '../src/project.mjs'

const FIXTURE = ToolkitContractFixtures.kicad().parserInput

/**
 * Adds a standards-valid ZIP comment without changing member metadata.
 * @param {Uint8Array} archive ZIP bytes.
 * @param {number} length Comment length.
 * @returns {Uint8Array} Padded ZIP bytes.
 */
function withZipComment(archive, length) {
    const result = new Uint8Array(archive.byteLength + length)
    result.set(archive)
    new DataView(result.buffer).setUint16(archive.byteLength - 2, length, true)
    return result
}

test('async parser owns bytes and asset payloads before progress callbacks', async () => {
    const source = new TextEncoder().encode(FIXTURE.data)
    const expectedSource = source.slice()
    const asset = new Uint8Array([9, 8, 7, 6])
    const expectedAsset = asset.slice()

    const document = await Parser.parseAsync(
        {
            fileName: FIXTURE.fileName,
            data: source,
            assets: [{ name: 'models/body.step', data: asset }]
        },
        {
            worker: false,
            decodeAssets: 'full',
            onProgress: (row) => {
                if (row.stage !== 'detect') return
                source.fill(0)
                asset.fill(0)
            }
        }
    )

    assert.equal(document.source.fileName, FIXTURE.fileName)
    assert.deepEqual(document.assets[0].data, expectedAsset)
    assert.notDeepEqual(source, expectedSource)
})

test('parser rejects accessor-backed and coercive scalar options without invoking them', () => {
    let reads = 0
    const reports = []
    Object.defineProperty(reports, '0', {
        enumerable: true,
        get() {
            reads += 1
            return 'unsafe'
        }
    })
    const hostileName = {
        toString() {
            reads += 1
            return FIXTURE.fileName
        }
    }

    assert.equal(Parser.tryParse(FIXTURE, { reports }).ok, false)
    assert.equal(
        Parser.tryParse({ fileName: hostileName, data: FIXTURE.data }).ok,
        false
    )
    assert.equal(reads, 0)
})

test('async project loading snapshots entries and reports every candidate', async () => {
    const firstBytes = new TextEncoder().encode(FIXTURE.data)
    const secondBytes = firstBytes.slice()
    const asset = new Uint8Array([4, 3, 2, 1])
    const entries = [
        {
            name: 'first.kicad_pcb',
            data: firstBytes,
            assets: [{ name: 'models/body.step', data: asset }]
        },
        { name: 'second.kicad_pcb', data: secondBytes }
    ]
    const candidateProgress = []

    const project = await ProjectLoader.loadAsync(entries, {
        worker: false,
        decodeAssets: 'full',
        onProgress: (row) => {
            if (row.stage === 'detect') {
                entries[0].name = 'mutated.kicad_pcb'
                firstBytes.fill(0)
                secondBytes.fill(0)
                asset.fill(0)
            }
            if (row.stage === 'project' && row.completed > 0) {
                candidateProgress.push(row.detail)
            }
        }
    })

    assert.deepEqual(
        project.documents.map((document) => document.source.fileName),
        ['first.kicad_pcb', 'second.kicad_pcb']
    )
    assert.deepEqual(candidateProgress, ['first.kicad_pcb', 'second.kicad_pcb'])
    assert.deepEqual(
        project.assets.find((row) => row.name === 'models/body.step').data,
        new Uint8Array([4, 3, 2, 1])
    )
})

test('project loading keeps valid documents when another candidate fails', () => {
    const project = ProjectLoader.load([
        {
            name: FIXTURE.fileName,
            data: FIXTURE.data
        },
        { name: 'invalid.kicad_sch', data: '(kicad_sch' }
    ])

    assert.equal(project.documents.length, 1)
    assert.equal(project.documents[0].source.fileName, FIXTURE.fileName)
    assert.equal(project.statistics.entryCount, 2)
    assert.equal(project.statistics.candidateCount, 2)
    assert.equal(project.statistics.failureCount, 1)
    assert.equal(
        project.diagnostics.some(
            (row) =>
                row.severity === 'error' && row.source === 'invalid.kicad_sch'
        ),
        true
    )
})

test('none and empty extension selections produce exact empty maps', () => {
    const parserInput = {
        fileName: FIXTURE.fileName,
        data: FIXTURE.data
    }
    const entry = { name: FIXTURE.fileName, data: FIXTURE.data }

    assert.deepEqual(
        Parser.parse(parserInput, { extensions: 'none' }).extensions,
        {}
    )
    assert.deepEqual(
        Parser.parse(parserInput, { extensions: [] }).extensions,
        {}
    )
    assert.deepEqual(
        ProjectLoader.load([entry], { extensions: 'none' }).extensions,
        {}
    )
    assert.deepEqual(
        ProjectLoader.load([entry], { extensions: [] }).extensions,
        {}
    )
})

test('project ZIP loading preflights depth, compression ratio, and CRC32', () => {
    const source = new TextEncoder().encode(FIXTURE.data)
    const archive = zipSync({ 'board.kicad_pcb': source }, { level: 0 })

    assert.throws(
        () =>
            ProjectLoader.load([{ name: 'depth.zip', data: archive }], {
                archiveLimits: { maxArchiveDepth: 0 }
            }),
        (error) => error?.details?.limit === 'maxArchiveDepth'
    )

    const padded = withZipComment(archive, 1024)
    assert.throws(
        () =>
            ProjectLoader.load([{ name: 'ratio.zip', data: padded }], {
                archiveLimits: { maxCompressionRatio: 0.5 }
            }),
        (error) => error?.details?.limit === 'maxCompressionRatio'
    )

    const corrupt = archive.slice()
    const view = new DataView(corrupt.buffer)
    const nameLength = view.getUint16(26, true)
    const extraLength = view.getUint16(28, true)
    corrupt[30 + nameLength + extraLength] ^= 0xff
    assert.throws(
        () => ProjectLoader.load([{ name: 'crc.zip', data: corrupt }]),
        (error) => error?.code === 'ERR_ARCHIVE_INVALID'
    )
})

test('worker entrypoint can be imported in a non-worker Node runtime', async () => {
    await assert.doesNotReject(
        import(`../src/workers/parser.worker.mjs?node=${Date.now()}`)
    )
})
