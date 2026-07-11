// SPDX-FileCopyrightText: 2026 André Fiedler
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Same-method-name decoy for exact contract-resolution tests.
 */
export class DecoyContractDelegate {
    /**
     * Returns a decoy result contract.
     * @param {unknown} input Ignored input.
     * @param {object} [options] Delegate options.
     * @returns {object}
     */
    static run(input, options = {}) {
        void input
        return { decoy: options.decoyOption || false }
    }
}
