// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'
import { SExpressionParser } from './SExpressionParser.mjs'
import { SExpressionTree } from './SExpressionTree.mjs'

/**
 * Parses KiCad worksheet page-layout files.
 */
export class KicadWorksheetParser {
    /**
     * Parses a .kicad_wks source document.
     * @param {string} source Worksheet source.
     * @param {{ fileName?: string }} [options] Parser options.
     * @returns {object}
     */
    static parse(source, options = {}) {
        const parsed = SExpressionParser.parseWithMetadata(source)

        if (SExpressionTree.nodeName(parsed.root) !== 'kicad_wks') {
            throw new Error('Expected kicad_wks root')
        }

        const fileName = String(options.fileName || '')
        const lines = SExpressionTree.children(parsed.root, 'line').map(
            parseLine
        )
        const rectangles = SExpressionTree.children(parsed.root, 'rect').map(
            parseRectangle
        )
        const texts = SExpressionTree.children(parsed.root, 'tbtext').map(
            parseText
        )
        const polygons = SExpressionTree.children(parsed.root, [
            'polygon',
            'poly'
        ]).map(parseGenericItem)
        const bitmaps = SExpressionTree.children(parsed.root, 'bitmap').map(
            parseGenericItem
        )

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'worksheet',
            fileType: 'kicad_wks',
            fileName,
            summary: {
                title: stripExtension(baseName(fileName)) || 'KiCad worksheet',
                itemCount:
                    lines.length +
                    rectangles.length +
                    texts.length +
                    polygons.length +
                    bitmaps.length,
                textCount: texts.length,
                lineCount: lines.length,
                rectangleCount: rectangles.length,
                polygonCount: polygons.length,
                bitmapCount: bitmaps.length
            },
            diagnostics: [],
            version: SExpressionTree.numberValue(
                SExpressionTree.child(parsed.root, 'version')?.[1],
                0
            ),
            generator: SExpressionTree.textValue(
                SExpressionTree.child(parsed.root, 'generator')
            ),
            setup: parseSetup(SExpressionTree.child(parsed.root, 'setup')),
            lines,
            rectangles,
            texts,
            polygons,
            bitmaps,
            rawWorksheet: parsed.root,
            sexpr: parsed.metadata,
            bom: []
        })
    }
}

/**
 * Parses worksheet setup defaults.
 * @param {Array | undefined} node Setup node.
 * @returns {object}
 */
function parseSetup(node) {
    return {
        textSize: sizeFromNode(SExpressionTree.child(node, 'textsize')),
        lineWidth: SExpressionTree.numberValue(
            SExpressionTree.child(node, 'linewidth')?.[1],
            0
        ),
        textLineWidth: SExpressionTree.numberValue(
            SExpressionTree.child(node, 'textlinewidth')?.[1],
            0
        ),
        margins: {
            left: SExpressionTree.numberValue(
                SExpressionTree.child(node, 'left_margin')?.[1],
                0
            ),
            right: SExpressionTree.numberValue(
                SExpressionTree.child(node, 'right_margin')?.[1],
                0
            ),
            top: SExpressionTree.numberValue(
                SExpressionTree.child(node, 'top_margin')?.[1],
                0
            ),
            bottom: SExpressionTree.numberValue(
                SExpressionTree.child(node, 'bottom_margin')?.[1],
                0
            )
        }
    }
}

/**
 * Parses a worksheet line.
 * @param {Array} node Line node.
 * @returns {object}
 */
function parseLine(node) {
    return {
        type: 'line',
        name: SExpressionTree.textValue(SExpressionTree.child(node, 'name')),
        start: SExpressionTree.vec2(SExpressionTree.child(node, 'start')),
        end: SExpressionTree.vec2(SExpressionTree.child(node, 'end')),
        lineWidth: SExpressionTree.numberValue(
            SExpressionTree.child(node, 'linewidth')?.[1],
            0
        ),
        repeat: parseRepeat(node),
        raw: node
    }
}

/**
 * Parses a worksheet rectangle.
 * @param {Array} node Rectangle node.
 * @returns {object}
 */
function parseRectangle(node) {
    return {
        type: 'rect',
        name: SExpressionTree.textValue(SExpressionTree.child(node, 'name')),
        start: SExpressionTree.vec2(SExpressionTree.child(node, 'start')),
        end: SExpressionTree.vec2(SExpressionTree.child(node, 'end')),
        lineWidth: SExpressionTree.numberValue(
            SExpressionTree.child(node, 'linewidth')?.[1],
            0
        ),
        repeat: parseRepeat(node),
        raw: node
    }
}

/**
 * Parses a worksheet text item.
 * @param {Array} node Text node.
 * @returns {object}
 */
function parseText(node) {
    return {
        type: 'tbtext',
        text: SExpressionTree.textValue(node),
        name: SExpressionTree.textValue(SExpressionTree.child(node, 'name')),
        position: SExpressionTree.vec2(SExpressionTree.child(node, 'pos')),
        fontSize: sizeFromNode(SExpressionTree.child(node, 'font')),
        repeat: parseRepeat(node),
        raw: node
    }
}

/**
 * Parses a generic worksheet item.
 * @param {Array} node Generic node.
 * @returns {object}
 */
function parseGenericItem(node) {
    return {
        type: SExpressionTree.nodeName(node),
        name: SExpressionTree.textValue(SExpressionTree.child(node, 'name')),
        raw: node
    }
}

/**
 * Parses worksheet repeat attributes.
 * @param {Array} node Item node.
 * @returns {object}
 */
function parseRepeat(node) {
    return {
        count: SExpressionTree.numberValue(
            SExpressionTree.child(node, 'repeat')?.[1],
            1
        ),
        increment: {
            x: SExpressionTree.numberValue(
                SExpressionTree.child(node, 'incrx')?.[1],
                0
            ),
            y: SExpressionTree.numberValue(
                SExpressionTree.child(node, 'incry')?.[1],
                0
            ),
            label: SExpressionTree.numberValue(
                SExpressionTree.child(node, 'incrlabel')?.[1],
                0
            )
        }
    }
}

/**
 * Reads a size node or nested font size.
 * @param {Array | undefined} node Size or font node.
 * @returns {{ width: number, height: number }}
 */
function sizeFromNode(node) {
    const size = SExpressionTree.child(node, 'size') || node
    return {
        width: SExpressionTree.numberValue(size?.[1], 0),
        height: SExpressionTree.numberValue(size?.[2], 0)
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
