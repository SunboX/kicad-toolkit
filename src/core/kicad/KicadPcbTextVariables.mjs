// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const maxExpansionPasses = 8
const textEscapes = Object.freeze({
    brace: '{}',
    dblquote: '"',
    quote: "'",
    apos: "'",
    lt: '<',
    gt: '>',
    backslash: '\\',
    slash: '/',
    bar: '|',
    comma: ',',
    colon: ':',
    space: ' ',
    dollar: '$',
    tab: '\t',
    return: '\n',
    newline: '\n'
})

/**
 * Expands PCB text variables against board and footprint context.
 */
export class KicadPcbTextVariables {
    /**
     * Expands variable expressions and text escapes in one value.
     * @param {string} value Raw text value.
     * @param {object} [context] Expansion context.
     * @returns {string}
     */
    static expand(value, context = {}) {
        let current = expandTextEscapes(String(value || ''))

        for (let pass = 0; pass < maxExpansionPasses; pass += 1) {
            const next = current.replace(/\$\{([^}]+)\}/g, (match, name) => {
                const resolved = resolveVariable(String(name), context)
                return resolved === undefined ? match : String(resolved)
            })
            if (next === current) return next
            current = next
        }

        return current
    }
}

/**
 * Resolves one variable name.
 * @param {string} name Variable name.
 * @param {object} context Expansion context.
 * @returns {string | undefined}
 */
function resolveVariable(name, context) {
    const normalizedName = name.trim()
    const standardName = normalizedName.toUpperCase()
    const pinValue = resolvePinVariable(standardName, context)
    if (pinValue !== undefined) return pinValue

    switch (standardName) {
        case 'REFERENCE':
            return context.footprint?.reference
        case 'VALUE':
            return context.footprint?.value
        case 'LAYER':
            return context.text?.layer || context.footprint?.layer
        case 'FOOTPRINT':
            return (
                context.footprint?.footprintName ||
                context.footprint?.libraryName
            )
        case 'FOOTPRINT_LIBRARY':
            return footprintLibraryName(context.footprint)
        case 'FOOTPRINT_NAME':
            return footprintShortName(context.footprint)
        case 'TITLE':
            return context.board?.titleBlock?.title || context.board?.title
        case 'REVISION':
        case 'REV':
            return (
                context.board?.titleBlock?.revision || context.board?.revision
            )
        case 'COMPANY':
            return context.board?.titleBlock?.company
        case 'ISSUE_DATE':
        case 'DATE':
            return context.board?.titleBlock?.date
        case 'FILENAME':
            return baseName(context.board?.fileName)
        default:
            return (
                titleCommentValue(standardName, context.board) ??
                propertyValue(normalizedName, context.footprint?.properties) ??
                propertyValue(normalizedName, context.board?.properties)
            )
    }
}

/**
 * Resolves a pad or pin-specific variable.
 * @param {string} standardName Uppercase variable name.
 * @param {object} context Expansion context.
 * @returns {string | undefined}
 */
function resolvePinVariable(standardName, context) {
    const match = /^(NET_NAME|PIN_NAME|PIN_FUNCTION|PIN_TYPE)\(([^)]+)\)$/.exec(
        standardName
    )
    if (!match) return undefined

    const pad = findPad(context.footprint?.pads, match[2])
    if (!pad) return undefined
    if (match[1] === 'NET_NAME') return pad.netName
    if (match[1] === 'PIN_TYPE') return pad.pinType
    return pad.pinFunction
}

/**
 * Finds one footprint pad by number.
 * @param {object[] | undefined} pads Pads.
 * @param {string} number Pad number.
 * @returns {object | undefined}
 */
function findPad(pads, number) {
    return (pads || []).find((pad) => String(pad.number || '') === number)
}

/**
 * Resolves a title block comment by COMMENTn variable name.
 * @param {string} standardName Uppercase variable name.
 * @param {object | undefined} board Board context.
 * @returns {string | undefined}
 */
function titleCommentValue(standardName, board) {
    const match = /^COMMENT([1-9])$/.exec(standardName)
    if (!match) return undefined
    return board?.titleBlock?.comments?.[match[1]]
}

/**
 * Resolves a property value using exact name first, then case-insensitive name.
 * @param {string} name Property name.
 * @param {Record<string, string> | undefined} properties Properties.
 * @returns {string | undefined}
 */
function propertyValue(name, properties) {
    if (!properties) return undefined
    if (Object.hasOwn(properties, name)) return properties[name]
    const lowerName = name.toLowerCase()
    const match = Object.keys(properties).find((key) => {
        return key.toLowerCase() === lowerName
    })
    return match ? properties[match] : undefined
}

/**
 * Resolves a footprint library name.
 * @param {object | undefined} footprint Footprint context.
 * @returns {string | undefined}
 */
function footprintLibraryName(footprint) {
    const name = footprint?.footprintName || footprint?.libraryName || ''
    const separator = name.indexOf(':')
    return separator >= 0 ? name.slice(0, separator) : ''
}

/**
 * Resolves a footprint short name.
 * @param {object | undefined} footprint Footprint context.
 * @returns {string | undefined}
 */
function footprintShortName(footprint) {
    const name = footprint?.footprintName || footprint?.libraryName || ''
    const separator = name.lastIndexOf(':')
    return separator >= 0 ? name.slice(separator + 1) : name || undefined
}

/**
 * Expands KiCad text escape tokens.
 * @param {string} value Raw text.
 * @returns {string}
 */
function expandTextEscapes(value) {
    return value.replace(/\{([A-Za-z_]+)\}/g, (match, name) => {
        return Object.hasOwn(textEscapes, name) ? textEscapes[name] : match
    })
}

/**
 * Returns a path basename.
 * @param {string | undefined} path File path.
 * @returns {string}
 */
function baseName(path) {
    return (
        String(path || '')
            .split('/')
            .pop() || ''
    )
}
