// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'
import { SExpressionParser } from './SExpressionParser.mjs'
import { SExpressionTree } from './SExpressionTree.mjs'

/**
 * Parses KiCad symbol and footprint library table files.
 */
export class KicadLibraryTableParser {
    /**
     * Parses an fp-lib-table or sym-lib-table source document.
     * @param {string} source Library table source text.
     * @param {{ fileName?: string, variables?: Record<string, string> }} [options] Parser options.
     * @returns {object}
     */
    static parse(source, options = {}) {
        const parsed = SExpressionParser.parseWithMetadata(source)
        const rootName = SExpressionTree.nodeName(parsed.root)
        const tableType = tableTypeForRoot(rootName)

        if (!tableType) {
            throw new Error('Expected KiCad library table root')
        }

        const fileName = String(options.fileName || '')
        const rows = SExpressionTree.children(parsed.root, 'lib').map(
            (row, index) => parseLibraryRow(row, index, options.variables || {})
        )

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'library-table',
            fileType: fileTypeForTable(tableType),
            fileName,
            tableType,
            summary: {
                title:
                    stripExtension(baseName(fileName)) ||
                    tableType + ' library table',
                libraryCount: rows.length,
                enabledLibraryCount: rows.filter((row) => row.enabled).length
            },
            diagnostics: [],
            rows,
            rawTable: parsed.root,
            sexpr: parsed.metadata,
            bom: []
        })
    }

    /**
     * Returns true when a file name is a KiCad library table name.
     * @param {string} fileName Candidate file name.
     * @returns {boolean}
     */
    static isLibraryTableFile(fileName) {
        const name = baseName(fileName).toLowerCase()
        return name === 'fp-lib-table' || name === 'sym-lib-table'
    }
}

/**
 * Parses one library row.
 * @param {Array} row Row node.
 * @param {number} index Row index.
 * @param {Record<string, string>} variables Variable map.
 * @returns {object}
 */
function parseLibraryRow(row, index, variables) {
    const uri = SExpressionTree.textValue(SExpressionTree.child(row, 'uri'))
    const optionString = SExpressionTree.textValue(
        SExpressionTree.child(row, 'options')
    )

    return {
        index,
        name: SExpressionTree.textValue(SExpressionTree.child(row, 'name')),
        type: SExpressionTree.textValue(SExpressionTree.child(row, 'type')),
        uri,
        resolvedUri: expandVariables(uri, variables),
        optionString,
        options: parseOptions(optionString),
        description: SExpressionTree.textValue(
            SExpressionTree.child(row, 'descr')
        ),
        enabled: !SExpressionTree.hasChild(row, 'disabled'),
        rawRow: row
    }
}

/**
 * Parses KiCad pipe-separated library option text.
 * @param {string} optionString Raw option string.
 * @returns {Record<string, string | boolean>}
 */
function parseOptions(optionString) {
    const options = {}

    for (const part of String(optionString || '').split('|')) {
        if (!part) continue
        const separator = part.indexOf('=')
        if (separator === -1) {
            options[part] = true
            continue
        }
        options[part.slice(0, separator)] = part.slice(separator + 1)
    }

    return options
}

/**
 * Expands ${VAR} placeholders with caller-provided KiCad variables.
 * @param {string} value Source path.
 * @param {Record<string, string>} variables Variable map.
 * @returns {string}
 */
function expandVariables(value, variables) {
    return String(value || '').replace(/\$\{([^}]+)\}/g, (match, name) => {
        return Object.hasOwn(variables, name) ? String(variables[name]) : match
    })
}

/**
 * Resolves a table type from a root node name.
 * @param {string} rootName Root node name.
 * @returns {'footprint' | 'symbol' | ''}
 */
function tableTypeForRoot(rootName) {
    if (rootName === 'fp_lib_table') return 'footprint'
    if (rootName === 'sym_lib_table') return 'symbol'
    return ''
}

/**
 * Returns the normalized file type for a table type.
 * @param {'footprint' | 'symbol'} tableType Table type.
 * @returns {string}
 */
function fileTypeForTable(tableType) {
    return tableType === 'footprint' ? 'fp_lib_table' : 'sym_lib_table'
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
