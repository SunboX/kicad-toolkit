// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

const projectFormat = 'pcb-styler-project'
const legacyProjectFormats = new Set([projectFormat, 'pcb-marker-project'])
const projectSettingsFile = 'settings.json'

/**
 * Creates and reads portable PCB Styler project ZIP archives.
 */
export class ProjectArchive {
    /**
     * Creates a project ZIP containing the current PCB source and settings JSON.
     * @param {{ sourceFileName?: string, boardSource?: string, side?: string, layerStyles?: Record<string, object>, highlightedFootprints?: readonly string[], highlightColor?: string, badges?: readonly object[], badgeStyle?: object }} snapshot
     * @returns {Uint8Array}
     */
    static create(snapshot) {
        const boardSource = String(snapshot.boardSource || '')
        if (!boardSource) {
            throw new Error('No PCB source is available for project export.')
        }

        const pcbFileName = ProjectArchive.pcbFileName(snapshot.sourceFileName)
        const payload = {
            app: 'PCB Styler',
            format: projectFormat,
            formatVersion: 1,
            sourceFileName: String(snapshot.sourceFileName || pcbFileName),
            pcbFileName,
            settings: ProjectArchive.settingsFromSnapshot(snapshot)
        }

        return zipSync({
            [pcbFileName]: strToU8(boardSource),
            [projectSettingsFile]: strToU8(JSON.stringify(payload, null, 4))
        })
    }

    /**
     * Finds a PCB Styler project in direct entries or nested ZIP entries.
     * @param {{ name: string, bytes: Uint8Array }[]} entries
     * @returns {{ boardEntry: { name: string, bytes: Uint8Array }, settings: object } | null}
     */
    static find(entries) {
        for (const group of ProjectArchive.#entryGroups(entries)) {
            const payload = ProjectArchive.#readSettings(group)
            if (!payload) continue

            const boardEntry = ProjectArchive.#findBoardEntry(
                group,
                payload.pcbFileName
            )
            if (!boardEntry) {
                throw new Error(
                    'Project ZIP settings.json does not match a PCB file.'
                )
            }

            return {
                boardEntry,
                settings: ProjectArchive.#settingsFromPayload(payload)
            }
        }

        return null
    }

    /**
     * Creates a settings object from a state snapshot.
     * @param {{ side?: string, layerStyles?: Record<string, object>, highlightedFootprints?: readonly string[], highlightColor?: string, badges?: readonly object[], badgeStyle?: object }} snapshot
     * @returns {{ side: string, layerStyles: Record<string, object>, highlightedFootprints: readonly string[], highlightColor: string, badges: readonly object[], badgeStyle: object }}
     */
    static settingsFromSnapshot(snapshot) {
        return {
            side: snapshot.side === 'back' ? 'back' : 'front',
            layerStyles: cloneJson(snapshot.layerStyles || {}),
            highlightedFootprints: cloneJson(
                snapshot.highlightedFootprints || []
            ),
            highlightColor: String(snapshot.highlightColor || '#ff3b2b'),
            badges: cloneJson(snapshot.badges || []),
            badgeStyle: cloneJson(snapshot.badgeStyle || {})
        }
    }

    /**
     * Creates a portable project archive filename from a source board path.
     * @param {string | undefined} sourceFileName
     * @returns {string}
     */
    static projectFileName(sourceFileName) {
        return (
            ProjectArchive.#safeBaseName(sourceFileName, 'pcb') + '-project.zip'
        )
    }

    /**
     * Creates the PCB entry filename used inside exported project archives.
     * @param {string | undefined} sourceFileName
     * @returns {string}
     */
    static pcbFileName(sourceFileName) {
        return (
            ProjectArchive.#safeBaseName(sourceFileName, 'pcb') + '.kicad_pcb'
        )
    }

    /**
     * Returns direct entries and archive contents as entry groups.
     * @param {{ name: string, bytes: Uint8Array }[]} entries
     * @returns {{ name: string, bytes: Uint8Array }[][]}
     */
    static #entryGroups(entries) {
        const groups = [entries || []]

        for (const entry of entries || []) {
            if (!isZipFile(entry.name)) continue

            const archiveEntries = unzipSync(entry.bytes)
            groups.push(
                Object.entries(archiveEntries).map(([name, bytes]) => ({
                    name,
                    bytes
                }))
            )
        }

        return groups
    }

    /**
     * Reads a project settings payload from an entry group.
     * @param {{ name: string, bytes: Uint8Array }[]} entries
     * @returns {Record<string, unknown> | null}
     */
    static #readSettings(entries) {
        const entry = entries.find(
            (item) => pathBaseName(item.name) === projectSettingsFile
        )
        if (!entry) return null

        try {
            const payload = JSON.parse(strFromU8(entry.bytes))
            if (!legacyProjectFormats.has(payload?.format)) return null
            return payload
        } catch {
            return null
        }
    }

    /**
     * Finds the preferred board entry or falls back to the first board entry.
     * @param {{ name: string, bytes: Uint8Array }[]} entries
     * @param {unknown} preferredFileName
     * @returns {{ name: string, bytes: Uint8Array } | null}
     */
    static #findBoardEntry(entries, preferredFileName) {
        const preferred = String(preferredFileName || '')
        if (preferred) {
            const match = entries.find((entry) => {
                return (
                    entry.name === preferred ||
                    pathBaseName(entry.name) === pathBaseName(preferred)
                )
            })
            if (match && isBoardFile(match.name)) return match
        }

        return (
            entries
                .filter((entry) => !entry.name.startsWith('__MACOSX/'))
                .find((entry) => isBoardFile(entry.name)) || null
        )
    }

    /**
     * Reads the settings object from a validated settings payload.
     * @param {Record<string, unknown>} payload
     * @returns {object}
     */
    static #settingsFromPayload(payload) {
        return payload.settings && typeof payload.settings === 'object'
            ? payload.settings
            : {}
    }

    /**
     * Creates a safe basename without a file extension.
     * @param {string | undefined} sourceFileName
     * @param {string} fallback
     * @returns {string}
     */
    static #safeBaseName(sourceFileName, fallback) {
        const base = pathBaseName(String(sourceFileName || fallback))
            .replace(/\.kicad_pcb$/i, '')
            .replace(/\.zip$/i, '')
            .replace(/[^a-z0-9._-]+/gi, '-')
            .replace(/^-+|-+$/g, '')

        return base || fallback
    }
}

/**
 * Clones JSON-safe settings values.
 * @param {unknown} value
 * @returns {any}
 */
function cloneJson(value) {
    return JSON.parse(JSON.stringify(value))
}

/**
 * Returns the filename segment of a path-like value.
 * @param {string} value
 * @returns {string}
 */
function pathBaseName(value) {
    return (
        String(value || '')
            .split('/')
            .pop() || ''
    )
}

/**
 * Returns true for KiCad board filenames.
 * @param {string} fileName
 * @returns {boolean}
 */
function isBoardFile(fileName) {
    return /\.kicad_pcb$/i.test(String(fileName || ''))
}

/**
 * Returns true for ZIP filenames.
 * @param {string} fileName
 * @returns {boolean}
 */
function isZipFile(fileName) {
    return /\.zip$/i.test(String(fileName || ''))
}
