// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { strFromU8, unzipSync } from 'fflate'
import { KicadPcbParser } from './KicadPcbParser.mjs'
import { ProjectArchive } from './ProjectArchive.mjs'

/**
 * Loads KiCad board files from direct files or project ZIP archives.
 */
export class KicadProjectLoader {
    /**
     * Loads browser File objects.
     * @param {FileList | File[]} files
     * @returns {Promise<{ board: object, sourceFileName: string, sourceText: string, projectSettings: object | null }>}
     */
    static async loadFiles(files) {
        const entries = await Promise.all(
            Array.from(files || []).map(async (file) => {
                return {
                    name: file.name,
                    bytes: new Uint8Array(await file.arrayBuffer())
                }
            })
        )
        return KicadProjectLoader.loadEntries(entries)
    }

    /**
     * Loads named byte entries.
     * @param {{ name: string, bytes: Uint8Array }[]} entries
     * @returns {Promise<{ board: object, sourceFileName: string, sourceText: string, projectSettings: object | null }>}
     */
    static async loadEntries(entries) {
        const project = ProjectArchive.find(entries)
        const boardEntry =
            project?.boardEntry || KicadProjectLoader.findBoardEntry(entries)
        if (!boardEntry) {
            throw new Error(
                'No .kicad_pcb file found. Open a KiCad board or project ZIP.'
            )
        }

        const source = strFromU8(boardEntry.bytes)
        return {
            board: KicadPcbParser.parse(source, { fileName: boardEntry.name }),
            sourceFileName: boardEntry.name,
            sourceText: source,
            projectSettings: project?.settings || null
        }
    }

    /**
     * Finds a direct or archived board entry.
     * @param {{ name: string, bytes: Uint8Array }[]} entries
     * @returns {{ name: string, bytes: Uint8Array } | null}
     */
    static findBoardEntry(entries) {
        const direct = entries.find((entry) => {
            return KicadProjectLoader.isBoardFile(entry.name)
        })
        if (direct) return direct

        for (const entry of entries) {
            if (!KicadProjectLoader.isZipFile(entry.name)) continue

            const archiveEntries = unzipSync(entry.bytes)
            const boardName = Object.keys(archiveEntries)
                .filter((name) => !name.startsWith('__MACOSX/'))
                .find((name) => KicadProjectLoader.isBoardFile(name))

            if (boardName) {
                return {
                    name: boardName,
                    bytes: archiveEntries[boardName]
                }
            }
        }

        return null
    }

    /**
     * Returns true for KiCad board filenames.
     * @param {string} fileName
     * @returns {boolean}
     */
    static isBoardFile(fileName) {
        return /\.kicad_pcb$/i.test(String(fileName || ''))
    }

    /**
     * Returns true for ZIP filenames.
     * @param {string} fileName
     * @returns {boolean}
     */
    static isZipFile(fileName) {
        return /\.zip$/i.test(String(fileName || ''))
    }
}
