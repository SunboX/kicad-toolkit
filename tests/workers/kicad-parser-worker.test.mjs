// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import assert from 'node:assert/strict'
import test from 'node:test'
import { Worker } from 'node:worker_threads'

test('kicad parser worker responds with parsed document models', async () => {
    const worker = new Worker(
        new URL('../../src/workers/kicad-parser.worker.mjs', import.meta.url),
        { type: 'module' }
    )
    try {
        const response = await postParseMessage(worker, {
            type: 'parse:file',
            requestId: 'request-1',
            fileName: 'worker.kicad_sch',
            buffer: bytesFor('(kicad_sch (version 20250114) (paper "A4"))')
        })

        assert.equal(response.type, 'parser:success')
        assert.equal(response.requestId, 'request-1')
        assert.equal(response.documentModel.sourceFormat, 'kicad')
        assert.equal(response.documentModel.kind, 'schematic')
    } finally {
        await worker.terminate()
    }
})

/**
 * Sends one parse message and resolves the worker response.
 * @param {Worker} worker Worker instance.
 * @param {object} message Message payload.
 * @returns {Promise<object>}
 */
function postParseMessage(worker, message) {
    return new Promise((resolve, reject) => {
        worker.once('message', resolve)
        worker.once('error', reject)
        worker.postMessage(message, [message.buffer])
    })
}

/**
 * Encodes source text as an ArrayBuffer.
 * @param {string} source Source text.
 * @returns {ArrayBuffer}
 */
function bytesFor(source) {
    const buffer = Buffer.from(source, 'utf8')
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength
    )
}
