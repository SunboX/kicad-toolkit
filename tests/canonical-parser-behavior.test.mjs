// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'

import { ToolkitContractFixtures } from 'circuitjson-toolkit/testing'
import { CircuitJsonDocument } from 'circuitjson-toolkit'

import { KicadBenchmarkFixtureFactory } from '../benchmarks/KicadBenchmarkFixtureFactory.mjs'
import { KicadParser } from '../src/core/kicad/KicadParser.mjs'
import { Parser } from '../src/parser.mjs'

const FIXTURE = ToolkitContractFixtures.kicad().parserInput

test('parser preserves exact byte windows and executes native parsing once', () => {
    const payload = new TextEncoder().encode(FIXTURE.data)
    const container = new Uint8Array(payload.byteLength + 8)
    container.fill(0xa5)
    container.set(payload, 4)
    const before = container.slice()
    const original = KicadParser.parseArrayBuffer
    let calls = 0
    KicadParser.parseArrayBuffer = (...arguments_) => {
        calls += 1
        return Reflect.apply(original, KicadParser, arguments_)
    }
    try {
        const document = Parser.parse({
            fileName: FIXTURE.fileName,
            data: container.subarray(4, 4 + payload.byteLength)
        })
        assert.equal(document.source.format, 'kicad')
        assert.equal(document.schema, 'ecad-toolkit.document.v1')
        assert.deepEqual(container, before)
        assert.equal(calls, 1)
    } finally {
        KicadParser.parseArrayBuffer = original
    }
})

test('parser applies common extension, asset, and source policies', () => {
    const asset = new Uint8Array([1, 2, 3, 4])
    const metadata = Parser.parse(FIXTURE, { extensions: 'metadata' })
    const full = Parser.parse(
        { ...FIXTURE, assets: [{ name: 'model.step', data: asset }] },
        {
            extensions: 'full',
            decodeAssets: 'full',
            retainSource: 'reference'
        }
    )
    const selected = Parser.parse(FIXTURE, {
        extensions: ['kicad.native-model']
    })

    assert.equal(metadata.extensions.kicad.$meta.completeness, 'metadata')
    assert.equal(Object.hasOwn(metadata.extensions.kicad, 'native'), false)
    assert.equal(Object.hasOwn(full.extensions.kicad, 'native'), true)
    assert.equal(Object.hasOwn(selected.extensions.kicad, 'native'), true)
    assert.deepEqual(full.assets[0].data, asset)
    assert.equal(full.sourceReference.fileName, FIXTURE.fileName)
    full.assets[0].data[0] = 99
    assert.deepEqual(asset, new Uint8Array([1, 2, 3, 4]))
})

test('async parser emits ordered progress and honors cancellation', async () => {
    const controller = new AbortController()
    const stages = []
    await assert.rejects(
        Parser.parseAsync(FIXTURE, {
            worker: false,
            signal: controller.signal,
            onProgress: (row) => {
                stages.push(row.stage)
                if (row.stage === 'validate') controller.abort()
            }
        }),
        (error) => error?.code === 'ERR_CANCELLED'
    )
    assert.deepEqual(stages, ['detect', 'decode', 'validate'])
})

test('parser normalizes the complete native projection to pinned CircuitJSON', () => {
    const document = Parser.parse({
        fileName: 'synthetic-large.kicad_pcb',
        data: KicadBenchmarkFixtureFactory.largeBoardBytes()
    })
    const silkscreenText = document.model.find(
        (row) => row.type === 'pcb_silkscreen_text'
    )
    const silkscreenPaths = document.model.filter(
        (row) => row.type === 'pcb_silkscreen_path'
    )

    assert.equal(CircuitJsonDocument.isModel(document.model), true)
    assert.equal(silkscreenText.layer, 'top')
    assert.equal(typeof silkscreenText.pcb_component_id, 'string')
    assert.equal(silkscreenPaths.length, 96)
    assert.equal(
        silkscreenPaths.every(
            (row) => Array.isArray(row.route) && row.route.length >= 2
        ),
        true
    )
})
