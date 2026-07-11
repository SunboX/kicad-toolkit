// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { ParserWorkerClient } from 'circuitjson-toolkit/parser'

let client = null

/** Owns the lazy KiCad worker client using the shared protocol. */
export class KicadWorkerClient {
    /** @returns {boolean} Whether Worker construction is available. */
    static isAvailable() {
        try {
            return typeof globalThis.Worker === 'function'
        } catch {
            return false
        }
    }

    /** @param {object} input Input. @param {object} options Options. @returns {Promise<object>} Result. */
    static async parse(input, options) {
        return await KicadWorkerClient.#client().parse(input, options)
    }

    /** @param {object} input Input. @param {object} options Options. @returns {Promise<object>} Attempt. */
    static async parseAttempt(input, options) {
        return await KicadWorkerClient.#client().parseAttempt(input, options)
    }

    /** @param {object[]} entries Entries. @param {object} options Options. @returns {Promise<object>} Result. */
    static async loadProject(entries, options) {
        return await KicadWorkerClient.#client().loadProject(entries, options)
    }

    /** @param {object[]} entries Entries. @param {object} options Options. @returns {Promise<object>} Attempt. */
    static async loadProjectAttempt(entries, options) {
        return await KicadWorkerClient.#client().loadProjectAttempt(
            entries,
            options
        )
    }

    /** Disposes the current worker client. */
    static dispose() {
        client?.dispose()
        client = null
    }

    /** @returns {ParserWorkerClient} Shared worker client. */
    static #client() {
        if (!client) {
            client = new ParserWorkerClient({
                createWorker: () =>
                    Reflect.construct(globalThis.Worker, [
                        new URL(
                            '../workers/parser.worker.mjs',
                            import.meta.url
                        ),
                        { type: 'module' }
                    ])
            })
        }
        return client
    }
}

Object.freeze(KicadWorkerClient.prototype)
Object.freeze(KicadWorkerClient)
