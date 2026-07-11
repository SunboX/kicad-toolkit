// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { ToolkitWorkerProtocol } from 'circuitjson-toolkit/parser'

import { Parser } from '../convergence/Parser.mjs'
import { ProjectLoader } from '../convergence/ProjectLoader.mjs'
import { KicadAsyncInputOwnership } from '../convergence/KicadAsyncInputOwnership.mjs'

const scope = typeof self === 'undefined' ? null : self

if (scope)
    ToolkitWorkerProtocol.install(scope, {
        /** @param {object} payload Payload. @param {object} runtime Runtime. @returns {Promise<object>} Document. */
        parse: async (payload, runtime) =>
            await Parser.parseAsync(
                KicadAsyncInputOwnership.markParser(payload.input),
                {
                    ...(payload.options || {}),
                    worker: false,
                    signal: runtime.signal,
                    onProgress: runtime.onProgress
                }
            ),

        /** @param {object} payload Payload. @param {object} runtime Runtime. @returns {Promise<object>} Project. */
        loadProject: async (payload, runtime) =>
            await ProjectLoader.loadAsync(
                KicadAsyncInputOwnership.markProject(payload.entries),
                {
                    ...(payload.options || {}),
                    worker: false,
                    signal: runtime.signal,
                    onProgress: runtime.onProgress
                }
            )
    })
