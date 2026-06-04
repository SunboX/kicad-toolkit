// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { strFromU8 } from 'fflate'
import { KicadDesignBlockLibraryParser } from './KicadDesignBlockLibraryParser.mjs'
import { KicadFootprintLibraryParser } from './KicadFootprintLibraryParser.mjs'
import { KicadLibraryTableParser } from './KicadLibraryTableParser.mjs'
import { KicadSymbolLibraryParser } from './KicadSymbolLibraryParser.mjs'
import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'

/**
 * Builds a searchable KiCad library manifest from project or archive entries.
 */
export class KicadLibraryIndexBuilder {
    /**
     * Builds a library index from named byte entries.
     * @param {{ name: string, bytes: Uint8Array }[]} entries Named entries.
     * @param {{ variables?: Record<string, string> }} [options] Index options.
     * @returns {object}
     */
    static build(entries, options = {}) {
        const state = emptyState()
        const variables = options.variables || {}

        for (const entry of entries || []) {
            KicadLibraryIndexBuilder.#collectEntry(state, entry, variables)
        }

        collectDesignBlocks(state, entries || [])
        appendMissingTableLibraries(state)

        const libraries = [...state.libraries.values()]
        const footprintCount = state.items.filter(
            (item) => item.kind === 'footprint'
        ).length
        const symbolCount = state.items.filter(
            (item) => item.kind === 'symbol'
        ).length
        const designBlockCount = state.items.filter(
            (item) => item.kind === 'design-block'
        ).length

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'library-index',
            fileType: 'KicadLibraryIndex',
            fileName: '',
            summary: {
                title: 'KiCad library index',
                libraryCount: libraries.length,
                tableCount: state.tables.length,
                footprintCount,
                symbolCount,
                designBlockCount
            },
            diagnostics: state.diagnostics,
            tables: state.tables,
            tableRows: state.tableRows,
            libraries,
            items: state.items,
            bom: []
        })
    }

    /**
     * Collects one entry into the index state.
     * @param {object} state Mutable index state.
     * @param {{ name: string, bytes: Uint8Array }} entry Entry.
     * @param {Record<string, string>} variables Variable map.
     * @returns {void}
     */
    static #collectEntry(state, entry, variables) {
        const name = String(entry?.name || '')
        if (!name || !entry?.bytes) return

        if (KicadLibraryTableParser.isLibraryTableFile(name)) {
            collectTable(state, entry, variables)
            return
        }

        if (/\.kicad_mod$/i.test(name) && prettyLibraryPath(name)) {
            collectFootprint(state, entry)
            return
        }

        if (/\.kicad_sym$/i.test(name)) {
            collectSymbols(state, entry)
        }
    }
}

/**
 * Collects KiCad design blocks into the library manifest.
 * @param {object} state Mutable index state.
 * @param {{ name: string, bytes: Uint8Array }[]} entries Named entries.
 * @returns {void}
 */
function collectDesignBlocks(state, entries) {
    let designBlocks

    try {
        designBlocks = KicadDesignBlockLibraryParser.build(entries)
    } catch (error) {
        state.diagnostics.push(parseDiagnostic('kicad_blocks', error))
        return
    }

    for (const block of designBlocks.blocks || []) {
        const libraryPath = parentPath(block.path)
        ensureLibrary(state, {
            name: block.libraryName,
            kind: 'design-block',
            path: libraryPath
        })
        state.items.push({
            libraryName: block.libraryName,
            kind: 'design-block',
            name: block.name,
            fileName: block.path,
            item: block
        })
        ensureLibrary(state, {
            name: block.libraryName,
            kind: 'design-block',
            path: libraryPath
        })
    }
}

/**
 * Creates an empty index state.
 * @returns {object}
 */
function emptyState() {
    return {
        tables: [],
        tableRows: [],
        libraries: new Map(),
        items: [],
        diagnostics: []
    }
}

/**
 * Collects a KiCad library table entry.
 * @param {object} state Mutable index state.
 * @param {{ name: string, bytes: Uint8Array }} entry Entry.
 * @param {Record<string, string>} variables Variable map.
 * @returns {void}
 */
function collectTable(state, entry, variables) {
    try {
        const table = KicadLibraryTableParser.parse(decode(entry.bytes), {
            fileName: entry.name,
            variables
        })
        state.tables.push(table)
        for (const row of table.rows) {
            state.tableRows.push({ ...row, tableType: table.tableType })
        }
    } catch (error) {
        state.diagnostics.push(parseDiagnostic(entry.name, error))
    }
}

/**
 * Collects one standalone footprint file under a .pretty library folder.
 * @param {object} state Mutable index state.
 * @param {{ name: string, bytes: Uint8Array }} entry Entry.
 * @returns {void}
 */
function collectFootprint(state, entry) {
    try {
        const libraryPath = prettyLibraryPath(entry.name)
        const libraryName = stripKnownLibraryExtension(baseName(libraryPath))
        const model = KicadFootprintLibraryParser.parse(decode(entry.bytes), {
            fileName: entry.name
        })
        const footprint = model.pcbLibrary.footprints[0]

        ensureLibrary(state, {
            name: libraryName,
            kind: 'footprint',
            path: libraryPath
        })
        state.items.push({
            libraryName,
            kind: 'footprint',
            name: footprint.name,
            fileName: entry.name,
            item: footprint
        })
        ensureLibrary(state, {
            name: libraryName,
            kind: 'footprint',
            path: libraryPath
        })
    } catch (error) {
        state.diagnostics.push(parseDiagnostic(entry.name, error))
    }
}

/**
 * Collects symbols from packed or unpacked KiCad symbol libraries.
 * @param {object} state Mutable index state.
 * @param {{ name: string, bytes: Uint8Array }} entry Entry.
 * @returns {void}
 */
function collectSymbols(state, entry) {
    try {
        const model = KicadSymbolLibraryParser.parse(decode(entry.bytes), {
            fileName: entry.name
        })
        const libraryPath = symbolLibraryPath(entry.name)
        const libraryName = stripKnownLibraryExtension(baseName(libraryPath))

        ensureLibrary(state, {
            name: libraryName,
            kind: 'symbol',
            path: libraryPath
        })

        for (const symbol of model.symbols) {
            state.items.push({
                libraryName,
                kind: 'symbol',
                name: symbol.name,
                fileName: entry.name,
                item: symbol
            })
        }
        ensureLibrary(state, {
            name: libraryName,
            kind: 'symbol',
            path: libraryPath
        })
    } catch (error) {
        state.diagnostics.push(parseDiagnostic(entry.name, error))
    }
}

/**
 * Appends table rows that do not have matching local parsed content.
 * @param {object} state Mutable index state.
 * @returns {void}
 */
function appendMissingTableLibraries(state) {
    for (const row of state.tableRows) {
        if (!row.enabled) continue
        const key = libraryKey(row.tableType, row.resolvedUri || row.uri)
        if (state.libraries.has(key)) continue

        ensureLibrary(state, {
            name: row.name,
            kind: row.tableType,
            path: row.resolvedUri || row.uri,
            tableRow: row
        })
    }
}

/**
 * Ensures a library record exists and refreshes its item count.
 * @param {object} state Mutable index state.
 * @param {object} library Library record.
 * @returns {object}
 */
function ensureLibrary(state, library) {
    const key = libraryKey(library.kind, library.path)
    if (!state.libraries.has(key)) {
        state.libraries.set(key, {
            name: library.name,
            kind: library.kind,
            path: library.path,
            itemCount: 0,
            tableRow: library.tableRow || null
        })
    }

    const record = state.libraries.get(key)
    record.itemCount = state.items.filter((item) => {
        return item.libraryName === record.name && item.kind === record.kind
    }).length
    return record
}

/**
 * Returns a stable library key.
 * @param {string} kind Library kind.
 * @param {string} path Library path.
 * @returns {string}
 */
function libraryKey(kind, path) {
    return kind + ':' + normalizePath(path)
}

/**
 * Returns a .pretty library path from a file path.
 * @param {string} fileName Entry path.
 * @returns {string}
 */
function prettyLibraryPath(fileName) {
    const parts = normalizePath(fileName).split('/')
    const index = parts.findIndex((part) => /\.pretty$/i.test(part))
    return index === -1 ? '' : parts.slice(0, index + 1).join('/')
}

/**
 * Returns a symbol library path for packed or unpacked symbol entries.
 * @param {string} fileName Entry path.
 * @returns {string}
 */
function symbolLibraryPath(fileName) {
    const parts = normalizePath(fileName).split('/')
    const symbolDirIndex = parts.findIndex((part) =>
        /\.kicad_symdir$/i.test(part)
    )
    if (symbolDirIndex !== -1) {
        return parts.slice(0, symbolDirIndex + 1).join('/')
    }
    return normalizePath(fileName)
}

/**
 * Decodes UTF-8 entry bytes.
 * @param {Uint8Array} bytes Source bytes.
 * @returns {string}
 */
function decode(bytes) {
    return strFromU8(bytes)
}

/**
 * Builds a parse diagnostic.
 * @param {string} fileName Source file.
 * @param {unknown} error Error object.
 * @returns {object}
 */
function parseDiagnostic(fileName, error) {
    return {
        severity: 'warning',
        fileName,
        message: String(error?.message || error)
    }
}

/**
 * Normalizes path separators.
 * @param {string} path Path value.
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
 * Returns the normalized parent path.
 * @param {string} path Source path.
 * @returns {string}
 */
function parentPath(path) {
    const parts = normalizePath(path).split('/')
    parts.pop()
    return parts.join('/')
}

/**
 * Removes KiCad library suffixes.
 * @param {string} value Library basename.
 * @returns {string}
 */
function stripKnownLibraryExtension(value) {
    return String(value || '').replace(
        /\.(pretty|kicad_symdir|kicad_sym)$/i,
        ''
    )
}
