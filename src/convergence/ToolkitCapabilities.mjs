// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { ToolkitCapabilities as SharedCapabilities } from 'circuitjson-toolkit'

const NATIVE = new Map([
    ['parse.document', 'Parse native KiCad documents into CircuitJSON.'],
    ['project.load', 'Load native KiCad projects and ZIP archives.'],
    ['worker.parse', 'Parse KiCad documents through the shared protocol.'],
    ['worker.load-project', 'Load KiCad projects through the shared protocol.'],
    [
        'export.selected-part',
        'Export selected KiCad parts through retained native adapters.'
    ]
])

/** Reports common and KiCad-native capability availability. */
export class ToolkitCapabilities {
    /** @returns {Record<string, any>[]} Stable clone-safe inventory. */
    static inventory() {
        return SharedCapabilities.inventory().map((row) => {
            const summary = NATIVE.get(row.id)
            if (!summary) return { ...row }
            return {
                ...row,
                status: 'native',
                entrypoint:
                    row.id === 'export.selected-part'
                        ? 'kicad-toolkit/extensions'
                        : row.id.startsWith('worker.')
                          ? 'kicad-toolkit/workers/parser.worker.mjs'
                          : row.entrypoint,
                summary,
                reason: summary
            }
        })
    }
}

Object.freeze(ToolkitCapabilities.prototype)
Object.freeze(ToolkitCapabilities)
