// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { strFromU8 } from 'fflate'
import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'

/**
 * Indexes KiCad .kicad_blocks design block libraries.
 */
export class KicadDesignBlockLibraryParser {
    /**
     * Builds a design block library index from named entries.
     * @param {{ name: string, bytes: Uint8Array }[]} entries Named entries.
     * @param {{ fileName?: string }} [options] Parser options.
     * @returns {object}
     */
    static build(entries, options = {}) {
        const groups = new Map()

        for (const entry of entries || []) {
            const blockPath = designBlockPath(entry.name)
            if (!blockPath) continue
            collectBlockEntry(groups, blockPath, entry)
        }

        const blocks = [...groups.values()]
            .map(normalizeBlock)
            .sort((left, right) => left.path.localeCompare(right.path))
        const libraryCount = new Set(blocks.map((block) => block.libraryName))
            .size

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'design-block-library',
            fileType: 'kicad_blocks',
            fileName: String(options.fileName || ''),
            summary: {
                title: 'KiCad design block library',
                libraryCount,
                designBlockCount: blocks.length
            },
            diagnostics: [],
            blocks,
            bom: []
        })
    }
}

/**
 * Collects one file entry into a block group.
 * @param {Map<string, object>} groups Group map.
 * @param {string} blockPath Block path.
 * @param {{ name: string, bytes: Uint8Array }} entry Entry.
 * @returns {void}
 */
function collectBlockEntry(groups, blockPath, entry) {
    if (!groups.has(blockPath)) {
        groups.set(blockPath, {
            path: blockPath,
            files: []
        })
    }

    const group = groups.get(blockPath)
    group.files.push(entry.name)

    if (/\.json$/i.test(entry.name)) {
        group.metadataFile = entry.name
        group.metadata = JSON.parse(strFromU8(entry.bytes))
    } else if (/\.kicad_sch$/i.test(entry.name)) {
        group.schematicFile = entry.name
    } else if (/\.kicad_pcb$/i.test(entry.name)) {
        group.boardFile = entry.name
    }
}

/**
 * Normalizes a collected design block group.
 * @param {object} group Block group.
 * @returns {object}
 */
function normalizeBlock(group) {
    const metadata = group.metadata || {}
    const blockName = stripKnownExtension(baseName(group.path), 'kicad_block')
    return {
        name: String(metadata.name || blockName),
        libraryName: libraryNameFromBlockPath(group.path),
        path: group.path,
        description: String(metadata.description || ''),
        keywords: String(metadata.keywords || ''),
        schematicFile: group.schematicFile || '',
        boardFile: group.boardFile || '',
        metadataFile: group.metadataFile || '',
        metadata
    }
}

/**
 * Returns the containing .kicad_block folder path for an entry.
 * @param {string} fileName Entry path.
 * @returns {string}
 */
function designBlockPath(fileName) {
    const parts = normalizePath(fileName).split('/')
    const index = parts.findIndex((part) => /\.kicad_block$/i.test(part))
    return index === -1 ? '' : parts.slice(0, index + 1).join('/')
}

/**
 * Returns the parent design block library name.
 * @param {string} blockPath Block path.
 * @returns {string}
 */
function libraryNameFromBlockPath(blockPath) {
    const parts = normalizePath(blockPath).split('/')
    const blockIndex = parts.findIndex((part) => /\.kicad_block$/i.test(part))
    const libraryName = blockIndex > 0 ? parts[blockIndex - 1] : ''
    return stripKnownExtension(libraryName, 'kicad_blocks')
}

/**
 * Normalizes path separators.
 * @param {string} path Source path.
 * @returns {string}
 */
function normalizePath(path) {
    return String(path || '').replace(/\\/g, '/')
}

/**
 * Returns a slash-normalized basename.
 * @param {string} path Source path.
 * @returns {string}
 */
function baseName(path) {
    return normalizePath(path).split('/').pop() || ''
}

/**
 * Removes a known extension from a basename.
 * @param {string} value Basename.
 * @param {string} extension Extension without dot.
 * @returns {string}
 */
function stripKnownExtension(value, extension) {
    return String(value || '').replace(
        new RegExp('\\.' + extension + '$', 'i'),
        ''
    )
}
