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
                pinCount: sumSymbols(symbols, 'pinCount'),
                graphicCount: sumSymbols(symbols, 'graphicCount'),
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
                graphics: emptyLegacyGraphics(),
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
            current.pins.push(parseLegacyPin(parts))
        } else if (isLegacyGraphic(parts[0])) {
            appendLegacyGraphic(current.graphics, parts)
        } else if (parts[0] === 'ENDDEF') {
            current = null
        }
    }

    return symbols.map((symbol) => ({
        ...symbol,
        pinCount: symbol.pins.length,
        graphicCount: legacyGraphicCount(symbol.graphics)
    }))
}

/**
 * Parses one legacy symbol pin row.
 * @param {string[]} parts Tokenized X row.
 * @returns {object}
 */
function parseLegacyPin(parts) {
    const shapeToken = parts[12] || ''
    const hidden = legacyPinHidden(shapeToken)
    return {
        name: parts[1] || '',
        number: parts[2] || '',
        x: numberOrZero(parts[3]),
        y: numberOrZero(parts[4]),
        length: numberOrZero(parts[5]),
        orientation: parts[6] || '',
        electricalType: parts[11] || '',
        unit: numberOrZero(parts[9]),
        convert: numberOrZero(parts[10]),
        nameSize: numberOrZero(parts[7]),
        numberSize: numberOrZero(parts[8]),
        shapeToken,
        pinStyle: legacyPinStyle(shapeToken),
        hidden,
        visible: !hidden
    }
}

/**
 * Returns empty legacy symbol graphics buckets.
 * @returns {{ rectangles: object[], circles: object[], polylines: object[], arcs: object[] }}
 */
function emptyLegacyGraphics() {
    return {
        rectangles: [],
        circles: [],
        polylines: [],
        arcs: []
    }
}

/**
 * Checks whether a legacy DRAW row is a supported graphic primitive.
 * @param {string} token Row token.
 * @returns {boolean}
 */
function isLegacyGraphic(token) {
    return ['S', 'C', 'P', 'A'].includes(String(token || ''))
}

/**
 * Appends one parsed legacy DRAW graphic.
 * @param {object} graphics Mutable graphics buckets.
 * @param {string[]} parts Tokenized graphic row.
 * @returns {void}
 */
function appendLegacyGraphic(graphics, parts) {
    const graphic = parseLegacyGraphic(parts)
    if (!graphic) return
    if (graphic.type === 'rectangle') graphics.rectangles.push(graphic)
    else if (graphic.type === 'circle') graphics.circles.push(graphic)
    else if (graphic.type === 'polyline') graphics.polylines.push(graphic)
    else if (graphic.type === 'arc') graphics.arcs.push(graphic)
}

/**
 * Parses one legacy DRAW graphic row.
 * @param {string[]} parts Tokenized graphic row.
 * @returns {object | null}
 */
function parseLegacyGraphic(parts) {
    if (parts[0] === 'S') return parseLegacyRectangle(parts)
    if (parts[0] === 'C') return parseLegacyCircle(parts)
    if (parts[0] === 'P') return parseLegacyPolyline(parts)
    if (parts[0] === 'A') return parseLegacyArc(parts)
    return null
}

/**
 * Parses one legacy rectangle row.
 * @param {string[]} parts Tokenized S row.
 * @returns {object}
 */
function parseLegacyRectangle(parts) {
    return {
        type: 'rectangle',
        start: { x: numberOrZero(parts[1]), y: numberOrZero(parts[2]) },
        end: { x: numberOrZero(parts[3]), y: numberOrZero(parts[4]) },
        unit: numberOrZero(parts[5]),
        convert: numberOrZero(parts[6]),
        strokeWidth: numberOrZero(parts[7]),
        fill: legacyFill(parts[8])
    }
}

/**
 * Parses one legacy circle row.
 * @param {string[]} parts Tokenized C row.
 * @returns {object}
 */
function parseLegacyCircle(parts) {
    return {
        type: 'circle',
        center: { x: numberOrZero(parts[1]), y: numberOrZero(parts[2]) },
        radius: numberOrZero(parts[3]),
        unit: numberOrZero(parts[4]),
        convert: numberOrZero(parts[5]),
        strokeWidth: numberOrZero(parts[6]),
        fill: legacyFill(parts[7])
    }
}

/**
 * Parses one legacy polyline row.
 * @param {string[]} parts Tokenized P row.
 * @returns {object}
 */
function parseLegacyPolyline(parts) {
    const pointCount = numberOrZero(parts[1])
    return {
        type: 'polyline',
        pointCount,
        points: legacyPoints(parts.slice(5, 5 + pointCount * 2)),
        unit: numberOrZero(parts[2]),
        convert: numberOrZero(parts[3]),
        strokeWidth: numberOrZero(parts[4]),
        fill: legacyFill(parts[5 + pointCount * 2])
    }
}

/**
 * Parses one legacy arc row.
 * @param {string[]} parts Tokenized A row.
 * @returns {object}
 */
function parseLegacyArc(parts) {
    return {
        type: 'arc',
        center: { x: numberOrZero(parts[1]), y: numberOrZero(parts[2]) },
        radius: numberOrZero(parts[3]),
        startAngle: numberOrZero(parts[4]) / 10,
        endAngle: numberOrZero(parts[5]) / 10,
        unit: numberOrZero(parts[6]),
        convert: numberOrZero(parts[7]),
        strokeWidth: numberOrZero(parts[8]),
        fill: legacyFill(parts[9]),
        start: { x: numberOrZero(parts[10]), y: numberOrZero(parts[11]) },
        end: { x: numberOrZero(parts[12]), y: numberOrZero(parts[13]) }
    }
}

/**
 * Parses legacy point coordinate tokens.
 * @param {string[]} values Coordinate tokens.
 * @returns {{ x: number, y: number }[]}
 */
function legacyPoints(values) {
    const points = []
    for (let index = 0; index < values.length; index += 2) {
        points.push({
            x: numberOrZero(values[index]),
            y: numberOrZero(values[index + 1])
        })
    }
    return points
}

/**
 * Normalizes legacy fill tokens.
 * @param {string} value Fill token.
 * @returns {string}
 */
function legacyFill(value) {
    const rawToken = String(value || '')
    if (rawToken === 'f') return 'outline'
    const token = rawToken.toUpperCase()
    if (token === 'F' || token === 'B') return 'filled'
    return 'none'
}

/**
 * Maps a legacy pin shape token to a modern style token.
 * @param {string} value Shape token.
 * @returns {string}
 */
function legacyPinStyle(value) {
    const shape = String(value || '')
        .replace(/N/gu, '')
        .toUpperCase()
    if (shape === 'I') return 'inverted'
    if (shape === 'C') return 'clock'
    if (shape === 'IC' || shape === 'CI') return 'inverted_clock'
    if (shape === 'L') return 'input_low'
    if (shape === 'CL') return 'clock_low'
    if (shape === 'V') return 'output_low'
    if (shape === 'F') return 'edge_clock_high'
    if (shape === 'X') return 'non_logic'
    return 'line'
}

/**
 * Checks whether a legacy pin shape token marks a hidden pin.
 * @param {string} value Shape token.
 * @returns {boolean}
 */
function legacyPinHidden(value) {
    return /N/u.test(String(value || ''))
}

/**
 * Counts legacy graphics.
 * @param {object} graphics Graphics buckets.
 * @returns {number}
 */
function legacyGraphicCount(graphics) {
    return Object.values(graphics || {}).reduce((total, entries) => {
        return total + (entries || []).length
    }, 0)
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

/**
 * Sums one numeric field across parsed legacy symbols.
 * @param {object[]} symbols Parsed symbols.
 * @param {string} field Field name.
 * @returns {number}
 */
function sumSymbols(symbols, field) {
    return (symbols || []).reduce((total, symbol) => {
        return total + numberOrZero(symbol?.[field])
    }, 0)
}
