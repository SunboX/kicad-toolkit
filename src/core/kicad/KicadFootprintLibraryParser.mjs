// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { KicadPcbParser } from './KicadPcbParser.mjs'
import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'
import { SExpressionParser } from './SExpressionParser.mjs'
import { SExpressionTree } from './SExpressionTree.mjs'

/**
 * Parses standalone KiCad footprint library files.
 */
export class KicadFootprintLibraryParser {
    /**
     * Parses a .kicad_mod source document.
     * @param {string} source Footprint library source text.
     * @param {{ fileName?: string }} [options] Parser options.
     * @returns {object}
     */
    static parse(source, options = {}) {
        const parsed = SExpressionParser.parseWithMetadata(source)
        const rootName = SExpressionTree.nodeName(parsed.root)

        if (rootName !== 'footprint' && rootName !== 'module') {
            throw new Error('Expected footprint root')
        }

        const fileName = String(options.fileName || '')
        const board = KicadPcbParser.parse(wrapFootprintSource(source), {
            fileName
        })
        const footprint = board.footprints[0]

        if (!footprint) {
            throw new Error('Standalone footprint did not produce a footprint')
        }

        const pads = footprint.pads || []
        const drawings = footprint.drawings || []
        const texts = footprint.texts || []
        const models = footprint.models || []
        const title = String(footprint.libraryName || parsed.root[1] || '')
        const footprintName =
            libraryItemName(footprint.footprintName || title) || title

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'footprint-library',
            fileType: 'kicad_mod',
            fileName,
            summary: {
                title: title || stripExtension(fileName),
                footprintCount: 1,
                padCount: pads.length,
                drawingCount: drawings.length,
                textCount: texts.length,
                modelCount: models.length
            },
            diagnostics: [
                {
                    severity: 'info',
                    message:
                        'Recovered standalone KiCad footprint ' +
                        (footprintName || 'library item') +
                        '.'
                }
            ],
            footprint,
            footprints: [footprint],
            pads,
            drawings,
            texts,
            models,
            pcbLibrary: {
                footprints: [
                    {
                        name: footprintName,
                        libraryName: footprint.libraryName || title,
                        footprintName,
                        description: footprint.description || '',
                        tags: footprint.tags || '',
                        properties: footprint.properties || {},
                        attributes: footprint.attributes || [],
                        pads,
                        drawings,
                        texts,
                        models,
                        kicadFootprint: footprint
                    }
                ]
            },
            rawFootprint: parsed.root,
            sexpr: parsed.metadata,
            bom: []
        })
    }
}

/**
 * Wraps a standalone footprint root in a minimal board for parser reuse.
 * @param {string} source Standalone footprint source text.
 * @returns {string}
 */
function wrapFootprintSource(source) {
    return `(kicad_pcb (version 20240108) ${source})`
}

/**
 * Returns the item name from a KiCad library identifier.
 * @param {string} value Library identifier.
 * @returns {string}
 */
function libraryItemName(value) {
    return String(value || '')
        .replaceAll('{slash}', '/')
        .split(':')
        .at(-1)
}

/**
 * Removes the last extension from a file name.
 * @param {string} fileName Source file name.
 * @returns {string}
 */
function stripExtension(fileName) {
    return String(fileName || '')
        .replace(/\\/g, '/')
        .split('/')
        .at(-1)
        .replace(/\.[^.]+$/, '')
}
