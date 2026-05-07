// SPDX-FileCopyrightText: 2026 André Fiedler
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadParser } from '../core/kicad/KicadParser.mjs'

/**
 * Parses a worker message and returns a protocol response.
 * @param {object} message Worker message.
 * @returns {Promise<object>}
 */
async function handleMessage(message) {
    try {
        if (message?.type !== 'parse:file') {
            throw new Error(
                'Unsupported KiCad worker message: ' + message?.type
            )
        }

        return {
            type: 'parser:success',
            requestId: message.requestId || '',
            documentModel: KicadParser.parseArrayBuffer(
                message.fileName,
                message.buffer,
                message.options || {}
            )
        }
    } catch (error) {
        return {
            type: 'parser:error',
            requestId: message?.requestId || '',
            message: error instanceof Error ? error.message : String(error)
        }
    }
}

/**
 * Installs browser-style worker listeners.
 * @returns {boolean}
 */
function installBrowserWorker() {
    if (typeof self === 'undefined' || !self.addEventListener) return false

    self.addEventListener('message', async (event) => {
        self.postMessage(await handleMessage(event.data))
    })
    return true
}

/**
 * Installs Node worker_threads listeners when available.
 * @returns {Promise<void>}
 */
async function installNodeWorker() {
    const workerThreads = await import('node:worker_threads')
    const parentPort = workerThreads.parentPort
    if (!parentPort) return

    parentPort.on('message', async (message) => {
        parentPort.postMessage(await handleMessage(message))
    })
}

if (!installBrowserWorker()) {
    await installNodeWorker()
}
