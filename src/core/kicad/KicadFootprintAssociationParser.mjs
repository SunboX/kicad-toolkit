// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'
import { SExpressionParser } from './SExpressionParser.mjs'
import { SExpressionTree } from './SExpressionTree.mjs'

/**
 * Parses KiCad footprint association .cmp files.
 */
export class KicadFootprintAssociationParser {
    /**
     * Parses a .cmp source document.
     * @param {string} source Association source.
     * @param {{ fileName?: string }} [options] Parser options.
     * @returns {object}
     */
    static parse(source, options = {}) {
        const parsed = SExpressionParser.parseWithMetadata(source)
        const fileName = String(options.fileName || '')
        const associations = SExpressionTree.children(parsed.root, [
            'component',
            'comp'
        ]).map(parseAssociation)

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'footprint-associations',
            fileType: 'cmp',
            fileName,
            summary: {
                title:
                    stripExtension(baseName(fileName)) ||
                    'KiCad footprint associations',
                associationCount: associations.length
            },
            diagnostics: [],
            associations,
            rawAssociations: parsed.root,
            sexpr: parsed.metadata,
            bom: []
        })
    }
}

/**
 * Parses one component footprint association.
 * @param {Array} node Component association node.
 * @returns {object}
 */
function parseAssociation(node) {
    return {
        ref: SExpressionTree.textValue(SExpressionTree.child(node, 'ref')),
        value: SExpressionTree.textValue(SExpressionTree.child(node, 'value')),
        footprint: SExpressionTree.textValue(
            SExpressionTree.child(node, 'footprint')
        ),
        rawAssociation: node
    }
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
