// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'
import { SExpressionParser } from './SExpressionParser.mjs'
import { SExpressionTree } from './SExpressionTree.mjs'

/**
 * Parses KiCad S-expression netlist export files.
 */
export class KicadNetlistParser {
    /**
     * Parses a .net source document.
     * @param {string} source Netlist source.
     * @param {{ fileName?: string }} [options] Parser options.
     * @returns {object}
     */
    static parse(source, options = {}) {
        const parsed = SExpressionParser.parseWithMetadata(source)

        if (SExpressionTree.nodeName(parsed.root) !== 'export') {
            throw new Error('Expected export root')
        }

        const fileName = String(options.fileName || '')
        const components = SExpressionTree.children(
            SExpressionTree.child(parsed.root, 'components'),
            'comp'
        ).map(parseComponent)
        const nets = SExpressionTree.children(
            SExpressionTree.child(parsed.root, 'nets'),
            'net'
        ).map(parseNet)
        const nodeCount = nets.reduce((total, net) => {
            return total + net.nodes.length
        }, 0)

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'netlist',
            fileType: 'net',
            fileName,
            summary: {
                title: stripExtension(baseName(fileName)) || 'KiCad netlist',
                componentCount: components.length,
                netCount: nets.length,
                nodeCount
            },
            diagnostics: [],
            version: SExpressionTree.textValue(
                SExpressionTree.child(parsed.root, 'version')
            ),
            components,
            nets,
            rawNetlist: parsed.root,
            sexpr: parsed.metadata,
            bom: []
        })
    }
}

/**
 * Parses one netlist component.
 * @param {Array} node Component node.
 * @returns {object}
 */
function parseComponent(node) {
    const libsource = SExpressionTree.child(node, 'libsource')

    return {
        ref: SExpressionTree.textValue(SExpressionTree.child(node, 'ref')),
        value: SExpressionTree.textValue(SExpressionTree.child(node, 'value')),
        footprint: SExpressionTree.textValue(
            SExpressionTree.child(node, 'footprint')
        ),
        lib: SExpressionTree.textValue(SExpressionTree.child(libsource, 'lib')),
        part: SExpressionTree.textValue(
            SExpressionTree.child(libsource, 'part')
        ),
        properties: Object.fromEntries(
            SExpressionTree.children(node, 'property').map((property) => [
                SExpressionTree.textValue(
                    SExpressionTree.child(property, 'name')
                ),
                SExpressionTree.textValue(
                    SExpressionTree.child(property, 'value')
                )
            ])
        ),
        rawComponent: node
    }
}

/**
 * Parses one netlist net.
 * @param {Array} node Net node.
 * @returns {object}
 */
function parseNet(node) {
    return {
        code: SExpressionTree.numberValue(
            SExpressionTree.child(node, 'code')?.[1],
            0
        ),
        name: SExpressionTree.textValue(SExpressionTree.child(node, 'name')),
        nodes: SExpressionTree.children(node, 'node').map((entry) => ({
            ref: SExpressionTree.textValue(SExpressionTree.child(entry, 'ref')),
            pin: SExpressionTree.textValue(SExpressionTree.child(entry, 'pin'))
        })),
        rawNet: node
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
