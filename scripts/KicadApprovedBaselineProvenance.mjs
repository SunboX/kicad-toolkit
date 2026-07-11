// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

import { createHash } from 'node:crypto'

const APPROVED = Object.freeze({
    schema: 'kicad-toolkit.api-baseline.v1',
    package: 'kicad-toolkit',
    packageVersion: '1.0.29',
    gitRef: 'c71c88d69d236accce123656dfa66914c0d5489c',
    sourceTree: 'f857c5f50e3d40f9f6fd5484ffad48a43a0bbb45',
    packageExportsChecksum:
        '486405f7518d9811eb7ca9f97c882f15e103821b7f05f267ab062a4c3c819a30',
    featureCount: 9020,
    baselineChecksum:
        '15444cd9b0b2aa4e77657e84af27c831b89bc3a6bedc6a64e74b4d81c3aa1b75',
    ledgerChecksum:
        '279e5017895d1366f90054be4348a1fcd6f7f1c62e2a764cf49a7ef8986eba44'
})

/**
 * Authenticates the one audited historical API baseline and preservation ledger.
 */
export class KicadApprovedBaselineProvenance {
    /**
     * Rejects custom or resealed strict baselines.
     * @param {Record<string, any>} baseline API baseline.
     * @param {Record<string, any>[]} ledger Preservation ledger.
     * @returns {void}
     */
    static assert(baseline, ledger) {
        const identity = {
            schema: baseline?.schema,
            package: baseline?.package,
            packageVersion: baseline?.packageVersion,
            gitRef: baseline?.gitRef,
            sourceTree: baseline?.sourceTree,
            packageExportsChecksum: baseline?.packageExportsChecksum,
            featureCount: baseline?.features?.length
        }
        const approvedIdentity = Object.fromEntries(
            Object.entries(APPROVED).filter(
                ([name]) =>
                    !name.endsWith('Checksum') ||
                    name === 'packageExportsChecksum'
            )
        )
        if (
            JSON.stringify(identity) !== JSON.stringify(approvedIdentity) ||
            KicadApprovedBaselineProvenance.#checksum(baseline) !==
                APPROVED.baselineChecksum ||
            KicadApprovedBaselineProvenance.#checksum(ledger) !==
                APPROVED.ledgerChecksum
        ) {
            throw new Error(
                'Unapproved baseline provenance or artifact identity.'
            )
        }
    }

    /**
     * Returns an artifact checksum over parsed deterministic JSON.
     * @param {unknown} value JSON value.
     * @returns {string} SHA-256 checksum.
     */
    static #checksum(value) {
        return createHash('sha256').update(JSON.stringify(value)).digest('hex')
    }
}

Object.freeze(KicadApprovedBaselineProvenance.prototype)
Object.freeze(KicadApprovedBaselineProvenance)
