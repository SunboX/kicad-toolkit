// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { NormalizedModelSchema } from './NormalizedModelSchema.mjs'
import { SExpressionParser } from './SExpressionParser.mjs'
import { SExpressionTree } from './SExpressionTree.mjs'

const graphicTypes = Object.freeze([
    'polyline',
    'rectangle',
    'circle',
    'arc',
    'bezier'
])

/**
 * Parses standalone KiCad schematic symbol library files.
 */
export class KicadSymbolLibraryParser {
    /**
     * Parses a .kicad_sym source document.
     * @param {string} source Symbol library source text.
     * @param {{ fileName?: string }} [options] Parser options.
     * @returns {object}
     */
    static parse(source, options = {}) {
        const parsed = SExpressionParser.parseWithMetadata(source)

        if (SExpressionTree.nodeName(parsed.root) !== 'kicad_symbol_lib') {
            throw new Error('Expected kicad_symbol_lib root')
        }

        const fileName = String(options.fileName || '')
        const symbols = SExpressionTree.children(parsed.root, 'symbol').map(
            parseSymbol
        )
        const pinCount = sum(symbols, 'pinCount')
        const propertyCount = sum(symbols, 'propertyCount')
        const graphicCount = sum(symbols, 'graphicCount')

        return NormalizedModelSchema.attach({
            sourceFormat: 'kicad',
            kind: 'symbol-library',
            fileType: 'kicad_sym',
            fileName,
            summary: {
                title: stripExtension(fileName) || 'KiCad symbol library',
                symbolCount: symbols.length,
                pinCount,
                propertyCount,
                graphicCount
            },
            diagnostics: [
                {
                    severity: 'info',
                    message:
                        'Recovered ' +
                        symbols.length +
                        ' standalone KiCad symbol library entries.'
                }
            ],
            version: SExpressionTree.numberValue(
                SExpressionTree.child(parsed.root, 'version')?.[1],
                0
            ),
            generator: SExpressionTree.textValue(
                SExpressionTree.child(parsed.root, 'generator')
            ),
            generatorVersion: SExpressionTree.textValue(
                SExpressionTree.child(parsed.root, 'generator_version')
            ),
            symbols,
            schematicLibrary: {
                symbols
            },
            rawLibrary: parsed.root,
            sexpr: parsed.metadata,
            bom: []
        })
    }
}

/**
 * Parses one top-level library symbol.
 * @param {Array} node Symbol node.
 * @returns {object}
 */
function parseSymbol(node) {
    const name = SExpressionTree.textValue(node)
    const itemName = libraryItemName(name)
    const propertyNodes = SExpressionTree.children(node, 'property')
    const properties = SExpressionTree.propertyObject(node)
    const nestedSymbols = SExpressionTree.children(node, 'symbol')
    const memberNodes = [node, ...nestedSymbols].flatMap((entry) => {
        return SExpressionTree.children(entry).filter(
            (childNode) => SExpressionTree.nodeName(childNode) !== 'symbol'
        )
    })
    const pins = memberNodes
        .filter((childNode) => SExpressionTree.nodeName(childNode) === 'pin')
        .map(parsePin)
    const graphics = parseGraphics(memberNodes)
    const graphicCount = Object.values(graphics).reduce(
        (total, entries) => total + entries.length,
        0
    )

    return {
        name,
        itemName,
        properties,
        propertyRows: propertyNodes.map(parseProperty),
        pinCount: pins.length,
        propertyCount: propertyNodes.length,
        graphicCount,
        pins,
        graphics,
        units: nestedSymbols.map(parseNestedSymbol),
        rawSymbol: node
    }
}

/**
 * Parses one symbol property.
 * @param {Array} node Property node.
 * @returns {object}
 */
function parseProperty(node) {
    return {
        name: SExpressionTree.textValue(node),
        value: String(node?.[2] ?? ''),
        at: parseAt(SExpressionTree.child(node, 'at')),
        hidden:
            hasScalar(node, 'hide') || SExpressionTree.hasChild(node, 'hide')
    }
}

/**
 * Parses one nested unit/body symbol node.
 * @param {Array} node Nested symbol node.
 * @returns {object}
 */
function parseNestedSymbol(node) {
    const childNodes = SExpressionTree.children(node)
    const pins = childNodes
        .filter((childNode) => SExpressionTree.nodeName(childNode) === 'pin')
        .map(parsePin)
    const graphics = parseGraphics(childNodes)

    return {
        name: SExpressionTree.textValue(node),
        pins,
        graphics,
        rawSymbol: node
    }
}

/**
 * Parses one library symbol pin.
 * @param {Array} node Pin node.
 * @returns {object}
 */
function parsePin(node) {
    const at = parseAt(SExpressionTree.child(node, 'at'))
    const nameNode = SExpressionTree.child(node, 'name')
    const numberNode = SExpressionTree.child(node, 'number')

    return {
        electricalType: String(node?.[1] || ''),
        shape: String(node?.[2] || ''),
        name: SExpressionTree.textValue(nameNode),
        number: SExpressionTree.textValue(numberNode),
        at,
        length: SExpressionTree.numberValue(
            SExpressionTree.child(node, 'length')?.[1],
            0
        ),
        orientation: orientationFromRotation(at.rotation),
        hidden:
            hasScalar(node, 'hide') || SExpressionTree.hasChild(node, 'hide')
    }
}

/**
 * Groups supported library symbol graphics by primitive type.
 * @param {Array[]} nodes Candidate child nodes.
 * @returns {{ lines: object[], rectangles: object[], circles: object[], arcs: object[], beziers: object[] }}
 */
function parseGraphics(nodes) {
    const graphics = {
        lines: [],
        rectangles: [],
        circles: [],
        arcs: [],
        beziers: []
    }

    for (const node of nodes) {
        const name = SExpressionTree.nodeName(node)
        if (!graphicTypes.includes(name)) continue

        if (name === 'polyline') {
            graphics.lines.push(parsePolyline(node))
        } else if (name === 'rectangle') {
            graphics.rectangles.push(parseRectangle(node))
        } else if (name === 'circle') {
            graphics.circles.push(parseCircle(node))
        } else if (name === 'arc') {
            graphics.arcs.push(parseArc(node))
        } else if (name === 'bezier') {
            graphics.beziers.push(parseBezier(node))
        }
    }

    return graphics
}

/**
 * Parses a symbol polyline primitive.
 * @param {Array} node Polyline node.
 * @returns {object}
 */
function parsePolyline(node) {
    return {
        type: 'polyline',
        points: parsePoints(SExpressionTree.child(node, 'pts')),
        stroke: parseStroke(SExpressionTree.child(node, 'stroke')),
        fill: parseFill(SExpressionTree.child(node, 'fill')),
        raw: node
    }
}

/**
 * Parses a symbol rectangle primitive.
 * @param {Array} node Rectangle node.
 * @returns {object}
 */
function parseRectangle(node) {
    return {
        type: 'rectangle',
        start: SExpressionTree.vec2(SExpressionTree.child(node, 'start')),
        end: SExpressionTree.vec2(SExpressionTree.child(node, 'end')),
        stroke: parseStroke(SExpressionTree.child(node, 'stroke')),
        fill: parseFill(SExpressionTree.child(node, 'fill')),
        raw: node
    }
}

/**
 * Parses a symbol circle primitive.
 * @param {Array} node Circle node.
 * @returns {object}
 */
function parseCircle(node) {
    return {
        type: 'circle',
        center: SExpressionTree.vec2(SExpressionTree.child(node, 'center')),
        radius: SExpressionTree.numberValue(
            SExpressionTree.child(node, 'radius')?.[1],
            0
        ),
        stroke: parseStroke(SExpressionTree.child(node, 'stroke')),
        fill: parseFill(SExpressionTree.child(node, 'fill')),
        raw: node
    }
}

/**
 * Parses a symbol arc primitive.
 * @param {Array} node Arc node.
 * @returns {object}
 */
function parseArc(node) {
    return {
        type: 'arc',
        start: SExpressionTree.vec2(SExpressionTree.child(node, 'start')),
        mid: SExpressionTree.vec2(SExpressionTree.child(node, 'mid')),
        end: SExpressionTree.vec2(SExpressionTree.child(node, 'end')),
        stroke: parseStroke(SExpressionTree.child(node, 'stroke')),
        fill: parseFill(SExpressionTree.child(node, 'fill')),
        raw: node
    }
}

/**
 * Parses a symbol Bezier primitive.
 * @param {Array} node Bezier node.
 * @returns {object}
 */
function parseBezier(node) {
    return {
        type: 'bezier',
        points: parsePoints(SExpressionTree.child(node, 'pts')),
        stroke: parseStroke(SExpressionTree.child(node, 'stroke')),
        fill: parseFill(SExpressionTree.child(node, 'fill')),
        raw: node
    }
}

/**
 * Parses a KiCad at node.
 * @param {Array | undefined} node At node.
 * @returns {{ x: number, y: number, rotation: number }}
 */
function parseAt(node) {
    return {
        x: SExpressionTree.numberValue(node?.[1], 0),
        y: SExpressionTree.numberValue(node?.[2], 0),
        rotation: SExpressionTree.numberValue(node?.[3], 0)
    }
}

/**
 * Parses a KiCad point list.
 * @param {Array | undefined} node Points node.
 * @returns {{ x: number, y: number }[]}
 */
function parsePoints(node) {
    return SExpressionTree.children(node, 'xy').map((entry) =>
        SExpressionTree.vec2(entry)
    )
}

/**
 * Parses a symbol stroke node.
 * @param {Array | undefined} node Stroke node.
 * @returns {{ width: number, type: string }}
 */
function parseStroke(node) {
    return {
        width: SExpressionTree.numberValue(
            SExpressionTree.child(node, 'width')?.[1],
            0
        ),
        type: SExpressionTree.textValue(SExpressionTree.child(node, 'type'))
    }
}

/**
 * Parses a symbol fill node.
 * @param {Array | undefined} node Fill node.
 * @returns {{ type: string }}
 */
function parseFill(node) {
    return {
        type: SExpressionTree.textValue(SExpressionTree.child(node, 'type'))
    }
}

/**
 * Resolves the KiCad pin direction token from its rotation.
 * @param {number} rotation Pin rotation in degrees.
 * @returns {'right' | 'top' | 'left' | 'bottom'}
 */
function orientationFromRotation(rotation) {
    const normalized = ((Math.round(Number(rotation) || 0) % 360) + 360) % 360
    if (normalized === 90) return 'top'
    if (normalized === 180) return 'left'
    if (normalized === 270) return 'bottom'
    return 'right'
}

/**
 * Checks whether a node contains a scalar token.
 * @param {Array | undefined} node Node.
 * @param {string} name Token name.
 * @returns {boolean}
 */
function hasScalar(node, name) {
    return (node || []).slice(1).some((value) => String(value) === name)
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
 * Sums numeric fields across records.
 * @param {object[]} records Records to inspect.
 * @param {string} field Numeric field name.
 * @returns {number}
 */
function sum(records, field) {
    return records.reduce(
        (total, record) => total + Number(record[field] || 0),
        0
    )
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
