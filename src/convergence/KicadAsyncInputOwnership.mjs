// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

const OWNED_PARSER_INPUTS = new WeakSet()
const OWNED_PROJECT_ENTRIES = new WeakSet()

/** Marks structured-cloned KiCad worker inputs as receiver-owned. */
export class KicadAsyncInputOwnership {
    /** @param {object} input Parser input. @returns {object} Same input. */
    static markParser(input) {
        if (input && typeof input === 'object') OWNED_PARSER_INPUTS.add(input)
        return input
    }

    /** @param {unknown} input Parser input. @returns {boolean} Ownership. */
    static ownsParser(input) {
        return Boolean(
            input && typeof input === 'object' && OWNED_PARSER_INPUTS.has(input)
        )
    }

    /** @param {object[]} entries Project entries. @returns {object[]} Same entries. */
    static markProject(entries) {
        if (entries && typeof entries === 'object') {
            OWNED_PROJECT_ENTRIES.add(entries)
        }
        return entries
    }

    /** @param {unknown} entries Project entries. @returns {boolean} Ownership. */
    static ownsProject(entries) {
        return Boolean(
            entries &&
            typeof entries === 'object' &&
            OWNED_PROJECT_ENTRIES.has(entries)
        )
    }
}

Object.freeze(KicadAsyncInputOwnership.prototype)
Object.freeze(KicadAsyncInputOwnership)
