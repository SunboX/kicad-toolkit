// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'

/**
 * Provides lightweight inspection for legacy KiCad library files.
 */
export class KicadLegacyLibraryParser {
    /**
     * Parses a legacy .lib, .dcm, or .mod file.
     * @param {string} source Legacy source.
     * @param {{ fileName?: string }} [options] Parser options.
     * @returns {object}
     */
    static parse(source, options = {}) {
        const fileName = String(options.fileName || '')
        const fileType = legacyFileType(fileName)
        const text = String(source || '')
        const symbols = fileType === 'lib' ? parseSymbols(text) : []
        const documentation = fileType === 'dcm' ? parseDocumentation(text) : []
        const modules = fileType === 'mod' ? parseModules(text) : []

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'legacy-library',
            fileType,
            fileName,
            summary: {
                title: stripExtension(baseName(fileName)) || 'KiCad legacy',
                symbolCount: symbols.length,
                documentationCount: documentation.length,
                moduleCount: modules.length
            },
            diagnostics: [],
            symbols,
            documentation,
            modules,
            rawSource: text,
            bom: []
        })
    }
}

/**
 * Parses legacy Eeschema .lib symbol records.
 * @param {string} source Source text.
 * @returns {object[]}
 */
function parseSymbols(source) {
    const symbols = []
    let current = null

    for (const line of source.split(/\r?\n/)) {
        const parts = splitLegacyLine(line)
        if (!parts.length) continue

        if (parts[0] === 'DEF') {
            current = {
                name: parts[1] || '',
                reference: parts[2] || '',
                fields: [],
                pins: [],
                rawLines: [line]
            }
            symbols.push(current)
            continue
        }

        if (!current) continue
        current.rawLines.push(line)

        if (/^F\d+$/.test(parts[0])) {
            current.fields.push({
                id: parts[0],
                value: parts[1] || '',
                x: numberOrZero(parts[2]),
                y: numberOrZero(parts[3])
            })
        } else if (parts[0] === 'X') {
            current.pins.push({
                name: parts[1] || '',
                number: parts[2] || '',
                x: numberOrZero(parts[3]),
                y: numberOrZero(parts[4]),
                length: numberOrZero(parts[5]),
                orientation: parts[6] || '',
                electricalType: parts[11] || ''
            })
        } else if (parts[0] === 'ENDDEF') {
            current = null
        }
    }

    return symbols
}

/**
 * Parses legacy Eeschema .dcm documentation records.
 * @param {string} source Source text.
 * @returns {object[]}
 */
function parseDocumentation(source) {
    const documentation = []
    let current = null

    for (const line of source.split(/\r?\n/)) {
        if (line.startsWith('$CMP ')) {
            current = {
                name: line.slice(5).trim(),
                description: '',
                keywords: '',
                datasheet: ''
            }
            documentation.push(current)
            continue
        }

        if (!current) continue
        if (line.startsWith('D ')) current.description = line.slice(2).trim()
        else if (line.startsWith('K ')) current.keywords = line.slice(2).trim()
        else if (line.startsWith('F ')) current.datasheet = line.slice(2).trim()
        else if (line.startsWith('$ENDCMP')) current = null
    }

    return documentation
}

/**
 * Parses lightweight legacy footprint module names.
 * @param {string} source Source text.
 * @returns {object[]}
 */
function parseModules(source) {
    const modules = []

    for (const line of source.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (trimmed.startsWith('$MODULE ')) {
            modules.push({ name: trimmed.slice(8).trim(), rawHeader: line })
        } else if (trimmed.startsWith('(module ')) {
            modules.push({
                name: trimmed.split(/\s+/)[1] || '',
                rawHeader: line
            })
        }
    }

    return modules
}

/**
 * Splits a legacy KiCad line while preserving quoted fields.
 * @param {string} line Source line.
 * @returns {string[]}
 */
function splitLegacyLine(line) {
    const tokens = []
    const matches = String(line || '').matchAll(/"([^"]*)"|(\S+)/g)

    for (const match of matches) {
        tokens.push(match[1] ?? match[2])
    }

    return tokens
}

/**
 * Converts a legacy numeric token.
 * @param {string} value Token value.
 * @returns {number}
 */
function numberOrZero(value) {
    const number = Number(value)
    return Number.isFinite(number) ? number : 0
}

/**
 * Returns the legacy file type from a path.
 * @param {string} fileName Source file name.
 * @returns {string}
 */
function legacyFileType(fileName) {
    const match = String(fileName || '').match(/\.([^.]+)$/)
    return String(match?.[1] || 'legacy').toLowerCase()
}

/**
 * Returns a slash-normalized basename.
 * @param {string} path Source path.
 * @returns {string}
 */
function baseName(path) {
    return (
        String(path || '')
            .replace(/\\/g, '/')
            .split('/')
            .pop() || ''
    )
}

/**
 * Removes the last extension from a file name.
 * @param {string} fileName Source file name.
 * @returns {string}
 */
function stripExtension(fileName) {
    return String(fileName || '').replace(/\.[^.]+$/, '')
}
