// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from 'node:crypto'

import { tokenizer } from 'acorn'

const MODES = new Set(['inventory', 'packed'])

/**
 * Creates deterministic row identifiers for independently pinned contracts.
 * These identifiers are not trust roots; strict validation authenticates the
 * complete baseline and ledger through KicadApprovedBaselineProvenance first.
 */
export class KicadFeatureEvidence {
    /**
     * Identifies one packed API or inventory contract row.
     * @param {Record<string, any>} row Preservation mapping.
     * @param {object} [options] Evidence options.
     * @param {'inventory' | 'packed'} [options.mode] Contract mode.
     * @returns {string} Contract identifier.
     */
    static token(row, { mode = 'packed' } = {}) {
        if (!MODES.has(mode)) throw new Error(`Unknown evidence mode: ${mode}`)
        const checksum = KicadFeatureEvidence.#checksum(row, mode)
        return `${mode}-contract:sha256:${checksum}`
    }

    /**
     * Verifies one row identifier after pinned provenance authentication.
     * @param {Record<string, any>} row Preservation mapping.
     * @returns {{ mode: 'inventory' | 'packed' }} Evidence declaration.
     */
    static verify(row) {
        const match = String(row?.evidenceToken || '').match(
            /^(inventory|packed)-contract:sha256:[0-9a-f]{64}$/u
        )
        if (!match) {
            throw new Error('Feature evidence token has an invalid format.')
        }
        const mode = match[1]
        if (row.evidenceToken !== KicadFeatureEvidence.token(row, { mode })) {
            throw new Error(
                `Feature-specific evidence identifier differs for ${row.feature}`
            )
        }
        return { mode }
    }

    /**
     * Returns exact executable tokens for selecting related historical tests.
     * Selection is descriptive only and never authenticates strict evidence.
     * @param {string} source JavaScript test source.
     * @returns {Set<string>} Exact identifier and literal tokens.
     */
    static executableTokens(source) {
        const tokens = new Set()
        const stream = tokenizer(source, {
            allowHashBang: true,
            ecmaVersion: 'latest',
            sourceType: 'module'
        })
        for (
            let token = stream.getToken();
            token.type.label !== 'eof';
            token = stream.getToken()
        ) {
            if (token.value !== undefined && token.value !== null) {
                tokens.add(String(token.value))
            }
        }
        return tokens
    }

    /**
     * Computes one canonical row identifier checksum.
     * @param {Record<string, any>} row Preservation mapping.
     * @param {'inventory' | 'packed'} mode Evidence mode.
     * @returns {string} SHA-256 checksum.
     */
    static #checksum(row, mode) {
        const contract = Object.fromEntries(
            Object.entries(row || {}).filter(
                ([name]) => name !== 'evidenceToken' && name !== 'package'
            )
        )
        return createHash('sha256')
            .update(
                JSON.stringify(
                    KicadFeatureEvidence.#stableValue({ mode, row: contract })
                )
            )
            .digest('hex')
    }

    /**
     * Sorts object keys recursively for canonical JSON hashing.
     * @param {unknown} value Candidate value.
     * @returns {unknown} Canonical JSON value.
     */
    static #stableValue(value) {
        if (Array.isArray(value)) {
            return value.map((entry) =>
                KicadFeatureEvidence.#stableValue(entry)
            )
        }
        if (!value || typeof value !== 'object') return value
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [
                    key,
                    KicadFeatureEvidence.#stableValue(value[key])
                ])
        )
    }
}

Object.freeze(KicadFeatureEvidence.prototype)
Object.freeze(KicadFeatureEvidence)
