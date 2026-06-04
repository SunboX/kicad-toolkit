// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Provides exact and lightweight fuzzy lookups over parsed KiCad libraries.
 */
export class KicadLibrarySearchIndex {
    /**
     * Searches PCB footprint records.
     * @param {object} library Parsed library or library index.
     * @param {string} query Search query.
     * @param {{ limit?: number }} [options] Search options.
     * @returns {{ query: string, matches: object[] }}
     */
    static searchPcbFootprints(library, query, options = {}) {
        return searchCollection(resolveItems(library, 'footprint'), query, {
            ...options,
            kind: 'footprint'
        })
    }

    /**
     * Searches schematic symbol records.
     * @param {object} library Parsed library or library index.
     * @param {string} query Search query.
     * @param {{ limit?: number }} [options] Search options.
     * @returns {{ query: string, matches: object[] }}
     */
    static searchSchematicSymbols(library, query, options = {}) {
        return searchCollection(resolveItems(library, 'symbol'), query, {
            ...options,
            kind: 'symbol'
        })
    }

    /**
     * Searches KiCad design block records.
     * @param {object} library Parsed design-block library or library index.
     * @param {string} query Search query.
     * @param {{ limit?: number }} [options] Search options.
     * @returns {{ query: string, matches: object[] }}
     */
    static searchDesignBlocks(library, query, options = {}) {
        return searchCollection(resolveItems(library, 'design-block'), query, {
            ...options,
            kind: 'design-block'
        })
    }

    /**
     * Searches all known KiCad library item records.
     * @param {object} library Parsed library or library index.
     * @param {string} query Search query.
     * @param {{ limit?: number }} [options] Search options.
     * @returns {{ query: string, matches: object[] }}
     */
    static searchItems(library, query, options = {}) {
        return searchCollection(resolveItems(library), query, options)
    }
}

/**
 * Searches normalized library item wrappers.
 * @param {object[]} items Library item wrappers.
 * @param {string} query Search query.
 * @param {{ limit?: number, kind?: string }} options Search options.
 * @returns {{ query: string, matches: object[] }}
 */
function searchCollection(items, query, options) {
    const normalizedQuery = normalize(query)
    const limit = Math.max(Number(options.limit || 25), 1)
    const matches = (items || [])
        .map((item, index) =>
            scoreItem(item, index, normalizedQuery, options.kind)
        )
        .filter(Boolean)
        .sort(
            (left, right) =>
                left.score - right.score || left.name.localeCompare(right.name)
        )
        .slice(0, limit)

    return {
        query: String(query || ''),
        matches
    }
}

/**
 * Scores one item against a normalized query.
 * @param {object} wrapper Library item wrapper.
 * @param {number} index Source index.
 * @param {string} normalizedQuery Normalized query.
 * @param {string | undefined} fallbackKind Fallback item kind.
 * @returns {object | null}
 */
function scoreItem(wrapper, index, normalizedQuery, fallbackKind) {
    if (!normalizedQuery) return null

    const item = wrapper.item || wrapper
    const name = String(wrapper.name || item.name || item.itemName || '')
    const match = matchQuery(
        normalizedQuery,
        normalize(name),
        keywordsFor(wrapper)
    )

    if (!match) return null

    return {
        kind: String(wrapper.kind || fallbackKind || ''),
        name,
        libraryName: String(wrapper.libraryName || item.libraryName || ''),
        fileName: String(wrapper.fileName || item.fileName || ''),
        index,
        score: match.score,
        matchKind: match.matchKind,
        keywords: keywordsFor(wrapper),
        item
    }
}

/**
 * Resolves search item wrappers from supported library model shapes.
 * @param {object} input Parsed library or index.
 * @param {string} [kind] Optional item kind filter.
 * @returns {object[]}
 */
function resolveItems(input, kind = '') {
    let items = []

    if (Array.isArray(input?.items)) {
        items = input.items
    } else if (kind === 'footprint' || input?.pcbLibrary) {
        items = (input?.pcbLibrary?.footprints || input?.footprints || []).map(
            (footprint) => ({
                kind: 'footprint',
                name: footprint.name || footprint.footprintName,
                libraryName: footprint.libraryName || '',
                fileName: footprint.fileName || '',
                item: footprint
            })
        )
    } else if (kind === 'symbol' || input?.schematicLibrary) {
        items = (input?.schematicLibrary?.symbols || input?.symbols || []).map(
            (symbol) => ({
                kind: 'symbol',
                name: symbol.name || symbol.itemName,
                libraryName: symbol.libraryName || '',
                fileName: symbol.fileName || '',
                item: symbol
            })
        )
    } else if (kind === 'design-block' || input?.blocks) {
        items = (input?.blocks || []).map((block) => ({
            kind: 'design-block',
            name: block.name,
            libraryName: block.libraryName || '',
            fileName: block.path || block.fileName || '',
            item: block
        }))
    }

    return kind ? items.filter((item) => item.kind === kind) : items
}

/**
 * Matches a query against name and keyword values.
 * @param {string} query Normalized query.
 * @param {string} name Normalized item name.
 * @param {string[]} keywords Keyword values.
 * @returns {{ score: number, matchKind: string } | null}
 */
function matchQuery(query, name, keywords) {
    const normalizedKeywords = keywords.map(normalize)
    const compactQuery = compact(query)
    const compactName = compact(name)

    if (name === query) return { score: 0, matchKind: 'exact' }
    if (name.startsWith(query)) return { score: 10, matchKind: 'prefix' }
    if (name.includes(query)) return { score: 20, matchKind: 'substring' }
    if (normalizedKeywords.some((keyword) => keyword.includes(query))) {
        return { score: 30, matchKind: 'keyword' }
    }
    if (
        compactName.includes(compactQuery) ||
        isOrderedSubsequence(compactQuery, compactName)
    ) {
        return { score: 40, matchKind: 'fuzzy' }
    }

    return null
}

/**
 * Builds search keywords from one wrapper and item.
 * @param {object} wrapper Library item wrapper.
 * @returns {string[]}
 */
function keywordsFor(wrapper) {
    const item = wrapper.item || wrapper
    return dedupe([
        wrapper.name,
        wrapper.libraryName,
        wrapper.fileName,
        item.name,
        item.itemName,
        item.footprintName,
        item.libraryName,
        item.description,
        item.tags,
        item.keywords,
        ...primitiveValues(item.properties),
        ...primitiveValues(item.metadata)
    ])
}

/**
 * Extracts primitive values from a shallow metadata object.
 * @param {unknown} value Metadata value.
 * @param {number} [depth] Remaining recursion depth.
 * @returns {string[]}
 */
function primitiveValues(value, depth = 2) {
    if (value === null || value === undefined || depth < 0) return []
    if (['string', 'number', 'boolean'].includes(typeof value)) {
        return [String(value)]
    }
    if (Array.isArray(value)) {
        return value.flatMap((entry) => primitiveValues(entry, depth - 1))
    }
    if (typeof value === 'object') {
        return Object.values(value).flatMap((entry) =>
            primitiveValues(entry, depth - 1)
        )
    }
    return []
}

/**
 * Normalizes searchable text.
 * @param {unknown} value Raw value.
 * @returns {string}
 */
function normalize(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[_:./\\-]+/gu, ' ')
        .replace(/\s+/gu, ' ')
}

/**
 * Compacts normalized text for fuzzy comparisons.
 * @param {string} value Normalized text.
 * @returns {string}
 */
function compact(value) {
    return String(value || '').replace(/\s+/gu, '')
}

/**
 * Returns true when all query characters appear in order.
 * @param {string} query Compact query.
 * @param {string} candidate Compact candidate.
 * @returns {boolean}
 */
function isOrderedSubsequence(query, candidate) {
    if (!query) return false
    let offset = 0
    for (const character of candidate) {
        if (character === query[offset]) offset += 1
        if (offset === query.length) return true
    }
    return false
}

/**
 * Deduplicates truthy string values.
 * @param {unknown[]} values Candidate values.
 * @returns {string[]}
 */
function dedupe(values) {
    return [
        ...new Set(
            (values || [])
                .map((value) => String(value || '').trim())
                .filter(Boolean)
        )
    ]
}
