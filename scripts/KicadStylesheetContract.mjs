// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from 'node:crypto'

/**
 * Captures exact and structural contracts for public stylesheets.
 */
export class KicadStylesheetContract {
    /**
     * Captures one stylesheet.
     * @param {string} source Stylesheet source.
     * @returns {{ sha256: string, rules: object[] }} Stylesheet contract.
     */
    static capture(source) {
        return {
            sha256: createHash('sha256').update(source).digest('hex'),
            rules: stylesheetRules(source)
        }
    }
}

/**
 * Extracts qualified CSS rules without being confused by comments or strings.
 * @param {string} source Stylesheet source.
 * @returns {{ selectors: string[], declarations: object[] }[]} Rules.
 */
function stylesheetRules(source) {
    const rules = []
    let cursor = 0
    while (cursor < source.length) {
        cursor = skipWhitespaceAndComments(source, cursor)
        if (cursor >= source.length) break
        const opening = findOutsideSyntax(source, cursor, '{')
        if (opening < 0) break
        const closing = matchingBrace(source, opening)
        if (closing < 0) break
        const prelude = source.slice(cursor, opening).trim()
        const body = source.slice(opening + 1, closing)
        if (prelude.startsWith('@')) {
            rules.push(...stylesheetRules(body))
        } else {
            const selectors = splitOutsideSyntax(prelude, ',')
                .map((selector) => selector.trim())
                .filter(Boolean)
                .sort()
            const declarations = cssDeclarations(body)
            if (selectors.length && declarations.length) {
                rules.push({ selectors, declarations })
            }
        }
        cursor = closing + 1
    }
    return rules.sort((left, right) =>
        left.selectors.join(',').localeCompare(right.selectors.join(','))
    )
}

/**
 * Parses declarations in one rule body.
 * @param {string} body Rule body.
 * @returns {{ property: string, value: string }[]} Declarations.
 */
function cssDeclarations(body) {
    return splitOutsideSyntax(body, ';')
        .map((declaration) => {
            const separator = findOutsideSyntax(declaration, 0, ':')
            if (separator < 0) return null
            const property = declaration.slice(0, separator).trim()
            const value = declaration.slice(separator + 1).trim()
            return property && value ? { property, value } : null
        })
        .filter(Boolean)
        .sort((left, right) => left.property.localeCompare(right.property))
}

/**
 * Splits source on a delimiter outside strings, comments, and nesting.
 * @param {string} source Source text.
 * @param {string} delimiter Delimiter.
 * @returns {string[]} Parts.
 */
function splitOutsideSyntax(source, delimiter) {
    const parts = []
    let start = 0
    let cursor = 0
    let round = 0
    let square = 0
    while (cursor < source.length) {
        const character = source[cursor]
        if (character === '/' && source[cursor + 1] === '*') {
            cursor = commentEnd(source, cursor)
            continue
        }
        if (character === '"' || character === "'") {
            cursor = stringEnd(source, cursor, character)
            continue
        }
        if (character === '(') round += 1
        else if (character === ')') round -= 1
        else if (character === '[') square += 1
        else if (character === ']') square -= 1
        else if (character === delimiter && round === 0 && square === 0) {
            parts.push(source.slice(start, cursor))
            start = cursor + 1
        }
        cursor += 1
    }
    parts.push(source.slice(start))
    return parts
}

/**
 * Finds one character outside strings, comments, and parentheses.
 * @param {string} source Source text.
 * @param {number} start Start index.
 * @param {string} target Character to find.
 * @returns {number} Index or -1.
 */
function findOutsideSyntax(source, start, target) {
    let round = 0
    let square = 0
    for (let cursor = start; cursor < source.length; cursor += 1) {
        const character = source[cursor]
        if (character === '/' && source[cursor + 1] === '*') {
            cursor = commentEnd(source, cursor) - 1
            continue
        }
        if (character === '"' || character === "'") {
            cursor = stringEnd(source, cursor, character) - 1
            continue
        }
        if (character === '(') round += 1
        else if (character === ')') round -= 1
        else if (character === '[') square += 1
        else if (character === ']') square -= 1
        else if (character === target && round === 0 && square === 0) {
            return cursor
        }
    }
    return -1
}

/**
 * Finds the closing brace for a CSS block.
 * @param {string} source Source text.
 * @param {number} opening Opening brace.
 * @returns {number} Closing brace or -1.
 */
function matchingBrace(source, opening) {
    let depth = 0
    for (let cursor = opening; cursor < source.length; cursor += 1) {
        const character = source[cursor]
        if (character === '/' && source[cursor + 1] === '*') {
            cursor = commentEnd(source, cursor) - 1
            continue
        }
        if (character === '"' || character === "'") {
            cursor = stringEnd(source, cursor, character) - 1
            continue
        }
        if (character === '{') depth += 1
        else if (character === '}' && --depth === 0) return cursor
    }
    return -1
}

/**
 * Skips insignificant CSS text.
 * @param {string} source Source text.
 * @param {number} start Start index.
 * @returns {number} First significant index.
 */
function skipWhitespaceAndComments(source, start) {
    let cursor = start
    while (cursor < source.length) {
        if (/\s/u.test(source[cursor])) {
            cursor += 1
            continue
        }
        if (source[cursor] === '/' && source[cursor + 1] === '*') {
            cursor = commentEnd(source, cursor)
            continue
        }
        break
    }
    return cursor
}

/**
 * Returns the index after a CSS comment.
 * @param {string} source Source text.
 * @param {number} start Comment start.
 * @returns {number} Index after comment.
 */
function commentEnd(source, start) {
    const end = source.indexOf('*/', start + 2)
    return end < 0 ? source.length : end + 2
}

/**
 * Returns the index after a quoted CSS string.
 * @param {string} source Source text.
 * @param {number} start Quote index.
 * @param {string} quote Quote character.
 * @returns {number} Index after string.
 */
function stringEnd(source, start, quote) {
    let cursor = start + 1
    while (cursor < source.length) {
        if (source[cursor] === '\\') cursor += 2
        else if (source[cursor] === quote) return cursor + 1
        else cursor += 1
    }
    return source.length
}
